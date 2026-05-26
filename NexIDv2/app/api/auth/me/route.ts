import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/services/authService";

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user });
}
