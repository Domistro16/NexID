import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = () => readFileSync("lib/services/sourceQualificationService.ts", "utf8");
const launchRoute = () => readFileSync("app/api/native-markets/route.ts", "utf8");
const marketService = () => readFileSync("lib/services/nexmarketsService.ts", "utf8");
const launchUi = () => readFileSync("components/nexmarkets/launch/launch-studio-client.tsx", "utf8");
const tradeTicket = () => readFileSync("components/nexmarkets/native-trade-ticket.tsx", "utf8");
const approvalHelper = () => readFileSync("lib/client/approval-confirmation.ts", "utf8");
const validation = () => readFileSync("lib/server/validation.ts", "utf8");
const schema = () => readFileSync("prisma/schema.prisma", "utf8");

test("source qualification service scores source quality and rejects unstructured sources", () => {
  const source = service();

  assert.match(source, /export const SourceQualificationService/);
  assert.match(source, /export function scoreSourceQuality/);
  assert.match(source, /reachability:\s*input\.reachable && input\.statusCode === 200 \? 20 : 0/);
  assert.match(source, /structuredData:\s*structured \? 25 : 0/);
  assert.match(source, /stability:\s*stable \? 20 : 5/);
  assert.match(source, /determinism:\s*structured && input\.extractorValid && deterministic \? 25 : 0/);
  assert.match(source, /timestampSupport:\s*timestamp \? 10 : 0/);
  assert.match(source, /sourceDecisionForScore\(score\)/);
  assert.match(source, /responseLooksBlocked/);
  assert.match(source, /captcha\|sign in\|log in\|login required\|unauthorized\|forbidden\|paywall/);
});

test("valid crypto API sources get deterministic extractor validation and dry-run settlement", () => {
  const source = service();

  assert.match(source, /token_price_threshold/);
  assert.match(source, /field:\s*"market_data\.current_price\.usd"/);
  assert.match(source, /parseThreshold\(`\$\{draft\.title\} \$\{draft\.question\} \$\{draft\.resolution\.method\}`\)/);
  assert.match(source, /replace\(\/,\/g,\s*""\)/);
  assert.match(source, /validateSettlementExtractor/);
  assert.match(source, /simulateSettlement/);
  assert.match(source, /Dry run settlement executed successfully/);
  assert.match(source, /provisionalOutcome:\s*rideWins \? "ride" : "fade"/);
});

test("extractor validation fails when field, type or operator is invalid", () => {
  const source = service();

  assert.match(source, /Extractor field \$\{input\.extractor\.field\} was not found/);
  assert.match(source, /expected \$\{input\.extractor\.valueType\}/);
  assert.match(source, /Unsupported extractor operator/);
  assert.match(source, /Extractor target is required for comparison operators/);
});

test("dry-run and determinism both need repeatable extraction before auto launch", () => {
  const source = service();

  assert.match(source, /const secondFetch = await fetchSource/);
  assert.match(source, /const secondValidation[\s\S]*?= secondFetch\.ok/);
  assert.match(source, /extractedValuesCompatible/);
  assert.match(source, /Extractor produced a compatible result across two independent executions/);
  assert.match(source, /deterministic/);
});

test("source repair supports crypto inference and configured non-crypto feeds", () => {
  const source = service();

  assert.match(source, /NEXMARKETS_COINGECKO_IDS_JSON/);
  assert.match(source, /coinGeckoApiUrl/);
  assert.match(source, /https:\/\/api\.coingecko\.com\/api\/v3\/coins/);
  assert.match(source, /NEXMARKETS_SOURCE_REPAIR_SOURCES_JSON/);
  assert.match(source, /configuredRepairSourceForDraft/);
  assert.match(source, /\? "accepted" : "rejected"/);
  assert.match(source, /status:\s*"rejected"/);
});

