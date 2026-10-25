import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizePassenger } from "@/lib/passenger-auth";
import { savedRouteSelect, saveRouteFromBooking } from "@/lib/saved-routes";

const input = z.object({ bookingId: z.string().regex(/^[a-f\d]{24}$/i), saveAlways: z.boolean().default(false) }).strict();
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const auth = await authorizePassenger(request);
  if (!auth.ok) return auth.response;
  const [passenger, routes] = await Promise.all([
    prisma.passenger.findUnique({ where: { id: auth.actor.id }, select: { autoSaveRoutes: true } }),
    prisma.savedRoute.findMany({ where: { passengerId: auth.actor.id }, select: savedRouteSelect, orderBy: { updatedAt: "desc" }, take: 25 }),
  ]);
  return NextResponse.json({ success: true, autoSaveRoutes: Boolean(passenger?.autoSaveRoutes), routes }, { headers: privateHeaders });
}

export async function POST(request: NextRequest) {
  const auth = await authorizePassenger(request);
  if (!auth.ok) return auth.response;
  let json: unknown;
  try { json = await request.json(); } catch { return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 }); }
  const parsed = input.safeParse(json);
  if (!parsed.success) return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
  try {
    const result = await prisma.$transaction(async (tx) => {
      // The request supplies no route fields. The booking and owner are re-read from DB.
      const booking = await tx.booking.findFirst({ where: {
        id: parsed.data.bookingId, passengerId: auth.actor.id, phoneVerified: true,
        passengerAuthStatus: "AUTHENTICATED", bookingSource: "WEB",
      } });
      if (!booking) return { ok: false as const, code: "BOOKING_NOT_FOUND" };
      const saved = await saveRouteFromBooking(auth.actor.id, booking, tx);
      if (!saved.ok) return saved;
      if (parsed.data.saveAlways) await tx.passenger.update({ where: { id: auth.actor.id }, data: { autoSaveRoutes: true } });
      return { ok: true as const };
    });
    if (!result.ok) return NextResponse.json({ success: false, code: result.code }, { status: result.code === "BOOKING_NOT_FOUND" ? 404 : 409, headers: privateHeaders });
    return NextResponse.json({ success: true, autoSaveRoutes: parsed.data.saveAlways }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ success: false, code: "SAVE_FAILED" }, { status: 503, headers: privateHeaders });
  }
}
