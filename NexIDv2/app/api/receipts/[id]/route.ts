import { NextResponse } from "next/server";
import { requireDatabase } from "@/lib/server/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = requireDatabase();
  const receipt = await db.marketReceipt.findUnique({ where: { id } });
  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }
  return NextResponse.json({ receipt });
}
