import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("Next server action export contract", () => {
  // Every file that starts with "use server" turns each export into an endpoint, so each one must hold async functions and types only.
  const serverActionFiles = readdirSync("src/lib/actions")
    .filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map(name => `src/lib/actions/${name}`)
    .filter(file => /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use server["']/.test(readFileSync(file, "utf8")));

  it("finds the server action modules that came out of the old actions.ts", () => {
    for (const name of ["identity", "event", "event-visual", "registration", "import", "team", "match", "certificate"]) {
      expect(serverActionFiles).toContain(`src/lib/actions/${name}-actions.ts`);
    }
  });

  it.each(serverActionFiles)("%s exposes only explicit async runtime exports that Next can compile", file => {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const unsupported = source.statements.flatMap(statement => {
      if (ts.isExportDeclaration(statement)) return statement.isTypeOnly ? [] : [statement.getText(source)];
      if (!ts.canHaveModifiers(statement) || !ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) return [];
      if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) return [];
      return ts.isFunctionDeclaration(statement) && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword) ? [] : [statement.getText(source)];
    });
    expect(unsupported).toEqual([]);
  });

  it("keeps the certificate v3 server module limited to async actions", () => {
    const source = ts.createSourceFile(
      "certificate-v3-actions.ts",
      readFileSync("src/lib/actions/certificate-v3-actions.ts", "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const unsupported = source.statements.flatMap(statement => {
      if (ts.isExportDeclaration(statement)) return statement.isTypeOnly ? [] : [statement.getText(source)];
      if (!ts.canHaveModifiers(statement) || !ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) return [];
      if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) return [];
      return ts.isFunctionDeclaration(statement) && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword) ? [] : [statement.getText(source)];
    });

    expect(unsupported).toEqual([]);
    const rateLimitSource = readFileSync("src/lib/actions/certificate-v3-rate-limit.ts", "utf8");
    expect(rateLimitSource).not.toMatch(/^\s*["']use server["'];/m);
  });
});
