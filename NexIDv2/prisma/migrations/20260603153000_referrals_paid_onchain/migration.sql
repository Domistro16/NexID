UPDATE "Referral"
SET "status" = 'paid',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('pending', 'approved')
  AND "riskFlag" IS NULL
  AND "rewardAmount" > 0
  AND "mintName" IS NOT NULL;

UPDATE "ClaimableBalanceLedger"
SET "status" = 'source_inactive',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "sourceType" = 'referral'
  AND "status" IN ('claimable', 'reserved', 'claim_requested');
