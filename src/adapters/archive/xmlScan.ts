/**
 * Minimal XML scanner for OOXML parts.
 *
 * This is not a general XML parser. OOXML writes a narrow subset — elements,
 * attributes, text, entity references, and self-closing tags — and this scanner
 * reads exactly that in one pass, without building a tree. Using one scanner in
 * both the browser and the Node tests means the parser that is tested is the
 * parser that ships.
 *
 * It deliberately does not resolve namespaces, validate a schema, or expand
 * entities beyond the five predefined ones and numeric character references.
 * Anything else is left as written rather than guessed at.
 */

export type XmlAttributes = Readonly<Record<string, string>>;

export type XmlHandlers = {
  onOpen?: (
    name: string,
    attributes: XmlAttributes,
    selfClosing: boolean,
  ) => void;
  onClose?: (name: string) => void;
  /** Called only when provided; text is entity-decoded. */
  onText?: (text: string) => void;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Decode the predefined entities and numeric character references. */
export function decodeXmlEntities(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body] ?? match;
  });
}

function findTagEnd(xml: string, start: number): number {
  let quote: string | null = null;
  for (let index = start + 1; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return index;
  }
  return -1;
}

function parseAttributes(body: string): {
  name: string;
  attributes: Record<string, string>;
} {
  let index = 0;
  while (index < body.length && !/\s/u.test(body[index] ?? "")) index += 1;
  const name = body.slice(0, index);
  const attributes: Record<string, string> = {};
  const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const attributeText = body.slice(index);
  for (const match of attributeText.matchAll(pattern)) {
    const key = match[1];
    if (!key) continue;
    attributes[key] = decodeXmlEntities(match[2] ?? match[3] ?? "");
  }
  return { name, attributes };
}

/**
 * Scan an XML document once, in order. Malformed input is not repaired: an
 * unterminated tag simply ends the scan, and the caller's required elements
 * will be absent, which the readers turn into a refusal.
 */
export function scanXml(xml: string, handlers: XmlHandlers): void {
  let index = 0;
  while (index < xml.length) {
    const nextTag = xml.indexOf("<", index);
    if (nextTag === -1) {
      const tail = xml.slice(index);
      if (handlers.onText && tail !== "") handlers.onText(decodeXmlEntities(tail));
      return;
    }
    if (nextTag > index) {
      const text = xml.slice(index, nextTag);
      if (handlers.onText && text !== "") handlers.onText(decodeXmlEntities(text));
    }

    if (xml.startsWith("<!--", nextTag)) {
      const end = xml.indexOf("-->", nextTag + 4);
      if (end === -1) return;
      index = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", nextTag)) {
      const end = xml.indexOf("]]>", nextTag + 9);
      if (end === -1) return;
      if (handlers.onText) handlers.onText(xml.slice(nextTag + 9, end));
      index = end + 3;
      continue;
    }
    if (xml.startsWith("<?", nextTag)) {
      const end = xml.indexOf("?>", nextTag + 2);
      if (end === -1) return;
      index = end + 2;
      continue;
    }
    if (xml.startsWith("<!", nextTag)) {
      // A DOCTYPE or other declaration: skip to its closing bracket.
      const end = xml.indexOf(">", nextTag + 2);
      if (end === -1) return;
      index = end + 1;
      continue;
    }

    const tagEnd = findTagEnd(xml, nextTag);
    if (tagEnd === -1) return;
    const raw = xml.slice(nextTag + 1, tagEnd).trim();
    index = tagEnd + 1;

    if (raw === "") continue;
    if (raw.startsWith("/")) {
      handlers.onClose?.(raw.slice(1).trim());
      continue;
    }
    const selfClosing = raw.endsWith("/");
    const body = selfClosing ? raw.slice(0, -1).trimEnd() : raw;
    const { name, attributes } = parseAttributes(body);
    if (name === "") continue;
    handlers.onOpen?.(name, attributes, selfClosing);
  }
}
