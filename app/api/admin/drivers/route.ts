import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * GET /api/admin/drivers — List all drivers
 */
export async function GET() {
  try {
    const drivers = await prisma.driver.findMany({
      orderBy: { createdAt: "desc" },
      include: { bookings: { take: 5, orderBy: { createdAt: "desc" } } },
    });

    const safeDrivers = drivers.map((d: any) => {
      const { passwordHash, ...safe } = d;
      return safe;
    });

    return NextResponse.json({ drivers: safeDrivers });
  } catch (error) {
    console.error("❌ Admin drivers fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch drivers" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/drivers — Create new driver
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      fullName,
      phone,
      email,
      licenseNumber,
      vehicleType,
      vehiclePlate,
      password,
    } = body;

    if (!fullName || !phone || !password) {
      return NextResponse.json(
        { error: "Name, phone, and password are required" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const driver = await prisma.driver.create({
      data: {
        fullName,
        phone,
        email: email || null,
        licenseNumber: licenseNumber || null,
        vehicleType: vehicleType || null,
        vehiclePlate: vehiclePlate || null,
        passwordHash,
        status: "ACTIVE",
        isOnline: false,
        isOnTrip: false,
      },
    });

    console.log(`🚗 New driver created: ${driver.fullName} (${driver.phone})`);

    const { passwordHash: _, ...safeDriver } = driver as any;

    return NextResponse.json(
      { success: true, driver: safeDriver },
      { status: 201 }
    );
  } catch (error) {
    console.error("❌ Admin driver creation error:", error);
    return NextResponse.json(
      { error: "Failed to create driver" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/drivers — Update driver operational status
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { driverId, isOnTrip, isOnline } = body;

    if (!driverId) {
      return NextResponse.json(
        { error: "Driver ID required" },
        { status: 400 }
      );
    }

    const updateData: any = {};

    if (typeof isOnTrip === "boolean") {
      updateData.isOnTrip = isOnTrip;
    }

    if (typeof isOnline === "boolean") {
      updateData.isOnline = isOnline;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid update fields provided" },
        { status: 400 }
      );
    }

    const driver = await prisma.driver.update({
      where: { id: driverId },
      data: updateData,
    });

    console.log(
      `🛠️ Admin updated driver: ${driver.fullName}, isOnline=${driver.isOnline}, isOnTrip=${driver.isOnTrip}`
    );

    const { passwordHash, ...safeDriver } = driver as any;

    return NextResponse.json({
      success: true,
      driver: safeDriver,
    });
  } catch (error) {
    console.error("❌ Admin driver update error:", error);
    return NextResponse.json(
      { error: "Failed to update driver" },
      { status: 500 }
    );
  }
}