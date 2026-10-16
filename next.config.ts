import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: ws: wss:",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://www.tiktok.com",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium-min", "puppeteer-core", "@sparticuz/chromium"],
  // The certificate template reads these files at runtime with path.join(process.cwd(), ...), which Vercel's
  // file tracing cannot see. Without this the function has no font and generation fails with ENOENT.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/@fontsource/montserrat/files/montserrat-latin-800-normal.woff2",
      "./public/logo/miracle-horizontal.svg",
    ],
    // The certificate studio reads the character library images at runtime (importCharacterArtAsCertificateAssetAction).
    // Only the page that runs that action ships them; the thumbnails are served statically and stay out.
    "/**/organizer/events/*/certificates": [
      "./public/character-art/flashpeak/*.webp",
      "./public/character-art/flashpeak/*.jpg",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
    ],
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: securityHeaders,
    },
  ],
};

export default withNextIntl(nextConfig);
