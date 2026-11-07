/**
 * Synthetic document builders.
 *
 * These write real PDF and OOXML containers from generated content, so the
 * adapters are exercised against a genuine file structure without committing
 * any binary, any real document, or any case data. Every value is invented.
 *
 * Used by the extraction tests and by the prototype-test walkthrough, which
 * needs two sample documents a reviewer can add without preparing files first.
 * Nothing here reads a file, a case, or the network.
 */

import { strToU8, zipSync } from "fflate";

const encoder = new TextEncoder();

function byteLength(value: string): number {
  return encoder.encode(value).length;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * A minimal, valid PDF with a standard-14 font and an uncompressed content
 * stream. Each page holds the given lines, one text-show operation per line.
 */
export function createSyntheticPdf(pages: readonly (readonly string[])[]): Uint8Array {
  const objects: (string | undefined)[] = [];
  const pageIds = pages.map((_page, index) => 4 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds
    .map((id) => `${id} 0 R`)
    .join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  pages.forEach((lines, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    const body = ["BT", "/F1 12 Tf", "72 720 Td"];
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) body.push("0 -16 Td");
      body.push(`(${escapePdfText(line)}) Tj`);
    });
    body.push("ET");
    const content = body.join("\n");
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  let offset = byteLength(pdf);
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    const object = objects[id];
    if (object === undefined) continue;
    offsets[id] = offset;
    const chunk = `${id} 0 obj\n${object}\nendobj\n`;
    pdf += chunk;
    offset += byteLength(chunk);
  }

  const maxId = objects.length - 1;
  const xrefOffset = offset;
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) {
    xref += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  pdf += xref;
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return encoder.encode(pdf);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

function zip(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    entries[name] = strToU8(content);
  }
  return zipSync(entries, { level: 6 });
}

export type SyntheticDocxOptions = {
  paragraphs?: readonly string[];
  table?: readonly (readonly string[])[];
};

/**
 * A minimal DOCX container: content types, package relationships, and a body
 * with paragraphs and an optional table, all in WordprocessingML.
 */
export function createSyntheticDocx(options: SyntheticDocxOptions): Uint8Array {
  const paragraphs = options.paragraphs ?? [];
  const table = options.table ?? [];

  const paragraphXml = (text: string) =>
    `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
  const tableXml =
    table.length === 0
      ? ""
      : `<w:tbl>${table
          .map(
            (row) =>
              `<w:tr>${row
                .map((cell) => `<w:tc>${paragraphXml(cell)}</w:tc>`)
                .join("")}</w:tr>`,
          )
          .join("")}</w:tbl>`;

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${paragraphs.map(paragraphXml).join("")}${tableXml}<w:sectPr/></w:body>
</w:document>`;

  return zip({
    "[Content_Types].xml": CONTENT_TYPES,
    "_rels/.rels": ROOT_RELS,
    "word/document.xml": document,
  });
}

export type SyntheticCell =
  | string
  | number
  | null
  | { formula: string; value: number | string };

export type SyntheticXlsxOptions = {
  sheetName?: string;
  rows: readonly (readonly SyntheticCell[])[];
};

function columnName(index: number): string {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

/**
 * A minimal XLSX container with one sheet, a shared-string table, numbers, and
 * formula cells that carry a cached value.
 */
export function createSyntheticXlsx(options: SyntheticXlsxOptions): Uint8Array {
  const sheetName = options.sheetName ?? "Sheet1";
  const shared: string[] = [];
  const sharedIndex = (value: string): number => {
    const existing = shared.indexOf(value);
    if (existing >= 0) return existing;
    shared.push(value);
    return shared.length - 1;
  };

  const rowXml = options.rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) => {
          const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
          if (cell === null || cell === undefined) return "";
          if (typeof cell === "number") {
            return `<c r="${reference}"><v>${cell}</v></c>`;
          }
          if (typeof cell === "string") {
            return `<c r="${reference}" t="s"><v>${sharedIndex(cell)}</v></c>`;
          }
          return `<c r="${reference}"><f>${escapeXml(cell.formula)}</f><v>${cell.value}</v></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${rowXml}</sheetData>
</worksheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const sharedStrings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">
${shared.map((value) => `<si><t xml:space="preserve">${escapeXml(value)}</t></si>`).join("")}
</sst>`;

  return zip({
    "[Content_Types].xml": CONTENT_TYPES,
    "_rels/.rels": ROOT_RELS,
    "xl/workbook.xml": workbook,
    "xl/_rels/workbook.xml.rels": workbookRels,
    "xl/worksheets/sheet1.xml": sheet,
    "xl/sharedStrings.xml": sharedStrings,
  });
}
