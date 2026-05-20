// app/(site)/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Primeros Pasos con mi Guitarra",
  description: "Aprende guitarra de forma clara, visual y progresiva",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen font-sans">
        <div className="site-shell">
          {children}
        </div>
      </body>
    </html>
  );
}
