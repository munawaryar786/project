export type PopularRoutePriority = "featured" | "secondary";
export type PopularRouteCategory = "airport" | "crossBorder" | "city" | "slovakia";

export type PopularRoute = {
  slug: string;
  name: string;
  homeName?: string;
  from: string;
  to: string;
  pickupAddress: string;
  dropoffAddress: string;
  distance: string;
  travelTime: string;
  fromPrice: number;
  priority: PopularRoutePriority;
  category: PopularRouteCategory;
  homeFeatured?: boolean;
  bookingQuick?: boolean;
  destinationCoords?: {
    lat: number;
    lng: number;
  };
};

export const BRATISLAVA_PICKUP_ADDRESS = "Bratislava, Slovakia";

export const POPULAR_ROUTES: PopularRoute[] = [
  {
    slug: "bratislava-vienna-airport",
    name: "Bratislava ? Vienna Airport",
    from: "Bratislava",
    to: "Vienna Airport",
    pickupAddress: BRATISLAVA_PICKUP_ADDRESS,
    dropoffAddress: "Vienna International Airport (VIE)",
    distance: "65-75 km",
    travelTime: "50-60 min",
    fromPrice: 69,
    priority: "featured",
    category: "airport",
    homeFeatured: true,
    bookingQuick: true,
    destinationCoords: { lat: 48.1103, lng: 16.5697 },
  },
  {
    slug: "bratislava-vienna-city-centre",
    name: "Bratislava ? Vienna City Centre",
    from: "Bratislava",
    to: "Vienna City Centre",
    pickupAddress: BRATISLAVA_PICKUP_ADDRESS,
    dropoffAddress: "Vienna City Centre, Austria",
    distance: "80 km",
    travelTime: "60-75 min",
    fromPrice: 89,
    priority: "featured",
    category: "city",
    homeFeatured: true,
    bookingQuick: true,
    destinationCoords: { lat: 48.2082, lng: 16.3738 },
  },
  {
    slug: "bratislava-bratislava-airport",
    name: "Bratislava ? Bratislava Airport",
    from: "Bratislava",
    to: "Bratislava Airport",
    pickupAddress: BRATISLAVA_PICKUP_ADDRESS,
    dropoffAddress: "Bratislava Airport (BTS)",
    distance: "12 km",
    travelTime: "15-20 min",
    fromPrice: 19,
    priority: "featured",
    category: "airport",
    homeFeatured: true,
    bookingQuick: true,
    destinationCoords: { lat: 48.1702, lng: 17.2127 },
  },
  {
    slug: "bratislava-budapest-airport",
    name: "Bratislava ? Budapest Airport",
    from: "Bratislava",
    to: "Budapest Airport",
    pickupAddress: BRATISLAVA_PICKUP_ADDRESS,
    dropoffAddress: "Budapest Airport (BUD)",
    distance: "210 km",
    travelTime: "2h 20m",
    fromPrice: 199,
    priority: "featured",
    category: "airport",
    homeFeatured: true,
    bookingQuick: true,
    destinationCoords: { lat: 47.4385, lng: 19.2523 },
  },
  {
    slug: "bratislava-budapest-city-centre",
    name: "Bratislava ? Budapest City Centre",
    from: "Bratislava",
    to: "Budapest City Centre",
    pickupAddress: BRATISLAVA_PICKUP_ADDRESS,
    dropoffAddress: "Budapest City Centre, Hungary",
    distance: "200 km",
    travelTime: "2h 15m",
    fromPrice: 189,
    priority: "secondary",
    category: "city",
    destinationCoords: { lat: 47.4979, lng: 19.0402 },
  },
  {
    slug: "bratislava-brno",
    name: "Bratislava ? Brno",
    from: "Bratislava",
    to: "Brno",
    pickupAddress: BRATISLAVA_PICKUP_ADDRESS,
    dropoffAddress: "Brno, Czech Republic",
    distance: "130 km",
    travelTime: "1h 30m",
    fromPrice: 119,
    priority: "featured",
    category: "crossBorder",
    homeFeatured: true,
    bookingQuick: true,
    destinationCoords: { lat: 49.1951, lng: 16.6068 },
  },
  {
    slug: "bratislava-prague-airport",
    name: "Bratislava ? Prague Airport",
    homeName: "Bratislava ? Prague",
    from: "Bratislava",
    to: "Prague Airport",
    pickupAddress: BRATISLAVA_PICKUP_ADDRESS,
    dropoffAddress: "Prague Airport (PRG)",
    distance: "330 km",
    travelTime: "3h 30m",
    fromPrice: 299,
    priority: "featured",
    category: "airport",
    homeFeatured: true,
    destinationCoords: { lat: 50.1008, lng: 14.2632 },
  },
  {
    slug: "bratislava-prague-city-centre",
    name: "Bratislava ? Prague City Centre",
    from: "Bratislava",
    to: "Prague City Centre",
    pickupAddress: BRATISLAVA_PICKUP_ADDRESS,
    dropoffAddress: "Prague City Centre, Czech Republic",
    distance: "330 km",
    travelTime: "3h 45m",
    fromPrice: 299,
    priority: "secondary",
    category: "city",
    destinationCoords: { lat: 50.0755, lng: 14.4378 },
  },
  {
    slug: "bratislava-nitra",
    name: "Bratislava ? Nitra",
    from: "Bratislava",
    to: "Nitra",
    pickupAddress: BRATISLAVA_PICKUP_ADDRESS,
    dropoffAddress: "Nitra, Slovakia",
    distance: "95 km",
    travelTime: "1h",
    fromPrice: 79,
    priority: "secondary",
    category: "slovakia",
    destinationCoords: { lat: 48.3061, lng: 18.0764 },
  },
  {
    slug: "bratislava-trnava",
    name: "Bratislava ? Trnava",
    from: "Bratislava",
    to: "Trnava",
    pickupAddress: BRATISLAVA_PICKUP_ADDRESS,
    dropoffAddress: "Trnava, Slovakia",
    distance: "50 km",
    travelTime: "40 min",
    fromPrice: 49,
    priority: "secondary",
    category: "slovakia",
    destinationCoords: { lat: 48.3774, lng: 17.5872 },
  },
  {
    slug: "bratislava-zilina",
    name: "Bratislava ? Žilina",
    from: "Bratislava",
    to: "Žilina",
    pickupAddress: BRATISLAVA_PICKUP_ADDRESS,
    dropoffAddress: "Žilina, Slovakia",
    distance: "200 km",
    travelTime: "2h",
    fromPrice: 169,
    priority: "secondary",
    category: "slovakia",
    destinationCoords: { lat: 49.2232, lng: 18.7394 },
  },
  {
    slug: "bratislava-banska-bystrica",
    name: "Bratislava ? Banská Bystrica",
    from: "Bratislava",
    to: "Banská Bystrica",
    pickupAddress: BRATISLAVA_PICKUP_ADDRESS,
    dropoffAddress: "Banská Bystrica, Slovakia",
    distance: "210 km",
    travelTime: "2h 15m",
    fromPrice: 179,
    priority: "secondary",
    category: "slovakia",
    destinationCoords: { lat: 48.7363, lng: 19.1462 },
  },
  {
    slug: "bratislava-kosice",
    name: "Bratislava ? Košice",
    from: "Bratislava",
    to: "Košice",
    pickupAddress: BRATISLAVA_PICKUP_ADDRESS,
    dropoffAddress: "Košice, Slovakia",
    distance: "400 km",
    travelTime: "4h 30m",
    fromPrice: 349,
    priority: "secondary",
    category: "slovakia",
    destinationCoords: { lat: 48.7164, lng: 21.2611 },
  },
];

export const HOME_POPULAR_ROUTES = POPULAR_ROUTES.filter((route) => route.homeFeatured);
export const BOOKING_QUICK_ROUTES = POPULAR_ROUTES.filter((route) => route.bookingQuick);
export const MORE_POPULAR_ROUTES = POPULAR_ROUTES.filter((route) => !route.homeFeatured);

export function getPopularRouteBySlug(slug: string | null | undefined) {
  if (!slug) return undefined;
  return POPULAR_ROUTES.find((route) => route.slug === slug);
}

export function popularRouteHref(route: PopularRoute) {
  return `/book?route=${encodeURIComponent(route.slug)}`;
}
