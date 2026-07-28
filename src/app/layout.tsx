import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { Nav } from "@/components/Nav";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Torre de control · Aztec",
  description:
    "Sistema de gestión de proyectos: priorización explicable y seguimiento operativo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Suspense>
          <Nav />
        </Suspense>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-line px-4 py-4 text-center text-[11px] text-muted">
          Reto Desarrollador de Soluciones con IA · el criterio de priorización vive en{" "}
          <code className="font-mono">src/lib</code> y está cubierto por tests
        </footer>
      </body>
    </html>
  );
}
