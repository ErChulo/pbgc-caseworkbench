import { BSRS_FUNCTION_NAMES } from "./bsrs-functions.js";

export const BSRS_MODULE_ID = "bsrs-config-builder";
export const BSRS_MODULE_VERSION = "0.7.0";

export const POSITIVE_RESIDUAL_GUARD =
  "@ISDATE(LS_EST_DATE) AND LS_EST_AMT>0 AND LS_TERM>LS_EST_AMT AND LS_TERM>0";

export const RECOMMENDED_BSRS_FIELDS = [
  "ID",
  "RETSTAT",
  "DOB",
  "DOD",
  "DOH",
  "DOP",
  "DOTE",
  "DOPT",
  "DOR",
  "SBCD",
  "D050",
  "I030",
  "I046",
  "I049",
  "CALC_INDICATOR",
  "FORM_CODE",
  "FORM_CODE_ARD",
  "ANNUITY_TYPE",
  "VP",
  "PA_AMB",
  "VB",
  "XRD_PMB",
  "XRD_MB_TERM",
  "XRD_SURV_MB_TERM",
  "XRD_MB_4022C",
  "TERM_MB_ARD_FF",
  "TERM_MB_NSF",
  "N359",
  "T061",
  "T062",
  "LS_EST_DATE",
  "LS_EST_AMT",
  "LS_TERM",
  "ERF_XRD",
  "LRF_XRD",
  "BFCF_XRD"
];

export const BSRS_RULES = [
  {
    id: "bsrs-ls-positive-residual-guard",
    title: "Strict positive residual LS guard",
    family: "residualLS",
    mode: "patch",
    description: "Adds LS_EST_AMT>0 where residual LS logic only checks LS_TERM>LS_EST_AMT.",
    required_fields: ["LS_EST_DATE", "LS_EST_AMT", "LS_TERM"],
    applies_when: POSITIVE_RESIDUAL_GUARD,
    tests: ["positive-residual", "zero-estimated-lump-sum", "patch-isolation"]
  },
  {
    id: "bsrs-blank-annuity-type-guard",
    title: "Blank ANNUITY_TYPE does not route as optional form",
    family: "optionalForms",
    mode: "patch",
    description: "Adds ANNUITY_TYPE<>\"\" before optional-form exclusion checks.",
    required_fields: ["ANNUITY_TYPE"],
    applies_when: 'ANNUITY_TYPE<>"" AND ANNUITY_TYPE<>"0" AND ANNUITY_TYPE<>"1"',
    tests: ["blank-annuity-type"]
  },
  {
    id: "bsrs-dedup-residual-date-routing",
    title: "Avoid duplicate residual blocks for combined I049 dates",
    family: "residualLS",
    mode: "patch",
    description: "Narrows known combined-date residual criteria so duplicate date blocks do not print.",
    required_fields: ["I049", "LS_EST_DATE", "LS_EST_AMT", "LS_TERM"],
    applies_when: POSITIVE_RESIDUAL_GUARD,
    tests: ["duplicate-residual-blocks"]
  }
];

export function parseBsrsConfig(text) {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = normalized.length ? normalized.split("\n") : [];
  return rawLines.map((raw, index) => {
    const fields = raw.split("\t");
    const padded = [...fields];
    while (padded.length < 6) padded.push("");
    return {
      line_number: index + 1,
      raw,
      fields: padded.slice(0, 6),
      criteria: padded[0] ?? "",
      label: padded[1] ?? "",
      text_expression: padded[2] ?? "",
      detail_expression: padded[3] ?? "",
      style1: padded[4] ?? "",
      style2: padded[5] ?? "",
      tab_count: fields.length - 1
    };
  });
}

export function serializeBsrsLines(lines) {
  return lines.map((line) => line.raw).join("\n");
}

export function parseCsvText(text) {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (normalized[i + 1] === "\"") {
          cell += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === "\"") {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  const headers = rows.shift()?.map((header) => header.trim()) ?? [];
  return rows
    .filter((cells) => cells.some((value) => String(value ?? "").trim()))
    .map((cells) =>
      Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))
    );
}

export function parsePopulation(text, fileName = "") {
  const raw = String(text ?? "").trim();
  if (!raw) return { rows: [], fields: [], missing_recommended_fields: [...RECOMMENDED_BSRS_FIELDS] };
  let rows;
  if (/\.json$/i.test(fileName) || raw.startsWith("{") || raw.startsWith("[")) {
    const parsed = JSON.parse(raw);
    rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.rows) ? parsed.rows : [parsed];
  } else {
    rows = parseCsvText(raw);
  }
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row ?? {})))].sort();
  const upperFields = new Set(fields.map((field) => field.toUpperCase()));
  const missing = RECOMMENDED_BSRS_FIELDS.filter((field) => !upperFields.has(field.toUpperCase()));
  return { rows, fields, missing_recommended_fields: missing };
}

