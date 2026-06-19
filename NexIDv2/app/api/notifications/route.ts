import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/services/authService";
import { createCreatorNotification, listCreatorNotifications } from "@/lib/services/nexmind/nexmindNotificationService";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ notifications: [] });
  return NextResponse.json({ notifications: await listCreatorNotifications(user) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { marketId, type, title, body, metadata } = await request.json();
    const result = await createCreatorNotification({
      userId: user.id,
      walletAddress: user.walletAddress,
      marketId,
      type: type || "source_issue",
      title,
      body,
      metadata
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create notification";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
