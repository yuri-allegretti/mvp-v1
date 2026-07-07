import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Zelo MVP V1 Demo",
  description: "Demo operacional do MVP V1 de estruturação e projeção financeira.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
