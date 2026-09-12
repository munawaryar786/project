import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeDriver } from "@/lib/security/authorization";
import { acceptDriverOfferAtomically, declineDriverOffer } from "@/lib/driver-operations";
import { advanceDispatch } from "@/lib/automatic-dispatch";
import { DRIVER_ERROR_CODES, errorBody } from "@/lib/driver-state";


const RespondSchema = z.object({
  requestId: z.string().regex(/^[a-f0-9]{24}$/i),
  action: z.enum(["ACCEPT", "DECLINE", "REJECT"]),
}).strict();

function statusFor(code: string) {
  if (code === DRIVER_ERROR_CODES.OFFER_NOT_FOUND) return 404;
  if (code === DRIVER_ERROR_CODES.TRANSACTION_UNAVAILABLE) return 503;
  if (code === DRIVER_ERROR_CODES.CONFLICTING_ACTIVE_TRIP || code === DRIVER_ERROR_CODES.DRIVER_NOT_AVAILABLE || code === DRIVER_ERROR_CODES.BOOKING_ALREADY_CLAIMED) return 409;
  return 409;
}

export async function PATCH(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  const parsed = RespondSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(errorBody(DRIVER_ERROR_CODES.INVALID_REQUEST, "Invalid ride offer response"), { status: 400 });
  const { requestId, action } = parsed.data;
  const result = action === "ACCEPT"
    ? await acceptDriverOfferAtomically({ offerId: requestId, driverId: auth.actor.id })
    : await declineDriverOffer(requestId, auth.actor.id);
  if (!result.ok) return NextResponse.json(errorBody(result.code, result.code.replaceAll("_", " ")), { status: statusFor(result.code) });
  if (action !== "ACCEPT") {
    const advancement = result.bookingId ? await advanceDispatch(result.bookingId) : null;
    return NextResponse.json({ success: true, action: "DECLINED", offerId: requestId, dispatch: advancement?.ok ? advancement.outcome : "ADVANCEMENT_PENDING" });
  }
  return NextResponse.json({ success: true, action: "ACCEPTED", offerId: requestId, bookingId: result.bookingId });
}
