import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/security/authorization";
import { isValidE164Phone, normalizePassengerPhone, validatePassengerPassword } from "@/lib/passenger-auth";
import { withDistributedIpRateLimit } from "@/lib/rate-limit";

const CreateSchema = z.object({ fullName: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email().max(254), phone: z.string().trim().min(8).max(40), temporaryPassword: z.string().min(12).max(128) }).strict();

function safe(operator: any) {
  return { id: operator.id, fullName: operator.fullName, email: operator.email, phone: operator.phone, status: operator.status, mustChangePassword: operator.mustChangePassword, lastLoginAt: operator.lastLoginAt, createdByAdminId: operator.createdByAdminId, createdAt: operator.createdAt, updatedAt: operator.updatedAt };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminRole(request, ["SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const operators = await prisma.dispatchOperator.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return NextResponse.json({ operators: operators.map(safe) });
}

async function createDispatchOperator(request: NextRequest) {
  const auth = await requireAdminRole(request, ["SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid operator details", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  const passwordError = validatePassengerPassword(parsed.data.temporaryPassword);
  const normalizedPhone = normalizePassengerPhone(parsed.data.phone);
  if (passwordError || !isValidE164Phone(normalizedPhone)) return NextResponse.json({ error: passwordError || "Enter a valid international phone number" }, { status: 400 });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const operator = await tx.dispatchOperator.create({ data: { fullName: parsed.data.fullName, email: parsed.data.email, phone: parsed.data.phone, normalizedPhone, passwordHash: await bcrypt.hash(parsed.data.temporaryPassword, 12), mustChangePassword: true, status: "ACTIVE", createdByAdminId: auth.actor.id } });
      await tx.adminAuditEvent.create({ data: { adminId: auth.actor.id, action: "DISPATCH_OPERATOR_CREATED", targetType: "DispatchOperator", targetId: operator.id, reason: "Created Dispatch Operator account", requestId: randomUUID(), outcome: "SUCCESS", safeMetadata: { email: operator.email } } });
      return operator;
    });
    return NextResponse.json({ success: true, operator: safe(result) }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "Email or phone is already registered" }, { status: 409 });
    return NextResponse.json({ error: "Could not create Dispatch Operator" }, { status: 500 });
  }
}

export const POST = withDistributedIpRateLimit(createDispatchOperator, { domain: "admin-dispatch-operator-create", max: 10, windowMs: 15 * 60 * 1000 });
