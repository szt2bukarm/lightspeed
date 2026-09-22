import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lightspeed",
  icons: {
    icon: ["/favicon.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-[#090a0f] text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
