// Files that already break an import rule (see eslint.import-rules.mjs). The list may only shrink:
// fix the import, then delete the file from the list. Never add a file here to make a new import pass.
export const importBaseline = {
  // R1: demo-store in production code
  R1: [],
  // R2: the old @/lib/actions module; goes away in Phase 3
  R2: [
    "src/app/admin/admin-workspace.tsx",
    "src/app/api/organizer/events/[eventId]/bracket-appearance/route.ts",
    "src/app/captain/page.tsx",
    "src/app/captain/settings/page.tsx",
    "src/app/captain/stats/page.tsx",
    "src/app/forgot-password/forgot-password-content.tsx",
    "src/app/forgot-password/reset/reset-page-content.tsx",
    "src/app/login/login-page-content.tsx",
    "src/app/register/RegisterWizard.tsx",
    "src/components/admin/EventVisualAssetsPanel.tsx",
    "src/components/registration/CaptainRegistrationWizard.tsx",
    "src/components/v3/events/EventDraftForm.tsx",
    "src/lib/actions/certificate-v3-actions.ts",
    "src/lib/actions/event-revision-actions.ts",
  ],
  // R3: components that read the repository
  R3: [],
  // R4: pages and components that use Prisma directly
  R4: [
    "src/app/api/organizer/events/[eventId]/bracket-appearance/route.ts",
  ],
  // R5: src/lib files that depend on pages or components
  R5: [
    "src/lib/competition/workspace-page.tsx",
  ],
};
