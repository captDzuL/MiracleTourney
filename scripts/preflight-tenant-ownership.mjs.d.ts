export type OwnershipMappingContract = {
  orphanEventOwners: Record<string, string>;
  legacyAdminUserIds: string[];
};

type PrismaCtor = new (...args: any[]) => any;

type CliOptions = {
  argv?: string[];
  PrismaClient?: PrismaCtor;
  stdout?: (...args: any[]) => void;
  stderr?: (...args: any[]) => void;
  readTextFile?: (path: string, encoding: string) => Promise<string>;
};

export function loadOwnershipMappingContract(
  mappingPath: string | null | undefined,
  readTextFile?: (path: string, encoding: string) => Promise<string>,
): Promise<OwnershipMappingContract>;

export function runTenantOwnershipPreflightCli(options?: CliOptions): Promise<0 | 1>;
