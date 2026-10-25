const childrenTransportSetting =
  process.env.NEXT_PUBLIC_CHILDREN_TRANSPORT_ENABLED?.trim().toLowerCase();

export const FEATURE_FLAGS = Object.freeze({
  childrenTransport: childrenTransportSetting === "true" || childrenTransportSetting === "1",
});

export function isCustomerServiceEnabled(serviceType: string | null | undefined) {
  return serviceType?.trim().toLowerCase() !== "children" || FEATURE_FLAGS.childrenTransport;
}
