import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/services/authService";
import { resolvePolymarketTradingAccount } from "@/lib/services/polymarketAccountService";
import { jsonError } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    const resolution = await resolvePolymarketTradingAccount(user, refresh);
    return NextResponse.json(resolution);
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
