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

const RULES = [
  {
    id: "R1",
    appliesTo: () => true,
    patterns: [
      {
        group: ["**/demo-store"],
        message: "[R1] Kode produksi tidak boleh memakai demo-store. File itu hanya bahan test.",
      },
    ],
  },
  {
    id: "R2",
    appliesTo: () => true,
    paths: [
      {
        name: "@/lib/actions",
        message: "[R2] Jangan impor modul lama '@/lib/actions'. Taruh action baru di src/lib/actions/<nama>-actions.ts.",
      },
    ],
  },
  {
    id: "R3",
    appliesTo: (file) => file.startsWith("src/components/"),
    paths: [
      {
        name: "@/lib/platform/repository",
        allowTypeImports: true,
        message: "[R3] Komponen tidak boleh membaca repository. Baca datanya di halaman, lalu kirim lewat props.",
      },
    ],
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
