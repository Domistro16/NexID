import assert from "node:assert/strict";
import test from "node:test";
import {
  qualifyMarketDraftForLaunch,
  sourceQualificationBlocksLaunch
} from "../../lib/services/sourceQualificationService.ts";
import { shapeMarket } from "../../lib/services/marketComposerService.ts";

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

test("NexMind fallback fills custom objective market details without a source URL", () => {
  const draft = shapeMarket({
    rawThesis: "Will Binance secure a MiCA licence before December 31, 2026?",
    arenaHint: "crypto"
  });

  assert.equal(draft.riskStatus, "allowed");
  assert.equal(draft.missingFields.length, 0);
  assert.equal(draft.resolution.sourceUrl, null);
  assert.equal(draft.resolution.sourceType, "manual_optimistic");
  assert.match(draft.settlementSource ?? "", /regulator records|credible contemporaneous news reports/i);
  assert.match(draft.resolution.sourceName, /regulator records|credible contemporaneous news reports/i);
  assert.match(draft.resolution.method, /Binance secure a MiCA licence/i);
  assert.match(draft.resolution.fallback, /Invalid \/ Refund/i);
  assert.match(draft.sides.ride, /confirmed by the locked settlement source/i);
  assert.match(draft.sides.fade, /not confirmed by the locked settlement source/i);
});
