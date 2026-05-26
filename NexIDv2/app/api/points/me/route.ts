import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/services/authService";
import { getMyPoints } from "@/lib/services/pointsEngine";

export async function GET() {
  const user = await getSessionUser();
  const points = await getMyPoints(user?.id);
  return NextResponse.json({
    points
  });
}
