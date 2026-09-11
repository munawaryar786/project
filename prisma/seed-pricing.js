const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const pricingDefaults = {
  key: "default",
  baseFare: 0,
  distanceRate: 1,
  waitingRatePerMinute: 0.25,
  minimumFare: 12.5,
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
  { key: "default:0-50", label: "0-50 km", minKm: 0, maxKm: 50, ratePerKm: 1, sortOrder: 1 },
  { key: "default:50-100", label: "50-100 km", minKm: 50, maxKm: 100, ratePerKm: 0.9, sortOrder: 2 },
  { key: "default:100-plus", label: "100+ km", minKm: 100, maxKm: null, ratePerKm: 0.85, sortOrder: 3 },
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

  await prisma.pricingDistanceTier.updateMany({
    where: { configKey: "default" },
    data: { active: false },
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
