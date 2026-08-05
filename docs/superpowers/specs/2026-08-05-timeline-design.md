# Timeline — linha do tempo global com documentos por data

**Data:** 2026-08-05

Botão Timeline na navbar, ao lado do CRM. O admin adiciona pessoas; quem está na lista vê o botão. A tela é uma linha do tempo mensal: um eixo vertical com seta para baixo, dias alternando de cada lado, navegação de mês. Clicar numa data abre um modal (nome do documento, marcação de pessoas com @, descrição, arquivo), cria uma pasta no Drive e passa a listar os documentos daquele dia na linha do tempo.

## Decisões tomadas

| Questão | Decisão |
|---|---|
| Arquivo | Cria a pasta no Drive **e** sobe o arquivo pelo modal |
| Escopo | Uma timeline global da empresa, não por projeto |
| Data passada | Dia vazio trava; dia que já tem documento continua aceitando novos |
| Marcação @ | Marca, avisa no WhatsApp e a pessoa pode responder |
| Permissões | Todos da lista podem adicionar; só ADMIN gerencia a lista |
| Pasta no Drive | `TIMELINE / AAAA-MM / DD - Nome do documento` |

## O que o código já oferecia

O `crmAccess` é o molde exato deste recurso: flag booleana no `User`, navbar mostrando o botão quando `ADMIN || flag`, e o `/auth/me` que a navbar já chama no mount sincronizando a mudança sem exigir logout. A Timeline copia esse caminho inteiro com `timelineAccess`.

Dois achados que mudaram o desenho:

**O upload do Orbi não guarda arquivo.** Em `section.routes.ts` o `putObject` do MinIO está comentado — cria-se a linha em `files` com uma `url` que não resolve, e o binário é descartado. O `MinioService.ts` está implementado e nunca é chamado. A Timeline por isso não usa esse caminho: manda o arquivo direto para o Drive, que é onde a equipe realmente trabalha. **O bug do upload dos cards continua lá e não faz parte deste trabalho.**

**O `GoogleDriveService` não sabia enviar arquivo** — só criava, renomeava e compartilhava pasta. Foram acrescentados `uploadFile`, `findFolder`, `ensureFolder` e `deleteFile`.

## Modelo de dados

Três tabelas novas e uma coluna em `users`.

`TimelineDocument` — nome, descrição, `date` como `@db.Date` (só o dia importa), pasta no Drive, autor.

### O dia é um dia de calendário, não um instante

Uma coluna `@db.Date` volta do Prisma como **meia-noite UTC**. A primeira versão gravava meia-noite local e lia com getters locais, e a verificação pegou o resultado: em GMT-3, `2026-08-08T00:00Z` lido localmente é 07/08 21:00, e o documento voltava com a data um dia antes.

O estrago não seria só no teste. É `formatDateOnly` que agrupa os documentos por dia em `getMonth`, monta o nome da pasta no Drive e alimenta a contagem que libera ou trava a data. **Todo documento apareceria um dia antes na linha do tempo**, e um documento lançado no dia 01 criaria pasta no mês anterior.

Correção: gravação, leitura e comparação usam meia-noite UTC como representação única do dia — `parseDateOnly`, `formatDateOnly`, `startOfToday`, `isDateOpen`, o laço de `getMonth` e o caminho da pasta. O front nunca constrói `Date` a partir desses valores sem fixar meio-dia (`${date}T12:00:00`), o que mantém o dia estável em qualquer fuso.

`TimelineFile` — arquivo enviado pelo modal, com `driveFileId`/`driveFileUrl`, tamanho e quem subiu.

`TimelineMention` — espelho de `Mention`, com resposta.

### Por que uma tabela de menção separada

`Mention.cardSectionId` é FK **obrigatória** para `card_sections`. Para reaproveitá-la na timeline seria preciso torná-la anulável e acrescentar um `timelineDocumentId` também anulável — e aí o banco deixa de conseguir garantir que toda menção pertence a alguma coisa. Afrouxar uma FK numa tabela que já tem dado em produção é o tipo de mudança que só cobra a conta meses depois. Duas tabelas, cada uma com sua FK honesta.

O custo é a duplicação da lógica de disparo e resposta, resolvida com funções próprias em `TimelineService` em vez de copiar o corpo de `processMentions`.

## Regra de data

```
hoje ou futuro         -> aberta
passado COM documento  -> aberta
passado VAZIA          -> travada
```

Implementada em `isDateOpen` e aplicada **no backend**, não só escondendo o botão: uma trava que só existe no frontend não é trava. `createDocument` reconta os documentos do dia antes de aceitar.

Registrei a ressalva na conversa e o cliente manteve a regra: adicionar num dia passado depende de outra pessoa ter adicionado antes, o que permite a quem perdeu o prazo "pegar carona" num dia que outro cumpriu. É uma decisão de produto consciente, não um descuido.

## Acesso verificado no banco, não no JWT

`canAccessTimeline` consulta o `User`, em vez de ler a flag do token. O JWT é assinado no login e carrega a permissão daquele instante: lendo dele, conceder acesso só valeria no próximo login, e **revogar não valeria até o token expirar**. Uma consulta por chave primária é barata perto de errar quem entra.

O `canCrm` em `crm.routes.ts` tem exatamente esse problema hoje. Não foi mexido — é outro assunto.

