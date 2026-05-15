/**
 * Generate unique booking reference: DRV-2025-0001
 */
export function generateBookingRef(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(1000 + Math.random() * 9000);
  const timestamp = Date.now().toString().slice(-4);
  return `DRV-${year}-${timestamp}${random}`;
}

/**
 * Generate 6-digit OTP code
 */
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Mask phone number for logging (GDPR)
 * +421 912 345 678 → +421 ****** 678
 */
export function maskPhone(phone: string): string {
  if (phone.length <= 4) return "****";
  return phone.slice(0, 4) + " ****** " + phone.slice(-3);
}

/**
 * Mask email for logging (GDPR)
 * test@email.com → t***@email.com
 */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "****";
  return name[0] + "***@" + domain;
}

/**
 * Check if OTP is expired (5 minutes)
 */
export function isOTPExpired(sentAt: Date | null): boolean {
  if (!sentAt) return true;
  const fiveMinutes = 5 * 60 * 1000;
  return Date.now() - sentAt.getTime() > fiveMinutes;
}

/**
 * Get source domain from request headers
 */
export function getSourceDomain(request: Request): string {
  const host = request.headers.get("host") || "unknown";
  return host.replace(":3000", "").replace(":3001", "");
}