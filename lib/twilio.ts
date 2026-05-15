import twilio from 'twilio';

// Lazy initialization - only create client when credentials are valid
let twilioClient: any = null;

function getTwilioClient() {
  if (twilioClient) return twilioClient;
  
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  // Only initialize if credentials are valid and start with AC
  if (accountSid && authToken && accountSid.startsWith('AC')) {
    twilioClient = twilio(accountSid, authToken);
    return twilioClient;
  }
  
  return null;
}

const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

/**
 * Send OTP via SMS using Twilio
 * @param phone - Full phone number with country code (e.g., +421908467335)
 * @param otp - 6-digit OTP code
 * @returns Success status and message ID
 */
export async function sendSMSOTP(phone: string, otp: string) {
  const client = getTwilioClient();
  
  if (!client) {
    console.error("❌ Twilio not configured - missing or invalid credentials");
    return { success: false, error: "Twilio not configured", method: "none" };
  }

  try {
    const message = await client.messages.create({
      body: `Drivo Verification Code: ${otp}\n\nThis code expires in 5 minutes. Do not share this code with anyone.\n\nIf you didn't request this code, please ignore this message.`,
      from: TWILIO_PHONE_NUMBER,
      to: phone,
    });

    console.log(`✅ SMS OTP sent to ${phone} (Message SID: ${message.sid})`);
    
    return { 
      success: true, 
      method: "sms",
      messageId: message.sid 
    };
  } catch (error: any) {
    console.error("❌ SMS OTP send error:", error.message);
    
    // Handle specific Twilio errors
    if (error.code === 21608) {
      return { success: false, error: "Unable to send SMS to this number. Please verify the number is correct.", method: "sms" };
    }
    if (error.code === 21211) {
      return { success: false, error: "Invalid phone number format", method: "sms" };
    }
    if (error.code === 21612) {
      return { success: false, error: "Phone number is not verified in your Twilio account (trial mode)", method: "sms" };
    }
    
    return { success: false, error: "Failed to send SMS. Please try again.", method: "sms" };
  }
}

/**
 * Send OTP via WhatsApp using Twilio
 * @param phone - Full phone number with country code (e.g., +421908467335)
 * @param otp - 6-digit OTP code
 * @returns Success status and message ID
 */
export async function sendWhatsAppOTP(phone: string, otp: string) {
  const client = getTwilioClient();
  
  if (!client) {
    console.error("❌ Twilio not configured - missing or invalid credentials");
    return { success: false, error: "Twilio not configured", method: "none" };
  }

  try {
    // Format phone number for WhatsApp (remove '+' and add 'whatsapp:')
    const whatsappNumber = phone.startsWith('+') 
      ? `whatsapp:${phone}` 
      : `whatsapp:+${phone}`;

    const message = await twilioClient.messages.create({
      from: `whatsapp:${TWILIO_PHONE_NUMBER}`,
      to: whatsappNumber,
      contentSid: process.env.TWILIO_WHATSAPP_TEMPLATE_SID, // Optional: Use approved WhatsApp template
      contentVariables: process.env.TWILIO_WHATSAPP_TEMPLATE_SID 
        ? JSON.stringify({ otp_code: otp })
        : undefined,
      body: !process.env.TWILIO_WHATSAPP_TEMPLATE_SID 
        ? `🚕 *Drivo Verification Code*\n\nYour verification code is: *${otp}*\n\nThis code expires in 5 minutes.\n\n_Do not share this code with anyone._\n\nIf you didn't request this code, please ignore this message.`
        : undefined,
    });

    console.log(`✅ WhatsApp OTP sent to ${phone} (Message SID: ${message.sid})`);
    
    return { 
      success: true, 
      method: "whatsapp",
      messageId: message.sid 
    };
  } catch (error: any) {
    console.error("❌ WhatsApp OTP send error:", error.message);
    
    // Handle specific Twilio errors
    if (error.code === 21612) {
      return { success: false, error: "Phone number is not verified in your Twilio account (trial mode)", method: "whatsapp" };
    }
    if (error.code === 21211) {
      return { success: false, error: "Invalid phone number format for WhatsApp", method: "whatsapp" };
    }
    if (error.code === 21224) {
      return { success: false, error: "Recipient has not opted in to receive WhatsApp messages", method: "whatsapp" };
    }
    
    return { success: false, error: "Failed to send WhatsApp message. Please try SMS instead.", method: "whatsapp" };
  }
}

/**
 * Send OTP with SMS fallback
 * Tries WhatsApp first, falls back to SMS if WhatsApp fails
 * @param phone - Full phone number with country code
 * @param otp - 6-digit OTP code
 * @returns Success status and method used
 */
export async function sendOTPWithFallback(phone: string, otp: string) {
  // Try WhatsApp first
  const whatsappResult = await sendWhatsAppOTP(phone, otp);
  
  if (whatsappResult.success) {
    return whatsappResult;
  }

  console.log("⚠️ WhatsApp failed, falling back to SMS...");
  
  // Fallback to SMS
  const smsResult = await sendSMSOTP(phone, otp);
  
  return {
    ...smsResult,
    fallbackUsed: true,
    whatsappError: whatsappResult.error
  };
}
