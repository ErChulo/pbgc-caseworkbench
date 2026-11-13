/**
 * Restricted XLSX template-preserving formula writer.
 *
 * Patches only existing normal worksheet cells in an approved XLSX template.
 * It never executes Excel/BCV, changes cell style, or creates worksheets.
 * It refuses signed/macro-enabled workbooks, array/shared formulas and absent cells.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { V1CompileReport } from "../../domain/v1/formula-compiler/compile-batch";
import { normalizeCellAddress } from "../../domain/v1/formula-compiler/reference-codec";

export type V1TemplateIssue = Readonly<{ code: string; detail: string; target?: string }>;
export type V1TemplatePatchResult =
  | Readonly<{ ok: true; workbook: Uint8Array; modified: readonly string[] }>
  | Readonly<{ ok: false; issues: readonly V1TemplateIssue[] }>;

function fail(code: string, detail: string, target?: string): V1TemplatePatchResult {
  return { ok: false, issues: [{ code, detail, ...(target ? { target } : {}) }] };
}
function attr(tag: string, key: string): string | null {
  // Keys are fixed by this parser; none are user-generated regex expressions.
  const regex = new RegExp("(?:^|\\s)" + key
    + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')", "u");
  const match = regex.exec(tag);
  return match?.[1] ?? match?.[2] ?? null;
}
function unescapeXml(value: string): string {
  const entities: Record<string,string> = {"&amp;":"&","&lt;":"<","&gt;":">","&quot;":"\"","&apos;":"'"};
  return value.replace(/&(?:amp|lt|gt|quot|apos);/g, x => entities[x] ?? x);
}
function xmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&apos;");
}
function openTags(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp("<(?:[A-Za-z_][\\w.-]*:)?" + name + "\\b[^>]*>", "gu"))].map(x => x[0]);
}
function resolveSheetParts(files: Record<string, Uint8Array>): Map<string, string> | null {
  const workbook = files["xl/workbook.xml"], rels = files["xl/_rels/workbook.xml.rels"];
  if (!workbook || !rels) return null;
  const sheetXml = strFromU8(workbook), relXml = strFromU8(rels);
  const relationships = new Map<string, string>();
  for (const tag of openTags(relXml, "Relationship")) {
    const id = attr(tag, "Id"), target = attr(tag, "Target"), type = attr(tag, "Type");
    if (!id || !target || !type?.endsWith("/worksheet")) continue;
    if (target.includes("..") || /[:?#]/u.test(target) || /^\/(?!xl\/)/u.test(target)) return null;
    const part = target.startsWith("/xl/") ? target.slice(1)
      : target.startsWith("xl/") ? target
      : "xl/" + target.replace(/^\/+/u, "");
    if (!/^xl\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.xml$/u.test(part)) return null;
    relationships.set(id, part);
  }
  const result = new Map<string, string>();
  for (const tag of openTags(sheetXml, "sheet")) {
    const name = attr(tag, "name"), id = attr(tag, "r:id");
    if (!name || !id) return null;
    const path = relationships.get(id);
    if (!path || !files[path] || result.has(unescapeXml(name).toUpperCase())) return null;
    result.set(unescapeXml(name).toUpperCase(), path);
  }
  return result.size > 0 ? result : null;
}

function patchExistingCell(xml: string, address: string, formula: string): string | null {
  const wanted = normalizeCellAddress(address);
  if (!wanted) return null;
  const cellTags = /<(?:[A-Za-z_][\w.-]*:)?c\b[^>]*>(?:[\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?c>|<(?:[A-Za-z_][\w.-]*:)?c\b[^>]*\/>/gu;
  let found = 0;
  let patched = 0;
  const result = xml.replace(cellTags, raw => {
    const opening = /^<([A-Za-z_][\w.-]*:)?c\b[^>]*>/u.exec(raw);
    if (!opening || (attr(opening[0], "r") ?? "").toUpperCase() !== wanted.toUpperCase()) return raw;
    found++;
    if (found > 1 || raw.endsWith("/>")) return raw;
    const prefix = opening[1] ?? "";
    const close = "</" + prefix + "c>";
    if (!raw.endsWith(close)) return raw;
    const inner = raw.slice(opening[0].length, -close.length);
    // Shared and array formulas require rewriting coordinated cells; never patch one in isolation.
    if (/<(?:[A-Za-z_][\w.-]*:)?f\b[^>]*\b(?:t|ref)\s*=/u.test(inner)) return raw;
    const stripped = inner
      .replace(/<(?:[A-Za-z_][\w.-]*:)?f(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?f>/gu, "")
      .replace(/<(?:[A-Za-z_][\w.-]*:)?v(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?v>/gu, "")
      .replace(/<(?:[A-Za-z_][\w.-]*:)?is(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?is>/gu, "")
      .trim();
    if (stripped !== "") return raw;
    const cellStart = opening[0].replace(/\s+t\s*=\s*(?:"[^"]*"|'[^']*')/u, "");
    patched++;
    return cellStart + "<" + prefix + "f>" + xmlText(formula) + "</" + prefix + "f>" + close;
  });
  return found === 1 && patched === 1 ? result : null;
}

/** An incomplete compilation or unsupported template yields no workbook. */
export function patchV1WorkbookTemplate(
  original: Uint8Array,
  compilation: V1CompileReport,
  requiredSheets: readonly string[] = [],
): V1TemplatePatchResult {
  if (compilation.status !== "complete" || compilation.blocked.length || compilation.issues.length || compilation.compiled.length === 0) {
    return fail("COMPILATION_NOT_COMPLETE", "A complete, approved formula compilation is required.");
  }
  if (original.length === 0 || original.length > 100 * 1024 * 1024) {
    return fail("TEMPLATE_SIZE_INVALID", "The template is absent or exceeds the approved size limit.");
  }
  let files: Record<string, Uint8Array>;
  // Filter archive entries before allocation; reject zip-bombs and large hidden parts.
  let totalUncompressed = 0;
  let rejectedEntries = 0;
  try {
    files = unzipSync(original, { filter: (entry) => {
      totalUncompressed += entry.originalSize;
      const safe = entry.originalSize <= 100 * 1024 * 1024 && totalUncompressed <= 200 * 1024 * 1024;
      if (!safe) rejectedEntries++;
      return safe;
    }});
  } catch { return fail("TEMPLATE_NOT_ZIP", "The template is not a readable OOXML archive."); }
  if (rejectedEntries) return fail("TEMPLATE_EXPANSION_LIMIT", "An archive entry exceeds the approved uncompressed limit.");

  const paths = Object.keys(files);
  if (paths.length > 15000) return fail("TEMPLATE_TOO_COMPLEX", "The archive has too many entries.");
  if (paths.some(p => p.startsWith("../") || p.includes("/../") || p.startsWith("/"))) {
    return fail("UNSAFE_ZIP_PATH", "The template contains an unsafe archive path.");
  }
  if (paths.some(p => /vbaProject|_xmlsignatures\/|encryptedPackage|digitalSignature/iu.test(p))
    || /macroEnabled|application\/vnd\.ms-excel\.sheet\.binary/iu.test(strFromU8(files["[Content_Types].xml"] ?? new Uint8Array()))) {
    return fail("UNSUPPORTED_MACROS_OR_SIGNATURES", "Signed or macro-enabled workbooks require separate approval.");
  }
  const sheets = resolveSheetParts(files);
  if (!sheets) return fail("WORKBOOK_RELATIONSHIPS_INVALID", "Physical worksheet locations cannot be verified.");
  for (const name of requiredSheets) {
    if (!sheets.has(name.toUpperCase())) return fail("REQUIRED_SHEET_MISSING", "Missing official sheet: " + name, name);
  }
  const targeted = new Set<string>();
  const modified: string[] = [];
  const changes = new Map<string, string>();
  const entries = [...compilation.compiled].sort((a,b) => a.tabName.localeCompare(b.tabName) || a.cellAddress.localeCompare(b.cellAddress));
  for (const entry of entries) {
    const key = entry.tabName.toUpperCase() + "!" + entry.cellAddress.toUpperCase();
    if (targeted.has(key)) return fail("DUPLICATE_TARGET", "Two scenario formulas target one physical workbook cell.", key);
    targeted.add(key);
    const path = sheets.get(entry.tabName.toUpperCase());
    if (!path) return fail("TARGET_SHEET_MISSING", "The target sheet does not exist.", key);
    const sheetXml = changes.get(path) ?? strFromU8(files[path]!);
    const patched = patchExistingCell(sheetXml, entry.cellAddress, entry.canonicalFormulaText);
    if (patched === null) return fail("CELL_NOT_PATCHABLE", "Target is missing, shared, or not an ordinary worksheet cell.", key);
    changes.set(path, patched);
    modified.push(key);
  }
  for (const [path, xml] of changes) files[path] = strToU8(xml);
  return { ok:true, workbook: zipSync(files, {level:6}), modified };
}
