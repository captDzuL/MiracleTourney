import {
  generateBracketStaticParams,
  renderBracketPage,
} from "./bracket-page-content";

export const revalidate = 30;

export async function generateStaticParams() {
  return generateBracketStaticParams();
}

export default async function BracketPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return renderBracketPage(slug);
}
