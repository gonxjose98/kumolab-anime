import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/layout/Navigation';
import Footer from '@/components/layout/Footer';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });

export const metadata: Metadata = {
  title: 'KumoLab | Anime Intelligence',
  description: 'Daily anime updates, drops, and intel - without the noise.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jakarta.variable}`}>
        <Navigation />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
