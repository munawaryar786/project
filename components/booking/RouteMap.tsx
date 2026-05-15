"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { GoogleMap, Marker, DirectionsRenderer, useJsApiLoader } from "@react-google-maps/api";

interface RouteMapProps {
  pickupAddress: string;
  dropoffAddress: string;
  onRouteInfo?: (info: { distanceKm: number; durationMin: number; priceEstimate: number }) => void;
}

const mapContainerStyle = {
  width: "100%",
  height: "400px",
  borderRadius: "16px",
};

const defaultCenter = { lat: 48.1486, lng: 17.1077 }; // Bratislava

const mapOptions: google.maps.MapOptions = {
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
  zoom: 12,
  styles: [
    { featureType: "poi", stylers: [{ visibility: "simplified" }] },
    { featureType: "transit", stylers: [{ visibility: "simplified" }] },
  ],
};

export default function RouteMap({ pickupAddress, dropoffAddress, onRouteInfo }: RouteMapProps) {
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [pickupCoords, setPickupCoords] = useState<google.maps.LatLngLiteral | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<google.maps.LatLngLiteral | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number; priceEstimate: number } | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "",
    region: "sk",
  });

  const geocodeAddress = useCallback((address: string, type: "pickup" | "dropoff") => {
    if (!isLoaded || !address) return;

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address, region: "sk" }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const loc = results[0].geometry.location;
        const coords = { lat: loc.lat(), lng: loc.lng() };

        if (type === "pickup") {
          setPickupCoords(coords);
        } else {
          setDropoffCoords(coords);
        }
      }
    });
  }, [isLoaded]);

  useEffect(() => {
    geocodeAddress(pickupAddress, "pickup");
  }, [pickupAddress, geocodeAddress]);

  useEffect(() => {
    geocodeAddress(dropoffAddress, "dropoff");
  }, [dropoffAddress, geocodeAddress]);

  useEffect(() => {
    if (!pickupCoords || !dropoffCoords || !isLoaded) return;

    const directionsService = new google.maps.DirectionsService();
    directionsService.route(
      {
        origin: pickupCoords,
        destination: dropoffCoords,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === "OK" && result) {
          setDirections(result);

          // Extract route info
          const route = result.routes[0];
          if (route && route.legs[0]) {
            const leg = route.legs[0];
            const distanceMeters = leg.distance?.value || 0;
            const durationSeconds = leg.duration?.value || 0;
            const distanceKm = distanceMeters / 1000;
            const durationMin = Math.round(durationSeconds / 60);

            // Calculate price estimate (base €3 + €1.50/km)
            const priceEstimate = Math.round((3 + distanceKm * 1.50) * 100) / 100;

            const info = { distanceKm: Math.round(distanceKm * 10) / 10, durationMin, priceEstimate };
            setRouteInfo(info);
            onRouteInfo?.(info);
          }
        }
      }
    );
  }, [pickupCoords, dropoffCoords, isLoaded, onRouteInfo]);

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const onUnmount = useCallback(() => {
    mapRef.current = null;
  }, []);

  const handleFitBounds = useCallback(() => {
    if (!mapRef.current || (!pickupCoords && !dropoffCoords)) return;

    const bounds = new google.maps.LatLngBounds();
    if (pickupCoords) bounds.extend(pickupCoords);
    if (dropoffCoords) bounds.extend(dropoffCoords);
    mapRef.current.fitBounds(bounds);
  }, [pickupCoords, dropoffCoords]);

  useEffect(() => {
    if (pickupCoords && dropoffCoords) {
      handleFitBounds();
    }
  }, [pickupCoords, dropoffCoords, handleFitBounds]);

  if (!isLoaded) {
    return (
      <div className="bg-drivo-bg-soft rounded-2xl p-8 text-center border border-drivo-border-light">
        <div className="w-8 h-8 border-3 border-drivo-green border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-[13px] text-drivo-text-secondary">Loading map...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Route Info Bar */}
      {routeInfo && (
        <div className="flex items-center gap-4 p-4 bg-drivo-green-light/50 border border-drivo-green/20 rounded-2xl animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-[18px]">📍</span>
            <div>
              <p className="text-[11px] text-drivo-text-secondary font-medium">Distance</p>
              <p className="text-[16px] font-bold text-drivo-green-dark">{routeInfo.distanceKm} km</p>
            </div>
          </div>
          <div className="w-px h-10 bg-drivo-green/20" />
          <div className="flex items-center gap-2">
            <span className="text-[18px]">⏱️</span>
            <div>
              <p className="text-[11px] text-drivo-text-secondary font-medium">Duration</p>
              <p className="text-[16px] font-bold text-drivo-green-dark">~{routeInfo.durationMin} min</p>
            </div>
          </div>
          <div className="w-px h-10 bg-drivo-green/20" />
          <div className="flex items-center gap-2">
            <span className="text-[18px]">💰</span>
            <div>
              <p className="text-[11px] text-drivo-text-secondary font-medium">Estimate</p>
              <p className="text-[16px] font-bold text-drivo-green-dark">€{routeInfo.priceEstimate.toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="rounded-2xl overflow-hidden border border-drivo-border-light shadow-card relative">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={pickupCoords || dropoffCoords || defaultCenter}
          zoom={12}
          options={mapOptions}
          onLoad={onLoad}
          onUnmount={onUnmount}
        >
          {pickupCoords && (
            <Marker
              position={pickupCoords}
              label={{ text: "A", color: "#FFFFFF", fontWeight: "bold", fontSize: "14px" }}
              icon={{
                url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
                  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="18" cy="18" r="16" fill="#34D186" stroke="#2BB974" stroke-width="2"/>
                    <circle cx="18" cy="18" r="8" fill="white"/>
                  </svg>
                `),
                scaledSize: new google.maps.Size(36, 36),
                anchor: new google.maps.Point(18, 18),
              }}
              title={pickupAddress}
            />
          )}
          {dropoffCoords && (
            <Marker
              position={dropoffCoords}
              label={{ text: "B", color: "#FFFFFF", fontWeight: "bold", fontSize: "14px" }}
              icon={{
                url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
                  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="18" cy="18" r="16" fill="#1A73E8" stroke="#1557B0" stroke-width="2"/>
                    <circle cx="18" cy="18" r="8" fill="white"/>
                  </svg>
                `),
                scaledSize: new google.maps.Size(36, 36),
                anchor: new google.maps.Point(18, 18),
              }}
              title={dropoffAddress}
            />
          )}
          {directions && <DirectionsRenderer directions={directions} options={{ polylineOptions: { strokeColor: "#34D186", strokeWeight: 5, strokeOpacity: 0.8 } }} />}
        </GoogleMap>

        {/* Loading overlay when calculating route */}
        {!directions && (pickupCoords || dropoffCoords) && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center backdrop-blur-sm rounded-2xl">
            <div className="bg-white rounded-xl px-6 py-4 shadow-card border border-drivo-border-light">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-drivo-green border-t-transparent rounded-full animate-spin" />
                <p className="text-[13px] text-drivo-text-secondary font-medium">Calculating route...</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
