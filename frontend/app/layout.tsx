import type { Metadata } from "next";
import { Sofia_Sans } from "next/font/google";
import { Nav } from "@/components/nav";
import "./globals.css";

const sofiaSans = Sofia_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-sofia",
});

export const metadata: Metadata = {
  title: "Vitesse Bateau Paris",
  description:
    "Suivi en temps reel des exces de vitesse sur la Seine a Paris",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="dark">
      <body
        className={`${sofiaSans.variable} font-sans flex min-h-screen flex-col antialiased`}
      >
        <Nav />

        <div className="flex-1">{children}</div>

        <footer className="border-t border-input mt-12">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
            <p className="text-xs text-muted-foreground">
              Cree par Lazare Rossillon, contact a{" "}
              <a
                href="mailto:lazare.bot@gmail.com"
                className="underline hover:text-foreground transition-colors"
              >
                lazare.bot@gmail.com
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
