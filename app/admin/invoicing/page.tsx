"use client";

import { useEffect, useState } from "react";
import { csrfFetch } from "@/lib/client/csrf-fetch";

type Passenger = { id: string; fullName?: string | null; email?: string | null; phone: string; phoneVerified?: boolean; status?: string };
type Account = { id: string; passengerId: string; status: string; billingName: string; billingAddress: string; billingTaxId?: string | null };
type Invoice = { id: string; bookingRef: string; invoiceNumber: string; passengerId: string; status: string; amountMinor: number; currency: string; dueAt: string; paidAt?: string | null };
type Data = { passengers: Passenger[]; accounts: Account[]; invoices: Invoice[]; owners: Passenger[] };

export default function AdminInvoicingPage() {
  const [data, setData] = useState<Data>({ passengers: [], accounts: [], invoices: [], owners: [] });
  const [query, setQuery] = useState("");
  const [billing, setBilling] = useState({ billingName: "", billingAddress: "", billingTaxId: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh(q = query) {
    const response = await csrfFetch("admin", "/api/admin/invoicing?q=" + encodeURIComponent(q), { cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 403 ? "Only a Super Admin may manage invoices." : "Invoice records unavailable.");
    setData(await response.json());
  }

  useEffect(() => { void refresh("").catch((e) => setError(e.message)); }, []);

  async function mutate(action: Record<string, string>) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await csrfFetch("admin", "/api/admin/invoicing", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.code || "Action rejected");
      setMessage("Action saved successfully.");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); }
  }

  function approve(p: Passenger) {
    if (!p.phoneVerified || p.status !== "ACTIVE") { setError("Only verified, active passengers can be approved."); return; }
    if (billing.billingName.trim().length < 2 || billing.billingAddress.trim().length < 10) { setError("Enter a valid billing name and full address."); return; }
    if (window.confirm("Approve invoice billing for " + (p.fullName || p.phone) + "?")) void mutate({ action: "APPROVE", passengerId: p.id, ...billing });
  }

  function revoke(a: Account) {
    const reason = window.prompt("Reason for revoking invoice eligibility:");
    if (reason && reason.trim().length >= 3) void mutate({ action: "REVOKE", passengerId: a.passengerId, reason });
  }

  function markPaid(invoice: Invoice) {
    const paymentReference = window.prompt("Verified bank/payment reference for " + invoice.invoiceNumber + ":");
    if (paymentReference && paymentReference.trim().length >= 3 && window.confirm("Payment verified and received?"))
      void mutate({ action: "MARK_PAID", invoiceId: invoice.id, paymentReference });
  }

  function voidInvoice(invoice: Invoice) {
    const reason = window.prompt("Reason for voiding the invoice (booking must be cancelled):");
    if (reason && reason.trim().length >= 3 && window.confirm("Void invoice?"))
      void mutate({ action: "VOID", invoiceId: invoice.id, reason });
  }

  const owner = (id: string) => data.owners.find(p => p.id === id);
  return <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-7">
    <header><h1 className="text-2xl font-bold">Invoice Billing</h1>
      <p className="text-sm text-gray-600">Only a Super Admin can grant or revoke passenger invoice eligibility and record payments.</p></header>
    {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-green-900">{message}</p>}
    <section className="rounded-xl border bg-white p-5 space-y-3">
      <h2 className="text-lg font-semibold">Approve a verified passenger</h2>
      <form onSubmit={(event) => { event.preventDefault(); void refresh(query).catch((e) => setError(e.message)); }} className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="invoice-search">Search passenger by phone or email</label>
        <input id="invoice-search" className="min-h-12 min-w-60 flex-1 rounded-lg border p-3" value={query}
          placeholder="Search phone or email (3+ characters)" onChange={e => setQuery(e.target.value)} />
        <button className="min-h-12 rounded-lg bg-green-900 px-5 text-white">Search</button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Billing name<input className="mt-1 block w-full min-h-12 rounded-lg border p-3" value={billing.billingName} onChange={e=>setBilling({...billing,billingName:e.target.value})}/></label>
        <label className="text-sm font-medium">Tax ID (optional)<input className="mt-1 block w-full min-h-12 rounded-lg border p-3" value={billing.billingTaxId} onChange={e=>setBilling({...billing,billingTaxId:e.target.value})}/></label>
        <label className="text-sm font-medium sm:col-span-2">Billing address<textarea className="mt-1 block w-full rounded-lg border p-3" rows={2} value={billing.billingAddress} onChange={e=>setBilling({...billing,billingAddress:e.target.value})}/></label>
      </div>
      <div className="space-y-2">{data.passengers.map(p =>
        <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
          <span>{p.fullName || p.phone} · {p.email || p.phone} · {p.phoneVerified ? "Verified" : "Unverified"}</span>
          <button type="button" disabled={busy || !p.phoneVerified || p.status !== "ACTIVE"} className="min-h-11 rounded-lg bg-green-900 px-4 text-white disabled:opacity-50" onClick={()=>approve(p)}>Approve invoice</button>
        </div>)}</div>
    </section>
    <section className="rounded-xl border bg-white p-5 space-y-3">
      <h2 className="text-lg font-semibold">Invoice-eligible customers</h2>
      {data.accounts.length === 0 ? <p>No eligibility records.</p> : data.accounts.map(a=>
        <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3">
          <div><p className="font-semibold">{owner(a.passengerId)?.fullName || owner(a.passengerId)?.phone || a.passengerId}</p>
            <p className="text-sm">{a.billingName} · {a.status}</p></div>
          {a.status === "APPROVED" && <button type="button" disabled={busy} onClick={()=>revoke(a)} className="min-h-11 rounded-lg border border-red-500 px-4 text-red-800">Revoke</button>}
        </div>)}
    </section>
    <section className="rounded-xl border bg-white p-5 space-y-3">
      <h2 className="text-lg font-semibold">Issued invoices and payments</h2>
      {data.invoices.length === 0 ? <p>No invoices issued yet.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr>{["Invoice / Booking","Customer","Amount","Due","Status","Action"].map(x=><th key={x} className="border-b p-2">{x}</th>)}</tr></thead>
        <tbody>{data.invoices.map(i=><tr key={i.id}>
          <td className="border-b p-2">{i.invoiceNumber}<br/><span className="text-gray-500">{i.bookingRef}</span></td>
          <td className="border-b p-2">{owner(i.passengerId)?.fullName || owner(i.passengerId)?.phone || "Passenger"}</td>
          <td className="border-b p-2">{(i.amountMinor / 100).toFixed(2)} {i.currency}</td>
          <td className="border-b p-2">{new Date(i.dueAt).toLocaleDateString("sk-SK")}</td>
          <td className="border-b p-2">{i.status}</td>
          <td className="border-b p-2">{i.status === "ISSUED" && <div className="flex gap-2">
            <button disabled={busy} type="button" onClick={()=>markPaid(i)} className="min-h-11 rounded-lg bg-green-900 px-3 text-white">Mark paid</button>
            <button disabled={busy} type="button" onClick={()=>voidInvoice(i)} className="min-h-11 rounded-lg border px-3">Void</button>
          </div>}</td>
        </tr>)}</tbody></table></div>}
    </section>
  </main>;
}
