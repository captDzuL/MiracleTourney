import { renderForgotPasswordPage } from "./forgot-password-content";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{ sent?: string; error?: string }>;
}) {
  return renderForgotPasswordPage(searchParams);
}
