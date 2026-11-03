const PAGE_STYLE = "html,body{margin:0;background:#fff}";

/** Writes a value as a JavaScript literal that cannot end a script element or break a line. */
export function scriptJson(text: string): string {
  return JSON.stringify(text).replace(
    /[<>&\u2028\u2029]/g,
    (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

/** A page that shows one SVG document. The SVG text comes from the engine, not from the caller. */
export function svgPageHtml(svg: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${PAGE_STYLE}</style></head><body><div id="sciengjs-diagram">${svg}</div></body></html>`;
}

/**
 * A page that loads the pinned Mermaid build and renders one source. The result is stored in window.__sciengDone:
 * `{ok: true, svg}` after the SVG is shown, or `{ok: false, message}` when Mermaid rejects the source.
 */
export function mermaidPageHtml(source: string, cdnUrl: string): string {
  const render =
    'try { mermaid.initialize({ startOnLoad: false, securityLevel: "strict" }); ' +
    `const { svg } = await mermaid.render("sciengjs-render", ${scriptJson(source)}); ` +
    'document.getElementById("sciengjs-diagram").innerHTML = svg; ' +
    "window.__sciengDone = { ok: true, svg: svg }; " +
    "} catch (err) { window.__sciengDone = { ok: false, message: String((err && err.message) || err) }; }";
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${PAGE_STYLE}</style></head><body>` +
    '<div id="sciengjs-diagram"></div>' +
    `<script src="${cdnUrl}"></script>` +
    `<script>(async () => { ${render} })();</script></body></html>`
  );
}
