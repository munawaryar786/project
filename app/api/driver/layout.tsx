"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import BrandLogo from "@/components/shared/BrandLogo";

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [driver, setDriver] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const driverData = localStorage.getItem("drivo-driver");
    if (!driverData && pathname !== "/driver/login") {
      router.push("/driver/login");
    } else if (driverData) {
      setDriver(JSON.parse(driverData));
    }
    setLoading(false);
  }, [pathname, router]);

  // Login page — no layout
  if (pathname === "/driver/login") {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin">🚗</div>
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!driver) return null;

  const handleLogout = () => {
    localStorage.removeItem("drivo-driver");
    localStorage.removeItem("drivo-driver-token");
    router.push("/driver/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-green-800 text-white shadow-lg">
        <div className="flex items-center justify-between h-14 px-4">
          <Link
            href="/driver/dashboard"
            className="flex items-center gap-2 font-bold text-lg"
          >
            <BrandLogo className="h-9 w-28" />
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-normal">
              Vodič / Driver
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {/* Driver Name */}
            <div className="hidden sm:flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5">
              <span className="text-sm">🚗</span>
              <span className="text-sm font-medium">{driver.fullName}</span>
            </div>

            <button
              onClick={handleLogout}
              className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"
            >
              🚪 Odhlásiť
            </button>
          </div>
        </div>
      </header>

      {/* Bottom Navigation (Mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg sm:hidden">
        <div className="flex items-center justify-around h-16">
          <Link
            href="/driver/dashboard"
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg ${
              pathname === "/driver/dashboard"
                ? "text-green-700"
                : "text-gray-500"
            }`}
          >
            <span className="text-xl">📋</span>
            <span className="text-[10px] font-semibold">Jazdy</span>
          </Link>
          <Link
            href="/driver/dashboard"
            className="flex flex-col items-center gap-1 px-4 py-2 text-gray-500"
          >
            <span className="text-xl">👤</span>
            <span className="text-[10px] font-semibold">Profil</span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex flex-col items-center gap-1 px-4 py-2 text-gray-500"
          >
            <span className="text-xl">🚪</span>
            <span className="text-[10px] font-semibold">Odhlásiť</span>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-14 pb-20 sm:pb-6 min-h-screen">
        <div className="p-4 md:p-6 max-w-2xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
