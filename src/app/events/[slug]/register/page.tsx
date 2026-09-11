import { renderEventRegistrationPage } from "./event-registration-page";

export default async function EventRegistrationPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams?: Promise<{ error?: string; success?: string }> }) {
  const { slug } = await params;
  return renderEventRegistrationPage(slug, "id", searchParams);
}
