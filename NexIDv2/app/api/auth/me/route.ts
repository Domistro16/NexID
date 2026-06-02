import { NextResponse } from "next/server";
import { getSessionUser, refreshCurrentSession } from "@/lib/services/authService";

export async function GET() {
  const user = await getSessionUser();
  if (user) await refreshCurrentSession();
  return NextResponse.json({ user });
}
