// A deliberately narrow projection. Never expose source Booking/Passenger records
// through the saved-route endpoints.
export type SavedRouteView = {
  id: string;
  label: string;
  serviceType: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  passengerCount: number;
  smallBags: number;
  largeBags: number;
  luggageType: string;
  airline: string | null;
  waitAndGreet: boolean;
  createdAt: string;
  updatedAt: string;
};
