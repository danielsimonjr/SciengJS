import { describe, expect, test } from "bun:test";
import { escapeHtml, reviewPage } from "../support/review-page.ts";

describe("escapeHtml", () => {
  test("escapes the four characters that change markup", () => {
    expect(escapeHtml(`a & b < c > d "e"`)).toBe("a &amp; b &lt; c &gt; d &quot;e&quot;");
  });

  test("leaves a single quote and plain text alone", () => {
    expect(escapeHtml("it's plain")).toBe("it's plain");
  });
});

describe("reviewPage", () => {
  test("writes the skeleton of the regenerators, byte for byte", () => {
    const page = reviewPage({
      title: "Mermaid native layouts: corpus review",
      intro: "Approval status: 0 of 2 sources approved.",
      sections: ["<section>\n<h2>a.mmd</h2>\n</section>", "<section>\n<h2>b.mmd</h2>\n</section>"],
    });
    expect(page).toBe(
      [
        "<!DOCTYPE html>",
        '<html lang="en">',
        "<head>",
        '<meta charset="utf-8">',
        "<title>Mermaid native layouts: corpus review</title>",
        "<style>",
        "body { font-family: sans-serif; margin: 24px; }",
        "pre { background: #f4f4f4; padding: 8px; }",
        "section { margin-bottom: 32px; }",
        "</style>",
        "</head>",
        "<body>",
        "<h1>Mermaid native layouts: corpus review</h1>",
        "<p>Approval status: 0 of 2 sources approved.</p>",
        "<section>\n<h2>a.mmd</h2>\n</section>",
        "<section>\n<h2>b.mmd</h2>\n</section>",
        "</body>",
        "</html>",
        "",
      ].join("\n"),
    );
  });

  test("appends extra style lines after the shared ones", () => {
    const page = reviewPage({ title: "T", intro: "I", sections: [], style: ["svg { max-width: 100%; }"] });
    expect(page).toContain("section { margin-bottom: 32px; }\nsvg { max-width: 100%; }\n</style>");
  });

  test("escapes the title and the intro", () => {
    const page = reviewPage({ title: "a<b", intro: "x & y", sections: [] });
    expect(page).toContain("<title>a&lt;b</title>");
    expect(page).toContain("<h1>a&lt;b</h1>");
    expect(page).toContain("<p>x &amp; y</p>");
  });

  test("ends with one newline", () => {
    expect(reviewPage({ title: "T", intro: "I", sections: [] }).endsWith("</html>\n")).toBe(true);
  });
});
