import { createRequire } from "node:module";

// eslint-config-next@15 still loads its legacy Rushstack resolver patch, which
// is incompatible with ESLint 9 on Node 24. Resolve its bundled plugins from
// the package boundary and compose their supported flat configs directly.
const requireFromProject = createRequire(import.meta.url);
const requireFromNext = createRequire(requireFromProject.resolve("eslint-config-next"));
const next = requireFromNext("@next/eslint-plugin-next");
const react = requireFromNext("eslint-plugin-react");
const reactHooks = requireFromNext("eslint-plugin-react-hooks");
const jsxA11y = requireFromNext("eslint-plugin-jsx-a11y");
const typescript = requireFromNext("@typescript-eslint/eslint-plugin");
const typescriptParser = requireFromNext("@typescript-eslint/parser");

export default [
  { ignores: [".next/**", "node_modules/**", "coverage/**", "playwright-report/**", "test-results/**", "next-env.d.ts", "public/**/*.js"] },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs", "**/*.jsx", "**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    plugins: {
      "@next/next": next,
      "@typescript-eslint": typescript,
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      ...typescript.configs.recommended.rules,
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "react/no-unknown-property": "off",
      "react/prop-types": "off",
      "react/jsx-no-target-blank": "off",
      "jsx-a11y/alt-text": ["warn", { elements: ["img"], img: ["Image"] }],
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
    },
  },
  {
    files: ["**/*.test.js", "**/*.test.jsx", "**/*.test.ts", "**/*.test.tsx", "**/*.spec.js", "**/*.spec.jsx", "**/*.spec.ts", "**/*.spec.tsx"],
    rules: { "react/display-name": "off", "react-hooks/rules-of-hooks": "off" },
  },
];
