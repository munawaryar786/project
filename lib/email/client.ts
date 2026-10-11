import net from "node:net";
import tls from "node:tls";
import { createHash } from "node:crypto";
import type { Socket } from "node:net";
import type { TLSSocket } from "node:tls";
import { Resend } from "resend";
import { EMAIL } from "../constants";
import { emailAddress, emailHeader, senderAddress, EmailError, providerFailure } from "./config";
import type { DeliveryResult, RenderedEmail } from "./types";
type EmailSendResult = DeliveryResult;
type EmailMessage = RenderedEmail & { to: string | string[]; idempotencyKey: string };
type SmtpConfig = { host: string; port: number; user: string; pass: string; from: string; secure: boolean };
type SmtpResponse = { code: number; message: string };
class DeadlineResend extends Resend {
  override fetchRequest<T>(path: string, options: RequestInit = {}) {
    return super.fetchRequest<T>(path, { ...options, signal: AbortSignal.timeout(60_000) });
  }
}
const resend = process.env.RESEND_API_KEY ? new DeadlineResend(process.env.RESEND_API_KEY) : null;
export function resendDeliveryResult(response: { data: { id: string } | null; error: { name: string } | null }): DeliveryResult {
  if (response.error) return { success: false, provider: "resend", error: "EMAIL_PROVIDER_REJECTED", retryable: ["rate_limit_exceeded", "application_error", "internal_server_error"].includes(response.error.name) };
  if (!response.data?.id) return { success: false, provider: "resend", error: "EMAIL_PROVIDER_INVALID_RESPONSE", retryable: true };
  return { success: true, provider: "resend" };
}
function getFromAddress() {
  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || `Drivo <${EMAIL}>`;
  senderAddress(from); return emailHeader(from);
}
function getReplyTo() { return process.env.EMAIL_REPLY_TO ? emailAddress(process.env.EMAIL_REPLY_TO) : undefined; }
export function getSmtpConfig(env: Readonly<Record<string, string | undefined>> = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST; const port = Number(env.SMTP_PORT);
  const user = env.SMTP_USER; const pass = env.SMTP_PASS;
  if (!host || !env.SMTP_PORT || !user || !pass) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535 || /[\r\n]/.test(host)) throw new EmailError("EMAIL_CONFIG_INVALID");
  const from = env.SMTP_FROM || env.EMAIL_FROM || `Drivo <${EMAIL}>`;
  senderAddress(from);
  return { host, port, user, pass, from: emailHeader(from), secure: env.SMTP_SECURE === "true" || port === 465 };
}
function hasPartialSmtpConfig() { return [process.env.SMTP_HOST, process.env.SMTP_PORT, process.env.SMTP_USER, process.env.SMTP_PASS].some(Boolean); }
function extractEmailAddress(from: string) {
  return senderAddress(from);
}

