import type { Metadata } from "next";
import { Bebas_Neue, Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
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

export const metadata: Metadata = {
  title: "WardrobeAI",
  description: "AI wardrobe and virtual try-on",
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
          <Toaster position="bottom-right" richColors closeButton />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
