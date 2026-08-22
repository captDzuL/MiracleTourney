export type BuildCommandResult = {
  error?: Error;
  status: number | null;
};

export type BuildCommandRunner = (
  command: string,
  args: string[],
) => BuildCommandResult;

export function runVercelBuild(
  env: { VERCEL_ENV?: string },
  runCommand?: BuildCommandRunner,
): number;
