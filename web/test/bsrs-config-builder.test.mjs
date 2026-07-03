import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBsrsPatches,
  buildParticipantDiagnostic,
  classifyParticipant,
  evaluateBsrsCriteria,
  evaluateBsrsRowsForParticipant,
  parseBsrsConfig,
  parsePopulation,
  residualResult,
  validateBsrsConfig
} from "../src/bsrs-config-builder.js";

const riskyConfig = [
  '0\t\t"""Header"""\t\tTH\tTH',
  '"@ISDATE(LS_EST_DATE) AND LS_TERM>LS_EST_AMT AND LS_TERM>0"\tLN(128)\t"""LS residual"""\tLS_TERM\tTL\t$2',
  '"@ISDATE(DOR) AND ANNUITY_TYPE<>""0"" AND ANNUITY_TYPE<>""1"""\tLN(118)\t"""Optional form"""\tTERM_MB_ARD_FF\tTL\t$2',
  '"CALC_INDICATOR=""V"" AND (I049=2 OR I049=4 OR I049=12 OR I049=14) AND LS_EST_AMT>0"\tC\t"""Duplicate risk"""\tLS_TERM\tTL\t$2'
].join("\n");

test("parseBsrsConfig preserves line numbers and tab fields", () => {
  const lines = parseBsrsConfig(riskyConfig);
  assert.equal(lines.length, 4);
  assert.equal(lines[1].line_number, 2);
  assert.equal(lines[1].tab_count, 5);
  assert.equal(lines[1].label, "LN(128)");
});

test("parsePopulation reads CSV and reports recommended field gaps", () => {
  const population = parsePopulation("ID,RETSTAT,LS_EST_DATE,LS_EST_AMT,LS_TERM\n1,2,1/1/2024,100,400", "pop.csv");
  assert.equal(population.rows.length, 1);
  assert.ok(population.fields.includes("LS_TERM"));
  assert.ok(population.missing_recommended_fields.includes("DOR"));
});

