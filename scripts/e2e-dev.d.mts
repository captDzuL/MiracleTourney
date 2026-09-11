import type { ChildProcess, SpawnOptions } from "node:child_process";

type SpawnImplementation = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => Pick<ChildProcess, "on">;

export function startE2eDevServer(options?: {
  cwd?: string;
  env?: Record<string, string | undefined>;
  args?: string[];
  spawnImpl?: SpawnImplementation;
}): Pick<ChildProcess, "on">;