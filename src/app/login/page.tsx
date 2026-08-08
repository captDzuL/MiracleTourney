import { renderLoginPage } from "./login-page-content";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  return renderLoginPage(searchParams);
}
