import { NextResponse } from "next/server";
import { jsonError } from "@/lib/server/validation";
import { getSessionUser } from "@/lib/services/authService";
import { markCreatorNotificationRead } from "@/lib/services/nexmind/nexmindNotificationService";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    const { id } = await params;
    const notification = await markCreatorNotificationRead({ id, user });
    return NextResponse.json({ notification });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