function normalizeRecipients(to: string | string[]) {
  return (Array.isArray(to) ? to : [to]).map(emailAddress);
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(emailHeader(value), "utf8").toString("base64")}?=`;
}

function dotStuff(value: string) {
  return value.replace(/\r?\n\./g, "\r\n..");
}

function mimeBody(value: string) {
  return Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") || "";
}

function buildMimeMessage(from: string, message: EmailMessage) {
  const recipients = normalizeRecipients(message.to);
  const boundary = `drivo-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return [
    `From: ${emailHeader(from)}`,
    ...(getReplyTo() ? [`Reply-To: ${getReplyTo()}`] : []),
    `To: ${recipients.join(", ")}`,
    `Subject: ${encodeHeader(message.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    mimeBody(message.text),
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    mimeBody(message.html),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

async function connectSmtp(config: SmtpConfig): Promise<Socket | TLSSocket> {
  const socket = config.secure
    ? tls.connect({
        host: config.host,
        port: config.port,
        servername: config.host,
      })
    : net.connect({
        host: config.host,
        port: config.port,
      });

  await new Promise<void>((resolve, reject) => {
    const successEvent = config.secure ? "secureConnect" : "connect";
    const cleanup = () => {
      socket.off(successEvent, onSuccess);
      socket.off("error", onError);
      clearTimeout(deadline);
    };
    const onSuccess = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const deadline = setTimeout(() => { socket.destroy(); onError(new EmailError("EMAIL_CONNECTION_TIMEOUT", true)); }, 10_000);
    socket.once(successEvent, onSuccess);
    socket.once("error", onError);
  });

  socket.setTimeout(30000);
  return socket;
}

function createSmtpReader(socket: Socket | TLSSocket) {
  let buffer = "";

  return async function readResponse(): Promise<SmtpResponse> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        socket.off("data", onData);
        socket.off("error", onError);
        socket.off("timeout", onTimeout);
        socket.off("close", onClose);
      };

      const parse = () => {
        const lines = buffer.split(/\r?\n/).filter(Boolean);
        const finalLine = [...lines].reverse().find((line) => /^\d{3} /.test(line));
        if (!finalLine) return;

        cleanup();
        buffer = "";
        resolve({
          code: Number(finalLine.slice(0, 3)),
          message: lines.join("\n"),
        });
      };

      const onData = (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        if (Buffer.byteLength(buffer, "utf8") > 64 * 1024) { onError(new EmailError("EMAIL_SMTP_RESPONSE_INVALID")); return; }
        parse();
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const onTimeout = () => {
        cleanup();
        reject(new EmailError("EMAIL_SOCKET_TIMEOUT", true));
      };
      const onClose = () => onError(new EmailError("EMAIL_CONNECTION_CLOSED", true));

      socket.on("data", onData);
      socket.once("error", onError);
      socket.once("timeout", onTimeout);
      socket.once("close", onClose);
      parse();
    });
  };
}

async function expectSmtpResponse(
  readResponse: () => Promise<SmtpResponse>,
  expectedCodes: number[],
  action: string
) {
  const response = await readResponse();
  if (!expectedCodes.includes(response.code)) {
    throw new EmailError(`EMAIL_SMTP_${response.code}`, response.code >= 400 && response.code < 500);
  }
  return response;
}

async function writeCommand(
  socket: Socket | TLSSocket,
  readResponse: () => Promise<SmtpResponse>,
  command: string,
  expectedCodes: number[],
  action: string
) {
  socket.write(`${command}\r\n`);
  return expectSmtpResponse(readResponse, expectedCodes, action);
}

async function upgradeToTls(socket: Socket, config: SmtpConfig) {
  const secureSocket = tls.connect({
    socket,
    host: config.host,
    servername: config.host,
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { secureSocket.destroy(); reject(new EmailError("EMAIL_TLS_TIMEOUT", true)); }, 10_000);
    secureSocket.once("secureConnect", () => { clearTimeout(timer); resolve(); });
    secureSocket.once("error", () => { clearTimeout(timer); reject(new EmailError("EMAIL_TLS_FAILED")); });
  });

  secureSocket.setTimeout(30000);
  return secureSocket;
}

async function sendViaSmtp(message: EmailMessage, config: SmtpConfig) {
  let socket = await connectSmtp(config);
  let readResponse = createSmtpReader(socket);
  const deadline = setTimeout(() => socket.destroy(new EmailError("EMAIL_SEND_TIMEOUT", true)), 60_000);

  try {
    await expectSmtpResponse(readResponse, [220], "SMTP greeting");

    const ehlo = await writeCommand(
      socket,
      readResponse,
      "EHLO drivo.local",
      [250],
      "SMTP EHLO"
    );

    if (!config.secure && ehlo.message.toUpperCase().includes("STARTTLS")) {
      await writeCommand(socket, readResponse, "STARTTLS", [220], "SMTP STARTTLS");
      socket = await upgradeToTls(socket as Socket, config);
      readResponse = createSmtpReader(socket);
      await writeCommand(socket, readResponse, "EHLO drivo.local", [250], "SMTP EHLO after STARTTLS");
    }

    if (!config.secure && !(socket instanceof tls.TLSSocket)) throw new EmailError("EMAIL_TLS_REQUIRED");
    await writeCommand(socket, readResponse, "AUTH LOGIN", [334], "SMTP auth");
    await writeCommand(
      socket,
      readResponse,
      Buffer.from(config.user, "utf8").toString("base64"),
      [334],
      "SMTP username"
    );
    await writeCommand(
      socket,
      readResponse,
      Buffer.from(config.pass, "utf8").toString("base64"),
      [235],
      "SMTP password"
    );

    const fromAddress = extractEmailAddress(config.from);
    await writeCommand(
      socket,
      readResponse,
      `MAIL FROM:<${fromAddress}>`,
      [250],
      "SMTP MAIL FROM"
    );

    for (const recipient of normalizeRecipients(message.to)) {
      await writeCommand(
        socket,
        readResponse,
        `RCPT TO:<${recipient}>`,
        [250, 251],
        "SMTP RCPT TO"
      );
    }

    await writeCommand(socket, readResponse, "DATA", [354], "SMTP DATA");
    socket.write(`${dotStuff(buildMimeMessage(config.from, message))}\r\n.\r\n`);
    await expectSmtpResponse(readResponse, [250], "SMTP message send");
    socket.write("QUIT\r\n");
  } finally {
    clearTimeout(deadline);
    socket.destroy();
  }
}

export async function deliverEmail(message: EmailMessage): Promise<EmailSendResult> {
  try { normalizeRecipients(message.to); emailHeader(message.subject); } catch { return { success: false, provider: "none", error: "EMAIL_MESSAGE_INVALID", retryable: false }; }
  let smtpConfig: SmtpConfig | null;
  try { smtpConfig = getSmtpConfig(); } catch { return { success: false, provider: "none", error: "EMAIL_CONFIG_INVALID", retryable: false }; }

  if (smtpConfig) {
    try {
      await sendViaSmtp(message, smtpConfig);
      return { success: true, provider: "smtp" };
    } catch (error) {
      const failure = providerFailure(error);
      return { success: false, provider: "smtp", error: failure.code, retryable: failure.retryable };
    }
  }

  if (hasPartialSmtpConfig()) return { success: false, provider: "none", error: "EMAIL_CONFIG_INCOMPLETE", retryable: false };

  if (resend) {
    try {
      const response = await resend.emails.send({
        from: getFromAddress(),
        to: normalizeRecipients(message.to),
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(getReplyTo() ? { replyTo: getReplyTo() } : {}),
      }, { idempotencyKey: createHash("sha256").update(message.idempotencyKey).digest("hex") });
      return resendDeliveryResult(response);
    } catch (error) {
      const failure = providerFailure(error);
      return { success: false, provider: "resend", error: failure.code, retryable: failure.retryable };
    }
  }

  return {
    success: false,
    provider: "console",
    error: "EMAIL_PROVIDER_UNCONFIGURED", retryable: false,
  };
}
