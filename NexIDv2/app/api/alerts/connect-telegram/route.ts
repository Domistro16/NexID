import { NextResponse } from "next/server";
import { jsonError, telegramAlertConnectSchema } from "@/lib/server/validation";
import { getSessionUser } from "@/lib/services/authService";
import { withDatabase } from "@/lib/server/db";

export async function POST(request: Request) {
  try {
    const body = telegramAlertConnectSchema.parse(await request.json());
    const user = await getSessionUser();
    await withDatabase(
      async (db) => {
        await db.analyticsEvent.create({
          data: {
            name: "telegram_alert_connect_requested",
            userId: user?.id,
            metadata: {
              telegramHandle: body.telegramHandle.startsWith("@") ? body.telegramHandle : `@${body.telegramHandle}`,
              walletAddress: body.walletAddress ?? user?.walletAddress ?? null
            }
          }
        });
        return true;
      },
      async () => true
    );
    return NextResponse.json({ ok: true, status: "requested" });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
