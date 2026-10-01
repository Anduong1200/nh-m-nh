import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppRuntime } from "@/components/app-runtime";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nhà Mình — Ngôi nhà nhỏ của hai đứa",
  description:
    "Ngôi nhà nhỏ và thế giới của hai đứa. Để lại một điều bé xíu cho người thương tìm thấy.",
  applicationName: "Nhà Mình",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nhà Mình",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f0e6" },
    { media: "(prefers-color-scheme: dark)", color: "#242c26" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <a className="skip-link" href="#main-content" tabIndex={0}>
          Đến nội dung chính
        </a>
        {children}
        <AppRuntime />
      </body>
    </html>
  );
}
