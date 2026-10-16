import type { MiracleV3CertificateType } from "@/lib/certificate/templates/miracle-v3-contract";

export type CertificateLocale = "id" | "en";

export const certificateTypeLabels: Record<CertificateLocale, Record<MiracleV3CertificateType, string>> = {
  en: {
    champion: "Champion",
    runner_up: "Runner-up",
    third_place: "Third Place",
    mvp: "MVP of Tournament",
    top_scorer: "Top Scorer",
    top_defender: "Top Defender",
    top_assist: "Top Assist",
  },
  id: {
    champion: "Juara",
    runner_up: "Runner-up",
    third_place: "Peringkat Ketiga",
    mvp: "MVP Turnamen",
    top_scorer: "Top Scorer",
    top_defender: "Top Defender",
    top_assist: "Top Assist",
  },
};

export function certificateTypeLabel(locale: CertificateLocale, type: string): string {
  return (certificateTypeLabels[locale] as Record<string, string>)[type] ?? type;
}
