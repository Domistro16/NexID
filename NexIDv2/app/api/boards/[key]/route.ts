import { NextResponse } from "next/server";
import { getBoard, normalizeBoardKey } from "@/lib/services/boardService";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  const board = await getBoard(normalizeBoardKey(key));
  return NextResponse.json({ board });
}
