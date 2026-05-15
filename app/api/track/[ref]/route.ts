import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/track/[ref]
 * Customer booking tracking by reference number
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> }
) {
  try {
    const { ref } = await params;
    const bookingRef = ref.toUpperCase();

    const booking = await prisma.booking.findUnique({
      where: { bookingRef },
      select: {
        id: true,
        bookingRef: true,
        status: true,
        serviceType: true,
        pickupAddress: true,
        dropoffAddress: true,
        pickupLat: true,
        pickupLng: true,
        dropoffLat: true,
        dropoffLng: true,
        scheduledDate: true,
        scheduledTime: true,
        passengerCount: true,
        wheelchairNeeded: true,
        customerName: true,
        customerPhone: true,
        paymentMethod: true,
        estimatedPrice: true,
        dispatchStatus: true,
        createdAt: true,
        driver: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            currentLat: true,
            currentLng: true,
            lastLocationUpdate: true,
            isOnTrip: true,
            vehiclePlate: true,
            vehicleType: true,
          },
        },
      },
    });

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found. Please check your reference number." },
        { status: 404 }
      );
    }

    // Calculate status progress
    const statusProgress = getStatusProgress(booking.status, booking.dispatchStatus);

    // Determine if we can show driver location
    const showDriverLocation = booking.driver &&
      booking.dispatchStatus === "ACCEPTED" &&
      booking.driver.isOnTrip;

    return NextResponse.json({
      success: true,
      booking: {
        ref: booking.bookingRef,
        status: booking.status,
        serviceType: booking.serviceType,
        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,
        pickupLat: booking.pickupLat,
        pickupLng: booking.pickupLng,
        dropoffLat: booking.dropoffLat,
        dropoffLng: booking.dropoffLng,
        scheduledDate: booking.scheduledDate,
        scheduledTime: booking.scheduledTime,
        passengerCount: booking.passengerCount,
        wheelchairNeeded: booking.wheelchairNeeded,
        customerName: booking.customerName,
        paymentMethod: booking.paymentMethod,
        estimatedPrice: booking.estimatedPrice,
        dispatchStatus: booking.dispatchStatus,
        progress: statusProgress,
        createdAt: booking.createdAt,
      },
      driver: showDriverLocation ? {
        id:  booking.driver!.id,
        name: booking.driver!.fullName,
        phone: booking.driver!.phone,
        lat: booking.driver!.currentLat,
        lng: booking.driver!.currentLng,
        lastUpdate: booking.driver!.lastLocationUpdate,
        vehiclePlate: booking.driver!.vehiclePlate,
        vehicleType: booking.driver!.vehicleType,
      } : null,
    });
  } catch (error: any) {
    console.error("❌ Track booking error:", error);
    return NextResponse.json(
      { error: "Failed to fetch booking details" },
      { status: 500 }
    );
  }
}

function getStatusProgress(status: string, dispatchStatus: string | null) {
  const progressMap: Record<string, number> = {
    // Booking status
    PENDING: 10,
    CONFIRMED: 30,
    ASSIGNED: 50,
    IN_PROGRESS: 70,
    COMPLETED: 100,
    CANCELLED: 0,

    // Dispatch status (more granular)
    NOT_STARTED: 20,
    DRIVER_ASSIGNED: 40,
    ACCEPTED: 50,
    EN_ROUTE: 60,
    ARRIVED: 70,
    LOADING: 80,
    IN_TRANSIT: 85,
    ARRIVED_DESTINATION: 90,
    DISPATCH_COMPLETED: 100,
  };

  // Use dispatchStatus if available for more accurate progress
  if (dispatchStatus && progressMap[dispatchStatus] !== undefined) {
    return progressMap[dispatchStatus];
  }

  return progressMap[status] || 10;
}