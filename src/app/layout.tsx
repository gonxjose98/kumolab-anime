import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans, Outfit, Rubik_Mono_One } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/layout/Navigation';
import Footer from '@/components/layout/Footer';
import { AnalyticsTracker } from '@/components/analytics/AnalyticsTracker';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' });
const rubikMono = Rubik_Mono_One({ 
    weight: '400', 
    subsets: ['latin'], 
    variable: '--font-display-bold' 
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://kumolab-anime.com'),
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
    url: 'https://kumolab-anime.com',
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
    google: 'your-google-verification-code', // Add when available
  },
  alternates: {
    canonical: 'https://kumolab-anime.com'
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
      <body className={`${inter.variable} ${jakarta.variable} ${outfit.variable} ${rubikMono.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <AnalyticsTracker />
          <Navigation />
          <main>{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
