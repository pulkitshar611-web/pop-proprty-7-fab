/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[idempotencyKey]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `invoice` ADD COLUMN `idempotencyKey` VARCHAR(191) NULL,
    ADD COLUMN `totalPaid` DECIMAL(65, 30) NOT NULL DEFAULT 0.0;

-- AlterTable
ALTER TABLE `lease` ADD COLUMN `bedroom` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `transaction` ADD COLUMN `idempotencyKey` VARCHAR(191) NULL,
    ADD COLUMN `invoiceId` INTEGER NULL,
    ADD COLUMN `ownerId` INTEGER NULL,
    ADD COLUMN `propertyId` INTEGER NULL,
    MODIFY `status` VARCHAR(191) NULL DEFAULT 'Completed';

-- AlterTable
ALTER TABLE `unit` ADD COLUMN `floor` VARCHAR(191) NULL DEFAULT 'G';

-- CreateTable
CREATE TABLE `Invitation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'OWNER', 'TENANT') NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Pending',
    `invitedBy` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Invitation_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Invoice_idempotencyKey_key` ON `Invoice`(`idempotencyKey`);

-- CreateIndex
CREATE UNIQUE INDEX `Transaction_idempotencyKey_key` ON `Transaction`(`idempotencyKey`);

-- AddForeignKey
ALTER TABLE `Invitation` ADD CONSTRAINT `Invitation_invitedBy_fkey` FOREIGN KEY (`invitedBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
