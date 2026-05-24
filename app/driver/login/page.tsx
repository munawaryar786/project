"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { PHONE_NUMBER, WHATSAPP_URL } from "@/lib/constants";

export default function DriverLoginPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/driver/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t("login.invalid"));
      }

      localStorage.setItem("drivo-driver", JSON.stringify(data.driver));
      localStorage.setItem("drivo-driver-token", data.token);
      window.location.href = "/driver/dashboard";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("login.invalid"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-800 via-green-700 to-green-900 px-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher tone="dark" />
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl font-extrabold text-green-800">
            D
          </div>
          <h1 className="text-3xl font-bold text-white">DRIVO</h1>
          <p className="text-green-100 mt-1">{t("login.driverPortal")}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-1">{t("login.signIn")}</h2>
          <p className="text-sm text-gray-500 mb-6">{t("login.driverOnly")}</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="phone" className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t("common.phone")}
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+421 912 345 678"
                required
                className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl text-base focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none transition-all"
                autoComplete="tel"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t("common.password")}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                required
                className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl text-base focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none transition-all"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-green-700 hover:bg-green-800 text-white font-bold rounded-xl text-base transition-colors disabled:opacity-50"
            >
              {loading ? t("login.signingIn") : t("login.signIn")}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center">{t("login.noAccount")}</p>
            <div className="mt-4 flex justify-center gap-4">
              <a href={`tel:${PHONE_NUMBER}`} className="text-xs text-green-700 hover:text-green-800 font-medium">
                {t("common.callUs")}
              </a>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-green-700 hover:text-green-800 font-medium"
              >
                {t("common.whatsapp")}
              </a>
            </div>
          </div>
        </div>

        {process.env.NODE_ENV === "development" && (
          <div className="mt-4 p-3 bg-white/10 rounded-xl text-center">
            <p className="text-xs text-green-100">
              Dev: add a driver in Admin, then use their phone + password "driver123".
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
