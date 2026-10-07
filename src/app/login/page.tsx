import { renderLoginPage } from "./login-page-content";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; eventId?: string; returnTo?: string }>;
}) {
  return renderLoginPage(searchParams);
}
