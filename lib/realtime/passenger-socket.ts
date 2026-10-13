import type { Socket } from "socket.io";
import { authenticateHandshake } from "@/lib/realtime/auth";

// Worker broadcasts target only currently active database-session rooms. Also
// retire idle connections on JWT/database expiry and revalidate incoming work.
export function protectPassengerSocket(socket: Socket) {
  const remaining = Number(socket.data.realtimeExpiresAt) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) { socket.disconnect(true); return; }
  const expires = setTimeout(() => socket.disconnect(true), remaining);
  let checking = false;
  const validate = async () => {
    if (checking) return;
    checking = true;
    try { await authenticateHandshake(socket.handshake, "PASSENGER"); }
    catch { socket.disconnect(true); }
    finally { checking = false; }
  };
  const refresh = setInterval(() => void validate(), 10_000);
  expires.unref(); refresh.unref();
  socket.use((_packet, next) => {
    authenticateHandshake(socket.handshake, "PASSENGER").then(() => next()).catch(() => {
      socket.disconnect(true); next(new Error("REALTIME_AUTH_REJECTED"));
    });
  });
  socket.once("disconnect", () => { clearTimeout(expires); clearInterval(refresh); });
}
