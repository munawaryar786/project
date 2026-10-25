import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/security/authorization";
import { listNotifications, unreadNotificationCount } from "@/lib/notifications";
export async function GET(request: NextRequest) { const auth = await authorizeAdmin(request); if (!auth.ok) return auth.response; const list = await listNotifications("ADMIN", auth.actor.id, Number(request.nextUrl.searchParams.get("limit") || 30)); return NextResponse.json({ notifications: list, unreadCount: await unreadNotificationCount("ADMIN", auth.actor.id) }); }
