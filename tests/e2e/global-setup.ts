import { requireE2eDatabaseResetPermission } from "../../scripts/e2e-db-preflight.mjs";

export default async function globalSetup() {
  requireE2eDatabaseResetPermission();
}