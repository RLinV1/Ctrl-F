import type { Metadata, Viewport } from "next";
import { Playfair, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const display = Playfair({ variable: "--font-display", subsets: ["latin"], axes: ["opsz"] });
const text = Source_Serif_4({ variable: "--font-text", subsets: ["latin"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: "Ctrl-F",
  description: "Ask where something is. The camera remembers where it last saw it.",
};

// The on-screen keyboard shrinks the page instead of covering it.
export const viewport: Viewport = { interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html className={`${display.variable} ${text.variable} h-full antialiased`} lang="en">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
