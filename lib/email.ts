import net from "node:net";
import tls from "node:tls";
import type { Socket } from "node:net";
import type { TLSSocket } from "node:tls";
import type { Booking } from "@prisma/client";
import { Resend } from "resend";
import { EMAIL, PHONE_NUMBER, WHATSAPP_URL } from "./constants";
import { maskEmail, maskPhone } from "./utils";
import {
  buildSeniorAssistedAdminEmail,
  buildSeniorAssistedDriverSafeEmail,
} from "./email-templates/booking-emails";

export interface BookingEmailData {
  bookingRef: string;
  serviceType: string;
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
  specialNotes?: string | null;
  sourceDomain?: string | null;
  estimatedPrice?: number | null;
  distanceKm?: number | null;
  driverName?: string | null;
  driverPhone?: string | null;
  flightNumber?: string | null;
  airline?: string | null;
  waitAndGreet?: boolean | null;
  status?: string | null;
  createdAt?: Date | string | null;
  smallBags?: number | null;
  largeBags?: number | null;
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

type EmailProvider = "smtp" | "resend" | "console" | "none";

export interface EmailSendResult {
  success: boolean;
  provider: EmailProvider;
  warning?: string;
  error?: string;
}

interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

interface SmtpResponse {
  code: number;
  message: string;
}

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

function getAdminEmail() {
  return (
    process.env.ADMIN_BOOKING_EMAIL ||
    process.env.BOOKING_NOTIFICATION_EMAIL ||
    process.env.ADMIN_EMAIL ||
    EMAIL
  );
}

function getFromAddress() {
  return process.env.SMTP_FROM || process.env.EMAIL_FROM || `Drivo <${EMAIL}>`;
}

function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const portValue = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = getFromAddress();

  if (!host || !portValue || !user || !pass || !from) return null;

  const port = Number(portValue);
  if (!Number.isInteger(port) || port <= 0) {
    console.warn(`[email] SMTP_PORT is invalid: ${portValue}`);
    return null;
  }

  return {
    host,
    port,
    user,
    pass,
    from,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
  };
}

function hasPartialSmtpConfig() {
  return [
    process.env.SMTP_HOST,
    process.env.SMTP_PORT,
    process.env.SMTP_USER,
    process.env.SMTP_PASS,
    process.env.SMTP_FROM,
  ].some(Boolean);
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatValue(value: string | number | null | undefined) {
  const text = String(value ?? "").trim();
  return text || "N/A";
}

function formatPrice(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  return `EUR ${value.toFixed(2)}`;
}

function getPublicSiteUrl(sourceDomain?: string | null) {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL;

  if (configured) return configured.replace(/\/$/, "");

  if (sourceDomain && /(^|\.)drivo\.sk$/i.test(sourceDomain)) {
    return `https://${sourceDomain}`;
  }

  return null;
}

function getAdminDashboardUrl(data: BookingEmailData) {
  const siteUrl = getPublicSiteUrl(data.sourceDomain);
  return siteUrl ? `${siteUrl}/admin/bookings` : null;
}

export function isSeniorAssistedService(serviceType: string | null | undefined) {
  const normalized = String(serviceType || "").trim().toUpperCase();
  return normalized === "SENIOR" || normalized === "ACCESSIBLE";
}

function serviceLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function renderRows(rows: Array<[string, string | number | null | undefined]>) {
  return rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #4b5563; font-size: 14px; width: 38%;">
            ${escapeHtml(label)}
          </td>
          <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; color: #111827; font-size: 14px; font-weight: 600;">
            ${escapeHtml(formatValue(value))}
          </td>
        </tr>`
    )
    .join("");
}

function buildEmailShell(title: string, preheader: string, body: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin: 0; padding: 0; background: #f3f4f6; font-family: Arial, Helvetica, sans-serif;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
      ${escapeHtml(preheader)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f3f4f6; padding: 24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 640px; background: #ffffff; border-radius: 8px; overflow: hidden;">
            <tr>
              <td style="background: #113f36; color: #ffffff; padding: 24px;">
                <p style="margin: 0 0 6px; color: #b7f7d1; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase;">Drivo</p>
                <h1 style="margin: 0; font-size: 24px; line-height: 1.25;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px;">
                ${body}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildAdminNotificationEmail(data: BookingEmailData) {
  const rows: Array<[string, string | number | null | undefined]> = [
    ["Booking reference", data.bookingRef],
    ["Customer name", data.customerName],
    ["Customer phone", data.customerPhone],
    ["Customer email", data.customerEmail],
    ["Pickup address", data.pickupAddress],
    ["Dropoff address", data.dropoffAddress],
    ["Scheduled date", data.scheduledDate],
    ["Scheduled time", data.scheduledTime],
    ["Service type", serviceLabel(data.serviceType)],
    ["Passenger count", data.passengerCount],
    ["Luggage type", data.luggageType],
    ["Payment method", data.paymentMethod],
    ["Estimated price", formatPrice(data.estimatedPrice)],
  ];

  if (data.specialNotes) rows.push(["Special notes", data.specialNotes]);
  if (data.flightNumber) rows.push(["Flight number", data.flightNumber]);
  if (data.airline) rows.push(["Airline", data.airline]);
  if (data.waitAndGreet) rows.push(["Wait and greet", "Yes"]);
  if (data.wheelchairNeeded) rows.push(["Wheelchair needed", "Yes"]);
  if (data.distanceKm != null) rows.push(["Distance", `${data.distanceKm} km`]);
  if (data.sourceDomain) rows.push(["Source domain", data.sourceDomain]);

  return buildEmailShell(
    `New booking ${data.bookingRef}`,
    `New Drivo booking from ${data.customerName}`,
    `<p style="margin: 0 0 18px; color: #374151; font-size: 15px; line-height: 1.6;">
      A customer has completed a booking. Details are below.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${renderRows(rows)}
    </table>
    <p style="margin: 22px 0 0; color: #6b7280; font-size: 13px;">
      Admin panel: ${escapeHtml(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000")}/admin/bookings
    </p>`
  );
}

function buildCustomerConfirmationEmail(data: BookingEmailData) {
  const rows: Array<[string, string | number | null | undefined]> = [
    ["Booking reference", data.bookingRef],
    ["Pickup address", data.pickupAddress],
    ["Dropoff address", data.dropoffAddress],
    ["Scheduled date", data.scheduledDate],
    ["Scheduled time", data.scheduledTime],
    ["Service type", serviceLabel(data.serviceType)],
    ["Passenger count", data.passengerCount],
    ["Payment method", data.paymentMethod],
    ["Estimated price", formatPrice(data.estimatedPrice)],
  ];

  return buildEmailShell(
    `Booking confirmed: ${data.bookingRef}`,
    `Your Drivo booking ${data.bookingRef} is confirmed.`,
    `<p style="margin: 0 0 18px; color: #374151; font-size: 15px; line-height: 1.6;">
      Thank you for booking with Drivo. Your ride details are confirmed below.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${renderRows(rows)}
    </table>
    <div style="margin-top: 22px; padding: 16px; background: #ecfdf5; border: 1px solid #bbf7d0; border-radius: 8px;">
      <p style="margin: 0 0 8px; color: #064e3b; font-size: 15px; font-weight: 700;">Drivo support</p>
      <p style="margin: 0; color: #065f46; font-size: 14px; line-height: 1.6;">
        Phone: ${escapeHtml(PHONE_NUMBER)}<br />
        Email: ${escapeHtml(EMAIL)}<br />
        WhatsApp: <a href="${escapeHtml(WHATSAPP_URL)}" style="color: #047857;">${escapeHtml(WHATSAPP_URL)}</a>
      </p>
    </div>`
  );
}

function buildAdminNotificationText(data: BookingEmailData) {
  return [
    `New Drivo booking: ${data.bookingRef}`,
    "",
    `Customer name: ${data.customerName}`,
    `Customer phone: ${data.customerPhone}`,
    `Customer email: ${data.customerEmail}`,
    `Pickup address: ${data.pickupAddress}`,
    `Dropoff address: ${data.dropoffAddress}`,
    `Scheduled date: ${data.scheduledDate}`,
    `Scheduled time: ${data.scheduledTime}`,
    `Service type: ${serviceLabel(data.serviceType)}`,
    `Passenger count: ${data.passengerCount}`,
    `Luggage type: ${data.luggageType}`,
    `Payment method: ${data.paymentMethod}`,
    `Estimated price: ${formatPrice(data.estimatedPrice)}`,
    data.specialNotes ? `Special notes: ${data.specialNotes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCustomerConfirmationText(data: BookingEmailData) {
  return [
    `Your Drivo booking is confirmed: ${data.bookingRef}`,
    "",
    `Pickup address: ${data.pickupAddress}`,
    `Dropoff address: ${data.dropoffAddress}`,
    `Scheduled date: ${data.scheduledDate}`,
    `Scheduled time: ${data.scheduledTime}`,
    `Service type: ${serviceLabel(data.serviceType)}`,
    `Passenger count: ${data.passengerCount}`,
    `Payment method: ${data.paymentMethod}`,
    `Estimated price: ${formatPrice(data.estimatedPrice)}`,
    "",
    "Drivo support",
    `Phone: ${PHONE_NUMBER}`,
    `Email: ${EMAIL}`,
    `WhatsApp: ${WHATSAPP_URL}`,
  ].join("\n");
}

function buildPaymentReceiptHtml(
  data: BookingEmailData & { amount: number; paymentId: string }
) {
  return buildEmailShell(
    `Payment received: ${data.bookingRef}`,
    `Payment received for Drivo booking ${data.bookingRef}.`,
    `<p style="margin: 0 0 18px; color: #374151; font-size: 15px; line-height: 1.6;">
      Thank you. We received your card payment.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${renderRows([
        ["Booking reference", data.bookingRef],
        ["Amount paid", formatPrice(data.amount)],
        ["Payment ID", data.paymentId],
      ])}
    </table>`
  );
}

function extractEmailAddress(from: string) {
  const match = from.match(/<([^>]+)>/);
  return match?.[1] || from;
}

function normalizeRecipients(to: string | string[]) {
  return Array.isArray(to) ? to : [to];
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function dotStuff(value: string) {
  return value.replace(/\r?\n\./g, "\r\n..");
}

function buildMimeMessage(from: string, message: EmailMessage) {
  const recipients = normalizeRecipients(message.to);
  const boundary = `drivo-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return [
    `From: ${from}`,
    `To: ${recipients.join(", ")}`,
    `Subject: ${encodeHeader(message.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    message.text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    message.html,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

async function connectSmtp(config: SmtpConfig): Promise<Socket | TLSSocket> {
  const socket = config.secure
    ? tls.connect({
        host: config.host,
        port: config.port,
        servername: config.host,
      })
    : net.connect({
        host: config.host,
        port: config.port,
      });

  await new Promise<void>((resolve, reject) => {
    const successEvent = config.secure ? "secureConnect" : "connect";
    const cleanup = () => {
      socket.off(successEvent, onSuccess);
      socket.off("error", onError);
    };
    const onSuccess = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    socket.once(successEvent, onSuccess);
    socket.once("error", onError);
  });

  socket.setTimeout(30000);
  return socket;
}

function createSmtpReader(socket: Socket | TLSSocket) {
  let buffer = "";

  return async function readResponse(): Promise<SmtpResponse> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        socket.off("data", onData);
        socket.off("error", onError);
        socket.off("timeout", onTimeout);
      };

      const parse = () => {
        const lines = buffer.split(/\r?\n/).filter(Boolean);
        const finalLine = [...lines].reverse().find((line) => /^\d{3} /.test(line));
        if (!finalLine) return;

        cleanup();
        buffer = "";
        resolve({
          code: Number(finalLine.slice(0, 3)),
          message: lines.join("\n"),
        });
      };

      const onData = (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        parse();
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const onTimeout = () => {
        cleanup();
        reject(new Error("SMTP connection timed out"));
      };

      socket.on("data", onData);
      socket.once("error", onError);
      socket.once("timeout", onTimeout);
      parse();
    });
  };
}

async function expectSmtpResponse(
  readResponse: () => Promise<SmtpResponse>,
  expectedCodes: number[],
  action: string
) {
  const response = await readResponse();
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`${action} failed: ${response.message}`);
  }
  return response;
}

async function writeCommand(
  socket: Socket | TLSSocket,
  readResponse: () => Promise<SmtpResponse>,
  command: string,
  expectedCodes: number[],
  action: string
) {
  socket.write(`${command}\r\n`);
  return expectSmtpResponse(readResponse, expectedCodes, action);
}

async function upgradeToTls(socket: Socket, config: SmtpConfig) {
  const secureSocket = tls.connect({
    socket,
    host: config.host,
    servername: config.host,
  });

  await new Promise<void>((resolve, reject) => {
    secureSocket.once("secureConnect", resolve);
    secureSocket.once("error", reject);
  });

  secureSocket.setTimeout(30000);
  return secureSocket;
}

async function sendViaSmtp(message: EmailMessage, config: SmtpConfig) {
  let socket = await connectSmtp(config);
  let readResponse = createSmtpReader(socket);

  try {
    await expectSmtpResponse(readResponse, [220], "SMTP greeting");

    const ehlo = await writeCommand(
      socket,
      readResponse,
      "EHLO drivo.local",
      [250],
      "SMTP EHLO"
    );

    if (!config.secure && ehlo.message.toUpperCase().includes("STARTTLS")) {
      await writeCommand(socket, readResponse, "STARTTLS", [220], "SMTP STARTTLS");
      socket = await upgradeToTls(socket as Socket, config);
      readResponse = createSmtpReader(socket);
      await writeCommand(socket, readResponse, "EHLO drivo.local", [250], "SMTP EHLO after STARTTLS");
    }

    await writeCommand(socket, readResponse, "AUTH LOGIN", [334], "SMTP auth");
    await writeCommand(
      socket,
      readResponse,
      Buffer.from(config.user, "utf8").toString("base64"),
      [334],
      "SMTP username"
    );
    await writeCommand(
      socket,
      readResponse,
      Buffer.from(config.pass, "utf8").toString("base64"),
      [235],
      "SMTP password"
    );

    const fromAddress = extractEmailAddress(config.from);
    await writeCommand(
      socket,
      readResponse,
      `MAIL FROM:<${fromAddress}>`,
      [250],
      "SMTP MAIL FROM"
    );

    for (const recipient of normalizeRecipients(message.to)) {
      await writeCommand(
        socket,
        readResponse,
        `RCPT TO:<${recipient}>`,
        [250, 251],
        "SMTP RCPT TO"
      );
    }

    await writeCommand(socket, readResponse, "DATA", [354], "SMTP DATA");
    socket.write(`${dotStuff(buildMimeMessage(config.from, message))}\r\n.\r\n`);
    await expectSmtpResponse(readResponse, [250], "SMTP message send");
    socket.write("QUIT\r\n");
  } finally {
    socket.end();
  }
}

async function deliverEmail(message: EmailMessage): Promise<EmailSendResult> {
  const smtpConfig = getSmtpConfig();

  if (smtpConfig) {
    try {
      await sendViaSmtp(message, smtpConfig);
      return { success: true, provider: "smtp" };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      return { success: false, provider: "smtp", error: messageText };
    }
  }

  if (hasPartialSmtpConfig()) {
    console.warn(
      "[email] SMTP configuration is incomplete. Required: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM."
    );
  }

  if (resend) {
    try {
      await resend.emails.send({
        from: getFromAddress(),
        to: normalizeRecipients(message.to),
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      return { success: true, provider: "resend" };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      return { success: false, provider: "resend", error: messageText };
    }
  }

  return {
    success: false,
    provider: "console",
    warning: "No email provider configured. Set SMTP_* variables or RESEND_API_KEY.",
  };
}

function logEmailResult(label: string, to: string, result: EmailSendResult) {
  if (result.success) {
    console.log(`[email] ${label} sent via ${result.provider} to ${to}`);
    return;
  }

  console.warn(
    `[email] ${label} was not sent via ${result.provider}: ${
      result.error || result.warning || "unknown warning"
    }`
  );
}

export function bookingToEmailData(booking: Booking): BookingEmailData {
  return {
    bookingRef: booking.bookingRef,
    serviceType: booking.serviceType,
    pickupAddress: booking.pickupAddress,
    dropoffAddress: booking.dropoffAddress,
    scheduledDate: booking.scheduledDate,
    scheduledTime: booking.scheduledTime,
    passengerCount: booking.passengerCount,
    customerName: booking.customerName,
    customerPhone: `${booking.customerPhoneCode}${booking.customerPhone}`,
    customerEmail: booking.customerEmail || "",
    languagePref: booking.languagePref,
    paymentMethod: booking.paymentMethod,
    wheelchairNeeded: booking.wheelchairNeeded,
    luggageType: booking.luggageType,
    specialNotes: booking.specialNotes,
    sourceDomain: booking.sourceDomain,
    estimatedPrice: booking.estimatedPrice,
    distanceKm: booking.distanceKm,
    flightNumber: booking.flightNumber,
    airline: booking.airline,
    waitAndGreet: booking.waitAndGreet,
    status: booking.status,
    createdAt: booking.createdAt,
    smallBags: booking.smallBags,
    largeBags: booking.largeBags,
    seniorPassenger: booking.seniorPassenger,
    ztpCardHolder: booking.ztpCardHolder,
    wheelchairUser: booking.wheelchairUser,
    companionRequired: booking.companionRequired,
    medicalAppointment: booking.medicalAppointment,
    waitingTimeRequired: booking.waitingTimeRequired,
    assistanceLevel: booking.assistanceLevel,
    wheelchairType: booking.wheelchairType,
    canTransferToSeat: booking.canTransferToSeat,
    wavRequired: booking.wavRequired,
    passengerRemainsInWheelchair: booking.passengerRemainsInWheelchair,
    companionCount: booking.companionCount,
    hospitalName: booking.hospitalName,
    department: booking.department,
    appointmentDate: booking.appointmentDate,
    appointmentTime: booking.appointmentTime,
    tripType: booking.tripType,
    returnDate: booking.returnDate,
    returnTime: booking.returnTime,
    waitingDuration: booking.waitingDuration,
    customWaitingDuration: booking.customWaitingDuration,
  };
}

export async function notifyAdminNewBooking(
  data: BookingEmailData
): Promise<EmailSendResult> {
  const adminEmail = getAdminEmail();

  console.log("[email] Admin booking notification requested", {
    bookingRef: data.bookingRef,
    to: adminEmail,
    customer: data.customerName,
    customerPhone: maskPhone(data.customerPhone),
    customerEmail: maskEmail(data.customerEmail),
    paymentMethod: data.paymentMethod,
  });

  const result = await deliverEmail({
    to: adminEmail,
    subject: `New Drivo booking ${data.bookingRef} - ${serviceLabel(data.serviceType)}`,
    html: buildAdminNotificationEmail(data),
    text: buildAdminNotificationText(data),
  });

  logEmailResult("Admin booking notification", adminEmail, result);
  return result;
}

export async function sendSeniorAssistedBookingEmails(data: BookingEmailData) {
  const adminEmail = getAdminEmail();
  const siteUrl = getPublicSiteUrl(data.sourceDomain);
  const adminTemplate = buildSeniorAssistedAdminEmail(data, {
    siteUrl,
    adminDashboardUrl: getAdminDashboardUrl(data),
  });
  const driverSafeTemplate = buildSeniorAssistedDriverSafeEmail(data, { siteUrl });

  console.log("[email] Senior/assisted admin-only notification requested", {
    bookingRef: data.bookingRef,
    to: adminEmail,
    customer: data.customerName,
    customerPhone: maskPhone(data.customerPhone),
    customerEmail: maskEmail(data.customerEmail),
  });

  const [adminFull, driverSafe] = await Promise.all([
    deliverEmail({
      to: adminEmail,
      subject: adminTemplate.subject,
      html: adminTemplate.html,
      text: adminTemplate.text,
    }),
    deliverEmail({
      to: adminEmail,
      subject: `Driver-safe dispatch copy - safe to forward - ${driverSafeTemplate.subject}`,
      html: driverSafeTemplate.html,
      text: driverSafeTemplate.text,
    }),
  ]);

  logEmailResult("Senior/assisted admin full booking email", adminEmail, adminFull);
  logEmailResult("Senior/assisted driver-safe dispatch copy", adminEmail, driverSafe);

  if (!adminFull.success || !driverSafe.success) {
    console.warn(
      `[email] Senior/assisted booking ${data.bookingRef} saved, but one or more admin-only emails failed.`
    );
  }

  return { adminFull, driverSafe };
}
export async function sendCustomerConfirmation(
  data: BookingEmailData
): Promise<EmailSendResult> {
  if (!data.customerEmail) {
    const result: EmailSendResult = {
      success: false,
      provider: "none",
      warning: "Customer email is missing.",
    };
    logEmailResult("Customer booking confirmation", "missing customer email", result);
    return result;
  }

  console.log("[email] Customer booking confirmation requested", {
    bookingRef: data.bookingRef,
    to: maskEmail(data.customerEmail),
  });

  const result = await deliverEmail({
    to: data.customerEmail,
    subject: `Booking confirmed - ${data.bookingRef} | Drivo`,
    html: buildCustomerConfirmationEmail(data),
    text: buildCustomerConfirmationText(data),
  });

  logEmailResult("Customer booking confirmation", maskEmail(data.customerEmail), result);
  return result;
}

export async function sendBookingCompletionEmails(data: BookingEmailData) {
  console.log(`[email] Booking completion email flow started for ${data.bookingRef}`);

  if (isSeniorAssistedService(data.serviceType)) {
    console.log(
      `[email] Standard completion emails skipped for senior/assisted booking ${data.bookingRef}; admin-only emails are sent at booking creation.`
    );
    return {
      admin: { success: true, provider: "none" as const, warning: "Skipped for senior/assisted booking." },
      customer: { success: true, provider: "none" as const, warning: "Skipped for senior/assisted booking." },
      skipped: true,
    };
  }

  const [admin, customer] = await Promise.all([
    notifyAdminNewBooking(data),
    sendCustomerConfirmation(data),
  ]);

  if (!admin.success || !customer.success) {
    console.warn(
      `[email] Booking ${data.bookingRef} completed, but one or more emails failed. Booking remains saved.`
    );
  }

  return { admin, customer };
}

export async function sendPaymentReceipt(
  data: BookingEmailData & { amount: number; paymentId: string }
): Promise<EmailSendResult> {
  if (!data.customerEmail) {
    const result: EmailSendResult = {
      success: false,
      provider: "none",
      warning: "Customer email is missing.",
    };
    logEmailResult("Payment receipt", "missing customer email", result);
    return result;
  }

  console.log("[email] Payment receipt requested", {
    bookingRef: data.bookingRef,
    to: maskEmail(data.customerEmail),
    amount: data.amount,
  });

  const result = await deliverEmail({
    to: data.customerEmail,
    subject: `Payment receipt - ${data.bookingRef} | Drivo`,
    html: buildPaymentReceiptHtml(data),
    text: [
      `Payment received for booking ${data.bookingRef}`,
      `Amount paid: ${formatPrice(data.amount)}`,
      `Payment ID: ${data.paymentId}`,
    ].join("\n"),
  });

  logEmailResult("Payment receipt", maskEmail(data.customerEmail), result);
  return result;
}
