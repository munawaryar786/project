"use client";

export type ClientActor = "passenger" | "driver" | "admin";

function readCookie(name: string) {
  if (typeof document === "undefined") return "";
  const prefix = `${encodeURIComponent(name)}=`;
  return document.cookie.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(prefix))?.slice(prefix.length) || "";
}

export function csrfToken(actor: ClientActor) {
  return readCookie(`__Host-drivo-${actor}-csrf`) || readCookie(`drivo-${actor}-csrf`);
}

function securedInit(actor: ClientActor, init: RequestInit) {
  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const token = csrfToken(actor);
    if (token) headers.set("X-Drivo-CSRF", decodeURIComponent(token));
  }
  return { ...init, headers, credentials: "include" as RequestCredentials };
}

export async function csrfFetch(
  actor: ClientActor,
  input: RequestInfo | URL,
  init: RequestInit = {}
) {
  let response = await fetch(input, securedInit(actor, init));
  if (actor === "passenger" && response.headers.get("X-Drivo-Session-Upgraded") === "1") {
    await fetch("/api/passenger/me", { credentials: "include", cache: "no-store" });
    response = await fetch(input, securedInit(actor, init));
  }
  return response;
}
