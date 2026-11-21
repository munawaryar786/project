"use client";

import { csrfFetch } from "@/lib/client/csrf-fetch";
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { EMAIL, PHONE_NUMBER } from '@/lib/constants';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { presentStatus } from '@/lib/i18n/status-catalog';
import { formatEuro, formatMarketDate, formatMarketDateTime, formatMarketTime, formatMarketWallDateTime, formatNumber } from '@/lib/i18n/format';
import { normalizeStoredLocale } from '@/lib/i18n/locale-resolution';

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
  const { t, locale } = useLanguage();
  const params = useParams();
  const bookingId = params.id as string;
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!bookingId) return;

    const fetchBooking = async () => {
      try {
        const res = await csrfFetch("passenger", `/api/bookings/${bookingId}`);
        if (!res.ok) { setError(true); return; }
        const data = await res.json();
        setBooking(data.booking);
      } catch {
        setError(true);
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
        <p className="text-drivo-text-secondary">{t('booking.printLoading')}</p>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-drivo-text mb-2">{t('booking.printUnavailable')}</h2>
          <p className="text-drivo-text-secondary">{t('error.bookingAccess')}</p>
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
            {t('booking.print')}
          </button>
          <a
            href="/passenger/dashboard"
            className="btn-outline"
          >
            ← {t('booking.printBack')}
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
                <p className="text-xs text-drivo-text-secondary">{t('public.bratislavaSlovakia')} | {t('public.vat')}: SK2122572452</p>
              </div>
            </div>
            <h2 className="text-xl font-bold text-drivo-navy mt-4">{t('booking.printTitle')}</h2>
            <p className="text-sm text-drivo-text-secondary">{t('confirmation.ref')}: <span className="font-bold text-drivo-green">{booking.bookingRef}</span></p>
          </div>

          {/* Trip Details */}
          <div className="print-section mb-6">
            <h3 className="print-section-title text-sm font-bold text-drivo-navy uppercase tracking-wider mb-3">{t('booking.printTrip')}</h3>
            <div className="space-y-2">
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">{t('booking.selectService')}</span>
                <span className="print-value font-semibold">{t(`service.${String(booking.serviceType || '').toUpperCase()}`)}</span>
              </div>
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">{t('booking.pickup')}</span>
                <span className="print-value font-semibold text-right max-w-[300px]">{booking.pickupAddress}</span>
              </div>
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">{t('booking.dropoff')}</span>
                <span className="print-value font-semibold text-right max-w-[300px]">{booking.dropoffAddress}</span>
              </div>
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">{t('booking.date')} / {t('booking.time')}</span>
                <span className="print-value font-semibold">{formatMarketWallDateTime(booking.scheduledDate, booking.scheduledTime, locale) || t('common.notAvailable')}</span>
              </div>
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">{t('booking.distance')}</span>
                <span className="print-value font-semibold">{booking.distanceKm != null ? `${formatNumber(booking.distanceKm, locale)} km` : t('common.notAvailable')}</span>
              </div>
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">{t('booking.estimate')}</span>
                <span className="print-value font-semibold text-drivo-green">{booking.estimatedPrice != null ? formatEuro(booking.estimatedPrice, locale) : t('common.notAvailable')}</span>
              </div>
            </div>
          </div>

          {/* Passenger & Vehicle */}
          <div className="print-section mb-6">
            <h3 className="print-section-title text-sm font-bold text-drivo-navy uppercase tracking-wider mb-3">{t('booking.printRequirements')}</h3>
            <div className="space-y-2">
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">{t('booking.passengers')}</span>
                <span className="print-value font-semibold">{formatNumber(booking.passengerCount, locale)}</span>
              </div>
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">{t('booking.luggage')}</span>
                <span className="print-value font-semibold capitalize">{t(`luggage.${String(booking.luggageType || '').toUpperCase()}`)}</span>
              </div>
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">{t('booking.wheelchairRequired')}</span>
                <span className="print-value font-semibold">{booking.wheelchairNeeded ? t('common.yes') : t('common.no')}</span>
              </div>
              {booking.flightNumber && (
                <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                  <span className="print-label text-drivo-text-secondary">{t('booking.flightNumber')}</span>
                  <span className="print-value font-semibold">{booking.flightNumber}</span>
                </div>
              )}
              {booking.airline && (
                <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                  <span className="print-label text-drivo-text-secondary">{t('booking.airline')}</span>
                  <span className="print-value font-semibold">{booking.airline}</span>
                </div>
              )}
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">{t('booking.waitAndGreet')}</span>
                <span className="print-value font-semibold">{booking.waitAndGreet ? t('common.yes') : t('common.no')}</span>
              </div>
            </div>
          </div>

          {/* Customer Information */}
          <div className="print-section mb-6">
            <h3 className="print-section-title text-sm font-bold text-drivo-navy uppercase tracking-wider mb-3">{t('booking.printCustomer')}</h3>
            <div className="space-y-2">
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">{t('booking.name')}</span>
                <span className="print-value font-semibold">{booking.customerName}</span>
              </div>
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">{t('booking.phone')}</span>
                <span className="print-value font-semibold">{booking.customerPhoneCode}{booking.customerPhone}</span>
              </div>
              {booking.customerEmail && (
                <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                  <span className="print-label text-drivo-text-secondary">{t('booking.email')}</span>
                  <span className="print-value font-semibold">{booking.customerEmail}</span>
                </div>
              )}
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">{t('booking.language')}</span>
                <span className="print-value font-semibold capitalize">{t(`language.option.${normalizeStoredLocale(booking.languagePref) || 'sk'}`)}</span>
              </div>
            </div>
          </div>

          {/* Payment & Status */}
          <div className="print-section mb-6">
            <h3 className="print-section-title text-sm font-bold text-drivo-navy uppercase tracking-wider mb-3">{t('booking.printPayment')}</h3>
            <div className="space-y-2">
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">{t('booking.payment')}</span>
                <span className="print-value font-semibold capitalize">{t(`booking.payment${String(booking.paymentMethod || '').charAt(0).toUpperCase()}${String(booking.paymentMethod || '').slice(1).toLowerCase()}`)}</span>
              </div>
              {booking.cashAgreed && (
                <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                  <span className="print-label text-drivo-text-secondary">{t('booking.cashAgreement')}</span>
                  <span className="print-value font-semibold text-drivo-green">{t('booking.agreed')}</span>
                </div>
              )}
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">{t('confirmation.status')}</span>
                <span className="print-value font-semibold">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    booking.status === 'VERIFIED' ? 'bg-drivo-green-light text-drivo-green-dark' :
                    booking.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {booking.status === 'VERIFIED' ? t('confirmation.verified') : presentStatus('booking', booking.status, locale)}
                  </span>
                </span>
              </div>
              <div className="print-row flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="print-label text-drivo-text-secondary">{t('booking.printCreated')}</span>
                <span className="print-value font-semibold">{formatMarketDateTime(booking.createdAt, locale)}</span>
              </div>
            </div>
          </div>

          {/* Special Notes */}
          {booking.specialNotes && (
            <div className="print-section mb-6 p-4 bg-gray-50 rounded-xl">
              <h3 className="text-sm font-bold text-drivo-navy mb-2">{t('booking.printSpecialNotes')}:</h3>
              <p className="text-sm text-drivo-text">{booking.specialNotes}</p>
            </div>
          )}

          {/* Cash Payment Warning */}
          {booking.paymentMethod === 'CASH' && (
            <div className="print-warning p-4 bg-amber-50 border-2 border-amber-400 rounded-xl">
              <p className="text-sm font-bold text-amber-800">⚠️ {t('booking.printCashTitle')}</p>
              <p className="text-sm text-amber-700 mt-1">{t('booking.printCashNotice')}</p>
            </div>
          )}

          {/* Footer */}
          <div className="print-footer mt-8 pt-6 border-t-2 border-drivo-green text-center">
            <p className="text-xs text-drivo-text-secondary mb-1">{t('booking.printThanks')}</p>
            <p className="text-xs text-drivo-text-secondary mb-1">{t('booking.printSupport')}: {EMAIL} | {PHONE_NUMBER}</p>
            <p className="text-xs text-drivo-text-secondary">{t('booking.printPrinted')}: {formatMarketDate(new Date(), locale)} {formatMarketTime(new Date(), locale)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
