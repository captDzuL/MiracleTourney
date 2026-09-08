import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function normalizeSource(path: string) {
  return readFileSync(path, "utf8").replace(/\s+/g, " ");
}

describe("event runtime ownership contracts", () => {
  it("legacy event-v3 action facade is wrapper-only", () => {
    const source = normalizeSource("src/lib/actions/event-v3-actions.ts");

    expect(source).toContain("export {");
    expect(source).toContain("from \"@/modules/events\"");
    expect(source).not.toContain("requireAnyRole");
    expect(source).not.toContain("prisma");
    expect(source).not.toContain("updateEventOrganizerContact(");
  });

  it("legacy actions event commands are thin delegates", () => {
    const source = normalizeSource("src/lib/actions.ts");

    expect(source).toContain("adminCreateEventActionFromModule");
    expect(source).toContain("adminUpdateEventStatusActionFromModule");
    expect(source).toContain("adminArchiveEventActionFromModule");
    expect(source).toContain("adminUpdateEventPublicInfoActionFromModule");

    expect(source).toContain("return adminCreateEventActionFromModule(formData);");
    expect(source).toContain("return adminUpdateEventStatusActionFromModule(formData);");
    expect(source).toContain("return adminArchiveEventActionFromModule(formData);");
    expect(source).toContain("return adminUpdateEventPublicInfoActionFromModule(formData);");
  });

  it("legacy event libs are compatibility facades with no active persistence imports", () => {
    const draftSource = normalizeSource("src/lib/events/event-draft.ts");
    const publishSource = normalizeSource("src/lib/events/publish-readiness.ts");
    const previewSource = normalizeSource("src/lib/events/preview-token.ts");

    for (const source of [draftSource, publishSource, previewSource]) {
      expect(source).toContain("@/modules/events/");
      expect(source).not.toContain("@/lib/platform/db");
      expect(source).not.toContain("@/lib/platform/repository");
      expect(source).not.toContain("prisma");
    }
  });
});
