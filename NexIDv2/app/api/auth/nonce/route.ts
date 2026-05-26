import { NextResponse } from "next/server";
import { jsonError, walletNonceSchema } from "@/lib/server/validation";
import { createWalletNonce } from "@/lib/services/authService";

export async function GET(request: Request) {
  try {
    const walletAddress = new URL(request.url).searchParams.get("walletAddress");
    const input = walletNonceSchema.parse({ walletAddress });
    const nonce = await createWalletNonce(input.walletAddress);
    return NextResponse.json(nonce);
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
