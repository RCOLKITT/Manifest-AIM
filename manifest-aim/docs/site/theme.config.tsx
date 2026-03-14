import type { DocsThemeConfig } from "nextra-theme-docs";

const config: DocsThemeConfig = {
  logo: <strong>Manifest AIM</strong>,
  project: {
    link: "https://github.com/RCOLKITT/Manifest-AIM",
  },
  docsRepositoryBase:
    "https://github.com/RCOLKITT/Manifest-AIM/tree/main/manifest-aim/docs/site",
  footer: {
    content: "Manifest AIM — Define it. Manifest it.",
  },
  useNextSeoProps() {
    return {
      titleTemplate: "%s – Manifest AIM",
    };
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta
        name="description"
        content="Manifest AIM — The Agent Instruction Manifest protocol for governing AI agents"
      />
      <meta name="og:title" content="Manifest AIM" />
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
