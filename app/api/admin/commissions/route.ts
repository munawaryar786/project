import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const CommissionSchema = z.object({
  id: z.string().optional(),
  key: z.string().min(1),
  scope: z.enum(["GLOBAL", "DRIVER", "FLEET", "SERVICE_TYPE"]),
  scopeId: z.string().trim().nullable().optional(),
  commissionRate: z.coerce.number().min(0).max(100),
  active: z.boolean().default(true),
  notes: z.string().max(240).nullable().optional(),
});

const PayloadSchema = z.object({
  commissions: z.array(CommissionSchema).min(1),
});

const DEFAULT_COMMISSIONS = [
  {
    key: "GLOBAL:default",
    scope: "GLOBAL",
    scopeId: null,
    commissionRate: 12.5,
    active: true,
    notes: "Launch default commission. Recommended range: 10-15%.",
  },
  {
    key: "DRIVER:override-template",
    scope: "DRIVER",
    scopeId: "override-template",
    commissionRate: 12.5,
    active: false,
    notes: "Template row for future driver-specific commission overrides.",
  },
  {
    key: "FLEET:override-template",
    scope: "FLEET",
    scopeId: "override-template",
    commissionRate: 12.5,
    active: false,
    notes: "Template row for future fleet-specific commission overrides.",
  },
  {
    key: "SERVICE_TYPE:override-template",
    scope: "SERVICE_TYPE",
    scopeId: "override-template",
    commissionRate: 12.5,
    active: false,
    notes: "Template row for future service-type commission overrides.",
  },
] as const;

async function getOrCreateCommissions() {
  const existing = await prisma.commissionConfig.findMany({
    orderBy: { scope: "asc" },
  });

  if (existing.length >= DEFAULT_COMMISSIONS.length) return existing;

  await Promise.all(
    DEFAULT_COMMISSIONS.map((config) =>
      prisma.commissionConfig.upsert({
        where: { key: config.key },
        update: config,
        create: config,
      })
    )
  );

  return prisma.commissionConfig.findMany({ orderBy: { scope: "asc" } });
}

export async function GET() {
  try {
    const commissions = await getOrCreateCommissions();
    return NextResponse.json({ success: true, commissions });
  } catch (error) {
    console.error("Commission fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch commission settings" },
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
          error: "Missing or invalid commission fields",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    await Promise.all(
      parsed.data.commissions.map((commission) =>
        prisma.commissionConfig.upsert({
          where: { key: commission.key },
          update: {
            scope: commission.scope,
            scopeId: commission.scopeId || null,
            commissionRate: commission.commissionRate,
            active: commission.active,
            notes: commission.notes || null,
          },
          create: {
            key: commission.key,
            scope: commission.scope,
            scopeId: commission.scopeId || null,
            commissionRate: commission.commissionRate,
            active: commission.active,
            notes: commission.notes || null,
          },
        })
      )
    );

    const commissions = await getOrCreateCommissions();
    return NextResponse.json({ success: true, commissions });
  } catch (error) {
    console.error("Commission update error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save commission settings" },
      { status: 500 }
    );
  }
}
