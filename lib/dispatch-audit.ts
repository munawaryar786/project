import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const dispatchAuditRequestId = () => randomUUID();

export async function recordDispatchAudit(input: {
  actorType: "ADMIN" | "DISPATCH_OPERATOR";
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  bookingRef?: string | null;
  requestId?: string;
  outcome: string;
  safeMetadata?: Record<string, string | number | boolean | null>;
}, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  return tx.dispatchAuditEvent.create({
    data: {
      ...input,
      requestId: input.requestId || dispatchAuditRequestId(),
      bookingRef: input.bookingRef || null,
      safeMetadata: input.safeMetadata as Prisma.InputJsonValue | undefined,
    },
  });
}
