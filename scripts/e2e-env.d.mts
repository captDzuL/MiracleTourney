export const E2E_DATABASE_ENVIRONMENT_KEYS: string[];

export function loadE2eEnvironment(options?: {
  cwd?: string;
  env?: Record<string, string | undefined>;
}): Record<string, string | undefined>;
