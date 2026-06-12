// app/(site)/layout.tsx
import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import SiteHomeLink from "./components/SiteHomeLink";
import ThemeToggle from "./components/ThemeToggle";

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
        <Script id="theme-init" strategy="beforeInteractive">
          {`try {
            if (localStorage.getItem('theme') === 'dark') {
              document.documentElement.setAttribute('data-theme', 'dark');
            }
          } catch (e) {}`}
        </Script>
        <ThemeToggle />
        <div className="site-shell">
          <SiteHomeLink />
          {children}
        </div>
      </body>
    </html>
  );
}
