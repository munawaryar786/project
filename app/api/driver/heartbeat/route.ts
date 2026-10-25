import { NextRequest, NextResponse } from "next/server";
import { authorizeDriver } from "@/lib/security/authorization";
import { prisma } from "@/lib/prisma";
import { getDriverPresence } from "@/lib/driver-operations";

export async function POST(request: NextRequest) {
  const auth = await authorizeDriver(request);
  if (!auth.ok) return auth.response;
  try {
    await prisma.driver.update({
      where: { id: auth.actor.id },
      data: { lastHeartbeatAt: new Date() },
    });
    const presence = await getDriverPresence(auth.actor.id);
    return NextResponse.json({ success: true, heartbeatAt: new Date().toISOString(), presence: presence?.state || "OFFLINE" });
  } catch {
    return NextResponse.json({ error: "Failed to record heartbeat", code: "HEARTBEAT_FAILED" }, { status: 500 });
  }
}
