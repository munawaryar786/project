import { NextRequest, NextResponse } from "next/server";
import { authorizeDriver } from "@/lib/security/authorization";
import { markNotificationRead } from "@/lib/notifications";
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) { const auth = await authorizeDriver(request); if (!auth.ok) return auth.response; const { id } = await context.params; const result = await markNotificationRead("DRIVER", auth.actor.id, id); return result.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Notification not found" }, { status: 404 }); }
