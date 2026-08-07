-- Aprovação de documentos da timeline.
--
-- SQL extraído do que o `prisma migrate diff` gera, sem as alterações que o
-- gerador arrasta por causa da divergência histórica entre as migrations e o
-- schema.prisma (recriar users.crm_access, FKs de CRM). Essas já existem em
-- produção e aplicá-las de novo abortaria a migration.

-- AlterTable
ALTER TABLE `timeline_mentions` ADD COLUMN `approval` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `decided_at` DATETIME(3) NULL;

-- Menções que já foram respondidas antes desta mudança contam como aprovadas:
-- a pessoa se manifestou. Sem isto elas apareceriam como pendentes, cobrando
-- de novo quem já tinha respondido.
UPDATE `timeline_mentions`
   SET `approval` = 'APPROVED', `decided_at` = `replied_at`
 WHERE `replied_at` IS NOT NULL;
