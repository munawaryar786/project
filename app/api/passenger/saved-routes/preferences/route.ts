import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizePassenger } from "@/lib/passenger-auth";

const settingsInput = z.object({ autoSaveRoutes: z.boolean() }).strict();
export async function PATCH(request: NextRequest) {
  const auth = await authorizePassenger(request);
  if (!auth.ok) return auth.response;
  let json: unknown;
  try { json = await request.json(); } catch { return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 }); }
  const parsed = settingsInput.safeParse(json);
  if (!parsed.success) return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
  const passenger = await prisma.passenger.update({
    where: { id: auth.actor.id }, data: { autoSaveRoutes: parsed.data.autoSaveRoutes },
    select: { autoSaveRoutes: true },
  });
  return NextResponse.json({ success: true, autoSaveRoutes: passenger.autoSaveRoutes }, { headers: { "Cache-Control": "private, no-store" } });
}
