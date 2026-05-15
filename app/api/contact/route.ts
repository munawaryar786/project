import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const ContactSchema = z.object({
  name: z.string().min(2, "Name required"),
  email: z.string().email("Valid email required"),
  subject: z.string().min(2, "Subject required"),
  message: z.string().min(10, "Message too short"),
});

/**
 * POST /api/contact — Submit contact form
 */
export async function POST(request: NextRequest) {
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

    console.log("📧 New contact message from:", parsed.data.name);

    return NextResponse.json(
      { success: true, id: contact.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}