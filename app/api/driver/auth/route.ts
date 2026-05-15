import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const phone =
      body.phone?.trim();

    const password =
      body.password;

    if (!phone || !password) {
      return NextResponse.json(
        {
          error:
            "Phone and password required",
        },
        { status: 400 }
      );
    }

    // ===============================
    // FIND DRIVER
    // ===============================

    const driver =
      await prisma.driver.findUnique({
        where: { phone },
      });

    if (!driver) {
      return NextResponse.json(
        {
          error: "Driver not found",
        },
        { status: 404 }
      );
    }

    // ===============================
    // CHECK PASSWORD
    // ===============================

    if (!driver.passwordHash) {
      return NextResponse.json(
        {
          error:
            "Driver password not set",
        },
        { status: 400 }
      );
    }

    const validPassword =
      await bcrypt.compare(
        password,
        driver.passwordHash
      );

    if (!validPassword) {
      return NextResponse.json(
        {
          error:
            "Invalid credentials",
        },
        { status: 401 }
      );
    }

    // ===============================
    // CREATE JWT TOKEN
    // ===============================

    const token = await createToken({
      id: driver.id,
      phone: driver.phone,
      type: "DRIVER",
    });

    console.log("═══════════════════════════════════════");
    console.log("🚗 DRIVER LOGIN SUCCESS");
    console.log(`👤 ${driver.fullName}`);
    console.log(`📱 ${driver.phone}`);
    console.log("═══════════════════════════════════════");

    const response =
      NextResponse.json({
        success: true,
        driver: {
          id: driver.id,
          fullName: driver.fullName,
          phone: driver.phone,
          vehicleType:
            driver.vehicleType,
          isOnline:
            driver.isOnline,
        },
      });

    // ===============================
    // SECURE COOKIE
    // ===============================

    response.cookies.set({
      name: "drivo_driver_token",
      value: token,
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge:
        60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error(
      "❌ Driver auth error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Authentication failed",
      },
      { status: 500 }
    );
  }
}