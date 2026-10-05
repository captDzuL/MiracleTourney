import React from "react";
import { BracketAppearanceEditor } from "@/components/v3/organizer/BracketAppearanceEditor";
import { readOrganizerSocialBracket } from "@/lib/bracket/read";
import { workspacePage, type WorkspacePageProps } from "@/lib/competition/workspace-page";

export default async function CompetitionPage(props: WorkspacePageProps) {
  const workspace = await workspacePage(props, "competition");
  const { locale, eventId } = await props.params;
  const model = await readOrganizerSocialBracket(eventId, locale as "id" | "en");
  return <div className="grid min-w-0 max-w-full gap-6 overflow-x-clip">
    {workspace}
    {model && <BracketAppearanceEditor eventId={eventId} locale={model.locale} initial={model.appearance} previewModel={model} />}
  </div>;
}
