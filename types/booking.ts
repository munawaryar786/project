export type ServiceType = 'standard' | 'accessible' | 'senior' | 'children' | 'airport' | 'rental';
export type LuggageType = 'none' | 'small' | 'large';
export type PaymentMethod = '' | 'card' | 'cash' | 'invoice';
export type LanguageType = 'slovak' | 'english' | 'ukrainian' | 'other';
export type BookingStep = 1 | 2 | 3;

export type AssistanceLevel = '' | 'LIGHT' | 'DOOR_TO_DOOR' | 'BOARDING_HELP';
export type WheelchairType = '' | 'MANUAL' | 'ELECTRIC' | 'FOLDABLE';
export type TransferToSeat = '' | 'YES' | 'NO';
export type MedicalTripType = '' | 'GO_ONLY' | 'GO_RETURN' | 'WAIT_RETURN';
export type WaitingDuration = '' | '30_MINUTES' | '1_HOUR' | '2_HOURS' | '3_HOURS' | '4_HOURS' | 'CUSTOM';
export type RecurrenceType = '' | 'ONE_TIME' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

export interface ServiceInfo {
  icon: string;
  name: string;
  desc: string;
  href: string;
  color?: string;
  badge?: string;
}
