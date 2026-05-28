import { NextResponse } from "next/server";
import { getPublicPassportProfile } from "@/lib/services/passportProfileService";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const profile = await getPublicPassportProfile(name);
  if (!profile) return NextResponse.json({ error: "Passport not found" }, { status: 404 });
  return NextResponse.json({ profile });
}
