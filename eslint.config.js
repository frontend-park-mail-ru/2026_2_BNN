const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    files: ["eslint.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
  },

  {
    ignores: ["node_modules/**", "public/js/templates.compiled.js", "dist/**", "coverage/**"],
  },

  js.configs.recommended,

  {
    files: ["public/js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        Handlebars: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  {
    files: ["server.js", "scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
  },

  {
    rules: {
      // отключает конфликтующие с Prettier stylistic-правила
    },
    ...require("eslint-config-prettier"),
  },
];
