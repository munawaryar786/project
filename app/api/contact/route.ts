import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimits, withRateLimit } from "@/lib/rate-limit";

const ContactSchema = z.object({
  name: z.string().trim().min(2, "Name required").max(120),
  email: z.string().trim().toLowerCase().email("Valid email required").max(254),
  subject: z.string().trim().min(2, "Subject required").max(160),
  message: z.string().trim().min(10, "Message too short").max(4000),
}).strict();

/**
 * POST /api/contact — Submit contact form
 */
async function submitContact(request: NextRequest) {
  try {
    const body = await request.json();

    const parsed = ContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const contact = await prisma.contactMessage.create({
      data: parsed.data,
    });


    return NextResponse.json(
      { success: true, id: contact.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}

export const POST = withRateLimit(submitContact, {
  ...rateLimits.public,
  scope: "contact_submit",
  max: 10,
});
