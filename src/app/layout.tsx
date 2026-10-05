import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { BRAND } from "@/config/brand";
import { Intro } from "@/components/Intro";
import { MobileDock } from "@/components/MobileDock";
import { SearchPalette } from "@/components/SearchPalette";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { BoardProvider } from "@/components/providers/BoardProvider";
import { PracticeProvider } from "@/components/providers/PracticeProvider";
import { WalletModalProvider } from "@/components/wallet/WalletButton";
import { WalletProvider } from "@/components/wallet/WalletProvider";

const shoulders = Big_Shoulders({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-shoulders", display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-jetbrains", display: "swap" });

const title = `${BRAND.name} (${BRAND.symbol}) — ${BRAND.slogan}`;

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: { default: title, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  keywords: [BRAND.name, BRAND.symbol, "Robinhood Chain", "prediction market", "up or down", "parimutuel"],
  openGraph: {
    type: "website",
    url: BRAND.url,
    siteName: BRAND.name,
    title,
    description: BRAND.tagline,
    images: [{ url: "/brand/og.webp", width: 1200, height: 630, alt: `${BRAND.name}: ${BRAND.slogan}` }],
  },
  twitter: {
    card: "summary_large_image",
    site: BRAND.xHandle,
    title,
    description: BRAND.tagline,
    images: ["/brand/og.webp"],
  },
};

export const viewport: Viewport = { themeColor: "#efede6" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${shoulders.variable} ${instrument.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh overflow-x-hidden font-sans antialiased">
        <WalletProvider>
          <WalletModalProvider>
            <PracticeProvider>
              <BoardProvider>
                <SiteHeader />
                <div className="min-h-[70vh]">{children}</div>
                <SiteFooter />
                <MobileDock />
                <SearchPalette />
                <Intro />
              </BoardProvider>
            </PracticeProvider>
          </WalletModalProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
