/**
 * The HTML review page that the corpus regenerators write. Each page shows a title, an approval line and one
 * section per corpus source. The regenerators pass their sections in; this module writes the skeleton.
 */

export interface ReviewPageOptions {
  /** Used in the title element and in the first heading. */
  title: string;
  /** Plain text of the paragraph after the heading. It is escaped. */
  intro: string;
  /** Pre-built HTML of each section. The caller escapes the content of its sections. */
  sections: string[];
  /** Extra CSS rules that follow the shared rules. */
  style?: string[];
}

const SHARED_STYLE = [
  "body { font-family: sans-serif; margin: 24px; }",
  "pre { background: #f4f4f4; padding: 8px; }",
  "section { margin-bottom: 32px; }",
];

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function reviewPage(options: ReviewPageOptions): string {
  const title = escapeHtml(options.title);
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${title}</title>`,
    "<style>",
    ...SHARED_STYLE,
    ...(options.style ?? []),
    "</style>",
    "</head>",
    "<body>",
    `<h1>${title}</h1>`,
    `<p>${escapeHtml(options.intro)}</p>`,
    ...options.sections,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
