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
const SPECIAL = /[\\*_`[\]<>|~]/g;

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

/** True for a scieng page block: a div with the source attribute. */
function isSciengBlock(el: Element): boolean {
  return el.tagName === "div" && attr(el, "data-scieng-source") !== undefined;
}

/** The fenced block of a scieng block. Its markup is not read. The fence language is the block type. */
function sciengFence(el: Element): string {
  const type = attr(el, "data-scieng-type") ?? inferBlockType(el);
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
  const name = `image-${ctx.assets.length + 1}.svg`;
  ctx.assets.push({ name, data: new TextEncoder().encode(markup), mediaType: "image/svg+xml" });
  return `![](${ctx.assetPrefix}${name})`;
}

function escapeText(value: string): string {
  return value.replace(SPECIAL, "\\$&");
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
    case "b": {
      const text = children();
      return text.trim() === "" ? "" : `**${text}**`;
    }
    case "em":
    case "i": {
      const text = children();
      return text.trim() === "" ? "" : `*${text}*`;
    }
    case "code": {
      const text = rawText(el);
      if (text === "") {
        return "";
      }
      return text.includes("`") ? `\`\` ${text} \`\`` : `\`${text}\``;
    }
    case "a": {
      const href = attr(el, "href") ?? "";
      if (href.startsWith("#fnref")) {
        return "";
      }
      if (href.startsWith("#fn")) {
        return `[^${href.slice(3).replace(/^-/, "")}]`;
      }
      return href === "" ? children() : `[${children()}](${href})`;
    }
    case "img":
      return `![${attr(el, "alt") ?? ""}](${attr(el, "src") ?? ""})`;
    case "math": {
      const tex = texOf(el);
      return tex === undefined ? rawText(el).trim() : `$${tex}$`;
    }
    case "svg":
      return svgAsset(el, ctx);
    case "br":
      return "\\\n";
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
    const text = inline(run, ctx).trim();
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
    const text = inline(el.childNodes, ctx).trim();
    return text === "" ? [] : [`${"#".repeat(Number(el.tagName[1]))} ${text}`];
  }
  switch (el.tagName) {
    case "p": {
      const text = inline(el.childNodes, ctx).trim();
      return text === "" ? [] : [text];
    }
    case "ul":
    case "ol":
      return [list(el, ctx).join("\n")];
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

/** The lines of a list. A nested list is indented by the width of its parent marker. */
function list(el: Element, ctx: Context): string[] {
  const ordered = el.tagName === "ol";
  const startValue = Number(attr(el, "start") ?? "1");
  let number = Number.isNaN(startValue) ? 1 : startValue;
  const lines: string[] = [];
  for (const item of el.childNodes) {
    if (!isElement(item) || item.tagName !== "li") {
      continue;
    }
    const marker = ordered ? `${number}. ` : "- ";
    number += 1;
    let task = "";
    const content: Node[] = [];
    const nested: Element[] = [];
    for (const child of item.childNodes) {
      if (isElement(child) && (child.tagName === "ul" || child.tagName === "ol")) {
        nested.push(child);
      } else if (isElement(child) && child.tagName === "input" && attr(child, "type") === "checkbox") {
        task = child.attrs.some((a) => a.name === "checked") ? "[x] " : "[ ] ";
      } else {
        content.push(child);
      }
    }
    lines.push(`${marker}${task}${inline(content, ctx).trim()}`);
    for (const sub of nested) {
      for (const line of list(sub, ctx)) {
        lines.push(`${" ".repeat(marker.length)}${line}`);
      }
    }
  }
  return lines;
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
  const cellText = (cell: Element): string => inline(cell.childNodes, ctx).trim().replace(/\n/g, " ");
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
        const text = inline(child.childNodes, ctx).trim();
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
  const ctx: Context = { footnotes: [], assets: [], assetPrefix: options.assetPrefix ?? "" };
  const out = [...blocks(document.childNodes, ctx), ...ctx.footnotes];
  const markdown = out.length === 0 ? "" : `${out.join("\n\n")}\n`;
  return { markdown, assets: ctx.assets };
}

/** Converts an HTML document to GitHub Flavored Markdown. The assets are dropped. */
export function htmlToMarkdown(html: string, options: ConvertOptions = {}): string {
  return convertHtml(html, options).markdown;
}
