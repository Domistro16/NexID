import { NextResponse } from "next/server";
import { logoutSession } from "@/lib/services/authService";

export async function POST() {
  await logoutSession();
  return NextResponse.json({ ok: true });
}
