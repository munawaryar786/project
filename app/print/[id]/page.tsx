"use client";
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { EMAIL, PHONE_NUMBER } from '@/lib/constants';

interface BookingData {
  id: string;
  bookingRef: string;
  serviceType: string;
  pickupAddress: string;
  dropoffAddress: string;
  scheduledDate: string;
  scheduledTime: string;
  passengerCount: number;
  luggageType: string;
  wheelchairNeeded: boolean;
  flightNumber?: string;
  airline?: string;
  waitAndGreet: boolean;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  customerPhoneCode: string;
  languagePref: string;
  specialNotes?: string;
  paymentMethod: string;
  cashAgreed: boolean;
  status: string;
  estimatedPrice?: number;
  distanceKm?: number;
  createdAt: string;
}

export default function PrintBookingPage() {
  const params = useParams();
  const bookingId = params.id as string;
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!bookingId) return;

    const fetchBooking = async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}`);
        if (!res.ok) throw new Error('Booking not found');
        const data = await res.json();
        setBooking(data.booking);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchBooking();
  }, [bookingId]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-drivo-text-secondary">Loading booking details...</p>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-drivo-text mb-2">Booking Not Found</h2>
          <p className="text-drivo-text-secondary">{error || 'Invalid booking ID'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        {/* Print Button */}
        <div className="no-print mb-6 flex justify-end gap-3">
          <button
            onClick={handlePrint}
            className="btn-primary"
          >
            🖨️ Print Booking Details
          </button>
          <a
            href="/admin/bookings"
            className="btn-outline"
          >
            ← Back to Admin
          </a>
        </div>

        {/* Printable Content */}
        <div className="printable-booking bg-white rounded-3xl p-8 shadow-soft">
          {/* Header */}
          <div className="print-header mb-6 pb-4 border-b-2 border-drivo-green">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-drivo-green rounded-xl flex items-center justify-center">
                <span className="text-white font-extrabold text-xl">D</span>
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-drivo-navy">Drivo s.r.o.</h1>
                <p className="text-xs text-drivo-text-secondary">Bratislava, Slovakia | VAT: SK2122572452</p>
              </div>
            </div>
            <h2 className="text-xl font-bold text-drivo-navy mt-4">Booking Confirmation</h2>
            <p className="text-sm text-drivo-text-secondary">Booking Reference: <span className="font-bold text-drivo-green">{booking.bookingRef}</span></p>
          </div>

          {/* Trip Details */}
          <div className="print-section mb-6">
            <h3 className="print-section-title text-sm font-bold text-drivo-navy uppercase tracking-wider mb-3">Trip Details</h3>
            <div className="space-y-2">
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">Service Type</span>
                <span className="print-value font-semibold">{booking.serviceType}</span>
              </div>
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">Pickup Address</span>
                <span className="print-value font-semibold text-right max-w-[300px]">{booking.pickupAddress}</span>
              </div>
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">Drop-off Address</span>
                <span className="print-value font-semibold text-right max-w-[300px]">{booking.dropoffAddress}</span>
              </div>
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">Date & Time</span>
                <span className="print-value font-semibold">{booking.scheduledDate} at {booking.scheduledTime}</span>
              </div>
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">Distance</span>
                <span className="print-value font-semibold">{booking.distanceKm ? `${booking.distanceKm.toFixed(1)} km` : 'N/A'}</span>
              </div>
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">Estimated Price</span>
                <span className="print-value font-semibold text-drivo-green">{booking.estimatedPrice ? `€${booking.estimatedPrice.toFixed(2)}` : 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Passenger & Vehicle */}
          <div className="print-section mb-6">
            <h3 className="print-section-title text-sm font-bold text-drivo-navy uppercase tracking-wider mb-3">Passenger & Vehicle Requirements</h3>
            <div className="space-y-2">
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">Passengers</span>
                <span className="print-value font-semibold">{booking.passengerCount}</span>
              </div>
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">Luggage</span>
                <span className="print-value font-semibold capitalize">{booking.luggageType}</span>
              </div>
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">Wheelchair Required</span>
                <span className="print-value font-semibold">{booking.wheelchairNeeded ? 'Yes' : 'No'}</span>
              </div>
              {booking.flightNumber && (
                <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                  <span className="print-label text-drivo-text-secondary">Flight Number</span>
                  <span className="print-value font-semibold">{booking.flightNumber}</span>
                </div>
              )}
              {booking.airline && (
                <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                  <span className="print-label text-drivo-text-secondary">Airline</span>
                  <span className="print-value font-semibold">{booking.airline}</span>
                </div>
              )}
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">Wait & Greet</span>
                <span className="print-value font-semibold">{booking.waitAndGreet ? 'Yes ✓' : 'No'}</span>
              </div>
            </div>
          </div>

          {/* Customer Information */}
          <div className="print-section mb-6">
            <h3 className="print-section-title text-sm font-bold text-drivo-navy uppercase tracking-wider mb-3">Customer Information</h3>
            <div className="space-y-2">
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">Name</span>
                <span className="print-value font-semibold">{booking.customerName}</span>
              </div>
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">Phone</span>
                <span className="print-value font-semibold">{booking.customerPhoneCode}{booking.customerPhone}</span>
              </div>
              {booking.customerEmail && (
                <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                  <span className="print-label text-drivo-text-secondary">Email</span>
                  <span className="print-value font-semibold">{booking.customerEmail}</span>
                </div>
              )}
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">Language Preference</span>
                <span className="print-value font-semibold capitalize">{booking.languagePref}</span>
              </div>
            </div>
          </div>

          {/* Payment & Status */}
          <div className="print-section mb-6">
            <h3 className="print-section-title text-sm font-bold text-drivo-navy uppercase tracking-wider mb-3">Payment & Status</h3>
            <div className="space-y-2">
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">Payment Method</span>
                <span className="print-value font-semibold capitalize">{booking.paymentMethod}</span>
              </div>
              {booking.cashAgreed && (
                <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                  <span className="print-label text-drivo-text-secondary">Cash Agreement</span>
                  <span className="print-value font-semibold text-drivo-green">Agreed ✓</span>
                </div>
              )}
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">Status</span>
                <span className="print-value font-semibold">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    booking.status === 'VERIFIED' ? 'bg-drivo-green-light text-drivo-green-dark' :
                    booking.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {booking.status}
                  </span>
                </span>
              </div>
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">Booking Created</span>
                <span className="print-value font-semibold">{new Date(booking.createdAt).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Special Notes */}
          {booking.specialNotes && (
            <div className="print-section mb-6 p-4 bg-gray-50 rounded-xl">
              <h3 className="text-sm font-bold text-drivo-navy mb-2">Special Notes:</h3>
              <p className="text-sm text-drivo-text">{booking.specialNotes}</p>
            </div>
          )}

          {/* Cash Payment Warning */}
          {booking.paymentMethod === 'CASH' && (
            <div className="print-warning p-4 bg-amber-50 border-2 border-amber-400 rounded-xl">
              <p className="text-sm font-bold text-amber-800">⚠️ Cash Payment Notice</p>
              <p className="text-sm text-amber-700 mt-1">Cash payment must be made to the driver before the journey starts. Driver must confirm receipt before starting the ride.</p>
            </div>
          )}

          {/* Footer */}
          <div className="print-footer mt-8 pt-6 border-t-2 border-drivo-green text-center">
            <p className="text-xs text-drivo-text-secondary mb-1">Thank you for choosing Drivo s.r.o. for your transport needs.</p>
            <p className="text-xs text-drivo-text-secondary mb-1">For support: {EMAIL} | {PHONE_NUMBER}</p>
            <p className="text-xs text-drivo-text-secondary">Printed on: {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
