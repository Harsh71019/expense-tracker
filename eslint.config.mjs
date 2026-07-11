import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      // --- AGENTS.md §2 banned patterns ---

      // Ban `any` (explicit or implicit)
      "@typescript-eslint/no-explicit-any": "error",

      // Ban `!` non-null assertions
      "@typescript-eslint/no-non-null-assertion": "error",

      // Ban `as` casts (allow `as const` and casting `unknown` after runtime check)
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        {
          assertionStyle: "never"
        }
      ],

      // Ban `@ts-ignore` (allow `@ts-expect-error` only in test files — override below)
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-expect-error": true,
          "ts-nocheck": true
        }
      ],

      // Ban `enum` — use `as const` objects instead
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSEnumDeclaration",
          message: "Use `as const` objects with union types instead of enums (AGENTS.md §2)."
        }
      ],

      // Ban `console.log` — use pino logger
      "no-console": "error",

      // Allow empty classes (NestJS modules are empty classes)
      "@typescript-eslint/no-extraneous-class": "off"
    }
  },
  // Relax `@ts-expect-error` in test files only
  {
    files: ["**/test/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-expect-error": "allow-with-description",
          "ts-nocheck": true
        }
      ]
    }
  },
  {
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-namespace": "off"
    }
  },
  // Config/migration files are CJS and not type-checked
  {
    files: ["**/*.cjs"],
    ...tseslint.configs.disableTypeChecked
  },
  {
    ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "pnpm-lock.yaml"]
  }
);
