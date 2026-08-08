import { renderParticipantsPage } from "./participants-page";

export default async function ParticipantsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return renderParticipantsPage(slug);
}
