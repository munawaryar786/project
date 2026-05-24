const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  // ADMIN
  const adminPassword = await bcrypt.hash("Admin123!", 10);

  const admin = await prisma.adminUser.upsert({
    where: { email: "admin@drivo.sk" },
    update: {
      passwordHash: adminPassword,
      fullName: "Drivo Admin",
      role: "SUPER_ADMIN",
    },
    create: {
      email: "admin@drivo.sk",
      passwordHash: adminPassword,
      fullName: "Drivo Admin",
      role: "SUPER_ADMIN",
    },
  });

  console.log("✅ Admin ready:", admin.email);

  // TEST DRIVER
  const driverPassword = await bcrypt.hash("Driver123!", 10);

  const driver = await prisma.driver.upsert({
    where: {
      phone: "+421123456789",
    },
    update: {
      passwordHash: driverPassword,
      fullName: "Test Driver",
      status: "APPROVED",
      isOnline: true,
      isOnTrip: false,
    },
    create: {
      fullName: "Test Driver",
      phone: "+421123456789",
      status: "APPROVED",
      isOnline: true,
      isOnTrip: false,
      passwordHash: driverPassword,
    },
  });

  console.log("✅ Test driver ready:", driver.phone);

  console.log("\nLogin details:");
  console.log("Admin: admin@drivo.sk / Admin123!");
  console.log("Driver: +421123456789 / Driver123!");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });