import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createCanonicalToken, setSessionCookies } from "@/lib/security/session";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
}).strict();

async function login(request: NextRequest) {
  try {
    const parsed = LoginSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    const admin = await prisma.adminUser.findUnique({ where: { email: parsed.data.email } });
    const validPassword = Boolean(admin && await bcrypt.compare(parsed.data.password, admin.passwordHash));
    if (!admin || !validPassword || !admin.role) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const session = await createCanonicalToken({
      sub: admin.id,
      actor: "ADMIN",
      role: admin.role,
      ver: admin.authVersion ?? 0,
    });
    const response = NextResponse.json({
      success: true,
      admin: { id: admin.id, fullName: admin.fullName, email: admin.email, role: admin.role },
    });
    setSessionCookies(response, "ADMIN", session);
    return response;
  } catch {
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}

export const POST = withRateLimit(login, {
  ...rateLimits.auth,
  scope: "admin_login",
});
