export type MigrationCheckEnvironment = {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  SKIP_MIGRATION_CHECK?: string;
};

export type MigrationCheckDependencies = {
  listLocal?: () => string[];
  fetchApplied?: (databaseUrl: string) => Promise<string[]>;
  warn?: (message: string) => void;
};

export function listLocalMigrations(directory?: string): string[];

export function findUnappliedMigrations(
  localMigrations: readonly string[],
  appliedMigrations: readonly string[],
): string[];

export function fetchAppliedMigrations(databaseUrl: string): Promise<string[]>;

export function assertMigrationsApplied(
  env: MigrationCheckEnvironment,
  deps?: MigrationCheckDependencies,
): Promise<void>;
