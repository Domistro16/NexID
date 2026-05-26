import { NextResponse } from "next/server";
import { internalReferralUpdateSchema, jsonError } from "@/lib/server/validation";
import { updateReferralAdmin } from "@/lib/services/internalAdminService";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = internalReferralUpdateSchema.parse(await request.json());
    const referral = await updateReferralAdmin(id, body);
    return NextResponse.json({ referral });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
