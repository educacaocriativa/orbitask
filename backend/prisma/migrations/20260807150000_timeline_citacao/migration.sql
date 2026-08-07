-- Separa citação (só chama atenção) de aprovação (assina).
--
-- Default true: as marcações que já existem foram criadas quando marcar
-- significava pedir aprovação. Mantê-las como aprovadoras preserva o que
-- as pessoas já viram na tela.

-- AlterTable
ALTER TABLE `timeline_mentions` ADD COLUMN `is_approver` BOOLEAN NOT NULL DEFAULT true;
