import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans, Outfit } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/layout/Navigation';
import Footer from '@/components/layout/Footer';
import ConditionalLayout from '@/components/shared/ConditionalLayout';
import { AnalyticsTracker } from '@/components/analytics/AnalyticsTracker';
import { OrganizationJsonLd, WebSiteJsonLd } from '@/components/seo/JsonLd';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://kumolabanime.com'),
  title: {
    default: 'KumoLab | Anime Intelligence & Verified News',
    template: '%s | KumoLab'
  },
  description: 'Daily anime updates, verified news, release dates, trailers, and industry intel - without the noise. Trusted by 10,000+ anime fans.',
  keywords: ['anime news', 'anime updates', 'anime release dates', 'anime trailers', 'anime intel'],
  authors: [{ name: 'KumoLab' }],
  creator: 'KumoLab',
  publisher: 'KumoLab',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://kumolabanime.com',
    siteName: 'KumoLab',
    title: 'KumoLab | Anime Intelligence & Verified News',
    description: 'Daily anime updates, verified news, release dates, trailers, and industry intel - without the noise.',
    images: [
      {
        url: '/og-image.png',
        width: 1080,
        height: 1350,
        alt: 'KumoLab - Anime Intelligence'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KumoLab | Anime Intelligence',
    description: 'Daily anime updates, verified news, release dates, and trailers - without the noise.',
    images: ['/og-image.png'],
    creator: '@KumoLabAnime'
  },
  verification: {
    // Set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION in Vercel to the token from
    // Google Search Console. When unset, Next omits the meta tag entirely
    // (no bogus token is emitted).
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
  alternates: {
    canonical: 'https://kumolabanime.com'
  }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

import { ThemeProvider } from '@/components/providers/ThemeProvider';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <OrganizationJsonLd />
        <WebSiteJsonLd />
      </head>
      <body className={`${inter.variable} ${jakarta.variable} ${outfit.variable}`}>
        {/* storageKey bumped to 'kumolab-theme-sky': the sky redesign inverted
            the day/night meaning of next-themes 'dark'/'light', so any stale
            preference from the old galaxy theme (or an early review toggle)
            would open the site in night. A fresh key ignores those and
            re-defaults everyone to day ('dark' = bright sky); toggling still
            persists normally under the new key. */}
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="kumolab-theme-sky">
          <AnalyticsTracker />
          <ConditionalLayout nav={<Navigation />} footer={<Footer />}>
            <main style={{ position: 'relative', zIndex: 1 }}>{children}</main>
          </ConditionalLayout>
        </ThemeProvider>
      </body>
    </html>
  );
}
