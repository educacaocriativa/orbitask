# Timeline separada por projeto

**Data:** 2026-08-06
**Altera:** [2026-08-05-timeline-design.md](2026-08-05-timeline-design.md)

Abrir a Timeline passa a mostrar uma tela de seleção de projeto, no mesmo formato de missões ativas, com opção de criar um projeto que existe só na Timeline. O controle de pessoas deixa de ser global e passa a ser por projeto.

## Decisões tomadas

| Questão | Decisão |
|---|---|
| Projeto criado pela Timeline | Recebe `timelineOnly` e **some** de missões ativas e do Kanban |
| Quais projetos existem na Timeline | **Todas as missões ativas**, mais os projetos só-timeline |
| Quem vê cada projeto | Membro da missão, dono, ou incluído na timeline dela |
| Quem pode ser incluído | **Só quem já é membro do projeto** (`BoardMember` ou dono) |
| Botão TIMELINE na navbar | Aberto a **qualquer usuário logado** |
| Lista global `User.timelineAccess` | **Removida** — perdeu a função |
| Documentos já existentes | Ficam sem projeto e são realocados um a um numa tela própria |
| Gerenciar pessoas | Só ADMIN, de dentro do projeto |

## Toda missão tem linha do tempo

Não existe "ativar timeline". Toda missão ativa aparece na tela de seleção e já aceita documento, ao lado dos projetos criados só para a Timeline. O cartão mostra `+ Kanban` para diferenciar quem também tem quadro de etapas.

A primeira versão exigia que o projeto já tivesse participante ou documento para aparecer. O resultado em produção foi a tela abrindo vazia: o único caminho aparente era recriar as missões pelo botão "+ Novo projeto", que então barrava com "já existe um projeto com esse nome". Duas falhas somadas — a lista escondia o que já existia, e a mensagem de erro não dizia o que fazer.

Por isso, `isTimelineMember` também aceita quem é membro da missão ou dono dela. Sem isso a missão apareceria na lista e daria 403 ao abrir. `TimelineMember` continua existindo para o caso oposto: incluir na timeline alguém que **não** é da missão — um convidado pontual.

Consequência a registrar: remover uma pessoa da timeline **não** tira o acesso de quem é membro da missão, porque o acesso vem dela. Para tirar, remove-se da missão. Isso tem cobertura de teste.

## Modelo de dados

```prisma
model Board {
  timelineOnly Boolean @default(false) @map("timeline_only")
  timelineDocuments TimelineDocument[]
  timelineMembers   TimelineMember[]
}

model TimelineMember {
  boardId String
  userId  String
  @@unique([boardId, userId])
}

model TimelineDocument {
  boardId String? // anulável: ver "Documentos órfãos"
  @@index([boardId, date])
}
```

`User.timelineAccess` foi removido. Ele tinha um dia de vida e o significado dele deixou de existir quando o acesso virou por projeto; manter a coluna só produziria confusão futura. O dado perdido não tem valor — a lista é reconstruída projeto a projeto.

### Documentos órfãos

`boardId` é anulável de propósito. A Timeline já estava em produção quando esta mudança foi feita, então podem existir documentos reais sem projeto. A migration **não** os move nem os apaga: eles aparecem numa faixa "Sem projeto" na tela de seleção, visível só para ADMIN, e são realocados um a um. Quando a lista zera, a faixa some sozinha.

Inventar um dono para eles seria pior que admitir que estão órfãos.

## A migration não foi gerada automaticamente

`prisma migrate diff --from-migrations` produz um script que também recria `users.crm_access`, adiciona `boards.archived_at` e recria FKs de CRM — consequências da divergência histórica entre as migrations e o `schema.prisma`, documentada no spec do relatório de atividade. Essas colunas já existem em produção, e aplicá-las de novo abortaria a migration inteira.

A migration foi montada extraindo do script gerado apenas as instruções desta mudança, e depois **validada contra um banco em estado de produção**: um MySQL limpo com todas as migrations aplicadas, mais `crm_access` e `archived_at` adicionados à mão para reproduzir o desvio real. A migration aplicou sem erro nesse banco.

## Trava de data agora é por projeto

A regra continua a mesma (futuro aberto, passado vazio travado, passado com documento aberto), mas a contagem é feita **dentro do projeto**. Um dia destravado no projeto A permanece travado no B — cada linha do tempo tem seus próprios prazos. Isso está coberto por teste.

## Acesso

Não existe mais permissão global. `isTimelineMember(boardId, user)` consulta o banco a cada requisição, e não o JWT: lido do token, incluir alguém num projeto só valeria no próximo login e remover não valeria até o token expirar.

Quem não participa de nenhum projeto abre a Timeline e vê a lista vazia com uma explicação — não um erro nem uma tela quebrada.

`GET /timeline/people?boardId=` devolve apenas quem participa daquele projeto, porque marcar alguém que não consegue abrir a página seria mandá-lo para uma porta fechada.

## Drive

