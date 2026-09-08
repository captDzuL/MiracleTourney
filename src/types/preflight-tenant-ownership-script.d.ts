declare module "../../../scripts/preflight-tenant-ownership.mjs" {
  export type OwnershipMappingContract = {
    orphanEventOwners: Record<string, string>;
    legacyAdminUserIds: string[];
  };

  export function loadOwnershipMappingContract(
    mappingPath: string | null | undefined,
    readTextFile?: (path: string, encoding: string) => Promise<string>,
  ): Promise<OwnershipMappingContract>;

  export function runTenantOwnershipPreflightCli(options?: {
    argv?: string[];
    PrismaClient?: new (...args: any[]) => any;
    stdout?: (...args: any[]) => void;
    stderr?: (...args: any[]) => void;
    readTextFile?: (path: string, encoding: string) => Promise<string>;
  }): Promise<0 | 1>;
}
