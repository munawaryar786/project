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
    console.error("❌ Distance calculation error:", error.message);
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
    console.error("❌ Geocoding error:", error.message);
    throw error;
  }
}

/**
 * Autocomplete address suggestions
 * @param input - Partial address input
 * @returns Array of address suggestions
 */
export async function getAddressSuggestions(input: string): Promise<string[]> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.error("❌ Google Maps not configured");
    return [];
  }

  try {
    // Use direct fetch to Google Places Autocomplete API
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${GOOGLE_MAPS_API_KEY}&types=geocode&components=country:sk`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' || !data.predictions) {
      return [];
    }

    return data.predictions.slice(0, 5).map((p: any) => p.description);
  } catch (error: any) {
    console.error("❌ Address autocomplete error:", error.message);
    return [];
  }
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
