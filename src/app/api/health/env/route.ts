import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";

const DEFAULT_JWT_SECRET = "miracle-tourney-jwt-secret-change-in-production-32chars-min";

export const dynamic = "force-dynamic";

function getJwtSecretStatus() {
  const secret = process.env.JWT_SECRET?.trim() ?? "";

  if (!secret) {
    return {
      status: "missing",
      isConfigured: false,
      length: 0,
    };
  }

  if (secret === DEFAULT_JWT_SECRET) {
    return {
      status: "default",
      isConfigured: false,
      length: secret.length,
    };
  }

  return {
    status: "set",
    isConfigured: true,
    length: secret.length,
  };
}

export async function GET() {
  const user = await requireRole("platform_admin");
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } });
  return NextResponse.json(
    {
      jwtSecret: getJwtSecretStatus(),
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      vercelEnv: process.env.VERCEL_ENV ?? "unknown",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    },
  );
}
