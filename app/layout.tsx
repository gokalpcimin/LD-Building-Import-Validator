import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'LD Building Import Validator',
  description:
    'Validate, map and prepare customer building asset data before platform import.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning on <html> and <body> only: this silences
    // mismatches in THEIR OWN attributes (e.g. class/style injected by
    // browser extensions like Grammarly or dark-mode toggles before React
    // hydrates). It does NOT suppress mismatches in any child content —
    // if a real data mismatch happens deeper in the tree, it still needs
    // fixing at the source (e.g. avoid Date.now()/Math.random() in render,
    // or guard browser-only code with useEffect).
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
