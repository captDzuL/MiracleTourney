import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("Next server action export contract", () => {
  it("exposes only explicit async runtime exports that Next can compile", () => {
    const source = ts.createSourceFile("actions.ts", readFileSync("src/lib/actions.ts", "utf8"), ts.ScriptTarget.Latest, true);
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