export function summarizeR5Json(text) {
  const parsed = JSON.parse(String(text ?? "{}"));
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  return {
    parsed,
    item_count: items.length,
    source_documents: parsed.source_documents?.length ?? parsed.sourceDocuments?.length ?? 0,
    summary_stage: parsed.summary_stage ?? parsed.summaryStage ?? "unknown"
  };
}

function replaceOnce(raw, before, after) {
  const next = raw.replace(before, after);
  return next === raw ? null : next;
}

function applyLineReplacement(lines, rule, matcher, replacer) {
  const changes = [];
  const nextLines = lines.map((line) => ({ ...line }));
  nextLines.forEach((line, index) => {
    if (!matcher(line.raw)) return;
    const replacement = replacer(line.raw);
    if (!replacement || replacement === line.raw) return;
    changes.push({
      rule_id: rule.id,
      status: "applied",
      line_number: line.line_number,
      operation: "replaceExpression",
      before: line.raw,
      after: replacement,
      message: rule.description
    });
    nextLines[index] = { ...line, raw: replacement };
  });
  return { lines: nextLines, changes };
}

export function applyBsrsPatches(text, selectedRuleIds = BSRS_RULES.map((rule) => rule.id)) {
  let lines = parseBsrsConfig(text);
  const selected = new Set(selectedRuleIds);
  const changes = [];
  const warnings = [];

  const run = (ruleId, matcher, replacer) => {
    if (!selected.has(ruleId)) return;
    const rule = BSRS_RULES.find((item) => item.id === ruleId);
    const result = applyLineReplacement(lines, rule, matcher, replacer);
    lines = result.lines;
    changes.push(...result.changes);
    if (!result.changes.length) {
      warnings.push({
        rule_id: ruleId,
        status: "skipped",
        message: "No unambiguous target line found or target already patched."
      });
    }
  };

  run(
    "bsrs-ls-positive-residual-guard",
    (raw) =>
      raw.includes("LS_EST_DATE") &&
      raw.includes("LS_TERM>LS_EST_AMT") &&
      !raw.includes("LS_EST_AMT>0"),
    (raw) => replaceOnce(raw, "LS_TERM>LS_EST_AMT", "LS_EST_AMT>0 AND LS_TERM>LS_EST_AMT")
  );

  run(
    "bsrs-blank-annuity-type-guard",
    (raw) =>
      raw.includes("ANNUITY_TYPE") &&
      raw.includes('ANNUITY_TYPE<>""0""') &&
      raw.includes('ANNUITY_TYPE<>""1""') &&
      !raw.includes('ANNUITY_TYPE<>""""'),
    (raw) =>
      replaceOnce(
        raw,
        'ANNUITY_TYPE<>""0"" AND ANNUITY_TYPE<>""1""',
        'ANNUITY_TYPE<>"""" AND ANNUITY_TYPE<>""0"" AND ANNUITY_TYPE<>""1""'
      )
  );

  run(
    "bsrs-dedup-residual-date-routing",
    (raw) => raw.includes("LS_EST_AMT") && raw.includes('CALC_INDICATOR=""V"" AND (I049=2 OR I049=4 OR I049=12 OR I049=14)'),
    (raw) =>
      replaceOnce(
        raw,
        'CALC_INDICATOR=""V"" AND (I049=2 OR I049=4 OR I049=12 OR I049=14)',
        'CALC_INDICATOR=""V"" AND I049=2'
      )
  );

  return {
    text: serializeBsrsLines(lines),
    changes: changes.sort((a, b) => a.line_number - b.line_number || a.rule_id.localeCompare(b.rule_id)),
    warnings
  };
}

function formulaBalance(value) {
  let inQuote = false;
  let paren = 0;
  const text = String(value ?? "");
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === "\"") {
      if (next === "\"") {
        i += 1;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }
    if (inQuote) continue;
    if (ch === "(") paren += 1;
    if (ch === ")") paren -= 1;
    if (paren < 0) return { ok: false, message: "closing parenthesis before opener" };
  }
  if (inQuote) return { ok: false, message: "unmatched double quote" };
  if (paren !== 0) return { ok: false, message: `parenthesis balance ${paren}` };
  return { ok: true, message: "ok" };
}

