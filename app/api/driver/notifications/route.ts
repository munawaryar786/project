import { NextRequest, NextResponse } from "next/server";
import { authorizeDriver } from "@/lib/security/authorization";
import { listNotifications, unreadNotificationCount } from "@/lib/notifications";
import { filterCurrentDriverReminders } from "@/lib/scheduled-reminder-delivery";
export async function GET(request: NextRequest) { const auth = await authorizeDriver(request); if (!auth.ok) return auth.response; const list = await listNotifications("DRIVER", auth.actor.id, Number(request.nextUrl.searchParams.get("limit") || 30)); const current = await filterCurrentDriverReminders(list, auth.actor.id); return NextResponse.json({ notifications: current, unreadCount: await unreadNotificationCount("DRIVER", auth.actor.id) }, { headers: { "Cache-Control": "no-store" } }); }
