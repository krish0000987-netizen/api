-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_apiProductId_fkey";

-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "apiProductId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_apiProductId_fkey" FOREIGN KEY ("apiProductId") REFERENCES "ApiProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
