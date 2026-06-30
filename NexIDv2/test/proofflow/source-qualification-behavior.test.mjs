import assert from "node:assert/strict";
import test from "node:test";
import {
  qualifyMarketDraftForLaunch,
  sourceQualificationBlocksLaunch
} from "../../lib/services/sourceQualificationService.ts";

function completeDraftWithoutSourceUrl() {
  return {
    rawThesis: "Will Binance secure a MiCA licence before December 31, 2026?",
    title: "Binance MiCA licence by Dec 31 2026",
    question: "Will Binance secure a MiCA licence before December 31, 2026?",
    arena: "crypto",
    template: "custom_objective",
    entities: ["Binance", "MiCA"],
    timeframe: {
      startAt: "2026-06-30T00:00:00.000Z",
      closeAt: "2026-12-31T23:59:00.000Z",
      timezone: "UTC",
      label: "before December 31, 2026"
    },
    settlementSource: "Official regulator announcements, official court dockets, company disclosures, and contemporaneous credible news reports.",
    resolution: {
      sourceType: "api",
      sourceName: "Official regulator announcements and credible contemporaneous reports",
      sourceUrl: null,
      method: "Ride wins if public evidence confirms Binance secured a MiCA licence before the close time.",
      fallback: "If public evidence cannot prove Ride or Fade, resolve Invalid / Refund."
    },
    sides: {
      ride: "Binance secures a MiCA licence before the deadline.",
      fade: "Binance does not secure a MiCA licence before the deadline."
    },
    launch: {
      stakeUsdc: 20,
      nonRefundableFeeUsdc: 10,
      refundableQualityBondUsdc: 10
    },
    risk: {
      status: "allowed",
      reasons: ["Fixed deadline", "Objective public evidence path"],
      requiredUserEdits: []
    },
    riskStatus: "allowed",
    missingFields: [],
    blockedReason: null,
    duplicateCheck: {
      status: "pending",
      matches: []
    }
  };
}

test("source URL is optional for evidence-based native launches", async () => {
  const qualified = await qualifyMarketDraftForLaunch({ draft: completeDraftWithoutSourceUrl() });

  assert.equal(sourceQualificationBlocksLaunch(qualified), false);
  assert.equal(qualified.riskStatus, "allowed");
  assert.equal(qualified.resolution.sourceUrl, null);
  assert.equal(qualified.resolution.sourceType, "manual_optimistic");
  assert.equal(qualified.settlementMode, "evidence_based");
  assert.equal(qualified.sourceQualification?.launchBlocked, false);
  assert.equal(qualified.sourceQualification?.status, "DOWNGRADED");
  assert.equal(qualified.missingFields.includes("source URL"), false);
  assert.equal(qualified.missingFields.includes("source_url"), false);
});
