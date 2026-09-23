import type { Metadata, Viewport } from "next";
import { Space_Grotesk, DM_Sans, JetBrains_Mono } from "next/font/google";
import { Navbar } from "@/components/Navbar";
import { LanguageProvider } from "@/components/LanguageProvider";
import { CurrencyProvider } from "@/components/CurrencyProvider";
import { SiteFooter } from "@/components/SiteFooter";
import { prisma } from "@/lib/db";
import { publicPhone } from "@/lib/shopContact";
import "./globals.css";

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "AXON.MK — Custom PC Assembly North Macedonia",
  description:
    "Pre-built gaming PCs and custom PC builder with COD delivery in North Macedonia. English · Albanian · Macedonian.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LanguageProvider>
          <CurrencyProvider>
            <Navbar />
            <main className="flex-1">{children}</main>
            <SiteFooter
              companyName={settings?.companyName?.trim() || "AXON.MK"}
              phone={publicPhone(settings?.supportPhone)}
              viber={publicPhone(settings?.supportViber)}
            />
          </CurrencyProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
