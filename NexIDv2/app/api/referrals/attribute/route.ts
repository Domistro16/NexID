import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/services/authService";
import { jsonError } from "@/lib/server/validation";
import { recordReferralMint } from "@/lib/services/referralService";

const attributionSchema = z.object({
  referrerIdName: z.string().min(1),
  mintName: z.string().min(1),
  mintPrice: z.coerce.number().nonnegative()
});

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const body = attributionSchema.parse(await request.json());
    const referral = await recordReferralMint({ ...body, referredUserId: user?.id });
    return NextResponse.json({ referral });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