test("failed qualification downgrades to evidence-based or blocks launch", () => {
  const source = service();

  assert.match(source, /export function normalizeDraftLaunchReadiness/);
  assert.match(source, /currentLaunchMissingFields/);
  assert.match(source, /riskStatus = blocked \? "blocked" : missingFields\.length \? "ambiguous_refine" : "allowed"/);
  assert.match(source, /const draft = normalizeDraftLaunchReadiness\(input\.draft\)/);
  assert.match(source, /downgradeDraftToEvidenceBased/);
  assert.match(source, /sourceType:\s*"manual_optimistic"/);
  assert.match(source, /Auto-verifiable source qualification failed; market was downgraded/);
  assert.match(source, /status:\s*"BLOCKED"/);
  assert.match(source, /No usable source URL exists\. Add a public source before launching/);
  assert.match(source, /sourceQualificationBlocksLaunch/);
});

test("native launch route requalifies drafts and blocks unqualified auto-verifiable launches", () => {
  const route = launchRoute();
  const markets = marketService();
  const validator = validation();
  const client = readFileSync("lib/services/nexid-client.ts", "utf8");
  const ui = launchUi();

  assert.match(route, /qualifyMarketDraftForLaunch/);
  assert.match(route, /const savedDraft = body\.draftId \? await getMarketDraft\(body\.draftId\) : null/);
  assert.match(route, /const baseDraft = body\.draft \?\? savedDraft \?\? null/);
  assert.match(route, /if \(body\.draftId && savedDraft\) await updateMarketDraftShape\(body\.draftId,\s*draft\)/);
  assert.match(route, /sourceQualificationBlocksLaunch\(draft\)/);
  assert.match(route, /sourceQualification:\s*draft\.sourceQualification/);
  assert.match(route, /The previous draft was temporary and was not persisted in the database/);
  assert.match(validator, /draft:\s*shapedMarketDraftSchema\.optional\(\)/);
  assert.match(client, /draft\?: ShapedMarketDraft/);
  assert.match(ui, /draft,\s*\n\s*walletAddress/);
  assert.match(markets, /assertSourceQualifiedForLaunch/);
  assert.match(markets, /Auto-verifiable markets must pass source qualification, extractor validation and dry-run settlement before launch/);
});

test("qualification reports are persisted and audited on drafts and launched markets", () => {
  const markets = marketService();
  const dbSchema = schema();
  const migration = readFileSync("prisma/migrations/20260605170000_add_source_qualification/migration.sql", "utf8");

  for (const field of [
    "sourceQualificationStatus",
    "sourceQualificationScore",
    "sourceQualificationReason",
    "sourceValidationTimestamp",
    "sourceRepairAttempts",
    "extractorValidationStatus",
    "extractorValidationReason",
    "dryRunStatus",
    "dryRunResult"
  ]) {
    assert.match(dbSchema, new RegExp(field));
    assert.match(migration, new RegExp(field));
    assert.match(markets, new RegExp(field));
  }
  assert.match(markets, /sourceQualificationAuditMetadata/);
  assert.match(markets, /action:\s*"source_qualification"/);
  assert.match(markets, /action:\s*"source_qualification_update"/);
  assert.match(markets, /sourceQualification:\s*input\.draft\.sourceQualification/);
});

test("validators and launch UI expose source quality, extractor validation, dry run and settlement mode", () => {
  const validator = validation();
  const ui = launchUi();

  assert.match(validator, /sourceQualificationSchema/);
  assert.match(validator, /settlementExtractorSchema/);
  assert.match(validator, /sourceQualification:\s*sourceQualificationSchema\.nullable\(\)\.optional\(\)/);
  assert.match(ui, /SourceQualificationPanel/);
  assert.match(ui, /evidenceBasedByDesign/);
  assert.match(ui, /Public source locked\. Automated extraction is not required for this market type\./);
  assert.match(ui, /Evidence-Based ProofFlow/);
  assert.match(ui, /Source Quality/);
  assert.match(ui, /Extractor validation/);
  assert.match(ui, /Dry run settlement/);
  assert.match(ui, /Auto-Verifiable/);
  assert.match(ui, /Evidence-Based/);
  assert.match(ui, /ly-repair-log/);
  assert.match(ui, /launchedMarketId/);
  assert.match(ui, /Market Launched/);
  assert.match(ui, /Approval[\s\S]*?Consumed/);
  assert.match(ui, /Open Market Room/);
});

