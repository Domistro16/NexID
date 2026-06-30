const USDC_SCALE_NUMBER = 1_000_000;

export function numberToUsdcUnits(value: number) {
  if (!Number.isFinite(value) || value <= 0) return BigInt(0);
  const units = Math.round(value * USDC_SCALE_NUMBER);
  if (!Number.isSafeInteger(units)) {
    throw new Error("USDC amount is too large.");
  }
  return BigInt(Math.max(0, units));
}

export function usdcUnitsToNumber(value: bigint) {
  return Number(value) / USDC_SCALE_NUMBER;
}

export function normalizeUsdcAmount(value: number, min = 0) {
  const normalized = usdcUnitsToNumber(numberToUsdcUnits(value));
  return Math.max(min, normalized);
}
