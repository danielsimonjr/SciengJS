/** The pinned Mermaid version. It equals the exact devDependency of the repository. */
export const MERMAID_VERSION = "11.17.2";
/** The SHA-256 of the pinned Mermaid build. The client refuses a local copy with other bytes. */
export const MERMAID_SHA256 = "581ed7d74bd9048d0e3a91363927d72ef22942d7722546b27f7cc29e35390eb8";
/** The file of the pinned Mermaid build inside the assets folder. The build copies it there. */
export const MERMAID_FILE = "mermaid.min.js";
/** The address that a page names for the pinned Mermaid build. The client answers it from the assets folder. */
export const MERMAID_CDN_URL = `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js`;

/** One pinned build that a page may name. The client fulfils its exact URL from the local file. */
export interface PinnedAsset {
  url: string;
  file: string;
  mime: string;
}

/** The pinned builds of the engine. Each entry names the URL of the CDN and the local file. */
export const PINNED_ASSETS: readonly PinnedAsset[] = [
  { url: MERMAID_CDN_URL, file: MERMAID_FILE, mime: "application/javascript" },
];

/** The pinned Plotly version. It equals the exact devDependency plotly.js-dist-min of the repository. */
export const PLOTLY_VERSION = "4.2.0";
/** The SHA-256 of the pinned Plotly build, in hex. */
export const PLOTLY_SHA256 = "fde93964a7511bfa54c5745c49b5d0e41715cbde0cc5ebeae3f9a02de0396cae";
/** The Subresource Integrity value of the pinned Plotly build. The browser refuses other bytes. */
export const PLOTLY_SRI = "sha256-/ek5ZKdRG/pUxXRcSbXQ5BcVy94Mxevq4/mgLeA5bK4=";
/** The address that a plot page names for the pinned Plotly build. */
export const PLOTLY_CDN_URL = `https://cdn.jsdelivr.net/npm/plotly.js-dist-min@${PLOTLY_VERSION}/plotly.min.js`;