## API

Todas exigem token; `requireTimelineAccess` confere a lista.

| Rota | O que faz |
|---|---|
| `GET /timeline?year=&month=` | Mês completo, dia a dia, inclusive dias vazios |
| `GET /timeline/people` | Quem pode ser marcado com @ |
| `GET /timeline/documents/:id` | Um documento |
| `POST /timeline/documents` | Cria documento, pasta no Drive e menções |
| `POST /timeline/documents/:id/files` | Envia arquivo para a pasta do Drive (50 MB) |
| `PATCH /timeline/mentions/:id/reply` | Responde uma marcação |
| `DELETE /timeline/documents/:id` | Exclui (autor ou ADMIN) |
| `GET /timeline/access` | ADMIN — lista todos com o estado do acesso |
| `PATCH /timeline/access/:userId` | ADMIN — adiciona ou remove da lista |

As duas últimas moram em `timeline.routes.ts`, e não em `admin.routes.ts`, porque a tela que as consome é a própria Timeline: o admin gerencia as pessoas de dentro dela, como pedido.

`GET /timeline/people` devolve só quem tem acesso — marcar alguém que não consegue abrir a página seria mandar a pessoa para uma porta fechada.

## Tela

`/timeline`, com quatro componentes separados para nenhum arquivo virar um monólito: `TimelineSpine` (o eixo), `NewDocumentModal`, `DocumentDetailModal`, `TimelineAccessModal`.

**O eixo.** Linha vertical em degradê ciano → violeta terminando numa seta `▼`, com os dias alternando à esquerda e à direita em telas médias e acima; no celular tudo cai para a esquerda do eixo.

**Peso visual acompanha o conteúdo.** Dia com documento, ou ainda aberto, vira cartão. Dia passado e vazio vira um traço apagado com "sem documento" — o "fica apagado como se tivesse vazio" do pedido. Sem isso, 31 cartões idênticos empurrariam o mês para fora da tela e esconderiam justamente o que interessa.

**Marcador.** Círculo com o número do dia sobre o eixo, em quatro estados: hoje (ciano, com brilho), com documentos (violeta), aberto e vazio (contorno), travado (quase invisível).

**Estados tratados:** sem acesso (tela dedicada com cadeado, em vez de erro), mês carregando, dia sem documento, documento sem arquivo, marcação aguardando resposta.

**Falha parcial no modal.** O documento é criado antes do upload. Se o upload falhar, o registro fica de pé, a pessoa é avisada e anexa depois pela tela de detalhe — melhor que descartar tudo que ela acabou de escrever.

**Exclusão preserva a pasta do Drive** de propósito: o arquivo que está lá pode ser a única cópia.

## Verificação executada

Banco local fora do ar; a verificação rodou contra um MySQL 8 descartável em container, porta 3399, destruído ao final. O banco de desenvolvimento não foi tocado.

- `npx tsc --noEmit` nos dois lados e `next build` (rota `/timeline` gerada, 7,22 kB). Os erros de tipo restantes são todos pré-existentes.
- Migration conferida contra o SQL canônico do Prisma (`migrate diff --from-empty --to-schema-datamodel`): as sete FKs e as colunas são idênticas. O `migrate diff` contra o banco aponta índices `*_fkey` a mais, mas esses são criados pelo próprio MySQL junto com cada constraint e aparecem igualmente nas tabelas antigas (`files`, `mentions`) — verificado com `SHOW INDEX`. Não é divergência desta migration.
- 46 verificações funcionais contra o banco: regra de liberação das datas nos cinco casos, acesso lido do banco (incluindo concessão e revogação valendo na hora, e usuário inativo barrado), ida e volta da data sem perder o dia, criação com marcação, enfileiramento de WhatsApp só para quem tem telefone, trava de data passada resistindo inclusive ao admin, dia passado com documento aceitando novos, resposta à marcação com as três regras de permissão, marcação duplicada e usuário inativo ignorados, montagem do mês (todos os dias, um único "hoje", ordem, isolamento entre meses) e exclusão com as regras de autoria.

O teste do erro de fuso ficou registrado no script para o bug não voltar.

Duas descobertas de ambiente durante a verificação, ambas pré-existentes e sem relação com este trabalho: as credenciais do Google **não** estão no `.env` local (o Drive vira no-op, então nenhuma pasta de teste foi criada no Drive de produção), e importar qualquer coisa que puxe `jobs/notificationQueue` abre uma `Queue` **e um `Worker`** BullMQ no import — sem Redis no ar, qualquer script CLI que toque esse caminho trava para sempre.

A migration foi escrita à mão de novo, e não gerada com `--from-migrations`, porque o repositório tem divergência pré-existente entre migrations e `schema.prisma` (a coluna `users.crm_access` não é criada por migration nenhuma). Um `migrate diff` a partir das migrations produziria um script que tenta recriar essa coluna e **quebraria em produção**, onde ela já existe.

## Fora do escopo

- Consertar o upload de arquivo dos cards (MinIO desconectado).
- Consertar o `canCrm`, que lê a permissão do JWT.
- Reconciliar migrations com `schema.prisma`.
- Editar documento depois de criado (só criar, anexar, responder e excluir).
- Repetição/recorrência de documento entre meses.
