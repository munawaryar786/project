export type ServiceType = 'standard' | 'accessible' | 'senior' | 'children' | 'airport' | 'rental';
export type LuggageType = 'none' | 'small' | 'large';
export type PaymentMethod = '' | 'card' | 'cash' | 'invoice';
export type LanguageType = 'slovak' | 'english' | 'ukrainian' | 'other';
export type BookingStep = 1 | 2 | 3;

export interface ServiceInfo {
  icon: string;
  name: string;
  desc: string;
  href: string;
  color?: string;
  badge?: string;
}