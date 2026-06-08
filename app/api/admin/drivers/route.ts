import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const DriverCreateSchema = z.object({
  fullName: z.string().trim().min(2),
  phone: z.string().trim().min(3),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  licenseNumber: z.string().trim().optional().nullable(),
  vehicleId: z.string().trim().optional().nullable(),
  vehicleType: z.string().trim().optional().nullable(),
  vehiclePlate: z.string().trim().optional().nullable(),
  password: z.string().min(6),
});

const DriverUpdateSchema = z.object({
  driverId: z.string().trim().min(1),
  fullName: z.string().trim().min(2).optional(),
  phone: z.string().trim().min(3).optional(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  licenseNumber: z.string().trim().optional().nullable(),
  vehicleId: z.string().trim().optional().nullable(),
  password: z.string().min(6).optional().or(z.literal("")),
  isOnTrip: z.boolean().optional(),
  isOnline: z.boolean().optional(),
  status: z.string().trim().optional(),
});

async function getVehicleAssignment(vehicleId?: string | null) {
  if (!vehicleId) {
    return {
      vehicleId: null,
      vehicleType: null,
      vehiclePlate: null,
      vehicleCapacity: 4,
    };
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
  });

  if (!vehicle) {
    throw new Error("Selected vehicle was not found");
  }

  return {
    vehicleId: vehicle.id,
    vehicleType: vehicle.type,
    vehiclePlate: vehicle.plateNumber,
    vehicleCapacity: vehicle.maxPassengers,
  };
}

export async function GET() {
  try {
    const drivers = await prisma.driver.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        vehicle: true,
        bookings: { take: 5, orderBy: { createdAt: "desc" } },
      },
    });

    const safeDrivers = drivers.map((driver: any) => {
      const { passwordHash, ...safe } = driver;
      return safe;
    });

    return NextResponse.json({ drivers: safeDrivers });
  } catch (error) {
    console.error("Admin drivers fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch drivers" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = DriverCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Name, phone, password, and valid driver fields are required",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      fullName,
      phone,
      email,
      licenseNumber,
      vehicleId,
      vehicleType,
      vehiclePlate,
      password,
    } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 10);
    const assignment = await getVehicleAssignment(vehicleId);

    const driver = await prisma.driver.create({
      data: {
        fullName,
        phone,
        email: email || null,
        licenseNumber: licenseNumber || null,
        vehicleId: assignment.vehicleId,
        vehicleType: assignment.vehicleType || vehicleType || null,
        vehiclePlate: assignment.vehiclePlate || vehiclePlate || null,
        vehicleCapacity: assignment.vehicleCapacity,
        passwordHash,
        status: "ACTIVE",
        isOnline: false,
        isOnTrip: false,
      },
      include: { vehicle: true },
    });

    const { passwordHash: _, ...safeDriver } = driver as any;

    return NextResponse.json(
      { success: true, driver: safeDriver },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Admin driver creation error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create driver" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = DriverUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Missing or invalid driver update fields",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      driverId,
      fullName,
      phone,
      email,
      licenseNumber,
      vehicleId,
      password,
      isOnTrip,
      isOnline,
      status,
    } = parsed.data;
    const updateData: any = {};

    if (fullName) updateData.fullName = fullName;
    if (phone) updateData.phone = phone;
    if ("email" in parsed.data) updateData.email = email || null;
    if ("licenseNumber" in parsed.data) {
      updateData.licenseNumber = licenseNumber || null;
    }
    if (status) updateData.status = status;
    if (password) updateData.passwordHash = await bcrypt.hash(password, 10);
    if (typeof isOnTrip === "boolean") updateData.isOnTrip = isOnTrip;
    if (typeof isOnline === "boolean") updateData.isOnline = isOnline;

    if ("vehicleId" in parsed.data) {
      Object.assign(updateData, await getVehicleAssignment(vehicleId));
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
      include: { vehicle: true },
    });

    const { passwordHash, ...safeDriver } = driver as any;

    return NextResponse.json({
      success: true,
      driver: safeDriver,
    });
  } catch (error: any) {
    console.error("Admin driver update error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update driver" },
      { status: 500 }
    );
  }
}
