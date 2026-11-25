import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Hind_Siliguri, Poppins, Racing_Sans_One } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const hind = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bengali",
  display: "swap",
});

const display = Racing_Sans_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wolf Clan",
  description: "Private team space for conversations, announcements, reviews and tasks.",
  applicationName: "Wolf Clan",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Wolf Clan", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/icon-192.png", sizes: "192x192" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#070B12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const theme = store.get("wolf_theme")?.value;
  const lang = store.get("wolf_lang")?.value === "bn" ? "bn" : "en";
  const resolvedTheme = theme === "light" ? "light" : "dark";
  const motion = store.get("wolf_motion")?.value === "1" ? "reduced" : "full";

  return (
    <html
      lang={lang}
      data-theme={resolvedTheme}
      data-motion={motion}
      data-lite="false"
      suppressHydrationWarning
      className={`${poppins.variable} ${hind.variable} ${display.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
