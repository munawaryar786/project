export type DriverCalendarRide = {
  id: string;
  bookingRef: string;
  driverId: string | null;
  scheduledRide: boolean;
  status: string;
  pickupAt: Date;
  pickupAddress: string;
  dropoffAddress: string;
  serviceType: string;
};

export function isDriverCalendarRideEligible(ride: DriverCalendarRide, driverId: string, now = new Date()) {
  return Boolean(
    ride.id &&
    ride.driverId === driverId &&
    ride.scheduledRide === true &&
    !["CANCELLED", "COMPLETED", "NO_SHOW"].includes(ride.status) &&
    ride.pickupAt instanceof Date &&
    Number.isFinite(ride.pickupAt.getTime()) &&
    ride.pickupAt.getTime() > now.getTime()
  );
}

export function escapeIcsText(value: unknown) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function utcStamp(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldIcsLine(line: string) {
  const chunks: string[] = [];
  let current = "";
  let bytes = 0;
  for (const character of line) {
    const size = new TextEncoder().encode(character).length;
    if (bytes + size > 75 && current) {
      chunks.push(current);
      current = " ";
      bytes = 1;
    }
    current += character;
    bytes += size;
  }
  chunks.push(current);
  return chunks.join("\r\n");
}

export function createDriverRideIcs(ride: Pick<DriverCalendarRide, "id" | "bookingRef" | "pickupAt" | "pickupAddress" | "dropoffAddress" | "serviceType">, now = new Date()) {
  const description = [
    `Booking reference: ${ride.bookingRef}`,
    `Pickup: ${ride.pickupAddress}`,
    `Destination: ${ride.dropoffAddress}`,
    `Service: ${ride.serviceType}`,
  ].join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Drivo//Driver Ride Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(ride.id)}@drivo`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(ride.pickupAt)}`,
    "SUMMARY:Drivo scheduled ride",
    `LOCATION:${escapeIcsText(ride.pickupAddress)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
