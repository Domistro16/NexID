import { NextResponse } from "next/server";
import { jsonError, walletAuthSchema } from "@/lib/server/validation";
import { upsertWalletUser } from "@/lib/services/authService";

export async function POST(request: Request) {
  try {
    const body = walletAuthSchema.parse(await request.json());
    const user = await upsertWalletUser(body);
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
