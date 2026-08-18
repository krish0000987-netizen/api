-- AlterTable
ALTER TABLE "Admin" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'admin';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "balance" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "UsageEvent" ADD COLUMN     "apiProductId" TEXT,
ADD COLUMN     "cost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "environment" TEXT NOT NULL DEFAULT 'sandbox',
ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "price" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "profit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "responseTimeMs" INTEGER,
ADD COLUMN     "status" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "authBasicEnc" TEXT,
ADD COLUMN     "authExtraHeadersEnc" TEXT,
ADD COLUMN     "authHeaderName" TEXT,
ADD COLUMN     "authOAuthEnc" TEXT,
ADD COLUMN     "authQueryParam" TEXT,
ADD COLUMN     "authType" TEXT DEFAULT 'bearer';

-- CreateTable
CREATE TABLE "CustomerApiKey" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT,
    "apiKeyHash" TEXT NOT NULL,
    "apiKeyLookup" TEXT NOT NULL,
    "apiKeyPrefix" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'sandbox',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiProduct" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "category" TEXT,
    "description" TEXT,
    "logo" TEXT,
    "providerWebsite" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "supportsSandbox" BOOLEAN NOT NULL DEFAULT true,
    "supportsLive" BOOLEAN NOT NULL DEFAULT true,
    "method" TEXT NOT NULL DEFAULT 'POST',
    "baseUrl" TEXT NOT NULL,
    "endpointPath" TEXT NOT NULL,
    "requestBodyType" TEXT NOT NULL DEFAULT 'json',
    "requestBodyTemplate" JSONB,
    "queryParams" JSONB,
    "pathParams" JSONB,
    "headers" JSONB,
    "responseMode" TEXT NOT NULL DEFAULT 'raw',
    "normalizedResponseSchema" JSONB,
    "errorMappings" JSONB,
    "fallbackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "fallbackRetryCount" INTEGER NOT NULL DEFAULT 1,
    "fallbackTimeoutMs" INTEGER NOT NULL DEFAULT 5000,
    "fallbackVendorIds" TEXT,
    "defaultCost" INTEGER NOT NULL DEFAULT 0,
    "defaultPrice" INTEGER NOT NULL DEFAULT 0,
    "billingModel" TEXT NOT NULL DEFAULT 'per_request',
    "billOnSuccess" BOOLEAN NOT NULL DEFAULT true,
    "requireConsent" BOOLEAN NOT NULL DEFAULT false,
    "dataRetentionDays" INTEGER,
    "privacyConfig" JSONB,
    "versionOf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiField" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variable" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "store" BOOLEAN NOT NULL DEFAULT false,
    "mask" BOOLEAN NOT NULL DEFAULT false,
    "log" BOOLEAN NOT NULL DEFAULT false,
    "returnToCustomer" BOOLEAN NOT NULL DEFAULT true,
    "validation" TEXT,
    "minLength" INTEGER,
    "maxLength" INTEGER,
    "minValue" DOUBLE PRECISION,
    "maxValue" DOUBLE PRECISION,
    "defaultValue" TEXT,
    "placeholder" TEXT,
    "example" TEXT,
    "enumOptions" JSONB,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiResponseMapping" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "providerPath" TEXT NOT NULL,
    "customerField" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL DEFAULT 'string',
    "mask" BOOLEAN NOT NULL DEFAULT false,
    "maskRule" TEXT,
    "transform" TEXT DEFAULT 'none',
    "template" TEXT,
    "placement" TEXT NOT NULL DEFAULT 'top',
    "customerPath" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiResponseMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerId" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "apiProductId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "cost" INTEGER NOT NULL DEFAULT 0,
    "price" INTEGER NOT NULL DEFAULT 0,
    "profit" INTEGER NOT NULL DEFAULT 0,
    "responseTimeMs" INTEGER,
    "errorCode" TEXT,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderHealth" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "avgResponseMs" INTEGER NOT NULL DEFAULT 0,
    "totalRequests" INTEGER NOT NULL DEFAULT 0,
    "failedRequests" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiDocumentation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "markdown" TEXT,
    "json" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiDocumentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "apiProductId" TEXT,
    "url" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'POST',
    "headersEnc" TEXT,
    "authConfigEnc" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "timeoutMs" INTEGER NOT NULL DEFAULT 5000,
    "signatureSecretEnc" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerApiKey_apiKeyLookup_key" ON "CustomerApiKey"("apiKeyLookup");

-- CreateIndex
CREATE INDEX "CustomerApiKey_customerId_status_idx" ON "CustomerApiKey"("customerId", "status");

-- CreateIndex
CREATE INDEX "CustomerApiKey_mode_idx" ON "CustomerApiKey"("mode");

-- CreateIndex
CREATE INDEX "ApiProduct_vendorId_idx" ON "ApiProduct"("vendorId");

-- CreateIndex
CREATE INDEX "ApiProduct_status_idx" ON "ApiProduct"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ApiProduct_slug_version_key" ON "ApiProduct"("slug", "version");

-- CreateIndex
CREATE INDEX "ApiField_productId_position_idx" ON "ApiField"("productId", "position");

-- CreateIndex
CREATE INDEX "ApiResponseMapping_productId_position_idx" ON "ApiResponseMapping"("productId", "position");

-- CreateIndex
CREATE INDEX "PricingRule_customerId_idx" ON "PricingRule"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_productId_customerId_key" ON "PricingRule"("productId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_requestId_key" ON "Transaction"("requestId");

-- CreateIndex
CREATE INDEX "Transaction_customerId_createdAt_idx" ON "Transaction"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_apiProductId_createdAt_idx" ON "Transaction"("apiProductId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_vendorId_createdAt_idx" ON "Transaction"("vendorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderHealth_vendorId_key" ON "ProviderHealth"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiDocumentation_productId_key" ON "ApiDocumentation"("productId");

-- CreateIndex
CREATE INDEX "Webhook_customerId_idx" ON "Webhook"("customerId");

-- CreateIndex
CREATE INDEX "Webhook_apiProductId_idx" ON "Webhook"("apiProductId");

-- CreateIndex
CREATE INDEX "Customer_apiKeyLookup_idx" ON "Customer"("apiKeyLookup");

-- CreateIndex
CREATE INDEX "UsageEvent_apiProductId_createdAt_idx" ON "UsageEvent"("apiProductId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_createdAt_idx" ON "UsageEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Vendor_enabled_priority_idx" ON "Vendor"("enabled", "priority");

-- AddForeignKey
ALTER TABLE "CustomerApiKey" ADD CONSTRAINT "CustomerApiKey_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiProduct" ADD CONSTRAINT "ApiProduct_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiField" ADD CONSTRAINT "ApiField_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ApiProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiResponseMapping" ADD CONSTRAINT "ApiResponseMapping_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ApiProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ApiProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_apiProductId_fkey" FOREIGN KEY ("apiProductId") REFERENCES "ApiProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_apiProductId_fkey" FOREIGN KEY ("apiProductId") REFERENCES "ApiProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderHealth" ADD CONSTRAINT "ProviderHealth_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiDocumentation" ADD CONSTRAINT "ApiDocumentation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ApiProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_apiProductId_fkey" FOREIGN KEY ("apiProductId") REFERENCES "ApiProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
