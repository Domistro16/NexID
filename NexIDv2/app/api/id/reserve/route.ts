import { NextResponse } from "next/server";
import { jsonError, idNameSchema } from "@/lib/server/validation";
import { requireSessionUser } from "@/lib/services/authService";
import { reserveIdName } from "@/lib/services/idService";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = idNameSchema.pick({ name: true }).parse(await request.json());
    const reservation = await reserveIdName(body.name, user.id);
    return NextResponse.json({ reservation });
  } catch (error) {
    const message = jsonError(error);
    return NextResponse.json(message, { status: message.error === "Authentication required" ? 401 : 400 });
  }
}
