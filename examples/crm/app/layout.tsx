import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Salg · Booki-eksempel",
  description:
    "Salgsløp, avtaleverdi med kilde, aktiviteter, prognose, konvertering, tid i fase og løpende inntekter med Booki i Next.js, med en vakt på serveren for hver skriving og en agent som gjør vanlige salgsoppgaver.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nb">
      <body>{children}</body>
    </html>
  );
}
