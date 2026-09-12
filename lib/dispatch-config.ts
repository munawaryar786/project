export const DISPATCH_CONFIG_ERROR = "DISPATCH_CONFIG_MISSING" as const;

export type DispatchConfig = {
  offerTtlSeconds: number;
  locationMaxAgeSeconds: number;
};

function positiveInteger(value: string | undefined) {
  if (!value || !/^\\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getDispatchConfig(overrides?: Partial<DispatchConfig>) {
  const offerTtlSeconds = overrides?.offerTtlSeconds ?? positiveInteger(process.env.DRIVO_DISPATCH_OFFER_TTL_SECONDS);
  const locationMaxAgeSeconds = overrides?.locationMaxAgeSeconds ?? positiveInteger(process.env.DRIVO_DISPATCH_LOCATION_MAX_AGE_SECONDS);
  if (!offerTtlSeconds || !locationMaxAgeSeconds) {
    return { ok: false as const, code: DISPATCH_CONFIG_ERROR };
  }
  return { ok: true as const, config: { offerTtlSeconds, locationMaxAgeSeconds } };
}
