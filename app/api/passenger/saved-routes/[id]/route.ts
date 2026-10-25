import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizePassenger } from "@/lib/passenger-auth";
import { editedRouteFields, savedRouteSelect } from "@/lib/saved-routes";

const objectId = /^[a-f\d]{24}$/i;
const editInput = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  pickupAddress: z.string().trim().min(3).max(240).optional(),
  dropoffAddress: z.string().trim().min(3).max(240).optional(),
  serviceType: z.enum(["STANDARD", "ACCESSIBLE", "SENIOR", "AIRPORT", "CHILDREN"]).optional(),
  passengerCount: z.number().int().min(1).max(6).optional(),
  smallBags: z.number().int().min(0).max(12).optional(),
  largeBags: z.number().int().min(0).max(12).optional(),
  airline: z.string().trim().max(80).nullable().optional(),
  waitAndGreet: z.boolean().optional(),
}).strict().refine((v) => Object.keys(v).length > 0);
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const auth = await authorizePassenger(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!objectId.test(id)) return NextResponse.json({ code: "ROUTE_NOT_FOUND" }, { status: 404 });
  const route = await prisma.savedRoute.findFirst({ where: { id, passengerId: auth.actor.id }, select: savedRouteSelect });
  if (!route) return NextResponse.json({ code: "ROUTE_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ success: true, route }, { headers });
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const auth = await authorizePassenger(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!objectId.test(id)) return NextResponse.json({ code: "ROUTE_NOT_FOUND" }, { status: 404 });
  let json: unknown;
  try { json = await request.json(); } catch { return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 }); }
  const parsed = editInput.safeParse(json);
  if (!parsed.success) return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
  const current = await prisma.savedRoute.findFirst({ where: { id, passengerId: auth.actor.id } });
  if (!current) return NextResponse.json({ code: "ROUTE_NOT_FOUND" }, { status: 404 });
  const fields = editedRouteFields(current, parsed.data);
  if (!fields) return NextResponse.json({ code: "ROUTE_NOT_ELIGIBLE" }, { status: 409 });
  try {
    const updated = await prisma.savedRoute.updateMany({ where: { id, passengerId: auth.actor.id }, data: fields });
    if (updated.count !== 1) return NextResponse.json({ code: "ROUTE_NOT_FOUND" }, { status: 404 });
    const route = await prisma.savedRoute.findFirst({ where: { id, passengerId: auth.actor.id }, select: savedRouteSelect });
    return NextResponse.json({ success: true, route }, { headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ code: "ROUTE_EXISTS" }, { status: 409 });
    }
    return NextResponse.json({ code: "SAVE_FAILED" }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const auth = await authorizePassenger(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!objectId.test(id)) return NextResponse.json({ code: "ROUTE_NOT_FOUND" }, { status: 404 });
  const deleted = await prisma.savedRoute.deleteMany({ where: { id, passengerId: auth.actor.id } });
  if (deleted.count !== 1) return NextResponse.json({ code: "ROUTE_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ success: true }, { headers });
}
