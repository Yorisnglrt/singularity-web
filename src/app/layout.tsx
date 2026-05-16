import type { Metadata } from "next";
import "@/styles/globals.css";
import ClientLayout from "./client-layout";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://www.singularity-oslo.no'),
  title: "SINGULARITY — Oslo's Underground Bass Collective",
  description: "Drum & bass community collective based in Oslo, Norway. Deep, neuro, experimental. Building the scene together.",
  keywords: ["drum and bass", "DnB", "Oslo", "Norway", "neurofunk", "deep", "bass music", "collective", "community"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ClientLayout>{children}</ClientLayout>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
