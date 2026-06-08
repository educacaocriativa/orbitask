-- AlterTable
ALTER TABLE `card_sections` ADD COLUMN `arrived_at` DATETIME(3) NULL,
                             ADD COLUMN `left_at` DATETIME(3) NULL;
