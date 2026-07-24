import "./globals.css";
import type { Metadata } from "next";
import { Fraunces, Sora } from "next/font/google";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--font-body",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Amplifica Wealth",
    template: "%s | Amplifica Wealth",
  },
  description:
    "A system for turning consistent savings into monthly investment income. Real numbers, no promised returns. Engineer your future. Amplify your wealth. Live your way.",
  openGraph: {
    siteName: "Amplifica Wealth",
    type: "website",
  },
};

// Site-wide entity markup: who Amplifica Wealth is, for search engines and AI
// crawlers. Rendered once here so every page carries it.
const organizationSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Amplifica Wealth",
      url: siteUrl,
      slogan: "Engineer your future. Amplify your wealth. Live your way.",
      description:
        "Amplifica Wealth teaches a repeatable system for turning consistent savings and borrowed capital into monthly investment income.",
      founder: [
        { "@type": "Person", name: "Miguel Graf" },
        { "@type": "Person", name: "Jackie Tang" },
      ],
      sameAs: ["https://amplifica-wealth.beehiiv.com"],
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "Amplifica Wealth",
      publisher: { "@id": `${siteUrl}/#organization` },
    },
  ],
};

// Apply the saved theme before paint to avoid a flash of the wrong theme.
const themeScript = `(function(){try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${sora.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </head>
      <body className="bg-cream text-ink font-body">{children}</body>
    </html>
  );
}
