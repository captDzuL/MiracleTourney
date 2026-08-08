import { renderStandingsPage } from "./standings-page";

export default async function StandingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return renderStandingsPage(slug);
}
