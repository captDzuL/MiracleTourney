import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { collectArchitectureBoundaryViolations } from "./test-utils/architecture-boundaries";

function withFixtureWorkspace(files: Record<string, string>, testFn: (workspaceRoot: string) => void) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "architecture-boundaries-"));

  for (const [relativePath, source] of Object.entries(files)) {
    const fullPath = path.join(workspaceRoot, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, source);
  }

  try {
    testFn(workspaceRoot);
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

describe("architecture boundaries", () => {
  it("passes when src/modules is absent", () => {
    expect(collectArchitectureBoundaryViolations()).toEqual([]);
  });

  it("allows policy imports that stay inside the same module", () => {
    withFixtureWorkspace(
      {
        "src/modules/events/policy.ts": 'import { helper } from "./helper";\nexport const run = () => helper();\n',
        "src/modules/events/helper.ts": "export const helper = () => 1;\n",
      },
      (workspaceRoot) => {
        const violations = collectArchitectureBoundaryViolations({ rootDir: workspaceRoot });

        expect(violations).toEqual([]);
      },
    );
  });

  it("flags forbidden policy layer imports", () => {
    withFixtureWorkspace(
      {
        "src/modules/events/policy.ts": [
          'import { PrismaClient } from "@prisma/client";',
          'import { db } from "@/lib/platform/db";',
          'import { repo } from "@/modules/events/repository";',
          'import { headers } from "next/headers";',
          'import { session } from "@/lib/auth/session";',
          "export const value = [PrismaClient, db, repo, headers, session].length;",
        ].join("\n"),
      },
      (workspaceRoot) => {
        const violations = collectArchitectureBoundaryViolations({ rootDir: workspaceRoot });
        const specifiers = violations.map((violation) => violation.specifier);

        expect(specifiers).toContain("@prisma/client");
        expect(specifiers).toContain("@/lib/platform/db");
        expect(specifiers).toContain("@/modules/events/repository");
        expect(specifiers).toContain("next/headers");
        expect(specifiers).toContain("@/lib/auth/session");
      },
    );
  });

  it("flags forbidden repository layer imports", () => {
    withFixtureWorkspace(
      {
        "src/modules/events/repository.ts": [
          'import { headers } from "next/headers";',
          'import { action } from "@/lib/actions";',
          'import { session } from "@/lib/auth/session";',
          "export const value = [headers, action, session].length;",
        ].join("\n"),
      },
      (workspaceRoot) => {
        const violations = collectArchitectureBoundaryViolations({ rootDir: workspaceRoot });
        const specifiers = violations.map((violation) => violation.specifier);

        expect(specifiers).toContain("next/headers");
        expect(specifiers).toContain("@/lib/actions");
        expect(specifiers).toContain("@/lib/auth/session");
      },
    );
  });

  it("allows cross-module imports through the public module path", () => {
    withFixtureWorkspace(
      {
        "src/modules/events/policy.ts": 'import { teamsApi } from "@/modules/teams";\nexport const run = () => teamsApi;\n',
      },
      (workspaceRoot) => {
        const violations = collectArchitectureBoundaryViolations({ rootDir: workspaceRoot });

        expect(violations).toEqual([]);
      },
    );
  });

  it("forbids deep cross-module imports", () => {
    withFixtureWorkspace(
      {
        "src/modules/events/policy.ts": 'import { teamRepo } from "@/modules/teams/repository";\nexport const run = () => teamRepo;\n',
      },
      (workspaceRoot) => {
        const violations = collectArchitectureBoundaryViolations({ rootDir: workspaceRoot });
        const deepImportViolation = violations.find(
          (violation) => violation.specifier === "@/modules/teams/repository" && violation.message.includes("exact public path"),
        );

        expect(deepImportViolation).toBeDefined();
      },
    );
  });

  it("passes when src/modules has no violations", () => {
    withFixtureWorkspace(
      {
        "src/modules/events/policy.ts": 'import { helper } from "./helper";\nimport { teamsApi } from "@/modules/teams";\nexport const run = () => helper() + String(teamsApi).length;\n',
        "src/modules/events/helper.ts": "export const helper = () => 1;\n",
        "src/modules/events/repository.ts": 'import { helper } from "./helper";\nexport const repository = () => helper();\n',
      },
      (workspaceRoot) => {
        const violations = collectArchitectureBoundaryViolations({ rootDir: workspaceRoot });

        expect(violations).toEqual([]);
      },
    );
  });

  it("flags module barrels that re-export repository internals", () => {
    withFixtureWorkspace(
      {
        "src/modules/events/index.ts": 'export * from "./queries";\nexport * from "./repository";\n',
      },
      (workspaceRoot) => {
        const violations = collectArchitectureBoundaryViolations({ rootDir: workspaceRoot });
        const barrelViolation = violations.find(
          (violation) => violation.specifier === "./repository" && violation.message.includes("must not export ./repository"),
        );

        expect(barrelViolation).toBeDefined();
      },
    );
  });

  it("flags query layer imports of prisma and platform db", () => {
    withFixtureWorkspace(
      {
        "src/modules/events/queries.ts": [
          'import { prisma } from "@/lib/platform/db";',
          'import { PrismaClient } from "@prisma/client";',
          "export const run = () => [prisma, PrismaClient].length;",
        ].join("\n"),
      },
      (workspaceRoot) => {
        const violations = collectArchitectureBoundaryViolations({ rootDir: workspaceRoot });
        const specifiers = violations.map((violation) => violation.specifier);

        expect(specifiers).toContain("@/lib/platform/db");
        expect(specifiers).toContain("@prisma/client");
      },
    );
  });
});
