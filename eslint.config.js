import eslintConfig from "@iobroker/eslint-config";

export default [
  ...eslintConfig,
  {
    ignores: ["main.test.js", "lib/adapter-config.d.ts"],
  },
];
