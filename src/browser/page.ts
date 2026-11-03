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
 * `{ok: true, svg}` after the SVG is shown, `{ok: false, message}` when Mermaid rejects the source, or
 * `{ok: false, internal: true, message}` when the pinned build did not load.
 */
export function mermaidPageHtml(source: string, cdnUrl: string): string {
  const render =
    'if (typeof mermaid === "undefined") { window.__sciengDone = { ok: false, internal: true, message: "the pinned Mermaid build did not load" }; return; } ' +
    'try { mermaid.initialize({ startOnLoad: false, securityLevel: "strict" }); ' +
    `const { svg } = await mermaid.render("sciengjs-render", ${scriptJson(source)}); ` +
    'const host = document.getElementById("sciengjs-diagram"); host.innerHTML = svg; ' +
    // The diagram gets the explicit size of its viewBox, so that the svg and the screenshot do not follow the page width.
    'const el = host.querySelector("svg"); const vb = el && el.viewBox && el.viewBox.baseVal; ' +
    "if (vb && vb.width > 0 && vb.height > 0) { " +
    'el.setAttribute("width", String(Math.ceil(vb.width))); el.setAttribute("height", String(Math.ceil(vb.height))); ' +
    'el.style.removeProperty("max-width"); } ' +
    "const out = el ? new XMLSerializer().serializeToString(el) : svg; " +
    "window.__sciengDone = { ok: true, svg: out }; " +
    "} catch (err) { window.__sciengDone = { ok: false, message: String((err && err.message) || err) }; }";
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${PAGE_STYLE}</style></head><body>` +
    '<div id="sciengjs-diagram"></div>' +
    `<script src="${cdnUrl}"></script>` +
    `<script>(async () => { ${render} })();</script></body></html>`
  );
}
