export function assertX402Access(request: Request) {
  const secret = process.env.NEXMARKETS_X402_SHARED_SECRET?.trim();
  if (!secret) return;
  const supplied =
    request.headers.get("x-nexmarkets-x402-secret")?.trim() ||
    request.headers.get("x-bankr-x402-secret")?.trim();
  if (supplied !== secret) {
    throw new Error("Paid endpoint access denied.");
  }
}

export function paidEndpointMetadata(name: string, priceUsd: number) {
  return {
    endpoint: name,
    x402: {
      expectedProxy: "Bankr x402 Cloud",
      priceUsd,
      settlement: "USDC on Base",
      authHeader: "x-nexmarkets-x402-secret"
    }
  };
}
