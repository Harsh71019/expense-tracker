import query from "@tanstack/eslint-plugin-query";
import nextVitals from "eslint-config-next/core-web-vitals";

import baseConfig from "../../eslint.config.mjs";

export default [
  ...baseConfig,
  ...nextVitals,
  ...query.configs["flat/recommended"],
  {
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      // These newer compiler diagnostics are useful feedback, but they are
      // not correctness rules and currently flag supported React Hook Form
      // and controlled-input patterns.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/incompatible-library": "off"
    }
  }
];
