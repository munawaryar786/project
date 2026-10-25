import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";

const RentalSchema = z.object({
  name: z.string().trim().min(2, "Name required").max(120),
  phone: z.string().trim().min(6, "Phone required").max(40),
  email: z.string().trim().toLowerCase().email("Valid email required").max(254).optional().nullable(),
  licenseNumber: z.string().trim().min(3, "License number required").max(80).optional().nullable(),
  workPlatform: z.string().trim().min(1, "Work platform required").max(80).optional().nullable(),
  vehicleType: z.string().trim().min(1, "Vehicle type required").max(80),
  vehicleSelected: z.string().trim().max(120).optional().nullable(),
  rentalStartDate: z.string().max(40).optional().nullable(),
  rentalDuration: z.string().max(80).optional().nullable(),
  weeklyRentalPlan: z.string().max(80).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  message: z.string().trim().max(4000).optional().nullable(),
}).strict();

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
async function submitRentalInquiry(request: NextRequest) {
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


    return NextResponse.json(
      { success: true, id: inquiry.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Rental inquiry error:", error);
    return NextResponse.json({ error: "Failed to submit inquiry" }, { status: 500 });
  }
}

export const POST = withRateLimit(submitRentalInquiry, {
  ...rateLimits.public,
  scope: "rental_inquiry_submit",
  max: 10,
});
