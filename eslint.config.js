// @ts-check
const eslint = require("@eslint/js");
const { defineConfig } = require("eslint/config");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

module.exports = defineConfig([
  {
    ignores: ["src/wca-api/openapiClient/**"],
  },
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      "@angular-eslint/directive-selector": [
        "error",
        {
          type: "attribute",
          prefix: "app",
          style: "camelCase",
        },
      ],
      "@angular-eslint/component-selector": [
        "error",
        {
          type: "element",
          prefix: "app",
          style: "kebab-case",
        },
      ],
      // Modern Angular patterns enforced
      "@angular-eslint/prefer-standalone": "error",
      "@angular-eslint/prefer-inject": "error",
      // Strict TypeScript typing
      "@typescript-eslint/no-explicit-any": "error",
      // Allow unused vars with underscore prefix
      "@typescript-eslint/no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }],
      // Stylistic rules
      "@typescript-eslint/array-type": "error",
      "@typescript-eslint/prefer-for-of": "error",
      // Strict prototype builtins
      "no-prototype-builtins": "error",
    },
  },
  {
    files: ["**/*.html"],
    extends: [
      angular.configs.templateRecommended,
      angular.configs.templateAccessibility,
    ],
    rules: {
      // Modern control flow syntax enforced
      "@angular-eslint/template/prefer-control-flow": "error",
      // Strict accessibility
      "@angular-eslint/template/label-has-associated-control": "error",
    },
  }
]);
