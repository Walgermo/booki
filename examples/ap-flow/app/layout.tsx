import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leverandørfaktura til betaling · Booki-eksempel",
  description:
    "Innboks, attestasjon, betalingsforslag og bankavstemming med Booki i Next.js: en vakt på serveren for hver skriving, og en agent som jobber i flyten.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nb">
      <body>{children}</body>
    </html>
  );
}
