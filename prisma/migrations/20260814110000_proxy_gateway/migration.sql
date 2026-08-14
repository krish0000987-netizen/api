-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "slug" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "apiKeyLookup" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_slug_key" ON "Vendor"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_apiKeyLookup_key" ON "Customer"("apiKeyLookup");

