/**
 * Returns the well-formedness errors of an XML document, or an empty list. The check covers the
 * faults that a render can make: a raw `<` or `&` in text or in an attribute value, a quote fault in
 * an attribute, and an unbalanced element. It is not a full XML parser.
 */
export function xmlErrors(xml: string): string[] {
  const errors: string[] = [];
  const stack: string[] = [];
  const entity = /^&(?:[A-Za-z][A-Za-z0-9]*|#[0-9]+|#x[0-9A-Fa-f]+);/;
  const checkText = (text: string, where: string): void => {
    for (let i = text.indexOf("&"); i !== -1; i = text.indexOf("&", i + 1)) {
      if (!entity.test(text.slice(i))) errors.push(`raw & in ${where}`);
    }
    if (text.includes("<")) errors.push(`raw < in ${where}`);
  };
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    if (lt === -1) {
      checkText(xml.slice(i), "text");
      break;
    }
    checkText(xml.slice(i, lt), "text");
    if (xml.startsWith("<!--", lt)) {
      const end = xml.indexOf("-->", lt);
      if (end === -1) return [...errors, "unclosed comment"];
      i = end + 3;
      continue;
    }
    const tag = /^<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/.exec(xml.slice(lt));
    if (tag === null) return [...errors, `malformed tag at ${lt}: ${xml.slice(lt, lt + 60)}`];
    const [whole, close, name, attrs, selfClose] = tag;
    for (const a of attrs!.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      checkText(a[2] ?? a[3] ?? "", `attribute ${a[1]} of <${name}>`);
    }
    if (close === "/") {
      if (stack.pop() !== name) return [...errors, `unbalanced </${name}>`];
    } else if (selfClose !== "/") {
      stack.push(name!);
    }
    i = lt + whole!.length;
  }
  if (stack.length > 0) errors.push(`unclosed <${stack.join("> <")}>`);
  return errors;
}
