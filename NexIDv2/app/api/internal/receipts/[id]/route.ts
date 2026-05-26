import { NextResponse } from "next/server";
import { internalReceiptUpdateSchema, jsonError } from "@/lib/server/validation";
import { updateReceiptAdmin } from "@/lib/services/internalAdminService";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = internalReceiptUpdateSchema.parse(await request.json());
    const receipt = await updateReceiptAdmin(id, body);
    return NextResponse.json({ receipt });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
