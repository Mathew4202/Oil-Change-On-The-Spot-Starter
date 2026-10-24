import { PHONE_TEL } from '@/lib/os/business';
import './globals.css';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import SiteHeader from '@/components/site/SiteHeader';
import SiteFooter from '@/components/site/SiteFooter';

const barlow = Barlow({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-barlow' });
const condensed = Barlow_Condensed({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-condensed' });
import Script from "next/script";
import HideOnOwner from '@/components/HideOnOwner';

export const metadata = {
  metadataBase: new URL('https://oilchangeonthespot.ca'),
  title: {
    default: 'Oil Change On The Spot | Mobile Auto Service HRM',
    template: '%s | Oil Change On The Spot'
  },
  description:
    'Full synthetic oil changes done in your driveway or at work, anywhere in HRM. See your exact price and book in under a minute.',
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
  themeColor: "#0d1b3e",
  alternates: {
    canonical: 'https://oilchangeonthespot.ca',
  },
  openGraph: {
    type: 'website',
    url: 'https://oilchangeonthespot.ca',
    title: 'Oil Change On The Spot | Mobile Auto Service HRM',
    description:
      'Full synthetic oil changes done in your driveway or at work, anywhere in HRM. See your exact price and book in under a minute.',
    images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'Oil Change On The Spot' }],
  },
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* 👇 This line is the key: make the whole page a flex column that fills the viewport */}
      <body className={`${barlow.variable} ${condensed.variable} min-h-dvh flex flex-col overflow-x-hidden`} style={{ fontFamily: 'var(--font-barlow), system-ui, sans-serif' }}>
        <HideOnOwner><SiteHeader /></HideOnOwner>
         {/* Optional PWA/iOS helpers */}
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="mobile-web-app-capable" content="yes" />

        {/* fills the space between navbar and footer */}
        <main className="flex-1">{children}</main>

        <HideOnOwner>
          <SiteFooter />
        </HideOnOwner>

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
      telephone: PHONE_TEL.replace('tel:', ''),
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
{/* Google Analytics 4 */}
<Script
  src="https://www.googletagmanager.com/gtag/js?id=G-LQ4FQ4CR01"
  strategy="afterInteractive"
/>

<Script id="google-analytics" strategy="afterInteractive">
  {`
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-LQ4FQ4CR01');
  `}
</Script>
      </body>
    </html>
  );
}