test("applyBsrsPatches applies residual and annuity guards without unrelated rewrites", () => {
  const result = applyBsrsPatches(riskyConfig, [
    "bsrs-ls-positive-residual-guard",
    "bsrs-blank-annuity-type-guard"
  ]);
  assert.match(result.text, /LS_EST_AMT>0 AND LS_TERM>LS_EST_AMT/);
  assert.match(result.text, /ANNUITY_TYPE<>"""" AND ANNUITY_TYPE<>""0""/);
  assert.equal(result.changes.length, 2);
  assert.equal(result.text.split("\n")[0], riskyConfig.split("\n")[0]);
});

test("validateBsrsConfig detects known risky patterns", () => {
  const participantSurvivorRisk =
    '0\t\t"""Summary of Participant\'s Benefits"""\tXRD_SURV_MB_TERM\tTL\t$2';
  const result = validateBsrsConfig(`${riskyConfig}\n${participantSurvivorRisk}`, ["ID", "RETSTAT", "LS_EST_DATE", "LS_EST_AMT", "LS_TERM"]);
  assert.ok(result.summary.errors >= 1);
  assert.ok(result.issues.some((issue) => issue.rule_id === "bsrs-ls-positive-residual-guard"));
  assert.ok(result.issues.some((issue) => issue.rule_id === "bsrs-blank-annuity-type-guard"));
  assert.ok(result.issues.some((issue) => issue.rule_id === "bsrs-dedup-residual-date-routing"));
  assert.ok(result.issues.some((issue) => issue.rule_id === "bsrs-participant-survivor-amount-risk"));
});

test("change log ordering is deterministic", () => {
  const first = applyBsrsPatches(riskyConfig, [
    "bsrs-blank-annuity-type-guard",
    "bsrs-ls-positive-residual-guard"
  ]);
  const second = applyBsrsPatches(riskyConfig, [
    "bsrs-ls-positive-residual-guard",
    "bsrs-blank-annuity-type-guard"
  ]);
  assert.deepEqual(first.changes.map((change) => `${change.line_number}:${change.rule_id}`), second.changes.map((change) => `${change.line_number}:${change.rule_id}`));
});

test("residualResult gates positive residual cases", () => {
  assert.deepEqual(residualResult({ LS_EST_DATE: "1/1/2024", LS_EST_AMT: "100", LS_TERM: "400" }), {
    ok: true,
    ls_est_amt: 100,
    ls_term: 400,
    factor: 0.75,
    ratio: 0.25
  });
  assert.equal(residualResult({ LS_EST_DATE: "1/1/2024", LS_EST_AMT: "0", LS_TERM: "400" }).ok, false);
  assert.equal(residualResult({ LS_EST_DATE: "1/1/2024", LS_EST_AMT: "500", LS_TERM: "400" }).ok, false);
});

test("classifyParticipant identifies basic BSRS routing classes", () => {
  assert.equal(classifyParticipant({ DOR: "1/1/2025" }), "Retired/in pay or retirement statement");
  assert.equal(classifyParticipant({ DOD: "1/1/2025" }), "Death/beneficiary review");
  assert.equal(classifyParticipant({ DOTE: "1/1/2025", DOPT: "1/1/2025" }), "Active vested / active at DOPT");
});

test("buildParticipantDiagnostic reports fired and suppressed rules", () => {
  const positive = buildParticipantDiagnostic({
    CustID: "SYN-1",
    LS_EST_DATE: "1/1/2024",
    LS_EST_AMT: "100",
    LS_TERM: "400",
    ANNUITY_TYPE: ""
  });
  assert.equal(positive.participant_id, "SYN-1");
  assert.ok(positive.fired_rules.includes("bsrs-ls-positive-residual-guard"));
  assert.ok(positive.fired_rules.includes("bsrs-blank-annuity-type-guard"));

  const noResidual = buildParticipantDiagnostic({
    CustID: "SYN-2",
    LS_EST_DATE: "1/1/2024",
    LS_EST_AMT: "0",
    LS_TERM: "400",
    ANNUITY_TYPE: "1"
  });
  assert.ok(noResidual.suppressed_rules.includes("bsrs-ls-positive-residual-guard"));
  assert.ok(noResidual.suppressed_rules.includes("bsrs-blank-annuity-type-guard"));
});

test("evaluateBsrsCriteria handles conservative comparisons and dates", () => {
  const result = evaluateBsrsCriteria(
    '"@ISDATE(LS_EST_DATE) AND LS_EST_AMT>0 AND LS_TERM>LS_EST_AMT AND CALC_INDICATOR=""R"""',
    { LS_EST_DATE: "1/1/2024", LS_EST_AMT: "100", LS_TERM: "400", CALC_INDICATOR: "R" }
  );
  assert.equal(result.status, "evaluated");
  assert.equal(result.value, true);

  const miss = evaluateBsrsCriteria(
    '"@ISDATE(LS_EST_DATE) AND LS_EST_AMT>0 AND LS_TERM>LS_EST_AMT"',
    { LS_EST_DATE: "1/1/2024", LS_EST_AMT: "500", LS_TERM: "400" }
  );
  assert.equal(miss.status, "evaluated");
  assert.equal(miss.value, false);
});

test("evaluateBsrsCriteria marks unsupported function names for manual review", () => {
  const result = evaluateBsrsCriteria('"@IF(RETSTAT=1,1,0)=1"', { RETSTAT: "1" });
  assert.equal(result.status, "manual_review");
  assert.deepEqual(result.unsupported_functions, ["@IF"]);
  assert.match(result.reason, /Unsupported BSRS function/);
});

test("evaluateBsrsRowsForParticipant returns hits and manual-review rows", () => {
  const config = [
    '0\t\t"""Always"""\t\tTH\tTH',
    '"LS_EST_AMT>0 AND LS_TERM>LS_EST_AMT"\tLN(128)\t"""Residual"""\tLS_TERM\tTL\t$2',
    '"@STRING(RETSTAT)=""1"""\tLN(999)\t"""Unsupported"""\tRETSTAT\tTL\t$2'
  ].join("\n");
  const result = evaluateBsrsRowsForParticipant(config, { LS_EST_AMT: "100", LS_TERM: "400", RETSTAT: "1" });
  assert.equal(result.summary.hit_rows, 2);
  assert.equal(result.summary.manual_review_rows, 1);
  assert.equal(result.hits[1].line_number, 2);
  assert.equal(result.manual_review[0].line_number, 3);
});
