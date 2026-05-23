const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  // ADMIN
  const adminPassword = await bcrypt.hash("Admin123!", 10);

  const admin = await prisma.adminUser.upsert({
    where: { email: "admin@drivo.sk" },
    update: {},
    create: {
      email: "admin@drivo.sk",
      passwordHash: adminPassword,
      fullName: "Drivo Admin",
      role: "SUPER_ADMIN",
    },
  });

  console.log("✅ Admin created:", admin.email);

  // DRIVER
  const driverPassword = await bcrypt.hash("Driver123!", 10);

  const driver = await prisma.driver.create({
    data: {
      fullName: "Test Driver",
      phone: "+421123456789",
      status: "APPROVED",
      isOnline: true,
      isOnTrip: false,
      passwordHash: driverPassword,
    },
  });

  console.log("✅ Driver created:", driver.phone);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });