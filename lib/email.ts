import { maskPhone, maskEmail } from "./utils";
import { WHATSAPP_URL } from "./constants";
import { Resend } from 'resend';

// Initialize Resend client
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

interface BookingEmailData {
  bookingRef: string;
  serviceType: string;
  pickupAddress: string;
  dropoffAddress: string;
  scheduledDate: string;
  scheduledTime: string;
  passengerCount: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  languagePref?: string;
  paymentMethod: string;
  wheelchairNeeded: boolean;
  luggageType: string;
  specialNotes?: string | null;
  sourceDomain?: string | null;
  estimatedPrice?: number;
  distanceKm?: number;
  driverName?: string;
  driverPhone?: string;
  flightNumber?: string | null;
  airline?: string | null;
  waitAndGreet?: boolean;
}

/**
 * Build HTML email template for booking confirmation
 */
function buildCustomerConfirmationEmail(data: BookingEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmation - Drivo</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <tr>
      <td style="background: linear-gradient(135deg, #1a365d 0%, #2c5282 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">
          🚕 Drivo
        </h1>
        <p style="color: #48bb78; margin: 10px 0 0 0; font-size: 16px; font-weight: 600;">
          Booking Confirmed!
        </p>
      </td>
    </tr>

    <!-- Booking Reference -->
    <tr>
      <td style="background: #ffffff; padding: 30px; text-align: center;">
        <p style="color: #718096; margin: 0 0 10px 0; font-size: 14px;">Your Booking Reference</p>
        <h2 style="color: #48bb78; margin: 0; font-size: 32px; font-weight: bold; letter-spacing: 2px;">
          ${data.bookingRef}
        </h2>
      </td>
    </tr>

    <!-- Trip Details -->
    <tr>
      <td style="background: #ffffff; padding: 0 30px 30px 30px;">
        <h3 style="color: #1a365d; margin: 0 0 20px 0; font-size: 18px;">Trip Details</h3>
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background: #f7fafc; border-radius: 8px; padding: 20px;">
          <tr>
            <td style="padding: 8px 0;">
              <strong style="color: #4a5568; font-size: 14px;">📍 Pickup:</strong>
              <p style="color: #2d3748; margin: 5px 0 0 0; font-size: 16px;">${data.pickupAddress}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-top: 1px solid #e2e8f0;">
              <strong style="color: #4a5568; font-size: 14px;">📍 Drop-off:</strong>
              <p style="color: #2d3748; margin: 5px 0 0 0; font-size: 16px;">${data.dropoffAddress}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-top: 1px solid #e2e8f0;">
              <strong style="color: #4a5568; font-size: 14px;">📅 Date & Time:</strong>
              <p style="color: #2d3748; margin: 5px 0 0 0; font-size: 16px;">${data.scheduledDate} at ${data.scheduledTime}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-top: 1px solid #e2e8f0;">
              <strong style="color: #4a5568; font-size: 14px;">👥 Passengers:</strong>
              <p style="color: #2d3748; margin: 5px 0 0 0; font-size: 16px;">${data.passengerCount}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-top: 1px solid #e2e8f0;">
              <strong style="color: #4a5568; font-size: 14px;">🧳 Luggage:</strong>
              <p style="color: #2d3748; margin: 5px 0 0 0; font-size: 16px;">${data.luggageType}</p>
            </td>
          </tr>
          ${data.languagePref ? `
          <tr>
            <td style="padding: 8px 0; border-top: 1px solid #e2e8f0;">
              <strong style="color: #4a5568; font-size: 14px;">🌐 Language:</strong>
              <p style="color: #2d3748; margin: 5px 0 0 0; font-size: 16px; text-transform: capitalize;">${data.languagePref}</p>
            </td>
          </tr>
          ` : ''}
          ${data.flightNumber ? `
          <tr>
            <td style="padding: 8px 0; border-top: 1px solid #e2e8f0;">
              <strong style="color: #4a5568; font-size: 14px;">✈️ Flight Number:</strong>
              <p style="color: #2d3748; margin: 5px 0 0 0; font-size: 16px;">${data.flightNumber}${data.airline ? ` (${data.airline})` : ''}</p>
            </td>
          </tr>
          ` : ''}
          ${data.waitAndGreet ? `
          <tr>
            <td style="padding: 8px 0; border-top: 1px solid #e2e8f0;">
              <strong style="color: #4a5568; font-size: 14px;">🤝 Wait & Greet:</strong>
              <p style="color: #2d3748; margin: 5px 0 0 0; font-size: 16px;">Yes - Driver will meet you at arrivals with name sign</p>
            </td>
          </tr>
          ` : ''}
          ${data.distanceKm ? `
          <tr>
            <td style="padding: 8px 0; border-top: 1px solid #e2e8f0;">
              <strong style="color: #4a5568; font-size: 14px;">📏 Distance:</strong>
              <p style="color: #2d3748; margin: 5px 0 0 0; font-size: 16px;">${data.distanceKm} km</p>
            </td>
          </tr>
          ` : ''}
        </table>
      </td>
    </tr>

    ${data.estimatedPrice ? `
    <!-- Price -->
    <tr>
      <td style="background: #ffffff; padding: 0 30px 30px 30px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background: #c6f6d5; border-radius: 8px; padding: 20px; border: 2px solid #48bb78;">
          <tr>
            <td style="text-align: center;">
              <p style="color: #22543d; margin: 0 0 5px 0; font-size: 14px;">Estimated Price</p>
              <h3 style="color: #22543d; margin: 0; font-size: 28px; font-weight: bold;">€${data.estimatedPrice.toFixed(2)}</h3>
              <p style="color: #2f855a; margin: 10px 0 0 0; font-size: 12px;">Payment method: ${data.paymentMethod}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ` : ''}

    ${data.wheelchairNeeded ? `
    <!-- Accessibility -->
    <tr>
      <td style="background: #ffffff; padding: 0 30px 30px 30px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background: #e9d8fd; border-radius: 8px; padding: 20px;">
          <tr>
            <td>
              <strong style="color: #553c9a; font-size: 14px;">♿ Wheelchair Assistance</strong>
              <p style="color: #553c9a; margin: 5px 0 0 0; font-size: 13px;">
                Our trained driver will provide boarding assistance. Accessible transport assistance available on request.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ` : ''}

    ${data.driverName ? `
    <!-- Driver Info -->
    <tr>
      <td style="background: #ffffff; padding: 0 30px 30px 30px;">
        <h3 style="color: #1a365d; margin: 0 0 20px 0; font-size: 18px;">Your Driver</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="background: #fef5e7; border-radius: 8px; padding: 20px;">
          <tr>
            <td>
              <strong style="color: #744210; font-size: 16px;">👤 ${data.driverName}</strong>
              ${data.driverPhone ? `<p style="color: #975a16; margin: 5px 0 0 0; font-size: 14px;">📞 ${data.driverPhone}</p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ` : ''}

    <!-- Important Info -->
    <tr>
      <td style="background: #ffffff; padding: 0 30px 30px 30px;">
        <h3 style="color: #1a365d; margin: 0 0 20px 0; font-size: 18px;">Important Information</h3>
        <ul style="color: #4a5568; font-size: 14px; line-height: 1.6; margin: 0; padding-left: 20px;">
          ${data.paymentMethod === 'CASH' ? `
          <li style="margin-bottom: 10px;"><strong style="color: #e53e3e;">⚠️ Cash Payment:</strong> Please pay the driver BEFORE the journey starts.</li>
          ` : ''}
          <li style="margin-bottom: 10px;">We'll send you a WhatsApp message with driver details closer to your booking time.</li>
          <li style="margin-bottom: 10px;">Please be ready 5 minutes before your scheduled pickup time.</li>
          <li style="margin-bottom: 10px;">Need to cancel or modify? Contact us on WhatsApp.</li>
        </ul>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background: #1a365d; padding: 30px; text-align: center; border-radius: 0 0 12px 12px;">
        <p style="color: #ffffff; margin: 0 0 10px 0; font-size: 16px; font-weight: 600;">
          Need Help?
        </p>
        <p style="margin: 0 0 15px 0;">
          <a href="${WHATSAPP_URL}" style="color: #48bb78; text-decoration: none; font-size: 16px; font-weight: 600;">
            💬 WhatsApp Us
          </a>
        </p>
        <p style="color: #a0aec0; margin: 0; font-size: 12px;">
          Drivo s.r.o. | Bratislava, Slovakia<br/>
          Move freely. Move with dignity.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Build HTML email template for admin notification
 */
function buildAdminNotificationEmail(data: BookingEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Booking - Drivo</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <tr>
      <td style="background: #1a365d; padding: 20px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">
          📧 New Booking Notification
        </h1>
      </td>
    </tr>

    <!-- Booking Info -->
    <tr>
      <td style="background: #ffffff; padding: 30px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 5px 0;">
              <strong style="color: #4a5568; font-size: 14px;">Reference:</strong>
              <span style="color: #2d3748; font-size: 14px; margin-left: 10px; font-weight: 600;">${data.bookingRef}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 5px 0;">
              <strong style="color: #4a5568; font-size: 14px;">Service:</strong>
              <span style="color: #2d3748; font-size: 14px; margin-left: 10px;">${data.serviceType}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 5px 0;">
              <strong style="color: #4a5568; font-size: 14px;">Date:</strong>
              <span style="color: #2d3748; font-size: 14px; margin-left: 10px;">${data.scheduledDate} ${data.scheduledTime}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 5px 0; border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 10px;">
              <strong style="color: #4a5568; font-size: 14px;">Pickup:</strong>
              <p style="color: #2d3748; margin: 5px 0 0 0; font-size: 14px;">${data.pickupAddress}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 5px 0;">
              <strong style="color: #4a5568; font-size: 14px;">Drop-off:</strong>
              <p style="color: #2d3748; margin: 5px 0 0 0; font-size: 14px;">${data.dropoffAddress}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 5px 0; border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 10px;">
              <strong style="color: #4a5568; font-size: 14px;">Customer:</strong>
              <span style="color: #2d3748; font-size: 14px; margin-left: 10px;">${data.customerName}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 5px 0;">
              <strong style="color: #4a5568; font-size: 14px;">Phone:</strong>
              <span style="color: #2d3748; font-size: 14px; margin-left: 10px;">${data.customerPhone}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 5px 0;">
              <strong style="color: #4a5568; font-size: 14px;">Payment:</strong>
              <span style="color: #2d3748; font-size: 14px; margin-left: 10px;">${data.paymentMethod}</span>
            </td>
          </tr>
          ${data.languagePref ? `
          <tr>
            <td style="padding: 5px 0;">
              <strong style="color: #4a5568; font-size: 14px;">Language:</strong>
              <span style="color: #2d3748; font-size: 14px; margin-left: 10px; text-transform: capitalize;">${data.languagePref}</span>
            </td>
          </tr>
          ` : ''}
          ${data.luggageType && data.luggageType !== 'NONE' ? `
          <tr>
            <td style="padding: 5px 0;">
              <strong style="color: #4a5568; font-size: 14px;">Luggage:</strong>
              <span style="color: #2d3748; font-size: 14px; margin-left: 10px;">${data.luggageType}</span>
            </td>
          </tr>
          ` : ''}
          ${data.flightNumber ? `
          <tr>
            <td style="padding: 5px 0;">
              <strong style="color: #4a5568; font-size: 14px;">Flight:</strong>
              <span style="color: #2d3748; font-size: 14px; margin-left: 10px;">${data.flightNumber}${data.airline ? ` (${data.airline})` : ''}</span>
            </td>
          </tr>
          ` : ''}
          ${data.wheelchairNeeded ? `
          <tr>
            <td style="padding: 5px 0;">
              <strong style="color: #e53e3e; font-size: 14px;">♿ Wheelchair:</strong>
              <span style="color: #e53e3e; font-size: 14px; margin-left: 10px; font-weight: 600;">YES</span>
            </td>
          </tr>
          ` : ''}
        </table>
      </td>
    </tr>

    <!-- Action Button -->
    <tr>
      <td style="background: #ffffff; padding: 0 30px 30px 30px; text-align: center;">
        <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/admin/bookings" 
           style="background: #48bb78; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
          View in Admin Panel
        </a>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Send booking notification to admin/dispatcher
 */
export async function notifyAdminNewBooking(data: BookingEmailData) {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@drivo.sk";

  // Log to console (always)
  console.log("=========================================");
  console.log("📧 NEW BOOKING NOTIFICATION");
  console.log(`To: ${adminEmail}`);
  console.log(`Ref: ${data.bookingRef}`);
  console.log(`Service: ${data.serviceType}`);
  console.log(`From: ${data.pickupAddress}`);
  console.log(`To: ${data.dropoffAddress}`);
  console.log(`Date: ${data.scheduledDate} ${data.scheduledTime}`);
  console.log(`Passengers: ${data.passengerCount}`);
  console.log(`Luggage: ${data.luggageType}`);
  console.log(`Language: ${data.languagePref || 'sk'}`);
  console.log(`Wheelchair: ${data.wheelchairNeeded ? "YES" : "No"}`);
  if (data.flightNumber) console.log(`Flight: ${data.flightNumber}${data.airline ? ` (${data.airline})` : ''}`);
  if (data.waitAndGreet) console.log(`Wait & Greet: YES`);
  console.log(`Customer: ${data.customerName}`);
  console.log(`Phone: ${maskPhone(data.customerPhone)}`);
  console.log(`Email: ${data.customerEmail ? maskEmail(data.customerEmail) : "N/A"}`);
  console.log(`Payment: ${data.paymentMethod}`);
  console.log(`Notes: ${data.specialNotes || "None"}`);
  console.log(`Source: ${data.sourceDomain || "direct"}`);
  console.log("=========================================");

  // Send real email if Resend is configured
  if (resend && process.env.NODE_ENV === "production") {
    try {
      await resend.emails.send({
        from: "Drivo <noreply@drivo.sk>",
        to: [adminEmail],
        subject: `🆕 New Booking ${data.bookingRef} — ${data.serviceType}`,
        html: buildAdminNotificationEmail(data),
      });
      console.log(`✅ Admin notification email sent to ${adminEmail}`);
    } catch (error: any) {
      console.error("❌ Failed to send admin notification email:", error.message);
    }
  }

  return { success: true, method: resend ? "email" : "console" };
}

/**
 * Send booking confirmation to customer
 */
export async function sendCustomerConfirmation(data: BookingEmailData) {
  if (!data.customerEmail) {
    console.log("⚠️ No customer email provided, skipping confirmation");
    return { success: true, method: "none" };
  }

  console.log("=========================================");
  console.log("📧 CUSTOMER CONFIRMATION");
  console.log(`To: ${maskEmail(data.customerEmail)}`);
  console.log(`Booking: ${data.bookingRef} CONFIRMED`);
  console.log("=========================================");

  // Send real email if Resend is configured
  if (resend) {
    try {
      await resend.emails.send({
        from: "Drivo <noreply@drivo.sk>",
        to: [data.customerEmail],
        subject: `✅ Booking Confirmed - ${data.bookingRef} | Drivo`,
        html: buildCustomerConfirmationEmail(data),
      });
      console.log(`✅ Confirmation email sent to ${data.customerEmail}`);
    } catch (error: any) {
      console.error("❌ Failed to send confirmation email:", error.message);
      return { success: false, method: "error", error: error.message };
    }
  }

  return { success: true, method: resend ? "email" : "console" };
}

/**
 * Send payment receipt to customer
 */
export async function sendPaymentReceipt(data: BookingEmailData & { amount: number; paymentId: string }) {
  if (!data.customerEmail) {
    return { success: true, method: "none" };
  }

  console.log(`📧 Payment receipt for ${data.customerEmail} - €${data.amount}`);

  if (resend) {
    try {
      await resend.emails.send({
        from: "Drivo <noreply@drivo.sk>",
        to: [data.customerEmail],
        subject: `💳 Payment Receipt - ${data.bookingRef} | Drivo`,
        html: `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; font-family: sans-serif; background: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <tr>
      <td style="background: #48bb78; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0;">Payment Received</h1>
      </td>
    </tr>
    <tr>
      <td style="background: #ffffff; padding: 30px;">
        <p style="font-size: 16px; color: #2d3748;">Thank you for your payment!</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background: #f7fafc; padding: 20px; border-radius: 8px;">
          <tr><td><strong>Booking Reference:</strong></td><td>${data.bookingRef}</td></tr>
          <tr><td><strong>Amount Paid:</strong></td><td style="font-size: 20px; font-weight: bold; color: #48bb78;">€${data.amount.toFixed(2)}</td></tr>
          <tr><td><strong>Payment ID:</strong></td><td>${data.paymentId}</td></tr>
          <tr><td><strong>Date:</strong></td><td>${new Date().toLocaleDateString()}</td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="background: #1a365d; padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
        <p style="color: #ffffff; margin: 0;">Drivo s.r.o. | Bratislava</p>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
      });
      console.log(`✅ Payment receipt sent to ${data.customerEmail}`);
    } catch (error: any) {
      console.error("❌ Failed to send payment receipt:", error.message);
    }
  }

  return { success: true, method: resend ? "email" : "console" };
}
