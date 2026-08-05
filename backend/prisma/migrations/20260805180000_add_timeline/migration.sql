-- AlterTable
ALTER TABLE `users` ADD COLUMN `timeline_access` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `timeline_documents` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `date` DATE NOT NULL,
    `drive_folder_id` VARCHAR(191) NULL,
    `drive_folder_url` TEXT NULL,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `timeline_documents_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `timeline_files` (
    `id` VARCHAR(191) NOT NULL,
    `original_name` VARCHAR(191) NOT NULL,
    `mime_type` VARCHAR(191) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `drive_file_id` VARCHAR(191) NULL,
    `drive_file_url` TEXT NULL,
    `document_id` VARCHAR(191) NOT NULL,
    `uploaded_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `timeline_files_document_id_idx`(`document_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `timeline_mentions` (
    `id` VARCHAR(191) NOT NULL,
    `document_id` VARCHAR(191) NOT NULL,
    `mentioned_user_id` VARCHAR(191) NOT NULL,
    `mentioned_by_id` VARCHAR(191) NOT NULL,
    `whatsapp_sent` BOOLEAN NOT NULL DEFAULT false,
    `whatsapp_sent_at` DATETIME(3) NULL,
    `reply` TEXT NULL,
    `replied_at` DATETIME(3) NULL,
    `replied_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `timeline_mentions_mentioned_user_id_idx`(`mentioned_user_id`),
    UNIQUE INDEX `timeline_mentions_document_id_mentioned_user_id_key`(`document_id`, `mentioned_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `timeline_documents` ADD CONSTRAINT `timeline_documents_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `timeline_files` ADD CONSTRAINT `timeline_files_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `timeline_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `timeline_files` ADD CONSTRAINT `timeline_files_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `timeline_mentions` ADD CONSTRAINT `timeline_mentions_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `timeline_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `timeline_mentions` ADD CONSTRAINT `timeline_mentions_mentioned_user_id_fkey` FOREIGN KEY (`mentioned_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `timeline_mentions` ADD CONSTRAINT `timeline_mentions_mentioned_by_id_fkey` FOREIGN KEY (`mentioned_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `timeline_mentions` ADD CONSTRAINT `timeline_mentions_replied_by_id_fkey` FOREIGN KEY (`replied_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
