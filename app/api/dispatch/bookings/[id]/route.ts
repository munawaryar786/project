import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeDispatchOperator } from "@/lib/security/authorization";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeDispatchOperator(request); if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/i.test(id)) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  try {
    const booking = await prisma.booking.findFirst({ where: { id, bookingSource: "PHONE_DISPATCH" }, include: { driver: { select: { id: true, fullName: true, phone: true, vehicleType: true, vehiclePlate: true, status: true, isOnline: true, isOnTrip: true } } } });
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    const [payments, events] = await Promise.all([
      prisma.bookingPayment.findMany({ where: { bookingId: id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, status: true, amountMinor: true, currency: true, expiresAt: true, paidAt: true, failedAt: true, cancelledAt: true, createdAt: true } }),
      prisma.dispatchAuditEvent.findMany({ where: { targetType: "Booking", targetId: id }, orderBy: { createdAt: "desc" }, take: 30, select: { actorType: true, action: true, outcome: true, safeMetadata: true, createdAt: true } }),
    ]);
    const { passwordHash: _driverPassword, authVersion: _driverVersion, currentLat: _lat, currentLng: _lng, lastLocationUpdate: _locationUpdate, lastLocationReceivedAt: _receivedAt, ...driver } = booking.driver || {} as any;
    return NextResponse.json({ booking: {
      id: booking.id, bookingRef: booking.bookingRef, bookingSource: booking.bookingSource, createdByDispatchOperatorId: booking.createdByDispatchOperatorId,
      status: booking.status, dispatchStatus: booking.dispatchStatus, serviceType: booking.serviceType,
      customerName: booking.customerName, customerPhone: `${booking.customerPhoneCode}${booking.customerPhone}`, customerEmail: booking.customerEmail,
      languagePref: booking.languagePref, pickupAddress: booking.pickupAddress, dropoffAddress: booking.dropoffAddress,
      pickupLat: booking.pickupLat, pickupLng: booking.pickupLng, dropoffLat: booking.dropoffLat, dropoffLng: booking.dropoffLng,
      scheduledDate: booking.scheduledDate, scheduledTime: booking.scheduledTime, pickupAt: booking.pickupAt, scheduledRide: booking.scheduledRide,
      passengerCount: booking.passengerCount, luggageType: booking.luggageType, smallBags: booking.smallBags, largeBags: booking.largeBags,
      seniorPassenger: booking.seniorPassenger, ztpCardHolder: booking.ztpCardHolder, wheelchairNeeded: booking.wheelchairNeeded,
      wheelchairUser: booking.wheelchairUser, companionRequired: booking.companionRequired, companionCount: booking.companionCount,
      medicalAppointment: booking.medicalAppointment, hospitalName: booking.hospitalName, department: booking.department,
      appointmentDate: booking.appointmentDate, appointmentTime: booking.appointmentTime, tripType: booking.tripType,
      returnDate: booking.returnDate, returnTime: booking.returnTime, waitingDuration: booking.waitingDuration,
      customWaitingDuration: booking.customWaitingDuration, assistanceLevel: booking.assistanceLevel, wheelchairType: booking.wheelchairType,
      canTransferToSeat: booking.canTransferToSeat, wavRequired: booking.wavRequired, passengerRemainsInWheelchair: booking.passengerRemainsInWheelchair,
      childrenDetails: booking.childrenDetails, parentFullName: booking.parentFullName, guardianName: booking.guardianName,
      parentPrimaryPhone: booking.parentPrimaryPhone, guardianPhone: booking.guardianPhone, parentEmergencyPhone: booking.parentEmergencyPhone,
      guardianEmergencyPhone: booking.guardianEmergencyPhone, parentEmail: booking.parentEmail, guardianEmail: booking.guardianEmail,
      educationalInstitutionName: booking.educationalInstitutionName, institutionAddress: booking.institutionAddress,
      flightNumber: booking.flightNumber, airline: booking.airline, waitAndGreet: booking.waitAndGreet, specialNotes: booking.specialNotes,
      paymentMethod: booking.paymentMethod, payment: payments.map((payment) => ({ ...payment, providerSessionId: undefined })),
      estimatedPrice: booking.estimatedPrice, distanceKm: booking.distanceKm, fareBreakdown: booking.fareBreakdown,
      driver: driver ? { id: driver.id, fullName: driver.fullName, phone: driver.phone, vehicleType: driver.vehicleType, vehiclePlate: driver.vehiclePlate, status: driver.status, isOnline: driver.isOnline, isOnTrip: driver.isOnTrip } : null,
      createdAt: booking.createdAt, updatedAt: booking.updatedAt,
    }, timeline: events }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Could not load Dispatch booking" }, { status: 503 }); }
}