A pasta passa a ser `TIMELINE / Projeto / AAAA-MM / DD - Nome`, espelhando a separação da tela. Criar um projeto já cria a pasta raiz dele.

**Documentos antigos não são movidos no Drive.** Realocar um documento muda o projeto no Orbi, mas a pasta dele permanece onde estava. Mover pastas no Drive é arriscado e reversível só manualmente; a alternativa seria pior que a inconsistência.

## API

| Rota | O que faz |
|---|---|
| `GET /timeline/boards` | Projetos que a pessoa vê + contagem de órfãos (ADMIN) |
| `POST /timeline/boards` | Cria projeto `timelineOnly` (ADMIN) |
| `GET /timeline/boards/:id/people` | Membros do projeto + `candidates` de fora (ADMIN) |
| `PATCH /timeline/boards/:id/people/:userId` | Inclui ou remove da timeline; recusa quem não é do projeto (ADMIN) |
| `POST /timeline/boards/:id/people` | Inclui no projeto **e** na timeline (ADMIN) |
| `GET /timeline/orphans` | Documentos sem projeto (ADMIN) |
| `GET /timeline?boardId=&year=&month=` | Mês do projeto; sem `boardId`, os órfãos |
| `PATCH /timeline/documents/:id` | Texto (autor/ADMIN) e `boardId` para realocar (ADMIN) |

`GET /boards` e `GET /boards/archived` passaram a filtrar `timelineOnly: false`.

## Telas

**`/timeline`** — seleção de projeto, no formato de missões ativas: grade de cartões com cor, contagem de documentos e pessoas, data do último lançamento e o selo `+ Kanban` quando o projeto também tem quadro. Botão "+ Novo projeto" para ADMIN, e a faixa de órfãos quando houver.

**`/timeline/[boardId]`** — a linha do tempo que já existia, agora com o nome do projeto no cabeçalho, atalho para a pasta no Drive e voltar para a seleção.

**Modal de pessoas** — lista **apenas quem já faz parte do projeto**, com o botão **"Só adicionados"** para filtrar quem já participa da timeline. O ADMIN aparece com rótulo mas pode ser incluído ou removido como qualquer outro, já que a participação agora é por projeto.

No rodapé, **"+ Adicionar ao projeto"** abre uma busca entre quem ainda está de fora e inclui a pessoa **nos dois níveis de uma vez** (membro do projeto e da timeline). Isso existe porque um projeto criado pela Timeline não tem quadro de missões — este é o único lugar onde cadastrar alguém nele. Em projeto com Kanban funciona igual, e a pessoa passa a constar também como membro do projeto.

### Timeline só para quem está no projeto

A regra é verificada **no backend**, em `setBoardMembership`: incluir na timeline alguém que não é membro do projeto (nem dono) devolve 400 com a orientação de adicionar ao projeto primeiro. Uma restrição que só escondesse opções na tela seria contornável chamando a API direto.

Por isso `createTimelineBoard` também cria o `BoardMember` dos convidados — sem isso o projeto nasceria violando a própria regra. O dono é membro implícito e não precisa de linha em `board_members`.

## Verificação executada

Contra MySQL 8 e Redis descartáveis, destruídos ao final. O banco de desenvolvimento não foi tocado.

- Migration aplicada com sucesso sobre um banco em **estado de produção** (com `crm_access` e `archived_at` já presentes), que é onde a versão gerada automaticamente quebraria. As quatro alterações conferidas com `SHOW COLUMNS` / `SHOW TABLES`.
- `tsc --noEmit` nos dois lados e `next build` — rotas `/timeline` e `/timeline/[boardId]` geradas. Os erros de tipo restantes são os mesmos sete pré-existentes.
- **58 verificações novas**: criação de projeto e recusa a não-admin, projeto de timeline fora de missões ativas, participação por projeto valendo na hora ao incluir e ao remover, isolamento de documentos entre projetos, **trava de data por projeto**, órfãos (aparecem, não vazam para projeto nenhum, realocam, somem da lista), lista de projetos por perfil (admin vê tudo, membro vê só os seus, quem não participa vê vazio) e projeto Kanban entrando na lista ao ganhar timeline.
- **A regra "timeline só para membro do projeto"** tem cobertura própria: recusa de quem está de fora, membro entrando normalmente, lista principal contendo só gente do projeto, quem está fora aparecendo em `candidates`, dono contando como membro, inclusão nos dois níveis de uma vez, recusa a não-admin e a usuário inativo.
- **60 verificações de regressão**: a suíte anterior foi adaptada para a API por projeto e passa inteira — regra de data, fuso, marcação, resposta, edição, exclusão e remoção de arquivo continuam idênticas.

Os scripts não foram versionados: eles limpam o banco inteiro com `deleteMany`.

## Pendências conhecidas

- O upload real ao Google Drive **segue sem teste contra a API do Google** — as credenciais não estão no `.env` local. Vale um teste manual após o deploy.
- Realocar documento não move a pasta no Drive (decisão consciente, acima).
- A divergência entre migrations e `schema.prisma` continua e ainda merece uma migration de reconciliação.
