import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/security/authorization";
import { markAllNotificationsRead } from "@/lib/notifications";
export async function POST(request: NextRequest) { const auth = await authorizeAdmin(request); if (!auth.ok) return auth.response; const result = await markAllNotificationsRead("ADMIN", auth.actor.id); return NextResponse.json({ ok: true, count: result.count }); }
