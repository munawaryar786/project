import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const VehicleSchema = z.object({
  plateNumber: z.string().trim().min(2, "License plate is required"),
  type: z.string().trim().min(1, "Vehicle type is required"),
  brand: z.string().trim().optional().nullable(),
  model: z.string().trim().optional().nullable(),
  year: z.coerce.number().int().min(1990).max(2100).optional().nullable(),
  maxPassengers: z.coerce.number().int().min(1).max(30).default(4),
  wheelchairAccessible: z.coerce.boolean().default(false),
  isRental: z.coerce.boolean().default(false),
  rentalStatus: z.string().trim().default("AVAILABLE"),
  weeklyRate: z.coerce.number().min(0).optional().nullable(),
  status: z.string().trim().default("ACTIVE"),
  currentMileageKm: z.coerce.number().int().min(0).optional().nullable(),
  serviceNotes: z.string().trim().optional().nullable(),
  nextServiceDate: z.string().trim().optional().nullable(),
  stkValidUntil: z.string().trim().optional().nullable(),
  weeklyRentalPrice: z.coerce.number().min(0).optional().nullable(),
  dailyRentalPrice: z.coerce.number().min(0).optional().nullable(),
  baseRidePrice: z.coerce.number().min(0).optional().nullable(),
});

function toDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function vehicleData(body: z.infer<typeof VehicleSchema>) {
  return {
    plateNumber: body.plateNumber.toUpperCase(),
    type: body.type,
    brand: body.brand || null,
    model: body.model || null,
    year: body.year ?? null,
    maxPassengers: body.maxPassengers,
    wheelchairAccessible: body.wheelchairAccessible,
    isRental: body.isRental,
    rentalStatus: body.rentalStatus,
    weeklyRate: body.weeklyRate ?? body.weeklyRentalPrice ?? null,
    status: body.status,
    currentMileageKm: body.currentMileageKm ?? null,
    serviceNotes: body.serviceNotes || null,
    nextServiceDate: toDate(body.nextServiceDate),
    stkValidUntil: toDate(body.stkValidUntil),
    weeklyRentalPrice: body.weeklyRentalPrice ?? body.weeklyRate ?? null,
    dailyRentalPrice: body.dailyRentalPrice ?? null,
    baseRidePrice: body.baseRidePrice ?? null,
  };
}

export async function GET() {
  try {
    const vehicles = await prisma.vehicle.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        drivers: {
          select: {
            id: true,
            fullName: true,
            phone: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, vehicles });
  } catch (error) {
    console.error("Admin vehicles fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch vehicles" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = VehicleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing or invalid vehicle fields",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const vehicle = await prisma.vehicle.create({
      data: vehicleData(parsed.data),
    });

    return NextResponse.json({ success: true, vehicle }, { status: 201 });
  } catch (error: any) {
    console.error("Admin vehicle create error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error?.code === "P2002"
            ? "A vehicle with this license plate already exists"
            : "Failed to save vehicle",
      },
      { status: 500 }
    );
  }
}