test("native market deployment and sync scripts enable every supported template", () => {
  const sepoliaDeploy = readFileSync("scripts/contracts/deploy-base-sepolia.ts", "utf8");
  const mainnetDeploy = readFileSync("scripts/contracts/deploy-base-mainnet.ts", "utf8");
  const syncScript = readFileSync("scripts/contracts/set-native-market-templates.ts", "utf8");
  const pkg = readFileSync("package.json", "utf8");
  const templates = [
    "token_price_threshold",
    "token_basket_race",
    "official_announcement",
    "sports_result",
    "sports_transfer",
    "chart_rank",
    "award_outcome",
    "public_release",
    "custom_objective"
  ];

  for (const template of templates) {
    assert.match(sepoliaDeploy, new RegExp(template));
    assert.match(mainnetDeploy, new RegExp(template));
    assert.match(syncScript, new RegExp(template));
  }
  assert.match(syncScript, /allowedTemplates\(templateId\)/);
  assert.match(syncScript, /setTemplateAllowed\(templateId,\s*true\)/);
  assert.match(syncScript, /TEMPLATE_ADMIN_ROLE/);
  assert.match(pkg, /contracts:templates:base-sepolia/);
  assert.match(pkg, /contracts:templates:base-mainnet/);
});

test("approval confirmations tolerate Base allowance propagation lag", () => {
  const launch = launchUi();
  const ticket = tradeTicket();
  const helper = approvalHelper();

  assert.match(helper, /waitForAllowanceConfirmation/);
  assert.match(helper, /DEFAULT_ATTEMPTS = 8/);
  assert.match(helper, /DEFAULT_DELAY_MS = 1_500/);
  assert.match(launch, /waitForAllowanceConfirmation/);
  assert.match(launch, /Base is still reflecting the launch allowance/);
  assert.match(launch, /setConfirmedLaunchAllowance\(LAUNCH_STAKE_USDC\)/);
  assert.match(ticket, /waitForAllowanceConfirmation/);
  assert.match(ticket, /Base is still reflecting the allowance/);
  assert.match(ticket, /setConfirmedAllowance\(requiredAllowance\)/);
  assert.doesNotMatch(launch, /Try approving again from your wallet/);
  assert.doesNotMatch(ticket, /Try approving again from your wallet/);
});

test("native ticket displays projected settlement-pool payout, not shares face value", () => {
  const ticket = tradeTicket();
  const contracts = readFileSync("lib/contracts/nexmarkets.ts", "utf8");

  assert.match(contracts, /name:\s*"collateralPool"/);
  assert.match(contracts, /name:\s*"rideSharesTotal"/);
  assert.match(contracts, /name:\s*"fadeSharesTotal"/);
  assert.match(ticket, /projectNativeTradePayout/);
  assert.match(ticket, /collateralPoolQuery/);
  assert.match(ticket, /rideSharesTotalQuery/);
  assert.match(ticket, /fadeSharesTotalQuery/);
  assert.match(ticket, /Projected payout/);
  assert.match(ticket, /Market order/);
  assert.match(ticket, /Limit order/);
  assert.match(ticket, /disabled title="Native limit orders are not live yet\."/);
  assert.doesNotMatch(ticket, /payoutLabel\(quotedShares\)/);
  assert.doesNotMatch(ticket, /setOrderType/);
  assert.doesNotMatch(ticket, /orderType === "limit"/);
  assert.doesNotMatch(ticket, /Native limit orders are not available/);
});

