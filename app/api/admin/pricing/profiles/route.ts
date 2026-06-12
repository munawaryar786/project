import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const ProfileSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().max(240).optional().nullable(),
  active: z.boolean().default(true),
  baseFareOverride: z.coerce.number().min(0).nullable().optional(),
  distanceRateOverride: z.coerce.number().min(0).nullable().optional(),
  minimumFareOverride: z.coerce.number().min(0).nullable().optional(),
  serviceFee: z.coerce.number().min(0),
  commissionRateOverride: z.coerce.number().min(0).max(100).nullable().optional(),
});

const PayloadSchema = z.object({
  profiles: z.array(ProfileSchema).min(1),
});

const DEFAULT_PROFILES = [
  ["STANDARD_TAXI", "Standard Taxi", 0],
  ["AIRPORT_TRANSFERS", "Airport Transfers", 0],
  ["CHILD_TRANSPORT", "Child Transport", 3],
  ["SENIOR_ACCESSIBLE_TRANSPORT", "Senior & Accessible Transport", 3],
  ["MEDICAL_TRANSPORT", "Medical Transport", 3],
  ["CORPORATE_TRANSPORT", "Corporate Transport", 0],
  ["LONG_DISTANCE_TRANSPORT", "Long Distance Transport", 0],
  ["TOURISM_PRIVATE_HIRE", "Tourism & Private Hire", 0],
] as const;

async function getOrCreateProfiles() {
  const existing = await prisma.servicePricingProfile.findMany({
    orderBy: { name: "asc" },
  });

  if (existing.length >= DEFAULT_PROFILES.length) return existing;

  await Promise.all(
    DEFAULT_PROFILES.map(([code, name, serviceFee]) =>
      prisma.servicePricingProfile.upsert({
        where: { code },
        update: { name, serviceFee, active: true },
        create: { code, name, serviceFee, active: true },
      })
    )
  );

  return prisma.servicePricingProfile.findMany({ orderBy: { name: "asc" } });
}

export async function GET() {
  try {
    const profiles = await getOrCreateProfiles();
    return NextResponse.json({ success: true, profiles });
  } catch (error) {
    console.error("Pricing profiles fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch service pricing profiles" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = PayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing or invalid service profile fields",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    await Promise.all(
      parsed.data.profiles.map((profile) =>
        prisma.servicePricingProfile.upsert({
          where: { code: profile.code },
          update: {
            name: profile.name,
            description: profile.description || null,
            active: profile.active,
            baseFareOverride: profile.baseFareOverride ?? null,
            distanceRateOverride: profile.distanceRateOverride ?? null,
            minimumFareOverride: profile.minimumFareOverride ?? null,
            serviceFee: profile.serviceFee,
            commissionRateOverride: profile.commissionRateOverride ?? null,
          },
          create: {
            code: profile.code,
            name: profile.name,
            description: profile.description || null,
            active: profile.active,
            baseFareOverride: profile.baseFareOverride ?? null,
            distanceRateOverride: profile.distanceRateOverride ?? null,
            minimumFareOverride: profile.minimumFareOverride ?? null,
            serviceFee: profile.serviceFee,
            commissionRateOverride: profile.commissionRateOverride ?? null,
          },
        })
      )
    );

    const profiles = await getOrCreateProfiles();
    return NextResponse.json({ success: true, profiles });
  } catch (error) {
    console.error("Pricing profiles update error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save service pricing profiles" },
      { status: 500 }
    );
  }
}
