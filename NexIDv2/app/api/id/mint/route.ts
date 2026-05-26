import { NextResponse } from "next/server";
import { cleanReferralCode } from "@/lib/referrals";
import { idNameSchema, jsonError } from "@/lib/server/validation";
import { requireSessionUser } from "@/lib/services/authService";
import { mintIdName, prepareIdMint } from "@/lib/services/idService";
import { pointsForIdMint, recordPointsEvent } from "@/lib/services/pointsEngine";
import { recordReferralMint } from "@/lib/services/referralService";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = idNameSchema.parse(await request.json());
    const referralCode = cleanReferralCode(body.referralCode);
    if (!body.txHash) {
      const id = await prepareIdMint(body.name, user.walletAddress, user.id, referralCode);
      return NextResponse.json({ id });
    }
    const id = await mintIdName(body.name, body.payMethod ?? "USDC", user.id, body.txHash);
    await recordPointsEvent({ userId: user.id, reason: "id_minted", points: pointsForIdMint(), metadata: { name: id.name } });
    if (referralCode) {
      await recordReferralMint({
        referrerIdName: referralCode,
        mintName: id.name,
        mintPrice: id.price,
        referredUserId: user.id
      }).catch(() => undefined);
    }
    return NextResponse.json({ id });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
