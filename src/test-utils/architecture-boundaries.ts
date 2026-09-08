import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

export type ArchitectureViolation = {
  importer: string;
  specifier: string;
  message: string;
};

type CollectOptions = {
  rootDir?: string;
};

const MODULE_ALIAS_PREFIX = "@/modules/";

function listModuleSourceFiles(modulesDir: string): string[] {
  if (!fs.existsSync(modulesDir)) {
    return [];
  }

  return fs.readdirSync(modulesDir, { recursive: true })
    .map((entry) => path.resolve(modulesDir, String(entry)))
    .filter((filePath) => /\.tsx?$/.test(filePath) && fs.existsSync(filePath));
}

function collectImportSpecifiers(filePath: string): string[] {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);

  const specifiers: string[] = [];
  const visitNode = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
        specifiers.push(moduleSpecifier.text);
      }
    }
    ts.forEachChild(node, visitNode);
  };

  visitNode(sourceFile);
  return specifiers;
}

function isNextModule(specifier: string): boolean {
  return specifier === "next" || specifier.startsWith("next/");
}

function isAuthSessionModule(specifier: string): boolean {
  return /(^|\/)auth\/session($|\/)/.test(specifier);
}

function isRepositoryImport(specifier: string): boolean {
  return /(^|\/)repository($|\/)/.test(specifier);
}

function isActionsImport(specifier: string): boolean {
  return /(^|\/)actions($|\/)/.test(specifier);
}

function isPrismaClientImport(specifier: string): boolean {
  return specifier === "@prisma/client";
}

function isPlatformDbImport(specifier: string): boolean {
  return specifier === "@/lib/platform/db";
}

function getModuleDomain(modulesDir: string, importerFilePath: string): string | null {
  const relative = path.relative(modulesDir, importerFilePath);
  if (relative.startsWith("..")) {
    return null;
  }

  const parts = relative.split(path.sep).filter(Boolean);
  return parts[0] ?? null;
}

function resolveRelativeImport(
  modulesDir: string,
  importerFilePath: string,
  specifier: string,
): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const importerDir = path.dirname(importerFilePath);
  const resolvedBase = path.resolve(importerDir, specifier);
  const possibleTargets = [
    resolvedBase,
    `${resolvedBase}.ts`,
    `${resolvedBase}.tsx`,
    path.join(resolvedBase, "index.ts"),
    path.join(resolvedBase, "index.tsx"),
  ];

  const targetPath = possibleTargets.find((candidate) => fs.existsSync(candidate));
  if (!targetPath) {
    return null;
  }

  const relativeToModules = path.relative(modulesDir, targetPath);
  return relativeToModules.startsWith("..") ? null : targetPath;
}

export function collectArchitectureBoundaryViolations(options: CollectOptions = {}): ArchitectureViolation[] {
  const rootDir = options.rootDir ?? process.cwd();
  const modulesDir = path.resolve(rootDir, "src/modules");
  const violations: ArchitectureViolation[] = [];

  const moduleFiles = listModuleSourceFiles(modulesDir);
  if (moduleFiles.length === 0) {
    return violations;
  }

  for (const filePath of moduleFiles) {
    const fileName = path.basename(filePath);
    const fileViolations: ArchitectureViolation[] = [];
    const importSpecifiers = collectImportSpecifiers(filePath);
    const importerDomain = getModuleDomain(modulesDir, filePath);

    for (const specifier of importSpecifiers) {
      if (fileName === "policy.ts") {
        if (specifier === "@prisma/client") {
          fileViolations.push({ importer: filePath, specifier, message: "policy.ts cannot import @prisma/client" });
        }
        if (specifier === "@/lib/platform/db") {
          fileViolations.push({ importer: filePath, specifier, message: "policy.ts cannot import platform db" });
        }
        if (isRepositoryImport(specifier)) {
          fileViolations.push({ importer: filePath, specifier, message: "policy.ts cannot import repository modules" });
        }
        if (isNextModule(specifier)) {
          fileViolations.push({ importer: filePath, specifier, message: "policy.ts cannot import Next.js modules" });
        }
        if (isAuthSessionModule(specifier)) {
          fileViolations.push({ importer: filePath, specifier, message: "policy.ts cannot import auth/session modules" });
        }
      }

      if (fileName === "repository.ts") {
        if (isNextModule(specifier)) {
          fileViolations.push({ importer: filePath, specifier, message: "repository.ts cannot import Next.js modules" });
        }
        if (isActionsImport(specifier)) {
          fileViolations.push({ importer: filePath, specifier, message: "repository.ts cannot import actions modules" });
        }
        if (isAuthSessionModule(specifier)) {
          fileViolations.push({ importer: filePath, specifier, message: "repository.ts cannot import auth/session modules" });
        }
      }

      if (fileName === "queries.ts") {
        if (isPrismaClientImport(specifier)) {
          fileViolations.push({ importer: filePath, specifier, message: "queries.ts cannot import @prisma/client" });
        }
        if (isPlatformDbImport(specifier)) {
          fileViolations.push({ importer: filePath, specifier, message: "queries.ts cannot import platform db" });
        }
      }

      if (fileName === "index.ts" && isRepositoryImport(specifier)) {
        fileViolations.push({ importer: filePath, specifier, message: "module index.ts must not export ./repository" });
      }

      if (specifier.startsWith(MODULE_ALIAS_PREFIX) && importerDomain) {
        const target = specifier.slice(MODULE_ALIAS_PREFIX.length);
        const segments = target.split("/").filter(Boolean);
        const targetDomain = segments[0];
        const isCrossModule = targetDomain && targetDomain !== importerDomain;
        const isCrossModuleDeepImport = isCrossModule && segments.length > 1;

        if (isCrossModuleDeepImport) {
          fileViolations.push({
            importer: filePath,
            specifier,
            message: "Cross-module imports must use the exact public path '@/modules/<domain>'",
          });
        }
      }

      if (specifier.startsWith(".") && importerDomain) {
        const targetPath = resolveRelativeImport(modulesDir, filePath, specifier);
        if (targetPath) {
          const targetDomain = getModuleDomain(modulesDir, targetPath);
          if (targetDomain && targetDomain !== importerDomain) {
            fileViolations.push({
              importer: filePath,
              specifier,
              message: "Cross-module relative imports are forbidden; use '@/modules/<domain>'",
            });
          }
        }
      }
    }

    violations.push(...fileViolations);
  }

  return violations;
}
