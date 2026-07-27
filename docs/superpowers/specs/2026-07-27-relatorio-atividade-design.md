# Relatório de Atividade por Projeto e Período

**Data:** 2026-07-27
**Origem:** pedido do Tiago — "selecionar o projeto e o período e ver todos os cards movimentados, todos os arquivos salvos, todas as pastas que sofreram alterações naquele período, tudo identificado pelo nome e login da pessoa que fez". Mostra na tela primeiro, exporta em Excel depois.

## Problema

O Orbitask não guarda histórico de atividade consultável:

- `CardSection` tem `@@unique([cardId, columnId])` com `arrivedAt`/`leftAt`, então só a **última** visita de cada card em cada etapa sobrevive. A→B→A perde a primeira passagem por A.
- `Card.lastMovedByUserId` guarda só quem moveu por último.
- `AccessLog` recebe alguns eventos (`CARD_CREATED`, `CARD_ARCHIVED`, `FILE_UPLOADED`, `MOVE_BLOCKED`, `LOGIN`, `LOGOUT`, `ANNOUNCEMENT_*`) com `metadata` JSON, mas **não** recebe movimentação bem-sucedida de card, e o `boardId` fica dentro do JSON — filtrar projeto exigiria varrer a tabela inteira, que é a mesma que recebe todo login.
- `logRequest` (middleware que logaria toda requisição) existe em `middlewares/auth.ts` mas nunca foi registrado no servidor.
- Exclusão de arquivo é hard delete sem rastro.

## Decisões tomadas

| Questão | Decisão |
|---|---|
| Histórico anterior ao deploy | Tabela nova daqui pra frente **+ backfill** do que dá pra reconstruir, marcado como reconstruído |
| Arquivos mexidos direto no Google Drive | **Fora de escopo.** Só o que passou pelo Orbi |
| Eventos cobertos | Movimentação, upload, exclusão de arquivo, criação de pasta, criação/arquivamento/restauração de missão |
| Fora do escopo | Renomeação de pasta, mudança de prazo, comentários/menções |
| Acesso | **Só ADMIN**, aba nova em `/admin` |
| Tela | Timeline única cronológica decrescente com filtros de tipo/pessoa/etapa |
| Excel | `.xlsx` gerado no backend com `exceljs`: aba `Eventos` + aba `Resumo` |

## Modelo de dados

Tabela `activity_events` — **sem foreign keys**. É o padrão de log de auditoria: a linha precisa sobreviver a qualquer coisa que aconteça depois com o que ela descreve. No Orbitask isso não é hipotético — `DELETE /columns/:id` apaga etapa de verdade, e uma FK deixaria o histórico órfão ou bloquearia a exclusão.

```prisma
enum ActivityType {
  CARD_MOVED
  CARD_CREATED
  CARD_ARCHIVED
  CARD_RESTORED
  FILE_UPLOADED
  FILE_DELETED
  FOLDER_CREATED
}

model ActivityEvent {
  id   String       @id @default(uuid())
  type ActivityType

  actorId    String? @map("actor_id")
  actorName  String  @map("actor_name")
  actorEmail String  @map("actor_email")

  boardId    String  @map("board_id")
  boardTitle String  @map("board_title")

  cardId    String? @map("card_id")
  cardTitle String? @map("card_title")

  columnId    String? @map("column_id")
  columnTitle String? @map("column_title")

  toColumnId    String? @map("to_column_id")
  toColumnTitle String? @map("to_column_title")

  folderName String? @map("folder_name")
  folderUrl  String? @map("folder_url") @db.Text

  detail Json?

  isBackfilled Boolean @default(false) @map("is_backfilled")

  occurredAt DateTime @map("occurred_at")
  createdAt  DateTime @default(now()) @map("created_at")

  @@index([boardId, occurredAt])
  @@index([actorId, occurredAt])
  @@map("activity_events")
}
```

Três decisões que precisam ficar registradas:

**`occurredAt` separado de `createdAt`.** Linha de backfill tem `occurredAt` em junho e `createdAt` no dia da migration. Sem os dois campos, todo o histórico reconstruído apareceria com a data do deploy.

**Nomes copiados na linha** (`actorName`, `actorEmail`, `boardTitle`, `cardTitle`, `columnTitle`, `toColumnTitle`, `folderName`). Renomear a etapa "Revisão" para "Revisão Final" em agosto não pode mudar o que o relatório de junho diz. Com JOIN, o passado seria reescrito a cada rename. Esse é o requisito central de um relatório de auditoria: mesmo período consultado duas vezes devolve a mesma coisa.

