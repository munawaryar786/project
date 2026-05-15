import type { Metadata, Viewport } from 'next';
import './globals.css';
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
export const metadata: Metadata = {
  title: {
    default: 'Drivo — Accessible Mobility Platform | Bratislava',
    template: '%s | Drivo Bratislava',
  },
  description:
    "Bratislava's #1 accessibility-first mobility platform. Wheelchair taxis (ZTP/PRM), senior transport, special-needs children, airport transfers & car rental for drivers.",
  keywords: [
    'taxi Bratislava', 'ZTP taxi', 'PRM transport', 'wheelchair taxi Slovakia',
    'senior taxi Bratislava', 'airport transfer BTS', 'accessible transport',
    'Drivo', 'drivo.sk', 'taxi pre seniorov', 'vozickar taxi',
  ],
  metadataBase: new URL('https://drivo.sk'),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'sk_SK',
    url: 'https://drivo.sk',
    siteName: 'Drivo',
    title: 'Drivo — Accessible Mobility Platform | Bratislava',
    description: "Bratislava's #1 accessibility-first mobility platform. Wheelchair taxis, senior transport, airport transfers.",
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Drivo Bratislava Mobility Platform' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Drivo — Accessible Mobility | Bratislava',
    description: 'ZTP/PRM taxi, senior transport, airport transfers in Bratislava.',
    images: ['/og-image.jpg'],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  manifest: '/site.webmanifest',
  icons: { icon: '/favicon.ico', apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#34D186',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sk" className="scroll-smooth">
      <body className="antialiased">
        <LanguageProvider>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}