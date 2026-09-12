import twilio from "twilio";
import { maskPhone } from "./utils";

let twilioClient: any = null;

function getTwilioClient() {
  if (twilioClient) return twilioClient;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken || !accountSid.startsWith("AC")) return null;
  twilioClient = twilio(accountSid, authToken);
  return twilioClient;
}

function getVerifyService() {
  const client = getTwilioClient();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!client || !serviceSid || !serviceSid.startsWith("VA")) return null;
  return client.verify.v2.services(serviceSid);
}

export type TwilioVerifyResult =
  | { success: true; status: string }
  | { success: false; error: string; providerCode?: string };

/** Send the first-registration challenge through Twilio Verify WhatsApp. */
export async function sendWhatsAppVerification(phone: string): Promise<TwilioVerifyResult> {
  const service = getVerifyService();
  if (!service) {
    console.error("Twilio Verify is not configured for passenger verification");
    return { success: false, error: "Verification service is temporarily unavailable." };
  }

  try {
    const verification = await service.verifications.create({ to: phone, channel: "whatsapp" });
    console.info("Twilio Verify WhatsApp challenge requested", {
      phone: maskPhone(phone),
      status: verification.status,
      channel: "whatsapp",
    });
    return { success: true, status: String(verification.status || "pending") };
  } catch (error: any) {
    console.error("Twilio Verify WhatsApp send failed", {
      code: error?.code ? String(error.code) : "unknown",
      status: error?.status ? String(error.status) : "unknown",
    });
    return { success: false, error: "We could not send a WhatsApp verification code. Please try again.", providerCode: error?.code ? String(error.code) : undefined };
  }
}

/** Check the code with Twilio Verify; Drivo never compares or stores the code. */
export async function checkWhatsAppVerification(phone: string, code: string): Promise<TwilioVerifyResult> {
  const service = getVerifyService();
  if (!service) {
    console.error("Twilio Verify is not configured for passenger verification");
    return { success: false, error: "Verification service is temporarily unavailable." };
  }

  try {
    const check = await service.verificationChecks.create({ to: phone, code });
    const status = String(check.status || "").toLowerCase();
    if (status !== "approved") return { success: false, error: "Invalid or expired verification code." };
    return { success: true, status };
  } catch (error: any) {
    console.error("Twilio Verify WhatsApp check failed", {
      code: error?.code ? String(error.code) : "unknown",
      status: error?.status ? String(error.status) : "unknown",
    });
    return { success: false, error: "Invalid or expired verification code.", providerCode: error?.code ? String(error.code) : undefined };
  }
}

export function twilioVerifyConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.startsWith("AC") &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_VERIFY_SERVICE_SID?.startsWith("VA")
  );
}

// Retained for unrelated legacy integrations; first-registration and recovery do not call it.
export async function sendSMSOTP(phone: string, otp: string) {
  const client = getTwilioClient();
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!client || !from) return { success: false, error: "SMS service is unavailable.", method: "sms" };
  try {
    const message = await client.messages.create({
      body: `Drivo verification code: ${otp}`,
      from,
      to: phone,
    });
    console.info("Legacy SMS delivery requested", { phone: maskPhone(phone), sidPresent: Boolean(message.sid) });
    return { success: true, method: "sms", messageId: message.sid };
  } catch (error: any) {
    console.error("Legacy SMS delivery failed", { code: error?.code ? String(error.code) : "unknown" });
    return { success: false, error: "SMS delivery failed.", method: "sms" };
  }
}
