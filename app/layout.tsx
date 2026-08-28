import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://volguard-ai.briankinyua0101.chatgpt.site'),
  title: 'VolGuard AI — Autonomous Options Desk',
  description:
    'An autonomous, risk-governed options trading agent built on Alpaca paper trading.',
  openGraph: {
    title: 'VolGuard AI — Autonomous Options Desk',
    description: 'Autonomous options. Deterministic risk.',
    type: 'website',
    images: [
      {
        url: 'https://volguard-ai.briankinyua0101.chatgpt.site/og.png',
        width: 1731,
        height: 909,
        alt: 'VolGuard AI — Autonomous options. Deterministic risk.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VolGuard AI — Autonomous Options Desk',
    description: 'Autonomous options. Deterministic risk.',
    images: ['https://volguard-ai.briankinyua0101.chatgpt.site/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
