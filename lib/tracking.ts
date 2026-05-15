// Real-time tracking using Server-Sent Events (SSE)
// SSE is simpler and works better with Next.js than WebSockets

interface LocationUpdate {
  driverId: string;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  timestamp: number;
}

interface DriverStatusUpdate {
  driverId: string;
  status: 'ACTIVE' | 'ON_TRIP' | 'OFFLINE' | 'BREAK';
  timestamp: number;
}

// In-memory store for connected drivers (use Redis in production)
const driverLocations = new Map<string, LocationUpdate>();
const driverStatuses = new Map<string, DriverStatusUpdate>();

/**
 * Update driver location
 */
export function updateDriverLocation(data: LocationUpdate): void {
  driverLocations.set(data.driverId, data);
  console.log(`📍 Driver ${data.driverId} location updated`);
}

/**
 * Get all active driver locations
 */
export function getAllDriverLocations(): Map<string, LocationUpdate> {
  return new Map(driverLocations);
}

/**
 * Get specific driver location
 */
export function getDriverLocation(driverId: string): LocationUpdate | undefined {
  return driverLocations.get(driverId);
}

/**
 * Update driver status
 */
export function updateDriverStatus(data: DriverStatusUpdate): void {
  driverStatuses.set(data.driverId, data);
  console.log(`🚗 Driver ${data.driverId} status: ${data.status}`);
}

/**
 * Get all driver statuses
 */
export function getAllDriverStatuses(): Map<string, DriverStatusUpdate> {
  return new Map(driverStatuses);
}

/**
 * Clean up old location data (call periodically)
 */
export function cleanupOldLocations(maxAgeMs: number = 3600000): void {
  const now = Date.now();
  for (const [driverId, location] of driverLocations.entries()) {
    if (now - location.timestamp > maxAgeMs) {
      driverLocations.delete(driverId);
    }
  }
}
