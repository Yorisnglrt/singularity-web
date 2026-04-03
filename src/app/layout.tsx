import type { Metadata } from "next";
import "@/styles/globals.css";
import ClientLayout from "./client-layout";

export const metadata: Metadata = {
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
      </body>
    </html>
  );
}
