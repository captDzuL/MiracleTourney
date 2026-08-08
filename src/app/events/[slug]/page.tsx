import { renderEventDetailPage } from "./event-detail-page";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return renderEventDetailPage(slug);
}
