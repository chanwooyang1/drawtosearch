import type { Metadata } from "next";
import "@excalidraw/excalidraw/index.css";
import { IBM_Plex_Mono, Noto_Sans_KR, Space_Grotesk } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-display",
});

const body = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://drawtosearch.app"),
  title: {
    default: "DrawToSearch",
    template: "%s | DrawToSearch",
  },
  description:
    "Sketch a vague memory, add a hint, and turn it into image search candidates.",
  manifest: "/manifest.webmanifest",
  applicationName: "DrawToSearch",
  keywords: [
    "draw to search",
    "sketch search",
    "image search",
    "mobile pwa",
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DrawToSearch",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${display.variable} ${body.variable} ${mono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
