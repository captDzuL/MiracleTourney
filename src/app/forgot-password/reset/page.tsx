import { renderResetPasswordPage } from "./reset-page-content";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string; error?: string }>;
}) {
  return renderResetPasswordPage(searchParams);
}
