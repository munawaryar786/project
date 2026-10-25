import { NextRequest, NextResponse } from "next/server";
import { authorizeDriver } from "@/lib/security/authorization";

export async function GET(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  const driver = auth.actor;
  return NextResponse.json({
    success: true,
    driver: {
      id: driver.id,
      fullName: driver.fullName,
      phone: driver.phone,
      status: driver.status,
      vehicleType: driver.vehicleType,
      vehiclePlate: driver.vehiclePlate,
      vehicleCapacity: driver.vehicleCapacity,
      isOnline: driver.isOnline,
      isOnTrip: driver.isOnTrip,
    },
  });
}
