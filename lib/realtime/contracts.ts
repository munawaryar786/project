import type { Server as SocketServer } from "socket.io";
import { REALTIME_EVENTS, type ActorType } from "./constants";

export type SafeRealtimeEvent = { eventId: string; type: string; entityId: string; occurredAt: string; stateHint?: string; actorType?: ActorType };
export function safeEvent(input: { eventId: string; type: string; entityId: string; stateHint?: string; actorType?: ActorType }): SafeRealtimeEvent {
  return { ...input, occurredAt: new Date().toISOString() };
}
export function emitToActor(io: SocketServer, actorType: ActorType, actorId: string, event: SafeRealtimeEvent) {
  const room = `${actorType.toLowerCase()}:${actorId}`;
  io.of(`/${actorType.toLowerCase()}`).to(room).emit(event.type, event);
}
export function eventTypeForDomain(eventType: string) {
  if (eventType.includes("OFFER")) return REALTIME_EVENTS.OFFER_UPDATED;
  if (eventType.includes("DISPATCH")) return REALTIME_EVENTS.DISPATCH_UPDATED;
  if (eventType.includes("TRIP")) return REALTIME_EVENTS.TRIP_UPDATED;
  return REALTIME_EVENTS.BOOKING_UPDATED;
}
