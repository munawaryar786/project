"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { presentMessage } from "@/lib/i18n/message-catalog";

export default function ContactForm() {
  const { t, locale } = useLanguage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("general");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; code?: string } | null>(null);

  const subjects = [
    ["general", t("contact.general")],
    ["booking", t("contact.bookingHelp")],
    ["accessible", t("contact.accessible")],
    ["driver", t("contact.driver")],
    ["partnership", t("contact.partnership")],
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus({ ok: false, code: res.status === 429 ? "RATE_LIMITED_GENERIC" : typeof data?.code === "string" ? data.code : "CONTACT_SEND_FAILED" }); return; }
      setStatus({ ok: true });
      setName("");
      setEmail("");
      setSubject("general");
      setMessage("");
    } catch {
      setStatus({ ok: false, code: "CONTACT_SEND_FAILED" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="contact-name" className="text-[12px] font-semibold text-drivo-text-secondary mb-1.5 block">
          {t("common.name")} *
        </label>
        <input
          id="contact-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("contact.placeholderName")}
          className="input"
          required
        />
      </div>
      <div>
        <label htmlFor="contact-email" className="text-[12px] font-semibold text-drivo-text-secondary mb-1.5 block">
          {t("common.email")} *
        </label>
        <input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("contact.placeholderEmail", "your@email.com")}
          className="input"
          required
        />
      </div>
      <div>
        <label htmlFor="contact-subject" className="text-[12px] font-semibold text-drivo-text-secondary mb-1.5 block">
          {t("common.subject")}
        </label>
        <select id="contact-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="input">
          {subjects.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="contact-message" className="text-[12px] font-semibold text-drivo-text-secondary mb-1.5 block">
          {t("common.message")} *
        </label>
        <textarea
          id="contact-message"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("contact.placeholderMessage")}
          className="input resize-none"
          required
          minLength={10}
        />
      </div>
      {status && (
        <div
          role={status.ok ? "status" : "alert"}
          className={`p-3 rounded-xl text-[13px] font-medium ${
            status.ok
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {status.ok ? t("contact.sent") : presentMessage(status.code, locale)}
        </div>
      )}
      <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
        {loading ? t("contact.sending") : `${t("common.send")} ->`}
      </button>
    </form>
  );
}
