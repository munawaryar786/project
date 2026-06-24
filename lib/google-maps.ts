import { Client, DistanceMatrixResponse } from '@googlemaps/google-maps-services-js';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Initialize Google Maps client
const googleMapsClient = GOOGLE_MAPS_API_KEY ? new Client({}) : null;

/**
 * Get Google Maps client (lazy initialization)
 */
function getClient() {
  if (!googleMapsClient) {
    console.error("❌ Google Maps not configured - missing GOOGLE_MAPS_API_KEY");
    return null;
  }
  return googleMapsClient;
}

export interface DistanceResult {
  distanceKm: number;
  durationMinutes: number;
  origin: string;
  destination: string;
}

export interface GeocodeResult {
  formattedAddress: string;
  lat: number;
  lng: number;
  placeId?: string;
}

export interface AddressSuggestion {
  description: string;
  placeId?: string;
  mainText?: string;
  secondaryText?: string;
  typeLabel?: string;
  types?: string[];
  lat?: number;
  lng?: number;
}


/**
 * Calculate distance and duration between two addresses using Google Maps Distance Matrix API
 * @param origin - Pickup address
 * @param destination - Drop-off address
 * @returns Distance in km and duration in minutes
 */
export async function calculateDistance(
  origin: string,
  destination: string
): Promise<DistanceResult> {
  const client = getClient();
  
  if (!client) {
    throw new Error("Google Maps not configured");
  }

  try {
    const response: DistanceMatrixResponse = await client.distancematrix({
      params: {
        origins: [origin],
        destinations: [destination],
        key: GOOGLE_MAPS_API_KEY!,
        units: 'metric' as any,
        mode: 'driving' as any,
      },
    });

    if (response.data.status !== 'OK') {
      throw new Error(`Distance Matrix API error: ${response.data.status}`);
    }

    const row = response.data.rows[0];
    if (!row || row.elements[0].status !== 'OK') {
      throw new Error(`Route not found: ${row?.elements[0]?.status || 'Unknown error'}`);
    }

    const element = row.elements[0];
    const distanceMeters = element.distance.value;
    const durationSeconds = element.duration.value;

    return {
      distanceKm: parseFloat((distanceMeters / 1000).toFixed(1)),
      durationMinutes: Math.round(durationSeconds / 60),
      origin,
      destination,
    };
  } catch (error: any) {
    console.error("Distance calculation error:", error.message);
    throw error;
  }
}

/**
 * Geocode an address to get coordinates
 * @param address - Address to geocode
 * @returns Formatted address and coordinates
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const client = getClient();
  
  if (!client) {
    throw new Error("Google Maps not configured");
  }

  try {
    const response = await client.geocode({
      params: {
        address,
        key: GOOGLE_MAPS_API_KEY!,
        region: 'sk', // Slovakia
      },
    });

    if (response.data.status !== 'OK' || !response.data.results || response.data.results.length === 0) {
      throw new Error(`Geocoding failed: ${response.data.status}`);
    }

    const result = response.data.results[0];
    const location = result.geometry.location;

    return {
      formattedAddress: result.formatted_address,
      lat: location.lat,
      lng: location.lng,
      placeId: result.place_id,
    };
  } catch (error: any) {
    console.error("Geocoding error:", error.message);
    throw error;
  }
}

type AddressSuggestionOptions = {
  educationalOnly?: boolean;
};

const BRATISLAVA_LOCATION = "48.1486,17.1077";
const BRATISLAVA_RADIUS_METERS = "70000";

const EDUCATIONAL_TERMS = [
  "school",
  "college",
  "university",
  "educational",
  "education",
  "training",
  "academy",
  "institute",
  "skola",
  "skola",
  "gymnasium",
  "gymnazium",
  "univerzita",
];

const EDUCATIONAL_TYPES = new Set([
  "school",
  "primary_school",
  "secondary_school",
  "university",
]);

const TYPE_LABELS: Array<[string, string]> = [
  ["shopping_mall", "Shopping mall"],
  ["hospital", "Hospital"],
  ["doctor", "Clinic"],
  ["health", "Healthcare"],
  ["airport", "Airport"],
  ["train_station", "Train station"],
  ["bus_station", "Bus station"],
  ["transit_station", "Station"],
  ["lodging", "Hotel"],
  ["tourist_attraction", "Tourist location"],
  ["restaurant", "Restaurant"],
  ["local_government_office", "Public office"],
  ["city_hall", "Public office"],
  ["embassy", "Public office"],
  ["school", "School"],
  ["primary_school", "School"],
  ["secondary_school", "School"],
  ["university", "University"],
  ["route", "Street"],
  ["street_address", "Address"],
  ["premise", "Address"],
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeEducationalOption(options?: boolean | AddressSuggestionOptions) {
  if (typeof options === "boolean") return options;
  return Boolean(options?.educationalOnly);
}

function typeLabelFor(types: string[] = []) {
  const match = TYPE_LABELS.find(([type]) => types.includes(type));
  if (match) return match[1];
  if (types.includes("point_of_interest") || types.includes("establishment")) return "Place";
  if (types.includes("locality") || types.includes("sublocality")) return "Area";
  return undefined;
}

function isEducationalSuggestion(prediction: any) {
  const types = Array.isArray(prediction.types) ? prediction.types : [];
  if (types.some((type: string) => EDUCATIONAL_TYPES.has(type))) return true;

  const description = normalizeText(String(prediction.description || ""));
  return EDUCATIONAL_TERMS.some((term) => description.includes(term));
}

async function fetchPlaceDetails(placeId: string) {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const params = new URLSearchParams({
    place_id: placeId,
    key: GOOGLE_MAPS_API_KEY,
    fields: "geometry,type",
    language: "sk",
  });

  const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`);
  const data = await response.json();

  if (data.status !== "OK" || !data.result) return null;

  const location = data.result.geometry?.location;
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  const types = Array.isArray(data.result.types) ? data.result.types : [];

  return {
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    types,
  };
}

/**
 * Autocomplete address and place suggestions around Bratislava/Slovakia.
 * Normal mode intentionally does not use types=geocode, so POIs are included.
 */
