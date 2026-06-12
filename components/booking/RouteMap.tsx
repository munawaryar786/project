"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DirectionsRenderer,
  GoogleMap,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";

interface RouteMapProps {
  pickupAddress: string;
  dropoffAddress: string;
  hideEstimate?: boolean;
  onRouteInfo?: (info: {
    distanceKm: number;
    durationMin: number;
    priceEstimate: number;
  }) => void;
}

const mapContainerStyle = {
  width: "100%",
  height: "400px",
  borderRadius: "16px",
};

const defaultCenter = { lat: 48.1486, lng: 17.1077 };

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

export default function RouteMap({
  pickupAddress,
  dropoffAddress,
  hideEstimate = false,
  onRouteInfo,
}: RouteMapProps) {
  const [directions, setDirections] =
    useState<google.maps.DirectionsResult | null>(null);
  const [pickupCoords, setPickupCoords] =
    useState<google.maps.LatLngLiteral | null>(null);
  const [dropoffCoords, setDropoffCoords] =
    useState<google.maps.LatLngLiteral | null>(null);
  const [routeInfo, setRouteInfo] = useState<{
    distanceKm: number;
    durationMin: number;
    priceEstimate: number;
  } | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: ["places"],
    region: "SK",
  });

  const geocodeAddress = useCallback(
    (address: string, type: "pickup" | "dropoff") => {
      if (!isLoaded || !address) return;

      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address, region: "sk" }, (results, status) => {
        if (status === "OK" && results?.[0]) {
          const loc = results[0].geometry.location;
          const coords = { lat: loc.lat(), lng: loc.lng() };

          if (type === "pickup") {
            setPickupCoords(coords);
          } else {
            setDropoffCoords(coords);
          }
        }
      });
    },
    [isLoaded]
  );

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
        if (status !== "OK" || !result) return;

        setDirections(result);
        const leg = result.routes[0]?.legs[0];
        if (!leg) return;

        const distanceKm = Math.round(((leg.distance?.value || 0) / 1000) * 10) / 10;
        const durationMin = Math.round((leg.duration?.value || 0) / 60);
        const priceEstimate = Math.round((3 + distanceKm * 1.5) * 100) / 100;
        const info = { distanceKm, durationMin, priceEstimate };

        setRouteInfo(info);
        onRouteInfo?.(info);
      }
    );
  }, [pickupCoords, dropoffCoords, isLoaded, onRouteInfo]);

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

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
        Google Maps failed to load. Check API key or domain restriction.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="rounded-2xl border border-drivo-border-light bg-drivo-bg-soft p-8 text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-drivo-green border-t-transparent" />
        <p className="text-[13px] text-drivo-text-secondary">Loading map...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {routeInfo && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-drivo-green/20 bg-drivo-green-light/50 p-4">
          <RouteStat label="Distance" value={`${routeInfo.distanceKm} km`} />
          <Divider />
          <RouteStat label="Duration" value={`~${routeInfo.durationMin} min`} />
          {!hideEstimate && (
            <>
              <Divider />
              <RouteStat label="Estimate" value={`EUR ${routeInfo.priceEstimate.toFixed(2)}`} />
            </>
          )}
        </div>
      )}

      <div className="relative overflow-hidden rounded-2xl border border-drivo-border-light shadow-card">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={pickupCoords || dropoffCoords || defaultCenter}
          zoom={12}
          options={mapOptions}
          onLoad={(map) => {
            mapRef.current = map;
          }}
          onUnmount={() => {
            mapRef.current = null;
          }}
        >
          {pickupCoords && (
            <Marker
              position={pickupCoords}
              label={{ text: "A", color: "#FFFFFF", fontWeight: "bold", fontSize: "14px" }}
              title={pickupAddress}
            />
          )}
          {dropoffCoords && (
            <Marker
              position={dropoffCoords}
              label={{ text: "B", color: "#FFFFFF", fontWeight: "bold", fontSize: "14px" }}
              title={dropoffAddress}
            />
          )}
          {directions && (
            <DirectionsRenderer
              directions={directions}
              options={{
                polylineOptions: {
                  strokeColor: "#34D186",
                  strokeWeight: 5,
                  strokeOpacity: 0.8,
                },
              }}
            />
          )}
        </GoogleMap>

        {!directions && (pickupCoords || dropoffCoords) && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/60 backdrop-blur-sm">
            <div className="rounded-xl border border-drivo-border-light bg-white px-6 py-4 shadow-card">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-drivo-green border-t-transparent" />
                <p className="text-[13px] font-medium text-drivo-text-secondary">
                  Calculating route...
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="hidden h-10 w-px bg-drivo-green/20 sm:block" />;
}

function RouteStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-drivo-text-secondary">{label}</p>
      <p className="text-[16px] font-bold text-drivo-green-dark">{value}</p>
    </div>
  );
}
