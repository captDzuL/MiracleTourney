import { randomUUID } from "node:crypto";
import React from "react";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { CertificateStudio } from "@/components/v3/certificates/CertificateStudio";
import { redirectToActiveLocale } from "@/i18n/redirect";
import { requireAnyRole } from "@/lib/auth/session";
import { loadCertificateStudioState } from "@/lib/certificate/studio-repository";
import { MIRACLE_V3_CERTIFICATE_TYPES, type MiracleV3CertificateType } from "@/lib/certificate/templates/miracle-v3-contract";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getManageableEventDraft } from "@/lib/platform/repository";

type Props = { params: Promise<{ locale: string; eventId: string }> };
export default async function CertificateStudioPage({ params }: Props) {
  const { locale, eventId } = await params;
  if (locale !== "id" && locale !== "en") notFound();
  setRequestLocale(locale);
  if (!isFeatureEnabled("completion_workspace_v3")) return redirectToActiveLocale(`/organizer/events/${eventId}/overview`);
  const user = await requireAnyRole(["organizer", "platform_admin", "admin"]);
  if (!user) return redirectToActiveLocale("/login");
  if (user.role === "organizer" && user.mustChangePassword) return redirectToActiveLocale("/organizer/change-password");
  const manageable = await getManageableEventDraft(user, eventId);
  if (!manageable) notFound();
  const state = await loadCertificateStudioState({ id: manageable.id, name: manageable.name }, locale);
  const generationKeys = Object.fromEntries(MIRACLE_V3_CERTIFICATE_TYPES.map((type) => [type, randomUUID()])) as Record<MiracleV3CertificateType, string>;
  return <CertificateStudio generationKeys={generationKeys} publicationKey={randomUUID()} state={state} />;
}
