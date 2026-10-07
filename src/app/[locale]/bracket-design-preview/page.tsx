import Link from "next/link";
import { notFound } from "next/navigation";
import { SocialBracketBoard } from "@/components/v3/public-event/SocialBracketBoard";
import { BracketAppearanceEditor } from "@/components/v3/organizer/BracketAppearanceEditor";
import { bracketDesignFixture } from "./fixture";

export default async function BracketDesignPreview({ searchParams }: { searchParams: Promise<{ locale?: string; state?: string; view?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const locale = query.locale === "en" ? "en" : "id";
  const model = bracketDesignFixture(locale, query.state !== "live");
  return <main style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 16px" }}>
    <p style={{ marginBottom: 16, color: "#AAB7C9" }}>Contoh desain · data demo · hasil ini bukan hasil turnamen resmi.</p>
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 20, color: "#49D1EC" }}>
      <Link href="/id/bracket-design-preview">Selesai · ID</Link>
      <Link href="/id/bracket-design-preview?state=live">LIVE · ID</Link>
      <Link href="/en/bracket-design-preview?locale=en">Finished · EN</Link>
      <Link href="/id/bracket-design-preview?view=organizer">Editor background</Link>
    </nav>
    {query.view === "organizer"
      ? <BracketAppearanceEditor eventId={model.event.id} locale={locale} initial={model.appearance} previewModel={model} />
      : <SocialBracketBoard model={model} />}
  </main>;
}
