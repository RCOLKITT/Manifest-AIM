import type { DocsThemeConfig } from "nextra-theme-docs";

const config: DocsThemeConfig = {
  logo: (
    <>
      <img src="/logo.svg" alt="Manifest AIM" style={{ height: 28, marginRight: 8 }} />
      <strong>Manifest AIM</strong>
    </>
  ),
  project: {
    link: "https://github.com/RCOLKITT/Manifest-AIM",
  },
  docsRepositoryBase:
    "https://github.com/RCOLKITT/Manifest-AIM/tree/main/manifest-aim/docs/site",
  footer: {
    content: "Manifest AIM — Define it. Manifest it.",
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta
        name="description"
        content="Manifest AIM — The Agent Instruction Manifest protocol for governing AI agents"
      />
      <meta name="og:title" content="Manifest AIM" />
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon.svg" />
    </>
  ),
  sidebar: {
    defaultMenuCollapseLevel: 1,
    toggleButton: true,
  },
  toc: {
    backToTop: true,
  },
};

export default config;
