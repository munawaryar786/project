import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/security/authorization";
import { markNotificationRead } from "@/lib/notifications";
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) { const auth = await authorizeAdmin(request); if (!auth.ok) return auth.response; const { id } = await context.params; const result = await markNotificationRead("ADMIN", auth.actor.id, id); return result.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Notification not found" }, { status: 404 }); }
