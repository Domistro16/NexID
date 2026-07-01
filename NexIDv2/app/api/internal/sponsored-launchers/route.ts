import { NextResponse } from "next/server";
import { DEFAULT_NEXMARKETS_CHAIN_ID } from "@/config/nexmarkets-contracts";
import { jsonError } from "@/lib/server/validation";
import {
  getSponsoredLauncherAdminSummary,
  getSponsoredLauncherAllowancesAdmin
} from "@/lib/services/sponsoredLauncherAdminService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const chainId = Number(url.searchParams.get("chainId") || DEFAULT_NEXMARKETS_CHAIN_ID);
    const wallets = url.searchParams.get("wallets") || "";
    const adminAddress = url.searchParams.get("adminAddress") || "";
    const result = wallets.trim()
      ? await getSponsoredLauncherAllowancesAdmin({ chainId, wallets, adminAddress })
      : await getSponsoredLauncherAdminSummary({ chainId, adminAddress });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}

export async function POST() {
  return NextResponse.json({
    error: "Sponsored launcher allowance updates must be signed by the connected admin wallet."
  }, { status: 405 });
}
