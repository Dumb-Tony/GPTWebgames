import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: {
      default: "Moon Goons",
      template: "%s | Moon Goons",
    },
    description:
      "A cooperative space extraction game about bad science, worse equipment, and getting back to the ship.",
    applicationName: "Moon Goons",
    keywords: ["browser game", "space game", "extraction game", "Moon Goons"],
    openGraph: {
      title: "Moon Goons",
      description: "Bad science. Worse equipment. One last trip to the ship.",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1680, height: 945, alt: "Moon Goons key art" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Moon Goons",
      description: "Bad science. Worse equipment. One last trip to the ship.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
