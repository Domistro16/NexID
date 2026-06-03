import { NextResponse } from "next/server";
import { jsonError, notificationPreferenceSchema } from "@/lib/server/validation";
import { getSessionUser } from "@/lib/services/authService";
import { upsertNotificationPreference } from "@/lib/services/nexmind/nexmindNotificationService";

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const body = notificationPreferenceSchema.parse(await request.json());
    const preference = await upsertNotificationPreference({
      user,
      walletAddress: body.walletAddress,
      email: body.email,
      telegramHandle: body.telegramHandle ? (body.telegramHandle.startsWith("@") ? body.telegramHandle : `@${body.telegramHandle}`) : undefined,
      telegramChatId: body.telegramChatId,
      channels: body.channels
    });
    return NextResponse.json({ preference });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
