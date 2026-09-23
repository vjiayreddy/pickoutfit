import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Geist, Geist_Mono } from "next/font/google";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { AppToaster } from "@/components/pwa/app-toaster";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { getToken } from "@/lib/auth-server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Bebas_Neue({
  weight: "400",
  variable: "--font-display",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111111",
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: {
    default: "WardrobeAI",
    template: "%s · WardrobeAI",
  },
  description:
    "Photograph your clothes, build outfits with Eve, and preview try-ons on you. Start with free credits.",
  applicationName: "WardrobeAI",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "WardrobeAI",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const initialToken = await getToken();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ConvexClientProvider initialToken={initialToken}>
          {children}
          <AppToaster />
          <RegisterServiceWorker />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