**`folderName`/`folderUrl` em todo evento**, em vez de um tipo de evento "pasta alterada". "Quais pastas sofreram alteração no período" vira um agrupamento sobre essa coluna, sem inflar a timeline com uma linha de pasta duplicando cada upload. `FOLDER_CREATED` fica só para pasta de projeto e de etapa, que são as únicas sem outro evento associado.

`actorId` é anulável porque linha de backfill pode não ter autor identificável; `actorName` nunca é vazio (cai para `"(não registrado)"`).

## Backfill

Script de execução única (`npm run db:backfill-activity`), idempotente por checagem de tabela vazia, tudo marcado `isBackfilled = true` e sinalizado na tela.

| Evento | Fonte | Cobertura |
|---|---|---|
| `CARD_MOVED` | `NotificationQueue` tipo `CARD_MOVED` — `payload.{fromColumn,toColumn,movedBy}`, `cardId`, `columnId` de destino, `createdAt` | Quase completa. Nenhum job apaga essas linhas |
| `FILE_UPLOADED` | `AccessLog` action `FILE_UPLOADED`; complementado por `File.uploadedById`/`createdAt` para o que for anterior a esse log | Completa para arquivos que ainda existem |
| `CARD_CREATED` | `AccessLog` action `CARD_CREATED`; complementado por `Card.creatorId`/`createdAt` | Completa |
| `CARD_ARCHIVED` | `AccessLog` action `CARD_ARCHIVED` | Completa desde que o log existe |
| `FILE_DELETED` | — | Impossível. Hard delete sem rastro; só passa a existir daqui pra frente |
| `FOLDER_CREATED` | — | Não reconstruído; só daqui pra frente |

Duas lacunas conhecidas no backfill de movimentação, documentadas na tela:

1. O move só enfileira notificação se o dono da etapa de destino tiver WhatsApp cadastrado e o projeto não estiver arquivado. Moves sem essas condições não deixaram rastro.
2. `payload.movedBy` guarda o **nome** do usuário, não o id. O casamento é por `User.name` exato; nome ambíguo (dois usuários homônimos) ou não encontrado grava `actorId = null` preservando o nome.

## Escrita dos eventos

`ActivityService.record()` — fire-and-forget com `.catch()`, no mesmo padrão do `accessLog` que já existe. Auditoria nunca pode derrubar a ação do usuário.

| Ponto | Evento |
|---|---|
| `POST /boards` | `FOLDER_CREATED` (pasta do projeto) |
| `POST /boards/:boardId/columns` | `FOLDER_CREATED` (pasta da etapa) |
| `POST /boards/:boardId/cards` | `CARD_CREATED` |
| `POST /cards/:id/move` | `CARD_MOVED` |
| `DELETE /cards/:id` | `CARD_ARCHIVED` |
| `POST /cards/:id/restore` | `CARD_RESTORED` |
| `POST /sections/:id/files` | `FILE_UPLOADED` |
| `DELETE /sections/:sectionId/files/:fileId` | `FILE_DELETED` |

Os `accessLog.create` existentes ficam onde estão. Eles servem à aba Logs do admin, que é outro produto; duplicar é mais barato que acoplar os dois.

## API

Ambas com `preHandler: [requireAdmin(['ADMIN'])]`.

**`GET /admin/reports/activity`**
Query: `boardId` (obrigatório), `from`, `to` (ISO), `type?`, `actorId?`, `columnId?`, `page`, `limit`.
Resposta:
```
{
  events: ActivityEvent[],
  total, page, limit,
  summary: {
    totalEvents, totalActors, totalCards,
    byType:   [{ type, count }],
    byActor:  [{ actorId, actorName, actorEmail, byType: {...}, total }],
    byFolder: [{ folderName, folderUrl, count }]
  },
  filters: { actors: [...], columns: [...], types: [...] }
}
```
`summary` e `filters` são calculados sobre o período inteiro, não sobre a página. Assim os dropdowns mostram todo mundo que aparece no período e os totais do rodapé batem com o Excel.

**`GET /admin/reports/activity/export`** — mesmos filtros, sem paginação, devolve `.xlsx`.
Teto de 50.000 linhas; acima disso a aba `Resumo` registra quantas ficaram de fora, para o arquivo nunca mentir por omissão.

**`GET /admin/reports/boards`** — lista de projetos para o seletor (id, título, arquivado).

`from`/`to` chegam como data (`YYYY-MM-DD`) e são normalizados no backend para `from 00:00:00` e `to 23:59:59.999` no fuso do servidor. Sem isso, "01/07 a 27/07" perderia tudo que aconteceu no dia 27.

