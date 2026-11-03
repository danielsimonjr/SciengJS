/** The pinned Mermaid version. It equals the exact devDependency of the repository. */
export const MERMAID_VERSION = "11.17.2";
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
