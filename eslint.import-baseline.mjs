// Files that already break an import rule (see eslint.import-rules.mjs). The list may only shrink:
// fix the import, then delete the file from the list. Never add a file here to make a new import pass.
export const importBaseline = {
  // R1: demo-store in production code
  R1: [],
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
