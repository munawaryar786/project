import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";
import type { CanonicalSession } from "@/lib/security/session";

// Shared HTTP/realtime authority. A valid JWT is not a live database session.
export async function loadActivePassengerSession(payload: CanonicalSession) {
  if (payload.actor !== "PASSENGER" || !payload.sid || !payload.jti ||
      !/^[a-f0-9]{24}$/i.test(payload.sid) || !/^[a-f0-9]{24}$/i.test(payload.sub) ||
      !payload.exp || payload.exp * 1000 <= Date.now()) return null;
  const session = await prisma.passengerSession.findFirst({ where: {
    id: payload.sid, passengerId: payload.sub,
    tokenHash: createHash("sha256").update(payload.jti).digest("hex"),
    expiresAt: { gt: new Date() }, OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }],
  } });
  if (!session) return null;
  const passenger = await prisma.passenger.findUnique({ where: { id: payload.sub } });
  if (!passenger || passenger.status !== "ACTIVE" || (passenger.authVersion ?? 0) !== payload.ver) return null;
  return { passenger, session };
}

export function passengerSessionRoom(passengerId: string, sessionId: string) {
  return `passenger:${passengerId}:session:${sessionId}`;
}
export async function activePassengerRealtimeRooms(passengerId: string) {
  const passenger = await prisma.passenger.findUnique({ where: { id: passengerId }, select: { status: true } });
  if (!passenger || passenger.status !== "ACTIVE") return [];
  const sessions = await prisma.passengerSession.findMany({ where: {
    passengerId, expiresAt: { gt: new Date() }, OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }],
  }, select: { id: true } });
  return sessions.map(session => passengerSessionRoom(passengerId, session.id));
}
