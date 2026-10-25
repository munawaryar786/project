import { NextRequest, NextResponse } from "next/server";
import { authorizeDriver } from "@/lib/security/authorization";
import { SCHEDULED_ERROR_CODES } from "@/lib/scheduled-marketplace";
export async function POST(request: NextRequest) { const auth = await authorizeDriver(request); if (!auth.ok) return auth.response; return NextResponse.json({ error: "Driver release is disabled until an approved release policy is configured", code: SCHEDULED_ERROR_CODES.RELEASE_NOT_ALLOWED }, { status: 409 }); }