import { RegisterPageContent } from "./RegisterPageContent";

export default function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; eventId?: string }>;
}) {
  return <RegisterPageContent searchParams={searchParams} />;
}
