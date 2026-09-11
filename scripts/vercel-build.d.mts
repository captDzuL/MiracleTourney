export type BuildCommandResult = {
  error?: Error;
  status: number | null;
};

export type BuildCommandRunner = (
  command: string,
  args: string[],
) => BuildCommandResult;

export type VercelBuildEnvironment = {
  VERCEL_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
  VERCEL_GIT_PULL_REQUEST_ID?: string;
  VERCEL_GIT_REPO_ID?: string;
  VERCEL_TARGET_ENV?: string;
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  NEON_PROD_HOST?: string;
};

export function assertVercelBuildDatabaseSafety(env: VercelBuildEnvironment): void;

export function runVercelBuild(
  env: VercelBuildEnvironment,
  runCommand?: BuildCommandRunner,
): number;