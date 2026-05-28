import { NextResponse } from "next/server";

export async function PUT(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return NextResponse.json({
    error: `Legacy narrative admin updates are retired for ${id}. Use NexMarkets launch and market records.`
  }, { status: 410 });
}

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return NextResponse.json({
    error: `Legacy narrative admin updates are retired for ${id}. Use NexMarkets launch and market records.`
  }, { status: 410 });
}
