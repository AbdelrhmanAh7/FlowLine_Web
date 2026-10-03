const locale = process.env.LHCI_LOCALE;
if (locale !== "ar" && locale !== "en") throw new Error("LHCI_LOCALE must be ar or en");

module.exports = {
  ci: {
    collect: {
      url: ["http://localhost:3100/", "http://localhost:3100/sign-in"],
      numberOfRuns: 1,
      chromePath: process.env.CHROME_PATH,
      settings: {
        extraHeaders: JSON.stringify({ Cookie: `fl_locale=${locale}` }),
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["warn", { minScore: 0.8 }],
        "categories:accessibility": ["warn", { minScore: 0.95 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        "categories:seo": ["warn", { minScore: 0.9 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: `artifacts/lighthouse/${locale}`,
    },
  },
};