export function validateBsrsConfig(text, populationFields = []) {
  const lines = parseBsrsConfig(text);
  const issues = [];
  const add = (severity, line, ruleId, message, action) => {
    issues.push({
      severity,
      line_number: line?.line_number ?? "-",
      rule_id: ruleId,
      message,
      action
    });
  };

  lines.forEach((line) => {
    if (!line.raw.trim()) return;
    if (line.tab_count !== 5) {
      add("error", line, "bsrs-tab-structure", `Expected 5 tabs / 6 columns, found ${line.tab_count}.`, "Review BSRS row columns before export.");
    }
    [line.criteria, line.text_expression, line.detail_expression].forEach((expr, index) => {
      if (!expr) return;
      const balance = formulaBalance(expr);
      if (!balance.ok) {
        add("error", line, "bsrs-expression-balance", `Column ${index + 1}: ${balance.message}.`, "Review quotes and parentheses.");
      }
    });
    if (line.raw.includes("LS_EST_DATE") && line.raw.includes("LS_TERM>LS_EST_AMT") && !line.raw.includes("LS_EST_AMT>0")) {
      add("error", line, "bsrs-ls-positive-residual-guard", "Residual LS logic is missing LS_EST_AMT>0.", "Apply strict positive residual guard.");
    }
    if (
      line.raw.includes('ANNUITY_TYPE<>""0""') &&
      line.raw.includes('ANNUITY_TYPE<>""1""') &&
      !line.raw.includes('ANNUITY_TYPE<>""""')
    ) {
      add("warning", line, "bsrs-blank-annuity-type-guard", "Blank ANNUITY_TYPE may route as optional-form language.", 'Require ANNUITY_TYPE<>"" before optional-form routing.');
    }
    if (line.raw.includes("LS_EST_AMT") && /\(I049=2 OR I049=4 OR I049=12 OR I049=14\)/.test(line.raw)) {
      add("warning", line, "bsrs-dedup-residual-date-routing", "Combined I049 residual routing may duplicate residual blocks.", "Narrow residual block to the final relevant date section.");
    }
    if (/Summary of Participant/i.test(line.raw) && line.raw.includes("XRD_SURV_MB_TERM")) {
      add("warning", line, "bsrs-participant-survivor-amount-risk", "Participant summary appears to reference survivor amount.", "Confirm participant payable amount is used for participant lifetime statements.");
    }
  });

  const upperFields = new Set(populationFields.map((field) => String(field).toUpperCase()));
  RECOMMENDED_BSRS_FIELDS.forEach((field) => {
    if (!upperFields.has(field.toUpperCase())) {
      add("info", null, "bsrs-missing-recommended-field", `Recommended field ${field} not found in population data.`, "Map aliases or confirm this field is not needed for selected rules.");
    }
  });

  issues.sort((a, b) => {
    const sev = { error: 0, warning: 1, info: 2 };
    return (
      sev[a.severity] - sev[b.severity] ||
      Number(a.line_number === "-" ? 999999 : a.line_number) - Number(b.line_number === "-" ? 999999 : b.line_number) ||
      a.rule_id.localeCompare(b.rule_id) ||
      a.message.localeCompare(b.message)
    );
  });

  return {
    summary: {
      errors: issues.filter((issue) => issue.severity === "error").length,
      warnings: issues.filter((issue) => issue.severity === "warning").length,
      info: issues.filter((issue) => issue.severity === "info").length,
      rows: lines.filter((line) => line.raw.trim()).length
    },
    issues
  };
}

export function residualResult(row) {
  const date = String(row?.LS_EST_DATE ?? "").trim();
  const amount = Number(String(row?.LS_EST_AMT ?? "").replace(/[$,% ,]/g, ""));
  const term = Number(String(row?.LS_TERM ?? "").replace(/[$,% ,]/g, ""));
  const ok = !!date && Number.isFinite(amount) && Number.isFinite(term) && amount > 0 && term > amount && term > 0;
  return {
    ok,
    ls_est_amt: Number.isFinite(amount) ? amount : 0,
    ls_term: Number.isFinite(term) ? term : 0,
    factor: ok ? Number((1 - amount / term).toFixed(10)) : 1,
    ratio: ok ? Number((amount / term).toFixed(10)) : 0
  };
}

export function classifyParticipant(row) {
  const has = (field) => String(row?.[field] ?? "").trim();
  if (has("DOD")) return "Death/beneficiary review";
  if (has("DOR")) return "Retired/in pay or retirement statement";
  if (has("DOTE") && has("DOPT") && has("DOTE") === has("DOPT")) return "Active vested / active at DOPT";
  if (["1", "2"].includes(String(row?.RETSTAT ?? ""))) return "Separated vested / deferred";
  return "Unknown";
}