export async function getAddressSuggestionItems(
  input: string,
  options: boolean | AddressSuggestionOptions = false
): Promise<AddressSuggestion[]> {
  const educationalOnly = normalizeEducationalOption(options);
  const trimmedInput = input.trim();

  if (!GOOGLE_MAPS_API_KEY || trimmedInput.length < 3) {
    if (!GOOGLE_MAPS_API_KEY) console.error("Google Maps not configured");
    return [];
  }

  try {
    const params = new URLSearchParams({
      input: trimmedInput,
      key: GOOGLE_MAPS_API_KEY,
      components: "country:sk",
      language: "sk",
      location: BRATISLAVA_LOCATION,
      radius: BRATISLAVA_RADIUS_METERS,
    });

    if (educationalOnly) {
      params.set("types", "establishment");
    }

    const response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`);
    const data = await response.json();

    if (data.status !== "OK" || !Array.isArray(data.predictions)) {
      return [];
    }

    const seen = new Set<string>();
    const predictions = data.predictions
      .filter((prediction: any) => !educationalOnly || isEducationalSuggestion(prediction))
      .filter((prediction: any) => {
        const key = String(prediction.place_id || prediction.description || "").toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);

    const details = await Promise.all(
      predictions.map((prediction: any) =>
        prediction.place_id ? fetchPlaceDetails(prediction.place_id).catch(() => null) : Promise.resolve(null)
      )
    );

    return predictions.map((p: any, index: number) => {
      const predictionTypes = Array.isArray(p.types) ? p.types : [];
      const detail = details[index];
      const types = Array.from(new Set([...(detail?.types || []), ...predictionTypes]));

      return {
        description: p.description,
        placeId: p.place_id,
        mainText: p.structured_formatting?.main_text,
        secondaryText: p.structured_formatting?.secondary_text,
        typeLabel: typeLabelFor(types),
        types,
        lat: detail?.lat,
        lng: detail?.lng,
      };
    });
  } catch (error: any) {
    console.error("Address autocomplete error:", error.message);
    return [];
  }
}

export async function getAddressSuggestions(input: string, educational = false): Promise<string[]> {
  const items = await getAddressSuggestionItems(input, educational);
  return items.map((item) => item.description);
}

/**
 * Calculate price estimate based on real distance
 * @param distanceKm - Distance in kilometers
 * @param serviceType - Type of service (standard, accessible, airport, etc.)
 * @param passengerCount - Number of passengers
 * @returns Estimated price in EUR
 */
export function calculatePriceEstimate(
  distanceKm: number,
  serviceType: string = 'standard',
  passengerCount: number = 1
): { price: number; breakdown: string } {
  // Base fare
  let price = 3.0; // €3 base

  // Distance-based pricing
  price += distanceKm * 1.5; // €1.50 per km

  // Service type surcharges
  if (serviceType === 'airport') {
    price += 5.0; // €5 airport surcharge
  }
  
  if (serviceType === 'accessible') {
    // No surcharge for accessible (subsidized)
  }

  // Vehicle upgrade for large groups
  if (passengerCount > 4) {
    price *= 1.2; // 20% surcharge for minivan
  }

  // Minimum fare
  price = Math.max(price, 5.0);

  // Round to 2 decimals
  price = parseFloat(price.toFixed(2));

  // Generate breakdown
  const breakdown = `Base: €3.00 + ${distanceKm}km × €1.50 = €${(distanceKm * 1.5).toFixed(2)}${serviceType === 'airport' ? ' + €5.00 airport' : ''}${passengerCount > 4 ? ' + 20% minivan' : ''} = €${price}`;

  return { price, breakdown };
}
