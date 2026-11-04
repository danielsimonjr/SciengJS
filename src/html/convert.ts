/** The HTML to Markdown converter: parse5 parses the document, and the walk emits GitHub Flavored Markdown. */
import { parse, type DefaultTreeAdapterMap } from "parse5";

type Element = DefaultTreeAdapterMap["element"];
type Text = DefaultTreeAdapterMap["textNode"];
type Node = DefaultTreeAdapterMap["node"];

/** The state of one conversion: the footnote definitions, in document order. */
interface Context {
  readonly footnotes: string[];
}

/** Elements that the walk drops with their content. */
const SKIP = new Set(["script", "style", "head", "template", "title", "noscript", "meta", "link"]);

/** Elements that flow inside a paragraph. Any other element starts a block. */
const INLINE = new Set([
  "a", "abbr", "b", "br", "cite", "code", "del", "em", "i", "img", "input", "ins", "kbd",
  "mark", "q", "s", "small", "span", "strong", "sub", "sup", "time", "u",
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
    if (isText(node) || (isElement(node) && INLINE.has(node.tagName))) {
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
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${content}\n${fence}`;
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

/** Converts an HTML document to GitHub Flavored Markdown. The output ends with one newline, or is empty. */
export function htmlToMarkdown(html: string): string {
  const document = parse(html);
  const ctx: Context = { footnotes: [] };
  const out = [...blocks(document.childNodes, ctx), ...ctx.footnotes];
  return out.length === 0 ? "" : `${out.join("\n\n")}\n`;
}
