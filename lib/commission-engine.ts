import { prisma } from "@/lib/prisma";
import { DEFAULT_COMMISSION_RATE } from "@/lib/pricing-engine";

type CommissionResolutionInput = {
  driverId?: string | null;
  fleetId?: string | null;
  serviceType?: string | null;
};

type BookingFinancialInput = CommissionResolutionInput & {
  id?: string;
  bookingRef?: string;
  fareTotalFare?: number | null;
  estimatedPrice?: number | null;
};

export type CommissionResolution = {
  commissionRate: number;
  source: "DRIVER" | "FLEET" | "SERVICE_TYPE" | "GLOBAL" | "DEFAULT";
  sourceId: string | null;
};

export type BookingFinancialBreakdown = {
  totalFare: number;
  platformCommission: number;
  driverEarnings: number;
  platformEarnings: number;
  serviceType: string;
  commissionPercentageUsed: number;
  commissionSource: CommissionResolution["source"];
  commissionSourceId: string | null;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function readFare(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function serviceTypeCandidates(serviceType?: string | null) {
  const raw = (serviceType || "").trim().toUpperCase();
  if (!raw) return [];

  const mapped: Record<string, string[]> = {
    STANDARD: ["STANDARD_TAXI"],
    TAXI: ["STANDARD_TAXI"],
    AIRPORT: ["AIRPORT_TRANSFERS"],
    AIRPORT_TRANSFER: ["AIRPORT_TRANSFERS"],
    CHILDREN: ["CHILD_TRANSPORT"],
    CHILD: ["CHILD_TRANSPORT"],
    ACCESSIBLE: ["SENIOR_ACCESSIBLE_TRANSPORT"],
    SENIOR: ["SENIOR_ACCESSIBLE_TRANSPORT"],
    ASSISTED: ["SENIOR_ACCESSIBLE_TRANSPORT"],
    MEDICAL: ["MEDICAL_TRANSPORT"],
    CORPORATE: ["CORPORATE_TRANSPORT"],
    LONG_DISTANCE: ["LONG_DISTANCE_TRANSPORT"],
    TOURISM: ["TOURISM_PRIVATE_HIRE"],
  };

  return Array.from(new Set([raw, ...(mapped[raw] || [])]));
}

export async function resolveCommissionRate({
  driverId,
  fleetId,
  serviceType,
}: CommissionResolutionInput): Promise<CommissionResolution> {
  const [configs, settings] = await Promise.all([
    prisma.commissionConfig.findMany({
      where: { active: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.pricingSettings.findUnique({ where: { key: "default" } }),
  ]);

  const findScoped = (scope: string, ids: Array<string | null | undefined>) => {
    const normalized = ids
      .filter((id): id is string => Boolean(id))
      .map((id) => id.trim().toUpperCase());

    return configs.find((config) => {
      if (config.scope !== scope || !config.scopeId) return false;
      return normalized.includes(config.scopeId.trim().toUpperCase());
    });
  };

  const driverOverride = findScoped("DRIVER", [driverId]);
  if (driverOverride) {
    return {
      commissionRate: driverOverride.commissionRate,
      source: "DRIVER",
      sourceId: driverOverride.scopeId,
    };
  }

  const fleetOverride = findScoped("FLEET", [fleetId]);
  if (fleetOverride) {
    return {
      commissionRate: fleetOverride.commissionRate,
      source: "FLEET",
      sourceId: fleetOverride.scopeId,
    };
  }

  const serviceOverride = findScoped("SERVICE_TYPE", serviceTypeCandidates(serviceType));
  if (serviceOverride) {
    return {
      commissionRate: serviceOverride.commissionRate,
      source: "SERVICE_TYPE",
      sourceId: serviceOverride.scopeId,
    };
  }

  const global = configs.find((config) => config.scope === "GLOBAL");
  if (global) {
    return {
      commissionRate: global.commissionRate,
      source: "GLOBAL",
      sourceId: global.scopeId,
    };
  }

  return {
    commissionRate: settings?.globalDefaultCommission ?? DEFAULT_COMMISSION_RATE,
    source: settings ? "GLOBAL" : "DEFAULT",
    sourceId: settings?.key ?? null,
  };
}

export async function calculateBookingFinancialBreakdown(
  booking: BookingFinancialInput
): Promise<BookingFinancialBreakdown> {
  const totalFare = roundMoney(readFare(booking.fareTotalFare) || readFare(booking.estimatedPrice));
  const commission = await resolveCommissionRate({
    driverId: booking.driverId,
    fleetId: booking.fleetId,
    serviceType: booking.serviceType,
  });
  const platformCommission = roundMoney(totalFare * (commission.commissionRate / 100));
  const driverEarnings = roundMoney(totalFare - platformCommission);

  return {
    totalFare,
    platformCommission,
    platformEarnings: platformCommission,
    driverEarnings,
    serviceType: booking.serviceType || "UNKNOWN",
    commissionPercentageUsed: commission.commissionRate,
    commissionSource: commission.source,
    commissionSourceId: commission.sourceId,
  };
}

export async function createOrUpdateDriverEarningForBooking(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { driver: true },
  });

  if (!booking || !booking.driverId) return null;

  const fleetId = (booking.driver as any)?.fleetId || null;
  const financial = await calculateBookingFinancialBreakdown({
    driverId: booking.driverId,
    fleetId,
    serviceType: booking.serviceType,
    fareTotalFare: booking.fareTotalFare,
    estimatedPrice: booking.estimatedPrice,
  });

  return prisma.driverEarning.upsert({
    where: { bookingId: booking.id },
    update: {
      totalFare: financial.totalFare,
      driverAmount: financial.driverEarnings,
      platformAmount: financial.platformCommission,
      commissionRate: financial.commissionPercentageUsed,
      paymentMethod: booking.paymentMethod,
      cashCollected: booking.paymentMethod === "CASH" && booking.cashAgreed,
      completedAt: new Date(),
      notes: `Commission source: ${financial.commissionSource}${
        financial.commissionSourceId ? ` (${financial.commissionSourceId})` : ""
      }`,
    },
    create: {
      bookingId: booking.id,
      driverId: booking.driverId,
      bookingRef: booking.bookingRef,
      totalFare: financial.totalFare,
      driverAmount: financial.driverEarnings,
      platformAmount: financial.platformCommission,
      commissionRate: financial.commissionPercentageUsed,
      paymentMethod: booking.paymentMethod,
      cashCollected: booking.paymentMethod === "CASH" && booking.cashAgreed,
      completedAt: new Date(),
      notes: `Commission source: ${financial.commissionSource}${
        financial.commissionSourceId ? ` (${financial.commissionSourceId})` : ""
      }`,
    },
  });
}
