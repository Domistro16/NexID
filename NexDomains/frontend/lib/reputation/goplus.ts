import { GOPLUS_API_BASE, CHAIN_IDS } from "./constants";
import type { GoPlusResponse } from "./types";

export async function checkAddressSecurity(
  address: string,
  chainId: string = CHAIN_IDS.BASE_MAINNET
): Promise<GoPlusResponse> {
  const url = `${GOPLUS_API_BASE}/address_security/${address}?chain_id=${chainId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    next: {
      revalidate: 86400, // Cache for 24 hours
    },
  });

  if (!response.ok) {
    throw new Error(`GoPlus API error: ${response.status}`);
  }

  return response.json();
}
