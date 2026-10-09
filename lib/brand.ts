/**
 * One place to rebrand. Every Together destination lives here, so no
 * component ever hardcodes a URL.
 */
export const BRAND = {
  name: "Doodle Derby",
  tagline: "You draw. Six open models race to guess it.",
  company: "Together AI",

  togetherUrl: "https://www.together.ai",
  consoleUrl: "https://api.together.ai",
  signupUrl: "https://api.together.ai/signin",
  keysUrl: "https://api.together.ai/settings/api-keys",
  modelsUrl: "https://www.together.ai/models",
  pricingUrl: "https://www.together.ai/pricing",
  docsUrl: "https://docs.together.ai",
  contactUrl: "https://www.together.ai/contact-sales",
} as const;

/** The model list and prices are a dated claim. Printed in the footer. */
export const LAST_UPDATED = "2026-10-09";
