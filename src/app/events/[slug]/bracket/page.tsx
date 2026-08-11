import { renderBracketPage } from "./bracket-page-content";

export const dynamic = "force-dynamic";

export default async function BracketPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return renderBracketPage(slug);
}
