"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { csrfFetch } from "@/lib/client/csrf-fetch";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { formatEuro, formatMarketDateTime, formatMarketWallDateTime, formatNumber } from "@/lib/i18n/format";
import { presentMessage } from "@/lib/i18n/message-catalog";
import { presentStatus } from "@/lib/i18n/status-catalog";

type Detail = Record<string, any>;
type LinkState = { payment?: { status?: string; expiresAt?: string | null; emailStatus?: string }; url?: string | null };

export default function DispatchBookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLanguage();
  const [booking, setBooking] = useState<Detail | null>(null);
  const [timeline, setTimeline] = useState<Detail[]>([]);
  const [link, setLink] = useState<LinkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const tr = (key: string, fallback: string) => t(`dispatch.detail.${key}`, fallback);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await csrfFetch("dispatch_operator", `/api/dispatch/bookings/${id}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.code === "string" ? data.code : "DETAIL_LOAD_FAILED");
      setBooking(data.booking); setTimeline(data.timeline || []);
      if (data.booking?.paymentMethod === "CARD" && data.booking.status === "PENDING") await loadPaymentLink();
    } catch (reason) { setError(reason instanceof Error && reason.message !== "DETAIL_LOAD_FAILED" ? reason.message : "DETAIL_LOAD_FAILED"); }
    finally { setLoading(false); }
  }, [id, locale]);

  async function loadPaymentLink() {
    const response = await csrfFetch("dispatch_operator", `/api/dispatch/bookings/${id}/payment-link`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setLink(data); else setLink(null);
  }

  useEffect(() => { void load(); }, [load]);

  async function createLink(action: "CREATE" | "REGENERATE") {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await csrfFetch("dispatch_operator", `/api/dispatch/bookings/${id}/payment-link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, idempotencyKey: crypto.randomUUID() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.code === "string" ? data.code : "PAYMENT_LINK_FAILED");
      setLink(data);
      let copied = false;
      if (data.url) {
        try { await navigator.clipboard.writeText(data.url); copied = true; }
        catch { copied = false; }
      }
      const emailStatus = data.payment?.emailStatus;
      const emailSent = data.emailSent === true || emailStatus === "SENT";
      const emailFailed = emailStatus === "FAILED";
      const emailNotProvided = emailStatus === "NOT_PROVIDED";
      const noticeKey = emailSent
        ? copied ? "linkCreatedEmail" : "linkCreatedEmailCopyBlocked"
        : emailFailed
          ? copied ? "linkCreatedEmailFailed" : "linkCreatedEmailFailedCopyBlocked"
          : emailNotProvided
            ? copied ? "linkCreatedEmailNotProvided" : "linkCreatedEmailNotProvidedCopyBlocked"
            : copied ? "linkCreated" : "linkCreatedCopyBlocked";
      setNotice(`dispatch.detail.${noticeKey}`);
      await load();
    } catch (reason) { setError(reason instanceof Error && reason.message !== "PAYMENT_LINK_FAILED" ? reason.message : "PAYMENT_LINK_FAILED"); }
    finally { setBusy(false); }
  }

  async function copyLink() {
    if (!link?.url) return;
    try { await navigator.clipboard.writeText(link.url); setNotice("dispatch.detail.copied"); }
    catch { setError("COPY_FAILED"); }
  }

  const money = (amount: number | null | undefined) => typeof amount === "number" ? formatEuro(amount, locale) : tr("notAvailable", "Not available");
  const dateTime = (value: string | Date | null | undefined) => value ? formatMarketDateTime(value, locale) : tr("notAvailable", "Not available");
  const enumLabel = (value: unknown) => { const raw = String(value || ""); return /^[A-Z][A-Z0-9_]*$/.test(raw) ? t(`driverPortal.enum.${raw}`, t("m4.common.unknownState")) : raw; };
  const displayError = (code: string) => code === "DETAIL_LOAD_FAILED" ? tr("loadError", "Could not load booking details.") : code === "PAYMENT_LINK_FAILED" ? tr("paymentError", "Payment link could not be created.") : code === "COPY_FAILED" ? tr("copyError", "Could not copy the payment link.") : presentMessage(code, locale);
  const row = (label: string, value: unknown) => <div className="border-b py-2 last:border-0"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words">{value == null || value === "" ? "—" : String(value)}</dd></div>;

  if (loading) return <p role="status" aria-live="polite">{t("common.loading", "Loading")}</p>;
  if (!booking) return <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-900">{error ? displayError(error) : tr("loadError", "Could not load booking details.")}</p>;
  const pendingCard = booking.paymentMethod === "CARD" && booking.status === "PENDING";
  const paymentStatus = link?.payment?.status || booking.payment?.[0]?.status || "PENDING";
  const paymentMethodLabel = booking.paymentMethod === "CASH"
    ? t("dispatch.payOnRide", "Pay on Ride")
    : booking.paymentMethod === "INVOICE"
      ? t("dispatch.invoice", "Invoice")
      : presentStatus("payment", paymentStatus, locale);
  return <main className="space-y-5" aria-labelledby="dispatch-booking-heading">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 id="dispatch-booking-heading" className="text-3xl font-black text-drivo-navy">{tr("booking", "Booking")} <span className="font-mono">{booking.bookingRef}</span></h1><p className="mt-1 text-sm text-slate-600">{presentStatus("booking", booking.status, locale)} · {paymentMethodLabel}</p></div><button type="button" onClick={() => void load()} className="min-h-11 rounded-lg border px-4 focus-visible:outline focus-visible:outline-2">{t("common.refresh", "Refresh")}</button></header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">{displayError(error)}</p>}{notice && <p role="status" aria-live="polite" className="rounded-lg bg-green-50 p-3 text-green-900">{t(notice)}</p>}
    {pendingCard && <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4" aria-labelledby="payment-link-heading"><h2 id="payment-link-heading" className="text-lg font-black">{tr("paymentPending", "Payment pending")}</h2><p className="mt-1">{tr("payment", "Payment")}: {presentStatus("payment", link?.payment?.status || booking.payment?.[0]?.status || "PENDING", locale)}{link?.payment?.expiresAt ? ` · ${tr("expires", "Expires")}: ${dateTime(link.payment.expiresAt)}` : ""}</p><p className="mt-1 font-bold">{tr("amount", "Amount")}: {money(booking.estimatedPrice)}</p><div className="mt-3 flex flex-wrap gap-2">{link?.url ? <button type="button" disabled={busy} onClick={() => void copyLink()} className="min-h-11 rounded-lg bg-drivo-navy px-4 font-bold text-white">{tr("copyLink", "Copy Payment Link")}</button> : <button type="button" disabled={busy} onClick={() => void createLink("CREATE")} className="min-h-11 rounded-lg bg-drivo-navy px-4 font-bold text-white">{busy ? t("common.loading", "Loading") : tr("createLink", "Create Payment Link")}</button>}{booking.payment?.length > 0 && (link?.payment?.status === "EXPIRED" || booking.payment?.[0]?.status === "EXPIRED") && <button type="button" disabled={busy} onClick={() => void createLink("REGENERATE")} className="min-h-11 rounded-lg border px-4">{tr("regenerateLink", "Regenerate Payment Link")}</button>}</div><p className="mt-2 text-xs text-slate-700">{tr("expiryNotice", "Payment links expire after 30 minutes. Card bookings enter dispatch only after payment is verified.")}</p></section>}
    <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-2xl border bg-white p-4" aria-labelledby="trip-heading"><h2 id="trip-heading" className="text-xl font-black">{tr("trip", "Trip")}</h2><dl className="mt-2">{row(tr("customer", "Customer"), booking.customerName)}{row(tr("phone", "Phone"), booking.customerPhone)}{row(tr("email", "Email"), booking.customerEmail)}{row(tr("pickup", "Pickup"), booking.pickupAddress)}{row(tr("destination", "Destination"), booking.dropoffAddress)}{row(tr("pickupTime", "Pickup time"), booking.pickupAt ? dateTime(booking.pickupAt) : formatMarketWallDateTime(booking.scheduledDate, booking.scheduledTime, locale))}{row(tr("service", "Service"), t(`service.${booking.serviceType}`, t("m4.common.unknownState")))}{row(tr("passengers", "Passengers"), formatNumber(booking.passengerCount, locale))}{row(tr("luggage", "Luggage"), `${formatNumber(booking.smallBags || 0, locale)} / ${formatNumber(booking.largeBags || 0, locale)}`)}{row(tr("fare", "Fare"), money(booking.estimatedPrice))}{row(tr("driver", "Driver"), booking.driver ? `${booking.driver.fullName}${booking.driver.phone ? ` · ${booking.driver.phone}` : ""}` : tr("unassigned", "Not assigned"))}</dl></section>
      <section className="rounded-2xl border bg-white p-4" aria-labelledby="details-heading"><h2 id="details-heading" className="text-xl font-black">{tr("passengerInformation", "Passenger information")}</h2><dl className="mt-2">{row(tr("paymentMethod", "Payment method"), paymentMethodLabel)}{row(tr("senior", "Senior passenger"), booking.seniorPassenger ? tr("yes", "Yes") : tr("no", "No"))}{row(tr("ztp", "ZTP card holder"), booking.ztpCardHolder ? tr("yes", "Yes") : tr("no", "No"))}{row(tr("wheelchair", "Wheelchair"), booking.wheelchairUser ? tr("yes", "Yes") : tr("no", "No"))}{row(tr("assistance", "Assistance level"), booking.assistanceLevel ? enumLabel(booking.assistanceLevel) : "—")}{row(tr("companions", "Companions"), formatNumber(booking.companionCount, locale))}{row(tr("return", "Return"), booking.returnDate ? `${booking.returnDate} ${booking.returnTime || ""}` : null)}{row(tr("waiting", "Reserved waiting"), enumLabel(booking.waitingDuration || booking.customWaitingDuration))}{row(tr("children", "Children"), booking.childrenDetails?.map((child: Detail) => `${child.fullName} (${child.age})`).join(", "))}{row(tr("institution", "Institution"), booking.educationalInstitutionName)}{row(tr("institutionAddress", "Institution address"), booking.institutionAddress)}{row(tr("notes", "Notes"), booking.specialNotes)}</dl></section></div>
    <section className="rounded-2xl border bg-white p-4" aria-labelledby="payments-heading"><h2 id="payments-heading" className="text-xl font-black">{tr("paymentHistory", "Payment history")}</h2>{booking.payment?.length ? <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">{tr("status", "Status")}</th><th className="p-2">{tr("amount", "Amount")}</th><th className="p-2">{tr("expires", "Expires")}</th><th className="p-2">{tr("paid", "Paid")}</th></tr></thead><tbody>{booking.payment.map((payment: Detail) => <tr key={payment.id} className="border-b"><td className="p-2">{presentStatus("payment", payment.status, locale)}</td><td className="p-2">{money(payment.amountMinor / 100)}</td><td className="p-2">{dateTime(payment.expiresAt)}</td><td className="p-2">{dateTime(payment.paidAt)}</td></tr>)}</tbody></table></div> : <p className="mt-2 text-sm text-slate-600">{tr("noPayments", "No payment records.")}</p>}</section>
    <section className="rounded-2xl border bg-white p-4" aria-labelledby="timeline-heading"><h2 id="timeline-heading" className="text-xl font-black">{tr("activity", "Activity")}</h2>{timeline.length ? <ol className="mt-3 space-y-3">{timeline.map((event, index) => <li key={`${event.action}-${index}`} className="border-l-2 border-teal-700 pl-3"><p className="font-semibold">{t(`dispatch.detail.action.${event.action}`, t("m4.common.unknownState"))}</p><p className="text-xs text-slate-600">{dateTime(event.createdAt)} · {t(`m4.audit.outcome.${event.outcome}`, t("m4.common.unknownState"))}</p></li>)}</ol> : <p className="mt-2 text-sm text-slate-600">{tr("noActivity", "No activity recorded.")}</p>}</section>
  </main>;
}