export function participantDisplayId(row, index = 0) {
  return (
    row?.CustID ??
    row?.CUSTID ??
    row?.CUSTOMER_ID ??
    row?.BCV_REC_ID ??
    row?.ID ??
    `row-${index + 1}`
  );
}

function normalizeBsrsCriteria(criteria) {
  let text = String(criteria ?? "").trim();
  if (text.length >= 2 && text.startsWith("\"") && text.endsWith("\"")) {
    text = text.slice(1, -1);
  }
  return text.replace(/""/g, "\"").trim();
}

function rowValue(row, fieldName) {
  const target = String(fieldName ?? "").toUpperCase();
  const key = Object.keys(row ?? {}).find((name) => name.toUpperCase() === target);
  if (!key) return "";
  const raw = row[key];
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const numericText = text.replace(/[$,% ,]/g, "");
  if (/^-?\d+(\.\d+)?$/.test(numericText)) return Number(numericText);
  return text;
}

function isDateValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (!/^\d{1,4}[/-]\d{1,2}([/-]\d{1,4})?$/.test(text)) return false;
  return !Number.isNaN(Date.parse(text));
}

function unsupportedFunctions(expression) {
  const found = [...String(expression ?? "").matchAll(/@([A-Z][A-Z0-9_]*)\s*\(/gi)]
    .map((match) => `@${match[1].toUpperCase()}`);
  return [...new Set(found.filter((name) => name !== "@ISDATE"))].sort();
}

function classifyBsrsFunctions(expression) {
  const names = unsupportedFunctions(expression);
  const recognized = names.filter((name) => BSRS_FUNCTION_NAMES.has(name.slice(1)));
  const unknown = names.filter((name) => !BSRS_FUNCTION_NAMES.has(name.slice(1)));
  return { names, recognized, unknown };
}

function protectCriteriaLiterals(expression) {
  const literals = [];
  const protect = (value, quoteType) => {
    const index = literals.length;
    literals.push(quoteType === "date" ? value.slice(1, -1) : value.slice(1, -1));
    return `__BSRS_LITERAL_${index}__`;
  };
  const withoutDates = expression.replace(/#[^#]*#/g, (match) => protect(match, "date"));
  const text = withoutDates.replace(/"[^"]*"/g, (match) => protect(match, "string"));
  return { text, literals };
}

function restoreCriteriaLiterals(expression, literals) {
  return expression.replace(/__BSRS_LITERAL_(\d+)__/g, (_, index) =>
    JSON.stringify(literals[Number(index)] ?? "")
  );
}

function translateBsrsCriteria(criteria) {
  const normalized = normalizeBsrsCriteria(criteria);
  if (!normalized || normalized === "0") {
    return {
      status: "translated",
      normalized,
      expression: "true",
      note: normalized === "0" ? "Criteria 0 treated as unconditional." : "Blank criteria treated as unconditional."
    };
  }

  const functionClass = classifyBsrsFunctions(normalized);
  if (functionClass.names.length) {
    const reason = functionClass.recognized.length
      ? `Recognized BSRS function(s) not implemented in the conservative evaluator: ${functionClass.recognized.join(", ")}.`
      : `Unknown BSRS function name(s) not found in reference list: ${functionClass.unknown.join(", ")}.`;
    return {
      status: "manual_review",
      normalized,
      unsupported_functions: functionClass.names,
      recognized_functions: functionClass.recognized,
      unknown_functions: functionClass.unknown,
      reason
    };
  }

  const { text: protectedText, literals } = protectCriteriaLiterals(normalized);
  let expression = protectedText
    .replace(/@ISDATE\s*\(\s*([A-Z_][A-Z0-9_]*)\s*\)/gi, (_, field) => `isDate(val(${JSON.stringify(field)}))`)
    .replace(/\bAND\b/gi, "&&")
    .replace(/\bOR\b/gi, "||")
    .replace(/\bNOT\b/gi, "!")
    .replace(/<>/g, "!=")
    .replace(/(^|[^<>=!])=([^=]|$)/g, "$1==$2");

  expression = expression.replace(/\b[A-Z_][A-Z0-9_]*\b/g, (token, offset, source) => {
    if (source[offset - 1] === "\"" && source[offset + token.length] === "\"") return token;
    if (/^__BSRS_LITERAL_\d+__$/.test(token)) return token;
    return `val(${JSON.stringify(token)})`;
  });
  expression = restoreCriteriaLiterals(expression, literals);

  const withoutStrings = expression.replace(/"([^"\\]|\\.)*"/g, "");
  const identifiers = [...withoutStrings.matchAll(/\b[A-Za-z_$][A-Za-z0-9_$]*\b/g)].map((match) => match[0]);
  const unknownIdentifiers = [...new Set(identifiers.filter((id) => !["val", "isDate", "true", "false"].includes(id)))].sort();
  if (unknownIdentifiers.length) {
    return {
      status: "manual_review",
      normalized,
      reason: `Unsupported token(s): ${unknownIdentifiers.join(", ")}.`
    };
  }
  if (!/^[\s().!<>=&|+\-*/%,0-9A-Za-z_$"\\:]+$/.test(expression)) {
    return {
      status: "manual_review",
      normalized,
      reason: "Criteria contains characters outside the conservative evaluator."
    };
  }
  return { status: "translated", normalized, expression };
}

export function evaluateBsrsCriteria(criteria, row = {}) {
  const translated = translateBsrsCriteria(criteria);
  if (translated.status === "manual_review") {
    return {
      status: "manual_review",
      value: null,
      normalized: translated.normalized,
      reason: translated.reason,
      unsupported_functions: translated.unsupported_functions ?? [],
      recognized_functions: translated.recognized_functions ?? [],
      unknown_functions: translated.unknown_functions ?? []
    };
  }
  try {
    const value = Function("val", "isDate", `"use strict"; return Boolean(${translated.expression});`)(
      (fieldName) => rowValue(row, fieldName),
      isDateValue
    );
    return {
      status: "evaluated",
      value,
      normalized: translated.normalized,
      expression: translated.expression,
      note: translated.note
    };
  } catch (err) {
    return {
      status: "manual_review",
      value: null,
      normalized: translated.normalized,
      reason: `Evaluator could not safely run criteria: ${err.message}.`,
      unsupported_functions: [],
      recognized_functions: [],
      unknown_functions: []
    };
  }
}

function previewExpression(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

export function evaluateBsrsRowsForParticipant(text, row = {}) {
  const lines = parseBsrsConfig(text);
  const result = {
    summary: {
      total_rows: lines.filter((line) => line.raw.trim()).length,
      evaluated_rows: 0,
      hit_rows: 0,
      missed_rows: 0,
      manual_review_rows: 0
    },
    hits: [],
    misses: [],
    manual_review: []
  };

  lines.forEach((line) => {
    if (!line.raw.trim()) return;
    const evaluation = evaluateBsrsCriteria(line.criteria, row);
    const item = {
      line_number: line.line_number,
      label: line.label,
      criteria: evaluation.normalized,
      text_expression: previewExpression(line.text_expression),
      detail_expression: previewExpression(line.detail_expression),
      evaluation
    };
    if (evaluation.status === "manual_review") {
      result.summary.manual_review_rows += 1;
      result.manual_review.push(item);
      return;
    }
    result.summary.evaluated_rows += 1;
    if (evaluation.value) {
      result.summary.hit_rows += 1;
      result.hits.push(item);
    } else {
      result.summary.missed_rows += 1;
      result.misses.push(item);
    }
  });

  return result;
}

export function buildParticipantDiagnostic(row, index = 0, rules = BSRS_RULES) {
  const classification = classifyParticipant(row);
  const residual = residualResult(row);
  const fields = new Set(Object.keys(row ?? {}).map((field) => field.toUpperCase()));
  const missingFields = [...new Set(rules.flatMap((rule) => rule.required_fields ?? []))]
    .filter((field) => !fields.has(field.toUpperCase()))
    .sort();
  const firedRules = [];
  const suppressedRules = [];

  rules.forEach((rule) => {
    if (rule.family === "residualLS") {
      (residual.ok ? firedRules : suppressedRules).push(rule.id);
      return;
    }
    if (rule.id === "bsrs-blank-annuity-type-guard") {
      const value = String(row?.ANNUITY_TYPE ?? "");
      (value === "" ? firedRules : suppressedRules).push(rule.id);
      return;
    }
    suppressedRules.push(rule.id);
  });

  return {
    participant_id: participantDisplayId(row, index),
    classification,
    residual,
    fired_rules: firedRules.sort(),
    suppressed_rules: suppressedRules.sort(),
    missing_fields: missingFields,
    warnings: [
      residual.ok ? "" : "Positive residual lump-sum guard is false; residual rules must not affect this row.",
      missingFields.length ? `${missingFields.length} recommended field(s) missing from this row.` : ""
    ].filter(Boolean)
  };
}
