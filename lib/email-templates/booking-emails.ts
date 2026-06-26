export interface SeniorAssistedBookingEmailData {
  bookingRef: string;
  serviceType: string;
  status?: string | null;
  createdAt?: Date | string | null;
  pickupAddress: string;
  dropoffAddress: string;
  scheduledDate: string;
  scheduledTime: string;
  passengerCount: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  languagePref?: string | null;
  paymentMethod: string;
  wheelchairNeeded: boolean;
  luggageType: string;
  smallBags?: number | null;
  largeBags?: number | null;
  specialNotes?: string | null;
  estimatedPrice?: number | null;
  distanceKm?: number | null;
  seniorPassenger?: boolean | null;
  ztpCardHolder?: boolean | null;
  wheelchairUser?: boolean | null;
  companionRequired?: boolean | null;
  medicalAppointment?: boolean | null;
  waitingTimeRequired?: boolean | null;
  assistanceLevel?: string | null;
  wheelchairType?: string | null;
  canTransferToSeat?: boolean | null;
  wavRequired?: boolean | null;
  passengerRemainsInWheelchair?: boolean | null;
  companionCount?: number | null;
  hospitalName?: string | null;
  department?: string | null;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  tripType?: string | null;
  returnDate?: string | null;
  returnTime?: string | null;
  waitingDuration?: string | null;
  customWaitingDuration?: string | null;
}

export interface BuiltEmailTemplate {
  subject: string;
  html: string;
  text: string;
}

const BRAND = {
  navy: "#061a2b",
  teal: "#11b8a6",
  tealDark: "#087d73",
  bg: "#f4f8f9",
  card: "#ffffff",
  border: "#d9e6e8",
  text: "#10202f",
  muted: "#60707d",
};

