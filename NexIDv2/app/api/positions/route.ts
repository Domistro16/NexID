import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/services/authService";
import { listCurrentMarketPositions } from "@/lib/services/marketActivityService";

export async function GET() {
  const user = await getSessionUser();
  const positions = await listCurrentMarketPositions(user?.id);
  return NextResponse.json({ positions });
}
