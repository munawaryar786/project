const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const pricingDefaults = {
  key: "default",
  baseFare: 1.49,
  distanceRate: 1.09,
  waitingRatePerMinute: 0.19,
  minimumFare: 5.0,
  bookingFee: 0,
  surgeEnabled: false,
  airportPickupFee: 3.0,
  airportMeetGreetFee: 5.0,
  assistedTransportFee: 3.0,
  childTransportFee: 3.0,
  priorityBookingFee: 2.0,
  nightServicePercentage: 10,
  nightStartTime: "22:00",
  nightEndTime: "06:00",
  globalDefaultCommission: 12.5,
  transparentPricingMessage: "Transparent Pricing. No Surge Charges.",
};

const distanceTiers = [
  { key: "default:0-20", label: "0-20 km", minKm: 0, maxKm: 20, ratePerKm: 1.09, sortOrder: 1 },
  { key: "default:20-50", label: "20-50 km", minKm: 20, maxKm: 50, ratePerKm: 1.0, sortOrder: 2 },
  { key: "default:50-plus", label: "50+ km", minKm: 50, maxKm: null, ratePerKm: 0.95, sortOrder: 3 },
];

const serviceProfiles = [
  ["STANDARD_TAXI", "Standard Taxi", 0],
  ["AIRPORT_TRANSFERS", "Airport Transfers", 0],
  ["CHILD_TRANSPORT", "Child Transport", 3],
  ["SENIOR_ACCESSIBLE_TRANSPORT", "Senior & Accessible Transport", 3],
  ["MEDICAL_TRANSPORT", "Medical Transport", 3],
  ["CORPORATE_TRANSPORT", "Corporate Transport", 0],
  ["LONG_DISTANCE_TRANSPORT", "Long Distance Transport", 0],
  ["TOURISM_PRIVATE_HIRE", "Tourism & Private Hire", 0],
];

const commissionConfigs = [
  {
    key: "GLOBAL:default",
    scope: "GLOBAL",
    scopeId: null,
    commissionRate: 12.5,
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
];

async function main() {
  await prisma.pricingSettings.upsert({
    where: { key: "default" },
    update: pricingDefaults,
    create: pricingDefaults,
  });

  for (const tier of distanceTiers) {
    await prisma.pricingDistanceTier.upsert({
      where: { key: tier.key },
      update: { ...tier, configKey: "default", active: true },
      create: { ...tier, configKey: "default", active: true },
    });
  }

  for (const [code, name, serviceFee] of serviceProfiles) {
    await prisma.servicePricingProfile.upsert({
      where: { code },
      update: { name, serviceFee, active: true },
      create: { code, name, serviceFee, active: true },
    });
  }

  for (const config of commissionConfigs) {
    await prisma.commissionConfig.upsert({
      where: { key: config.key },
      update: config,
      create: config,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Pricing Engine V1 defaults seeded.");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
