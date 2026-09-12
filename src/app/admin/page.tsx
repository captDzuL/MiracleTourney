import AdminWorkspace, { dynamic, maxDuration } from "./admin-workspace";

export { dynamic, maxDuration };

export default function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  return <AdminWorkspace searchParams={searchParams} />;
}
