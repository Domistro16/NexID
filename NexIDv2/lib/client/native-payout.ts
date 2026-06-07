type ProjectNativeTradePayoutInput = {
  collateralPool: bigint;
  sideSharesTotal: bigint;
  tradeNotional: bigint;
  tradeShares: bigint;
};

export function projectNativeTradePayout(input: ProjectNativeTradePayoutInput) {
  if (input.tradeShares <= BigInt(0)) return BigInt(0);
  const projectedSettlementPool = input.collateralPool + input.tradeNotional;
  const projectedWinnerShares = input.sideSharesTotal + input.tradeShares;
  if (projectedWinnerShares <= BigInt(0)) return BigInt(0);
  return (projectedSettlementPool * input.tradeShares) / projectedWinnerShares;
}
