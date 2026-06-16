import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = () => readFileSync("components/nexmarkets/markets/markets-page.tsx", "utf8");
const styles = () => readFileSync("app/nexmarkets-overhaul.css", "utf8");

test("markets view derives closed display status before rendering prices", () => {
  const source = page();

  assert.match(source, /function effectiveDisplayStatus\(market: NexMarket, now = Date\.now\(\)\)/);
  assert.match(source, /CLIENT_CLOSEABLE_MARKET_STATUSES[\s\S]*live_pending_open[\s\S]*trading_live/);
  assert.match(source, /return "closed";/);
  assert.match(source, /const \[now, setNow\] = useState\(\(\) => Date\.now\(\)\);/);
  assert.match(source, /window\.setInterval\(\(\) => setNow\(Date\.now\(\)\), 30000\)/);
  assert.match(source, /markets\.map\(\(market\) => toMarketView\(market, now\)\)/);
  assert.match(source, /const marketForUi = status === market\.status \? market : \{ \.\.\.market, status \};/);
  assert.match(source, /marketUiSummary\(marketForUi, volume, market\.nativeStats \?\? undefined\)/);
  assert.match(source, /source: marketForUi/);
});

test("markets view does not hardcode open actions for closed markets", () => {
  const source = page();

  assert.match(source, /function StatusPill/);
  assert.match(source, /nmx179-open \$\{market\.statusClass\}/);
  assert.match(source, /const canTrade = status === "trading_live";/);
  assert.match(source, /\{market\.canTrade \? "Open" : "View"\}/);
  assert.match(source, /\{market\.canTrade \? "Open" : market\.statusLabel\}/);
  assert.match(source, /disabled=\{!market\.canTrade\}[\s\S]*<b>\{pct\(market\.yes \?\? market\.price\)\}<\/b>/);
  assert.match(source, /disabled=\{!market\.canTrade\}[\s\S]*<b>\{pct\(market\.no\)\}<\/b>/);
  assert.doesNotMatch(source, /className="nmx179-open">Open/);
});

test("markets view styles closed and disabled states distinctly", () => {
  const css = styles();

  assert.match(css, /\.nmx179-open\.closed/);
  assert.match(css, /\.nmx179-open\.live-pending-open/);
  assert.match(css, /body\.nmx137-markets-active \.nmx185-open\.closed/);
  assert.match(css, /body\.nmx137-markets-active \.nmx185-trade:disabled/);
});
