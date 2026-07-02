import { NextResponse } from "next/server";
import { syncNativeMarketFactoryEvents } from "@/lib/services/nativeMarketIndexerService";
import { jsonError } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const chainId = Number(url.searchParams.get("chainId") ?? "");
    const fromBlockParam = url.searchParams.get("fromBlock");
    const fromBlock = fromBlockParam && /^\d+$/.test(fromBlockParam) ? BigInt(fromBlockParam) : undefined;
    const toBlockParam = url.searchParams.get("toBlock");
    const toBlock = toBlockParam && /^\d+$/.test(toBlockParam) ? BigInt(toBlockParam) : undefined;
    const result = await syncNativeMarketFactoryEvents({
      chainId: Number.isFinite(chainId) && chainId > 0 ? chainId : undefined,
      fromBlock,
      toBlock
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
