import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizeDispatchOperator } from "@/lib/security/authorization";
import { createCanonicalToken, setSessionCookies } from "@/lib/security/session";
import { validatePassengerPassword } from "@/lib/passenger-auth";
import { recordDispatchAudit } from "@/lib/dispatch-audit";

const Schema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(12).max(128) }).strict();

export async function POST(request: NextRequest) {
  const auth = await authorizeDispatchOperator(request, { allowPasswordChange: true });
  if (!auth.ok) return auth.response;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid password request" }, { status: 400 });
  const error = validatePassengerPassword(parsed.data.newPassword);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!(await bcrypt.compare(parsed.data.currentPassword, auth.actor.passwordHash))) return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  try {
    const updated = await prisma.dispatchOperator.update({ where: { id: auth.actor.id }, data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12), mustChangePassword: false, authVersion: { increment: 1 } } });
    await recordDispatchAudit({ actorType: "DISPATCH_OPERATOR", actorId: updated.id, action: "DISPATCH_OPERATOR_PASSWORD_CHANGED", targetType: "DispatchOperator", targetId: updated.id, outcome: "SUCCESS" });
    const session = await createCanonicalToken({ sub: updated.id, actor: "DISPATCH_OPERATOR", role: "DISPATCH_OPERATOR", ver: updated.authVersion });
    const response = NextResponse.json({ success: true, mustChangePassword: false });
    setSessionCookies(response, "DISPATCH_OPERATOR", session);
    return response;
  } catch {
    return NextResponse.json({ error: "Password could not be changed" }, { status: 500 });
  }
}
