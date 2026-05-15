"use client";
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import BookingForm from '@/components/booking/BookingForm';
import RouteMap from '@/components/booking/RouteMap';
import { WHATSAPP_URL, PHONE_RAW } from '@/lib/constants';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function BookPage() {
  const { t } = useLanguage();
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");

  return (
    <>
      <Header />
      <main className="bg-drivo-bg-soft min-h-screen">
        {/* Hero Header with Image */}
        <div className="relative bg-drivo-navy pt-28 pb-16 md:pt-32 md:pb-20 overflow-hidden">
          <div className="absolute inset-0">
            <Image src="https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=1920&q=80" alt="" fill priority sizes="100vw" className="object-cover opacity-15" />
            <div className="absolute inset-0 bg-gradient-to-b from-drivo-navy/80 to-drivo-navy" />
          </div>

          <div className="relative container-main">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-[13px] text-white/40 mb-6">
              <Link href="/" className="hover:text-white transition-colors">{t('nav.home')}</Link>
              <span>/</span>
              <span className="text-white/70">{t('nav.book')}</span>
            </div>

            <div className="grid lg:grid-cols-[1fr,auto] gap-8 items-end">
              <div>
                <h1 className="text-[32px] md:text-[42px] font-extrabold text-white mb-3 tracking-tight">
                  {t('booking.title')}
                </h1>
                <p className="text-[16px] text-white/50 max-w-lg">
                  {t('booking.pageIntro', 'Fill in your details below. We will match you with the right driver for your needs.')}
                </p>
              </div>

              {/* Trust Badges */}
              <div className="flex flex-wrap gap-3">
                {[
                  { icon: '🛡️', text: t('booking.badgeSecure', 'Secure') },
                  { icon: '⚡', text: t('booking.badgeInstant', 'Instant') },
                  { icon: '♿', text: t('booking.badgeAccessible', 'Accessible') },
                ].map((b) => (
                  <div key={b.text} className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 border border-white/10">
                    <span>{b.icon}</span>
                    <span className="text-[13px] text-white/70 font-medium">{b.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center gap-3 mt-10">
              {[
                { n: 1, l: t('booking.tripDetails'), icon: '📍' },
                { n: 2, l: t('otp.title'), icon: '📱' },
                { n: 3, l: t('confirmation.title'), icon: '✅' },
              ].map((s, i) => (
                <div key={s.n} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-drivo-green/20 rounded-full px-4 py-2">
                    <span className="text-[14px]">{s.icon}</span>
                    <span className="text-[13px] font-semibold text-drivo-green">{s.l}</span>
                  </div>
                  {i < 2 && <div className="w-6 h-0.5 bg-white/20 hidden sm:block" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Info + Form */}
        <div className="container-main py-10">
          <div className="grid lg:grid-cols-[1fr,340px] gap-8">
            {/* Main Form + Map */}
            <div className="space-y-6">
              {/* Interactive Route Map */}
              {pickupAddress && dropoffAddress && (
                <div className="animate-fade-in">
                  <h3 className="text-[16px] font-bold text-drivo-text mb-3 flex items-center gap-2">
                    <span className="w-8 h-8 bg-drivo-green-light rounded-lg flex items-center justify-center text-[13px] font-bold text-drivo-green-dark">🗺️</span>
                    {t('booking.routePreview', 'Route preview')}
                  </h3>
                  <RouteMap pickupAddress={pickupAddress} dropoffAddress={dropoffAddress} />
                </div>
              )}

              <BookingForm 
                onPickupChange={setPickupAddress}
                onDropoffChange={setDropoffAddress}
              />
            </div>

            {/* Sidebar */}
            <div className="space-y-5">
              {/* Why Book */}
              <div className="card">
                <h4 className="text-[15px] font-bold text-drivo-text mb-4">{t('trust.title')}</h4>
                <div className="space-y-3">
                  {[
                    { i: '✅', t: t('how.step3.title') },
                    { i: '🛡️', t: t('trust.item1.title') },
                    { i: '♿', t: t('trust.item4.title') },
                    { i: '💳', t: t('booking.payment') },
                    { i: '📍', t: t('booking.trackingComing', 'Real-time tracking coming soon') },
                    { i: '🔒', t: t('booking.gdprSecure', 'EU GDPR compliant. Encrypted.') },
                  ].map((x) => (
                    <div key={x.t} className="flex items-center gap-3">
                      <span className="text-[16px]">{x.i}</span>
                      <span className="text-[13px] text-drivo-text">{x.t}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Popular Routes */}
              <div className="card">
                <h4 className="text-[15px] font-bold text-drivo-text mb-4">📍 {t('booking.popularRoutes', 'Popular routes')}</h4>
                {[
                  { from: 'BTS Airport', to: 'City Center', price: '~€15', time: '~20 min' },
                  { from: 'Main Station', to: 'Petržalka', price: '~€8', time: '~12 min' },
                  { from: 'Old Town', to: 'Vienna Airport', price: '~€55', time: '~55 min' },
                ].map((r) => (
                  <div key={r.from} className="flex items-center justify-between py-3 border-b border-drivo-border-light last:border-0">
                    <div>
                      <p className="text-[13px] font-medium text-drivo-text">{r.from} → {r.to}</p>
                      <p className="text-[11px] text-drivo-text-muted">{r.time}</p>
                    </div>
                    <span className="text-[14px] font-bold text-drivo-green">{r.price}</span>
                  </div>
                ))}
              </div>

              {/* WAV Notice */}
              <div className="card bg-drivo-purple-light/30 border border-drivo-purple/20">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl animate-float">🚐</span>
                  <div>
                    <p className="text-[14px] font-bold text-drivo-navy">{t('fleet.wavBadge')}</p>
                    <span className="pill-amber text-[10px]">{t('common.comingSoon')}</span>
                  </div>
                </div>
                <p className="text-[12px] text-drivo-text-secondary">
                  {t('fleet.wavNote')}
                </p>
              </div>

              {/* Need Help */}
              <div className="card bg-drivo-green-light/50 border border-drivo-green/20">
                <h4 className="text-[15px] font-bold text-drivo-text mb-2">{t('booking.needHelp', 'Need help booking?')}</h4>
                <p className="text-[13px] text-drivo-text-secondary mb-4">{t('booking.support247', 'Our team is available 24/7')}</p>
                <div className="space-y-2">
                  <a href={WHATSAPP_URL} className="btn-primary w-full text-[13px] py-3">💬 {t('common.whatsapp')}</a>
                  <a href={`tel:+${PHONE_RAW}`} className="btn-outline w-full text-[13px] py-3">📞 {t('common.callUs')}</a>
                </div>
              </div>

              {/* Reviews Mini */}
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex -space-x-2">
                    {['https://i.pravatar.cc/32?img=10', 'https://i.pravatar.cc/32?img=12', 'https://i.pravatar.cc/32?img=20'].map((src, i) => (
                      <Image key={src} src={src} alt="" width={32} height={32} className="h-8 w-8 rounded-full border-2 border-white object-cover" />
                    ))}
                  </div>
                  <div>
                    <div className="flex gap-0.5">{[...Array(5)].map((_, j) => (<span key={j} className="text-amber-400 text-[12px]">★</span>))}</div>
                    <p className="text-[11px] text-drivo-text-muted">2,400+ happy riders</p>
                  </div>
                </div>
                <p className="text-[12px] text-drivo-text-secondary italic">&ldquo;Best accessible transport in Bratislava!&rdquo;</p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