function escapeHtml(value: string | number | boolean | Date | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function valueOrFallback(value: string | number | boolean | Date | null | undefined) {
  const text = String(value ?? "").trim();
  return text || "N/A";
}

function yesNo(value: boolean | null | undefined) {
  return value ? "Yes" : "No";
}

function formatMoney(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  return `EUR ${value.toFixed(2)}`;
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "N/A";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().replace("T", " ").slice(0, 16);
}

function serviceLabel(value: string) {
  const normalized = value.toUpperCase();
  if (normalized === "SENIOR") return "Senior Transport";
  if (normalized === "ACCESSIBLE") return "Assisted / Accessible Transport";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function labelValue(value: string | null | undefined) {
  if (!value) return "N/A";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function row(label: string, value: string | number | boolean | Date | null | undefined) {
  return `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid ${BRAND.border}; color: ${BRAND.muted}; font-size: 13px; line-height: 1.4; width: 40%;">
        ${escapeHtml(label)}
      </td>
      <td style="padding: 10px 0; border-bottom: 1px solid ${BRAND.border}; color: ${BRAND.text}; font-size: 13px; line-height: 1.4; font-weight: 700;">
        ${escapeHtml(valueOrFallback(value))}
      </td>
    </tr>`;
}

function section(title: string, rows: string) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 18px;">
      <tr>
        <td style="padding: 0 0 8px; border-bottom: 2px solid ${BRAND.teal};">
          <h2 style="margin: 0; color: ${BRAND.navy}; font-size: 16px; line-height: 1.3;">${escapeHtml(title)}</h2>
        </td>
      </tr>
      <tr>
        <td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${rows}
          </table>
        </td>
      </tr>
    </table>`;
}

function badge(text: string, bg = BRAND.teal, color = "#ffffff") {
  return `<span style="display: inline-block; padding: 6px 10px; border-radius: 999px; background: ${bg}; color: ${color}; font-size: 12px; line-height: 1; font-weight: 800;">${escapeHtml(text)}</span>`;
}

function buildLogo(siteUrl?: string | null) {
  if (!siteUrl) {
    return `<div style="color: #ffffff; font-size: 22px; line-height: 1; font-weight: 900; letter-spacing: 0;">DRIVO</div>`;
  }

  return `
    <img
      src="${escapeHtml(`${siteUrl.replace(/\/$/, "")}/drivo-logo-transparent.png`)}"
      width="112"
      alt="Drivo"
      style="display: block; width: 112px; max-width: 112px; height: auto; border: 0;"
    />`;
}

function shell({
  title,
  preheader,
  label,
  bookingRef,
  body,
  siteUrl,
}: {
  title: string;
  preheader: string;
  label: string;
  bookingRef: string;
  body: string;
  siteUrl?: string | null;
}) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin: 0; padding: 0; background: ${BRAND.bg}; font-family: Arial, Helvetica, sans-serif;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">
      ${escapeHtml(preheader)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${BRAND.bg}; padding: 24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 660px; background: ${BRAND.card}; border-radius: 8px; overflow: hidden; border: 1px solid ${BRAND.border};">
            <tr>
              <td style="background: ${BRAND.navy}; padding: 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align: middle;">${buildLogo(siteUrl)}</td>
                    <td align="right" style="vertical-align: middle;">${badge(bookingRef)}</td>
                  </tr>
                </table>
                <p style="margin: 18px 0 8px; color: #bdf5ee; font-size: 12px; line-height: 1.4; font-weight: 800; text-transform: uppercase;">${escapeHtml(label)}</p>
                <h1 style="margin: 0; color: #ffffff; font-size: 24px; line-height: 1.25;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px;">
                ${body}
              </td>
            </tr>
            <tr>
              <td style="background: #eef6f7; padding: 18px 24px; border-top: 1px solid ${BRAND.border};">
                <p style="margin: 0; color: ${BRAND.navy}; font-size: 13px; line-height: 1.6; font-weight: 700;">Drivo.sk</p>
                <p style="margin: 2px 0 0; color: ${BRAND.muted}; font-size: 12px; line-height: 1.6;">Professional mobility in Bratislava. Internal notification - do not reply.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function textRows(rows: Array<[string, string | number | boolean | Date | null | undefined]>) {
  return rows.map(([label, value]) => `${label}: ${valueOrFallback(value)}`).join("\n");
}

function assistanceSummary(data: SeniorAssistedBookingEmailData) {
  const parts = [
    data.seniorPassenger ? "Senior passenger" : null,
    data.ztpCardHolder ? "ZTP / disabled passenger" : null,
    data.wheelchairUser || data.wheelchairNeeded ? "Wheelchair or mobility assistance" : null,
    data.wavRequired ? "Wheelchair-accessible vehicle requested" : null,
    data.companionRequired ? `Companion required${data.companionCount ? ` (${data.companionCount})` : ""}` : null,
    data.medicalAppointment ? "Medical appointment trip" : null,
    data.waitingTimeRequired ? "Waiting time required" : null,
  ].filter(Boolean);

  return parts.length ? parts.join("; ") : "No structured assistance flags selected";
}

export function buildSeniorAssistedAdminEmail(
  booking: SeniorAssistedBookingEmailData,
  options: { siteUrl?: string | null; adminDashboardUrl?: string | null } = {}
): BuiltEmailTemplate {
  const bookingSummary = [
    row("Booking reference", booking.bookingRef),
    row("Service type", serviceLabel(booking.serviceType)),
    row("Booking status", booking.status || "PENDING"),
    row("Created time", formatDateTime(booking.createdAt)),
    row("Public price status", "Hidden from customer / admin review required"),
  ].join("");

  const customerDetails = [
    row("Customer name", booking.customerName),
    row("Customer email", booking.customerEmail),
    row("Customer phone", booking.customerPhone),
    row("Preferred language", booking.languagePref || "N/A"),
  ].join("");

  const rideDetails = [
    row("Pickup address", booking.pickupAddress),
    row("Destination", booking.dropoffAddress),
    row("Date/time", `${booking.scheduledDate} ${booking.scheduledTime}`),
    row("Passenger count", booking.passengerCount),
    row("Luggage", `${labelValue(booking.luggageType)} (${booking.smallBags || 0} small, ${booking.largeBags || 0} large)`),
    row("Return trip", booking.returnDate || booking.returnTime ? `${booking.returnDate || "N/A"} ${booking.returnTime || ""}` : "No"),
    row("Waiting time", booking.waitingDuration ? `${labelValue(booking.waitingDuration)} ${booking.customWaitingDuration || ""}` : yesNo(booking.waitingTimeRequired)),
  ].join("");

  const assistance = [
    row("Senior passenger", yesNo(booking.seniorPassenger)),
    row("ZTP / disabled passenger", yesNo(booking.ztpCardHolder)),
    row("Wheelchair / mobility assistance", yesNo(booking.wheelchairUser || booking.wheelchairNeeded)),
    row("Companion required", yesNo(booking.companionRequired)),
    row("Medical appointment", yesNo(booking.medicalAppointment)),
    row("Assistance level", labelValue(booking.assistanceLevel)),
    row("Wheelchair type", labelValue(booking.wheelchairType)),
    row("Can transfer to seat", booking.canTransferToSeat == null ? "N/A" : yesNo(booking.canTransferToSeat)),
    row("WAV required", yesNo(booking.wavRequired)),
    row("Passenger remains in wheelchair", yesNo(booking.passengerRemainsInWheelchair)),
    row("Hospital / clinic", booking.hospitalName),
    row("Department", booking.department),
    row("Appointment date/time", booking.appointmentDate || booking.appointmentTime ? `${booking.appointmentDate || "N/A"} ${booking.appointmentTime || ""}` : "N/A"),
    row("Special assistance notes", assistanceSummary(booking)),
    row("Customer notes", booking.specialNotes),
  ].join("");

  const paymentInternal = [
    row("Payment method", booking.paymentMethod),
    row("Internal estimate", formatMoney(booking.estimatedPrice)),
    row("Distance", booking.distanceKm == null ? "N/A" : `${booking.distanceKm} km`),
    row("Admin review required", "Yes"),
    row("Admin dashboard", options.adminDashboardUrl || "N/A"),
  ].join("");

  const html = shell({
    title: "New Senior / Assisted Transport Booking",
    preheader: `Admin full booking details for ${booking.bookingRef}`,
    label: "Admin full details",
    bookingRef: booking.bookingRef,
    siteUrl: options.siteUrl,
    body: `
      <p style="margin: 0 0 16px; color: ${BRAND.text}; font-size: 14px; line-height: 1.6;">
        A Senior / Assisted / Accessible Transport booking was created and requires admin review before price confirmation.
      </p>
      ${section("Booking Summary", bookingSummary)}
      ${section("Customer Details", customerDetails)}
      ${section("Ride Details", rideDetails)}
      ${section("Assistance Requirements", assistance)}
      ${section("Payment / Internal", paymentInternal)}
    `,
  });

  const text = [
    `New Senior / Assisted Transport Booking - ${booking.bookingRef}`,
    "Admin full details",
    "",
    "Booking Summary",
    textRows([
      ["Booking reference", booking.bookingRef],
      ["Service type", serviceLabel(booking.serviceType)],
      ["Booking status", booking.status || "PENDING"],
      ["Created time", formatDateTime(booking.createdAt)],
      ["Public price status", "Hidden from customer / admin review required"],
    ]),
    "",
    "Customer Details",
    textRows([
      ["Customer name", booking.customerName],
      ["Customer email", booking.customerEmail],
      ["Customer phone", booking.customerPhone],
      ["Preferred language", booking.languagePref || "N/A"],
    ]),
    "",
    "Ride Details",
    textRows([
      ["Pickup address", booking.pickupAddress],
      ["Destination", booking.dropoffAddress],
      ["Date/time", `${booking.scheduledDate} ${booking.scheduledTime}`],
      ["Passenger count", booking.passengerCount],
      ["Luggage", `${labelValue(booking.luggageType)} (${booking.smallBags || 0} small, ${booking.largeBags || 0} large)`],
      ["Return trip", booking.returnDate || booking.returnTime ? `${booking.returnDate || "N/A"} ${booking.returnTime || ""}` : "No"],
      ["Waiting time", booking.waitingDuration ? `${labelValue(booking.waitingDuration)} ${booking.customWaitingDuration || ""}` : yesNo(booking.waitingTimeRequired)],
    ]),
    "",
    "Assistance Requirements",
    textRows([
      ["Senior passenger", yesNo(booking.seniorPassenger)],
      ["ZTP / disabled passenger", yesNo(booking.ztpCardHolder)],
      ["Wheelchair / mobility assistance", yesNo(booking.wheelchairUser || booking.wheelchairNeeded)],
      ["Companion required", yesNo(booking.companionRequired)],
      ["Medical appointment", yesNo(booking.medicalAppointment)],
      ["Assistance level", labelValue(booking.assistanceLevel)],
      ["Wheelchair type", labelValue(booking.wheelchairType)],
      ["WAV required", yesNo(booking.wavRequired)],
      ["Special assistance notes", assistanceSummary(booking)],
      ["Customer notes", booking.specialNotes || "N/A"],
    ]),
    "",
    "Payment / Internal",
    textRows([
      ["Payment method", booking.paymentMethod],
      ["Internal estimate", formatMoney(booking.estimatedPrice)],
      ["Admin review required", "Yes"],
      ["Admin dashboard", options.adminDashboardUrl || "N/A"],
    ]),
  ].join("\n");

  return {
    subject: `New Senior / Assisted Transport Booking - ${booking.bookingRef}`,
    html,
    text,
  };
}

export function buildSeniorAssistedDriverSafeEmail(
  booking: SeniorAssistedBookingEmailData,
  options: { siteUrl?: string | null } = {}
): BuiltEmailTemplate {
  const tripDetails = [
    row("Booking reference", booking.bookingRef),
    row("Service type", serviceLabel(booking.serviceType)),
    row("Pickup address", booking.pickupAddress),
    row("Destination", booking.dropoffAddress),
    row("Date/time", `${booking.scheduledDate} ${booking.scheduledTime}`),
  ].join("");

  const vehicleNeeds = [
    row("Passenger count", booking.passengerCount),
    row("Luggage", `${labelValue(booking.luggageType)} (${booking.smallBags || 0} small, ${booking.largeBags || 0} large)`),
    row("Assistance required", assistanceSummary(booking)),
    row("Wheelchair / mobility support", yesNo(booking.wheelchairUser || booking.wheelchairNeeded)),
    row("Wheelchair type", labelValue(booking.wheelchairType)),
    row("WAV required", yesNo(booking.wavRequired)),
    row("Waiting time requirement", booking.waitingDuration ? `${labelValue(booking.waitingDuration)} ${booking.customWaitingDuration || ""}` : yesNo(booking.waitingTimeRequired)),
    row("Return trip requirement", booking.returnDate || booking.returnTime ? `${booking.returnDate || "N/A"} ${booking.returnTime || ""}` : "No"),
  ].join("");

  const instructions = [
    row("Pickup instructions", "Confirm operational details with dispatch/admin before pickup."),
    row("Assistance notes for safe transport", assistanceSummary(booking)),
    row("Passenger contact", "Contact dispatch/admin if passenger contact is required."),
    row("Private notes", "Full private customer notes are withheld from this driver-safe copy."),
  ].join("");

  const html = shell({
    title: "Driver Dispatch Copy",
    preheader: `Driver-safe dispatch copy - safe to forward - ${booking.bookingRef}`,
    label: "Driver-safe dispatch copy - safe to forward",
    bookingRef: booking.bookingRef,
    siteUrl: options.siteUrl,
    body: `
      <div style="margin: 0 0 16px; padding: 14px 16px; background: #e9fbf8; border: 1px solid #a9eee5; border-radius: 8px;">
        <p style="margin: 0; color: ${BRAND.tealDark}; font-size: 14px; line-height: 1.5; font-weight: 800;">
          Driver-safe operational details only. Admin should review and manually forward if needed.
        </p>
      </div>
      ${section("Trip Details", tripDetails)}
      ${section("Passenger / Vehicle Needs", vehicleNeeds)}
      ${section("Driver Instructions", instructions)}
    `,
  });

  const text = [
    `Driver Dispatch Details - Senior / Assisted Transport - ${booking.bookingRef}`,
    "Driver-safe dispatch copy - safe to forward",
    "Driver-safe operational details only.",
    "",
    "Trip Details",
    textRows([
      ["Booking reference", booking.bookingRef],
      ["Service type", serviceLabel(booking.serviceType)],
      ["Pickup address", booking.pickupAddress],
      ["Destination", booking.dropoffAddress],
      ["Date/time", `${booking.scheduledDate} ${booking.scheduledTime}`],
    ]),
    "",
    "Passenger / Vehicle Needs",
    textRows([
      ["Passenger count", booking.passengerCount],
      ["Luggage", `${labelValue(booking.luggageType)} (${booking.smallBags || 0} small, ${booking.largeBags || 0} large)`],
      ["Assistance required", assistanceSummary(booking)],
      ["Wheelchair / mobility support", yesNo(booking.wheelchairUser || booking.wheelchairNeeded)],
      ["WAV required", yesNo(booking.wavRequired)],
      ["Waiting time requirement", booking.waitingDuration ? `${labelValue(booking.waitingDuration)} ${booking.customWaitingDuration || ""}` : yesNo(booking.waitingTimeRequired)],
      ["Return trip requirement", booking.returnDate || booking.returnTime ? `${booking.returnDate || "N/A"} ${booking.returnTime || ""}` : "No"],
    ]),
    "",
    "Driver Instructions",
    textRows([
      ["Pickup instructions", "Confirm operational details with dispatch/admin before pickup."],
      ["Assistance notes for safe transport", assistanceSummary(booking)],
      ["Passenger contact", "Contact dispatch/admin if passenger contact is required."],
      ["Private notes", "Full private customer notes are withheld from this driver-safe copy."],
    ]),
  ].join("\n");

  return {
    subject: `Driver Dispatch Details - Senior / Assisted Transport - ${booking.bookingRef}`,
    html,
    text,
  };
}
