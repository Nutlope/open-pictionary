/**
 * One place to rebrand. Every Together destination lives here, so no
 * component ever hardcodes a URL.
 */
export const BRAND = {
  name: "Open Pictionary",
  tagline: "You draw. Seven open models race to guess it.",
  company: "Together AI",

  repo: "Nutlope/doodle-derby",
  repoUrl: "https://github.com/Nutlope/doodle-derby",
  makers: [
    { name: "Youssef", url: "https://github.com/Luffixos" },
    { name: "Hassan", url: "https://github.com/Nutlope" },
  ],

  togetherUrl: "https://togetherai.link/?utm_source=open-pictionary&utm_medium=referral&utm_campaign=example-app",
  consoleUrl: "https://api.together.ai",
  signupUrl: "https://api.together.ai/signin",
  keysUrl: "https://api.together.ai/settings/api-keys",
  modelsUrl: "https://www.together.ai/models",
  pricingUrl: "https://www.together.ai/pricing",
  docsUrl: "https://docs.together.ai",
  contactUrl: "https://www.together.ai/contact-sales",
} as const;
