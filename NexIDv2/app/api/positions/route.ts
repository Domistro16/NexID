import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/services/authService";
import { listPositions } from "@/lib/services/positionService";

export async function GET() {
  const user = await getSessionUser();
  const positions = await listPositions(user?.id);
  return NextResponse.json({ positions });
}
