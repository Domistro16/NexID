import { NextResponse } from "next/server";
import { getGlobalPointsBoard } from "@/lib/services/pointsEngine";

export async function GET() {
  const board = await getGlobalPointsBoard();
  return NextResponse.json({ board });
}
