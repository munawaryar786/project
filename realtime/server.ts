import http from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createRedisConnection, closeRedis, safeRedisStatus } from "@/lib/realtime/redis";
import { authenticateHandshake, originAllowed } from "@/lib/realtime/auth";
import { REALTIME_EVENTS } from "@/lib/realtime/constants";

const port = Number(process.env.DRIVO_REALTIME_PORT || 3101);
const httpServer = http.createServer((req, res) => { if (req.url === "/healthz") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ status: "ok", redisConnected: safeRedisStatus(pub) })); return; } res.writeHead(404); res.end(); });
const pub = createRedisConnection("socket-pub");
const sub = createRedisConnection("socket-sub");
const io = new Server(httpServer, { transports: ["websocket"], allowRequest: (req, callback) => { const origin = req.headers.origin; callback(null, originAllowed(typeof origin === "string" ? origin : undefined)); }, cors: { origin: false }, adapter: createAdapter(pub, sub) });
for (const [path, actor] of [["/driver", "DRIVER"], ["/admin", "ADMIN"], ["/passenger", "PASSENGER"]] as const) { const namespace = io.of(path); namespace.use(async (socket, next) => { try { const row = await authenticateHandshake(socket.handshake, actor); socket.data.actorId = row.id; socket.data.actor = actor; next(); } catch (error) { next(new Error(error instanceof Error ? error.message : "REALTIME_AUTH_REJECTED")); } }); namespace.on("connection", (socket) => { const room = `${actor.toLowerCase()}:${socket.data.actorId}`; socket.join(room); if (actor === "ADMIN") socket.join("admins"); socket.emit(REALTIME_EVENTS.CONNECTION, { eventId: `connection:${socket.id}`, type: REALTIME_EVENTS.CONNECTION, entityId: socket.data.actorId, occurredAt: new Date().toISOString(), stateHint: "connected" }); }); }
httpServer.listen(port, "127.0.0.1", () => console.log("[realtime.start]", { port }));
async function shutdown(signal: string) { console.log("[realtime.stop]", { signal }); await new Promise<void>((resolve) => io.close(() => resolve())); await closeRedis(pub); await closeRedis(sub); httpServer.close(() => process.exit(0)); }
process.once("SIGTERM", () => void shutdown("SIGTERM")); process.once("SIGINT", () => void shutdown("SIGINT"));
