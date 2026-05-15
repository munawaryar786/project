import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const email =
      body.email?.trim().toLowerCase();

    const password = body.password;

    if (!email || !password) {
      return NextResponse.json(
        {
          error: "Email and password required",
        },
        { status: 400 }
      );
    }

    // ===============================
    // FIND ADMIN
    // ===============================

    const admin =
      await prisma.adminUser.findUnique({
        where: { email },
      });

    if (!admin) {
      return NextResponse.json(
        {
          error: "Invalid credentials",
        },
        { status: 401 }
      );
    }

    // ===============================
    // VERIFY PASSWORD
    // ===============================

    const validPassword =
      await bcrypt.compare(
        password,
        admin.passwordHash
      );

    if (!validPassword) {
      return NextResponse.json(
        {
          error: "Invalid credentials",
        },
        { status: 401 }
      );
    }

    // ===============================
    // CREATE JWT TOKEN
    // ===============================

    const token = await createToken({
      id: admin.id,
      email: admin.email,
      role: admin.role,
      type: "ADMIN",
    });

    console.log("═══════════════════════════════════════");
    console.log("🔐 ADMIN LOGIN SUCCESS");
    console.log(`👤 ${admin.fullName}`);
    console.log(`📧 ${admin.email}`);
    console.log(`🛡️ Role: ${admin.role}`);
    console.log("═══════════════════════════════════════");

    // ===============================
    // RESPONSE
    // ===============================

    const response = NextResponse.json({
      success: true,
      admin: {
        id: admin.id,
        fullName: admin.fullName,
        email: admin.email,
        role: admin.role,
      },
    });

    // ===============================
    // SECURE COOKIE
    // ===============================

    response.cookies.set({
      name: "drivo_admin_token",
      value: token,
      httpOnly: true,
      secure: false, // true on VPS/production HTTPS
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error(
      "❌ Admin auth error:",
      error
    );

    return NextResponse.json(
      {
        error: "Authentication failed",
      },
      { status: 500 }
    );
  }
}