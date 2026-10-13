import fs from "node:fs";
import path from "node:path";

import { importBaseline } from "./eslint.import-baseline.mjs";

// Import boundaries (refactor PR 0.8). docs/architecture.md explains the reasons.
//
// ESLint keeps only one `no-restricted-imports` setting per file, so the rules cannot simply be stacked with different
// exceptions. This module looks at every source file, picks the rules that apply to it and are not excused by the
// baseline, and emits one config block per distinct combination. The baseline (eslint.import-baseline.mjs) lists files
// that already break a rule. It may only shrink: fix the import, then delete the file from the list.

const SOURCE_DIR = "src";

// The data-access modules that used to be one platform/repository.ts (refactor Phase 2).
const REPOSITORY_MODULES = [
  "@/lib/platform/settings-repository",
  "@/lib/events/repository",
  "@/lib/events/visual-repository",
  "@/lib/teams/repository",
  "@/lib/bracket/repository",
  "@/lib/bracket/rounds-repository",
  "@/lib/registration/repository",
  "@/lib/registration/review-repository",
  "@/lib/imports/repository",
  "@/lib/player-stats/repository",
  "@/lib/player-stats/write-repository",
  "@/lib/certificate/repository",
  "@/lib/identity/repository",
];

const RULES = [
  {
    id: "R1",
    appliesTo: () => true,
    patterns: [
      {
        group: ["**/test-support/**", "@/test-support/**"],
        message: "[R1] Kode produksi tidak boleh memakai src/test-support. Folder itu hanya bahan test.",
      },
    ],
  },
  {
    id: "R3",
    appliesTo: (file) => file.startsWith("src/components/"),
    paths: REPOSITORY_MODULES.map((name) => ({
      name,
      allowTypeImports: true,
      message: "[R3] Komponen tidak boleh membaca repository. Baca datanya di halaman, lalu kirim lewat props.",
    })),
  },
  {
    id: "R4",
    appliesTo: (file) => file.startsWith("src/app/") || file.startsWith("src/components/"),
    paths: [
      {
        name: "@/lib/platform/db",
        message: "[R4] Halaman dan komponen tidak boleh memakai Prisma langsung. Lewat fungsi di src/lib.",
      },
    ],
  },
  {
    id: "R6",
    appliesTo: (file) => file.startsWith("src/lib/actions/"),
    paths: [
      {
        name: "@/lib/platform/db",
        message: "[R6] Server action tidak boleh memakai Prisma langsung. Taruh query-nya di file repository bidangnya.",
      },
    ],
  },
  {
    id: "R5",
    appliesTo: (file) => file.startsWith("src/lib/"),
    patterns: [
      {
        group: ["@/app/**", "@/components/**"],
        message: "[R5] Kode di src/lib tidak boleh bergantung pada halaman atau komponen.",
      },
    ],
  },
];

const isTestFile = (file) => /\.(test|spec)\.tsx?$/.test(file) || file.startsWith("src/test/");

function listSourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

// Folder names such as [locale] and [slug] are glob syntax, so exact paths must be escaped.
const escapeGlob = (file) => file.replace(/[[\]{}()!*?]/g, "\\$&");

export function importBoundaryConfigs() {
  const blocks = new Map();

  for (const file of listSourceFiles(SOURCE_DIR)) {
    if (isTestFile(file)) continue;

    const active = RULES.filter((rule) => rule.appliesTo(file) && !(importBaseline[rule.id] ?? []).includes(file));
    if (active.length === 0) continue;

    const options = {
      paths: active.flatMap((rule) => rule.paths ?? []),
      patterns: active.flatMap((rule) => rule.patterns ?? []),
    };
    const key = JSON.stringify(options);
    const block = blocks.get(key) ?? { files: [], options };
    block.files.push(escapeGlob(file));
    blocks.set(key, block);
  }

  return [...blocks.values()].map(({ files, options }) => ({
    files,
    rules: { "no-restricted-imports": ["error", options] },
  }));
}
