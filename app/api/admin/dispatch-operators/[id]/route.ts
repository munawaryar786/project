import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/security/authorization";
import { isValidE164Phone, normalizePassengerPhone, validatePassengerPassword } from "@/lib/passenger-auth";
import { authRateLimitResponse, enforceAuthRateLimit, resolveClientIp } from "@/lib/rate-limit";

const PatchSchema = z.object({ fullName: z.string().trim().min(2).max(120).optional(), email: z.string().trim().toLowerCase().email().max(254).optional(), phone: z.string().trim().min(8).max(40).optional(), status: z.enum(["ACTIVE", "DISABLED"]).optional(), temporaryPassword: z.string().min(12).max(128).optional() }).strict();
function safe(operator: any) { return { id: operator.id, fullName: operator.fullName, email: operator.email, phone: operator.phone, status: operator.status, mustChangePassword: operator.mustChangePassword, lastLoginAt: operator.lastLoginAt, createdByAdminId: operator.createdByAdminId, createdAt: operator.createdAt, updatedAt: operator.updatedAt }; }

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRole(request, ["SUPER_ADMIN"]); if (!auth.ok) return auth.response;
  const { id } = await params; if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const operator = await prisma.dispatchOperator.findUnique({ where: { id } });
  return operator ? NextResponse.json({ operator: safe(operator) }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

async function updateDispatchOperator(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRole(request, ["SUPER_ADMIN"]); if (!auth.ok) return auth.response;
  const { id } = await params; if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !Object.keys(parsed.data || {}).length) return NextResponse.json({ error: "Invalid operator update" }, { status: 400 });
  const data = parsed.data;
  if (data.temporaryPassword) { const passwordError = validatePassengerPassword(data.temporaryPassword); if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 }); }
  const normalizedPhone = data.phone ? normalizePassengerPhone(data.phone) : undefined;
  if (normalizedPhone && !isValidE164Phone(normalizedPhone)) return NextResponse.json({ error: "Enter a valid international phone number" }, { status: 400 });
  try {
    const current = await prisma.dispatchOperator.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updateData: any = {};
    const changedFields: string[] = [];
    if (data.fullName !== undefined && data.fullName !== current.fullName) { updateData.fullName = data.fullName; changedFields.push("fullName"); }
    if (data.email !== undefined && data.email !== current.email) { updateData.email = data.email; changedFields.push("email"); }
    if (data.phone !== undefined && normalizedPhone && data.phone !== current.phone) { updateData.phone = data.phone; updateData.normalizedPhone = normalizedPhone; changedFields.push("phone"); }
    const actions: string[] = [];
    if (changedFields.length) actions.push("DISPATCH_OPERATOR_UPDATED");
    if (data.status && data.status !== current.status) { updateData.status = data.status; actions.push(data.status === "DISABLED" ? "DISPATCH_OPERATOR_DISABLED" : "DISPATCH_OPERATOR_ENABLED"); }
    if (data.temporaryPassword) { updateData.passwordHash = await bcrypt.hash(data.temporaryPassword, 12); updateData.mustChangePassword = true; actions.push("DISPATCH_OPERATOR_PASSWORD_RESET"); }
    if (data.status === "DISABLED" || data.temporaryPassword) updateData.authVersion = { increment: 1 };
    if (!Object.keys(updateData).length) return NextResponse.json({ success: true, operator: safe(current) });
    const operator = await prisma.$transaction(async (tx) => {
      const saved = await tx.dispatchOperator.update({ where: { id }, data: updateData });
      for (const action of actions) await tx.adminAuditEvent.create({ data: { adminId: auth.actor.id, action, targetType: "DispatchOperator", targetId: id, reason: action === "DISPATCH_OPERATOR_UPDATED" ? "Updated Dispatch Operator profile" : action.replaceAll("_", " "), requestId: randomUUID(), outcome: "SUCCESS", safeMetadata: action === "DISPATCH_OPERATOR_UPDATED" ? { changedFields } : { status: saved.status } } });
      return saved;
    });
    return NextResponse.json({ success: true, operator: safe(operator) });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Email or phone is already registered" }, { status: 409 });
    return NextResponse.json({ error: "Could not update Dispatch Operator" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limited = await enforceAuthRateLimit({ domain: "admin-dispatch-operator-update", identities: [{ dimension: "ip", value: resolveClientIp(request), max: 20, windowMs: 15 * 60 * 1000 }] });
  if (!limited.allowed) return authRateLimitResponse(limited);
  return updateDispatchOperator(request, context);
}
