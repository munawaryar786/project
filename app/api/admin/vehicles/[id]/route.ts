import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const VehicleUpdateSchema = z.object({
  plateNumber: z.string().trim().min(2).optional(),
  type: z.string().trim().min(1).optional(),
  brand: z.string().trim().optional().nullable(),
  model: z.string().trim().optional().nullable(),
  year: z.coerce.number().int().min(1990).max(2100).optional().nullable(),
  maxPassengers: z.coerce.number().int().min(1).max(30).optional(),
  wheelchairAccessible: z.coerce.boolean().optional(),
  isRental: z.coerce.boolean().optional(),
  rentalStatus: z.string().trim().optional(),
  weeklyRate: z.coerce.number().min(0).optional().nullable(),
  status: z.string().trim().optional(),
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

function updateData(body: z.infer<typeof VehicleUpdateSchema>) {
  const data: any = { ...body };

  if (body.plateNumber) data.plateNumber = body.plateNumber.toUpperCase();
  if ("brand" in body) data.brand = body.brand || null;
  if ("model" in body) data.model = body.model || null;
  if ("serviceNotes" in body) data.serviceNotes = body.serviceNotes || null;
  if ("nextServiceDate" in body) data.nextServiceDate = toDate(body.nextServiceDate);
  if ("stkValidUntil" in body) data.stkValidUntil = toDate(body.stkValidUntil);
  if ("weeklyRentalPrice" in body && body.weeklyRentalPrice != null) {
    data.weeklyRate = body.weeklyRentalPrice;
  }
  if ("weeklyRate" in body && body.weeklyRate != null) {
    data.weeklyRentalPrice = body.weeklyRate;
  }

  return data;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: { drivers: true },
    });

    if (!vehicle) {
      return NextResponse.json(
        { success: false, error: "Vehicle not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, vehicle });
  } catch (error) {
    console.error("Admin vehicle detail error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch vehicle" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = VehicleUpdateSchema.safeParse(body);

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

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: updateData(parsed.data),
    });

    await prisma.driver.updateMany({
      where: { vehicleId: id },
      data: {
        vehicleType: vehicle.type,
        vehiclePlate: vehicle.plateNumber,
        vehicleCapacity: vehicle.maxPassengers,
      },
    });

    return NextResponse.json({ success: true, vehicle });
  } catch (error: any) {
    console.error("Admin vehicle update error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error?.code === "P2025"
            ? "Vehicle not found"
            : error?.code === "P2002"
            ? "A vehicle with this license plate already exists"
            : "Failed to edit vehicle",
      },
      { status: error?.code === "P2025" ? 404 : 500 }
    );
  }
}