test("frontend transaction paths use user-facing contract error messages", () => {
  const ticket = tradeTicket();
  const launch = launchUi();
  const proofFlowPanel = readFileSync("components/nexmarkets/proof-flow-panel.tsx", "utf8");
  const dashboard = readFileSync("components/nexid/dashboard/dashboard-page-client.tsx", "utf8");
  const mint = readFileSync("components/nexid/mint/mint-page-client.tsx", "utf8");
  const helper = readFileSync("lib/client/transaction-error.ts", "utf8");

  assert.match(helper, /price_impact_too_high/);
  assert.match(helper, /Trade too large for current market depth/);
  assert.match(helper, /No redeemable winning shares/);
  for (const source of [ticket, launch, proofFlowPanel, dashboard, mint]) {
    assert.match(source, /userFacingTransactionError/);
  }
  assert.doesNotMatch(ticket, /error instanceof Error \? error\.message : "Trade failed\."/);
  assert.doesNotMatch(launch, /error instanceof Error \? error\.message : "Market launch failed\."/);
  assert.doesNotMatch(proofFlowPanel, /error instanceof Error \? error\.message : "Claim transaction failed\."/);
});

test("market comments are persisted through API instead of local-only state", () => {
  const dbSchema = schema();
  const route = readFileSync("app/api/markets/[id]/comments/route.ts", "utf8");
  const service = readFileSync("lib/services/marketCommentService.ts", "utf8");
  const client = readFileSync("lib/services/nexid-client.ts", "utf8");
  const tabs = readFileSync("components/nexmarkets/market-detail-tabs.tsx", "utf8");
  const migration = readFileSync("prisma/migrations/20260606100000_add_market_comments/migration.sql", "utf8");

  assert.match(dbSchema, /model MarketComment/);
  assert.match(dbSchema, /comments\s+MarketComment\[\]/);
  assert.match(migration, /CREATE TABLE "MarketComment"/);
  assert.match(route, /listMarketComments/);
  assert.match(route, /createMarketComment/);
  assert.match(route, /getSessionUser/);
  assert.match(service, /authorLabelForUser/);
  assert.match(service, /status:\s*"visible"/);
  assert.match(client, /fetchMarketCommentsApi/);
  assert.match(client, /postMarketCommentApi/);
  assert.match(tabs, /fetchMarketCommentsApi\(marketId\)/);
  assert.match(tabs, /postMarketCommentApi\(marketId,\s*body\)/);
  assert.doesNotMatch(tabs, /id:\s*`\$\{Date\.now\(\)\}`/);
});

test("ProofFlow cron routes have hyphenated and no-hyphen aliases", () => {
  const aliases = [
    "app/api/internal/proofflow/reviews/run/route.ts",
    "app/api/internal/proofflow/refunds/run/route.ts",
    "app/api/internal/proofflow/receipts/hash/run/route.ts",
    "app/api/internal/proofflow/receipt-hash/run/route.ts",
    "app/api/internal/proof-flow/receipt-hash/run/route.ts",
    "app/api/internal/proofflow/conflicts/route.ts",
    "app/api/internal/proofflow/conflicts/run/route.ts"
  ];

  for (const file of aliases) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /proof-flow/);
    assert.match(source, /GET,\s*POST/);
  }
});

