const KNOWN_NEON_PROD_HOST = "ep-sparkling-night-azr6wxwd";

function parseDatabaseUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return null;
    return url.hostname ? url : null;
  } catch {
    return null;
  }
}

function isProductionHost(host, env) {
  const configuredProductionHost = env.NEON_PROD_HOST?.trim().toLowerCase();
  const normalizedHost = host.toLowerCase();

  return normalizedHost.includes(KNOWN_NEON_PROD_HOST)
    || Boolean(configuredProductionHost && normalizedHost.includes(configuredProductionHost));
}

export function validateE2eDatabaseConfiguration(env) {
  const databaseUrl = env.DATABASE_URL ?? "";
  const directUrl = env.DIRECT_URL ?? "";
  const parsedDatabaseUrl = parseDatabaseUrl(databaseUrl);
  const parsedDirectUrl = parseDatabaseUrl(directUrl);
  const configuredUrls = [parsedDatabaseUrl, parsedDirectUrl].filter(Boolean);
  const productionUrl = configuredUrls.find((url) => isProductionHost(url.hostname, env));

  if (productionUrl) {
    return {
      ok: false,
      host: productionUrl.host,
      message: "Blocked: a database URL points to the production Neon branch. Set DATABASE_URL and DIRECT_URL to the isolated test branch before running E2E tests.",
    };
  }

  if ((databaseUrl && !parsedDatabaseUrl) || (directUrl && !parsedDirectUrl)) {
    return {
      ok: false,
      host: "(invalid database URL)",
      message: "DATABASE_URL and DIRECT_URL must be valid PostgreSQL URLs before running DB-backed E2E tests.",
    };
  }

  const connectionUrl = parsedDirectUrl ?? parsedDatabaseUrl;
  if (!connectionUrl) {
    return {
      ok: false,
      host: "(not configured)",
      message: "DATABASE_URL or DIRECT_URL must be set before running DB-backed E2E tests.",
    };
  }

  return { ok: true, host: connectionUrl.host };
}
