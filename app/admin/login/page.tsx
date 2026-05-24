"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function AdminLoginPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
  setError(data.error || t("login.invalid"));
  return;
}

localStorage.setItem("drivo-admin-access-token", data.accessToken || data.token);
localStorage.setItem("drivo-admin-refresh-token", data.refreshToken || "");
localStorage.setItem("drivo-admin-user", JSON.stringify(data.user || data.admin));

router.push("/admin/dashboard");
    } catch (err: unknown) {
      setError(t("login.invalid"));
      console.error("Login error:", err);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-900 via-green-800 to-green-900 px-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher tone="dark" />
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl font-extrabold text-green-900">
            D
          </div>
          <h1 className="text-3xl font-bold text-white">DRIVO</h1>
          <p className="text-green-100 mt-1">{t("login.adminPanel")}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-1">{t("login.signIn")}</h2>
          <p className="text-sm text-gray-500 mb-6">{t("login.adminOnly")}</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t("common.email")}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@drivo.sk"
                required
                className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl text-base focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none transition-all"
                autoComplete="email"
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

          <div className="mt-6 pt-4 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">{t("login.noAccount")}</p>
          </div>
        </div>

        {process.env.NODE_ENV === "development" && (
          <div className="mt-4 p-3 bg-white/10 rounded-xl text-center">
            <p className="text-xs text-green-100">Dev: admin@drivo.sk / Drivo2025!</p>
          </div>
        )}
      </div>
    </div>
  );
}
