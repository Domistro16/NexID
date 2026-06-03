import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/services/authService";
import { listCreatorNotifications } from "@/lib/services/nexmind/nexmindNotificationService";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ notifications: [] });
  return NextResponse.json({ notifications: await listCreatorNotifications(user) });
}
