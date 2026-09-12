import { prisma } from "@/lib/prisma";
import { sessionCookieName, verifyCanonicalToken, type Actor } from "@/lib/security/session";
import { isAllowedOrigin } from "@/lib/env";
function cookieValue(header: string | undefined, name: string) { return header?.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${name}=`))?.slice(name.length + 1) || null; }
export function originAllowed(origin: string | undefined) { if (!origin) return false; const configured = (process.env.DRIVO_REALTIME_ALLOWED_ORIGINS || "").split(",").map((v) => v.trim()).filter(Boolean); return configured.includes(origin) || isAllowedOrigin(origin); }
export async function authenticateHandshake(handshake: { headers: Record<string, string | string[] | undefined> }, actor: Actor) {
  const origin = typeof handshake.headers.origin === "string" ? handshake.headers.origin : undefined;
  if (!originAllowed(origin)) throw new Error("REALTIME_ORIGIN_REJECTED");
  const token = cookieValue(typeof handshake.headers.cookie === "string" ? handshake.headers.cookie : undefined, sessionCookieName(actor));
  const session = token ? await verifyCanonicalToken(token, actor) : null;
  if (!session) throw new Error("REALTIME_AUTH_REJECTED");
  if (actor === "DRIVER") { const row = await prisma.driver.findUnique({ where: { id: session.sub }, select: { id: true, status: true, authVersion: true } }); if (!row || row.status !== "ACTIVE" || row.authVersion !== session.ver) throw new Error("REALTIME_AUTH_REJECTED"); return row; }
  if (actor === "ADMIN") { const row = await prisma.adminUser.findUnique({ where: { id: session.sub }, select: { id: true, role: true, authVersion: true } }); if (!row || !row.role || row.authVersion !== session.ver) throw new Error("REALTIME_AUTH_REJECTED"); return row; }
  const row = await prisma.passenger.findUnique({ where: { id: session.sub }, select: { id: true, status: true, authVersion: true } }); if (!row || row.status !== "ACTIVE" || row.authVersion !== session.ver) throw new Error("REALTIME_AUTH_REJECTED"); return row;
}
