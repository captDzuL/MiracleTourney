export default async function globalSetup() {
  if (process.env.E2E_DATABASE_RESET_ALLOWED !== "true") {
    throw new Error("Blocked: set E2E_DATABASE_RESET_ALLOWED=true in .env.test before running DB-backed E2E tests.");
  }
}