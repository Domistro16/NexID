import { NextResponse } from "next/server";
import { cleanReferralCode } from "@/lib/referrals";
import { idNameSchema, jsonError } from "@/lib/server/validation";
import { requireSessionUser } from "@/lib/services/authService";
import { completeIdMintWithClaimableBalance, mintIdName, prepareIdMint, prepareIdMintWithClaimableBalance } from "@/lib/services/idService";
import { normalizePayMode } from "@/lib/services/claimableBalanceService";
import { pointsForIdMint, recordPointsEvent } from "@/lib/services/pointsEngine";
import { recordReferralMint } from "@/lib/services/referralService";
import type { AuthUser } from "@/lib/types/nexid";

async function recordMintCompletion(input: {
  user: AuthUser;
  id: {
    name: string;
    price?: number | { usd?: number };
    payment?: { creditUsd?: number };
    referral?: { code: string; active: boolean };
  };
  referralCode?: string | null;
}) {
  await recordPointsEvent({ userId: input.user.id, reason: "id_minted", points: pointsForIdMint(), metadata: { name: input.id.name } });
  const referralCode = input.id.referral ? input.id.referral.active ? input.id.referral.code : null : input.referralCode;
  if (referralCode) {
    const mintPrice = typeof input.id.price === "number" ? input.id.price : input.id.price?.usd ?? 0;
    await recordReferralMint({
      referrerIdName: referralCode,
      mintName: input.id.name,
      mintPrice,
      referredUserId: input.user.id
    }).catch(() => undefined);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = idNameSchema.parse(await request.json());
    const referralCode = cleanReferralCode(body.referralCode);
    const payMethod = body.payMethod ?? "Wallet";
    if (!body.txHash) {
      if (normalizePayMode(payMethod) !== "wallet") {
        const id = await prepareIdMintWithClaimableBalance(body.name, payMethod, user.walletAddress, user.id, referralCode);
        if (id.status === "active") await recordMintCompletion({ user, id, referralCode });
        return NextResponse.json({ id });
      }
      const id = await prepareIdMint(body.name, user.walletAddress, user.id, referralCode, payMethod);
      return NextResponse.json({ id });
    }
    if (normalizePayMode(payMethod) !== "wallet") {
      const id = await completeIdMintWithClaimableBalance({
        nameInput: body.name,
        payMethod,
        owner: user.walletAddress,
        userId: user.id,
        walletPaymentTxHash: body.txHash,
        checkoutReferenceId: body.checkoutReferenceId
      });
      await recordMintCompletion({ user, id, referralCode });
      return NextResponse.json({ id });
    }
    const id = await mintIdName(body.name, payMethod, user.id, body.txHash);
    await recordMintCompletion({ user, id, referralCode });
    return NextResponse.json({ id });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
