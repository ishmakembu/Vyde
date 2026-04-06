import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vide - Real-time Video Calls",
  description: "Video call with friends in real-time",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Vide",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/icon-180.png" />
      </head>
      <body className="min-h-full flex flex-col bg-bg-base text-text-primary">
        {children}
      </body>
    </html>
  );
}
