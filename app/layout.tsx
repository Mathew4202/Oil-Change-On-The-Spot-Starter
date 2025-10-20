import './globals.css';
import NavBar from '@/components/NavBar';
import StickyCTA from '@/components/StickyCTA';
import StickySMS from '@/components/StickySMS';
import SiteFooter from '@/components/SiteFooter';
import Script from "next/script";

export const metadata = {
  metadataBase: new URL('https://oilchangeonthespot.ca'),
  title: {
    default: 'Oil Change On The Spot – Mobile Oil Changes in HRM',
    template: '%s | Oil Change On The Spot'
  },
  description:
    'We come to you for full synthetic oil changes—sedans, SUVs, trucks & European vehicles. Transparent pricing and easy booking across HRM.',
    icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: "/apple-touch-icon.png",
    other: [
      { rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#0b5cff" }
    ]
  },
   manifest: "/site.webmanifest",
  themeColor: "#0b5cff",
  alternates: {
    canonical: 'https://oilchangeonthespot.ca',
  },
  openGraph: {
    type: 'website',
    url: 'https://oilchangeonthespot.ca',
    title: 'Oil Change On The Spot',
    description:
      'Mobile oil changes in Halifax/Dartmouth/Bedford—book online and we come to you.',
    images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'Oil Change On The Spot' }],
  },
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* 👇 This line is the key: make the whole page a flex column that fills the viewport */}
      <body className="min-h-dvh flex flex-col overflow-x-hidden">
        <NavBar />
         {/* Optional PWA/iOS helpers */}
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="mobile-web-app-capable" content="yes" />

        {/* fills the space between navbar and footer */}
        <main className="flex-1">{children}</main>

        <SiteFooter />
        <StickyCTA />
        <StickySMS />

        {/* LocalBusiness JSON-LD (ok to leave where it is) */}
        <script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'AutomotiveBusiness',
      name: 'Oil Change On The Spot',
      image: 'https://oilchangeonthespot.ca/og.jpg',
      url: 'https://oilchangeonthespot.ca',
      telephone: '+19024120344', // or +17826408341 — choose one and keep consistent
      areaServed: 'Halifax Regional Municipality',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Dartmouth',
        addressRegion: 'NS',
        addressCountry: 'CA',
      },
      openingHours: [
        'Mo 17:00-21:00','Tu 16:00-21:00','We 17:00-21:00',
        'Th 17:00-21:00','Fr 17:00-21:00','Sa 17:00-21:00','Su 17:00-21:00'
      ],
      priceRange: '$80–$150+'
    })
  }}
/>
        <Script
  defer
  data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
  src="https://plausible.io/js/script.js"
/>
      </body>
    </html>
  );
}