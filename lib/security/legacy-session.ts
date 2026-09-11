import { jwtVerify } from "jose";

export type LegacyPassengerClaims = {
  id?: string;
  type?: string;
  sessionId?: string;
  sessionToken?: string;
};

export async function verifyLegacyPassengerToken(token: string) {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    return payload as LegacyPassengerClaims;
  } catch { return null; }
}
