import { NextResponse } from "next/server";
import { createBoardSnapshot, normalizeBoardKey } from "@/lib/services/boardService";
import { jsonError } from "@/lib/server/validation";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await context.params;
    const snapshot = await createBoardSnapshot(normalizeBoardKey(key));
    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
