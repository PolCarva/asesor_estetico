import type { Metadata, Viewport } from "next";
import { Familjen_Grotesk, Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { getPublicEnv } from "@asesor/config/env/public";
import { APP_NAME } from "@asesor/shared";

import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});
const familjen = Familjen_Grotesk({
  subsets: ["latin"],
  variable: "--font-familjen",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getPublicEnv().NEXT_PUBLIC_APP_URL),
  title: {
    default: `${APP_NAME} · Tu asesor de imagen personal con IA`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    "Subí tus fotos. Descubrí cómo potenciar tu imagen. Visualizá tus looks y encontrá cómo llevarlos a la realidad.",
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#efeae0",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es-UY" className={`${geist.variable} ${geistMono.variable} ${familjen.variable}`}>
      <body className="min-h-dvh">
        <a
          href="#contenido"
          className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-paper focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Saltar al contenido
        </a>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
