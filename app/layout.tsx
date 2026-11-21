import type { Metadata, Viewport } from 'next';
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { requestLocale } from "@/lib/i18n/request-locale";
import { openGraphLocales, rootMetadataCopy } from "@/lib/i18n/metadata";

// Every HTML/RSC render depends on the request's locale cookie or language
// header. Keep it out of the shared Full Route Cache.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  const content = rootMetadataCopy(locale, FEATURE_FLAGS.childrenTransport);
  return {
  title: {
    default: content.title,
    template: '%s | Drivo Bratislava',
  },
  description: content.description,
  keywords: [
    'taxi Bratislava', 'ZTP taxi', 'PRM transport', 'wheelchair taxi Slovakia',
    'senior taxi Bratislava', 'airport transfer BTS', 'accessible transport',
    'Drivo', 'drivo.sk', 'taxi pre seniorov', 'vozickar taxi',
  ],
  metadataBase: new URL('https://drivo.sk'),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: openGraphLocales[locale],
    url: 'https://drivo.sk',
    siteName: 'Drivo',
    title: content.title,
    description: content.description,
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Drivo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: content.title,
    description: content.description,
    images: ['/og-image.jpg'],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  manifest: '/site.webmanifest',
  icons: { icon: '/favicon.ico', apple: '/apple-touch-icon.png' },
  };
}

export const viewport: Viewport = {
  themeColor: '#34D186',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  return (
    <html lang={locale} className="scroll-smooth">
      <body className="antialiased">
        <LanguageProvider initialLocale={locale}>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
