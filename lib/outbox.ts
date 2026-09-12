import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

export type OutboxWrite = {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
};

export async function writeOutboxEvent(tx: any, input: OutboxWrite) {
  return tx.outboxEvent.create({
    data: {
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      idempotencyKey: input.idempotencyKey || randomUUID(),
      payload: input.payload,
      state: "PENDING",
    },
  });
}

export async function appendOutboxEvent(input: OutboxWrite) {
  return writeOutboxEvent(prisma, input);
}
