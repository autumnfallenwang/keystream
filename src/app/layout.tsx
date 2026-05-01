import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Keystream",
  description: "Type text into remote desktops where clipboard paste is blocked",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontVars = `${geistSans.variable} ${geistMono.variable} ${jetbrainsMono.variable} ${fraunces.variable}`;
  return (
    <html lang="en" className={`${fontVars} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
