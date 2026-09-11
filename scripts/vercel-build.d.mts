export type BuildCommandResult = {
  error?: Error;
  status: number | null;
};

export type BuildCommandRunner = (
  command: string,
  args: string[],
) => BuildCommandResult;

export function runVercelBuild(
  env: {
    VERCEL_ENV?: string;
    VERCEL_GIT_COMMIT_REF?: string;
    VERCEL_GIT_PULL_REQUEST_ID?: string;
    VERCEL_GIT_REPO_ID?: string;
    VERCEL_TARGET_ENV?: string;
  },
  runCommand?: BuildCommandRunner,
): number;
