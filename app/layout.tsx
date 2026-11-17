import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Supplier Recovery Desk - Evidence-Backed Supplier Cost Recovery',
  description:
    'Turn supplier-caused operational losses into traceable, evidence-backed recovery claims, and track every claim until credit or reimbursement is received.',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'Supplier Recovery Desk - Evidence-Backed Supplier Cost Recovery',
    description:
      'Turn supplier-caused operational losses into traceable, evidence-backed recovery claims, and track every claim until credit or reimbursement is received.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Supplier Recovery Desk',
    description:
      'Find the money lost to supplier failures. Document it. Claim it. Track the recovery.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap"
        />
      </head>
      <body suppressHydrationWarning className="min-h-screen bg-[#F8FAFC] text-[#0F172A] antialiased">
        {children}
      </body>
    </html>
  );
}
