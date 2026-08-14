-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "apiKeyRevoked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordHash" TEXT;

