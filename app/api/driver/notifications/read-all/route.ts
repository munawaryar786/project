import { NextRequest, NextResponse } from "next/server";
import { authorizeDriver } from "@/lib/security/authorization";
import { markAllNotificationsRead } from "@/lib/notifications";
export async function POST(request: NextRequest) { const auth = await authorizeDriver(request); if (!auth.ok) return auth.response; const result = await markAllNotificationsRead("DRIVER", auth.actor.id); return NextResponse.json({ ok: true, count: result.count }); }
