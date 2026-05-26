import { NextResponse } from "next/server";
import { jsonError, walletVerifySchema } from "@/lib/server/validation";
import { verifyWalletAndCreateSession } from "@/lib/services/authService";

export async function POST(request: Request) {
  try {
    const body = walletVerifySchema.parse(await request.json());
    const user = await verifyWalletAndCreateSession(body);
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 401 });
  }
}
