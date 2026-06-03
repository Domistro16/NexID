import { NextResponse } from "next/server";
import { jsonError, telegramAlertConnectSchema } from "@/lib/server/validation";
import { getSessionUser } from "@/lib/services/authService";
import { withDatabase } from "@/lib/server/db";
import { createTelegramConnection, getTelegramConnectionStatus } from "@/lib/services/nexmind/telegramAlertService";

export async function GET() {
  try {
    const user = await getSessionUser();
    return NextResponse.json(await getTelegramConnectionStatus(user));
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = telegramAlertConnectSchema.parse(await request.json());
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const connection = await createTelegramConnection({ user, walletAddress: body.walletAddress });
    await withDatabase(
      async (db) => {
        await db.analyticsEvent.create({
          data: {
            name: "telegram_alert_connect_requested",
            userId: user?.id,
            metadata: {
              telegramHandle: body.telegramHandle ? (body.telegramHandle.startsWith("@") ? body.telegramHandle : `@${body.telegramHandle}`) : null,
              walletAddress: body.walletAddress ?? user?.walletAddress ?? null
            }
          }
        });
        return true;
      },
      async () => true
    );
    return NextResponse.json(connection);
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
