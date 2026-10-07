import { getTranslations } from "next-intl/server";

import { LoginSubmitButton } from "@/components/v3/LoginSubmitButton";
import { Link } from "@/i18n/navigation";
import { loginAction } from "@/lib/actions";
import { getSafeReturnTo } from "@/lib/navigation/safe-return-to";

export async function renderLoginPage(
  searchParams?: Promise<{ error?: string; eventId?: string; returnTo?: string }>,
  locale?: "id" | "en",
) {
  const t = await getTranslations("login");
  const resolvedSearchParams = await searchParams;
  const returnTo = getSafeReturnTo(resolvedSearchParams?.returnTo);
  const eventId = resolvedSearchParams?.eventId && /^[A-Za-z0-9_-]+$/.test(resolvedSearchParams.eventId)
    ? resolvedSearchParams.eventId
    : undefined;
  const errorMessage =
    resolvedSearchParams?.error === "database" ? t("databaseError") : t("error");

  return (
    <div className="mx-auto w-full max-w-md">
      <section className="miracle-v3 rounded-[var(--radius-panel,16px)] border border-[color:var(--color-border,#29374A)] bg-[color:var(--color-surface,#101B2B)] p-6 shadow-[var(--elevation-panel,0_16px_40px_rgb(0_0_0_/_0.28))] sm:p-8">
        <h1 className="text-3xl font-semibold text-[color:var(--color-text,#F3EFE7)]">{t("title")}</h1>
        <p id="login-description" className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted,#AAB7C9)]">{t("description")}</p>

        {resolvedSearchParams?.error ? (
          <p role="alert" className="mt-4 rounded-[var(--radius-control,8px)] border border-red-300/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </p>
        ) : null}

        <form action={loginAction} aria-describedby="login-description" className="mt-6 space-y-5">
          {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
          {eventId ? <input type="hidden" name="eventId" value={eventId} /> : null}
          {locale ? <input type="hidden" name="locale" value={locale} /> : null}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[color:var(--color-text,#F3EFE7)]">
              {t("emailLabel")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="miracle-focus-ring mt-2 min-h-12 w-full rounded-[var(--radius-control,8px)] border border-[color:var(--color-border-strong,#647892)] bg-[color:var(--color-surface-subtle,#0C1523)] px-4 py-3 text-base text-[color:var(--color-text,#F3EFE7)] placeholder:text-[color:var(--color-text-subtle,#77869A)] sm:text-sm"
              placeholder={t("emailPlaceholder")}
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[color:var(--color-text,#F3EFE7)]">
              {t("passwordLabel")}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="miracle-focus-ring mt-2 min-h-12 w-full rounded-[var(--radius-control,8px)] border border-[color:var(--color-border-strong,#647892)] bg-[color:var(--color-surface-subtle,#0C1523)] px-4 py-3 text-base text-[color:var(--color-text,#F3EFE7)] placeholder:text-[color:var(--color-text-subtle,#77869A)] sm:text-sm"
              placeholder="........"
            />
            <Link
              href="/forgot-password"
              className="miracle-focus-ring mt-2 inline-flex min-h-11 items-center rounded-[var(--radius-control,8px)] text-sm font-medium text-[color:var(--color-accent-cyan-foreground,#49D1EC)] hover:underline"
            >
              {t("forgotPassword")}
            </Link>
          </div>
          <LoginSubmitButton label={t("submit")} pendingLabel={t("submitPending")} />
        </form>

        <p className="mt-6 text-center text-sm text-[color:var(--color-text-muted,#AAB7C9)]">
          {t("noAccount")} {" "}
          <Link href={(returnTo
            ? "/register?returnTo=" + encodeURIComponent(returnTo)
            : eventId
              ? "/register?eventId=" + encodeURIComponent(eventId)
              : "/register") as never} className="miracle-focus-ring inline-flex min-h-11 items-center rounded-[var(--radius-control,8px)] font-medium text-[color:var(--color-accent-cyan-foreground,#49D1EC)] hover:underline">
            {t("registerHere")}
          </Link>
        </p>
      </section>
    </div>
  );
}
