import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  return NextResponse.json({
    error: `Legacy narrative ${slug} is retired. Use market rooms from /api/markets.`
  }, { status: 410 });
}
