# Remove Vercel + Neon Footer Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove only the Vercel/Neon readiness badge from the global footer while preserving the footer tagline.

**Architecture:** Keep `AppShell` as the global layout owner and remove the obsolete badge markup directly instead of hiding it. Add a focused source-level regression test consistent with the repository’s existing static UI assertions, then remove the unused icon import and English translation key.

**Tech Stack:** React 19, Next.js 15, next-intl, Vitest, TypeScript

## Global Constraints

- Remove only the shield icon and `nav.footer.ready` text from `AppShell`.
- Keep the footer container and the multi-game community tournament tagline unchanged.
- Remove imports and translation entries that become unused because of this change.
- Do not change navigation, authentication controls, locale switching, footer spacing, or other page content.

---

### Task 1: Remove the Infrastructure Status Badge

**Files:**
- Create: `src/components/shell.test.tsx`
- Modify: `src/components/shell.tsx`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `AppShell({ children }: { children: React.ReactNode })` and `nav.footer.tagline`.
- Produces: The same `AppShell` interface, with footer markup that renders only `nav.footer.tagline`.

- [ ] **Step 1: Write the failing regression test**

```tsx
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AppShell footer", () => {
  it("keeps the community tagline without the Vercel and Neon status badge", () => {
    const root = process.cwd();
    const shellSource = readFileSync(join(root, "src", "components", "shell.tsx"), "utf8");
    const enMessages = JSON.parse(readFileSync(join(root, "messages", "en.json"), "utf8"));
    const idMessages = JSON.parse(readFileSync(join(root, "messages", "id.json"), "utf8"));

    expect(shellSource).toContain('t("footer.tagline")');
    expect(shellSource).not.toContain('t("footer.ready")');
    expect(shellSource).not.toContain("ShieldCheck");
    expect(enMessages.nav.footer).toEqual({
      tagline: "Multi-game community tournament platform",
    });
    expect(idMessages.nav.footer).toEqual({
      tagline: "Platform turnamen komunitas multi-game",
    });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm test -- src/components/shell.test.tsx`

Expected: FAIL because `shell.tsx` still contains `t("footer.ready")` and `ShieldCheck`, and `messages/en.json` still contains `nav.footer.ready`.

- [ ] **Step 3: Implement the minimal removal**

In `src/components/shell.tsx`, change the icon import to:

```tsx
import { Trophy, Users } from "lucide-react";
```

Remove this badge from the footer:

```tsx
<span className="inline-flex items-center gap-1.5">
  <ShieldCheck className="h-3.5 w-3.5" />
  {t("footer.ready")}
</span>
```

In `messages/en.json`, keep only the tagline inside `nav.footer`:

```json
"footer": {
  "tagline": "Multi-game community tournament platform"
}
```

Do not alter the existing Indonesian footer object; its obsolete key has already been removed in the working tree.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `pnpm test -- src/components/shell.test.tsx`

Expected: PASS with one passing test.

- [ ] **Step 5: Run project verification**

Run: `pnpm lint`

Expected: exit code 0 with no TypeScript errors.

Run: `pnpm test`

Expected: exit code 0 with all Vitest suites passing.

- [ ] **Step 6: Review the scoped diff**

Run: `git diff -- src/components/shell.tsx src/components/shell.test.tsx messages/en.json messages/id.json`

Expected: `shell.tsx` removes only the status badge and unused icon import; the new test covers its absence; `messages/en.json` removes only `footer.ready`; unrelated existing message edits remain untouched.

- [ ] **Step 7: Commit only the task files**

```bash
git add src/components/shell.tsx src/components/shell.test.tsx messages/en.json
git commit -m "fix: remove infrastructure badge from footer"
```

