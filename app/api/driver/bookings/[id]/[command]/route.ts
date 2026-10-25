import { NextRequest, NextResponse } from "next/server";
import { authorizeDriver } from "@/lib/security/authorization";
import { transitionDriverBooking } from "@/lib/driver-operations";
import { DRIVER_ERROR_CODES, errorBody } from "@/lib/driver-state";
import { z } from "zod";

const BodySchema = z.object({ cashConfirmed: z.boolean().optional() }).strict();
const commands = ["enroute", "arrived", "start", "complete"] as const;
type Command = (typeof commands)[number];

function statusFor(code: string) {
  if (code === DRIVER_ERROR_CODES.BOOKING_NOT_FOUND) return 404;
  if (code === DRIVER_ERROR_CODES.TRANSACTION_UNAVAILABLE) return 503;
  if (code === DRIVER_ERROR_CODES.INVALID_TRANSITION) return 409;
  return 409;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; command: string }> },
) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  const { id, command } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id) || !commands.includes(command as Command)) {
    return NextResponse.json(errorBody(DRIVER_ERROR_CODES.INVALID_REQUEST, "Unknown driver command"), { status: 400 });
  }
  const raw = await request.text();
  let body: unknown;
  try { body = raw.trim() ? JSON.parse(raw) : {}; } catch {
    return NextResponse.json(errorBody(DRIVER_ERROR_CODES.INVALID_REQUEST, "Invalid JSON"), { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json(errorBody(DRIVER_ERROR_CODES.INVALID_REQUEST, "Invalid command request"), { status: 400 });
  const result = await transitionDriverBooking({
    bookingId: id,
    driverId: auth.actor.id,
    command: (command as Command).toUpperCase() as "ENROUTE" | "ARRIVED" | "START" | "COMPLETE",
    cashConfirmed: parsed.data.cashConfirmed,
  });
  if (!result.ok) return NextResponse.json(errorBody(result.code, result.code === DRIVER_ERROR_CODES.INVALID_REQUEST ? "Cash confirmation is required before starting" : result.code.replaceAll("_", " ")), { status: statusFor(result.code) });
  return NextResponse.json({ success: true, bookingId: id, status: result.status });
}
