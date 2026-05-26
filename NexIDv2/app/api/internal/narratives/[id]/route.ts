import { NextResponse } from "next/server";
import { internalNarrativeCreateSchema, internalNarrativeUpdateSchema, jsonError } from "@/lib/server/validation";
import { updateNarrativeAdmin } from "@/lib/services/internalAdminService";
import { upsertNarrative } from "@/lib/services/narrativeService";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = internalNarrativeCreateSchema.parse({ ...(await request.json()), id });
    const narrative = await upsertNarrative(body);
    return NextResponse.json({ narrative });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = internalNarrativeUpdateSchema.parse(await request.json());
    const narrative = await updateNarrativeAdmin(id, body);
    return NextResponse.json({ narrative });
  } catch (error) {
    return NextResponse.json(jsonError(error), { status: 400 });
  }
}
