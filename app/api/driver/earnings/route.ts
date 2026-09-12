import { NextRequest, NextResponse } from "next/server";
import { authorizeDriver } from "@/lib/security/authorization";
import { fromMinorUnits, listDriverLedger, summarizeDriverLedger } from "@/lib/earnings-ledger";

export async function GET(request: NextRequest) {
  const auth = await authorizeDriver(request); if (!auth.ok) return auth.response;
  const params = request.nextUrl.searchParams;
  const from = params.get("from"); const to = params.get("to"); const cursor = params.get("cursor") || undefined;
  const limit = Number(params.get("limit") || 25);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return NextResponse.json({ error: "Invalid limit", code: "INVALID_REQUEST" }, { status: 400 });
  try {
    const [summary, history] = await Promise.all([summarizeDriverLedger(auth.actor.id), listDriverLedger(auth.actor.id, { from, to, cursor, limit })]);
    const entries = history.entries.map((entry: any) => ({ id: entry.id, bookingId: entry.bookingId, entryType: entry.entryType, referenceType: entry.referenceType, effectiveAt: entry.effectiveAt, currency: entry.currency, gross: fromMinorUnits(entry.grossAmountMinor), commission: fromMinorUnits(entry.commissionAmountMinor), net: fromMinorUnits(entry.netAmountMinor) }));
    const currencies = (group: any) => Object.fromEntries(Object.entries(group).map(([currency, value]: any) => [currency, { net: fromMinorUnits(value.netAmountMinor), entryCount: value.entryCount }]));
    return NextResponse.json({ success: true, summary: { today: currencies(summary.today), week: currencies(summary.week), month: currencies(summary.month), all: currencies(summary.all) }, entries, nextCursor: history.nextCursor });
  } catch (error: any) { const code = error?.message === "INVALID_DATE_RANGE" ? "INVALID_DATE_RANGE" : "EARNINGS_FETCH_FAILED"; return NextResponse.json({ error: code.replaceAll("_", " "), code }, { status: code === "INVALID_DATE_RANGE" ? 400 : 500 }); }
}