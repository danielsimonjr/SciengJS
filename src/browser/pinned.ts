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

/** The pinned Three.js version. It equals the exact devDependency three of the repository. */
export const THREE_VERSION = "0.187.0";
/** The CDN folder of the pinned Three.js package. Every module URL starts with it. */
export const THREE_CDN_BASE = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/`;

/** One pinned Three.js module: its URL, its file in the assets folder, its MIME type and its hashes. */
export interface ThreeModule {
  /** The path inside the package, for example build/three.module.js. */
  path: string;
  url: string;
  file: string;
  mime: string;
  /** The SHA-256 in hex. The client refuses a local copy with other bytes. */
  sha256: string;
  /** The Subresource Integrity value. The browser refuses other bytes. */
  sri: string;
}

/**
 * The modules that the viewer page loads. The GLTFLoader imports the two utility modules by relative path, and
 * three.module.js imports three.core.js by relative path, so six files are pinned.
 */
export const THREE_MODULES: readonly ThreeModule[] = [
  { path: "build/three.module.js", url: `${THREE_CDN_BASE}build/three.module.js`, file: "three.module.js", mime: "text/javascript", sha256: "104f56145899722094556490d787aae0617cc2fc3382f31df02d724ea1aee341", sri: "sha256-EE9WFFiZciCUVWSQ14eq4GF8wvwzgvMd8C1yTqGu40E=" },
  { path: "build/three.core.js", url: `${THREE_CDN_BASE}build/three.core.js`, file: "three.core.js", mime: "text/javascript", sha256: "613e370f76638fdef83926642bf256dc9615684922de1ce1f63a8583e5d78578", sri: "sha256-YT43D3Zjj974OSZkK/JW3JYVaEki3hzh9jqFg+XXhXg=" },
  { path: "examples/jsm/controls/OrbitControls.js", url: `${THREE_CDN_BASE}examples/jsm/controls/OrbitControls.js`, file: "three.OrbitControls.js", mime: "text/javascript", sha256: "e7fca2fe9e7670a828af9b28084669a5909445b7f36f1f26cee9bf8f2961c32c", sri: "sha256-5/yi/p52cKgor5soCEZppZCURbfzbx8mzum/jylhwyw=" },
  { path: "examples/jsm/loaders/GLTFLoader.js", url: `${THREE_CDN_BASE}examples/jsm/loaders/GLTFLoader.js`, file: "three.GLTFLoader.js", mime: "text/javascript", sha256: "532ac726e120039acbcd6cf54328c57acbf7b438176afaa6951257126d11bff1", sri: "sha256-UyrHJuEgA5rLzWz1QyjFesv3tDgXavqmlRJXEm0Rv/E=" },
  { path: "examples/jsm/utils/BufferGeometryUtils.js", url: `${THREE_CDN_BASE}examples/jsm/utils/BufferGeometryUtils.js`, file: "three.BufferGeometryUtils.js", mime: "text/javascript", sha256: "7bda2a8ba836b2bcf67cb938d4b9e1bb5d1b1bc616817103ed858c0b58296ce7", sri: "sha256-e9oqi6g2srz2fLk41Lnhu10bG8YWgXED7YWMC1gpbOc=" },
  { path: "examples/jsm/utils/SkeletonUtils.js", url: `${THREE_CDN_BASE}examples/jsm/utils/SkeletonUtils.js`, file: "three.SkeletonUtils.js", mime: "text/javascript", sha256: "b1632a703206c3d830de9fcbe515696770d04b71a15ee6b50afa6d2c3298c86f", sri: "sha256-sWMqcDIGw9gw3p/L5RVpZ3DQS3GhXua1CvptLDKYyG8=" },
];

/** The URL of the three module. The import map of the viewer page maps the bare name three to it. */
export const THREE_MAIN_URL = THREE_MODULES[0]!.url;
