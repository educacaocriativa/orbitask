-- CreateTable
CREATE TABLE `activity_events` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('CARD_MOVED', 'CARD_CREATED', 'CARD_ARCHIVED', 'CARD_RESTORED', 'FILE_UPLOADED', 'FILE_DELETED', 'FOLDER_CREATED') NOT NULL,
    `actor_id` VARCHAR(191) NULL,
    `actor_name` VARCHAR(191) NOT NULL,
    `actor_email` VARCHAR(191) NOT NULL,
    `board_id` VARCHAR(191) NOT NULL,
    `board_title` VARCHAR(191) NOT NULL,
    `card_id` VARCHAR(191) NULL,
    `card_title` VARCHAR(191) NULL,
    `column_id` VARCHAR(191) NULL,
    `column_title` VARCHAR(191) NULL,
    `to_column_id` VARCHAR(191) NULL,
    `to_column_title` VARCHAR(191) NULL,
    `folder_name` VARCHAR(191) NULL,
    `folder_url` TEXT NULL,
    `detail` JSON NULL,
    `is_backfilled` BOOLEAN NOT NULL DEFAULT false,
    `occurred_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `activity_events_board_id_occurred_at_idx`(`board_id`, `occurred_at`),
    INDEX `activity_events_actor_id_occurred_at_idx`(`actor_id`, `occurred_at`),
    INDEX `activity_events_occurred_at_idx`(`occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
