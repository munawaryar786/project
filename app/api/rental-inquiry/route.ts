import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const RentalSchema = z.object({
  name: z.string().min(2, "Name required"),
  phone: z.string().min(6, "Phone required"),
  email: z.string().email("Valid email required").optional().nullable(),
  licenseNumber: z.string().min(3, "License number required").optional().nullable(),
  workPlatform: z.string().min(1, "Work platform required").optional().nullable(),
  vehicleType: z.string().min(1, "Vehicle type required"),
  vehicleSelected: z.string().optional().nullable(),
  rentalStartDate: z.string().optional().nullable(),
  rentalDuration: z.string().optional().nullable(),
  weeklyRentalPlan: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  message: z.string().optional().nullable(),
});

export async function GET() {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: {
        isRental: true,
        rentalStatus: "AVAILABLE",
        status: "ACTIVE",
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        brand: true,
        model: true,
        year: true,
        maxPassengers: true,
        weeklyRate: true,
        weeklyRentalPrice: true,
        dailyRentalPrice: true,
      },
    });

    return NextResponse.json({ success: true, vehicles });
  } catch (error) {
    console.error("Rental vehicles fetch error:", error);
    return NextResponse.json({ success: true, vehicles: [] });
  }
}

/**
 * POST /api/rental-inquiry — Submit driver rental inquiry
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const parsed = RentalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const inquiry = await prisma.rentalInquiry.create({
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email || null,
        licenseNumber: parsed.data.licenseNumber || null,
        workPlatform: parsed.data.workPlatform || null,
        vehicleType: parsed.data.vehicleType,
        vehicleSelected: parsed.data.vehicleSelected || parsed.data.vehicleType,
        rentalStartDate: parsed.data.rentalStartDate || null,
        rentalDuration: parsed.data.rentalDuration || null,
        weeklyRentalPlan: parsed.data.weeklyRentalPlan || null,
        notes: parsed.data.notes || null,
        message:
          parsed.data.message ||
          [
            `Email: ${parsed.data.email || "N/A"}`,
            `License: ${parsed.data.licenseNumber || "N/A"}`,
            `Platform: ${parsed.data.workPlatform || "N/A"}`,
            `Vehicle: ${parsed.data.vehicleSelected || parsed.data.vehicleType}`,
            `Start: ${parsed.data.rentalStartDate || "N/A"}`,
            `Duration: ${parsed.data.rentalDuration || "N/A"}`,
            `Plan: ${parsed.data.weeklyRentalPlan || "N/A"}`,
            `Notes: ${parsed.data.notes || "N/A"}`,
          ].join("\n"),
      },
    });

    console.log("🔑 New rental inquiry from:", parsed.data.name);

    return NextResponse.json(
      { success: true, id: inquiry.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Rental inquiry error:", error);
    return NextResponse.json({ error: "Failed to submit inquiry" }, { status: 500 });
  }
}
