import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM Florencia",
  description: "CRM profesional para gestión de clientes y pipeline de ventas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <body className="h-full bg-slate-50 antialiased">{children}</body>
    </html>
  );
}
