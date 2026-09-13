import { renderSchedulePage } from "./schedule-page-content";

export const dynamic = "force-dynamic";

export default async function SchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return renderSchedulePage(slug);
}
