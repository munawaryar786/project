import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizeDriver } from "@/lib/security/authorization";

const AvailabilitySchema = z.object({
  isOnline: z.boolean(),
  driverId: z.string().optional(),
}).strict();

export async function PATCH(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  try {
    const parsed = AvailabilitySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid availability request" }, { status: 400 });
    const driver = await prisma.driver.update({
      where: { id: auth.actor.id },
      data: { isOnline: parsed.data.isOnline, lastLocationUpdate: new Date() },
      select: { id: true, fullName: true, isOnline: true },
    });
    return NextResponse.json({ success: true, driver });
  } catch {
    return NextResponse.json({ error: "Failed to update availability" }, { status: 500 });
  }
}
