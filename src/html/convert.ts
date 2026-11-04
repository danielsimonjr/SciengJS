/** The HTML to Markdown converter: parse5 parses the document, and the walk emits GitHub Flavored Markdown. */
import { parse, serializeOuter, type DefaultTreeAdapterMap } from "parse5";

type Element = DefaultTreeAdapterMap["element"];
type Text = DefaultTreeAdapterMap["textNode"];
type Node = DefaultTreeAdapterMap["node"];

/** A file that the conversion writes next to the Markdown. */
export interface Asset {
  readonly name: string;
  readonly data: Uint8Array;
  readonly mediaType: string;
}

/** The options of one conversion. */
export interface ConvertOptions {
  /** The path prefix of each asset link, for example `assets/`. The default is empty. */
  readonly assetPrefix?: string;
  /** The asset counter of the whole conversion. A caller that also names assets passes its counter, so no two names are equal. */
  readonly counter?: AssetCounter;
}

/** The count of the assets that one conversion has named. The next asset is image-(count + 1). */
export interface AssetCounter {
  count: number;
}

/** The result of one conversion: the Markdown and the assets that it links. */
export interface ConvertResult {
  readonly markdown: string;
  readonly assets: Asset[];
}

/** The state of one conversion: the footnote definitions, the assets and the link prefix. */
interface Context {
  readonly footnotes: string[];
  readonly assets: Asset[];
  readonly assetPrefix: string;
  readonly counter: AssetCounter;
  /** True while the walk is inside a table cell. */
  inCell: boolean;
}

/** The block type of a scieng page block when the page does not name it. */
const RAW_HTML = "raw-html";

/** Elements that the walk drops with their content. */
const SKIP = new Set(["script", "style", "head", "template", "title", "noscript", "meta", "link"]);

/** Elements that flow inside a paragraph. Any other element starts a block. */
const INLINE = new Set([
  "a", "abbr", "b", "br", "cite", "code", "del", "em", "i", "img", "input", "ins", "kbd",
  "mark", "q", "s", "small", "span", "strong", "sub", "sup", "time", "u", "math", "svg",
]);

/** Markdown characters that a text node escapes. */
const SPECIAL = /[\\*_`[\]<>|~$]/g;

/** An ampersand that starts an entity form: a named, decimal or hexadecimal character reference. */
const ENTITY_START = /&(?=#[0-9]+;|#[xX][0-9a-fA-F]+;|[A-Za-z][A-Za-z0-9]*;)/g;

/** A line start that Markdown reads as a block marker: a list item, a heading, a quote or a setext underline. */
const BLOCK_START = /^( *)([0-9]{1,9}(?=[.)])|[-+=#>])/;

/** The fence info text of a data-scieng-type. Any other value falls back to the inferred type. */
const BLOCK_TYPE = /^[A-Za-z0-9_+-]+$/;

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function isText(node: Node): node is Text {
  return node.nodeName === "#text";
}

function attr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

function hasClass(el: Element, name: string): boolean {
  return (attr(el, "class") ?? "").split(/\s+/).includes(name);
}

/** The element descendants of a node, in document order. */
function descendants(node: Node): Element[] {
  const out: Element[] = [];
  if ("childNodes" in node) {
    for (const child of node.childNodes) {
      if (isElement(child)) {
        out.push(child, ...descendants(child));
      }
    }
  }
  return out;
}

/** A fenced block. The fence is longer than any backtick run in the content. */
function fenced(content: string, language: string): string {
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${content}\n${fence}`;
}

/** The block type of a scieng block, from its markup, when the page does not name the type. */
function inferBlockType(el: Element): string {
  for (const inner of descendants(el)) {
    if (inner.tagName === "pre" && hasClass(inner, "mermaid")) {
      return "mermaid";
    }
    const id = attr(inner, "id") ?? "";
    if (inner.tagName === "div" && /^dot-\d+$/.test(id)) {
      return "dot";
    }
    if (hasClass(inner, "latex-block")) {
      return "latex";
    }
    if (inner.tagName === "div" && (/^plotly-\d+$/.test(id) || hasClass(inner, "plotly-static"))) {
      return "plotly";
    }
    if (hasClass(inner, "wavedrom-block")) {
      return "wavedrom";
    }
  }
  return RAW_HTML;
}

/** True for an element that the walk drops with its content, or a scieng block whose markup the walk does not read. */
export function isDropped(el: Element): boolean {
  return SKIP.has(el.tagName) || isSciengBlock(el);
}

