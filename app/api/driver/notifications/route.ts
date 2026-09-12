import { NextRequest, NextResponse } from "next/server";
import { authorizeDriver } from "@/lib/security/authorization";
import { listNotifications, unreadNotificationCount } from "@/lib/notifications";
export async function GET(request: NextRequest) { const auth = await authorizeDriver(request); if (!auth.ok) return auth.response; const list = await listNotifications("DRIVER", auth.actor.id, Number(request.nextUrl.searchParams.get("limit") || 30)); return NextResponse.json({ notifications: list, unreadCount: await unreadNotificationCount("DRIVER", auth.actor.id) }); }
