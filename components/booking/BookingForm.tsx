"use client";

import { csrfFetch } from "@/lib/client/csrf-fetch";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type {
  ServiceType,
  LuggageType,
  PaymentMethod,
  BookingStep,
  AssistanceLevel,
  WheelchairType,
  TransferToSeat,
  MedicalTripType,
  WaitingDuration,
  RecurrenceType,
} from "@/types/booking";
import PassengerCounter from "./PassengerCounter";
import LuggageWarning from "./LuggageWarning";
import CashWarning from "./CashWarning";
import OTPVerification from "./OTPVerification";
import BookingConfirmation from "./BookingConfirmation";
import AddressAutocomplete from "./AddressAutocomplete";
import PriceEstimate from "./PriceEstimate";
import { marketLocalDateTime } from "@/lib/market-booking-time";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { messageKeyForCode, presentMessage } from "@/lib/i18n/message-catalog";
import { isCustomerServiceEnabled } from "@/lib/feature-flags";
import {
  beginGuestDraftTransition,
  clearBookingDraft,
  clearGuestDraftTransition,
  clearBookingSubmissionUncertain,
  clearBookingOperationId,
  eligibleGuestDraftForPassenger,
  hasPassengerHistoryInTab,
  hasUncertainBookingSubmission,
  markBookingSubmissionUncertain,
  notePassengerHistoryInTab,
  readBookingOperationId,
  readBookingDraft,
  readGuestDraftTransition,
  removeLegacyBookingDraft,
  saveBookingDraft,
  saveBookingOperationId,
  scopeForPassenger,
  type BookingDraft,
  type BookingDraftFields,
  type DraftBookingLanguage,
  type DraftScope,
} from "@/lib/booking-draft";

function isBookingLanguage(value: string): value is DraftBookingLanguage {
  return value === "sk" || value === "de" || value === "uk" || value === "en" || value === "cs";
}

type Coords = {
  lat: number;
  lng: number;
};

type JsonRecord = Record<string, unknown>;

type FareBreakdown = Record<string, unknown>;
type AuthMode =
  | "idle"
  | "checkingPhone"
  | "registrationOtp"
  | "createAccount"
  | "existingAccountLogin"
  | "legacyPasswordSetupOtp"
  | "legacyPasswordSetup"
  | "emailRecovery"
  | "loginStepUp"
  | "authenticated";

