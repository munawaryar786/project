import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import type { ActorType } from "@/lib/realtime/constants";

export type NotificationInput = { recipientType: ActorType; recipientId: string; type: string; data?: Record<string, unknown>; dedupeKey: string };
export async function createNotification(input: NotificationInput) {
  return prisma.notification.upsert({ where: { dedupeKey: input.dedupeKey }, create: { recipientType: input.recipientType, recipientId: input.recipientId, type: input.type, data: (input.data || {}) as any, dedupeKey: input.dedupeKey }, update: {} });
}
export async function listNotifications(recipientType: ActorType, recipientId: string, limit = 30) {
  return prisma.notification.findMany({ where: { recipientType, recipientId }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 100) });
}
export async function unreadNotificationCount(recipientType: ActorType, recipientId: string) { return prisma.notification.count({ where: { recipientType, recipientId, readAt: null } }); }
export async function markNotificationRead(recipientType: ActorType, recipientId: string, id: string) { return prisma.notification.updateMany({ where: { id, recipientType, recipientId, readAt: null }, data: { readAt: new Date() } }); }
export async function markAllNotificationsRead(recipientType: ActorType, recipientId: string) { return prisma.notification.updateMany({ where: { recipientType, recipientId, readAt: null }, data: { readAt: new Date() } }); }
export function notificationDedupe(eventId: string, recipientType: ActorType, recipientId: string) { return `notification:${eventId}:${recipientType}:${recipientId}`; }
export function eventIdFromOutbox(id: string) { return id || randomUUID(); }