test("internal proxy allows ProofFlow cron secrets through before route auth", () => {
  const proxy = readFileSync("proxy.ts", "utf8");
  const reviewRoute = readFileSync("app/api/internal/proof-flow/reviews/run/route.ts", "utf8");
  const refundRoute = readFileSync("app/api/internal/proof-flow/refunds/run/route.ts", "utf8");
  const receiptRoute = readFileSync("app/api/internal/proof-flow/receipts/hash/run/route.ts", "utf8");

  assert.match(proxy, /function suppliedAccessToken/);
  assert.match(proxy, /request\.headers\.get\("x-cron-secret"\)/);
  assert.match(proxy, /searchParams\.get\("cronSecret"\)/);
  assert.match(proxy, /searchParams\.get\("secret"\)/);
  assert.match(proxy, /\/api\/internal\/proof-flow\/reviews\/run/);
  assert.match(proxy, /\/api\/internal\/proofflow\/reviews\/run/);
  assert.match(proxy, /PROOFFLOW_REVIEW_CRON_SECRET/);
  assert.match(proxy, /\/api\/internal\/proof-flow\/refunds\/run/);
  assert.match(proxy, /\/api\/internal\/proofflow\/refunds\/run/);
  assert.match(proxy, /PROOFFLOW_REFUND_CRON_SECRET/);
  assert.match(proxy, /\/api\/internal\/proof-flow\/receipts\/hash\/run/);
  assert.match(proxy, /\/api\/internal\/proof-flow\/receipt-hash\/run/);
  assert.match(proxy, /\/api\/internal\/proofflow\/receipts\/hash\/run/);
  assert.match(proxy, /\/api\/internal\/proofflow\/receipt-hash\/run/);
  assert.match(proxy, /PROOFFLOW_RECEIPT_HASH_CRON_SECRET/);
  assert.match(proxy, /if \(cronToken && suppliedToken === cronToken\) \{\s*return NextResponse\.next\(\);\s*\}/);
  assert.match(proxy, /const token = getInternalAdminToken\(\)/);
  assert.ok(proxy.indexOf("if (cronToken && suppliedToken === cronToken)") < proxy.indexOf("const token = getInternalAdminToken()"));
  for (const route of [reviewRoute, refundRoute, receiptRoute]) {
    assert.match(route, /searchParams\.get\("cronSecret"\)/);
    assert.match(route, /searchParams\.get\("secret"\)/);
  }
});

test("creator notifications never fall back to a global Telegram chat", () => {
  const service = readFileSync("lib/services/nexmind/nexmindNotificationService.ts", "utf8");

  assert.match(service, /telegram_chat_not_connected/);
  assert.doesNotMatch(service, /TELEGRAM_ALERT_DEFAULT_CHAT_ID/);
  assert.match(service, /chatId:\s*preference\?\.telegramChatId/);
});

test("source health alerts route prelaunch to creators and locked live markets to ops", () => {
  const service = readFileSync("lib/services/nexmind/nexmindSourceMonitorService.ts", "utf8");
  const sourceCheckRoute = readFileSync("app/api/x402/source-check/route.ts", "utf8");

  assert.match(service, /const PRE_LAUNCH_STATUSES = new Set\(\["draft", "route_check", "ready_to_launch"\]\)/);
  assert.match(service, /const LIVE_STATUSES = new Set\(\["live_pending_open", "trading_live"\]\)/);
  assert.match(service, /export function routeSourceHealthAlert/);
  assert.match(service, /target:\s*"creator_prelaunch"/);
  assert.match(service, /target:\s*"creator_action_window"/);
  assert.match(service, /target:\s*"ops_locked_live"/);
  assert.match(service, /sourceRulesLocked\(market\)/);
  assert.match(service, /sendOpsSourceHealthAlert/);
  assert.match(service, /INTERNAL_ALERT_WEBHOOK_URL/);
  assert.match(service, /TELEGRAM_ALERT_DEFAULT_CHAT_ID/);
  assert.match(service, /status:\s*\{\s*in:\s*\["draft", "route_check", "ready_to_launch", "live_pending_open", "trading_live", "closed", "result_proposed"\]\s*\}/);
  assert.match(service, /routing\.target === "creator_prelaunch" \|\| routing\.target === "creator_action_window"/);
  assert.match(service, /routing\.target === "ops_locked_live" \|\| routing\.target === "ops_settlement"/);
  assert.match(sourceCheckRoute, /status:\s*"draft"/);
});
