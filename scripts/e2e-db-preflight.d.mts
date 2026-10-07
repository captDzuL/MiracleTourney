export function requireE2eDatabaseResetPermission(
  env?: Record<string, string | undefined>,
): void;

export function validateE2eDatabaseConfiguration(
  env: Record<string, string | undefined>,
): {
  ok: boolean;
  host: string;
  message?: string;
};
