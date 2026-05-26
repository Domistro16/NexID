import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/services/authService";
import { getDashboardSnapshot } from "@/lib/services/dashboardService";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ dashboard: await getDashboardSnapshot(user) });
}