/** True for a scieng page block: a div with the source attribute. */
function isSciengBlock(el: Element): boolean {
  return el.tagName === "div" && attr(el, "data-scieng-source") !== undefined;
}

/** The fenced block of a scieng block. Its markup is not read. The fence language is the block type. */
function sciengFence(el: Element): string {
  const named = attr(el, "data-scieng-type");
  const type = named !== undefined && BLOCK_TYPE.test(named) ? named : inferBlockType(el);
  const language = type === RAW_HTML ? "html" : type;
  return fenced(attr(el, "data-scieng-source") ?? "", language);
}

/** The TeX of a math element, from its annotation of type application/x-tex. */
function texOf(el: Element): string | undefined {
  const annotation = descendants(el).find(
    (d) => d.tagName === "annotation" && attr(d, "encoding") === "application/x-tex",
  );
  return annotation === undefined ? undefined : rawText(annotation).trim();
}

function isDisplayMath(node: Node): node is Element {
  return isElement(node) && node.tagName === "math" && attr(node, "display") === "block";
}

/** Adds the xmlns attribute to a serialized svg when it has none. */
function svgAsset(el: Element, ctx: Context): string {
  let markup = serializeOuter(el);
  if (attr(el, "xmlns") === undefined) {
    markup = markup.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  ctx.counter.count += 1;
  const name = `image-${ctx.counter.count}.svg`;
  ctx.assets.push({ name, data: new TextEncoder().encode(markup), mediaType: "image/svg+xml" });
  return `![](${ctx.assetPrefix}${name})`;
}

function escapeText(value: string): string {
  return value.replace(SPECIAL, "\\$&").replace(ENTITY_START, "\\&");
}

/**
 * Escapes the block marker at the start of each line of a run of inline Markdown.
 * A line starts at the start of the run and after each hard break. The spaces at a line start are removed.
 * A line that starts with a code span starts with a backtick, so the escape never changes code.
 */
function escapeLineStarts(text: string): string {
  return text
    .split("\\\n")
    .map((line, i) =>
      (i === 0 ? line : line.replace(/^ +/, "")).replace(BLOCK_START, (_m, sp: string, mark: string) =>
        /^[0-9]/.test(mark) ? `${sp}${mark}\\` : `${sp}\\${mark}`))
    .join("\\\n");
}

/** Inline Markdown of a run that forms one block: a paragraph, a list item or a footnote. */
function blockText(nodes: readonly Node[], ctx: Context): string {
  return escapeLineStarts(inline(nodes, ctx).trim());
}

/** A link destination. A destination with a space, a paren or an angle bracket goes in angle brackets. */
function destination(url: string): string {
  const flat = url.replace(/[\r\n]/g, (c) => encodeURIComponent(c));
  return /[\s()<>]/.test(flat) || flat === "" ? `<${flat.replace(/[<>]/g, "\\$&")}>` : flat;
}

/** Emphasis around a text. The spaces at the edges of the text move outside the markers. */
function emphasis(text: string, marker: string): string {
  const inner = text.trim();
  if (inner === "") {
    return "";
  }
  const lead = /^\s/.test(text) ? " " : "";
  const trail = /\s$/.test(text) ? " " : "";
  return `${lead}${marker}${inner}${marker}${trail}`;
}

/** A code span. The fence is longer than any backtick run. Padding keeps an edge backtick or edge spaces. */
function codeSpan(raw: string, inCell: boolean): string {
  let text = raw.replace(/\r?\n/g, " ");
  if (text === "") {
    return "";
  }
  if (inCell) {
    text = text.replace(/\|/g, "\\|");
  }
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  const allSpace = /^ +$/.test(text);
  const pad = !allSpace && (text.startsWith("`") || text.endsWith("`") || (text.startsWith(" ") && text.endsWith(" ")));
  return pad ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
}

/** The text of a node with no escape, for code. */
function rawText(node: Node): string {
  if (isText(node)) {
    return node.value;
  }
  if ("childNodes" in node) {
    return node.childNodes.map(rawText).join("");
  }
  return "";
}

/** Inline Markdown for a run of nodes. */
function inline(nodes: readonly Node[], ctx: Context): string {
  return nodes.map((node) => {
    if (isText(node)) {
      return escapeText(node.value.replace(/\s+/g, " "));
    }
    return isElement(node) ? inlineElement(node, ctx) : "";
  }).join("");
}

function inlineElement(el: Element, ctx: Context): string {
  if (SKIP.has(el.tagName)) {
    return "";
  }
  const children = () => inline(el.childNodes, ctx);
  switch (el.tagName) {
    case "strong":
    case "b":
      return emphasis(children(), "**");
    case "em":
    case "i":
      return emphasis(children(), "*");
    case "code":
      return codeSpan(rawText(el), ctx.inCell);
    case "a": {
      const href = attr(el, "href") ?? "";
      if (href.startsWith("#fnref")) {
        return "";
      }
      if (href.startsWith("#fn")) {
        return `[^${href.slice(3).replace(/^-/, "")}]`;
      }
      return href === "" ? children() : `[${children()}](${destination(href)})`;
    }
    case "img":
      return `![${escapeText((attr(el, "alt") ?? "").replace(/\s+/g, " "))}](${destination(attr(el, "src") ?? "")})`;
    case "math": {
      const tex = texOf(el);
      return tex === undefined ? escapeText(rawText(el).trim().replace(/\s+/g, " ")) : `$${tex.replace(/\s+/g, " ")}$`;
    }
    case "svg":
      return svgAsset(el, ctx);
    case "br":
      return ctx.inCell ? "<br>" : "\\\n";
    case "input":
      return "";
    default:
      return children();
  }
}

/** Block Markdown for a run of nodes. Each entry is one block. */
function blocks(nodes: readonly Node[], ctx: Context): string[] {
  const out: string[] = [];
  let run: Node[] = [];
  const flush = (): void => {
    const text = blockText(run, ctx);
    if (text !== "") {
      out.push(text);
    }
    run = [];
  };
  for (const node of nodes) {
    if (isDisplayMath(node)) {
      flush();
      const tex = texOf(node);
      out.push(tex === undefined ? rawText(node).trim() : `$$${tex}$$`);
    } else if (isText(node) || (isElement(node) && INLINE.has(node.tagName))) {
      run.push(node);
    } else if (isElement(node)) {
      flush();
      out.push(...blockElement(node, ctx));
    }
  }
  flush();
  return out;
}

function blockElement(el: Element, ctx: Context): string[] {
  if (SKIP.has(el.tagName)) {
    return [];
  }
  if (isSciengBlock(el)) {
    return [sciengFence(el)];
  }
  if (/^h[1-6]$/.test(el.tagName)) {
    const text = inline(el.childNodes, ctx).trim().replace(/\\\n/g, " ");
    return text === "" ? [] : [`${"#".repeat(Number(el.tagName[1]))} ${text}`];
  }
  switch (el.tagName) {
    case "p": {
      const text = blockText(el.childNodes, ctx);
      return text === "" ? [] : [text];
    }
    case "ul":
    case "ol":
      return [list(el, ctx)];
    case "table":
      return [table(el, ctx)];
    case "pre":
      return [codeBlock(el)];
    case "blockquote":
      return [quote(el, ctx)];
    case "hr":
      return ["---"];
    default:
      if (hasClass(el, "footnotes")) {
        collectFootnotes(el, ctx);
        return [];
      }
      return blocks(el.childNodes, ctx);
  }
}

/** True for a list item child that makes the item loose: a block that is not a nested list. */
function isLooseBlock(node: Node): boolean {
  return isElement(node) && !INLINE.has(node.tagName) && !SKIP.has(node.tagName) &&
    node.tagName !== "ul" && node.tagName !== "ol";
}

/**
 * A list. Each block of an item is indented by the width of the item marker. An item with a block other than a
 * nested list is loose: its blocks and the items of the list have a blank line between them.
 */
function list(el: Element, ctx: Context): string {
  const ordered = el.tagName === "ol";
  const startValue = Number(attr(el, "start") ?? "1");
  let number = Number.isNaN(startValue) ? 1 : startValue;
  const items: string[] = [];
  let loose = false;
  for (const item of el.childNodes) {
    if (!isElement(item) || item.tagName !== "li") {
      continue;
    }
    const marker = ordered ? `${number}. ` : "- ";
    number += 1;
    let task = "";
    const content: Node[] = [];
    for (const child of item.childNodes) {
      if (isElement(child) && child.tagName === "input" && attr(child, "type") === "checkbox") {
        task = child.attrs.some((a) => a.name === "checked") ? "[x] " : "[ ] ";
      } else {
        content.push(child);
      }
    }
    const itemLoose = content.some(isLooseBlock);
    loose ||= itemLoose;
    const indent = " ".repeat(marker.length);
    const body = blocks(content, ctx)
      .join(itemLoose ? "\n\n" : "\n")
      .split("\n")
      .map((line, i) => (i === 0 || line === "" ? line : `${indent}${line}`))
      .join("\n");
    items.push(`${marker}${task}${body}`.trimEnd());
  }
  return items.join(loose ? "\n\n" : "\n");
}

function rowsOf(el: Element): Element[] {
  const rows: Element[] = [];
  for (const child of el.childNodes) {
    if (!isElement(child)) {
      continue;
    }
    if (child.tagName === "tr") {
      rows.push(child);
    } else if (["thead", "tbody", "tfoot"].includes(child.tagName)) {
      rows.push(...rowsOf(child));
    }
  }
  return rows;
}

function alignOf(cell: Element): string {
  const style = attr(cell, "style") ?? "";
  const match = /text-align:\s*(left|right|center)/.exec(style);
  const value = attr(cell, "align") ?? match?.[1] ?? "";
  if (value === "left") {
    return ":---";
  }
  if (value === "right") {
    return "---:";
  }
  if (value === "center") {
    return ":---:";
  }
  return "---";
}

/** A GFM table. The first row is the header. */
function table(el: Element, ctx: Context): string {
  const rows = rowsOf(el);
  const cellsOf = (row: Element): Element[] =>
    row.childNodes.filter((c): c is Element => isElement(c) && (c.tagName === "th" || c.tagName === "td"));
  const header = rows[0] ? cellsOf(rows[0]) : [];
  if (header.length === 0) {
    return "";
  }
  const width = header.length;
  const cellText = (cell: Element): string => {
    ctx.inCell = true;
    try {
      return inline(cell.childNodes, ctx).trim().replace(/\s*\n\s*/g, " ");
    } finally {
      ctx.inCell = false;
    }
  };
  const line = (cells: string[]): string => {
    const padded = Array.from({ length: width }, (_, i) => cells[i] ?? "");
    return `| ${padded.join(" | ")} |`;
  };
  const out = [line(header.map(cellText)), line(header.map(alignOf))];
  for (const row of rows.slice(1)) {
    out.push(line(cellsOf(row).map(cellText)));
  }
  return out.join("\n");
}

/** A fenced code block. The fence language comes from a `language-X` class of the code element. */
function codeBlock(pre: Element): string {
  const code = pre.childNodes.find((c): c is Element => isElement(c) && c.tagName === "code");
  const language = code ? /language-(\S+)/.exec(attr(code, "class") ?? "")?.[1] ?? "" : "";
  let content = rawText(code ?? pre);
  if (content.endsWith("\n")) {
    content = content.slice(0, -1);
  }
  return fenced(content, language);
}

function quote(el: Element, ctx: Context): string {
  return blocks(el.childNodes, ctx)
    .join("\n\n")
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");
}

/** Reads the footnote definitions of a footnote container. The container itself renders nothing. */
function collectFootnotes(el: Element, ctx: Context): void {
  const visit = (node: Element): void => {
    for (const child of node.childNodes) {
      if (!isElement(child)) {
        continue;
      }
      const id = attr(child, "id") ?? "";
      if (child.tagName === "li" && id.startsWith("fn")) {
        const text = blockText(child.childNodes, ctx);
        ctx.footnotes.push(`[^${id.slice(2).replace(/^-/, "")}]: ${text}`);
      } else {
        visit(child);
      }
    }
  };
  visit(el);
}

/**
 * Converts an HTML document to GitHub Flavored Markdown and its assets.
 * The Markdown ends with one newline, or is empty.
 */
export function convertHtml(html: string, options: ConvertOptions = {}): ConvertResult {
  const document = parse(html);
  const ctx: Context = {
    footnotes: [],
    assets: [],
    assetPrefix: options.assetPrefix ?? "",
    counter: options.counter ?? { count: 0 },
    inCell: false,
  };
  const out = [...blocks(document.childNodes, ctx), ...ctx.footnotes];
  const markdown = out.length === 0 ? "" : `${out.join("\n\n")}\n`;
  return { markdown, assets: ctx.assets };
}

/** Converts an HTML document to GitHub Flavored Markdown. The assets are dropped. */
export function htmlToMarkdown(html: string, options: ConvertOptions = {}): string {
  return convertHtml(html, options).markdown;
}
