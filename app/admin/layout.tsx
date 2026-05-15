"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import BrandLogo from "@/components/shared/BrandLogo";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { WHATSAPP_URL } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLanguage();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("drivo-admin-access-token");

    if (!token && pathname !== "/admin/login") {
      router.push("/admin/login");
    } else {
      setIsAuthenticated(true);
    }

    setLoading(false);
  }, [pathname, router]);

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin">...</div>
          <p className="text-gray-500">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const navItems = [
    {
      href: "/admin/dashboard",
      label: t("admin.dashboard"),
      icon: "DB",
      active: pathname === "/admin/dashboard",
    },
    {
      href: "/admin/bookings",
      label: t("admin.bookings"),
      icon: "BK",
      active: pathname.startsWith("/admin/bookings"),
    },
    {
      href: "/admin/drivers",
      label: t("admin.drivers"),
      icon: "DR",
      active: pathname.startsWith("/admin/drivers"),
    },
    {
      href: "/admin/tracking",
      label: t("admin.tracking"),
      icon: "GPS",
      active: pathname.startsWith("/admin/tracking"),
    },
    {
      href: "/admin/vehicles",
      label: t("admin.vehicles"),
      icon: "VH",
      active: pathname.startsWith("/admin/vehicles"),
    },
  ];

  const handleLogout = () => {
    localStorage.removeItem("drivo-admin-access-token");
    localStorage.removeItem("drivo-admin-refresh-token");
    localStorage.removeItem("drivo-admin-user");
    router.push("/admin/login");
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="fixed top-0 left-0 right-0 z-50 bg-green-900 text-white shadow-lg">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-white/10 rounded-lg"
              aria-label="Toggle menu"
            >
              <span className="text-xl">{sidebarOpen ? "x" : "="}</span>
            </button>

            <Link href="/admin/dashboard" className="flex items-center gap-2 font-bold text-lg">
              <BrandLogo className="h-9 w-28" />
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-normal">
                Admin
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <LanguageSwitcher tone="light" />
            <a
              href="/"
              target="_blank"
              className="text-sm text-white/70 hover:text-white transition-colors hidden sm:block"
            >
              {t("admin.viewWebsite")}
            </a>

            <button
              onClick={handleLogout}
              className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"
            >
              {t("admin.logout")}
            </button>
          </div>
        </div>
      </header>

      <aside
        className={`fixed top-14 left-0 bottom-0 w-60 bg-white border-r border-gray-200 shadow-sm z-40 transform transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                item.active
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <span className="text-[11px] font-black w-8">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-100">
          <div className="text-xs text-gray-400 mb-2">{t("admin.quickActions")}</div>

          <a href="/" target="_blank" className="flex items-center gap-2 text-sm text-gray-500 hover:text-green-700 py-1">
            {t("admin.openWebsite")}
          </a>

          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-green-700 py-1"
          >
            {t("common.whatsapp")}
          </a>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="lg:ml-60 pt-14 min-h-screen">
        <div className="p-4 md:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
