import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const RentalSchema = z.object({
  name: z.string().min(2, "Name required"),
  phone: z.string().min(6, "Phone required"),
  vehicleType: z.string().min(1, "Vehicle type required"),
  message: z.string().optional().nullable(),
});

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
        vehicleType: parsed.data.vehicleType,
        message: parsed.data.message || null,
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