type ChildDetail = {
  fullName: string;
  age: string;
  specialRequirements: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readError(data: unknown, fallback: string) {
  if (!isRecord(data)) return fallback;
  if (typeof data.message === "string") return data.message;
  return typeof data.error === "string" ? data.error : fallback;
}

function readCode(data: unknown) {
  return isRecord(data) && typeof data.code === "string" ? data.code : "";
}

type Translate = (key: string, fallback?: string) => string;

const BOOKING_AUTH_ERROR_FALLBACKS: Record<string, string> = {
  "bookingAuth.errors.authContinue": "Please log in or verify your phone to continue.",
  "bookingAuth.errors.invalidPassword": "Incorrect password.",
  "bookingAuth.errors.authenticationRequired": "Authentication required.",
  "bookingAuth.errors.phoneVerificationRequired": "Phone verification required.",
  "bookingAuth.errors.verificationExpired": "Verification expired. Please request a new code.",
  "bookingAuth.errors.rateLimited": "Too many attempts. Please try again later.",
  "bookingAuth.errors.passwordRequired": "Password is required.",
  "bookingAuth.errors.accountExists": "This phone already has an account.",
  "bookingAuth.errors.unknown": "Something went wrong. Please try again.",
  "bookingAuth.errors.invalidOtp": "Invalid verification code.",
  "bookingAuth.errors.verificationFailed": "Verification failed. Please try again.",
};

function bookingAuthErrorKeyFromCode(code: string) {
  const normalized = code.trim().toUpperCase();
  const map: Record<string, string> = {
    AUTHENTICATION_REQUIRED: "bookingAuth.errors.authContinue",
    INVALID_PASSWORD: "bookingAuth.errors.invalidPassword",
    PHONE_VERIFICATION_REQUIRED: "bookingAuth.errors.phoneVerificationRequired",
    OTP_EXPIRED: "bookingAuth.errors.verificationExpired",
    PROOF_EXPIRED: "bookingAuth.errors.verificationExpired",
    RATE_LIMITED: "bookingAuth.errors.rateLimited",
    TOO_MANY_ATTEMPTS: "bookingAuth.errors.rateLimited",
    ACCOUNT_EXISTS: "bookingAuth.errors.accountExists",
    ACCOUNT_EXISTS_LOGIN_REQUIRED: "bookingAuth.errors.accountExists",
    PASSWORD_REQUIRED: "bookingAuth.errors.passwordRequired",
    OTP_INVALID: "bookingAuth.errors.invalidOtp",
    UNKNOWN_ERROR: "bookingAuth.errors.unknown",
  };
  return map[normalized] || (normalized.startsWith("PROOF_") ? "bookingAuth.errors.phoneVerificationRequired" : "");
}

function bookingAuthErrorKeyFromMessage(message: string) {
  const normalized = message.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return "";
  if (normalized === "authentication required") return "bookingAuth.errors.authenticationRequired";
  if (normalized.includes("log in or verify your phone")) return "bookingAuth.errors.authContinue";
  if (normalized.includes("incorrect password") || normalized.includes("password is incorrect")) return "bookingAuth.errors.invalidPassword";
  if (normalized.includes("phone verification") && normalized.includes("required")) return "bookingAuth.errors.phoneVerificationRequired";
  if (normalized.includes("verification expired") || normalized.includes("otp_expired") || normalized.includes("expired")) return "bookingAuth.errors.verificationExpired";
  if (normalized.includes("too many attempts") || normalized.includes("rate limit")) return "bookingAuth.errors.rateLimited";
  if (normalized.includes("password is required")) return "bookingAuth.errors.passwordRequired";
  if (normalized.includes("already has an account") || normalized.includes("already has a drivo account") || normalized.includes("account exists")) return "bookingAuth.errors.accountExists";
  if (normalized.includes("something went wrong")) return "bookingAuth.errors.unknown";
  if (normalized.includes("invalid verification code") || normalized.includes("invalid code")) return "bookingAuth.errors.invalidOtp";
  return "";
}

function translatedBookingAuthError(t: Translate, key: string) {
  return t(key, BOOKING_AUTH_ERROR_FALLBACKS[key] || BOOKING_AUTH_ERROR_FALLBACKS["bookingAuth.errors.unknown"]);
}

function localizedError(data: unknown, fallbackKey: string, t: Translate) {
  const codeKey = bookingAuthErrorKeyFromCode(readCode(data));
  if (codeKey) return translatedBookingAuthError(t, codeKey);
  const sharedKey = messageKeyForCode(readCode(data));
  if (sharedKey !== 'error.unknown' && sharedKey !== 'error.retryAfter') return t(sharedKey);

  const rawMessage = readError(data, "");
  const messageKey = bookingAuthErrorKeyFromMessage(rawMessage);
  if (messageKey) return translatedBookingAuthError(t, messageKey);

  return translatedBookingAuthError(t, fallbackKey);
}

function localizeThrownError(error: unknown, fallbackKey: string, t: Translate) {
  const message = error instanceof Error ? error.message : "";
  const key = bookingAuthErrorKeyFromMessage(message);
  if (key) return translatedBookingAuthError(t, key);

  const alreadyLocalized = Object.keys(BOOKING_AUTH_ERROR_FALLBACKS).some(
    (translationKey) => message === translatedBookingAuthError(t, translationKey)
  );
  if (alreadyLocalized) return message;

  return translatedBookingAuthError(t, fallbackKey);
}

function isAuthenticationRequiredMessage(message: string) {
  const normalized = message.trim().toLowerCase();
  return (
    normalized === "authentication required" ||
    normalized === "please log in or verify your phone to continue." ||
    normalized === "please log in or verify your phone to continue"
  );
}

function authRequiredMessage(data: unknown, t: Translate) {
  return localizedError(data, "bookingAuth.errors.authContinue", t);
}

function otpVerifyMessage(data: unknown, fallbackKey: string, t: Translate) {
  return localizedError(data, fallbackKey, t);
}

function proofFailureMessage(code: string, fallbackKey: string, t: Translate) {
  const codeKey = bookingAuthErrorKeyFromCode(code);
  return translatedBookingAuthError(t, codeKey || fallbackKey);
}

function createEmptyChild(): ChildDetail {
  return { fullName: "", age: "", specialRequirements: "" };
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function splitPhoneForForm(phone: string) {
  const compact = phone.replace(/[\s().-]/g, "");
  const normalized = compact.startsWith("+") ? compact : `+${compact.replace(/^00/, "")}`;
  const knownCodes = ["+421", "+420", "+43", "+49", "+44", "+92"];
  const code = knownCodes.find((item) => normalized.startsWith(item)) || "+421";
  return {
    code,
    number: normalized.startsWith(code) ? normalized.slice(code.length) : normalized.replace(/^\+/, ""),
    normalized,
  };
}

function waitingMinutesFromDuration(value: WaitingDuration, customValue: string) {
  if (value === "30_MINUTES") return 30;
  if (value === "1_HOUR") return 60;
  if (value === "2_HOURS") return 120;
  if (value === "3_HOURS") return 180;
  if (value === "4_HOURS") return 240;
  if (value === "CUSTOM") {
    const match = customValue.match(/\d+/);
    return match ? Number(match[0]) : 0;
  }
  return 0;
}

const EDUCATIONAL_DESTINATION_TERMS = [
  "school",
  "college",
  "university",
  "educational",
  "education",
  "training",
  "centre",
  "center",
  "institute",
  "academy",
  "skola",
  "škola",
  "gymnasium",
  "gymnázium",
  "univerzita",
];

function isEducationalDestination(value: string) {
  const normalized = value.toLowerCase();
  return EDUCATIONAL_DESTINATION_TERMS.some((term) => normalized.includes(term));
}

function getInstitutionName(address: string) {
  return address.split(",")[0]?.trim() || "";
}

function CounterControl({
  label,
  value,
  onChange,
  min = 0,
  max = 12,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label className="text-[12px] font-semibold text-drivo-text-secondary mb-2 block">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-11 h-11 rounded-xl bg-drivo-bg-soft text-drivo-text font-medium text-lg hover:bg-drivo-border transition-colors flex items-center justify-center"
          aria-label={`${label} -`}
        >
          -
        </button>
        <span className="text-[20px] font-bold text-drivo-text w-8 text-center">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="w-11 h-11 rounded-xl bg-drivo-bg-soft text-drivo-text font-medium text-lg hover:bg-drivo-border transition-colors flex items-center justify-center"
          aria-label={`${label} +`}
        >
          +
        </button>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[12px] font-semibold text-drivo-text-secondary mb-1.5 block">
      {children}
    </label>
  );
}

export default function BookingForm({
  initialServiceType = "standard",
  onPickupChange,
  onDropoffChange,
  onServiceTypeChange,
}: {
  initialServiceType?: ServiceType;
  onPickupChange?: (v: string) => void;
  onDropoffChange?: (v: string) => void;
  onServiceTypeChange?: (v: ServiceType) => void;
}) {
  const { t, locale } = useLanguage();
  const [step, setStep] = useState<BookingStep>(1);
  const [serviceType, setServiceType] = useState<ServiceType>(isCustomerServiceEnabled(initialServiceType) ? initialServiceType : "standard");
  const [passengers, setPassengers] = useState(2);
  const [luggage, setLuggage] = useState<LuggageType>("none");
  const [smallBags, setSmallBags] = useState(0);
  const [largeBags, setLargeBags] = useState(0);
  const [wheelchair, setWheelchair] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [cashAgreed, setCashAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [pickupCoords, setPickupCoords] = useState<Coords | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<Coords | null>(null);
  const [locatingPickup, setLocatingPickup] = useState(false);

  const [rideMode, setRideMode] = useState<"now" | "schedule">("now");
  const [marketClock, setMarketClock] = useState(() => marketLocalDateTime());

  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("+421");
  const [languagePref, setLanguagePref] = useState<DraftBookingLanguage>(() => locale);
  const languagePrefExplicit = useRef(false);
  const [specialNotes, setSpecialNotes] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [airline, setAirline] = useState("");
  const [waitAndGreet, setWaitAndGreet] = useState(false);
  const [seniorPassenger, setSeniorPassenger] = useState(false);
  const [ztpCardHolder, setZtpCardHolder] = useState(false);
  const [wheelchairUser, setWheelchairUser] = useState(false);
  const [companionRequired, setCompanionRequired] = useState(false);
  const [medicalAppointment, setMedicalAppointment] = useState(false);
  const [waitingTimeRequired, setWaitingTimeRequired] = useState(false);
  const [assistanceLevel, setAssistanceLevel] = useState<AssistanceLevel>("");
  const [wheelchairType, setWheelchairType] = useState<WheelchairType>("");
  const [canTransferToSeat, setCanTransferToSeat] = useState<TransferToSeat>("");
  const [companionCount, setCompanionCount] = useState(1);
  const [hospitalName, setHospitalName] = useState("");
  const [department, setDepartment] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [tripType, setTripType] = useState<MedicalTripType>("GO_ONLY");
  const [returnTimingPreference, setReturnTimingPreference] = useState<"FIXED" | "FLEXIBLE">("FIXED");
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [waitingDuration, setWaitingDuration] = useState<WaitingDuration>("");
  const [customWaitingDuration, setCustomWaitingDuration] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrenceType>("ONE_TIME");
  const [recurrenceCustom, setRecurrenceCustom] = useState("");
  const [childFullName, setChildFullName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [childSpecialRequirements, setChildSpecialRequirements] = useState("");
  const [childrenDetails, setChildrenDetails] = useState<ChildDetail[]>([
    createEmptyChild(),
    createEmptyChild(),
  ]);
  const [parentFullName, setParentFullName] = useState("");
  const [parentPrimaryPhone, setParentPrimaryPhone] = useState("");
  const [parentEmergencyPhone, setParentEmergencyPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [educationalInstitutionName, setEducationalInstitutionName] = useState("");
  const [institutionSuggestionSelected, setInstitutionSuggestionSelected] = useState(false);

  const [bookingId, setBookingId] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [devOtp, setDevOtp] = useState<string | undefined>(undefined);
  const [registrationProofToken, setRegistrationProofToken] = useState("");
  const [legacyPasswordSetupProofToken, setLegacyPasswordSetupProofToken] = useState("");
  const [proofExpiresAt, setProofExpiresAt] = useState("");
  const [registrationProofPhone, setRegistrationProofPhone] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("idle");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [accountNeedsPhoneReverification, setAccountNeedsPhoneReverification] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [earlyLoginOpen, setEarlyLoginOpen] = useState(false);
  const [earlyRecoveryOpen, setEarlyRecoveryOpen] = useState(false);
  const [earlyPhoneCode, setEarlyPhoneCode] = useState("+421");
  const [earlyPhoneNumber, setEarlyPhoneNumber] = useState("");
  const [earlyAuthErrorCode, setEarlyAuthErrorCode] = useState("");
  const [lateLoginErrorCode, setLateLoginErrorCode] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const [recoveryErrorCode, setRecoveryErrorCode] = useState("");
  const [logoutFailed, setLogoutFailed] = useState(false);
  const [loginAttemptId, setLoginAttemptId] = useState("");
  const [loginOtp, setLoginOtp] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [accountPassword, setAccountPassword] = useState("");
  const [accountConfirmPassword, setAccountConfirmPassword] = useState("");
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [estimatedPrice, setEstimatedPrice] = useState<number | undefined>();
  const [fareBreakdown, setFareBreakdown] = useState<FareBreakdown | null>(null);
  const [showWavModal, setShowWavModal] = useState(false);
  const [passengerProfile, setPassengerProfile] = useState<Record<string, unknown> | null>(null);
  const accountCreateInFlight = useRef(false);
  const loginInFlight = useRef(false);
  const recoveryInFlight = useRef(false);
  const authEpoch = useRef(0);
  const submissionInFlight = useRef(false);
  const autoCheckedOperation = useRef("");
  const lastSubmittedPayload = useRef<string | null>(null);
  const bookingCreated = useRef(false);
  const formTouchedSinceMount = useRef(false);
  const [draftScope, setDraftScope] = useState<DraftScope>("guest");
  const [draftReady, setDraftReady] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<{ draft: BookingDraft; scheduleNeedsCorrection: boolean } | null>(null);
  const [guestAdoption, setGuestAdoption] = useState(false);
  const [guestAdoptionFromReset, setGuestAdoptionFromReset] = useState(false);
  const guestAdoptionInFlight = useRef(false);
  const guestAdoptionHeading = useRef<HTMLHeadingElement>(null);
  const [draftNoticeKey, setDraftNoticeKey] = useState("");
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [bookingOperationId, setBookingOperationId] = useState("");
  const [operationChecking, setOperationChecking] = useState(false);
  const [operationNoticeKey, setOperationNoticeKey] = useState("");
  const [recoveredBooking, setRecoveredBooking] = useState<{ id: string; ref: string; guest: boolean } | null>(null);
  const latestDraftState = useRef<{
    ready: boolean; pending: boolean; progress: boolean; uncertain: boolean; createdId: boolean;
    scope: DraftScope; fields: BookingDraftFields;
  } | null>(null);

  useEffect(() => {
    if (!languagePrefExplicit.current) setLanguagePref(locale);
  }, [locale]);

  const clearPassengerAuthErrors = () => {
    setAuthError("");
    setError((current) => (isAuthenticationRequiredMessage(current) ? "" : current));
  };

  const markPassengerAuthenticated = (passenger: Record<string, unknown>, fromSessionCheck = false) => {
    authEpoch.current += 1;
    notePassengerHistoryInTab();
    if (!fromSessionCheck) {
      latestDraftState.current = null;
      clearGuestDraftTransition();
      clearBookingDraft();
      setPendingDraft(null);
      setGuestAdoption(false);
      setGuestAdoptionFromReset(false);
      const scope = scopeForPassenger(passenger);
      setDraftScope(scope || "guest");
      setDraftReady(Boolean(scope));
    }
    setPassengerProfile(passenger);
    setAuthMode("authenticated");
    setEarlyLoginOpen(false);
    setEarlyRecoveryOpen(false);
    setEarlyAuthErrorCode("");
    setLogoutFailed(false);
    setLoginPassword("");
    if (typeof passenger.fullName === "string") setCustomerName((current) => current || String(passenger.fullName));
    if (typeof passenger.email === "string") setCustomerEmail((current) => current || String(passenger.email));
    if (typeof passenger.normalizedPhone === "string" || typeof passenger.phone === "string") {
      const phone = splitPhoneForForm(String(passenger.normalizedPhone || passenger.phone));
      setPhoneCode(phone.code);
      setCustomerPhone(phone.number);
      setRegistrationProofPhone(phone.normalized);
    }
    setRegistrationProofToken("");
    setLegacyPasswordSetupProofToken("");
    setProofExpiresAt("");
    setAccountNeedsPhoneReverification(false);
    setDevOtp(undefined);
    setAuthError("");
    setError((current) => (isAuthenticationRequiredMessage(current) ? "" : current));
  };

  useEffect(() => {
    setServiceType(isCustomerServiceEnabled(initialServiceType) ? initialServiceType : "standard");
  }, [initialServiceType]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  useEffect(() => {
    const hasRequiredProof =
      authMode === "legacyPasswordSetup" ? legacyPasswordSetupProofToken : registrationProofToken;
    if (step === 4 && !hasRequiredProof && !accountNeedsPhoneReverification) {
      setAuthError(translatedBookingAuthError(t, "bookingAuth.errors.phoneVerificationRequired"));
      setAccountNeedsPhoneReverification(true);
    }
  }, [accountNeedsPhoneReverification, authMode, legacyPasswordSetupProofToken, registrationProofToken, step]);

  useEffect(() => {
    onServiceTypeChange?.(serviceType);
  }, [onServiceTypeChange, serviceType]);

  useEffect(() => {
    const refresh = () => setMarketClock(marketLocalDateTime());
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  const today = marketClock.date;
  const assistedTransport = serviceType === "accessible";
  const quoteOnlyTransport = false;
  const passengerAuthenticated = Boolean(passengerProfile) || authMode === "authenticated";
  const submitButtonLabel = passengerAuthenticated
    ? quoteOnlyTransport
      ? t("booking.submitBookingRequest", "Submit Booking Request")
      : t("booking.confirmBooking", "Confirm Booking")
    : t("booking.continue", "Continue to Verification");
  const activeCompanionCount = assistedTransport && companionRequired ? companionCount : 0;
  const capacityPassengerCount = passengers + activeCompanionCount;
  const luggageCount = smallBags + largeBags;
  const luggageUnits = smallBags + largeBags * 2;
  const largerVehicleRecommended =
    capacityPassengerCount > 4 ||
    (capacityPassengerCount >= 4 && largeBags > 0) ||
    (capacityPassengerCount >= 5 && luggageCount > 0) ||
    capacityPassengerCount + luggageUnits > 6;
  const wavRequired = assistedTransport && wheelchairUser && canTransferToSeat === "NO";
  const passengerRemainsInWheelchair = wavRequired;
  const showWaitingDuration = assistedTransport && (waitingTimeRequired || tripType === "WAIT_RETURN");
  const showMedicalReturnDetails = assistedTransport && (medicalAppointment || waitingTimeRequired);
  const contactStepNumber = showMedicalReturnDetails ? 6 : assistedTransport ? 5 : 4;
  const childrenTransport = serviceType === "children";
  const institutionAddress = dropoffAddress.trim();
  const currentBookingTime = marketClock.time;
  const estimateScheduledDate = childrenTransport || rideMode === "schedule" ? scheduledDate : today;
  const estimateScheduledTime = childrenTransport || rideMode === "schedule" ? scheduledTime : currentBookingTime;
  const estimateWaitingMinutes = showWaitingDuration
    ? waitingMinutesFromDuration(waitingDuration, customWaitingDuration)
    : 0;
  const selectedInstitutionName =
    educationalInstitutionName.trim() || getInstitutionName(institutionAddress);
  const activeChildrenDetails = useMemo(
    () => childrenDetails.slice(0, passengers),
    [childrenDetails, passengers]
  );
  const primaryChild = activeChildrenDetails[0] || createEmptyChild();

  const clearRegistrationProof = () => {
    setRegistrationProofToken("");
    setLegacyPasswordSetupProofToken("");
    setProofExpiresAt("");
    setRegistrationProofPhone("");
  };

  const requirePhoneReverification = (message: string) => {
    clearRegistrationProof();
    setAccountNeedsPhoneReverification(true);
    setAuthError(message);
    setError("");
  };

  const resetOtpAttemptState = () => {
    clearRegistrationProof();
    setAccountNeedsPhoneReverification(false);
    setAuthError("");
    setError("");
    setDevOtp(undefined);
  };
  const updateChildDetail = (index: number, patch: Partial<ChildDetail>) => {
    setChildrenDetails((current) =>
      current.map((child, childIndex) =>
        childIndex === index ? { ...child, ...patch } : child
      )
    );
  };

  useEffect(() => {
    const nextLuggage: LuggageType =
      largeBags > 0 ? "large" : smallBags > 0 ? "small" : "none";
    setLuggage(nextLuggage);
  }, [smallBags, largeBags]);

  const handleFareChange = useCallback((price: number, breakdown: FareBreakdown) => {
    setEstimatedPrice(price);
    setFareBreakdown(breakdown);
  }, []);

  useEffect(() => {
    if (!quoteOnlyTransport) return;
    setEstimatedPrice(undefined);
    setFareBreakdown(null);
  }, [quoteOnlyTransport]);

  useEffect(() => {
    if (!assistedTransport) {
      setWheelchair(false);
      setSeniorPassenger(false);
      setZtpCardHolder(false);
      setWheelchairUser(false);
      setCompanionRequired(false);
      setMedicalAppointment(false);
      setWaitingTimeRequired(false);
    }
  }, [assistedTransport]);

  useEffect(() => {
    if (childrenTransport && paymentMethod === "cash") {
      setPaymentMethod("card");
      setCashAgreed(false);
    }
  }, [childrenTransport, paymentMethod]);

  useEffect(() => {
    if (childrenTransport) {
      setSmallBags(0);
      setLargeBags(0);
      setLuggage("none");
    }
  }, [childrenTransport]);

  useEffect(() => {
    if (!childrenTransport) return;

    setChildrenDetails((current) => {
      const next = current.slice(0, passengers);
      while (next.length < passengers) {
        next.push(createEmptyChild());
      }
      return next;
    });
  }, [childrenTransport, passengers]);

  useEffect(() => {
    setChildFullName(primaryChild.fullName);
    setChildAge(primaryChild.age);
    setChildSpecialRequirements(primaryChild.specialRequirements);
  }, [primaryChild.fullName, primaryChild.age, primaryChild.specialRequirements]);

  useEffect(() => {
    if (!seniorPassenger) setAssistanceLevel("");
    if (!wheelchairUser) {
      setWheelchairType("");
      setCanTransferToSeat("");
    }
    if (!companionRequired) setCompanionCount(1);
    if (!medicalAppointment) {
      setHospitalName("");
      setDepartment("");
      setAppointmentDate("");
      setAppointmentTime("");
      setTripType("GO_ONLY");
      setReturnTimingPreference("FIXED");
      setReturnDate("");
      setReturnTime("");
    }
    if (!showWaitingDuration) {
      setWaitingDuration("");
      setCustomWaitingDuration("");
    }
  }, [seniorPassenger, wheelchairUser, companionRequired, medicalAppointment, showWaitingDuration]);
  useEffect(() => {
    removeLegacyBookingDraft();
    const savedOperation = readBookingOperationId();
    setSubmissionUncertain(hasUncertainBookingSubmission() || Boolean(savedOperation));
    setBookingOperationId(savedOperation || "");
    const requestEpoch = authEpoch.current;
    csrfFetch("passenger","/api/passenger/me", { cache: "no-store", credentials: "include" })
      .then(async (res) => {
        if (res.status !== 401 && !res.ok) throw new Error("Session check unavailable");
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        if (requestEpoch !== authEpoch.current) return;
        const passenger = isRecord(data) && isRecord(data.passenger) ? data.passenger : null;
        const scope = passenger ? scopeForPassenger(passenger) : "guest";
        if (!scope) throw new Error("Invalid passenger scope");
        const adoptable = passenger ? eligibleGuestDraftForPassenger(passenger) : null;
        if (passenger && !adoptable) clearGuestDraftTransition();
        if (!passenger && hasPassengerHistoryInTab()) {
          clearGuestDraftTransition();
          clearBookingDraft();
          setDraftNoticeKey("phase43.privacyDiscarded");
          setDraftScope("guest");
          setDraftReady(true);
          return;
        }
        if (!passenger) clearGuestDraftTransition();
        if (passenger) markPassengerAuthenticated(passenger, true);
        setDraftScope(scope);
        const result = adoptable || readBookingDraft(scope);
        if (formTouchedSinceMount.current) {
          clearGuestDraftTransition();
          clearBookingDraft();
          setDraftReady(true);
        } else if (result.status === "ready") {
          setPendingDraft(result);
          setGuestAdoption(Boolean(adoptable));
          const transition = adoptable ? readGuestDraftTransition() : null;
          setGuestAdoptionFromReset(transition?.state === "authenticated" && transition.via === "reset");
        } else if (result.status === "unavailable") {
          setDraftNoticeKey("phase4.saveUnavailable");
        } else {
          if (result.status !== "empty") setDraftNoticeKey(`phase4.${result.status}`);
          setDraftReady(true);
        }
      })
      .catch(() => { setDraftNoticeKey("phase4.sessionUnavailable"); });
  }, []);

  const draftFields: BookingDraftFields = {
    step: 1,
    serviceType: serviceType === "accessible" || serviceType === "children" || serviceType === "airport" ? serviceType : "standard",
    passengers,
    smallBags: childrenTransport ? 0 : smallBags,
    largeBags: childrenTransport ? 0 : largeBags,
    pickupAddress,
    dropoffAddress,
    rideMode: childrenTransport ? "schedule" : rideMode,
    scheduledDate: childrenTransport || rideMode === "schedule" ? scheduledDate : "",
    scheduledTime: childrenTransport || rideMode === "schedule" ? scheduledTime : "",
    airline: serviceType === "airport" && ["Ryanair", "Wizz Air", "Austrian", "Other"].includes(airline)
      ? airline as BookingDraftFields["airline"] : "",
    waitAndGreet: serviceType === "airport" && waitAndGreet,
    bookingLanguage: languagePrefExplicit.current ? languagePref : null,
  };
  const hasDraftProgress = Boolean(
    pickupAddress || dropoffAddress || passengers !== 2 || smallBags || largeBags ||
    scheduledDate || scheduledTime || airline || waitAndGreet ||
    serviceType !== (isCustomerServiceEnabled(initialServiceType) ? initialServiceType : "standard") ||
    languagePrefExplicit.current
  );
  latestDraftState.current = {
    ready: draftReady, pending: Boolean(pendingDraft), progress: hasDraftProgress,
    uncertain: submissionUncertain, createdId: Boolean(bookingId),
    scope: draftScope, fields: draftFields,
  };

  const prepareGuestDraftNavigation = () => {
    if (draftScope !== "guest" || !draftReady || pendingDraft || !hasDraftProgress ||
        step !== 1 || bookingId || submissionUncertain || hasUncertainBookingSubmission() ||
        readBookingOperationId() || submissionInFlight.current || bookingCreated.current) return;
    if (!saveBookingDraft("guest", draftFields) || !beginGuestDraftTransition()) {
      clearGuestDraftTransition();
      setDraftNoticeKey("phase43.unavailable");
    }
  };

  useEffect(() => {
    const persistLatest = () => {
      const current = latestDraftState.current;
      if (current?.ready && !current.pending && current.progress && !current.uncertain && !current.createdId &&
          !submissionInFlight.current && !bookingCreated.current && !hasUncertainBookingSubmission()) {
        saveBookingDraft(current.scope, current.fields);
      }
    };
    window.addEventListener("pagehide", persistLatest);
    return () => { window.removeEventListener("pagehide", persistLatest); persistLatest(); };
  }, []);

  useEffect(() => {
    if (!draftReady || pendingDraft || step !== 1 || bookingId || bookingCreated.current || submissionInFlight.current || submissionUncertain) return;
    if (!hasDraftProgress) { clearBookingDraft(); return; }
    const timer = window.setTimeout(() => {
      if (!saveBookingDraft(draftScope, draftFields)) setDraftNoticeKey("phase4.saveUnavailable");
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draftReady, pendingDraft, draftScope, step, bookingId, submissionUncertain, hasDraftProgress,
      serviceType, passengers, smallBags, largeBags, pickupAddress, dropoffAddress,
      rideMode, scheduledDate, scheduledTime, airline, waitAndGreet, languagePref]);

  const resumeDraft = async () => {
    if (!pendingDraft || formTouchedSinceMount.current) return;
    let selectedDraft = readBookingDraft(guestAdoption ? "guest" : draftScope);
    if (selectedDraft.status !== "ready") {
      clearGuestDraftTransition(); setPendingDraft(null); setGuestAdoption(false);
      setGuestAdoptionFromReset(false);
      setDraftReady(true);
      setDraftNoticeKey(guestAdoption ? "phase43.unavailable" : selectedDraft.status === "unavailable" ? "phase4.saveUnavailable" : selectedDraft.status === "empty" ? "phase4.invalid" : `phase4.${selectedDraft.status}`);
      return;
    }
    if (guestAdoption) {
      if (guestAdoptionInFlight.current) return;
      guestAdoptionInFlight.current = true;
      try {
        if (submissionUncertain || hasUncertainBookingSubmission() || readBookingOperationId()) throw new Error("Booking outcome uncertain");
        const response = await csrfFetch("passenger", "/api/passenger/me", { cache: "no-store", credentials: "include" });
        if (!response.ok) throw new Error("Session unavailable");
        const data = await response.json();
        const passenger = isRecord(data) && isRecord(data.passenger) ? data.passenger : null;
        if (!passenger || scopeForPassenger(passenger) !== draftScope) throw new Error("Draft transition unavailable");
        const current = eligibleGuestDraftForPassenger(passenger);
        if (!current || current.status !== "ready") throw new Error("Draft transition unavailable");
        selectedDraft = current;
      } catch {
        clearGuestDraftTransition(); clearBookingDraft(); setPendingDraft(null); setGuestAdoption(false);
        setGuestAdoptionFromReset(false);
        setDraftReady(true); resetUnsubmittedForm(); setDraftNoticeKey("phase43.unavailable");
        guestAdoptionInFlight.current = false;
        return;
      }
      guestAdoptionInFlight.current = false;
    }
    const { fields } = selectedDraft.draft;
    setServiceType(fields.serviceType);
    setPassengers(fields.passengers);
    setSmallBags(fields.smallBags);
    setLargeBags(fields.largeBags);
    setPickupAddress(fields.pickupAddress);
    setDropoffAddress(fields.dropoffAddress);
    setPickupCoords(null);
    setDropoffCoords(null);
    onPickupChange?.(fields.pickupAddress);
    onDropoffChange?.(fields.dropoffAddress);
    setRideMode(fields.rideMode);
    setScheduledDate(selectedDraft.scheduleNeedsCorrection ? "" : fields.scheduledDate);
    setScheduledTime(selectedDraft.scheduleNeedsCorrection ? "" : fields.scheduledTime);
    setAirline(fields.airline);
    setWaitAndGreet(fields.waitAndGreet);
    if (fields.bookingLanguage) {
      languagePrefExplicit.current = true;
      setLanguagePref(fields.bookingLanguage);
    }
    setStep(1);
    if (guestAdoption) { clearGuestDraftTransition(); clearBookingDraft(); setGuestAdoption(false); setGuestAdoptionFromReset(false); }
    setPendingDraft(null);
    setDraftReady(true);
    setDraftNoticeKey(selectedDraft.scheduleNeedsCorrection ? "phase4.scheduleNeedsCorrection" : "phase4.restored");
  };

  const resetUnsubmittedForm = () => {
    setStep(1);
    setServiceType(isCustomerServiceEnabled(initialServiceType) ? initialServiceType : "standard");
    setPassengers(2); setSmallBags(0); setLargeBags(0); setLuggage("none");
    setPickupAddress(""); setDropoffAddress(""); setPickupCoords(null); setDropoffCoords(null);
    onPickupChange?.(""); onDropoffChange?.("");
    setRideMode("now"); setScheduledDate(""); setScheduledTime("");
    setWheelchair(false); setWaitAndGreet(false); setFlightNumber(""); setAirline("");
    setSeniorPassenger(false); setZtpCardHolder(false); setWheelchairUser(false);
    setCompanionRequired(false); setMedicalAppointment(false); setWaitingTimeRequired(false);
    setAssistanceLevel(""); setWheelchairType(""); setCanTransferToSeat(""); setCompanionCount(1);
    setHospitalName(""); setDepartment(""); setAppointmentDate(""); setAppointmentTime("");
    setTripType("GO_ONLY"); setReturnTimingPreference("FIXED"); setReturnDate(""); setReturnTime(""); setWaitingDuration("");
    setCustomWaitingDuration(""); setRecurrence("ONE_TIME"); setRecurrenceCustom("");
    setChildrenDetails([createEmptyChild(), createEmptyChild()]);
    setChildFullName(""); setChildAge(""); setChildSpecialRequirements("");
    setParentFullName(""); setParentPrimaryPhone(""); setParentEmergencyPhone("");
    setParentEmail(""); setEducationalInstitutionName(""); setInstitutionSuggestionSelected(false);
    setCustomerName(""); setCustomerEmail(""); setCustomerPhone(""); setSpecialNotes("");
    setCashAgreed(false); setPaymentMethod("card"); setEstimatedPrice(undefined); setFareBreakdown(null);
    setError(""); setAuthError(""); setEarlyAuthErrorCode(""); setLateLoginErrorCode("");
    setEarlyLoginOpen(false); setEarlyRecoveryOpen(false); setRecoveryEmail(""); setRecoveryRequested(false);
    setRecoveryErrorCode(""); setLoginPassword(""); setLoginOtp("");
    languagePrefExplicit.current = false; setLanguagePref(locale);
  };

  const discardDraft = () => {
    latestDraftState.current = null;
    clearGuestDraftTransition();
    clearBookingDraft();
    setPendingDraft(null);
    setGuestAdoption(false);
    setGuestAdoptionFromReset(false);
    setDraftReady(true);
    resetUnsubmittedForm();
    setDraftNoticeKey("phase4.discarded");
  };

  useEffect(() => {
    if (guestAdoption && pendingDraft && !formTouchedSinceMount.current) guestAdoptionHeading.current?.focus();
  }, [guestAdoption, pendingDraft]);

  useEffect(() => {
    if (bookingId || bookingCreated.current ||
        ((!draftReady && !pendingDraft) || (!hasDraftProgress && !passengerProfile && !pendingDraft))) return;
    const verifyScope = async () => {
      const requestEpoch = authEpoch.current;
      try {
        const response = await csrfFetch("passenger", "/api/passenger/me", { cache: "no-store", credentials: "include" });
        if (response.status !== 401 && !response.ok) throw new Error("Session check unavailable");
        const data = response.ok ? await response.json() : null;
        if (requestEpoch !== authEpoch.current) return;
        const passenger = isRecord(data) && isRecord(data.passenger) ? data.passenger : null;
        const currentScope = passenger ? scopeForPassenger(passenger) : "guest";
        if (!currentScope || currentScope === draftScope) return;
        authEpoch.current += 1;
        latestDraftState.current = null;
        notePassengerHistoryInTab();
        clearGuestDraftTransition();
        clearBookingDraft();
        const hadOperation = Boolean(readBookingOperationId()) || hasUncertainBookingSubmission();
        clearBookingOperationId();
        setBookingOperationId("");
        lastSubmittedPayload.current = null;
        if (hadOperation) {
          markBookingSubmissionUncertain();
          setSubmissionUncertain(true);
          setOperationNoticeKey("phase42.transitionReview");
        } else {
          clearBookingSubmissionUncertain();
          setSubmissionUncertain(false);
        }
        setPendingDraft(null);
        setGuestAdoption(false);
        setGuestAdoptionFromReset(false);
        resetUnsubmittedForm();
        if (passenger) markPassengerAuthenticated(passenger);
        else { setPassengerProfile(null); setAuthMode("idle"); setDraftScope("guest"); setDraftReady(true); }
        setDraftNoticeKey("phase4.accountChanged");
      } catch {
        if (requestEpoch !== authEpoch.current) return;
        // A shared browser may have changed accounts while this tab was idle.
        // If the current identity cannot be checked, discard private trip data.
        latestDraftState.current = null;
        clearGuestDraftTransition();
        clearBookingDraft();
        setPendingDraft(null);
        setGuestAdoption(false);
        setGuestAdoptionFromReset(false);
        setDraftReady(false);
        resetUnsubmittedForm();
        setPassengerProfile(null);
        setAuthMode("idle");
        setDraftNoticeKey("phase4.sessionUnavailable");
      }
    };
    window.addEventListener("focus", verifyScope);
    return () => window.removeEventListener("focus", verifyScope);
  }, [draftReady, draftScope, hasDraftProgress, passengerProfile, pendingDraft, bookingId]);

  const serviceMap: Record<string, string> = {
    standard: "STANDARD",
    accessible: "ACCESSIBLE",
    senior: "ACCESSIBLE",
    children: "CHILDREN",
    airport: "AIRPORT",
  };

  const luggageMap: Record<string, string> = {
    none: "NONE",
    small: "SMALL",
    large: "LARGE",
  };

 const paymentMap: Record<string, string> = {
    card: "CARD",
    cash: "CASH",
  };

  const safeJson = async (res: Response): Promise<unknown> => {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  };

  const clearPasswordResetState = () => {
    setRecoveryRequested(false);
    setRecoveryErrorCode("");
  };

  const sendBookingOtp = async (
    activeBookingId: string,
    phone: string,
    purpose: "PASSENGER_REGISTRATION" | "PASSENGER_LEGACY_PASSWORD_SETUP"
  ) => {
    const otpRes = await csrfFetch("passenger","/api/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        bookingId: activeBookingId,
        phone,
        purpose,
        locale,
      }),
    });

    const otpData = await safeJson(otpRes);
    if (!otpRes.ok) {
      throw new Error(localizedError(otpData, "bookingAuth.errors.unknown", t));
    }

    if (isRecord(otpData) && typeof otpData.devOtp === "string") {
      setDevOtp(otpData.devOtp);
    }
  };

  const resolvePassengerPhone = async (activeBookingId: string, phone: string) => {
    const res = await csrfFetch("passenger","/api/passenger/auth/resolve-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ bookingId: activeBookingId, phone }),
    });
    const data = await safeJson(res);
    if (!res.ok) {
      throw new Error(localizedError(data, "bookingAuth.errors.unknown", t));
    }
    if (!isRecord(data) || data.success !== true || typeof data.mode !== "string") {
      throw new Error(translatedBookingAuthError(t, "bookingAuth.errors.unknown"));
    }
    return data;
  };

  const coordsFromSuggestion = (suggestion?: { lat?: number; lng?: number }): Coords | null => {
    const lat = Number(suggestion?.lat);
    const lng = Number(suggestion?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  };

  const extractCoords = (item: unknown): Coords | null => {
    if (!isRecord(item)) return null;

    const location = isRecord(item.location) ? item.location : null;
    const geometry = isRecord(item.geometry) ? item.geometry : null;
    const geometryLocation = geometry && isRecord(geometry.location) ? geometry.location : null;

    const lat =
      item.lat ??
      item.latitude ??
      location?.lat ??
      geometryLocation?.lat;

    const lng =
      item.lng ??
      item.lon ??
      item.longitude ??
      location?.lng ??
      location?.lon ??
      geometryLocation?.lng;

    const nLat = Number(lat);
    const nLng = Number(lng);

    if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;
    return { lat: nLat, lng: nLng };
  };

  const resolveAddressCoords = async (address: string): Promise<Coords | null> => {
    if (!address || address.trim().length < 3) return null;

    try {
      const res = await csrfFetch("passenger",
        `/api/addresses/suggest?q=${encodeURIComponent(address)}${serviceType === "airport" ? "&service=airport" : ""}`,
        { cache: "no-store" }
      );

      const data = await safeJson(res);
      const list =
        isRecord(data)
          ? data.suggestionItems ||
            data.results ||
            data.addresses ||
            data.items ||
            data.suggestions ||
            []
          : [];

      if (Array.isArray(list) && list.length > 0) {
        return extractCoords(list[0]);
      }

      return extractCoords(data);
    } catch (err) {
      console.error("Failed to resolve address coordinates:", err);
      return null;
    }
  };

  const useCurrentPickupLocation = () => {
    if (!navigator.geolocation) {
      setError(t('booking.locationUnsupported'));
      return;
    }

    setLocatingPickup(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        setPickupCoords({
          lat: latitude,
          lng: longitude,
        });

        try {
          const res = await csrfFetch("passenger",
            `/api/addresses/reverse?lat=${latitude}&lng=${longitude}`,
            { cache: "no-store" }
          );

          const data = await safeJson(res);

          if (isRecord(data) && typeof data.address === "string") {
            setPickupAddress(data.address);
            onPickupChange?.(data.address);
          } else {
            const coordsText = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            setPickupAddress(coordsText);
            onPickupChange?.(coordsText);
          }
        } catch {
          const coordsText = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
          setPickupAddress(coordsText);
          onPickupChange?.(coordsText);
        } finally {
          setLocatingPickup(false);
        }
      },
      () => {
        setLocatingPickup(false);
        setError(t('booking.locationPermission'));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const validateForm = () => {
    const trimmedEmail = customerEmail.trim();

    if (pickupAddress.trim().length < 3) return t('booking.validation.pickup');
    if (dropoffAddress.trim().length < 3) return t('booking.validation.destination');
    if (rideMode === "schedule" || childrenTransport) {
      if (!scheduledDate) return t('booking.validation.date');
      if (!scheduledTime) return t('booking.validation.time');
      const marketNow = marketLocalDateTime();
      if (scheduledDate < marketNow.date ||
          (scheduledDate === marketNow.date && scheduledTime <= marketNow.time)) {
        return t('booking.validation.pastDate');
      }
    }
    if (customerName.trim().length < 2) return t('booking.validation.name');
    if (!trimmedEmail) return t('booking.validation.email');
    if (!isValidEmail(trimmedEmail)) return t('booking.validation.email');
    if (customerPhone.trim().length < 6) return t('booking.validation.phone');
    if (capacityPassengerCount > 6) return t('booking.validation.capacity');
    if (capacityPassengerCount >= 6 && luggageCount > 0) {
      return t('booking.validation.luggageCapacity');
    }
    if (assistedTransport && seniorPassenger && !assistanceLevel) return t('booking.validation.assistance');
    if (assistedTransport && wheelchairUser && !wheelchairType) return t('booking.validation.wheelchair');
    if (assistedTransport && wheelchairUser && !canTransferToSeat) return t('booking.validation.transfer');
    if (assistedTransport && companionRequired && companionCount < 1) return t('booking.validation.companions');
    if (assistedTransport && medicalAppointment) {
      if (!scheduledDate || !scheduledTime || rideMode !== "schedule") return t("booking.validation.date");
      if (!hospitalName.trim()) return t('booking.validation.hospital');
      if (!department.trim()) return t('booking.validation.department');
      if (!appointmentDate) return t('booking.validation.appointmentDate');
      if (!appointmentTime) return t('booking.validation.appointmentTime');
      if ((tripType === "GO_RETURN" || tripType === "WAIT_RETURN") && (!returnDate || (returnTimingPreference === "FIXED" && !returnTime))) {
        return t('booking.validation.return');
      }
      if (appointmentDate && scheduledDate && appointmentDate < scheduledDate) return t("booking.validation.date");
      if (returnDate && appointmentDate && returnDate < appointmentDate) return t("booking.validation.return");
      if (returnTimingPreference === "FIXED" && returnDate === scheduledDate && returnTime && returnTime <= scheduledTime) return t("booking.validation.return");
    }
    if (showWaitingDuration && !waitingDuration) return t('booking.validation.waiting');
    if (waitingDuration === "CUSTOM" && !customWaitingDuration.trim()) {
      return t('booking.validation.customWaiting');
    }
    if (childrenTransport) {
      if (!institutionSuggestionSelected) {
        return t(
          "booking.childrenInstitutionValidation",
          "Please select a verified educational institution."
        );
      }
      const destinationText = `${dropoffAddress} ${educationalInstitutionName}`.toLowerCase();
      const educationDestination = ["school", "college", "university", "educational", "education", "training", "institute", "skola", "škola", "gymnasium", "academy"].some((term) =>
        destinationText.includes(term)
      );

      if (!scheduledDate || !scheduledTime) return t('booking.validation.childPickup');
      if (!recurrence) return t('booking.validation.recurrence');
      if (recurrence === "CUSTOM" && !recurrenceCustom.trim()) return t('booking.validation.customRecurrence');
      for (let index = 0; index < activeChildrenDetails.length; index += 1) {
        const child = activeChildrenDetails[index];
        if (!child.fullName.trim()) return t('booking.validation.childName');
        if (!child.age.trim()) return t('booking.validation.childAge');
        const age = Number(child.age);
        if (!Number.isFinite(age) || age < 0 || age > 18) {
          return t('booking.validation.childAge');
        }
      }
      if (!parentFullName.trim()) return t('booking.validation.parentName');
      if (!parentPrimaryPhone.trim()) return t('booking.validation.parentPhone');
      if (!parentEmail.trim() || !isValidEmail(parentEmail.trim())) return t('booking.validation.parentEmail');
      if (!institutionSuggestionSelected && !educationDestination) {
        return t(
          "booking.childrenInstitutionValidation",
          "Please select a verified school, college, university, or approved educational institution."
        );
      }
      if (paymentMethod === "cash") return t('booking.validation.childCash');
    }
    if (paymentMethod === "cash" && !cashAgreed) {
      return t('booking.validation.cashConsent');
    }
    return "";
  };

  const checkBookingOperation = async (id = bookingOperationId, afterRetry = false) => {
    if (!id || (operationChecking && !afterRetry)) return;
    setOperationChecking(true);
    setOperationNoticeKey("phase42.checking");
    try {
      const response = await csrfFetch("passenger", `/api/bookings/operations/${encodeURIComponent(id)}`, { cache: "no-store", credentials: "include" });
      const data = await safeJson(response);
      if (!isRecord(data)) throw new Error("INVALID_STATUS");
      if (response.ok && data.state === "CREATED" && typeof data.bookingId === "string" && typeof data.bookingRef === "string") {
        if (data.guestAccessRecoveryRequired === true) {
          const access = await csrfFetch("passenger", `/api/bookings/operations/${encodeURIComponent(id)}/access`, {
            method: "POST", cache: "no-store", credentials: "include",
          });
          if (!access.ok) { setOperationNoticeKey("phase42.guestUnavailable"); return; }
        }
        bookingCreated.current = true;
        lastSubmittedPayload.current = null;
        clearBookingSubmissionUncertain();
        if (data.guestAccessRecoveryRequired !== true) clearBookingOperationId();
        clearBookingDraft();
        setSubmissionUncertain(false);
        if (data.guestAccessRecoveryRequired !== true) setBookingOperationId("");
        setBookingId(data.bookingId);
        setBookingRef(data.bookingRef);
        setRecoveredBooking({ id: data.bookingId, ref: data.bookingRef, guest: data.guestAccessRecoveryRequired === true });
        setOperationNoticeKey("phase42.recovered");
      } else if (data.state === "PROCESSING") setOperationNoticeKey("phase42.processing");
      else if (data.state === "RETRYABLE") setOperationNoticeKey("phase42.retryable");
      else if (data.state === "EXPIRED") setOperationNoticeKey("phase42.expired");
      else setOperationNoticeKey("phase42.unavailable");
    } catch { setOperationNoticeKey("phase42.network"); }
    finally { setOperationChecking(false); }
  };

  const handleAccountTransitionRecovery = (response: Response) => {
    lastSubmittedPayload.current = null;
    const hadUncertainOutcome = hasUncertainBookingSubmission() || Boolean(readBookingOperationId());
    clearBookingOperationId();
    setBookingOperationId("");
    const warning = response.headers.get("X-Drivo-Booking-Recovery");
    if ((warning || hadUncertainOutcome) && !bookingCreated.current) {
      markBookingSubmissionUncertain();
      setSubmissionUncertain(true);
      setOperationNoticeKey(warning === "BOOKING_CREATED" ? "phase42.transitionCreated" : "phase42.transitionReview");
    } else if (!bookingCreated.current) {
      clearBookingSubmissionUncertain();
      setSubmissionUncertain(false);
    }
  };

  const continueRecoveredGuest = async () => {
    if (!recoveredBooking?.guest || !customerPhone.trim()) return;
    setAuthLoading(true);
    try {
      const phone = phoneCode + customerPhone.trim();
      const state = await resolvePassengerPhone(recoveredBooking.id, phone);
      const normalizedPhone = typeof state.normalizedPhone === "string" ? state.normalizedPhone : phone;
      setRegistrationProofPhone(normalizedPhone);
      if (state.mode === "LOGIN") { setAuthMode("existingAccountLogin"); setRecoveredBooking(null); }
      else {
        const purpose = state.mode === "LEGACY_SETUP" ? "PASSENGER_LEGACY_PASSWORD_SETUP" : "PASSENGER_REGISTRATION";
        await sendBookingOtp(recoveredBooking.id, normalizedPhone, purpose);
        setAuthMode(state.mode === "LEGACY_SETUP" ? "legacyPasswordSetupOtp" : "registrationOtp");
        setRecoveredBooking(null);
        setStep(2);
      }
    } catch { setOperationNoticeKey("phase42.guestUnavailable"); }
    finally { setAuthLoading(false); }
  };

  const retryBookingOperation = async () => {
    if (!bookingOperationId || !lastSubmittedPayload.current || submissionInFlight.current || operationChecking) return;
    submissionInFlight.current = true;
    setOperationChecking(true);
    try {
      const result = await csrfFetch("passenger", "/api/bookings", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Drivo-Booking-Operation": bookingOperationId },
        body: lastSubmittedPayload.current, cache: "no-store", credentials: "include",
      });
      if (result.status === 202) { setOperationNoticeKey("phase42.processing"); return; }
      await checkBookingOperation(bookingOperationId, true);
    } catch { setOperationNoticeKey("phase42.network"); }
    finally { submissionInFlight.current = false; setOperationChecking(false); }
  };

  useEffect(() => {
    if (bookingOperationId && submissionUncertain && !submissionInFlight.current &&
        autoCheckedOperation.current !== bookingOperationId) {
      autoCheckedOperation.current = bookingOperationId;
      void checkBookingOperation(bookingOperationId);
    }
    // The saved ID is checked once after hydration; subsequent checks use the
    // explicit button so a pending operation cannot create a polling loop.
  }, [bookingOperationId, submissionUncertain]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submissionInFlight.current || submissionUncertain || bookingCreated.current || bookingId || pendingDraft) return;
    setError("");

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    submissionInFlight.current = true;
    setLoading(true);
    let submittedOperationId = "";

    try {
      const trimmedEmail = customerEmail.trim();
      if (trimmedEmail !== customerEmail) {
        setCustomerEmail(trimmedEmail);
      }
      const resolvedPickupCoords =
        pickupCoords || (await resolveAddressCoords(pickupAddress));
      const resolvedDropoffCoords =
        dropoffCoords || (await resolveAddressCoords(dropoffAddress));

      if (resolvedPickupCoords) setPickupCoords(resolvedPickupCoords);
      if (resolvedDropoffCoords) setDropoffCoords(resolvedDropoffCoords);
      const childrenPayload = activeChildrenDetails.map((child) => ({
        fullName: child.fullName.trim(),
        age: Number(child.age),
        specialRequirements: child.specialRequirements.trim() || null,
      }));
      const firstChild = childrenPayload[0];

      const preflight = await csrfFetch("passenger", "/api/bookings/operations", {
        method: "POST", cache: "no-store", credentials: "include",
      });
      const preflightData = await safeJson(preflight);
      if (!preflight.ok || !isRecord(preflightData)) throw new Error(t("phase42.preflightUnavailable"));
      if (preflightData.mode !== "disabled") {
        if (typeof preflightData.operationId !== "string" || !saveBookingOperationId(preflightData.operationId)) {
          throw new Error(t("phase42.preflightUnavailable"));
        }
        submittedOperationId = preflightData.operationId;
        setBookingOperationId(submittedOperationId);
        // The status request proves that the browser has the operation-bound
        // HttpOnly credential before any booking can be submitted.
        const ready = await csrfFetch("passenger", `/api/bookings/operations/${encodeURIComponent(submittedOperationId)}`, {
          cache: "no-store", credentials: "include",
        });
        const readyData = await safeJson(ready);
        if (ready.status !== 202 || !isRecord(readyData) || readyData.state !== "PROCESSING") {
          clearBookingOperationId(); setBookingOperationId(""); submittedOperationId = "";
          throw new Error(t("phase42.preflightUnavailable"));
        }
      }

      // A server response may be lost after creation. A refresh must not turn
      // an unfinished form draft into another automatic booking request.
      latestDraftState.current = null;
      clearBookingDraft();
      markBookingSubmissionUncertain();
      setSubmissionUncertain(true);
      const submitMarketNow = marketLocalDateTime();
      const bookingRes = await csrfFetch("passenger","/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(submittedOperationId ? { "X-Drivo-Booking-Operation": submittedOperationId } : {}) },
        cache: "no-store",
        credentials: "include",
        body: (lastSubmittedPayload.current = JSON.stringify({
          serviceType: serviceMap[serviceType],
          pickupAddress: pickupAddress.trim(),
          dropoffAddress: dropoffAddress.trim(),
          pickupLat: resolvedPickupCoords?.lat ?? null,
          pickupLng: resolvedPickupCoords?.lng ?? null,
          dropoffLat: resolvedDropoffCoords?.lat ?? null,
          dropoffLng: resolvedDropoffCoords?.lng ?? null,
          pickupMode: childrenTransport || rideMode === "schedule" ? "SCHEDULED" : "NOW",
          scheduledDate: childrenTransport || rideMode === "schedule" ? scheduledDate : submitMarketNow.date,
          scheduledTime: childrenTransport || rideMode === "schedule" ? scheduledTime : submitMarketNow.time,
          passengerCount: passengers,
          luggageType: luggageMap[luggage],
          smallBags,
          largeBags,
          wheelchairNeeded: assistedTransport && (wheelchair || wheelchairUser),
          seniorPassenger: assistedTransport && seniorPassenger,
          ztpCardHolder: assistedTransport && ztpCardHolder,
          wheelchairUser: assistedTransport && wheelchairUser,
          companionRequired: assistedTransport && companionRequired,
          medicalAppointment: assistedTransport && medicalAppointment,
          waitingTimeRequired: assistedTransport && waitingTimeRequired,
          assistanceLevel: assistedTransport ? assistanceLevel || null : null,
          wheelchairType: assistedTransport ? wheelchairType || null : null,
          canTransferToSeat:
            !assistedTransport
              ? null
              : canTransferToSeat === "YES"
              ? true
              : canTransferToSeat === "NO"
              ? false
              : null,
          wavRequired,
          passengerRemainsInWheelchair,
          companionCount: activeCompanionCount,
          hospitalName: assistedTransport && medicalAppointment ? hospitalName.trim() || null : null,
          department: assistedTransport && medicalAppointment ? department.trim() || null : null,
          appointmentDate: assistedTransport && medicalAppointment ? appointmentDate || null : null,
          appointmentTime: assistedTransport && medicalAppointment ? appointmentTime || null : null,
          tripType: assistedTransport && medicalAppointment ? tripType : null,
          returnTimingPreference: assistedTransport && medicalAppointment && tripType !== "GO_ONLY" ? returnTimingPreference : null,
          returnDate: childrenTransport || (assistedTransport && (medicalAppointment || waitingTimeRequired)) ? returnDate || null : null,
          returnTime: childrenTransport || (assistedTransport && (medicalAppointment || waitingTimeRequired)) ? returnTime || null : null,
          waitingDuration: showWaitingDuration ? waitingDuration || null : null,
          customWaitingDuration: showWaitingDuration ? customWaitingDuration.trim() || null : null,
          scheduledRide: childrenTransport,
          recurrence: childrenTransport ? recurrence : null,
          recurrenceType: childrenTransport ? recurrence : null,
          recurrenceCustom: recurrenceCustom.trim() || null,
          childrenDetails: childrenTransport ? childrenPayload : null,
          childFullName: childrenTransport ? firstChild?.fullName || null : null,
          childName: childrenTransport ? firstChild?.fullName || null : null,
          childAge: childrenTransport && firstChild ? firstChild.age : null,
          childSpecialRequirements: childrenTransport ? firstChild?.specialRequirements || null : null,
          parentFullName: parentFullName.trim() || null,
          guardianName: parentFullName.trim() || null,
          parentPrimaryPhone: parentPrimaryPhone.trim() || null,
          guardianPhone: parentPrimaryPhone.trim() || null,
          parentEmergencyPhone: parentEmergencyPhone.trim() || null,
          guardianEmergencyPhone: parentEmergencyPhone.trim() || null,
          parentEmail: parentEmail.trim() || null,
          guardianEmail: parentEmail.trim() || null,
          educationalInstitutionName: childrenTransport ? selectedInstitutionName || null : null,
          institutionName: childrenTransport ? selectedInstitutionName || null : null,
          institutionAddress: childrenTransport ? institutionAddress || null : null,
          pickupDate: childrenTransport ? scheduledDate || null : null,
          pickupTime: childrenTransport ? scheduledTime || null : null,
          educationalDestinationValidated: childrenTransport ? institutionSuggestionSelected : false,
          flightNumber: flightNumber.trim() || null,
          airline: airline.trim() || null,
          waitAndGreet,
          customerName: customerName.trim(),
          customerEmail: trimmedEmail,
          customerPhone: customerPhone.trim(),
          customerPhoneCode: phoneCode,
          languagePref,
          specialNotes: specialNotes.trim() || null,
          paymentMethod: paymentMap[paymentMethod],
          cashAgreed,
          estimatedPrice: estimatedPrice ?? null,
          fareBreakdown,
        })),
      });

      const bookingData = await safeJson(bookingRes);

      if (submittedOperationId && bookingRes.status === 202) {
        setOperationNoticeKey("phase42.processing");
        return;
      }

      if (!bookingRes.ok) {
        if (bookingRes.status === 428 && isRecord(bookingData) && bookingData.state === "PREFLIGHT_REQUIRED") {
          clearBookingSubmissionUncertain(); setSubmissionUncertain(false);
          throw new Error(t("phase42.preflightUnavailable"));
        }
        if (bookingRes.status === 409 && isRecord(bookingData) && bookingData.state === "PAYLOAD_CONFLICT") {
          setOperationNoticeKey("phase42.payloadConflict");
          throw new Error(t("phase42.payloadConflict"));
        }
        // This exact schema-validation response returns before creation.
        // Other responses may follow a committed write and stay uncertain.
        if (bookingRes.status === 400 && isRecord(bookingData) && bookingData.error === "Validation failed") {
          clearBookingSubmissionUncertain();
          clearBookingOperationId();
          setBookingOperationId("");
          submittedOperationId = "";
          setSubmissionUncertain(false);
        }
        throw new Error(localizedError(bookingData, "bookingAuth.errors.unknown", t));
      }

      if (!isRecord(bookingData)) {
        throw new Error(t('booking.responseInvalid'));
      }
      if (submittedOperationId && bookingData.state === "CREATED") {
        await checkBookingOperation(submittedOperationId);
        return;
      }

      const newBookingId =
        typeof bookingData.bookingId === "string" ? bookingData.bookingId : "";
      const newBookingRef =
        typeof bookingData.bookingRef === "string" ? bookingData.bookingRef : "";

      if (!newBookingId || !newBookingRef) {
        throw new Error(t('booking.responseInvalid'));
      }

      bookingCreated.current = true;
      lastSubmittedPayload.current = null;
      clearBookingSubmissionUncertain();
      // A guest keeps the non-secret operation ID until account transition or
      // expiry. The original capability cookie might not survive the response;
      // the pre-issued operation credential can still recover it.
      if (bookingData.passengerAuthenticated === true || !submittedOperationId) {
        clearBookingOperationId();
        setBookingOperationId("");
      }
      setSubmissionUncertain(false);
      setBookingId(newBookingId);
      setBookingRef(newBookingRef);
      resetOtpAttemptState();

      const price = Number(bookingData.estimatedPrice);
      if (Number.isFinite(price)) {
        setEstimatedPrice(price);
      }

      if (passengerProfile && bookingData.passengerAuthenticated === true) {
        setAuthMode("authenticated");
        setAuthError("");
        setError("");
        setStep(3);
        return;
      }

      const submittedPhone = phoneCode + customerPhone.trim();
      setAuthMode("checkingPhone");
      const phoneState = await resolvePassengerPhone(newBookingId, submittedPhone);
      const normalizedPhone =
        typeof phoneState.normalizedPhone === "string" ? phoneState.normalizedPhone : submittedPhone;
      setRegistrationProofPhone(normalizedPhone);

      if (phoneState.mode === "LOGIN") {
        clearRegistrationProof();
        setRegistrationProofPhone(normalizedPhone);
        clearPasswordResetState();
        setLoginPassword("");
        setAuthError(translatedBookingAuthError(t, "bookingAuth.errors.accountExists"));
        setAuthMode("existingAccountLogin");
        return;
      }

      if (phoneState.mode === "LEGACY_SETUP") {
        await sendBookingOtp(newBookingId, normalizedPhone, "PASSENGER_LEGACY_PASSWORD_SETUP");
        setAuthMode("legacyPasswordSetupOtp");
        setStep(2);
        return;
      }

      await sendBookingOtp(newBookingId, normalizedPhone, "PASSENGER_REGISTRATION");
      setAuthMode("registrationOtp");
      setStep(2);
    } catch (err: unknown) {
      if (submittedOperationId && !bookingCreated.current) void checkBookingOperation(submittedOperationId);
      const message = localizeThrownError(err, "bookingAuth.errors.unknown", t);
      if (isAuthenticationRequiredMessage(message)) {
        setAuthError(translatedBookingAuthError(t, "bookingAuth.errors.authContinue"));
        setError(translatedBookingAuthError(t, "bookingAuth.errors.authContinue"));
      } else {
        setError(message);
      }
    } finally {
      submissionInFlight.current = false;
      setLoading(false);
    }
  };

  const handleOTPVerify = async (otpCode: string) => {
    setError("");

    const purpose =
      authMode === "legacyPasswordSetupOtp" || authMode === "legacyPasswordSetup"
        ? "PASSENGER_LEGACY_PASSWORD_SETUP"
        : "PASSENGER_REGISTRATION";

    const res = await csrfFetch("passenger","/api/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ bookingId, otpCode, purpose }),
    });

    const data = await safeJson(res);

    if (!res.ok) {
      const code = readCode(data);
      if (code === "ACCOUNT_EXISTS_LOGIN_REQUIRED") {
        clearRegistrationProof();
        setAuthMode("existingAccountLogin");
        setStep(1);
        setAuthError(translatedBookingAuthError(t, "bookingAuth.errors.accountExists"));
        return;
      }
      if (code === "LEGACY_SETUP_REQUIRED") {
        clearRegistrationProof();
        setAuthMode("legacyPasswordSetupOtp");
        setStep(1);
        setAuthError(translatedBookingAuthError(t, "bookingAuth.errors.phoneVerificationRequired"));
        return;
      }
      throw new Error(otpVerifyMessage(data, "bookingAuth.errors.verificationFailed", t));
    }

    if (!isRecord(data)) {
      throw new Error(translatedBookingAuthError(t, 'bookingAuth.errors.verificationFailed'));
    }

    if (typeof data.bookingId === "string" && data.bookingId !== bookingId) {
      throw new Error(translatedBookingAuthError(t, 'bookingAuth.errors.verificationFailed'));
    }

    const normalizedPhone =
      typeof data.normalizedPhone === "string" ? data.normalizedPhone : phoneCode + customerPhone.trim();
    setRegistrationProofPhone(normalizedPhone);
    setProofExpiresAt(typeof data.proofExpiresAt === "string" ? data.proofExpiresAt : "");
    setAccountNeedsPhoneReverification(false);
    setAuthError("");
    if (typeof data.email === "string" && data.email && !customerEmail) {
      setCustomerEmail(data.email);
    }

    if (purpose === "PASSENGER_LEGACY_PASSWORD_SETUP") {
      const nextLegacyProofToken =
        typeof data.legacyPasswordSetupProofToken === "string" ? data.legacyPasswordSetupProofToken : "";
      if (data.success !== true || !nextLegacyProofToken) {
        throw new Error(translatedBookingAuthError(t, 'bookingAuth.errors.verificationFailed'));
      }
      setRegistrationProofToken("");
      setLegacyPasswordSetupProofToken(nextLegacyProofToken);
      setAuthMode("legacyPasswordSetup");
      setStep(4);
      return;
    }

    const nextRegistrationProofToken =
      typeof data.registrationProofToken === "string" ? data.registrationProofToken : "";

    if (data.success !== true || !nextRegistrationProofToken) {
      throw new Error(translatedBookingAuthError(t, 'bookingAuth.errors.verificationFailed'));
    }

    setLegacyPasswordSetupProofToken("");
    setRegistrationProofToken(nextRegistrationProofToken);
    setAuthMode("createAccount");
    setStep(4);
  };

  const continueAuthenticatedBooking = async (
    passenger?: Record<string, unknown> | null,
    activeBookingId = bookingId
  ) => {
    if (passenger) {
      markPassengerAuthenticated(passenger);
    } else {
      clearPassengerAuthErrors();
      setAuthMode("authenticated");
    }

    if (!activeBookingId) {
      throw new Error(t('booking.responseInvalid'));
    }

    const res = await csrfFetch("passenger","/api/passenger/booking/continue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      credentials: "include",
      body: JSON.stringify({ bookingId: activeBookingId }),
    });
    const data = await safeJson(res);
    if (!res.ok) {
      const message = readCode(data) === "AUTHENTICATION_REQUIRED"
        ? authRequiredMessage(data, t)
        : localizedError(data, "bookingAuth.errors.unknown", t);
      if (isAuthenticationRequiredMessage(message)) {
        setAuthError(message);
        setError(message);
      }
      throw new Error(message);
    }
    clearPassengerAuthErrors();
    setStep(3);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authLoading || accountCreateInFlight.current) return;
    setAuthError("");

    if (accountPassword !== accountConfirmPassword) {
      setAuthError(t("passenger.passwordMismatch", "Passwords do not match."));
      return;
    }

    const isLegacySetup = authMode === "legacyPasswordSetup";
    const activeProofToken = isLegacySetup ? legacyPasswordSetupProofToken : registrationProofToken;

    if (!activeProofToken) {
      requirePhoneReverification(translatedBookingAuthError(t, "bookingAuth.errors.phoneVerificationRequired"));
      return;
    }

    if (proofExpiresAt && new Date(proofExpiresAt).getTime() <= Date.now()) {
      requirePhoneReverification(translatedBookingAuthError(t, "bookingAuth.errors.verificationExpired"));
      return;
    }

    accountCreateInFlight.current = true;
    setAuthLoading(true);
    try {
      const res = await csrfFetch("passenger","/api/passenger/account/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "include",
        body: JSON.stringify({
          bookingId,
          registrationProofToken: isLegacySetup ? "" : registrationProofToken,
          legacyPasswordSetupProofToken: isLegacySetup ? legacyPasswordSetupProofToken : "",
          authMode: isLegacySetup ? "LEGACY_SETUP" : "REGISTER",
          phone: registrationProofPhone || phoneCode + customerPhone.trim(),
          fullName: customerName.trim(),
          email: customerEmail.trim(),
          password: accountPassword,
          confirmPassword: accountConfirmPassword,
          rememberDevice,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        const code = readCode(data);
        if (code === "ACCOUNT_EXISTS_LOGIN_REQUIRED") {
          clearRegistrationProof();
          setAuthMode("existingAccountLogin");
          setStep(1);
          setAuthError(translatedBookingAuthError(t, "bookingAuth.errors.accountExists"));
          return;
        }
        if (code === "LEGACY_SETUP_REQUIRED") {
          clearRegistrationProof();
          setAuthMode("legacyPasswordSetupOtp");
          setStep(1);
          setAuthError(translatedBookingAuthError(t, "bookingAuth.errors.phoneVerificationRequired"));
          return;
        }
        if (code.startsWith("PROOF_")) {
          requirePhoneReverification(proofFailureMessage(code, "bookingAuth.errors.phoneVerificationRequired", t));
          return;
        }
        setAuthError(localizedError(data, "bookingAuth.errors.unknown", t));
        return;
      }
      handleAccountTransitionRecovery(res);
      clearPassengerAuthErrors();
      await continueAuthenticatedBooking(isRecord(data) && isRecord(data.passenger) ? data.passenger : null);
    } catch (err) {
      const message = localizeThrownError(err, "bookingAuth.errors.unknown", t);
      setAuthError(message);
    } finally {
      accountCreateInFlight.current = false;
      setAuthLoading(false);
    }
  };

  const handlePassengerLogin = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (loginInFlight.current) return;
    loginInFlight.current = true;
    setAuthError("");
    setEarlyAuthErrorCode("");
    setLateLoginErrorCode("");
    setAuthLoading(true);

    try {
      const activeBookingId = bookingId;
      const loginPhone = activeBookingId
        ? registrationProofPhone || phoneCode + customerPhone.trim()
        : earlyPhoneCode + earlyPhoneNumber.trim();
      const res = await csrfFetch("passenger","/api/passenger/login/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "include",
        body: JSON.stringify({
          phone: loginPhone,
          password: loginPassword,
          bookingId: activeBookingId || null,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        if (!activeBookingId) {
          setEarlyAuthErrorCode(res.status === 429 ? "RATE_LIMITED_GENERIC" : res.status === 401 ? "AUTH_INVALID_CREDENTIALS" : "SERVICE_UNAVAILABLE");
          return;
        }
        setLateLoginErrorCode(res.status === 429 ? "RATE_LIMITED_GENERIC" : res.status === 401 ? "AUTH_INVALID_CREDENTIALS" : "SERVICE_UNAVAILABLE");
        return;
      }

      handleAccountTransitionRecovery(res);

      if (isRecord(data) && data.stepUpRequired) {
        setLoginAttemptId(String(data.loginAttemptId || ""));
        if (typeof data.devOtp === "string") setDevOtp(data.devOtp);
        setAuthMode("loginStepUp");
        return;
      }

      clearPassengerAuthErrors();
      const passenger = isRecord(data) && isRecord(data.passenger) ? data.passenger : null;
      if (!activeBookingId) {
        if (!passenger) throw new Error(t("booking.responseInvalid"));
        markPassengerAuthenticated(passenger);
      } else {
        await continueAuthenticatedBooking(passenger, activeBookingId);
      }
    } catch (err) {
      if (bookingId) setAuthError(localizeThrownError(err, "bookingAuth.errors.invalidPassword", t));
      else setEarlyAuthErrorCode("SERVICE_UNAVAILABLE");
    } finally {
      loginInFlight.current = false;
      setAuthLoading(false);
    }
  };

  const handleLoginStepUp = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      const res = await csrfFetch("passenger","/api/passenger/login/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "include",
        body: JSON.stringify({
          phone: bookingId ? registrationProofPhone || phoneCode + customerPhone.trim() : earlyPhoneCode + earlyPhoneNumber.trim(),
          otpCode: loginOtp,
          loginAttemptId,
          bookingId: bookingId || null,
          rememberDevice,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(localizedError(data, "bookingAuth.errors.verificationFailed", t));
      handleAccountTransitionRecovery(res);
      clearPassengerAuthErrors();
      const passenger = isRecord(data) && isRecord(data.passenger) ? data.passenger : null;
      if (bookingId) await continueAuthenticatedBooking(passenger);
      else if (passenger) markPassengerAuthenticated(passenger);
      else throw new Error(t("booking.responseInvalid"));
    } catch (err) {
      setAuthError(localizeThrownError(err, "bookingAuth.errors.verificationFailed", t));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotSend = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (recoveryInFlight.current) return;
    setRecoveryErrorCode("");
    if (!isValidEmail(recoveryEmail.trim())) {
      setRecoveryErrorCode("INVALID_EMAIL");
      return;
    }
    recoveryInFlight.current = true;
    setAuthLoading(true);

    try {
      const res = await csrfFetch("passenger","/api/passenger/password-reset/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ email: recoveryEmail.trim(), locale }),
      });
      if (!res.ok) {
        setRecoveryErrorCode(res.status === 429 ? "RATE_LIMITED_GENERIC" : "SERVICE_UNAVAILABLE");
        return;
      }
      // The response is deliberately generic, including for unknown accounts.
      setRecoveryRequested(true);
      if (!bookingId) prepareGuestDraftNavigation();
    } catch {
      setRecoveryErrorCode("SERVICE_UNAVAILABLE");
    } finally {
      recoveryInFlight.current = false;
      setAuthLoading(false);
    }
  };

  const recoveryFields = () => (
    <div className="space-y-3">
      <p className="text-sm text-drivo-text-secondary">{t("passenger.resetDescription")}</p>
      <label htmlFor="booking-recovery-email" className="block text-sm font-semibold text-drivo-text">
        {t("passenger.email")}
        <input id="booking-recovery-email" className="input mt-2 w-full" type="email" autoComplete="email" value={recoveryEmail} onChange={(event) => { setRecoveryEmail(event.target.value); setRecoveryRequested(false); }} onKeyDown={(event) => { if (event.key === "Enter") void handleForgotSend(event); }} aria-describedby={recoveryErrorCode ? "booking-recovery-error" : undefined} />
      </label>
      {recoveryErrorCode && <p id="booking-recovery-error" role="alert" className="text-sm text-red-700">{recoveryErrorCode === "INVALID_EMAIL" ? t("phase3.invalidEmail") : presentMessage(recoveryErrorCode, locale)}</p>}
      {recoveryRequested && <p role="status" aria-live="polite" className="text-sm text-drivo-text">{t("passenger.resetRequested")}</p>}
      <button type="button" onClick={handleForgotSend} disabled={authLoading || recoveryRequested} className="btn-primary w-full min-h-11">
        {authLoading ? t("passenger.loading") : t("passenger.sendResetEmail")}
      </button>
      <button type="button" onClick={() => { clearPasswordResetState(); setEarlyRecoveryOpen(false); if (bookingId) setAuthMode("existingAccountLogin"); }} className="min-h-11 text-sm font-semibold text-drivo-green hover:underline">
        {t("passenger.backToLogin")}
      </button>
    </div>
  );

  const allServiceOptions: {
    value: ServiceType;
    label: string;
    icon: string;
    desc: string;
    img: string;
  }[] = [
    {
      value: "accessible",
      label: t("services.accessible.title"),
      icon: "♿",
      desc: t("services.accessible.tagline"),
      img: "/drivo-wav-wheelchair.jpeg",
    },
    {
      value: "airport",
      label: t("services.airport.title"),
      icon: "✈️",
      desc: t("services.airport.tagline"),
      img: "/drivo-airport-transfer.jpeg",
    },
    {
      value: "standard",
      label: t("services.taxi.title"),
      icon: "🚕",
      desc: t("services.taxi.tagline"),
      img: "/drivo-taxi-service.jpeg",
    },
    {
      value: "children",
      label: t("services.children.title"),
      icon: "👧",
      desc: t("services.children.tagline"),
      img: "/drivo-children-dropoff.jpeg",
    },
  ];
  const serviceOptions = allServiceOptions.filter((service) => isCustomerServiceEnabled(service.value));

  if (step === 2) {
    return (
      <OTPVerification
        onVerify={handleOTPVerify}
        bookingId={bookingId}
        phone={registrationProofPhone || phoneCode + customerPhone}
        purpose={
          authMode === "legacyPasswordSetupOtp" || authMode === "legacyPasswordSetup"
            ? "PASSENGER_LEGACY_PASSWORD_SETUP"
            : "PASSENGER_REGISTRATION"
        }
        devOtp={devOtp}
        initialError={error}
        onResendStart={resetOtpAttemptState}
        onResendSuccess={(data) => {
          if (typeof data.devOtp === "string") setDevOtp(data.devOtp);
        }}
      />
    );
  }

  if (step === 3) {
    return (
      <BookingConfirmation
        passengers={passengers}
        paymentMethod={paymentMethod}
        bookingRef={bookingRef}
        bookingId={bookingId}
        estimatedPrice={estimatedPrice}
        passengerProfile={passengerProfile}
        bookingData={{
          serviceType,
          pickupAddress,
          dropoffAddress,
          scheduledDate,
          scheduledTime,
          passengerCount: passengers,
          luggageType: luggage,
          smallBags,
          largeBags,
          wheelchairNeeded: assistedTransport && (wheelchair || wheelchairUser),
          seniorPassenger: assistedTransport && seniorPassenger,
          ztpCardHolder: assistedTransport && ztpCardHolder,
          wheelchairUser: assistedTransport && wheelchairUser,
          companionRequired: assistedTransport && companionRequired,
          medicalAppointment: assistedTransport && medicalAppointment,
          waitingTimeRequired: assistedTransport && waitingTimeRequired,
          assistanceLevel: assistedTransport ? assistanceLevel : "",
          wheelchairType: assistedTransport ? wheelchairType : "",
          canTransferToSeat: assistedTransport ? canTransferToSeat : "",
          wavRequired,
          passengerRemainsInWheelchair,
          companionCount: activeCompanionCount,
          hospitalName: assistedTransport && medicalAppointment ? hospitalName : "",
          department: assistedTransport && medicalAppointment ? department : "",
          appointmentDate: assistedTransport && medicalAppointment ? appointmentDate : "",
          appointmentTime: assistedTransport && medicalAppointment ? appointmentTime : "",
          tripType: assistedTransport && medicalAppointment ? tripType : "",
          returnTimingPreference: assistedTransport && medicalAppointment && tripType !== "GO_ONLY" ? returnTimingPreference : null,
          returnDate: childrenTransport || (assistedTransport && (medicalAppointment || waitingTimeRequired)) ? returnDate : "",
          returnTime: childrenTransport || (assistedTransport && (medicalAppointment || waitingTimeRequired)) ? returnTime : "",
          waitingDuration: showWaitingDuration ? waitingDuration : "",
          customWaitingDuration: showWaitingDuration ? customWaitingDuration : "",
          scheduledRide: childrenTransport,
          recurrence,
          recurrenceType: recurrence,
          recurrenceCustom,
          childrenDetails: activeChildrenDetails,
          childFullName: primaryChild.fullName,
          childName: primaryChild.fullName,
          childAge: primaryChild.age,
          childSpecialRequirements: primaryChild.specialRequirements,
          parentFullName,
          guardianName: parentFullName,
          parentPrimaryPhone,
          guardianPhone: parentPrimaryPhone,
          parentEmergencyPhone,
          guardianEmergencyPhone: parentEmergencyPhone,
          parentEmail,
          guardianEmail: parentEmail,
          educationalInstitutionName: childrenTransport ? selectedInstitutionName : educationalInstitutionName,
          institutionName: childrenTransport ? selectedInstitutionName : educationalInstitutionName,
          institutionAddress,
          pickupDate: scheduledDate,
          pickupTime: scheduledTime,
          flightNumber,
          waitAndGreet,
          customerName,
          customerPhone: phoneCode + customerPhone,
          customerEmail,
          paymentMethod,
          specialNotes,
          estimatedPrice,
          fareBreakdown,
          bookingRef,
          status: "VERIFIED",
        }}
      />
    );
  }

  if (step === 4) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 md:py-16">
        <form onSubmit={handleCreateAccount} className="card">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-drivo-green-light text-2xl">
              ✓
            </div>
            <h2 className="text-[22px] font-bold text-drivo-text">
              {authMode === "legacyPasswordSetup"
                ? t("passenger.createPasswordTitle", "Create a password to continue")
                : t("passenger.createAccountTitle", "Create your Drivo account")}
            </h2>
            <p className="mt-2 text-[14px] text-drivo-text-secondary">
              {authMode === "legacyPasswordSetup"
                ? t("passenger.legacyPasswordSetupDesc", "Your phone number has been verified. Create a password for your existing Drivo account.")
                : t(
                    "passenger.createAccountDesc",
                    "Your phone number has been verified. Create a password so your future bookings are faster."
                  )}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <FieldLabel>{t("booking.phone")}</FieldLabel>
              <input className="input bg-drivo-bg-soft" value={phoneCode + customerPhone} readOnly />
            </div>

            <div>
              <FieldLabel>{t("booking.email")}</FieldLabel>
              <input
                className="input"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                required
              />
            </div>

            <PasswordInput
              label={t("passenger.password")}
              value={accountPassword}
              onChange={setAccountPassword}
              visible={showAccountPassword}
              onToggle={() => setShowAccountPassword((current) => !current)}
            />
            <PasswordInput
              label={t("passenger.confirmPassword", "Confirm password")}
              value={accountConfirmPassword}
              onChange={setAccountConfirmPassword}
              visible={showAccountPassword}
              onToggle={() => setShowAccountPassword((current) => !current)}
            />

            <p className="text-[12px] text-drivo-text-secondary">
              {t("passenger.passwordGuidance", "Use at least 12 characters. Spaces and passphrases are allowed.")}
            </p>

            <label className="flex items-center gap-2 text-[13px] font-semibold text-drivo-text-secondary">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
              />
              {t("passenger.rememberDevice", "Remember this device")}
            </label>

            {authError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] font-semibold text-red-700">
                {authError}
              </div>
            )}

            {accountNeedsPhoneReverification && (
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => {
                  setError("");
                  setStep(2);
                }}
              >
                {t("passenger.verifyPhoneAgain", "Verify phone again")}
              </button>
            )}

            <button type="submit" className="btn-primary w-full" disabled={authLoading || accountNeedsPhoneReverification}>
              {authLoading
                ? t("passenger.saving")
                : authMode === "legacyPasswordSetup"
                  ? t("passenger.savePasswordContinue", "Save Password & Continue Booking")
                  : t("passenger.createAccountContinue", "Create Account & Continue Booking")}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div
      className="space-y-6"
      onChangeCapture={() => {
        formTouchedSinceMount.current = true;
        if (pendingDraft) { clearGuestDraftTransition(); clearBookingDraft(); setPendingDraft(null); setGuestAdoption(false); setGuestAdoptionFromReset(false); setDraftReady(true); }
      }}
      onClickCapture={(event) => {
        if (event.target instanceof Element && event.target.closest("[data-draft-action]")) return;
        formTouchedSinceMount.current = true;
        if (pendingDraft) { clearGuestDraftTransition(); clearBookingDraft(); setPendingDraft(null); setGuestAdoption(false); setGuestAdoptionFromReset(false); setDraftReady(true); }
      }}
    >
      {showWavModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-drivo-navy/70 p-4"
          role="presentation"
          onMouseDown={() => setShowWavModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wav-dialog-title"
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="wav-dialog-title" className="text-lg font-extrabold text-drivo-navy">
              {t("booking.wavAvailabilityNoticeTitle")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-drivo-text-secondary">
              {t("booking.wavAvailabilityNoticeBody")}
            </p>
            <button
              type="button"
              autoFocus
              className="btn-primary mt-5 w-full"
              onClick={() => setShowWavModal(false)}
            >
              {t("common understood", "Understood")}
            </button>
          </div>
        </div>
      )}
      {pendingDraft && !submissionUncertain && (
        <section className="card border-2 border-drivo-green" aria-labelledby="booking-draft-title">
          <h2 id="booking-draft-title" ref={guestAdoptionHeading} tabIndex={guestAdoption ? -1 : undefined} className="text-lg font-bold text-drivo-text">{t(guestAdoption ? "phase43.reviewTitle" : "phase4.found")}</h2>
          {guestAdoption && <p className="mt-2 text-sm text-drivo-text-secondary">{t("phase43.guestExplanation")}</p>}
          {guestAdoptionFromReset && <p role="status" aria-live="polite" className="mt-2 text-sm font-semibold text-drivo-text">{t("phase43.resetCompleted")}</p>}
          {guestAdoption && <p className="mt-2 text-sm font-semibold text-drivo-text">{t("phase43.signedInContext")}</p>}
          <p className="mt-2 text-sm text-drivo-text-secondary">{t("phase4.privacy")}</p>
          <p className="mt-2 text-sm text-drivo-text-secondary">{t("phase4.reenter")}</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button data-draft-action type="button" onClick={() => void resumeDraft()} className="btn-primary min-h-11 flex-1">{t(guestAdoption ? "phase43.continueAccount" : "phase4.resume")}</button>
            <button data-draft-action type="button" onClick={discardDraft} className="btn-outline min-h-11 flex-1">{t(guestAdoption ? "phase43.discard" : "phase4.startOver")}</button>
          </div>
        </section>
      )}
      {draftNoticeKey && <p role="status" aria-live="polite" className="rounded-xl bg-drivo-bg-soft p-3 text-sm text-drivo-text">{t(draftNoticeKey)}</p>}
      {recoveredBooking && (
        <section role="status" aria-live="polite" className="rounded-xl border-2 border-drivo-green bg-drivo-green-light/40 p-4 text-sm">
          <h2 className="font-bold">{t("phase42.recovered")}</h2>
          <p className="mt-2">{t("phase42.alreadyCreated")}: {recoveredBooking.ref}</p>
          {recoveredBooking.guest ? (
            <div className="mt-3 space-y-3">
              <p>{t("phase42.guestContinue")}</p>
              <div className="flex flex-wrap gap-2">
                <label className="sr-only" htmlFor="recovered-phone-code">{t("phase42.phoneCode")}</label>
                <input id="recovered-phone-code" className="input w-24" value={phoneCode} onChange={event => setPhoneCode(event.target.value)} autoComplete="tel-country-code" />
                <label className="sr-only" htmlFor="recovered-phone">{t("booking.phone")}</label>
                <input id="recovered-phone" className="input min-w-40 flex-1" value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} autoComplete="tel-national" />
              </div>
              <button type="button" className="btn-primary min-h-11" disabled={authLoading || !customerPhone.trim()} onClick={continueRecoveredGuest}>{t("phase42.continue")}</button>
            </div>
          ) : <Link href="/passenger/dashboard" className="mt-3 inline-flex min-h-11 items-center font-semibold text-drivo-green underline">{t("phase42.viewBooking")}</Link>}
        </section>
      )}
      {submissionUncertain && !bookingId && (
        <section role="status" aria-live="polite" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>{t(operationNoticeKey || "phase4.submissionUncertain")}</p>
          {bookingOperationId && <button type="button" className="mt-3 min-h-11 rounded-lg border border-amber-800 px-4 font-semibold" disabled={operationChecking} onClick={() => void checkBookingOperation()}>{t("phase42.check")}</button>}
          {bookingOperationId && operationNoticeKey === "phase42.retryable" && lastSubmittedPayload.current && <button type="button" className="ml-2 mt-3 min-h-11 rounded-lg border border-amber-800 px-4 font-semibold" disabled={operationChecking} onClick={() => void retryBookingOperation()}>{t("phase42.retrySame")}</button>}
          {bookingOperationId && operationNoticeKey === "phase42.retryable" && <button type="button" className="ml-2 mt-3 min-h-11 rounded-lg border border-amber-800 px-4 font-semibold" disabled={operationChecking} onClick={() => {
            clearBookingOperationId(); clearBookingSubmissionUncertain(); lastSubmittedPayload.current = null;
            setBookingOperationId(""); setSubmissionUncertain(false); setOperationNoticeKey("");
          }}>{t("phase42.startCorrected")}</button>}
          {!bookingOperationId && <p className="mt-2">{t("phase42.contactSupport")}</p>}
        </section>
      )}
      {draftReady && hasDraftProgress && !pendingDraft && !bookingId && (
        <div className="flex flex-col gap-2 rounded-xl border border-drivo-border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-drivo-text-secondary">{t("phase4.privacy")}</span>
          <button data-draft-action type="button" onClick={discardDraft} className="min-h-11 rounded-lg px-3 font-semibold text-drivo-green hover:underline">
            {t("phase4.discard")}
          </button>
        </div>
      )}
      {error && (
        <div className="p-4 bg-drivo-red-light border-2 border-red-300 rounded-2xl animate-fade-in">
          <p className="text-[14px] text-red-700 font-medium">⚠️ {error}</p>
        </div>
      )}

      <div className="card">
        <div className="flex items-center gap-3 mb-5">
          <span className="w-9 h-9 bg-drivo-green-light rounded-xl flex items-center justify-center text-[14px] font-bold text-drivo-green-dark">
            1
          </span>
          <div>
            <h3 className="font-bold text-drivo-text text-[16px]">
              {t("booking.selectService")}
            </h3>
            <p className="text-[12px] text-drivo-text-muted">
              {t("booking.chooseRight")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {serviceOptions.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={serviceType === s.value}
              aria-label={s.label}
              onClick={() => {
                if (serviceType !== s.value) {
                  setError("");
                }
                if (serviceType === "children" && s.value !== "children") {
                  setEducationalInstitutionName("");
                  setInstitutionSuggestionSelected(false);
                }
                setServiceType(s.value);
                setWheelchair(s.value === "accessible");
                if (s.value === "accessible") {
                  setSeniorPassenger(true);
                }
                if (s.value === "children") {
                  setRideMode("schedule");
                  setPaymentMethod("card");
                  setCashAgreed(false);
                }
                if (s.value !== "airport") {
                  setFlightNumber("");
                  setAirline("");
                  setWaitAndGreet(false);
                }
              }}
              className={`group relative min-h-[180px] overflow-hidden rounded-2xl border-2 transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-drivo-green/30 ${
                serviceType === s.value
                  ? "border-drivo-green ring-4 ring-drivo-green/10"
                  : "border-drivo-border hover:border-drivo-green/30"
              }`}
            >
              <div className="relative h-32 overflow-hidden">
                <Image
                  src={s.img}
                  alt={s.label}
                  fill
                  sizes="(min-width: 768px) 20vw, 50vw"
                  className="object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-2 text-center">
                <span className="text-[12px] font-semibold text-white block">
                  {s.label}
                </span>
                <span className="text-[10px] text-white/60">{s.desc}</span>
              </div>

              {serviceType === s.value && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-drivo-green rounded-full flex items-center justify-center">
                  <span className="text-white text-[10px]">✓</span>
                </div>
              )}
            </button>
          ))}
        </div>

        {serviceType === "accessible" && (
          <div className="mt-4 p-4 bg-drivo-purple-light/50 rounded-2xl border border-drivo-purple/20 animate-fade-in">
            <p className="text-[13px] font-semibold text-drivo-purple">
              ♿ {t("services.accessible.title")}
            </p>
            <p className="text-[12px] text-drivo-text-secondary mt-1">
              {t("fleet.wavNote")}
            </p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-9 h-9 bg-drivo-green-light rounded-xl flex items-center justify-center text-[14px] font-bold text-drivo-green-dark">
              2
            </span>
            <div>
              <h3 className="font-bold text-drivo-text text-[16px]">
                {t("booking.tripDetails")}
              </h3>
              <p className="text-[12px] text-drivo-text-muted">
                {t("booking.whereWhen")}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <AddressAutocomplete
                id="pickup"
                airportTransfer={serviceType === "airport"}
                label={`📍 ${t("booking.pickup")} *`}
                value={pickupAddress}
                onChange={(v) => {
                  setPickupAddress(v);
                  setPickupCoords(null);
                  onPickupChange?.(v);
                }}
                placeholder={t("booking.pickupPlaceholder")}
                noResultsText={t("booking.noMatchingAddress", "No matching address found.")}
                onSelect={(_, suggestion) => {
                  const coords = coordsFromSuggestion(suggestion);
                  if (coords) setPickupCoords(coords);
                }}
              />

              <button
                type="button"
                onClick={useCurrentPickupLocation}
                className="absolute right-3 top-[38px] z-10 rounded-full bg-white px-2 py-1 text-[13px] font-semibold text-drivo-green shadow-sm hover:bg-drivo-green-light"
                aria-label={t('booking.useCurrentLocation')}
                title={t('booking.useCurrentLocation')}
              >
                {locatingPickup ? "..." : "📍"}
              </button>
            </div>

            <AddressAutocomplete
              id="dropoff"
              airportTransfer={serviceType === "airport"}
              label={
                childrenTransport
                  ? t("booking.schoolInstitution", "School / College / University *")
                  : `Destination: ${t("booking.dropoff")} *`
              }
              value={dropoffAddress}
              onChange={(v) => {
                setDropoffAddress(v);
                setDropoffCoords(null);
                if (childrenTransport) {
                  setEducationalInstitutionName(getInstitutionName(v));
                  setInstitutionSuggestionSelected(false);
                }
                onDropoffChange?.(v);
              }}
              onSelect={(v, suggestion) => {
                const coords = coordsFromSuggestion(suggestion);
                if (coords) setDropoffCoords(coords);
                if (childrenTransport) {
                  setEducationalInstitutionName(suggestion?.mainText || getInstitutionName(v));
                  setInstitutionSuggestionSelected(true);
                }
              }}
              placeholder={
                childrenTransport
                  ? t("booking.searchEducationalInstitution", "Search educational institution")
                  : t("booking.dropoffPlaceholder")
              }
              educationalOnly={childrenTransport}
              noResultsText={
                childrenTransport
                  ? t("booking.noVerifiedInstitution", "No verified educational institution found.")
                  : t("booking.noMatchingAddress", "No matching address found.")
              }
            />

            {childrenTransport && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800">
                  {t(
                    "booking.childrenInstitutionValidation",
                    "Please select a verified educational institution."
                  )}
                </div>
                {institutionAddress && (
                  <div className="rounded-2xl border border-drivo-border bg-white p-4 text-[13px]">
                    <div className="font-bold text-drivo-text">
                      {t("booking.institutionSummary", "Institution")}
                    </div>
                    <div className="mt-2 grid gap-1 text-drivo-text-secondary">
                      <span>
                        {t("booking.institutionName", "Institution name")}: {" "}
                        <strong className="text-drivo-text">{selectedInstitutionName || "N/A"}</strong>
                      </span>
                      <span>
                        {t("booking.institutionAddress", "Full address")}: {" "}
                        <strong className="text-drivo-text">{institutionAddress}</strong>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!childrenTransport && pickupAddress && dropoffAddress && (
              <PriceEstimate
                pickupAddress={pickupAddress}
                dropoffAddress={dropoffAddress}
                serviceType={serviceType}
                passengerCount={passengers}
                returnDate={childrenTransport ? returnDate : ""}
                returnTime={childrenTransport ? returnTime : ""}
                recurrenceType={childrenTransport ? recurrence : "ONE_TIME"}
                recurrenceCustom={childrenTransport ? recurrenceCustom : ""}
                scheduledDate={estimateScheduledDate}
                scheduledTime={estimateScheduledTime}
                waitAndGreet={waitAndGreet}
                waitingMinutes={estimateWaitingMinutes}
                assistanceLevel={assistanceLevel}
                onPriceChange={setEstimatedPrice}
                onFareChange={handleFareChange}
              />
            )}

{!childrenTransport && (
<div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3">
  <button
    type="button"
    onClick={() => setRideMode("now")}
    className={`flex min-h-[74px] items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-center text-sm font-semibold leading-tight transition sm:min-h-0 sm:p-4 ${
      rideMode === "now"
        ? "bg-drivo-green text-white border-drivo-green"
        : "bg-white border-gray-200 text-gray-700"
    }`}
  >
    ⚡ {t("booking.rideNow")}
  </button>

  <button
    type="button"
    onClick={() => setRideMode("schedule")}
    className={`flex min-h-[74px] items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-center text-sm font-semibold leading-tight transition sm:min-h-0 sm:p-4 ${
      rideMode === "schedule"
        ? "bg-drivo-green text-white border-drivo-green"
        : "bg-white border-gray-200 text-gray-700"
    }`}
  >
    📅 {t("booking.scheduleRide")}
  </button>
</div>
)}

            {!childrenTransport && rideMode === "schedule" && (
              <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-semibold text-drivo-text-secondary mb-1.5 block">
                  📅 {t("booking.date")} *
                </label>
                <input
                  type="date"
                  min={today}
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="input text-[14px]"
                  required
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold text-drivo-text-secondary mb-1.5 block">
                  🕐 {t("booking.time")} *
                </label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="input text-[14px]"
                  required
                />
              </div>
            </div>
        )}
        </div>
        </div>
            
        <div className="card">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-9 h-9 bg-drivo-green-light rounded-xl flex items-center justify-center text-[14px] font-bold text-drivo-green-dark">
              3
            </span>
            <div>
              <h3 className="font-bold text-drivo-text text-[16px]">
                {childrenTransport
                  ? t("booking.numberOfChildren", "Number of Children")
                  : `${t("booking.passengers")} & ${t("booking.luggage")}`}
              </h3>
              <p className="text-[12px] text-drivo-text-muted">
                {t("booking.vehicleMatching", "Vehicle matching")}
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <PassengerCounter
              value={passengers}
              onChange={setPassengers}
              max={childrenTransport ? 6 : undefined}
              label={childrenTransport ? t("booking.numberOfChildren", "Number of Children") : undefined}
            />

            {!childrenTransport && (
            <div className="grid sm:grid-cols-2 gap-4">
              <CounterControl
                label={`🧳 ${t("booking.smallBags", "Small bags")}`}
                value={smallBags}
                onChange={setSmallBags}
              />
              <CounterControl
                label={`🧳 ${t("booking.largeBags", "Large bags")}`}
                value={largeBags}
                onChange={setLargeBags}
              />
            </div>
            )}

            {!childrenTransport && (
            <div className="rounded-2xl bg-drivo-bg-soft p-4 text-[13px] text-drivo-text-secondary">
              {t("booking.capacitySummary", "Capacity")}:
              <span className="font-bold text-drivo-text">
                {" "}
                {capacityPassengerCount}/6 {t("booking.passengers").toLowerCase()}
              </span>
              {luggageCount > 0 && (
                <span>
                  {" "}
                  · {smallBags} {t("booking.smallBags", "small bags")}, {largeBags}{" "}
                  {t("booking.largeBags", "large bags")}
                </span>
              )}
            </div>
            )}

            {!childrenTransport && largerVehicleRecommended && (
              <div className="p-4 bg-drivo-amber-light border border-amber-300 rounded-2xl animate-fade-in">
                <p className="text-[13px] font-semibold text-amber-800">
                  {t("booking.largerVehicleRecommended", "Larger vehicle recommended")}
                </p>
                <p className="text-[12px] text-amber-700 mt-1">
                  {t("booking.capacityNotice", "We will match the ride with a suitable 7-seater or WAV vehicle when needed.")}
                </p>
              </div>
            )}

            <div className="hidden">
              <label className="text-[12px] font-semibold text-drivo-text-secondary mb-2 block">
                🧳 {t("booking.luggage")}
              </label>

              <div className="grid grid-cols-3 gap-3">
                {[
                  ["none", t("booking.luggageNone"), "🚶"],
                  ["small", t("booking.luggageSmall"), "🧳"],
                  ["large", t("booking.luggageLarge"), "🧳🧳"],
                ].map(([v, l, icon]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setLuggage(v as LuggageType)}
                    className={`p-4 rounded-2xl border-2 text-center transition-all ${
                      luggage === v
                        ? "border-drivo-green bg-drivo-green-light"
                        : "border-drivo-border hover:border-drivo-green/30"
                    }`}
                  >
                    <span className="text-xl block mb-1">{icon}</span>
                    <span className="text-[12px] font-medium text-drivo-text block">
                      {l}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {!childrenTransport && (
            <LuggageWarning
              passengers={capacityPassengerCount}
              luggage={luggage}
              onSwitchService={() => {
                setServiceType("airport");
                setPassengers(Math.min(5, passengers));
              }}
            />
            )}

            <div className="hidden p-4 bg-drivo-purple-light/50 rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">♿</span>
                  <div>
                    <span className="text-[14px] font-medium text-drivo-text block">
                      {t("booking.wheelchair")}?
                    </span>
                    <span className="text-[11px] text-drivo-text-muted">
                      {t("services.accessible.tagline")}
                    </span>
                  </div>
                </div>

                <label className="relative inline-flex cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wheelchair}
                    disabled={serviceType !== "accessible"}
onChange={(e) => {
  if (serviceType === "accessible") {
    setWheelchair(e.target.checked);
  }
}}
                    className="sr-only peer"
                  />
                  <div className="w-12 h-7 bg-drivo-border rounded-full peer peer-checked:bg-drivo-green peer-disabled:opacity-40 peer-disabled:cursor-not-allowed peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-[22px] after:w-[22px] after:shadow-sm after:transition-all" />
                </label>
              </div>

              {wheelchair && (
                <div className="mt-3 p-3 bg-white rounded-xl border border-blue-200 animate-fade-in">
                  <p className="text-[12px] text-blue-700">
                    🚐 <strong>{t("fleet.wavBadge")}.</strong> {t("fleet.wavNote")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {assistedTransport && (
        <div className="card">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-9 h-9 bg-drivo-green-light rounded-xl flex items-center justify-center text-[14px] font-bold text-drivo-green-dark">
              4
            </span>
            <div>
              <h3 className="font-bold text-drivo-text text-[16px]">
                {t("booking.assistanceRequirements", "Assistance Requirements")}
              </h3>
              <p className="text-[12px] text-drivo-text-muted">
                {t("booking.assistanceRequirementsDesc", "Tell us what the driver should prepare for.")}
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {[
              ["seniorPassenger", seniorPassenger, setSeniorPassenger, "booking.seniorPassenger"],
              ["ztpCardHolder", ztpCardHolder, setZtpCardHolder, "booking.ztpCardHolder"],
              ["wheelchairUser", wheelchairUser, (value: boolean) => {
                setWheelchairUser(value);
                setWheelchair(value);
                if (value) setServiceType("accessible");
              }, "booking.wheelchairUser"],
              ["companionRequired", companionRequired, setCompanionRequired, "booking.companionRequired"],
              ["medicalAppointment", medicalAppointment, setMedicalAppointment, "booking.medicalAppointment"],
              ["waitingTimeRequired", waitingTimeRequired, setWaitingTimeRequired, "booking.waitingTimeRequired"],
            ].map(([key, checked, onChange, labelKey]) => (
              <label
                key={key as string}
                className={`flex items-center gap-3 rounded-2xl border p-4 text-[13px] font-semibold transition ${
                  checked
                    ? "border-drivo-green bg-drivo-green-light text-drivo-green-dark"
                    : "border-drivo-border bg-white text-drivo-text hover:border-drivo-green/30"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked as boolean}
                  onChange={(e) => (onChange as (value: boolean) => void)(e.target.checked)}
                  className="h-4 w-4 rounded border-drivo-border text-drivo-green focus:ring-drivo-green"
                />
                {t(labelKey as string)}
              </label>
            ))}
          </div>

          {seniorPassenger && (
            <div className="mt-5 animate-fade-in">
              <FieldLabel>{t("booking.assistanceLevel", "Assistance Level")} *</FieldLabel>
              <select
                value={assistanceLevel}
                onChange={(e) => setAssistanceLevel(e.target.value as AssistanceLevel)}
                className="input"
              >
                <option value="">{t("booking.selectOption", "Select option")}</option>
                <option value="LIGHT">{t("booking.assistanceLight", "Light Assistance")}</option>
                <option value="DOOR_TO_DOOR">{t("booking.assistanceDoorToDoor", "Door-to-door Assistance")}</option>
                <option value="BOARDING_HELP">{t("booking.assistanceBoarding", "Needs Help Boarding/Exiting")}</option>
              </select>
            </div>
          )}

          {ztpCardHolder && (
            <div className="mt-5 rounded-2xl border border-drivo-purple/20 bg-drivo-purple-light/40 p-4 text-[13px] font-semibold text-drivo-purple">
              {t("booking.ztpStoredYes", "ZTP Card Holder: Yes")}
            </div>
          )}

          {wheelchairUser && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 animate-fade-in">
              <div>
                <FieldLabel>{t("booking.wheelchairType", "Wheelchair Type")} *</FieldLabel>
                <select
                  value={wheelchairType}
                  onChange={(e) => setWheelchairType(e.target.value as WheelchairType)}
                  className="input"
                >
                  <option value="">{t("booking.selectOption", "Select option")}</option>
                  <option value="MANUAL">{t("booking.wheelchairManual", "Manual")}</option>
                  <option value="ELECTRIC">{t("booking.wheelchairElectric", "Electric")}</option>
                  <option value="FOLDABLE">{t("booking.wheelchairFoldable", "Foldable")}</option>
                </select>
              </div>
              <div>
                <FieldLabel>{t("booking.canTransferToSeat", "Can passenger transfer to vehicle seat?")} *</FieldLabel>
                <select
                  value={canTransferToSeat}
                  onChange={(e) => setCanTransferToSeat(e.target.value as TransferToSeat)}
                  className="input"
                >
                  <option value="">{t("booking.selectOption", "Select option")}</option>
                  <option value="YES">{t("common.yes")}</option>
                  <option value="NO">{t("common.no")}</option>
                </select>
              </div>
              {wavRequired && (
                <div className="sm:col-span-2 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-[13px] text-blue-800">
                  <strong>{t("booking.wavAvailabilityNoticeTitle")}</strong>
                  <p className="mt-1">{t("booking.wavAvailabilityNoticeBody")}</p>
                </div>
              )}
            </div>
          )}

          {companionRequired && (
            <div className="mt-5 animate-fade-in">
              <FieldLabel>{t("booking.numberOfCompanions", "Number of Companions")}</FieldLabel>
              <select
                value={companionCount}
                onChange={(e) => setCompanionCount(Number(e.target.value))}
                className="input"
              >
                {[1, 2, 3].map((count) => (
                  <option key={count} value={count}>{count}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        )}

        {showMedicalReturnDetails && (
        <div className="card">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-9 h-9 bg-drivo-green-light rounded-xl flex items-center justify-center text-[14px] font-bold text-drivo-green-dark">
              5
            </span>
            <div>
              <h3 className="font-bold text-drivo-text text-[16px]">
                {t("booking.medicalReturnDetails", "Medical / Return Trip Details")}
              </h3>
              <p className="text-[12px] text-drivo-text-muted">
                {t("booking.medicalReturnDetailsDesc", "Appointment, waiting and return planning")}
              </p>
            </div>
          </div>

          {medicalAppointment && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-drivo-text">
                  {t("booking.hospitalName", "Hospital / Clinic Name")} *
                  <input className="input mt-2" autoComplete="organization" value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} placeholder="e.g. UNB Kramáre" required />
                </label>
                <label className="block text-sm font-semibold text-drivo-text">
                  {t("booking.department", "Department / Room / Entrance")} *
                  <input className="input mt-2" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Orthopedics, Main Entrance" required />
                </label>
              </div>
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-drivo-text">{t("booking.tripType", "Trip Type")}</legend>
                <div className="flex flex-wrap gap-4">
                  <label className="flex min-h-11 items-center gap-2 text-sm text-drivo-text">
                    <input type="radio" name="medical-trip-type" checked={tripType === "GO_ONLY"} onChange={() => setTripType("GO_ONLY")} />
                    {t("booking.goOnly", "One Way")}
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-sm text-drivo-text">
                    <input type="radio" name="medical-trip-type" checked={tripType !== "GO_ONLY"} onChange={() => setTripType("GO_RETURN")} />
                    {t("booking.goReturn", "Round Trip (Go + Return)")}
                  </label>
                </div>
              </fieldset>
              <fieldset className="space-y-3 rounded-2xl border border-drivo-border-light p-4">
                <legend className="px-2 text-sm font-bold text-drivo-text">{t("booking.medicalOutboundTrip", "OUTBOUND TRIP")}</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-drivo-text">
                    {t("booking.pickupDate", "Pickup Date")} *
                    <input className="input mt-2" type="date" min={today} value={scheduledDate} onChange={(e) => { setScheduledDate(e.target.value); setRideMode("schedule"); }} required />
                  </label>
                  <label className="block text-sm font-semibold text-drivo-text">
                    {t("booking.pickupTime", "Pickup Time from Home")} *
                    <input className="input mt-2" type="time" value={scheduledTime} onChange={(e) => { setScheduledTime(e.target.value); setRideMode("schedule"); }} required />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-drivo-text">
                    {t("booking.appointmentDate", "Appointment Date")} *
                    <input className="input mt-2" type="date" min={scheduledDate || today} value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} required />
                  </label>
                  <label className="block text-sm font-semibold text-drivo-text">
                    {t("booking.appointmentTime", "Appointment Time")} *
                    <input className="input mt-2" type="time" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} required />
                  </label>
                </div>
              </fieldset>
              {tripType !== "GO_ONLY" && (
                <fieldset className="space-y-4 rounded-2xl border border-drivo-border-light p-4">
                  <legend className="px-2 text-sm font-bold text-drivo-text">{t("booking.medicalReturnTrip", "RETURN TRIP")}</legend>
                  <div className="text-sm font-semibold text-drivo-text">{t("booking.medicalReturnTiming", "Return Timing Preference")}</div>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input type="radio" name="medical-return-timing" checked={returnTimingPreference === "FIXED"} onChange={() => setReturnTimingPreference("FIXED")} />
                      {t("booking.medicalFixedReturn", "Fixed Return Time")}
                    </label>
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input type="radio" name="medical-return-timing" checked={returnTimingPreference === "FLEXIBLE"} onChange={() => { setReturnTimingPreference("FLEXIBLE"); setReturnTime(""); }} />
                      {t("booking.medicalFlexibleReturn", "Flexible / Call Driver When Ready")}
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-semibold text-drivo-text">
                      {t("booking.returnDate", "Return Date")} *
                      <input className="input mt-2" type="date" min={appointmentDate || scheduledDate || today} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} required />
                    </label>
                    {returnTimingPreference === "FIXED" && (
                      <label className="block text-sm font-semibold text-drivo-text">
                        {t("booking.medicalReturnPickupTime", "Estimated Return Pickup Time")} *
                        <input className="input mt-2" type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} required />
                      </label>
                    )}
                  </div>
                  <p className="text-xs text-drivo-text-secondary" role="note">
                    {t("booking.medicalReturnQuoteNotice", "Return ride timing and total return fare are subject to confirmation. The displayed estimate may cover the outbound leg only.")}
                  </p>
                </fieldset>
              )}
              <fieldset className="space-y-3 rounded-2xl border border-drivo-border-light p-4">
                <legend className="px-2 text-sm font-bold text-drivo-text">{t("booking.medicalAccessibilityNotes", "ACCESSIBILITY & DRIVER NOTES")}</legend>
                <p className="text-sm text-drivo-text-secondary">
                  {t("booking.medicalWavNotice", "Wheelchair Accessible Vehicle (WAV) – Coming Soon. Please select transfer-to-seat assistance if suitable.")}
                </p>
                <label className="block text-sm font-semibold text-drivo-text">
                  {t("booking.medicalInstructions", "Special Instructions for Driver")}
                  <textarea className="input mt-2 min-h-24" maxLength={500} value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} placeholder="e.g. Please assist to the hospital entrance; call on arrival." />
                </label>
              </fieldset>
            </div>
          )}

          {showWaitingDuration && (
            <div className="mt-5 animate-fade-in">
              <FieldLabel>{t("booking.waitingDuration", "Waiting Duration")} *</FieldLabel>
              <select value={waitingDuration} onChange={(e) => setWaitingDuration(e.target.value as WaitingDuration)} className="input">
                <option value="">{t("booking.selectOption", "Select option")}</option>
                <option value="30_MINUTES">{t("booking.wait30", "30 Minutes")}</option>
                <option value="1_HOUR">{t("booking.wait1h", "1 Hour")}</option>
                <option value="2_HOURS">{t("booking.wait2h", "2 Hours")}</option>
                <option value="3_HOURS">{t("booking.wait3h", "3 Hours")}</option>
                <option value="4_HOURS">{t("booking.wait4h", "4 Hours")}</option>
                <option value="CUSTOM">{t("booking.waitCustom", "Custom")}</option>
              </select>
              {waitingDuration === "CUSTOM" && (
                <input
                  className="input mt-3"
                  value={customWaitingDuration}
                  onChange={(e) => setCustomWaitingDuration(e.target.value)}
                  placeholder={t("booking.customWaitingDuration", "Custom waiting duration")}
                />
              )}
            </div>
          )}
        </div>
        )}

        {childrenTransport && (
          <div className="card animate-fade-in">
            <div className="flex items-center gap-3 mb-5">
              <span className="w-9 h-9 bg-pink-100 rounded-xl flex items-center justify-center text-[14px]">
                👧
              </span>
              <div>
                <h3 className="font-bold text-drivo-text text-[16px]">
                  {t("booking.childrenTransportDetails", "Children Transport Details")}
                </h3>
                <p className="text-[12px] text-drivo-text-muted">
                  {t("booking.childrenTransportDesc", "Scheduled educational rides only. Cash is not available.")}
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-3 rounded-2xl border border-drivo-border-light bg-drivo-bg-soft/60 p-4">
                <h4 className="text-[13px] font-bold text-drivo-text">
                  {t("booking.schoolDropoff", "School Drop-off")}
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel>{t("booking.pickupDate", "Pickup Date")} *</FieldLabel>
                    <input
                      className="input"
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      min={today}
                      placeholder={t("booking.selectPickupDate", "Select pickup date")}
                      title={t("booking.selectPickupDate", "Select pickup date")}
                    />
                  </div>
                  <div>
                    <FieldLabel>{t("booking.pickupTime", "Pickup Time")} *</FieldLabel>
                    <input
                      className="input"
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      placeholder={t("booking.selectPickupTime", "Select pickup time")}
                      title={t("booking.selectPickupTime", "Select pickup time")}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-drivo-border-light bg-drivo-bg-soft/60 p-4">
                <h4 className="text-[13px] font-bold text-drivo-text">
                  {t("booking.schoolReturn", "School Pick-up / Return")}
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel>{t("booking.returnDate", "Return Date")} *</FieldLabel>
                    <input
                      className="input"
                      type="date"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      min={scheduledDate || today}
                      placeholder={t("booking.selectReturnDate", "Select return date")}
                      title={t("booking.selectReturnDate", "Select return date")}
                    />
                  </div>
                  <div>
                    <FieldLabel>{t("booking.returnTime", "Return Time")} *</FieldLabel>
                    <input
                      className="input"
                      type="time"
                      value={returnTime}
                      onChange={(e) => setReturnTime(e.target.value)}
                      placeholder={t("booking.selectReturnTime", "Select return time")}
                      title={t("booking.selectReturnTime", "Select return time")}
                    />
                  </div>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>{t("booking.recurrenceType", "Recurrence")}</FieldLabel>
                  <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as RecurrenceType)} className="input">
                    <option value="ONE_TIME">{t("booking.recurrenceOneTime", "One Time")}</option>
                    <option value="DAILY">{t("booking.recurrenceDaily", "Daily")}</option>
                    <option value="WEEKLY">{t("booking.recurrenceWeekly", "Weekly")}</option>
                    <option value="MONTHLY">{t("booking.recurrenceMonthly", "Monthly")}</option>
                    <option value="CUSTOM">{t("booking.waitCustom", "Custom")}</option>
                  </select>
                </div>
                {recurrence === "CUSTOM" && (
                  <div>
                    <FieldLabel>{t("booking.recurrenceCustom", "Custom recurrence")}</FieldLabel>
                    <input className="input" value={recurrenceCustom} onChange={(e) => setRecurrenceCustom(e.target.value)} placeholder={t("booking.recurrenceCustom", "Custom recurrence")} />
                  </div>
                )}
              </div>
              {pickupAddress && dropoffAddress && scheduledDate && scheduledTime && recurrence && (
                <PriceEstimate
                  pickupAddress={pickupAddress}
                  dropoffAddress={dropoffAddress}
                  serviceType={serviceType}
                  passengerCount={passengers}
                  returnDate={returnDate}
                  returnTime={returnTime}
                  recurrenceType={recurrence}
                  recurrenceCustom={recurrenceCustom}
                  scheduledDate={estimateScheduledDate}
                  scheduledTime={estimateScheduledTime}
                  waitAndGreet={waitAndGreet}
                waitingMinutes={estimateWaitingMinutes}
                assistanceLevel={assistanceLevel}
                  onPriceChange={setEstimatedPrice}
                  onFareChange={handleFareChange}
                />
              )}
              <div className="space-y-3">
                <h4 className="text-[13px] font-bold text-drivo-text">
                  {t("booking.childDetails", "Children Details")}
                </h4>
                {activeChildrenDetails.map((child, index) => (
                  <div
                    key={index}
                    className="space-y-3 rounded-2xl border border-drivo-border-light bg-white p-4"
                  >
                    <div className="text-[12px] font-black uppercase tracking-wide text-drivo-text-secondary">
                      {t('booking.childLabel').replace('{index}', String(index + 1))}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <input
                        className="input"
                        value={child.fullName}
                        onChange={(e) => updateChildDetail(index, { fullName: e.target.value })}
                        placeholder={`${t("booking.childFullName", "Child Full Name")} *`}
                      />
                      <input
                        className="input"
                        type="number"
                        min="0"
                        max="18"
                        value={child.age}
                        onChange={(e) => updateChildDetail(index, { age: e.target.value })}
                        placeholder={`${t("booking.childAge", "Child Age")} *`}
                      />
                    </div>
                    <textarea
                      className="input resize-none"
                      rows={2}
                      value={child.specialRequirements}
                      onChange={(e) => updateChildDetail(index, { specialRequirements: e.target.value })}
                      placeholder={t("booking.childSpecialRequirements", "Special Requirements")}
                    />
                  </div>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <input className="input" value={parentFullName} onChange={(e) => setParentFullName(e.target.value)} placeholder={`${t("booking.parentFullName", "Parent Full Name")} *`} />
                <input className="input" value={parentPrimaryPhone} onChange={(e) => setParentPrimaryPhone(e.target.value)} placeholder={`${t("booking.parentPrimaryPhone", "Primary Phone")} *`} />
                <input className="input" value={parentEmergencyPhone} onChange={(e) => setParentEmergencyPhone(e.target.value)} placeholder={`${t("booking.parentEmergencyPhone", "Emergency Phone")} *`} />
                <input className="input" type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder={`${t("booking.parentEmail", "Email")} *`} />
              </div>
            </div>
          </div>
        )}

        {serviceType === "airport" && (
          <div className="card animate-fade-in">
            <div className="flex items-center gap-3 mb-5">
              <span className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center text-[14px]">
                ✈️
              </span>
              <div>
                <h3 className="font-bold text-drivo-text text-[16px]">
                  {t("booking.airportDetails")}
                </h3>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={flightNumber}
                  onChange={(e) => setFlightNumber(e.target.value)}
                  placeholder={t("booking.flightNumber")}
                  className="input"
                />

                <select
                  value={airline}
                  onChange={(e) => setAirline(e.target.value)}
                  className="input"
                >
                  <option value="">{t("booking.airline")}</option>
                  <option>Ryanair</option>
                  <option>Wizz Air</option>
                  <option>Austrian</option>
                  <option value="Other">{t('booking.otherAirline')}</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-4 bg-sky-50 rounded-2xl border border-sky-100">
                <div>
                  <span className="text-[14px] font-medium text-drivo-text">
                    🤝 {t("booking.waitAndGreet")}
                  </span>
                  <p className="text-[11px] text-drivo-text-muted">
                    {t("booking.waitAndGreetDesc")}
                  </p>
                </div>

                <label className="relative inline-flex cursor-pointer">
                  <input
                    type="checkbox"
                    checked={waitAndGreet}
                    onChange={(e) => setWaitAndGreet(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-12 h-7 bg-drivo-border rounded-full peer peer-checked:bg-drivo-green peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-[22px] after:w-[22px] after:shadow-sm after:transition-all" />
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-9 h-9 bg-drivo-green-light rounded-xl flex items-center justify-center text-[14px] font-bold text-drivo-green-dark">
              {contactStepNumber}
            </span>
            <h3 className="font-bold text-drivo-text text-[16px]">
              {t("booking.contactDetails")} & {t("booking.payment")}
            </h3>
          </div>

          {!passengerProfile && !bookingId && (
            <div className="mb-5 rounded-2xl border border-drivo-border-light bg-drivo-bg-soft/60 p-4">
              <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("phase3.accountChoice")}>
                <button type="button" className="min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-drivo-green" aria-pressed={!earlyLoginOpen} onClick={() => { setEarlyLoginOpen(false); setEarlyRecoveryOpen(false); setEarlyAuthErrorCode(""); }}>
                  {t("phase3.newCustomer")}
                </button>
                <button type="button" className="min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-drivo-green" aria-pressed={earlyLoginOpen} onClick={() => { setEarlyLoginOpen(true); setEarlyRecoveryOpen(false); setEarlyAuthErrorCode(""); }}>
                  {t("phase3.existingCustomer")}
                </button>
              </div>
              {earlyLoginOpen && <div className="mt-4 space-y-3" aria-label={t("passenger.loginToContinueTitle")}>
                {earlyRecoveryOpen ? recoveryFields() : authMode === "loginStepUp" ? <>
                  <label className="block text-sm font-semibold text-drivo-text">{t("passenger.otpCode")}
                    <input className="input mt-2 w-full" inputMode="numeric" maxLength={6} value={loginOtp} onChange={(event) => setLoginOtp(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void handleLoginStepUp(event); }} />
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-sm text-drivo-text"><input type="checkbox" checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} />{t("passenger.rememberDevice")}</label>
                  {authError && <p role="alert" className="text-sm text-red-700">{authError}</p>}
                  <button type="button" onClick={handleLoginStepUp} disabled={authLoading || loginOtp.length !== 6} className="btn-primary min-h-11 w-full">{authLoading ? t("otp.verifying") : t("passenger.verifyOtp")}</button>
                </> : <>
                  <div className="flex gap-2">
                    <label className="block w-28 shrink-0 text-sm font-semibold text-drivo-text">{t("phase3.dialingCode")}
                      <select className="input mt-2 w-full" value={earlyPhoneCode} onChange={(event) => setEarlyPhoneCode(event.target.value)}>
                        {["+421", "+420", "+43", "+49", "+44", "+92"].map((code) => <option key={code} value={code}>{code}</option>)}
                      </select>
                    </label>
                    <label className="block min-w-0 flex-1 text-sm font-semibold text-drivo-text">{t("booking.phone")}
                      <input className="input mt-2 w-full" type="tel" autoComplete="tel-national" inputMode="tel" value={earlyPhoneNumber} onChange={(event) => setEarlyPhoneNumber(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void handlePassengerLogin(event); }} aria-describedby={earlyAuthErrorCode ? "booking-early-login-error" : undefined} />
                    </label>
                  </div>
                  <PasswordInput label={t("passenger.password")} value={loginPassword} onChange={setLoginPassword} visible={showLoginPassword} onToggle={() => setShowLoginPassword((current) => !current)} autoComplete="current-password" errorId={earlyAuthErrorCode ? "booking-early-login-error" : undefined} onEnter={handlePassengerLogin} />
                  {earlyAuthErrorCode && <p id="booking-early-login-error" role="alert" className="text-sm text-red-700">{presentMessage(earlyAuthErrorCode, locale)}</p>}
                  <button type="button" onClick={handlePassengerLogin} disabled={authLoading || !earlyPhoneNumber.trim() || !loginPassword} className="btn-primary min-h-11 w-full">
                    {authLoading ? t("passenger.loading") : t("passenger.loginContinue")}
                  </button>
                  <button type="button" onClick={() => { setRecoveryEmail(customerEmail); clearPasswordResetState(); setEarlyRecoveryOpen(true); }} className="min-h-11 text-sm font-semibold text-drivo-green hover:underline">
                    {t("passenger.forgotPassword")}
                  </button>
                  <Link href="/passenger/login" onClick={prepareGuestDraftNavigation} className="inline-flex min-h-11 items-center text-sm font-semibold text-drivo-green underline">
                    {t("phase43.separateLogin")}
                  </Link>
                </>}
              </div>}
            </div>
          )}

          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block text-sm font-semibold text-drivo-text">{t("booking.name")}
                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={`${t("booking.name")} *`} className="input mt-2 w-full" autoComplete="name" required />
              </label>
              <label className="block text-sm font-semibold text-drivo-text">{t("booking.email")}
                <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder={t("booking.email")} className="input mt-2 w-full" autoComplete="email" required />
              </label>
            </div>

            <div className="flex gap-2">
              <label className="block w-28 shrink-0 text-sm font-semibold text-drivo-text">{t("phase3.dialingCode")}
                <select value={phoneCode} onChange={(e) => setPhoneCode(e.target.value)} className="input mt-2 w-full">
                  <option>+421</option><option>+420</option><option>+43</option><option>+49</option><option>+44</option><option>+92</option>
                </select>
              </label>
              <label className="block min-w-0 flex-1 text-sm font-semibold text-drivo-text">{t("booking.phone")}
                <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder={`${t("booking.phone")} *`} className="input mt-2 w-full" autoComplete="tel-national" required />
              </label>
            </div>

            {passengerProfile ? (
              <div className="rounded-2xl border border-drivo-green/20 bg-drivo-green-light/40 p-4 text-[13px]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-semibold text-drivo-text">
                    {t("passenger.loggedInAs", "Logged in as")}{" "}
                    {String(passengerProfile.phone || passengerProfile.normalizedPhone || phoneCode + customerPhone)}
                  </p>
                  <button
                    type="button"
                    className="text-left text-[13px] font-bold text-drivo-green hover:underline"
                    onClick={async () => {
                      authEpoch.current += 1;
                      const logout = await csrfFetch("passenger","/api/passenger/logout", { method: "POST", credentials: "include" }).catch(() => null);
                      if (!logout?.ok) { setLogoutFailed(true); return; }
                      const recoveryWarning = Boolean(logout.headers.get("X-Drivo-Booking-Recovery"));
                      lastSubmittedPayload.current = null;
                      latestDraftState.current = null;
                      notePassengerHistoryInTab();
                      clearGuestDraftTransition();
                      clearBookingDraft();
                      clearBookingOperationId();
                      setBookingOperationId("");
                      if (recoveryWarning) {
                        markBookingSubmissionUncertain();
                        setSubmissionUncertain(true);
                        setOperationNoticeKey(logout.headers.get("X-Drivo-Booking-Recovery") === "BOOKING_CREATED" ? "phase42.transitionCreated" : "phase42.transitionReview");
                      } else {
                        clearBookingSubmissionUncertain();
                        setSubmissionUncertain(false);
                      }
                      setPendingDraft(null);
                      setDraftScope("guest");
                      setDraftReady(true);
                      resetUnsubmittedForm();
                      setDraftNoticeKey("phase4.accountChanged");
                      setLogoutFailed(false);
                      setPassengerProfile(null);
                      setLoginPassword("");
                      setCustomerName("");
                      setCustomerEmail("");
                      setCustomerPhone("");
                      setRegistrationProofPhone("");
                      setAuthError("");
                      setError((current) => (isAuthenticationRequiredMessage(current) ? "" : current));
                      setAuthMode("idle");
                    }}
                  >
                    {t("passenger.useAnotherAccount", "Use another account")}
                  </button>
                </div>
                {logoutFailed && <p role="alert" className="mt-2 text-sm text-red-700">{t("phase3.logoutFailed")}</p>}
              </div>
            ) : !earlyLoginOpen || bookingId ? (
              <div className="rounded-2xl border border-drivo-border-light bg-drivo-bg-soft/60 p-4">
                <div className="mb-4 flex flex-col gap-1">
                  <p className="text-[13px] font-semibold text-drivo-text">
                    {authMode === "existingAccountLogin"
                      ? t("passenger.loginToContinueTitle", "Log in to continue")
                      : authMode === "emailRecovery"
                        ? t("passenger.resetPasswordTitle", "Reset your password")
                        : authMode === "legacyPasswordSetupOtp" || authMode === "legacyPasswordSetup"
                          ? t("passenger.createPasswordTitle", "Create a password to continue")
                          : t("passenger.firstTimePrompt", "First time with Drivo? Verify phone and create account.")}
                  </p>
                  {authMode === "existingAccountLogin" && (
                    <p className="text-[12px] text-drivo-text-secondary">
                      {t("passenger.existingAccountMessage", "This phone already has a Drivo account.")}
                    </p>
                  )}
                </div>

                {authMode === "checkingPhone" && (
                  <p className="text-[13px] font-semibold text-drivo-text-secondary">
                    {t("passenger.checkingPhone", "Checking phone number...")}
                  </p>
                )}

                {authMode === "existingAccountLogin" && (
                  <div className="space-y-3">
                    <div>
                      <FieldLabel>{t("booking.phone")}</FieldLabel>
                      <input className="input bg-drivo-bg-soft" value={registrationProofPhone || phoneCode + customerPhone} readOnly />
                    </div>
                    <PasswordInput
                      label={t("passenger.password")}
                      value={loginPassword}
                      onChange={setLoginPassword}
                      visible={showLoginPassword}
                      onToggle={() => setShowLoginPassword((current) => !current)}
                      autoComplete="current-password"
                      errorId={authError || lateLoginErrorCode ? "booking-login-error" : undefined}
                      onEnter={handlePassengerLogin}
                    />
                    {(authError || lateLoginErrorCode) && (
                      <div id="booking-login-error" role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] font-semibold text-red-700">
                        {lateLoginErrorCode ? presentMessage(lateLoginErrorCode, locale) : authError}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handlePassengerLogin(e)}
                      className="btn-primary w-full"
                      disabled={authLoading}
                    >
                      {authLoading ? t("passenger.loading") : t("passenger.loginContinue", "Login & Continue")}
                    </button>
                    <div className="flex flex-wrap gap-4">
                      <button
                        type="button"
                        className="text-[13px] font-bold text-drivo-green hover:underline"
                        onClick={() => {
                          setAuthError("");
                          clearPasswordResetState();
                          setRecoveryEmail(customerEmail);
                          setAuthMode("emailRecovery");
                        }}
                      >
                        {t("passenger.forgotPassword", "Forgot password?")}
                      </button>
                      <button
                        type="button"
                        className="text-[13px] font-bold text-drivo-green hover:underline"
                        onClick={() => {
                          setAuthError("");
                          setError((current) => (isAuthenticationRequiredMessage(current) ? "" : current));
                          setLoginPassword("");
                          clearRegistrationProof();
                          clearPasswordResetState();
                          setBookingId("");
                          setAuthMode("idle");
                        }}
                      >
                        {t("passenger.useAnotherPhone", "Use another phone")}
                      </button>
                    </div>
                  </div>
                )}

                {authMode === "loginStepUp" && (
                  <div className="space-y-3">
                    <input
                      className="input"
                      inputMode="numeric"
                      maxLength={6}
                      value={loginOtp}
                      onChange={(e) => setLoginOtp(e.target.value)}
                      placeholder={t("passenger.otpCode")}
                      required
                    />
                    <label className="flex items-center gap-2 text-[13px] font-semibold text-drivo-text-secondary">
                      <input
                        type="checkbox"
                        checked={rememberDevice}
                        onChange={(e) => setRememberDevice(e.target.checked)}
                      />
                      {t("passenger.rememberDevice", "Remember this device")}
                    </label>
                    {authError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] font-semibold text-red-700">
                        {authError}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleLoginStepUp(e)}
                      className="btn-primary w-full"
                      disabled={authLoading}
                    >
                      {authLoading ? t("otp.verifying", "Verifying...") : t("passenger.verifyOtp")}
                    </button>
                  </div>
                )}

                {authMode === "emailRecovery" && recoveryFields()}
              </div>
            ) : null}

            <select
              aria-label={t('booking.languagePreference')}
              value={languagePref}
              onChange={(e) => {
                if (isBookingLanguage(e.target.value)) {
                  languagePrefExplicit.current = true;
                  setLanguagePref(e.target.value);
                }
              }}
              className="input"
            >
              <option value="sk">🇸🇰 {t('language.option.sk')}</option>
              <option value="en">🇬🇧 {t('language.option.en')}</option>
              <option value="de">🇩🇪 {t('language.option.de')}</option>
              <option value="uk">🇺🇦 {t('language.option.uk')}</option>
              <option value="cs">🇨🇿 {t('language.option.cs')}</option>
            </select>

            <div>
              <label className="text-[12px] font-semibold text-drivo-text-secondary mb-3 block">
                💳 {t("booking.payment")} *
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  ["card", "💳", t("booking.paymentCard"), t("booking.paymentCardDesc"), t("booking.recommended", "Recommended")],
                  ["cash", "💰", t("booking.paymentCash"), t("booking.paymentCashDesc"), t("booking.rulesApply", "Rules apply")],
                ].filter(([v]) => !(childrenTransport && v === "cash")).map(([v, icon, label, sub, tag]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(v as PaymentMethod);
                      setCashAgreed(false);
                    }}
                    className={`p-4 rounded-2xl border-2 text-left transition-all ${
                      paymentMethod === v
                        ? v === "cash"
                          ? "border-amber-400 bg-drivo-amber-light"
                          : "border-drivo-green bg-drivo-green-light"
                        : "border-drivo-border hover:border-drivo-green/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xl">{icon}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-drivo-green/10 text-drivo-green">
                        {tag}
                      </span>
                    </div>
                    <span className="text-[14px] font-semibold text-drivo-text block">
                      {label}
                    </span>
                    <span className="text-[11px] text-drivo-text-muted">
                      {sub}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === "cash" && (
              <CashWarning agreed={cashAgreed} onAgreeChange={setCashAgreed} />
            )}

            <textarea
              value={specialNotes}
              onChange={(e) => setSpecialNotes(e.target.value)}
              placeholder={t("booking.notesPlaceholder")}
              rows={3}
              maxLength={500}
              className="input resize-none"
            />
          </div>
        </div>

        <div className="card bg-gradient-to-r from-drivo-green-light/30 to-drivo-blue-light/30 border border-drivo-green/20">
          <div className="flex items-start gap-3 mb-5">
            <span className="text-2xl">🛡️</span>
            <div>
              <p className="text-[14px] font-semibold text-drivo-text">
                {t("booking.secureBooking", "Secure booking")}
              </p>
              <p className="text-[12px] text-drivo-text-secondary">
                {t("booking.gdprSecure", "EU GDPR compliant. Encrypted.")}
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary w-full text-[16px] py-4 disabled:opacity-50"
            disabled={
              loading ||
              submissionUncertain ||
              (earlyLoginOpen && !passengerAuthenticated && !bookingId) ||
              (paymentMethod === "cash" && !cashAgreed) ||
              (!["idle", "authenticated"].includes(authMode) && Boolean(bookingId))
            }
          >
            {loading
              ? t("booking.creating")
              : !["idle", "authenticated"].includes(authMode) && bookingId
                ? t("passenger.completeAuthAbove", "Complete authentication above")
                : submitButtonLabel}
          </button>

          <p className="text-center text-[11px] text-drivo-text-muted mt-3">
            {t("booking.termsAgree")}{" "}
            <Link href="/terms" className="underline">
              {t("booking.terms")}
            </Link>{" "}
            {t("booking.and")}{" "}
            <Link href="/privacy" className="underline">
              {t("booking.privacy")}
            </Link>
            .
          </p>
        </div>
      </form>
    </div>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete = "new-password",
  errorId,
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete?: "current-password" | "new-password";
  errorId?: string;
  onEnter?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const id = useId();
  const { t } = useLanguage();
  return (
    <div>
      <label htmlFor={id} className="text-[12px] font-semibold text-drivo-text-secondary mb-1.5 block">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className="input pr-36"
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && onEnter) onEnter(event); }}
          autoComplete={autoComplete}
          aria-describedby={errorId}
          aria-invalid={Boolean(errorId)}
          required
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? t("phase3.hidePassword") : t("phase3.showPassword")}
          aria-pressed={visible}
          className="absolute right-2 top-1/2 min-h-11 -translate-y-1/2 px-2 text-[12px] font-bold text-drivo-green"
        >
          {visible ? t("phase3.hidePassword") : t("phase3.showPassword")}
        </button>
      </div>
    </div>
  );
}
