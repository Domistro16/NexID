import { NextResponse } from "next/server";
import { getAllBoards } from "@/lib/services/boardService";

export const dynamic = "force-dynamic";

export async function GET() {
  const boards = await getAllBoards();
  return NextResponse.json({ boards });
}
