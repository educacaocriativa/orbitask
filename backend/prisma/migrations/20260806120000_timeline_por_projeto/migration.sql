-- Timeline separada por projeto.
--
-- O SQL abaixo foi extraído do que o `prisma migrate diff` gera, deixando de
-- fora as alterações que o gerador arrasta por causa da divergência histórica
-- entre as migrations e o schema.prisma (recriar `users.crm_access`, adicionar
-- `boards.archived_at`, recriar FKs de CRM). Essas colunas e constraints já
-- existem em produção, e aplicá-las de novo abortaria a migration.

-- AlterTable: projeto que só existe na Timeline não aparece em missões ativas
ALTER TABLE `boards` ADD COLUMN `timeline_only` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: documento passa a pertencer a um projeto.
-- Anulável porque os documentos lançados antes desta mudança não têm dono;
-- eles ficam na área "Sem projeto" até alguém realocá-los.
ALTER TABLE `timeline_documents` ADD COLUMN `board_id` VARCHAR(191) NULL;

-- AlterTable: o acesso à Timeline deixa de ser uma flag global do usuário e
-- passa a ser participação por projeto (tabela timeline_members abaixo).
ALTER TABLE `users` DROP COLUMN `timeline_access`;

-- CreateTable
CREATE TABLE `timeline_members` (
    `id` VARCHAR(191) NOT NULL,
    `board_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `timeline_members_user_id_idx`(`user_id`),
    UNIQUE INDEX `timeline_members_board_id_user_id_key`(`board_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `timeline_documents_board_id_date_idx` ON `timeline_documents`(`board_id`, `date`);

-- AddForeignKey
ALTER TABLE `timeline_members` ADD CONSTRAINT `timeline_members_board_id_fkey` FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `timeline_members` ADD CONSTRAINT `timeline_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `timeline_documents` ADD CONSTRAINT `timeline_documents_board_id_fkey` FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
