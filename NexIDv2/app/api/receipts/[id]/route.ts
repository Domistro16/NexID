import { NextResponse } from "next/server";
import { getReceiptById } from "@/lib/services/receiptService";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const receipt = await getReceiptById(id);
  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }
  return NextResponse.json({ receipt });
}