O período volta na resposta como data pura (`YYYY-MM-DD`), **nunca ISO/UTC**. A verificação pegou exatamente esse erro: `end.toISOString()` de 27/07 23:59 em GMT-3 vira `2026-07-28T02:59Z`, e o arquivo saía nomeado `...a-2026-07-28` para um período que o usuário pediu até 27/07. Pela mesma razão a aba `Resumo` formata a data por manipulação de texto — `new Date('2026-07-01').toLocaleDateString('pt-BR')` exibe 30/06 em qualquer fuso a oeste de Greenwich.

## Tela

Aba `Relatórios` em `/admin`, componente `components/admin/ActivityReport.tsx` (a página já tem 937 linhas — não cabe mais nada inline).

Fluxo: seletor de projeto + período → `Gerar` → tabela + resumo → `Baixar Excel`.

- Atalhos de período: Últimos 7 dias / Este mês / Mês passado / Personalizado.
- Cabeçalho de resumo: nº de eventos, pessoas, missões.
- Filtros de tipo/pessoa/etapa refazem a busca no servidor e voltam para a página 1.
- Colunas: Data/hora, Pessoa (nome + login), Tipo (badge colorido, reaproveitando o vocabulário visual do `actionLabel` que já existe na página), Missão, Etapa (origem → destino em `CARD_MOVED`), Detalhe, Pasta (link para o Drive).
- Linha de backfill leva um ícone `↺` com tooltip "reconstruído do histórico — pode estar incompleto".
- Paginação de 100 por página.
- Estados: vazio ("nenhum evento nesse período"), erro, e aviso fixo quando o período pedido começa antes da data do backfill.

## Erros e casos de borda

- Projeto sem eventos no período → tabela vazia com mensagem, botão de Excel desabilitado.
- `from` depois de `to` → 400 com mensagem clara.
- Período aberto (sem `from`/`to`) → padrão dos últimos 30 dias, para nunca varrer a tabela inteira sem querer.
- Usuário desativado continua aparecendo (nome e login estão na linha).
- Etapa apagada continua aparecendo com o título que tinha na época.
- Falha ao gravar evento não derruba a ação — só loga no console.

## Verificação executada

Não há runner de teste no repositório (`backend/package.json` não tem nenhum), então a verificação foi feita contra um MySQL 8 descartável em container, na porta 3399, destruído ao final. O banco de desenvolvimento local não estava no ar e não foi tocado.

- `npx tsc --noEmit` nos dois lados e `next build` no frontend. Os erros de tipo que restam são todos pré-existentes (`crm.routes.ts`, `MentionSuggestion.tsx`, `admin/crm/page.tsx` e os `content: null` em campos `Json` opcionais); o baseline em `git stash` traz exatamente o mesmo conjunto.
- `prisma migrate diff` entre `schema.prisma` e o banco migrado: `activity_events` **não aparece** — a migration escrita à mão bate exatamente com o modelo.
- 45 verificações sobre a consulta e o Excel: paginação, ordenação, isolamento entre projetos, inclusão do último instante do dia final, coerência dos totais do resumo com o total geral, filtros por pessoa/etapa/tipo, dropdowns que não encolhem ao filtrar, projeto vazio, projeto inexistente, e leitura de volta do `.xlsx` gerado (abas, contagem de linhas, datas como data de verdade, autofiltro, nome do arquivo).
- 26 verificações sobre o backfill: deduplicação entre `AccessLog` e `NotificationQueue` para o mesmo move, casamento de nome com o usuário certo, nome ambíguo virando `actorId` nulo com o nome preservado, recuperação de uploads e criações que só existem nas tabelas `File`/`Card`, descarte de log com missão inexistente, preservação das datas originais, idempotência da segunda execução e `--force` que refaz o histórico sem apagar evento gravado em tempo real.

Os dois scripts de verificação não foram versionados: eles limpam o banco inteiro com `deleteMany`, e um script assim no repositório é um acidente esperando acontecer.

Roteiro manual que ainda vale rodar depois do deploy: criar missão → mover → subir arquivo → excluir arquivo → arquivar missão, e conferir que os cinco eventos aparecem com a pessoa certa.

Montar suíte de teste de verdade está fora do escopo deste pedido; fica registrado como dívida.

## Achado fora do escopo

As migrations estão dessincronizadas do `schema.prisma` — e isso é anterior a este trabalho. Um `prisma migrate deploy` num ambiente limpo produz um banco **sem** a coluna `users.crm_access` e sem vários índices (`files`, `mentions`, `notification_queue`), e com foreign keys sobrando em `crm_stage_history`. O banco de produção provavelmente foi ajustado por `db push` em algum momento. Isso não afeta o relatório, mas quebra qualquer ambiente novo criado a partir das migrations. Vale uma migration de reconciliação.
