import { parse, serialize, type DefaultTreeAdapterMap } from "parse5";
import { convertHtml } from "./convert.ts";
import { decodeDataUrl, extensionForMime, type FetchImage } from "./images.ts";
import type { NetworkPolicy } from "../config.ts";
import type { RenderAsset } from "../types.ts";

type Element = DefaultTreeAdapterMap["element"];
type Node = DefaultTreeAdapterMap["node"];

/** The options of one page conversion. */
export interface PageOptions {
  /** True saves each image as an asset. False keeps every image URL. */
  downloadImages: boolean;
  /** The network rule of the configuration. Remote images need "tex-bundles,images". */
  allowNetwork: NetworkPolicy;
  /** Fetches one remote image. Omitted, a download fails with a warning. */
  fetchImage?: FetchImage;
}

/** The Markdown, its assets and the warnings of one conversion. */
export interface PageResult {
  markdown: string;
  assets: RenderAsset[];
  warnings: string[];
}


/** The elements of a parsed tree, in document order. */
function imagesIn(nodes: readonly Node[], out: Element[]): Element[] {
  for (const node of nodes) {
    if (!("tagName" in node)) continue;
    const el = node as Element;
    if (el.tagName === "img") out.push(el);
    imagesIn(el.childNodes, out);
  }
  return out;
}

function srcOf(el: Element): { value: string; index: number } | undefined {
  const index = el.attrs.findIndex((a) => a.name === "src");
  if (index === -1) return undefined;
  return { value: el.attrs[index]!.value, index };
}

/**
 * Converts one page to Markdown. An image that is a data: URL becomes an asset without a network call. A remote
 * image is saved only when downloadImages is set and the network rule allows images. Any other remote image keeps its URL.
 */
export async function convertPage(html: string, options: PageOptions): Promise<PageResult> {
  const document = parse(html);
  const assets: RenderAsset[] = [];
  const warnings: string[] = [];
  for (const el of imagesIn(document.childNodes, [])) {
    const src = srcOf(el);
    if (src === undefined) continue;
    const url = src.value;
    let fetched: { bytes: Uint8Array; mime: string } | undefined;
    if (url.startsWith("data:")) {
      if (!options.downloadImages) continue;
      fetched = decodeDataUrl(url);
    } else if (options.downloadImages && /^https?:\/\//i.test(url)) {
      if (options.allowNetwork !== "tex-bundles,images" || options.fetchImage === undefined) {
        warnings.push(`the image ${url} is not downloaded: the network rule does not allow images`);
        continue;
      }
      try {
        fetched = await options.fetchImage(url);
      } catch (err) {
        warnings.push(`the image ${url} is not downloaded: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
    }
    if (fetched === undefined) continue;
    const name = `image-${assets.length + 1}.${extensionForMime(fetched.mime)}`;
    assets.push({ name, bytes: fetched.bytes, mime: fetched.mime });
    el.attrs[src.index] = { name: "src", value: name };
  }
  const converted = convertHtml(serialize(document));
  const svgAssets: RenderAsset[] = converted.assets.map((a) => ({ name: a.name, bytes: a.data, mime: a.mediaType }));
  return { markdown: converted.markdown, assets: [...assets, ...svgAssets], warnings };
}

