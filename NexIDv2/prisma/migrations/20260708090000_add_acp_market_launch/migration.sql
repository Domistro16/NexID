CREATE TABLE "AcpProviderOffering" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "providerName" TEXT NOT NULL,
  "serviceCode" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "feeUsdc" DOUBLE PRECISION NOT NULL DEFAULT 2,
  "settlementRail" TEXT NOT NULL DEFAULT 'ACP_ESCROW',
  "providerWallet" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AcpProviderOffering_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcpMarketLaunchJob" (
  "id" TEXT NOT NULL,
  "externalJobId" TEXT,
  "providerOfferingId" TEXT,
  "requesterWallet" TEXT NOT NULL,
  "requesterVirtualsIdentity" TEXT,
  "requesterAgentId" TEXT,
  "requesterAgentProfileId" TEXT,
  "preferredDomain" TEXT,
  "resolvedPublicId" TEXT,
  "rawThesis" TEXT NOT NULL,
  "arenaHint" TEXT,
  "confirmationMode" TEXT NOT NULL DEFAULT 'manual',
  "autoApproved" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'structured_pending_confirmation',
  "draftId" TEXT,
  "marketId" TEXT,
  "structuredCard" JSONB,
  "draft" JSONB,
  "launchResponse" JSONB,
  "idAction" JSONB,
  "acpFeeUsdc" DOUBLE PRECISION NOT NULL DEFAULT 2,
  "acpFeeStatus" TEXT NOT NULL DEFAULT 'pending',
  "acpSettlementRef" TEXT,
  "acpSettlementPayload" JSONB,
  "error" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "launchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AcpMarketLaunchJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcpProviderOffering_providerId_serviceCode_key" ON "AcpProviderOffering"("providerId", "serviceCode");
CREATE INDEX "AcpProviderOffering_providerId_status_idx" ON "AcpProviderOffering"("providerId", "status");
CREATE INDEX "AcpProviderOffering_serviceCode_status_idx" ON "AcpProviderOffering"("serviceCode", "status");

CREATE UNIQUE INDEX "AcpMarketLaunchJob_externalJobId_key" ON "AcpMarketLaunchJob"("externalJobId");
CREATE INDEX "AcpMarketLaunchJob_requesterWallet_status_createdAt_idx" ON "AcpMarketLaunchJob"("requesterWallet", "status", "createdAt");
CREATE INDEX "AcpMarketLaunchJob_requesterAgentProfileId_status_createdAt_idx" ON "AcpMarketLaunchJob"("requesterAgentProfileId", "status", "createdAt");
CREATE INDEX "AcpMarketLaunchJob_requesterAgentId_status_createdAt_idx" ON "AcpMarketLaunchJob"("requesterAgentId", "status", "createdAt");
CREATE INDEX "AcpMarketLaunchJob_marketId_idx" ON "AcpMarketLaunchJob"("marketId");
CREATE INDEX "AcpMarketLaunchJob_status_createdAt_idx" ON "AcpMarketLaunchJob"("status", "createdAt");
CREATE INDEX "AcpMarketLaunchJob_acpFeeStatus_createdAt_idx" ON "AcpMarketLaunchJob"("acpFeeStatus", "createdAt");

ALTER TABLE "AcpMarketLaunchJob" ADD CONSTRAINT "AcpMarketLaunchJob_providerOfferingId_fkey" FOREIGN KEY ("providerOfferingId") REFERENCES "AcpProviderOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;
