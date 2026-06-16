import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Password login is required before OTP verification." },
    { status: 400 }
  );
}
