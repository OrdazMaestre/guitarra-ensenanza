// app/(site)/layout.tsx
import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import SiteHomeLink from "./components/SiteHomeLink";
import ThemeToggle from "./components/ThemeToggle";
import RenderIdleWarning from "./components/RenderIdleWarning";
import VercelLimitWarning from "./components/VercelLimitWarning";
import { DEPLOY_TARGET } from "./lib/deployTarget";

export const metadata: Metadata = {
  title: "Primeros Pasos con mi Guitarra",
  description: "Aprende guitarra de forma clara, visual y progresiva",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
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
        <RenderIdleWarning deployTarget={DEPLOY_TARGET} />
        <VercelLimitWarning
          deployTarget={DEPLOY_TARGET}
          enabled={process.env.SHOW_LIMIT_WARNING === '1'}
        />
        <div className="site-shell">
          <SiteHomeLink />
          {children}
        </div>
      </body>
    </html>
  );
}
