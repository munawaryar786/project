import { ServiceInfo } from '@/types/booking';

export const PHONE_NUMBER = '+421 908 467 335';
export const PHONE_RAW = '421908467335';
export const WHATSAPP_URL = 'https://wa.me/421908467335';
export const WHATSAPP_BOOKING_URL = 'https://wa.me/421908467335?text=Hello%20Drivo%2C%20I%20need%20help%20booking%20a%20ride';
export const EMAIL = 'info@drivo.sk';
export const MAX_PASSENGERS = 6;

export const SERVICES: ServiceInfo[] = [
  { icon: '🚕', name: 'Standard Taxi', desc: 'Everyday city rides', href: '/taxi', color: 'from-blue-500/10 to-cyan-500/5' },
  { icon: '✈️', name: 'Airport Transfers', desc: 'BTS & Vienna airports', href: '/airport', color: 'from-sky-500/10 to-blue-500/5' },
  { icon: '♿', name: 'Accessible Transport', desc: 'ZŤP / PRM priority service', href: '/accessible-transport', color: 'from-purple-500/10 to-violet-500/5', badge: 'Priority' },
  { icon: '👴', name: 'Senior Taxi', desc: 'Patient, assisted rides', href: '/seniors', color: 'from-green-500/10 to-emerald-500/5' },
  { icon: '👧', name: "Children's Transport", desc: 'School Pick-up & Drop-off', href: '/children', color: 'from-pink-500/10 to-rose-500/5' },
  { icon: '🔑', name: 'Car Rental for Drivers', desc: 'Weekly vehicle rental', href: '/car-rental', color: 'from-amber-500/10 to-orange-500/5', badge: 'Drivers' },
];

export const NAV_LINKS = [
  { name: 'About', href: '/about' },
  { name: 'FAQ', href: '/faq' },
  { name: 'Contact', href: '/contact' },
];
