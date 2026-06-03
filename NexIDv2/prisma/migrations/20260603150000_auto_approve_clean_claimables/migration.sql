UPDATE "Referral"
SET "status" = 'approved',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'pending'
  AND "riskFlag" IS NULL
  AND "rewardAmount" > 0;

UPDATE "RewardAllocation"
SET "status" = 'approved',
    "reviewedAt" = COALESCE("reviewedAt", CURRENT_TIMESTAMP),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'pending'
  AND "riskFlag" IS NULL
  AND "rewardShareUsd" > 0;
