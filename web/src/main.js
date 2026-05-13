
import "./style.css";

import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import v1EngineExplorerHtml from "./legacy/pbgc-v1-engine-explorer.html?raw";
import logoSvg from "./assets/logo.svg?raw";
import metadataScraperPrompt from "./assets/metadata-scraper-prompt.txt?raw";
import r5ScraperPrompt from "./assets/r5-scraper-prompt.v3.md?raw";
import r5ItemsText from "../../reference/r5-items.txt?raw";
import defaultDdCsvText from "../../reference/DD.csv?raw";

import Ajv from "ajv";
import planMetadataSchema from "./planMetadata.schema.json";
import r5SummarySchema from "./r5Summary.schema.json";
import { APP_VERSION, SCHEMA_VERSION } from "./version.js";

const ajv = new Ajv({ allErrors: true, strict: false });
const validatePlanMetadata = ajv.compile(planMetadataSchema);
const validateR5SummarySchema = ajv.compile(r5SummarySchema);

const state = {
  appVersion: APP_VERSION,
  planMetadata: null,
  planMetadataApproved: false,
  lastManifest: null,
  v1Warehouse: {
    records: [],
    profiles: [],
    importManifest: null,
    rankingManifest: null,
    diagnostics: [],
    r5Files: [],
    r5Profile: null,
    rankings: [],
    selectedCandidate: null,
    tabPatternCorpus: null,
    tabBlueprintRecommendation: null
  },
  caseWorkflow: {
    r5Summary: null,
    selectedV1: null,
    syntheticPopulation: null,
    moduleRuns: {}
  },
  lastError: null,
  theme: "auto"
};

const STORAGE_KEY = "pbgc_caseworkbench_state_v0_7";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.planMetadata = saved.planMetadata ?? null;
    state.planMetadataApproved = saved.planMetadataApproved ?? false;
    state.lastManifest = saved.lastManifest ?? null;
    state.caseWorkflow = {
      ...state.caseWorkflow,
      ...(saved.caseWorkflow ?? {})
    };
    state.v1Warehouse.r5Profile = state.caseWorkflow.r5Summary?.profile ?? null;
    state.v1Warehouse.selectedCandidate = state.caseWorkflow.selectedV1 ?? null;
  } catch {
    // ignore
  }
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        planMetadata: state.planMetadata,
        planMetadataApproved: state.planMetadataApproved,
        lastManifest: state.lastManifest,
        caseWorkflow: {
          r5Summary: state.caseWorkflow.r5Summary,
          selectedV1: state.caseWorkflow.selectedV1,
          syntheticPopulation: state.caseWorkflow.syntheticPopulation,
          moduleRuns: state.caseWorkflow.moduleRuns
        }
      })
    );
  } catch {
    // ignore
  }
}

function clearState() {
  state.planMetadata = null;
  state.planMetadataApproved = false;
  state.lastManifest = null;
  resetV1Warehouse();
  state.caseWorkflow = { r5Summary: null, selectedV1: null, syntheticPopulation: null, moduleRuns: {} };
  state.lastError = null;
  localStorage.removeItem(STORAGE_KEY);
}

const routes = [
  { path: "#/metadata", title: "Metadata", render: renderMetadata },
  { path: "#/dashboard", title: "Dashboard", render: renderDashboard },
  { path: "#/guide", title: "Case Guide", render: renderCaseGuide },
  { path: "#/evidence-guide", title: "Next Evidence", render: renderEvidenceGuide },
  { path: "#/inputs", title: "Input Contracts", render: renderInputsMatrix, hidden: true },
  { path: "#/rules", title: "Rules Registry", render: renderRulesRegistry, hidden: true },
  { path: "#/plan-summary", title: "Plan Summary", render: renderPlanSummary },
  { path: "#/v1-engine-explorer", title: "V1 Explorer", render: renderV1EngineExplorer },
  { path: "#/v1-audit", title: "V1 Audit", render: renderV1Audit },
  { path: "#/del", title: "DEL", readiness: "scaffold", render: (container) => renderArtifactModule(container, artifactModuleConfigs.del) },
  { path: "#/synthetic-population", title: "Synthetic Population", render: renderSyntheticPopulation },
  { path: "#/factors", title: "Plan Factors", readiness: "scaffold", render: (container) => renderArtifactModule(container, artifactModuleConfigs.factors) },
  { path: "#/436", title: "436", readiness: "scaffold", render: (container) => renderArtifactModule(container, artifactModuleConfigs.section436) },
  { path: "#/estimated-adjustments", title: "Est. Adjustments", readiness: "scaffold", render: (container) => renderArtifactModule(container, artifactModuleConfigs.estimatedAdjustments) },
  { path: "#/estimated-administration", title: "Est. Administration", readiness: "scaffold", render: (container) => renderArtifactModule(container, artifactModuleConfigs.estimatedAdministration) },
  { path: "#/v1-builder", title: "V1 Builder", render: renderV1BuilderAlias, hidden: true },
  { path: "#/dag-viewer", title: "DAG Viewer", readiness: "scaffold", render: (container) => renderArtifactModule(container, artifactModuleConfigs.dagViewer) },
  { path: "#/formula-tree", title: "Formula Tree", readiness: "scaffold", render: (container) => renderArtifactModule(container, artifactModuleConfigs.formulaTree) },
  { path: "#/letters-bcv", title: "Letters/BCV", readiness: "scaffold", render: (container) => renderArtifactModule(container, artifactModuleConfigs.lettersBcv) },
  { path: "#/audit", title: "Audit", render: renderAudit }
];

const canonicalDeliverables = [
  {
    id: "metadata",
    outputName: "plan-metadata.json",
    title: "Plan Metadata",
    route: "#/metadata",
    summary: "Case identity, dates, staff, plan status, and document registry shared by every module.",
    status: "Foundational"
  },
  {
    id: "r5",
    outputName: "########R5.docx",
    title: "R5 Plan Summary",
    route: "#/plan-summary",
    summary: "Filled Plan Summary template driven by PlanMetadata plus R5Summary.json from the scraper.",
    status: "Template-driven"
  },
  {
    id: "del",
    outputName: "########DEL.pdf",
    title: "DEL",
    route: "#/del",
    summary: "Data Element List derived from PlanMetadata, R5Summary.json, and DD.csv.",
    status: "Needs generator"
  },
  {
    id: "pf",
    outputName: "########PF.xlsx",
    title: "Plan Factors",
    route: "#/factors",
    summary: "Mortality, interest, optional forms, and factor rules from R5 provisions and source material.",
    status: "Needs PF integration"
  },
  {
    id: "syntheticPopulation",
    outputName: "########SyntheticPopulation.zip",
    title: "Synthetic Population",
    route: "#/synthetic-population",
    summary: "Deterministic no-PII participant/payee population for testing DEL, PF, V1, and estimated analyses.",
    status: "Testing support"
  },
  {
    id: "section436",
    outputName: "436 Limitation Analysis.docx",
    title: "436 Limitation Analysis",
    route: "#/436",
    summary: "Limitation memo from metadata, R5 facts, freeze/AFTAP/CBA evidence, and the 436 template.",
    status: "Input map incomplete"
  },
  {
    id: "estimatedAdjustments",
    outputName: "Estimated Benefit Adjustments Analysis.docx",
    title: "Estimated Adjustments",
    route: "#/estimated-adjustments",
    summary: "Adjustment analysis from payment history, current benefits, estimates, and workpapers.",
    status: "Input map incomplete"
  },
  {
    id: "estimatedAdministration",
    outputName: "Estimated Benefit Administration Analysis.docx",
    title: "Estimated Administration",
    route: "#/estimated-administration",
    summary: "Administration analysis from payee status, operational extracts, notices, and admin notes.",
    status: "Input map incomplete"
  },
  {
    id: "v1",
    outputName: "########V1.xlsx",
    title: "V1 Engine",
    route: "#/v1-engine-explorer",
    summary: "Production calculation workbook selected from approved V1s or built from rules using DAG/AST evidence.",
    status: "High complexity"
  },
  {
    id: "s1",
    outputName: "########S1.cfg",
    title: "BSRS / BCV",
    route: "#/letters-bcv",
    summary: "Letter generation config tied to DEL fields, V1 outputs, BSRS functions, and provided samples.",
    status: "Sample-dependent"
  }
];

function canonicalDeliverableById(id) {
  return canonicalDeliverables.find((item) => item.id === id);
}

const inputMatrixToCanonicalDeliverable = {
  "plan-summary-r5": "r5",
  "data-elements": "del",
  "synthetic-population": "syntheticPopulation",
  "plan-factors": "pf",
  "section-436": "section436",
  "estimated-benefit-adjustments": "estimatedAdjustments",
  "estimated-benefit-administration": "estimatedAdministration",
  "v1-engine": "v1",
  "bsrs-bcv": "s1"
};

const artifactModuleConfigs = {
  del: {
    id: "data-elements",
    title: "DEL Data Elements",
    description: "Package Data Element List evidence so the eventual output can be ########DEL.pdf.",
    outputName: "data-elements.artifact.json",
    accepted: ".json,.csv,.txt,.xlsx,.xlsm,.xls,.pdf,.docx",
    prompt: "Upload R5Summary.json, DD.csv mappings, DEL extracts/source worksheets, and supporting cited references.",
    requiredInputs: ["PlanMetadata", "R5Summary.json/profile", "DD.csv", "DEL source files", "Cited source evidence"],
    upstreamInputs: ["metadata", "r5"]
  },
  factors: {
    id: "plan-factors",
    title: "Plan Factors",
    description: "Package factor source files so the eventual output can be ########PF.xlsx.",
    outputName: "plan-factors.artifact.json",
    accepted: ".json,.csv,.txt,.xlsx,.xlsm,.xls,.pdf,.docx",
    prompt: "Upload factor tables, plan provisions, rate bases, optional-form rules, and supporting references.",
    requiredInputs: ["PlanMetadata", "R5Summary.json/profile", "DD.csv", "Mortality and interest basis", "Optional forms/factor rules", "PF template/workbook"],
    upstreamInputs: ["metadata", "r5", "v1", "synthetic"]
  },
  section436: {
    id: "section-436",
    title: "Section 436 Limitation Memo",
    description: "Build a memo input package for 436 Limitation Analysis.docx without inventing missing provisions.",
    outputName: "section-436-memo.artifact.json",
    accepted: ".json,.txt,.pdf,.docx",
    prompt: "Upload section 436 references, plan amendments, and memo notes.",
    requiredInputs: ["PlanMetadata", "R5 summary JSON/profile", "Section 436 references", "Plan amendments or freeze evidence"],
    upstreamInputs: ["metadata", "r5"]
  },
  estimatedAdjustments: {
    id: "estimated-benefit-adjustments",
    title: "Estimated Benefit Adjustment Analysis",
    description: "Create an adjustment analysis package from uploaded estimates and supporting workpapers.",
    outputName: "estimated-benefit-adjustments.artifact.json",
    accepted: ".json,.csv,.txt,.xlsx,.xlsm,.xls,.pdf",
    prompt: "Upload estimated benefit extracts, workpapers, or reconciliation notes.",
    requiredInputs: ["PlanMetadata", "R5 summary JSON/profile", "Selected V1 engine profile when available", "Synthetic population for testing when available", "Estimated benefit extracts", "Adjustment workpapers"],
    upstreamInputs: ["metadata", "r5", "v1", "synthetic"]
  },
  estimatedAdministration: {
    id: "estimated-benefit-administration",
    title: "Estimated Benefit Administration Analysis",
    description: "Create an administration analysis package from uploaded extracts and source notes.",
    outputName: "estimated-benefit-administration.artifact.json",
    accepted: ".json,.csv,.txt,.xlsx,.xlsm,.xls,.pdf",
    prompt: "Upload administration extracts, sample notices, or operational notes.",
    requiredInputs: ["PlanMetadata", "R5 summary JSON/profile", "Synthetic population for testing when available", "Administration extracts", "Operational notes"],
    upstreamInputs: ["metadata", "r5", "synthetic"]
  },
  dagViewer: {
    id: "dag-viewer",
    title: "DAG Viewer",
    description: "Build a dependency graph model from uploaded formula or engine JSON.",
    outputName: "dag-viewer.graph.json",
    accepted: ".json,.txt,.csv",
    prompt: "Upload formula inventories or engine JSON.",
    requiredInputs: ["PlanMetadata", "Selected V1 engine profile", "V1 summary/formula JSON"],
    upstreamInputs: ["metadata", "v1"]
  },
  formulaTree: {
    id: "formula-tree",
    title: "Formula Tree",
    description: "Build a formula tree model from uploaded formula strings. Formulas are analyzed as text only.",
    outputName: "formula-tree.graph.json",
    accepted: ".json,.txt,.csv",
    prompt: "Upload formula inventories, row-variable maps, or engine JSON.",
    requiredInputs: ["PlanMetadata", "Selected V1 engine profile", "Formula inventory JSON/text"],
    upstreamInputs: ["metadata", "v1"]
  },
  lettersBcv: {
    id: "letters-bcv-config",
    title: "BSRS / BCV Letter Generation Config",
    description: "Create a deterministic package for the eventual ########S1.cfg letter generation config.",
    outputName: "bsrs-bcv-letter-config.artifact.json",
    accepted: ".json,.txt,.csv,.docx,.xlsx,.xlsm,.xls",
    prompt: "Upload letter templates, BSRS configs, and variable mappings.",
    requiredInputs: ["PlanMetadata", "R5 summary JSON/profile", "Synthetic population for testing when available", "Letter templates", "BCV/BSRS config inputs"],
    upstreamInputs: ["metadata", "r5", "synthetic"]
  }
};

const REQUIRED_METADATA_FIELDS = [
  { id: "plan_name", label: "Plan Name", path: ["plan", "plan_name"] },
  { id: "case_number", label: "Case Number", path: ["meta", "case_number"] },
  { id: "case_processing_section", label: "Case Processing Section", path: ["meta", "case_processing_section"] },
  { id: "actuary", label: "Actuary", path: ["plan", "actuary"] },
  { id: "auditor", label: "Auditor", path: ["plan", "auditor"] },
  { id: "termination_date", label: "DOPT (Termination Date)", path: ["plan", "termination_date"] },
  { id: "trusteeship_date", label: "DOTR (Trusteeship Date)", path: ["plan", "trusteeship_date"] },
  { id: "nod_date", label: "NOD Date", path: ["plan", "nod_date"] },
  { id: "noit_date", label: "NOIT Date", path: ["plan", "noit_date"] },
  { id: "bpd_bankruptcy", label: "BPD (Bankruptcy)", path: ["plan", "bpd_bankruptcy"] },
  { id: "dobf", label: "DOBF", path: ["plan", "dobf"] },
  { id: "employer_status", label: "Employer Status", path: ["plan", "employer_status"] },
  { id: "facility_closing_date", label: "Facility Closing Date", path: ["plan", "facility_closing_date"] },
  { id: "successor_plan", label: "Successor Plan", path: ["plan", "successor_plan"] },
  { id: "plan_assets", label: "Plan Assets", path: ["plan", "plan_assets"] },
  { id: "sparr", label: "SPARR", path: ["plan", "sparr"] },
  { id: "funding_status", label: "Funding Status", path: ["plan", "funding_status"] }
];

const r5RequiredItems = r5ItemsText
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const match = line.match(/^(\d+)\)\s*(.+)$/);
    return match
      ? { item_id: Number(match[1]), question: match[2] }
      : null;
  })
  .filter(Boolean);

const R5_REQUIRED_ITEM_COUNT = r5RequiredItems.length;

const R5_ITEM_TO_PLAN_PROVISIONS_ROW = {
  1: 2, 2: 5, 3: 9, 4: 10, 5: 11,
  6: 13, 7: 14, 8: 15, 9: 16, 10: 17,
  11: 18, 12: 19, 13: 20, 14: 21,
  15: 23, 16: 24, 17: 25, 18: 26,
  19: 28, 20: 29, 21: 30, 22: 31,
  23: 32, 24: 33, 25: 34,
  26: 36, 27: 37, 28: 38, 29: 39, 30: 40, 31: 41,
  32: 43, 33: 44, 34: 45,
  35: 47, 36: 48, 37: 49,
  38: 50, 39: 51, 40: 52,
  41: 53, 42: 55, 43: 56,
  44: 58, 45: 59, 46: 60,
  47: 61, 48: 63, 49: 64, 50: 65, 51: 66,
  52: 68, 53: 69, 54: 70, 55: 71, 56: 72, 57: 73,
  58: 74, 59: 75, 60: 76, 61: 77
};

function setRoute(path) {
  if (location.hash !== path) location.hash = path;
}

function currentRoute() {
  const h = location.hash || "#/metadata";
  return routes.find((r) => r.path === h) ?? routes[0];
}

function isMetadataReady() {
  if (!state.planMetadata) return false;
  if (!state.planMetadataApproved) return false;
  try {
    const ok = !!validatePlanMetadata(state.planMetadata);
    if (!ok) return false;
    return isMetadataReadyCandidate(state.planMetadata);
  } catch {
    return false;
  }
}

function isMetadataReadyCandidate(metadata) {
  try {
    const hasValue = (obj, path) => {
      let cur = obj;
      for (const p of path) cur = cur?.[p];
      const v = cur?.value ?? "";
      return String(v).trim() !== "" && String(v).trim().toLowerCase() !== "unknown";
    };
    return REQUIRED_METADATA_FIELDS.every((r) => hasValue(metadata, r.path));
  } catch {
    return false;
  }
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "dark" || theme === "light") {
    root.setAttribute("data-theme", theme);
  } else {
    root.removeAttribute("data-theme");
  }
  state.theme = theme;
}

function renderShell() {
  const app = document.querySelector("#app");
  const nav = routes
    .filter((r) => !r.hidden)
    .map(
      (r) =>
        `<button class="nav-button" data-route="${r.path}">${r.title}</button>`
    )
    .join("");

  app.innerHTML = `
    <div class="app-shell">
      <header class="app-header">
        <div class="brand-block">
          <div class="brand-logo" aria-hidden="true">${logoSvg}</div>
          <div class="brand-title">PBGC Caseworkbench</div>
        </div>
        <nav class="app-nav" aria-label="Workbench sections">
          ${nav}
        </nav>
        <div class="header-actions">
          <button class="nav-button resources-btn" id="open_resources" aria-label="Open resources">Resources</button>
        <div class="theme-toggle" role="group" aria-label="Theme">
            <button data-theme="light">Light</button>
            <button data-theme="dark" class="active">Dark</button>
            <button data-theme="auto">Auto</button>
          </div>
          <div class="version-label">v${state.appVersion}</div>
        </div>
      </header>
      <div id="resources_backdrop" class="drawer-backdrop"></div>
      <aside id="resources_drawer" class="drawer-panel drawer-left">
        <div class="drawer-header">
          <div class="drawer-title">Resources</div>
          <button class="icon-button" id="close_resources" aria-label="Close resources">x</button>
        </div>
        <div class="drawer-body">
          <p class="muted">Quick access to built-in assets for the Metadata module.</p>
          <div class="button-row">
            <button id="resources_prompt_download">Download Scraper Prompt</button>
          </div>
          <div class="meta-line">File: metadata-scraper-prompt.txt</div>
        </div>
      </aside>
      <main id="page" class="page-content"></main>
    </div>
  `;

  app.querySelectorAll("button[data-route]").forEach((btn) => {
    btn.addEventListener("click", () => setRoute(btn.dataset.route));
  });

  app.querySelectorAll(".theme-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const theme = btn.dataset.theme;
      applyTheme(theme);
      app.querySelectorAll(".theme-toggle button").forEach((b) => {
        b.classList.toggle("active", b.dataset.theme === theme);
      });
    });
  });

  // Ensure dark is default active
  app.querySelectorAll(".theme-toggle button").forEach((b) => {
    b.classList.toggle("active", b.dataset.theme === "dark");
  });

  const resourcesBtn = app.querySelector("#open_resources");
  const resourcesDrawer = app.querySelector("#resources_drawer");
  const resourcesBackdrop = app.querySelector("#resources_backdrop");
  const resourcesClose = app.querySelector("#close_resources");
  const resourcesPromptDownload = app.querySelector("#resources_prompt_download");

  function closeResources() {
    resourcesDrawer.classList.remove("open");
    resourcesBackdrop.classList.remove("show");
  }

  resourcesBtn.addEventListener("click", () => {
    resourcesDrawer.classList.add("open");
    resourcesBackdrop.classList.add("show");
  });

  resourcesClose.addEventListener("click", closeResources);
  resourcesBackdrop.addEventListener("click", closeResources);

  resourcesPromptDownload.addEventListener("click", () => {
    const blob = new Blob([metadataScraperPrompt], { type: "text/plain" });
    downloadBlob(blob, "metadata-scraper-prompt.txt");
  });
}

function renderRoute() {
  const page = document.querySelector("#page");
  if (!page) return;
  let route = currentRoute();
  const ready = isMetadataReady();
  const preMetadataRoutes = new Set(["#/metadata", "#/guide", "#/evidence-guide"]);
  if (!ready && !preMetadataRoutes.has(route.path)) {
    route = routes.find((r) => r.path === "#/guide") ?? routes[0];
    setRoute(route.path);
  }
  document.querySelectorAll("button[data-route]").forEach((btn) => {
    const allowedBeforeMetadata = preMetadataRoutes.has(btn.dataset.route);
    btn.disabled = !ready && !allowedBeforeMetadata;
    btn.classList.toggle("disabled", btn.disabled);
    btn.classList.toggle("active", btn.dataset.route === route.path);
  });
  document.querySelectorAll(".drawer-panel.open").forEach((el) => {
    el.classList.remove("open");
  });
  document.querySelectorAll(".drawer-backdrop.show").forEach((el) => {
    el.classList.remove("show");
  });
  page.classList.remove("page-enter");
  page.dataset.route = route.path;
  void page.offsetWidth;
  page.classList.add("page-enter");
  route.render(page);
}

const v1ExplorerBridgeScript = `
<script>
window.CASEWORKBENCH_CONTEXT = null;
window.addEventListener("message", function(event) {
  var data = event.data || {};
  if (data.type !== "CASEWORKBENCH_CONTEXT") return;
  window.CASEWORKBENCH_CONTEXT = data.payload;
  document.documentElement.setAttribute("data-caseworkbench-bridge", "ready");
  var target = document.getElementById("caseworkbench-bridge-status");
  if (!target) {
    target = document.createElement("div");
    target.id = "caseworkbench-bridge-status";
    target.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:9999;padding:8px 10px;border:1px solid #2b6f74;background:#061013;color:#dff7f5;border-radius:8px;font:12px system-ui";
    document.body.appendChild(target);
  }
  var count = data.payload && data.payload.warehouse_state && Array.isArray(data.payload.warehouse_state.profiles)
    ? data.payload.warehouse_state.profiles.length
    : 0;
  target.textContent = "Caseworkbench context: " + (data.payload.case_number || "unknown") + " | V1 profiles: " + count;
});
<\/script>`;

const v1EngineExplorerSrcDoc = v1EngineExplorerHtml.includes("</body>")
  ? v1EngineExplorerHtml.replace("</body>", `${v1ExplorerBridgeScript}</body>`)
  : `${v1EngineExplorerHtml}${v1ExplorerBridgeScript}`;

function defaultPlanMetadata() {
  const empty = { value: "unknown", citations: [] };
  return {
    schema_version: SCHEMA_VERSION,
    meta: {
      case_number: { ...empty },
      case_processing_section: { ...empty },
      notes: { ...empty }
    },
    plan: {
      plan_name: { ...empty },
      plan_number: { ...empty },
      ein: { ...empty },
      actuary: { ...empty },
      auditor: { ...empty },
      plan_sponsor_name: { ...empty },
      plan_type: { ...empty },
      effective_date: { ...empty },
      termination_date: { ...empty },
      termination_type: { ...empty },
      trusteeship_date: { ...empty },
      nod_date: { ...empty },
      noit_date: { ...empty },
      bpd_bankruptcy: { ...empty },
      dobf: { ...empty },
      employer_status: { ...empty },
      facility_closing_date: { ...empty },
      successor_plan: { ...empty },
      plan_assets: { ...empty },
      sparr: { ...empty },
      funding_status: { ...empty },
      valuation_date: { ...empty },
      pbgc_case_status: { ...empty },
      participant_count: { ...empty },
      pbgc_lump_sum_first_segment: { ...empty },
      pbgc_lump_sum_second_segment: { ...empty },
      pbgc_lump_sum_third_segment: { ...empty },
      pbgc_annuity_immediate_rate: { ...empty },
      pbgc_annuity_thereafter_rate: { ...empty }
    },
    documents: [],
    other_attributes: []
  };
}

function sortJsonKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortJsonKeys);
  if (obj && typeof obj === "object") {
    return Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortJsonKeys(obj[key]);
        return acc;
      }, {});
  }
  return obj;
}

function stringifyStable(obj) {
  return JSON.stringify(sortJsonKeys(obj), null, 2);
}

function planContextHtml() {
  if (!state.planMetadata) return "";
  const planName = getPlanValue(state.planMetadata, "plan_name") || "unknown";
  const caseNo = state.planMetadata?.meta?.case_number?.value ?? "unknown";
  return `
    <div class="case-context" data-plan-context>
      <div><span>Plan</span><b>${escapeHtml(planName)}</b></div>
      <div><span>Case</span><b>${escapeHtml(caseNo)}</b></div>
      <div><span>Metadata Hash</span><b data-metadata-hash>computing...</b></div>
    </div>
  `;
}

function hydratePlanContext(container) {
  const hashEl = container.querySelector("[data-metadata-hash]");
  if (!hashEl || !state.planMetadata) return;
  sha256HexString(stringifyStable(state.planMetadata))
    .then((hash) => {
      hashEl.textContent = hash.slice(0, 16);
    })
    .catch(() => {
      hashEl.textContent = "hash error";
    });
}

function getR5WorkflowSummary() {
  return state.caseWorkflow.r5Summary ?? (state.v1Warehouse.r5Profile
    ? {
        profile: state.v1Warehouse.r5Profile,
        source_files: state.v1Warehouse.r5Profile.source_files ?? [],
        input_hashes: state.v1Warehouse.r5Profile.input_hashes ?? {},
        loaded_at_utc: "unknown"
      }
    : null);
}

function getSelectedV1Summary() {
  return state.caseWorkflow.selectedV1 ?? state.v1Warehouse.selectedCandidate ?? null;
}

function getSyntheticPopulationSummary() {
  return state.caseWorkflow.syntheticPopulation ?? state.caseWorkflow.moduleRuns?.["synthetic-population"] ?? null;
}

function workflowInputStatus() {
  const metadataReady = isMetadataReady();
  const r5Summary = getR5WorkflowSummary();
  const selectedV1 = getSelectedV1Summary();
  const syntheticPopulation = getSyntheticPopulationSummary();
  return {
    metadata: {
      ready: metadataReady,
      label: metadataReady ? "PlanMetadata saved" : "PlanMetadata missing",
      detail: metadataReady
        ? `${state.planMetadata?.meta?.case_number?.value ?? "unknown"}`
        : "Start in Metadata and save a complete PlanMetadata JSON."
    },
    r5: {
      ready: !!r5Summary,
      label: r5Summary ? "R5 loaded" : "R5 missing",
      detail: r5Summary
        ? `${r5Summary.source_files?.length ?? 0} file(s), domains: ${(r5Summary.profile?.recognized_domains ?? []).join(", ") || "none"}`
        : "Load R5 summary JSON in V1 Explorer."
    },
    v1: {
      ready: !!selectedV1,
      label: selectedV1 ? "V1 selected" : "V1 not selected",
      detail: selectedV1
        ? `${selectedV1.workbook_name ?? selectedV1.candidate_record_id ?? "selected candidate"}`
        : "Import approved engines, rank candidates, then select one."
    },
    synthetic: {
      ready: !!syntheticPopulation,
      label: syntheticPopulation ? "Synthetic population ready" : "Synthetic population missing",
      detail: syntheticPopulation
        ? `${syntheticPopulation.row_count ?? "unknown"} rows, ${syntheticPopulation.field_count ?? "unknown"} fields, seed ${syntheticPopulation.seed ?? "unknown"}`
        : "Generate no-PII test population in Synthetic Population."
    }
  };
}

function renderWorkflowStatePanel(options = {}) {
  const statuses = workflowInputStatus();
  const keys = options.keys ?? ["metadata", "r5", "v1"];
  return `
    <div class="workflow-state-panel">
      <div class="workflow-state-title">${escapeHtml(options.title ?? "Current Case Inputs")}</div>
      <div class="workflow-state-grid">
        ${keys
          .map((key) => {
            const item = statuses[key];
            return `
              <div class="workflow-state-item ${item.ready ? "ready" : "missing"}">
                <span>${escapeHtml(item.label)}</span>
                <b>${item.ready ? "Ready" : "Needed"}</b>
                <small>${escapeHtml(item.detail)}</small>
              </div>`;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderCanonicalDeliverablesPanel() {
  return `
    <div class="canonical-panel">
      <div class="workflow-state-title">Canonical Deliverables</div>
      <div class="canonical-grid">
        ${canonicalDeliverables
          .map(
            (item) => `
              <button class="canonical-item" data-guide-route="${escapeHtml(item.route)}">
                <span>${escapeHtml(item.status)}</span>
                <b>${escapeHtml(item.outputName)}</b>
                <small>${escapeHtml(item.summary)}</small>
              </button>`
          )
          .join("")}
      </div>
    </div>
  `;
}

function deliverableCards() {
  return [
    {
      route: "#/plan-summary",
      title: "R5 Plan Summary",
      status: "Functional legacy generator",
      outputName: "########R5.docx",
      description: "Generate ########R5.docx from PlanMetadata, R5Summary.json, and the provided Plan Summary template.",
      inputs: ["PlanMetadata", "R5Summary.json from scraper", "Plan Summary DOCX template", "Cited plan documents"],
      action: "Generate R5",
      upstreamInputs: ["metadata", "r5"]
    },
    {
      route: "#/del",
      title: "DEL Data Elements",
      status: "Needs generator",
      outputName: "########DEL.pdf",
      description: "Produce the Data Element List from PlanMetadata, R5Summary.json, and DD.csv.",
      inputs: artifactModuleConfigs.del.requiredInputs,
      action: "Package DEL inputs",
      upstreamInputs: artifactModuleConfigs.del.upstreamInputs
    },
    {
      route: "#/synthetic-population",
      title: "Synthetic Population",
      status: "Testing support",
      outputName: "########SyntheticPopulation.zip",
      description: "Generate deterministic no-PII clean and dirty population files for testing downstream modules.",
      inputs: ["PlanMetadata", "DD.csv", "Validated R5Summary.json when available", "DEL package when available", "Seed", "Row count", "Scenario mix"],
      action: "Generate synthetic population",
      upstreamInputs: ["metadata", "r5", "data-elements"]
    },
    {
      route: "#/factors",
      title: "Plan Factors",
      status: "Needs PF integration",
      outputName: "########PF.xlsx",
      description: "Produce the Plan Factors workbook with mortality, interest, optional forms, and factor tables.",
      inputs: [...artifactModuleConfigs.factors.requiredInputs, "Synthetic population for testing when available"],
      action: "Package PF inputs",
      upstreamInputs: [...artifactModuleConfigs.factors.upstreamInputs, "synthetic"]
    },
    {
      route: "#/436",
      title: "436 Limitation Analysis",
      status: "Input map incomplete",
      outputName: "436 Limitation Analysis.docx",
      description: "Package limitation memo evidence, amendments, freeze references, and template inputs.",
      inputs: artifactModuleConfigs.section436.requiredInputs,
      action: "Package 436 inputs",
      upstreamInputs: artifactModuleConfigs.section436.upstreamInputs
    },
    {
      route: "#/estimated-adjustments",
      title: "Estimated Adjustments",
      status: "Input map incomplete",
      outputName: "Estimated Benefit Adjustments Analysis.docx",
      description: "Package payment history, current benefit status, estimates, and adjustment workpapers.",
      inputs: artifactModuleConfigs.estimatedAdjustments.requiredInputs,
      action: "Package adjustment inputs",
      upstreamInputs: artifactModuleConfigs.estimatedAdjustments.upstreamInputs
    },
    {
      route: "#/estimated-administration",
      title: "Estimated Administration",
      status: "Input map incomplete",
      outputName: "Estimated Benefit Administration Analysis.docx",
      description: "Package payee status, operational extracts, notices, and administration notes.",
      inputs: artifactModuleConfigs.estimatedAdministration.requiredInputs,
      action: "Package administration inputs",
      upstreamInputs: artifactModuleConfigs.estimatedAdministration.upstreamInputs
    },
    {
      route: "#/v1-engine-explorer",
      title: "Calculation Engine / V1",
      status: "Primary workflow",
      outputName: "########V1.xlsx",
      description: "Rank approved V1 engines against R5 evidence, audit DAG/AST similarity, and choose or build the production V1.",
      inputs: ["PlanMetadata", "R5Summary.json", "Approved V1Summary JSON files", "BCV Add-in formula inventory", "DEL/PF context when available", "Synthetic population for testing when available"],
      action: "Rank and select V1",
      upstreamInputs: ["metadata", "r5", "synthetic"]
    },
    {
      route: "#/v1-audit",
      title: "V1 Match Audit",
      status: "Audit preview",
      description: "Inspect similarity evidence and workbook reconstruction assumptions before trusting a V1 candidate.",
      inputs: ["Ranked V1 candidates", "Imported approved V1Summary JSON files", "R5 summary profile"],
      action: "Audit V1 match",
      upstreamInputs: ["metadata", "r5", "v1"]
    },
    {
      route: "#/letters-bcv",
      title: "BSRS / BCV Config",
      status: "Sample-dependent",
      outputName: "########S1.cfg",
      description: "Package letter templates, variable maps, BSRS functions, and V1-linked config samples.",
      inputs: artifactModuleConfigs.lettersBcv.requiredInputs,
      action: "Package BSRS inputs",
      upstreamInputs: artifactModuleConfigs.lettersBcv.upstreamInputs
    }
  ];
}

function upstreamReadiness(keys = []) {
  const statuses = workflowInputStatus();
  const required = keys.length ? keys : ["metadata"];
  const ready = required.filter((key) => statuses[key]?.ready).length;
  return { ready, total: required.length, complete: ready === required.length };
}

const inputRequirementMatrix = [
  {
    id: "plan-summary-r5",
    title: "R5 / ########R5.docx",
    route: "#/plan-summary",
    pureInputs: [
      "R5Summary.json produced by the current scraper contract, with citations for known facts",
      "Plan Summary DOCX template, currently reference/Plan Summary Shell.docx unless superseded",
      "Case metadata: case number, plan name, DOPT, DOTR, BPD, DOBF, NOD, NOIT, SPARR, assets, assigned actuary/auditor",
      "Plan documents: base plan documents, restatements, amendments, SPDs, CBAs, freeze amendments, adoption/effective dates",
      "Manual fact entry is acceptable when clean PDFs cannot be used, but known facts still need doc_id/page/locator citations"
    ],
    upstreamOutputs: ["PlanMetadata"],
    governingReferences: ["reference/r5-items.txt", "reference/plan-summary-rules.txt", "reference/Plan Summary Shell.docx", "reference/metadata-scraper-prompt.txt"],
    readinessKeys: ["metadata"]
  },
  {
    id: "data-elements",
    title: "DEL / ########DEL.pdf",
    route: "#/del",
    pureInputs: [
      "R5Summary.json, PlanMetadata, and DD.csv are the mechanical core inputs for the DEL deliverable",
      "Participant/census/payee records with no repo PII",
      "Source priority for each field: payroll, plan administrator files, paying agent files, participant forms, participant files",
      "Field-level citations or source notes for manually entered values"
    ],
    upstreamOutputs: ["PlanMetadata", "R5Summary.json/profile"],
    governingReferences: ["reference/DD.csv", "reference/CASE_PROCESSING.txt", "reference/case.schema.json"],
    readinessKeys: ["metadata", "r5"]
  },
  {
    id: "plan-factors",
    title: "Plan Factors / ########PF.xlsx",
    route: "#/factors",
    pureInputs: [
      "R5Summary.json, PlanMetadata, DD.csv, mortality basis, interest basis, optional forms, and factor source tables",
      "Plan factor rules from R5/plan documents: early, late, form conversion, actuarial equivalence, lump sum, optional forms",
      "PBGC/plan assumption basis: interest, mortality, lookback/stability periods, thresholds",
      "PF template or workbook fixture when producing Excel output; external PF work may need to be imported from another repository"
    ],
    upstreamOutputs: ["PlanMetadata", "R5Summary.json/profile", "Selected V1 engine when available"],
    governingReferences: ["reference/README - plan_factors.md", "reference/24884900PF.v0.7.13.xlsx", "reference/plan-summary-rules.txt"],
    readinessKeys: ["metadata", "r5", "v1"]
  },
  {
    id: "synthetic-population",
    title: "Synthetic Population / ########SyntheticPopulation.zip",
    route: "#/synthetic-population",
    pureInputs: [
      "DD.csv field dictionary, preferably the governing reference/DD.csv",
      "PlanMetadata for case number, plan number, DOPT, DOBF, and manifest hashes",
      "Validated R5Summary.json and DEL package when available to guide required field selection",
      "Synthetic generation settings: row count, seed, scenario mix, dirty issue rates"
    ],
    upstreamOutputs: ["PlanMetadata", "R5Summary.json/profile", "DEL package when available"],
    governingReferences: ["reference/DD.csv", "https://github.com/ErChulo/pbgc-mock-population-module"],
    readinessKeys: ["metadata", "r5", "data-elements"]
  },
  {
    id: "section-436",
    title: "436 Limitation Analysis.docx",
    route: "#/436",
    pureInputs: [
      "The complete input map is still incomplete; keep unknown/na placeholders until the governing template and rules are mapped",
      "DOPT, DOTR, BPD, DOBF, plan year start/end",
      "Freeze amendments and plan provisions related to accrual restrictions",
      "AFTAP periods, certification facts, CBA ratification/effective/expiration facts when applicable"
    ],
    upstreamOutputs: ["PlanMetadata", "R5 summary/profile"],
    governingReferences: ["reference/Benefit Limitations Under PPA 2006 - Section 436.pdf", "reference/pbgc-436-webapp-v0.2.0", "reference/plan-summary-rules.txt"],
    readinessKeys: ["metadata", "r5"]
  },
  {
    id: "estimated-benefit-adjustments",
    title: "Estimated Benefit Adjustments Analysis.docx",
    route: "#/estimated-adjustments",
    pureInputs: [
      "The complete input map is still incomplete; use uploaded workpapers and unknown/na placeholders until mapped",
      "Current payee list and current benefit amounts",
      "Estimated benefit extracts and prior benefit estimates",
      "Payment history since DOPT, overpayment/underpayment facts, current pay source/status",
      "Adjustment threshold and limitation evidence"
    ],
    upstreamOutputs: ["PlanMetadata", "R5 summary/profile", "Selected V1 engine when available", "Plan Factors when available"],
    governingReferences: ["reference/CASE_PROCESSING.txt", "reference/Computation and Netting of Post-DOPT Overpayments and Underpayments.pdf", "reference/Benefit Corrections.pdf"],
    readinessKeys: ["metadata", "r5", "v1", "plan-factors"]
  },
  {
    id: "estimated-benefit-administration",
    title: "Estimated Benefit Administration Analysis.docx",
    route: "#/estimated-administration",
    pureInputs: [
      "The complete input map is still incomplete; use uploaded operational notes and unknown/na placeholders until mapped",
      "Participant/payee administration extracts",
      "Current payment status, PIF/verification status, notices, operational notes",
      "Benefit form/payment frequency facts and administration constraints"
    ],
    upstreamOutputs: ["PlanMetadata", "R5 summary/profile", "DEL package when available"],
    governingReferences: ["reference/CASE_PROCESSING.txt", "reference/Frequency of Benefit Payments.pdf", "reference/Benefit Payments Prior to Trusteeship.pdf"],
    readinessKeys: ["metadata", "r5", "data-elements"]
  },
  {
    id: "v1-engine",
    title: "V1 / ########V1.xlsx",
    route: "#/v1-engine-explorer",
    pureInputs: [
      "Approved V1Summary JSON files selected by upload from local reference material",
      "R5Summary.json/profile for the current case",
      "Engine choice evidence: similarity by plan provisions, population runs, workbook DAG, and formula AST",
      "BCV Add-in formulas are treated as opaque formulas and should be preserved when relevant",
      "DEL field model and participant input schema when participant calculations are implemented"
    ],
    upstreamOutputs: ["PlanMetadata", "R5 summary/profile", "Plan Factors when available"],
    governingReferences: ["reference/raw-approved-v1-engines", "reference/run_catalog_seed.v0.7.0.json", "reference/output_contract_seed.v0.7.0.json", "reference/sample-2-v1.xlsm"],
    readinessKeys: ["metadata", "r5", "v1"]
  },
  {
    id: "bsrs-bcv",
    title: "BSRS / ########S1.cfg",
    route: "#/letters-bcv",
    pureInputs: [
      "User-provided S1/BSRS samples tied to V1 samples when available",
      "BCV participant field requirements and letter variable mappings",
      "BSRS statement/recalculation/OFA config templates",
      "Letter generation rules, print criteria, and allowed statement functions"
    ],
    upstreamOutputs: ["PlanMetadata", "R5 summary/profile", "DEL package when available", "Selected V1 engine outputs when available"],
    governingReferences: ["reference/DD.csv", "reference/BSRS functions.txt", "reference/sample-bsrs-statement-config.txt", "reference/sample-bsrs-baseData-config.txt"],
    readinessKeys: ["metadata", "r5", "data-elements", "v1"]
  }
];

function inputRequirementStatus(key) {
  const shared = workflowInputStatus();
  if (shared[key]) return shared[key];
  const run = state.caseWorkflow.moduleRuns?.[key];
  if (run) {
    return {
      ready: true,
      label: `${key} package generated`,
      detail: `${run.output_name ?? "artifact"} at ${run.generated_at_utc ?? "unknown time"}`
    };
  }
  return {
    ready: false,
    label: `${key} package missing`,
    detail: "Generate or package this upstream module when available."
  };
}

function buildInputRequirementRows() {
  return inputRequirementMatrix.map((item) => {
    const statuses = item.readinessKeys.map((key) => ({ key, ...inputRequirementStatus(key) }));
    return {
      ...item,
      readiness: statuses,
      ready_count: statuses.filter((status) => status.ready).length,
      required_count: statuses.length
    };
  });
}

const ivsDocumentClassRegistry = [
  {
    code: "3A",
    title: "Notice of Determination",
    index: "INDEX 3: Trusteeship Documents (PBGC)",
    searchUse: "Trusteeship/NOD evidence, termination timeline, and case status facts."
  },
  {
    code: "3B",
    title: "Trusteeship Agreement",
    index: "INDEX 3: Trusteeship Documents (PBGC)",
    searchUse: "DOTR/trusteeship authority and legal appointment evidence."
  },
  {
    code: "5A",
    title: "Plan Amendments and Restatements",
    index: "INDEX 5: Pension Plan Documents",
    searchUse: "Plan provisions, freezes, optional forms, eligibility, benefit formulas, and effective-date history."
  },
  {
    code: "5A1",
    title: "Summary Plan Description (SPD)",
    index: "INDEX 5: Pension Plan Documents",
    searchUse: "Participant-facing plan provisions and benefit summaries."
  },
  {
    code: "5B",
    title: "Original Plan Documents",
    index: "INDEX 5: Pension Plan Documents",
    searchUse: "Original governing plan provisions and plan setup."
  },
  {
    code: "5C",
    title: "Union Contracts and Amendments",
    index: "INDEX 5: Pension Plan Documents",
    searchUse: "CBA-covered benefit classes, service rules, and negotiated changes."
  },
  {
    code: "8A",
    title: "PBGC Internal Gross Level Participant Data and Non-ASD Spreadsheets",
    index: "INDEX 8: Additional Plan and Participant Data/Multi-Employer Plan Data",
    searchUse: "Post-DOPT participant/census/payee extracts and valuation data."
  },
  {
    code: "8B",
    title: "Prior Plan Administrator Data",
    index: "INDEX 8: Additional Plan and Participant Data/Multi-Employer Plan Data",
    searchUse: "Pre-DOPT administrator files, participant data, and source records."
  },
  {
    code: "8C",
    title: "Employee Contributions",
    index: "INDEX 8: Additional Plan and Participant Data/Multi-Employer Plan Data",
    searchUse: "Employee contribution balances and contributory benefit evidence."
  },
  {
    code: "8D",
    title: "Plan Assumption",
    index: "INDEX 8: Additional Plan and Participant Data/Multi-Employer Plan Data",
    searchUse: "DERF loads, payee records, payment assumption, and benefit-status evidence."
  },
  {
    code: "9C",
    title: "Actuarial Correspondence",
    index: "INDEX 9: Correspondence",
    searchUse: "Actuarial memos, questions, and plan-level correspondence."
  },
  {
    code: "10",
    title: "Pre-DOPT and Multiemployer Actuarial Data",
    index: "INDEX 10: Pre-DOPT and Multiemployer Actuarial Data",
    searchUse: "Pre-DOPT valuation, actuarial assumptions, and plan actuarial workpapers."
  },
  {
    code: "11A",
    title: "Participant Data Audits",
    index: "INDEX 11: Audit Documents",
    searchUse: "Participant data audit results and data correction evidence."
  },
  {
    code: "11C",
    title: "Source Document Audit",
    index: "INDEX 11: Audit Documents",
    searchUse: "Best-source determinations and source-document support."
  },
  {
    code: "11C1",
    title: "Data Element Listing",
    index: "INDEX 11: Audit Documents",
    searchUse: "Field requirements and best available source for each data element."
  },
  {
    code: "12B",
    title: "Actuarial Case Memo",
    index: "INDEX 12: Actuarial Case Reports",
    searchUse: "Actuarial closeout conclusions, PA guidance, and case memo evidence."
  },
  {
    code: "12D",
    title: "Plan Abstract/Plan Summary/APAD",
    index: "INDEX 12: Actuarial Case Reports",
    searchUse: "Existing plan summary and programming guides for benefit calculations."
  },
  {
    code: "12E",
    title: "Plan Conversion Factor",
    index: "INDEX 12: Actuarial Case Reports",
    searchUse: "J&S, early retirement, late retirement, and conversion-factor support."
  },
  {
    code: "12F",
    title: "Valuation Spreadsheets/Listings",
    index: "INDEX 12: Actuarial Case Reports",
    searchUse: "Population/tab listings, valuation worksheets, and participant status breakdowns."
  },
  {
    code: "12H",
    title: "Benefit Statement Recalculation Program Instructions",
    index: "INDEX 12: Actuarial Case Reports",
    searchUse: "BSRS/benefit statement recalculation instructions."
  },
  {
    code: "12I",
    title: "Samples of ARIEL Benefit and Retirement Statements",
    index: "INDEX 12: Actuarial Case Reports",
    searchUse: "Sample benefit and retirement statements."
  },
  {
    code: "12J",
    title: "Samples of Detailed Calculations",
    index: "INDEX 12: Actuarial Case Reports",
    searchUse: "Historical calculation examples and formula behavior evidence."
  },
  {
    code: "14C",
    title: "Distribution Data",
    index: "INDEX 14: Standard Termination",
    searchUse: "Distribution schedules and participant benefit calculation data."
  },
  {
    code: "20D",
    title: "Missing Participant Plan-Level Correspondence",
    index: "INDEX 20: Missing Participant Program",
    searchUse: "Missing participant correspondence and plan-level MP evidence."
  }
];

function ivsClassByCode(code) {
  return ivsDocumentClassRegistry.find((item) => item.code === code);
}

const evidenceRequirements = [
  {
    id: "EV-META-001",
    module: "Metadata",
    route: "#/metadata",
    requiredFact: "Plan identity, case number, DOPT, DOTR, NOD, NOIT, BPD, DOBF, assigned staff, and plan status.",
    documentClassCodes: ["3A", "3B", "9C", "12B"],
    scraperContract: "reference/metadata-scraper-prompt.txt",
    acceptedInput: "PlanMetadata JSON upload or manual form entry",
    manualFallback: "Enter unknown/na with notes until the IVS source is found.",
    citationRule: "Known facts require doc_id, page, and locator/snippet when available.",
    downstreamImpact: ["All manifests", "R5", "DEL", "PF", "436", "Estimated Analyses", "V1", "BSRS/BCV"]
  },
  {
    id: "EV-R5-001",
    module: "R5 / Plan Summary",
    route: "#/plan-summary",
    requiredFact: "Plan provisions across the full plan history, including amendments, restatements, SPDs, CBAs, freezes, optional forms, and eligibility rules.",
    documentClassCodes: ["5A", "5A1", "5B", "5C", "12D"],
    scraperContract: "reference/r5-scraper-prompt.md / web asset r5-scraper-prompt.v3.md",
    acceptedInput: "R5Summary.json plus Plan Summary DOCX template",
    manualFallback: "Enter cited R5 facts manually; ambiguous provisions remain unknown/na.",
    citationRule: "Every known R5 answer should carry document, page, and locator evidence.",
    downstreamImpact: ["########R5.docx", "DEL", "PF", "436", "Estimated Analyses", "V1"]
  },
  {
    id: "EV-DEL-001",
    module: "DEL",
    route: "#/del",
    requiredFact: "Required participant, beneficiary, alternate payee, payment, and calculation fields, with best-source evidence for each field.",
    documentClassCodes: ["8A", "8B", "8C", "8D", "11A", "11C", "11C1", "12F"],
    scraperContract: "planned DEL/source-priority scraper JSON schema",
    acceptedInput: "R5Summary.json, DD.csv, source-priority JSON, participant source files by browser upload",
    manualFallback: "Record required field as missing/unknown and name the IVS class to search next.",
    citationRule: "Known source-priority decisions should cite the document class and document locator.",
    downstreamImpact: ["########DEL.pdf", "Synthetic Population", "PF", "V1", "BSRS/BCV"]
  },
  {
    id: "EV-PF-001",
    module: "Plan Factors",
    route: "#/factors",
    requiredFact: "Mortality, interest, optional form, early/late retirement, J&S, and plan conversion-factor rules.",
    documentClassCodes: ["5A", "5A1", "5B", "10", "12D", "12E"],
    scraperContract: "planned planFactors.json scraper/schema",
    acceptedInput: "R5Summary.json, factor workpapers/tables, PF template/workbook, cited factor assumptions",
    manualFallback: "Enter cited assumption manually or keep factor unknown/na.",
    citationRule: "Factor values and formulas require source citations; do not invent values.",
    downstreamImpact: ["########PF.xlsx", "V1"]
  },
  {
    id: "EV-436-001",
    module: "436",
    route: "#/436",
    requiredFact: "Section 436 applicability, freeze/amendment evidence, AFTAP/CBA facts, BPD/DOBF dates, and limitation memo facts.",
    documentClassCodes: ["5A", "5B", "9C", "10", "12B", "12D"],
    scraperContract: "planned 436 evidence scraper/schema",
    acceptedInput: "436 evidence JSON, plan amendments, memo notes, and template input package",
    manualFallback: "Mark applicability unknown and route to human review.",
    citationRule: "Applicability conclusions require cited facts plus review notes.",
    downstreamImpact: ["436 Limitation Analysis.docx", "V1"]
  },
  {
    id: "EV-EST-001",
    module: "Estimated Analyses",
    route: "#/estimated-adjustments",
    requiredFact: "Payment history, current benefit status, estimated benefit extracts, payee status, PIF/verification status, and operational notes.",
    documentClassCodes: ["8A", "8D", "9C", "11A", "12B", "12F", "14C", "20D"],
    scraperContract: "planned estimated-analysis scraper/schema",
    acceptedInput: "Payment/current-benefit JSON, workpapers, admin extracts, source notes",
    manualFallback: "Preserve gap as warning and continue with explicit unknown/na placeholders.",
    citationRule: "Payment and payee facts require source file/class and locator when available.",
    downstreamImpact: ["Estimated Benefit Adjustments Analysis.docx", "Estimated Benefit Administration Analysis.docx"]
  },
  {
    id: "EV-V1-001",
    module: "V1",
    route: "#/v1-engine-explorer",
    requiredFact: "Candidate engine evidence, population tab structure, run structure, formula behavior, output field needs, and BCV/ATPBGC formula preservation.",
    documentClassCodes: ["12D", "12E", "12F", "12H", "12J"],
    scraperContract: "approved V1Summary.json import plus v1-tab-pattern-corpus.json and v1-tab-blueprint.json",
    acceptedInput: "Approved V1Summary JSON files, R5Summary.json, tab corpus, tab blueprint, selected candidate",
    manualFallback: "Select closest approved candidate with warnings or mark from-scratch requirement.",
    citationRule: "Selected V1 must cite ranking evidence, corpus evidence, and review warnings.",
    downstreamImpact: ["########V1.xlsx", "BSRS/BCV", "Estimated Analyses"]
  },
  {
    id: "EV-BSRS-001",
    module: "Letters / BCV",
    route: "#/letters-bcv",
    requiredFact: "Letter variables, BSRS statement/recalculation config, BCV output fields, and sample statement behavior.",
    documentClassCodes: ["12H", "12I", "12J", "20D"],
    scraperContract: "planned BSRS/BCV config scraper/schema",
    acceptedInput: "S1/BSRS samples, variable mappings, V1 output contract, DEL field model",
    manualFallback: "Mark letter variables missing and continue with review warnings.",
    citationRule: "Config variables should trace to DEL/V1 fields or sample config source.",
    downstreamImpact: ["########S1.cfg"]
  }
];

function evidenceStatusForRequirement(req) {
  if (req.id.startsWith("EV-META")) return inputRequirementStatus("metadata");
  if (req.id.startsWith("EV-R5")) return inputRequirementStatus("r5");
  if (req.id.startsWith("EV-DEL")) return inputRequirementStatus("data-elements");
  if (req.id.startsWith("EV-PF")) return inputRequirementStatus("plan-factors");
  if (req.id.startsWith("EV-436")) return inputRequirementStatus("section-436");
  if (req.id.startsWith("EV-EST")) {
    const adj = inputRequirementStatus("estimated-benefit-adjustments");
    const admin = inputRequirementStatus("estimated-benefit-administration");
    return {
      ready: adj.ready && admin.ready,
      label: adj.ready || admin.ready ? "Estimated analysis evidence started" : "Estimated analysis evidence missing",
      detail: `${adj.label}; ${admin.label}`
    };
  }
  if (req.id.startsWith("EV-V1")) return inputRequirementStatus("v1");
  if (req.id.startsWith("EV-BSRS")) return inputRequirementStatus("letters-bcv-config");
  return { ready: false, label: "Evidence missing", detail: "No status rule configured." };
}

function normalizeEvidenceText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function metadataDocumentRegistryEntries() {
  return (state.planMetadata?.documents ?? []).map((doc) => {
    const readEntry = (entry) => (entry && typeof entry === "object" && "value" in entry ? entry.value : entry);
    return {
      doc_id: readEntry(doc.doc_id) ?? "",
      name: readEntry(doc.name) ?? "",
      type: readEntry(doc.type) ?? "",
      notes: readEntry(doc.notes) ?? "",
      raw: doc
    };
  });
}

function documentMatchesIvsClass(doc, ivsClass) {
  const haystack = normalizeEvidenceText([doc.doc_id, doc.name, doc.type, doc.notes].join(" "));
  const code = normalizeEvidenceText(ivsClass.code);
  const title = normalizeEvidenceText(ivsClass.title);
  const index = normalizeEvidenceText(ivsClass.index);
  if (!haystack) return false;
  if (code && new RegExp(`(^| )${code.replace(/\s+/g, "\\s*")}( |$)`).test(haystack)) return true;
  if (title && haystack.includes(title)) return true;
  return index
    .split(" ")
    .filter((part) => part.length > 4)
    .some((part) => haystack.includes(part)) &&
    title
      .split(" ")
      .filter((part) => part.length > 4)
      .some((part) => haystack.includes(part));
}

function coverageCitationHealth(req) {
  if (req.id === "EV-META-001") {
    const metadata = state.planMetadata;
    if (!metadata) {
      return { status: "missing", detail: "PlanMetadata is not loaded.", known_without_citations: [] };
    }
    const missing = [];
    REQUIRED_METADATA_FIELDS.forEach((field) => {
      let cur = metadata;
      field.path.forEach((part) => {
        cur = cur?.[part];
      });
      const value = String(cur?.value ?? "").trim().toLowerCase();
      const hasKnownValue = value && value !== "unknown" && value !== "na" && value !== "n/a";
      if (hasKnownValue && !(cur?.citations ?? []).length) missing.push(field.label);
    });
    return {
      status: missing.length ? "warning" : "ready",
      detail: missing.length ? `${missing.length} known metadata field(s) lack citations.` : "Known metadata fields have citation arrays or no known value.",
      known_without_citations: missing
    };
  }
  if (req.id === "EV-R5-001") {
    const validations = state.caseWorkflow.r5Summary?.validations ?? [];
    if (!validations.length) {
      return { status: "missing", detail: "No R5Summary validation is loaded.", known_without_citations: [] };
    }
    const missingCount = validations.reduce((sum, item) => sum + (item.known_without_citation_count ?? 0), 0);
    const missingItems = validations.flatMap((item) => item.known_without_citations ?? []).slice(0, 25);
    return {
      status: missingCount ? "warning" : "ready",
      detail: missingCount ? `${missingCount} known R5 answer(s) lack citations.` : "Loaded R5 validation has no known answer citation gaps.",
      known_without_citations: missingItems
    };
  }
  const runKeyByRequirement = {
    "EV-DEL-001": "data-elements",
    "EV-PF-001": "plan-factors",
    "EV-436-001": "section-436",
    "EV-EST-001": "estimated-benefit-adjustments",
    "EV-V1-001": "v1-tab-blueprint",
    "EV-BSRS-001": "letters-bcv-config"
  };
  const runKey = runKeyByRequirement[req.id];
  const hasRun = !!state.caseWorkflow.moduleRuns?.[runKey];
  return {
    status: hasRun ? "warning" : "missing",
    detail: hasRun
      ? "A module package exists; detailed citation validation is not implemented for this package yet."
      : "No module package is available yet for citation validation.",
    known_without_citations: []
  };
}

function evaluateEvidenceCoverage(req) {
  const readiness = evidenceStatusForRequirement(req);
  const docs = metadataDocumentRegistryEntries();
  const expectedClasses = req.documentClassCodes.map(ivsClassByCode).filter(Boolean);
  const matchedClasses = expectedClasses
    .map((ivsClass) => ({
      ...ivsClass,
      matched_documents: docs
        .filter((doc) => documentMatchesIvsClass(doc, ivsClass))
        .map((doc) => ({
          doc_id: doc.doc_id || "unknown",
          name: doc.name || "unknown",
          type: doc.type || "unknown"
        }))
    }))
    .filter((entry) => entry.matched_documents.length);
  const citation = coverageCitationHealth(req);
  const warnings = [];
  if (!readiness.ready) warnings.push(readiness.detail);
  if (!matchedClasses.length) warnings.push("No PlanMetadata document registry entry matched the expected IVS classes.");
  if (citation.status !== "ready") warnings.push(citation.detail);
  const hasAnyEvidence = readiness.ready || matchedClasses.length || citation.status !== "missing";
  const status = warnings.length === 0 ? "ready" : hasAnyEvidence ? "warning" : "missing";
  return {
    requirement_id: req.id,
    module: req.module,
    status,
    readiness,
    expected_ivs_classes: expectedClasses.map((item) => ({ code: item.code, title: item.title })),
    matched_ivs_classes: matchedClasses,
    citation_health: citation,
    downstream_impact: req.downstreamImpact,
    warnings
  };
}

async function buildEvidenceCoverageReport() {
  const planMetadataHash = state.planMetadata
    ? await sha256HexString(stringifyStable(state.planMetadata))
    : "unknown";
  const coverage = evidenceRequirements.map(evaluateEvidenceCoverage);
  const counts = coverage.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    },
    { ready: 0, warning: 0, missing: 0 }
  );
  return {
    meta: {
      app_version: APP_VERSION,
      schema_version: SCHEMA_VERSION,
      module_id: "evidence-requirement-coverage-validator",
      module_version: "0.7.0",
      generated_at_utc: new Date().toISOString(),
      case_number: state.planMetadata?.meta?.case_number?.value ?? "unknown",
      plan_metadata_hash: planMetadataHash
    },
    summary: {
      requirement_count: coverage.length,
      ready_count: counts.ready ?? 0,
      warning_count: counts.warning ?? 0,
      missing_count: counts.missing ?? 0,
      document_registry_count: metadataDocumentRegistryEntries().length
    },
    assumptions: [
      "Coverage is a deterministic readiness validator, not actuarial approval.",
      "IVS class matches use the PlanMetadata document registry text and may require manual refinement.",
      "Module package citation validation is shallow until each module has a final artifact schema."
    ],
    coverage
  };
}

async function buildEvidenceGuideExport() {
  const planMetadataHash = state.planMetadata
    ? await sha256HexString(stringifyStable(state.planMetadata))
    : "unknown";
  const coverageReport = await buildEvidenceCoverageReport();
  return {
    meta: {
      app_version: APP_VERSION,
      schema_version: SCHEMA_VERSION,
      module_id: "guided-evidence-ivs-assistant",
      module_version: "0.7.0",
      generated_at_utc: new Date().toISOString(),
      case_number: state.planMetadata?.meta?.case_number?.value ?? "unknown",
      plan_metadata_hash: planMetadataHash
    },
    source_document_dictionary: {
      governing_reference: "reference/Plan File Types.pdf",
      title: "Plan File Indexing Specification Guide",
      usage: "Use IVS/IPS document class when a required fact is searchable by class rather than by a known named document.",
      classes: ivsDocumentClassRegistry
    },
    requirements: evidenceRequirements.map((req) => ({
      ...req,
      documentClasses: req.documentClassCodes.map(ivsClassByCode).filter(Boolean),
      readiness: evidenceStatusForRequirement(req)
    })),
    coverage_summary: coverageReport.summary
  };
}

function renderEvidenceRequirementCard(req) {
  const status = evidenceStatusForRequirement(req);
  const coverage = evaluateEvidenceCoverage(req);
  const classes = req.documentClassCodes.map(ivsClassByCode).filter(Boolean);
  const primaryClass = classes[0];
  return `
    <details class="requirements-card evidence-card coverage-${escapeHtml(coverage.status)}" ${coverage.status === "missing" ? "open" : ""}>
      <summary>
        <div>
          <b>${escapeHtml(req.module)}</b>
          <span>${escapeHtml(req.requiredFact)}</span>
        </div>
        <span class="coverage-chip ${escapeHtml(coverage.status)}">${escapeHtml(coverage.status)}</span>
      </summary>
      <div class="evidence-card-body">
        <div class="evidence-next-action">
          <b>Next action</b>
          <span>${coverage.status === "ready" ? "Review and proceed to the workflow." : `Search IVS ${primaryClass ? `${primaryClass.code} - ${primaryClass.title}` : "for the listed document class"}, then load scraper JSON or enter the fact manually.`}</span>
        </div>
        <div class="requirements-readiness">
          <div class="${status.ready ? "ready" : "missing"}">
            <b>${status.ready ? "Structured input ready" : "Structured input needed"}</b>
            <span>${escapeHtml(status.label)}</span>
            <small>${escapeHtml(status.detail)}</small>
          </div>
          <div class="${coverage.matched_ivs_classes.length ? "ready" : "missing"}">
            <b>${coverage.matched_ivs_classes.length ? "IVS class matched" : "IVS class needed"}</b>
            <span>${escapeHtml(coverage.matched_ivs_classes.length ? `${coverage.matched_ivs_classes.length} class(es) matched in document registry` : "No matching registry document")}</span>
            <small>${escapeHtml(coverage.expected_ivs_classes.map((cls) => cls.code).join(", "))}</small>
          </div>
          <div class="${coverage.citation_health.status === "ready" ? "ready" : "missing"}">
            <b>${coverage.citation_health.status === "ready" ? "Citation check" : "Citation warning"}</b>
            <span>${escapeHtml(coverage.citation_health.status)}</span>
            <small>${escapeHtml(coverage.citation_health.detail)}</small>
          </div>
        </div>
        <div class="requirements-columns">
          <div>
            <b>Search IVS classes</b>
            <ul>${classes.map((cls) => `<li><b>${escapeHtml(cls.code)}</b> ${escapeHtml(cls.title)}<br/><small>${escapeHtml(cls.searchUse)}</small></li>`).join("")}</ul>
          </div>
          <div>
            <b>Scrape / enter</b>
            <ul>
              <li>Contract: ${escapeHtml(req.scraperContract)}</li>
              <li>Input: ${escapeHtml(req.acceptedInput)}</li>
              <li>Fallback: ${escapeHtml(req.manualFallback)}</li>
            </ul>
          </div>
          <div>
            <b>Why it matters</b>
            <ul>
              <li>Citation: ${escapeHtml(req.citationRule)}</li>
              ${req.downstreamImpact.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </div>
        </div>
        ${coverage.warnings.length ? `<div class="coverage-warning-list"><b>Coverage warnings</b><ul>${coverage.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
        <button class="ghost" data-evidence-route="${escapeHtml(req.route)}">Open workflow</button>
      </div>
    </details>
  `;
}

function renderEvidenceCoverageSummary(report) {
  return `
    <div class="rules-summary-grid">
      <div><span>Ready</span><b>${report.summary.ready_count}</b><small>requirements</small></div>
      <div><span>Warnings</span><b>${report.summary.warning_count}</b><small>requirements</small></div>
      <div><span>Missing</span><b>${report.summary.missing_count}</b><small>requirements</small></div>
    </div>
  `;
}

async function renderEvidenceGuide(container) {
  const readyCount = evidenceRequirements.filter((req) => evidenceStatusForRequirement(req).ready).length;
  const coverageReport = await buildEvidenceCoverageReport();
  const firstBlocking = coverageReport.coverage.find((item) => item.status !== "ready");
  const firstBlockingRequirement = firstBlocking
    ? evidenceRequirements.find((req) => req.id === firstBlocking.requirement_id)
    : null;
  const firstBlockingClass = firstBlocking?.expected_ivs_classes?.[0] ?? null;
  container.innerHTML = `
    <section class="page-hero">
      <div class="page-title">
        <h2>Evidence Guide</h2>
        <p>Translate each missing case fact into IVS document classes, scraper JSON contracts, manual fallback, and downstream impact.</p>
      </div>
      <div class="page-actions">
        <button class="primary" id="download_evidence_guide">Download evidence guide JSON</button>
        <button class="ghost" id="download_evidence_coverage">Download coverage JSON</button>
        <button class="ghost" id="evidence_open_inputs">Input Contracts</button>
        <button class="ghost" id="evidence_open_rules">Technical Rules</button>
      </div>
    </section>

    ${planContextHtml()}

    ${renderWorkflowStatePanel({ title: "Shared Case Inputs", keys: ["metadata", "r5", "v1", "synthetic"] })}

    <div class="workflow-band">
      <h3>Start Here</h3>
      <p class="muted">${firstBlockingRequirement
        ? `Next: ${firstBlockingRequirement.module}. Search IVS ${firstBlockingClass ? `${firstBlockingClass.code} (${firstBlockingClass.title})` : "for the listed document class"}, then load the scraper JSON or enter the fact manually.`
        : "All evidence requirements are ready or warning-level only. Review warnings, then proceed through Case Guide."}</p>
      <div class="button-row">
        <button class="primary" data-evidence-route="${escapeHtml(firstBlockingRequirement?.route ?? "#/guide")}">${firstBlockingRequirement ? `Open ${escapeHtml(firstBlockingRequirement.module)}` : "Open Case Guide"}</button>
        <button class="ghost" id="evidence_open_inputs_top">Input Contracts</button>
      </div>
    </div>

    <div class="banner subtle">
      This is the user-facing evidence flow. Input Contracts and Technical Rules are reference pages for deeper design checks, not separate steps you need to work through every time.
    </div>

    <div class="rules-summary-grid">
      <div><span>Evidence requirements</span><b>${evidenceRequirements.length}</b><small>module-level needs</small></div>
      <div><span>Ready</span><b>${readyCount}</b><small>based on current case state</small></div>
      <div><span>IVS classes</span><b>${ivsDocumentClassRegistry.length}</b><small>seeded from Plan File Types</small></div>
    </div>

    <h3>Evidence Coverage</h3>
    ${renderEvidenceCoverageSummary(coverageReport)}

    <div class="requirements-list evidence-list">
      ${evidenceRequirements.map(renderEvidenceRequirementCard).join("")}
    </div>

    <pre id="evidence_guide_status" class="code" style="margin-top:12px;"></pre>
  `;

  hydratePlanContext(container);
  container.querySelectorAll("[data-evidence-route]").forEach((btn) => {
    btn.addEventListener("click", () => setRoute(btn.dataset.evidenceRoute));
  });
  container.querySelector("#evidence_open_inputs").addEventListener("click", () => setRoute("#/inputs"));
  container.querySelector("#evidence_open_inputs_top").addEventListener("click", () => setRoute("#/inputs"));
  container.querySelector("#evidence_open_rules").addEventListener("click", () => setRoute("#/rules"));
  const statusEl = container.querySelector("#evidence_guide_status");
  container.querySelector("#download_evidence_guide").addEventListener("click", async () => {
    try {
      const payload = await buildEvidenceGuideExport();
      state.lastManifest = payload.meta;
      saveState();
      downloadBlob(
        new Blob([stringifyStable(payload)], { type: "application/json" }),
        "case-evidence-guide.json"
      );
      statusEl.textContent = `Downloaded case-evidence-guide.json\n\n${JSON.stringify(payload.meta, null, 2)}`;
    } catch (err) {
      statusEl.textContent = `ERROR: ${err.message}`;
    }
  });
  container.querySelector("#download_evidence_coverage").addEventListener("click", async () => {
    try {
      const payload = await buildEvidenceCoverageReport();
      state.lastManifest = payload.meta;
      saveState();
      downloadBlob(
        new Blob([stringifyStable(payload)], { type: "application/json" }),
        "case-evidence-coverage.json"
      );
      statusEl.textContent = `Downloaded case-evidence-coverage.json\n\n${JSON.stringify(payload.meta, null, 2)}`;
    } catch (err) {
      statusEl.textContent = `ERROR: ${err.message}`;
    }
  });
}

const rulesRegistry = [
  {
    id: "RULE-R5-001",
    title: "R5 question inventory",
    rule_class: "mechanical",
    status: "planned_validator",
    deliverables: ["########R5.docx"],
    governing_references: ["reference/r5-items.txt"],
    input_artifacts: ["PlanMetadata", "Plan document extraction JSON"],
    output_artifacts: ["R5Summary.json", "########R5.docx"]
  },
  {
    id: "RULE-R5-002",
    title: "Plan Summary document coverage and citation rules",
    rule_class: "mechanical",
    status: "partially_implemented",
    deliverables: ["########R5.docx", "Inputs Matrix"],
    governing_references: ["reference/plan-summary-rules.txt"],
    input_artifacts: ["PlanMetadata", "document registry", "R5 summary JSON"],
    output_artifacts: ["########R5.docx", "manifest.json"]
  },
  {
    id: "RULE-R5-003",
    title: "Plan provision extraction from PDFs and amendments",
    rule_class: "llm_assisted",
    status: "planned_extractor",
    deliverables: ["########R5.docx", "########PF.xlsx", "########V1.xlsx"],
    governing_references: ["reference/plan-summary-rules.txt", "reference/metadata-scraper-prompt.txt"],
    input_artifacts: ["plan documents", "amendments", "SPDs", "CBAs"],
    output_artifacts: ["PlanMetadata", "R5Summary.json", "plan-layer extraction JSON"]
  },
  {
    id: "RULE-R5-004",
    title: "Ambiguous provision and conflict resolution",
    rule_class: "human_review",
    status: "manual_required",
    deliverables: ["########R5.docx", "########PF.xlsx", "########V1.xlsx"],
    governing_references: ["reference/plan-summary-rules.txt"],
    input_artifacts: ["conflicting extracted facts", "citations"],
    output_artifacts: ["approved fact selection", "review notes"]
  },
  {
    id: "RULE-DEL-001",
    title: "DEL direct input versus calculated field split",
    rule_class: "mechanical",
    status: "planned_validator",
    deliverables: ["########DEL.pdf", "########V1.xlsx", "########S1.cfg"],
    governing_references: ["reference/DD.csv"],
    input_artifacts: ["participant/census/payee data", "DD.csv field dictionary"],
    output_artifacts: ["########DEL.pdf", "field coverage report"]
  },
  {
    id: "RULE-DEL-002",
    title: "Participant source priority and field provenance",
    rule_class: "llm_assisted",
    status: "planned_extractor",
    deliverables: ["########DEL.pdf", "Estimated Benefit Administration Analysis.docx"],
    governing_references: ["reference/CASE_PROCESSING.txt", "reference/DD.csv"],
    input_artifacts: ["census files", "payee files", "participant forms", "source notes"],
    output_artifacts: ["source-priority map", "DEL source citations"]
  },
  {
    id: "RULE-DEL-003",
    title: "Acceptance of participant data assumptions",
    rule_class: "human_review",
    status: "manual_required",
    deliverables: ["########DEL.pdf", "Estimated Benefit Adjustments Analysis.docx", "Estimated Benefit Administration Analysis.docx"],
    governing_references: ["reference/CASE_PROCESSING.txt"],
    input_artifacts: ["DEL source report", "missing/unknown field report"],
    output_artifacts: ["approved assumptions", "case notes"]
  },
  {
    id: "RULE-V1-001",
    title: "Approved V1Summary import shape",
    rule_class: "mechanical",
    status: "implemented",
    deliverables: ["########V1.xlsx"],
    governing_references: ["reference/raw-approved-v1-engines"],
    input_artifacts: ["approved V1Summary JSON files"],
    output_artifacts: ["approved V1 warehouse profiles", "import manifest"]
  },
  {
    id: "RULE-V1-002",
    title: "V1 run ordering and reconstruction preview",
    rule_class: "mechanical",
    status: "implemented",
    deliverables: ["########V1.xlsx", "V1 Match Audit"],
    governing_references: ["reference/run_catalog_seed.v0.7.0.json", "reference/sample-2-v1.xlsm"],
    input_artifacts: ["approved V1Summary JSON files"],
    output_artifacts: ["v1-match-reconstruction-audit.json"]
  },
  {
    id: "RULE-V1-003",
    title: "V1 output field contract",
    rule_class: "mechanical",
    status: "planned_validator",
    deliverables: ["########V1.xlsx", "########S1.cfg"],
    governing_references: ["reference/output_contract_seed.v0.7.0.json"],
    input_artifacts: ["V1 engine profile", "DEL field model"],
    output_artifacts: ["output coverage report"]
  },
  {
    id: "RULE-V1-004",
    title: "V1 candidate actuarial suitability",
    rule_class: "human_review",
    status: "manual_required",
    deliverables: ["########V1.xlsx"],
    governing_references: ["reference/raw-approved-v1-engines", "reference/plan-summary-rules.txt"],
    input_artifacts: ["ranking evidence", "R5 profile", "reconstruction preview"],
    output_artifacts: ["selected V1 candidate", "review signoff"]
  },
  {
    id: "RULE-PF-001",
    title: "Plan factor workbook input contract",
    rule_class: "mechanical",
    status: "planned_validator",
    deliverables: ["########PF.xlsx"],
    governing_references: ["reference/README - plan_factors.md", "reference/24884900PF.v0.7.13.xlsx"],
    input_artifacts: ["case.json", "planFactors.json"],
    output_artifacts: ["########PF.xlsx"]
  },
  {
    id: "RULE-PF-002",
    title: "Factor rule extraction from plan provisions",
    rule_class: "llm_assisted",
    status: "planned_extractor",
    deliverables: ["########PF.xlsx", "########V1.xlsx"],
    governing_references: ["reference/plan-summary-rules.txt", "reference/plan-layer-object-variables.txt"],
    input_artifacts: ["R5 summary", "plan provisions"],
    output_artifacts: ["planFactors.json"]
  },
  {
    id: "RULE-436-001",
    title: "Section 436 input package and memo scaffold",
    rule_class: "mechanical",
    status: "partially_implemented",
    deliverables: ["436 Limitation Analysis.docx"],
    governing_references: ["reference/Benefit Limitations Under PPA 2006 - Section 436.pdf", "reference/pbgc-436-webapp-v0.2.0"],
    input_artifacts: ["DOPT", "DOTR", "BPD", "DOBF", "AFTAP/CBA facts"],
    output_artifacts: ["436 Limitation Analysis.docx"]
  },
  {
    id: "RULE-436-002",
    title: "Section 436 applicability judgment",
    rule_class: "human_review",
    status: "manual_required",
    deliverables: ["436 Limitation Analysis.docx"],
    governing_references: ["reference/Benefit Limitations Under PPA 2006 - Section 436.pdf"],
    input_artifacts: ["freeze evidence", "AFTAP facts", "plan amendments"],
    output_artifacts: ["approved 436 conclusion"]
  },
  {
    id: "RULE-EST-001",
    title: "Estimated adjustment payment-history package",
    rule_class: "mechanical",
    status: "planned_validator",
    deliverables: ["Estimated Benefit Adjustments Analysis.docx"],
    governing_references: ["reference/Computation and Netting of Post-DOPT Overpayments and Underpayments.pdf", "reference/Benefit Corrections.pdf"],
    input_artifacts: ["payment history", "estimated benefit extract", "current benefit status"],
    output_artifacts: ["Estimated Benefit Adjustments Analysis.docx"]
  },
  {
    id: "RULE-ADMIN-001",
    title: "Estimated administration input package",
    rule_class: "mechanical",
    status: "planned_validator",
    deliverables: ["Estimated Benefit Administration Analysis.docx"],
    governing_references: ["reference/CASE_PROCESSING.txt", "reference/Frequency of Benefit Payments.pdf"],
    input_artifacts: ["payee administration extract", "PIF/verification status", "operational notes"],
    output_artifacts: ["Estimated Benefit Administration Analysis.docx"]
  },
  {
    id: "RULE-BSRS-001",
    title: "BSRS authoring function allow-list",
    rule_class: "mechanical",
    status: "planned_validator",
    deliverables: ["########S1.cfg"],
    governing_references: ["reference/BSRS functions.txt"],
    input_artifacts: ["BSRS expression/config files"],
    output_artifacts: ["BSRS validation report"]
  },
  {
    id: "RULE-BSRS-002",
    title: "BSRS/BCV config template shape",
    rule_class: "mechanical",
    status: "planned_generator",
    deliverables: ["########S1.cfg"],
    governing_references: ["reference/sample-bsrs-statement-config.txt", "reference/sample-bsrs-baseData-config.txt", "reference/DD.csv"],
    input_artifacts: ["DEL data", "V1 outputs", "letter variable mappings"],
    output_artifacts: ["########S1.cfg"]
  }
].sort((a, b) => a.id.localeCompare(b.id));

function rulesByClass() {
  return rulesRegistry.reduce((acc, rule) => {
    acc[rule.rule_class] = (acc[rule.rule_class] ?? 0) + 1;
    return acc;
  }, {});
}

const caseGuideSteps = [
  {
    id: "metadata",
    title: "Metadata",
    phase: "Foundation",
    route: "#/metadata",
    readinessKeys: ["metadata"],
    prompt: "Create plan-metadata.json from uploaded documents or manual entry so every downstream module has the same case identity.",
    uploadAction: "Upload PlanMetadata JSON",
    manualAction: "Enter case number, plan name, key dates, staff, plan status, and document registry manually",
    programmedAction: "Validate, save, and download plan-metadata.json",
    warnings: ["Without metadata, other modules cannot create reliable manifests."]
  },
  {
    id: "inputs",
    title: "Inputs Matrix",
    phase: "Planning",
    route: "#/inputs",
    readinessKeys: ["metadata"],
    prompt: "Review the pure input contract for plan-metadata.json, ########R5.docx, ########DEL.pdf, ########PF.xlsx, the analysis DOCX files, ########V1.xlsx, and ########S1.cfg.",
    uploadAction: "No upload required",
    manualAction: "Review missing/unknown input families",
    programmedAction: "Download case-input-requirements.json",
    warnings: ["Continue with unknown/na when source material is not yet available."]
  },
  {
    id: "r5",
    title: "R5 / Plan Summary",
    phase: "Upfront Work",
    route: "#/plan-summary",
    readinessKeys: ["metadata", "r5"],
    prompt: "Use the scraper to create R5Summary.json from all plan-history documents, then fill the provided template as ########R5.docx.",
    uploadAction: "Upload R5Summary.json and the Plan Summary DOCX template",
    manualAction: "Enter cited R5 facts manually when clean documents cannot be used",
    programmedAction: "Generate ########R5.docx or load R5Summary.json into case state",
    warnings: ["Ambiguous provisions should remain unknown/na until reviewed.", "The scraper contract is expected to be versioned; confirm the current v3 prompt before production use."]
  },
  {
    id: "data-elements",
    title: "DEL",
    phase: "Upfront Work",
    route: "#/del",
    readinessKeys: ["metadata", "r5", "data-elements"],
    prompt: "Use PlanMetadata, R5Summary.json, and DD.csv to define ########DEL.pdf, the fields other departments need for population data collection.",
    uploadAction: "Upload R5Summary.json, DD.csv, and any DEL/census/source files",
    manualAction: "Document missing participant fields and source assumptions",
    programmedAction: "Generate the DEL input package now; later replace with ########DEL.pdf generator",
    warnings: ["No PII should be stored in repo fixtures; use browser upload only."]
  },
  {
    id: "synthetic-population",
    title: "Synthetic Population",
    phase: "Testing Support",
    route: "#/synthetic-population",
    readinessKeys: ["metadata", "r5", "data-elements", "synthetic-population"],
    prompt: "Generate deterministic no-PII population files that match DD.csv so DEL, PF, V1, estimated analyses, and BSRS can be tested without real participant data.",
    uploadAction: "Use bundled reference/DD.csv or upload a DD.csv override",
    manualAction: "Set seed, row count, scenario mix, and required field list",
    programmedAction: "Download ########SyntheticPopulation.zip with clean CSV, dirty CSV, config, and manifest",
    warnings: ["Synthetic population is for testing only and must not be treated as production participant data."]
  },
  {
    id: "plan-factors",
    title: "Plan Factors",
    phase: "Upfront Work",
    route: "#/factors",
    readinessKeys: ["metadata", "r5", "plan-factors"],
    prompt: "Derive ########PF.xlsx inputs from PlanMetadata, R5Summary.json, DD.csv, rates, mortality, optional forms, and factor source material.",
    uploadAction: "Upload factor tables/workpapers, rate basis, mortality basis, and PF template/workbook",
    manualAction: "Enter cited factor assumptions where files are unavailable",
    programmedAction: "Generate the PF input package now; integrate the external PF generator when available",
    warnings: ["Do not invent factors; unknown factors remain unknown/na.", "If the PF programming is only in another repository, it still needs to be imported into this single-file app."]
  },
  {
    id: "section-436",
    title: "436",
    phase: "Upfront Work",
    route: "#/436",
    readinessKeys: ["metadata", "r5", "section-436"],
    prompt: "Map the template inputs for 436 Limitation Analysis.docx from metadata, R5 facts, freeze amendments, AFTAP/CBA facts, and memo notes.",
    uploadAction: "Upload 436 references, amendments, and the 436 template when available",
    manualAction: "Enter AFTAP/CBA/freeze facts with citations",
    programmedAction: "Generate the 436 input package now; later replace with the DOCX generator",
    warnings: ["436 applicability conclusions require review before final use.", "The complete pure-input map is not finished yet."]
  },
  {
    id: "estimated-analyses",
    title: "Estimated Analyses",
    phase: "Estimated Work",
    route: "#/estimated-adjustments",
    alternateRoute: "#/estimated-administration",
    readinessKeys: ["metadata", "r5", "estimated-benefit-adjustments", "estimated-benefit-administration"],
    prompt: "Prepare Estimated Benefit Adjustments Analysis.docx and Estimated Benefit Administration Analysis.docx inputs from payment, payee, and operational data.",
    uploadAction: "Upload payment history, current benefit extracts, payee/admin extracts, notices, and workpapers",
    manualAction: "Record payment history gaps and operational notes",
    programmedAction: "Generate adjustment/admin input packages now; later replace with DOCX generators",
    warnings: ["Payment history gaps should be called out explicitly.", "The complete pure-input map is not finished yet."]
  },
  {
    id: "v1",
    title: "V1",
    phase: "Actuarial Work",
    route: "#/v1-engine-explorer",
    alternateRoute: "#/v1-audit",
    readinessKeys: ["metadata", "r5", "v1"],
    prompt: "Produce ########V1.xlsx by selecting/tweaking an approved V1 or building from rules, using R5 facts, DAG structure, formula ASTs, and BCV Add-in formulas where relevant.",
    uploadAction: "Upload approved V1Summary JSON files and current-case R5Summary.json",
    manualAction: "Review candidate suitability, DAG/AST gaps, reconstruction warnings, and BCV formula preservation",
    programmedAction: "Rank V1 candidates and export audit JSON now; later generate ########V1.xlsx",
    warnings: ["Similarity is advisory; selected V1 requires actuarial review.", "ATPBGC/BCV functions are opaque formulas: analyze and preserve strings, do not execute them."]
  },
  {
    id: "bsrs-bcv",
    title: "BSRS / BCV",
    phase: "Statements",
    route: "#/letters-bcv",
    readinessKeys: ["metadata", "r5", "data-elements", "v1", "letters-bcv-config"],
    prompt: "Produce ########S1.cfg from BSRS samples, letter templates, BCV fields, DEL fields, and V1 outputs.",
    uploadAction: "Upload templates/configs/mappings and S1 samples tied to V1 samples",
    manualAction: "Review letter variables and missing BCV fields",
    programmedAction: "Generate the BSRS/BCV input package now; later replace with ########S1.cfg generator",
    warnings: ["Statement language/configs should be reviewed before production use."]
  }
];

let activeGuideStepId = "metadata";

function guideStepStatus(step) {
  const statuses = step.readinessKeys.map((key) => ({ key, ...inputRequirementStatus(key) }));
  const ready = statuses.filter((status) => status.ready).length;
  return {
    statuses,
    ready,
    total: statuses.length,
    complete: ready === statuses.length,
    started: ready > 0
  };
}

function renderGuideStepButton(step, index) {
  const status = guideStepStatus(step);
  const stateClass = status.complete ? "ready" : status.started ? "warning" : "missing";
  const active = step.id === activeGuideStepId ? "active" : "";
  return `
    <button class="guide-step ${stateClass} ${active}" data-guide-step="${escapeHtml(step.id)}">
      <span>${index + 1}</span>
      <b>${escapeHtml(step.title)}</b>
      <small>${status.ready}/${status.total} ready</small>
    </button>
  `;
}

function normalizeValueEntry(entry) {
  if (entry && typeof entry === "object" && "value" in entry) {
    return {
      value: entry.value ?? "unknown",
      citations: Array.isArray(entry.citations) ? entry.citations : []
    };
  }
  if (typeof entry === "string" || typeof entry === "number") {
    return { value: String(entry), citations: [] };
  }
  return { value: "unknown", citations: [] };
}

function normalizePlanMetadata(input) {
  const base = defaultPlanMetadata();
  const source = input?.plan_metadata ?? input?.planMetadata ?? input;
  const planSource = source?.plan && typeof source.plan === "object" ? source.plan : source;
  const metaSource = source?.meta && typeof source.meta === "object" ? source.meta : source;
  const normalized = {
    schema_version: source?.schema_version ?? base.schema_version,
    meta: { ...base.meta },
    plan: { ...base.plan },
    documents: Array.isArray(source?.documents) ? source.documents : [],
    other_attributes: Array.isArray(source?.other_attributes) ? source.other_attributes : []
  };
  Object.keys(base.meta).forEach((key) => {
    if (metaSource && key in metaSource) {
      normalized.meta[key] = normalizeValueEntry(metaSource[key]);
    } else if (source && key in source) {
      normalized.meta[key] = normalizeValueEntry(source[key]);
    }
  });
  Object.keys(base.plan).forEach((key) => {
    if (planSource && key in planSource) {
      normalized.plan[key] = normalizeValueEntry(planSource[key]);
    } else if (source && key in source) {
      normalized.plan[key] = normalizeValueEntry(source[key]);
    }
  });
  return normalized;
}

async function sha256HexString(text) {
  const enc = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest("SHA-256", enc);
  const bytes = Array.from(new Uint8Array(hashBuf));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}
function renderMetadata(container) {
  const initialJson = state.planMetadata ?? defaultPlanMetadata();

  container.innerHTML = `
    <section class="page-hero">
      <div class="page-title">
        <h2>Plan Metadata Builder</h2>
        <p>Import the LLM output JSON, edit as needed, then save the final PlanMetadata for downstream modules.</p>
      </div>
      <div class="page-actions">
        <button class="icon-button help" id="toggle_instructions" aria-label="Toggle instructions" data-help="Show quick instructions">i</button>
        <button class="ghost" id="clear_workspace">Clear Workspace</button>
      </div>
    </section>

    ${isMetadataReady() ? "" : `<div class="banner subtle">Finish Metadata to unlock other modules.</div>`}

    <div class="card focus-card">
      <h3>Start Here</h3>
      <p class="muted">Step 1: Upload the PlanMetadata JSON produced by your LLM. If you don't have it yet, use the blank template. Need the scrape prompt? Use Resources.</p>
      <div class="button-row">
        <label class="file-pill">
          <input id="metadata_file_focus" type="file" accept="application/json,.json" />
          Upload PlanMetadata JSON
        </label>
        <button id="use_template_focus" class="ghost">Load Blank Template</button>
        <button id="save_btn_focus" class="primary">Save Metadata</button>
      </div>
      <div id="metadata_status_focus" class="meta-line"></div>
      <div id="save_status_focus" class="meta-line"></div>
      <div id="metadata_summary_focus" class="meta-line"></div>
      <div class="required-panel" style="margin-top: 12px;">
        <div class="required-title">Required Fields Status</div>
        <div id="required_status_focus" class="meta-line"></div>
      </div>
    </div>

    <div id="instructions_backdrop" class="drawer-backdrop"></div>
    <aside class="drawer-panel drawer-left" id="instructions_panel">
      <div class="drawer-header">
        <div class="drawer-title">How To Use This Module</div>
        <button class="icon-button" id="close_instructions" aria-label="Close instructions">x</button>
      </div>
      <div class="drawer-body">
        <ol class="instruction-list">
          <li>Upload the PlanMetadata JSON produced by your LLM.</li>
          <li>Use Manual Entry to fill or override any fields (citations required for known facts).</li>
          <li>Review, validate, and save; download plan-metadata.json for other modules.</li>
        </ol>
        <div class="muted">This workbench runs fully offline with hash-based routing. All processing stays in your browser.</div>
      </div>
    </aside>

    ${state.lastError ? `<div class="alert error">${escapeHtml(state.lastError)}</div>` : ""}

    <div class="card" style="margin-top: 16px;">
      <div class="button-row" style="margin-top:0;">
        <button id="toggle_advanced" class="ghost">Show Advanced</button>
      </div>
      <div id="advanced_panel" class="hidden">
        <div class="section-divider"></div>
        <h3>2) Manual Entry (Core Fields)</h3>
        <p class="muted">Enter or override fields from the Plan Summary Shell. Include citations for known facts.</p>
        <div class="meta-line">Fields marked <span class="required-mark">*</span> are required to unlock other modules.</div>
        <div class="required-panel">
          <div class="required-title">Required Fields Status</div>
          <div class="meta-line">Values are shown as placeholders; type to override.</div>
          <div id="required_status" class="meta-line"></div>
        </div>
        <div class="button-row" style="margin-top:0;">
          <button id="toggle_citations" class="ghost">Show citations</button>
        </div>
        <label class="inline-toggle">
          <input type="checkbox" id="overwrite_toggle" />
          Overwrite existing values
        </label>
        <div id="manual_fields" class="manual-grid"></div>
        <div class="button-row">
        <button id="manual_apply" class="primary">Apply Manual Fields</button>
        <button id="manual_reload" class="ghost">Refresh From Editor</button>
        </div>
        <div id="manual_status" class="meta-line"></div>

        <div class="section-divider"></div>
        <h3>3) Document Registry (Manual)</h3>
        <p class="muted">Add plan documents and optional citations. Values left blank become "unknown".</p>
        <div class="button-row" style="margin-top:0;">
          <button id="toggle_doc_citations" class="ghost">Show citations</button>
        </div>
        <div id="doc_registry" class="docs-list"></div>
        <div class="button-row">
          <button id="doc_add">Add Document</button>
        </div>
        <div class="meta-line">Each document row applies one citation to all fields in that row.</div>

        <div class="section-divider"></div>
        <h3>4) Review and Save</h3>
        <p class="muted">Review or edit JSON, then save to the workbench state.</p>
        <textarea id="metadata_editor" class="code" rows="16"></textarea>
        <div class="button-row">
          <button id="validate_btn">Validate JSON</button>
          <button id="save_btn" class="primary">Save Metadata</button>
          <button id="download_btn" class="ghost">Download metadata.json</button>
        </div>
        <div id="validation_output" class="meta-line"></div>
      </div>
    </div>
  `;

  const metadataFileInput = container.querySelector("#metadata_file_focus");
  const metadataStatus = container.querySelector("#metadata_status_focus");
  const useTemplateBtn = container.querySelector("#use_template_focus");
  const saveBtnFocus = container.querySelector("#save_btn_focus");
  const saveStatusFocus = container.querySelector("#save_status_focus");

  const editor = container.querySelector("#metadata_editor");
  const validateBtn = container.querySelector("#validate_btn");
  const saveBtn = container.querySelector("#save_btn");
  const downloadBtn = container.querySelector("#download_btn");
  const validationOutput = container.querySelector("#validation_output");

  const toggleAdvancedBtn = container.querySelector("#toggle_advanced");
  const advancedPanel = container.querySelector("#advanced_panel");

  const manualFieldsEl = container.querySelector("#manual_fields");
  const manualApplyBtn = container.querySelector("#manual_apply");
  const manualReloadBtn = container.querySelector("#manual_reload");
  const manualStatus = container.querySelector("#manual_status");
  const toggleCitationsBtn = container.querySelector("#toggle_citations");
  const requiredStatus = container.querySelector("#required_status");
  const requiredStatusFocus = container.querySelector("#required_status_focus");
  const metadataSummaryFocus = container.querySelector("#metadata_summary_focus");
  const overwriteToggle = container.querySelector("#overwrite_toggle");
  const autoFillManualInputs = true;

  const docRegistryEl = container.querySelector("#doc_registry");
  const docAddBtn = container.querySelector("#doc_add");
  const toggleDocCitationsBtn = container.querySelector("#toggle_doc_citations");

  const clearBtn = container.querySelector("#clear_workspace");
  const instructionsBtn = container.querySelector("#toggle_instructions");
  const instructionsPanel = container.querySelector("#instructions_panel");
  const instructionsBackdrop = container.querySelector("#instructions_backdrop");
  const instructionsClose = container.querySelector("#close_instructions");
  editor.value = stringifyStable(initialJson);

  clearBtn.addEventListener("click", () => {
    clearState();
    renderRoute();
  });

  instructionsBtn.addEventListener("click", () => {
    instructionsPanel.classList.add("open");
    instructionsBackdrop.classList.add("show");
  });

  function closeInstructions() {
    instructionsPanel.classList.remove("open");
    instructionsBackdrop.classList.remove("show");
  }

  instructionsClose.addEventListener("click", closeInstructions);
  instructionsBackdrop.addEventListener("click", closeInstructions);

  const manualFields = [
    { id: "plan_name", label: "Plan Name", target: { type: "plan", key: "plan_name" } },
    { id: "case_number", label: "Case Number", target: { type: "meta", key: "case_number" } },
    { id: "case_processing_section", label: "Case Processing Section", target: { type: "meta", key: "case_processing_section" } },
    { id: "actuary", label: "Actuary", target: { type: "plan", key: "actuary" } },
    { id: "auditor", label: "Auditor", target: { type: "plan", key: "auditor" } },
    { id: "termination_date", label: "DOPT (Termination Date)", target: { type: "plan", key: "termination_date" } },
    { id: "trusteeship_date", label: "DOTR (Trusteeship Date)", target: { type: "plan", key: "trusteeship_date" } },
    { id: "nod_date", label: "NOD Date", target: { type: "plan", key: "nod_date" } },
    { id: "noit_date", label: "NOIT Date", target: { type: "plan", key: "noit_date" } },
    { id: "bpd_bankruptcy", label: "BPD (Bankruptcy)", target: { type: "plan", key: "bpd_bankruptcy" } },
    { id: "dobf", label: "DOBF", target: { type: "plan", key: "dobf" } },
    { id: "employer_status", label: "Employer Status", target: { type: "plan", key: "employer_status" } },
    { id: "facility_closing_date", label: "Facility Closing Date", target: { type: "plan", key: "facility_closing_date" } },
    { id: "successor_plan", label: "Successor Plan", target: { type: "plan", key: "successor_plan" } },
    { id: "plan_assets", label: "Plan Assets", target: { type: "plan", key: "plan_assets" } },
    { id: "sparr", label: "SPARR", target: { type: "plan", key: "sparr" } },
    { id: "funding_status", label: "Funding Status", target: { type: "plan", key: "funding_status" } },
    { id: "plan_number", label: "Plan Number", target: { type: "plan", key: "plan_number" } },
    { id: "ein", label: "EIN", target: { type: "plan", key: "ein" } },
    { id: "plan_sponsor_name", label: "Plan Sponsor Name", target: { type: "plan", key: "plan_sponsor_name" } },
    { id: "plan_type", label: "Plan Type", target: { type: "plan", key: "plan_type" } },
    { id: "effective_date", label: "Effective Date", target: { type: "plan", key: "effective_date" } },
    { id: "termination_type", label: "Termination Type", target: { type: "plan", key: "termination_type" } },
    { id: "valuation_date", label: "Valuation Date", target: { type: "plan", key: "valuation_date" } },
    { id: "pbgc_case_status", label: "PBGC Case Status", target: { type: "plan", key: "pbgc_case_status" } },
    { id: "participant_count", label: "Participant Count", target: { type: "plan", key: "participant_count" } },
    { id: "pbgc_lump_sum_first_segment", label: "PBGC Lump Sum First Segment", target: { type: "plan", key: "pbgc_lump_sum_first_segment" } },
    { id: "pbgc_lump_sum_second_segment", label: "PBGC Lump Sum Second Segment", target: { type: "plan", key: "pbgc_lump_sum_second_segment" } },
    { id: "pbgc_lump_sum_third_segment", label: "PBGC Lump Sum Third Segment", target: { type: "plan", key: "pbgc_lump_sum_third_segment" } },
    { id: "pbgc_annuity_immediate_rate", label: "PBGC Annuity Rate (First Period)", target: { type: "plan", key: "pbgc_annuity_immediate_rate" } },
    { id: "pbgc_annuity_thereafter_rate", label: "PBGC Annuity Rate (Thereafter)", target: { type: "plan", key: "pbgc_annuity_thereafter_rate" } }
  ];
  const requiredFieldIds = new Set(REQUIRED_METADATA_FIELDS.map((f) => f.id));

  function getMissingRequiredLabels(metadata) {
    const missing = [];
    const hasValue = (obj, path) => {
      let cur = obj;
      for (const p of path) cur = cur?.[p];
      const v = cur?.value ?? "";
      return String(v).trim() !== "" && String(v).trim().toLowerCase() !== "unknown";
    };
    REQUIRED_METADATA_FIELDS.forEach((f) => {
      if (!hasValue(metadata, f.path)) missing.push(f.label);
    });
    return missing;
  }

  function updateRequiredChecklist() {
    const raw = parseEditorOrNull();
    const json = raw ? normalizePlanMetadata(raw) : null;
    if (!json) {
      requiredStatus.textContent = "Paste or upload JSON to evaluate required fields.";
      requiredStatusFocus.textContent = "Paste or upload JSON to evaluate required fields.";
      metadataSummaryFocus.textContent = "";
      return;
    }
    const missing = getMissingRequiredLabels(json);
    requiredStatus.textContent = missing.length
      ? `${missing.length} required fields missing.`
      : "All required fields complete.";
    requiredStatusFocus.textContent = missing.length
      ? `${missing.length} required fields missing.`
      : "All required fields complete.";
    const planName = json.plan?.plan_name?.value ?? "";
    const caseNumber = json.meta?.case_number?.value ?? "";
    metadataSummaryFocus.textContent =
      planName || caseNumber
        ? `Detected: ${planName ? `Plan Name “${planName}”` : ""}${planName && caseNumber ? " • " : ""}${caseNumber ? `Case ${caseNumber}` : ""}`
        : "";
  }

  function getValueWithCitations(json, target) {
    if (target.type === "plan") {
      return json?.plan?.[target.key] ?? { value: "unknown", citations: [] };
    }
    if (target.type === "meta") {
      return json?.meta?.[target.key] ?? { value: "unknown", citations: [] };
    }
    return { value: "unknown", citations: [] };
  }

  function renderManualFieldsFromJson() {
    const json = parseEditorOrDefault();
    manualFieldsEl.innerHTML = manualFields
      .map((field) => {
        const current = getValueWithCitations(json, field.target);
        const c = current.citations?.[0] ?? { doc_id: "", page: "", locator: "" };
        const currentValue = current.value && current.value !== "unknown" ? current.value : "";
        const requiredMark = requiredFieldIds.has(field.id) ? `<span class="required-mark">*</span>` : "";
        const inputValue = autoFillManualInputs ? currentValue : "";
        return `
          <div class="manual-row">
            <div>
              <div class="manual-label">${escapeHtml(field.label)} ${requiredMark}</div>
              <div class="manual-current">${escapeHtml(currentValue || "not set")}</div>
            </div>
            <input data-field="${field.id}" class="manual-value" placeholder="${escapeHtml(currentValue || "value")}" value="${escapeHtml(inputValue)}" />
            <input data-field="${field.id}" class="manual-doc citation-field hidden" placeholder="doc_id" value="${escapeHtml(c.doc_id ?? "")}" />
            <input data-field="${field.id}" class="manual-page citation-field hidden" placeholder="page" value="${escapeHtml(String(c.page ?? ""))}" />
            <input data-field="${field.id}" class="manual-loc citation-field hidden" placeholder="locator/snippet" value="${escapeHtml(c.locator ?? "")}" />
          </div>
        `;
      })
      .join("");
    updateRequiredChecklist();
  }

  function parseEditorOrDefault() {
    try {
      return JSON.parse(editor.value);
    } catch {
      return defaultPlanMetadata();
    }
  }

  function parseEditorOrNull() {
    const raw = editor.value.trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function readManualFields() {
    const rows = manualFieldsEl.querySelectorAll(".manual-row");
    const values = {};
    rows.forEach((row) => {
      const value = row.querySelector(".manual-value")?.value?.trim() ?? "";
      const doc_id = row.querySelector(".manual-doc")?.value?.trim() ?? "";
      const pageRaw = row.querySelector(".manual-page")?.value?.trim() ?? "";
      const locator = row.querySelector(".manual-loc")?.value?.trim() ?? "";
      const page = pageRaw ? Number(pageRaw) : null;
      const citations = doc_id && page && locator ? [{ doc_id, page, locator }] : [];
      const fieldId = row.querySelector(".manual-value")?.dataset?.field;
      if (fieldId) values[fieldId] = { value, citations };
    });
    return values;
  }

  function applyManualFieldsToJson() {
    const existing = parseEditorOrNull();
    const json = existing ?? defaultPlanMetadata();
    if (!json.plan) json.plan = defaultPlanMetadata().plan;
    if (!json.meta) json.meta = defaultPlanMetadata().meta;
    const values = readManualFields();
    const hasAnyManual = Object.values(values).some(
      (entry) => (entry.value && entry.value.trim()) || (entry.citations && entry.citations.length)
    );
    if (!hasAnyManual) {
      return { applied: false, createdNew: false };
    }
    const allowOverwrite = overwriteToggle?.checked ?? false;
    for (const field of manualFields) {
      const entry = values[field.id] ?? { value: "", citations: [] };
      const val = entry.value === "" ? "unknown" : entry.value;
      if (field.target.type === "plan") {
        const current = json.plan[field.target.key]?.value ?? "unknown";
        const canSet = allowOverwrite || String(current).trim().toLowerCase() === "unknown" || String(current).trim() === "";
        if (canSet && entry.value !== "") {
          json.plan[field.target.key] = { value: val, citations: entry.citations ?? [] };
        }
      } else if (field.target.type === "meta") {
        const current = json.meta[field.target.key]?.value ?? "unknown";
        const canSet = allowOverwrite || String(current).trim().toLowerCase() === "unknown" || String(current).trim() === "";
        if (canSet && entry.value !== "") {
          json.meta[field.target.key] = { value: val, citations: entry.citations ?? [] };
        }
      }
    }
    editor.value = stringifyStable(json);
    updateRequiredChecklist();
    return { applied: true, createdNew: !existing };
  }

  const docRegistryState = [];

  function loadDocRegistryFromJson() {
    docRegistryState.length = 0;
    const json = parseEditorOrDefault();
    (json.documents ?? []).forEach((doc) => {
      const firstCitation =
        doc?.name?.citations?.[0] ||
        doc?.type?.citations?.[0] ||
        doc?.effective_date?.citations?.[0] ||
        null;
      docRegistryState.push({
        id: crypto.randomUUID(),
        doc_id: doc.doc_id ?? "",
        name: doc.name?.value ?? "",
        type: doc.type?.value ?? "",
        effective_date: doc.effective_date?.value ?? "",
        adoption_date: doc.adoption_date?.value ?? "",
        applicable_period: doc.applicable_period?.value ?? "",
        source_file: doc.source_file?.value ?? "",
        notes: doc.notes?.value ?? "",
        viewer_id: doc.viewer_id?.value ?? "",
        citation: {
          doc_id: firstCitation?.doc_id ?? "",
          page: firstCitation?.page ?? "",
          locator: firstCitation?.locator ?? ""
        }
      });
    });
  }

  function renderDocRegistry() {
    docRegistryEl.innerHTML = "";
    if (!docRegistryState.length) {
      docRegistryEl.innerHTML = `<div class="muted">No documents added yet.</div>`;
      return;
    }
    docRegistryState.forEach((doc) => {
      const row = document.createElement("div");
      row.className = "doc-row";
      row.innerHTML = `
        <div class="doc-grid">
          <input class="doc-field" data-key="doc_id" placeholder="doc_id" value="${escapeHtml(doc.doc_id)}" />
          <input class="doc-field" data-key="name" placeholder="name" value="${escapeHtml(doc.name)}" />
          <input class="doc-field" data-key="type" placeholder="type" value="${escapeHtml(doc.type)}" />
          <input class="doc-field" data-key="effective_date" placeholder="effective_date" value="${escapeHtml(doc.effective_date)}" />
          <input class="doc-field" data-key="adoption_date" placeholder="adoption_date" value="${escapeHtml(doc.adoption_date)}" />
          <input class="doc-field" data-key="applicable_period" placeholder="applicable_period" value="${escapeHtml(doc.applicable_period)}" />
          <input class="doc-field" data-key="source_file" placeholder="source_file" value="${escapeHtml(doc.source_file)}" />
          <input class="doc-field" data-key="notes" placeholder="notes" value="${escapeHtml(doc.notes)}" />
          <input class="doc-field" data-key="viewer_id" placeholder="viewer_id" value="${escapeHtml(doc.viewer_id)}" />
          <input class="doc-field citation-field hidden" data-key="citation_doc" placeholder="citation doc_id" value="${escapeHtml(doc.citation.doc_id)}" />
          <input class="doc-field citation-field hidden" data-key="citation_page" placeholder="citation page" value="${escapeHtml(String(doc.citation.page ?? ""))}" />
          <input class="doc-field citation-field hidden" data-key="citation_loc" placeholder="citation locator" value="${escapeHtml(doc.citation.locator)}" />
        </div>
        <button class="ghost" data-remove="${doc.id}">Remove</button>
      `;
      row.querySelectorAll(".doc-field").forEach((input) => {
        input.addEventListener("input", (e) => {
          const key = e.target.dataset.key;
          const value = e.target.value;
          if (key === "citation_doc") doc.citation.doc_id = value.trim();
          else if (key === "citation_page") doc.citation.page = value.trim();
          else if (key === "citation_loc") doc.citation.locator = value.trim();
          else doc[key] = value;
        });
      });
      row.querySelector("button[data-remove]").addEventListener("click", () => {
        const idx = docRegistryState.findIndex((d) => d.id === doc.id);
        if (idx >= 0) docRegistryState.splice(idx, 1);
        renderDocRegistry();
      });
      docRegistryEl.appendChild(row);
    });
  }

  function applyDocRegistryToJson() {
    if (!docRegistryState.length) return false;
    const json = parseEditorOrDefault();
    const documents = [];
    for (const doc of docRegistryState) {
      if (!doc.doc_id) {
        manualStatus.textContent = "Document row missing doc_id.";
        continue;
      }
      const citation =
        doc.citation.doc_id && doc.citation.page && doc.citation.locator
          ? [{ doc_id: doc.citation.doc_id, page: Number(doc.citation.page), locator: doc.citation.locator }]
          : [];
      function v(val) {
        return { value: val && val.trim() ? val.trim() : "unknown", citations: citation };
      }
      documents.push({
        doc_id: doc.doc_id.trim(),
        name: v(doc.name),
        type: v(doc.type),
        effective_date: v(doc.effective_date),
        adoption_date: v(doc.adoption_date),
        applicable_period: v(doc.applicable_period),
        source_file: v(doc.source_file),
        notes: v(doc.notes),
        viewer_id: v(doc.viewer_id)
      });
    }
    json.documents = documents;
    editor.value = stringifyStable(json);
    updateRequiredChecklist();
    return documents.length > 0;
  }

  manualApplyBtn.addEventListener("click", () => {
    const manualResult = applyManualFieldsToJson();
    const docApplied = applyDocRegistryToJson();
    if (!manualResult.applied && !docApplied) {
      manualStatus.textContent = "Nothing to apply. Enter values or add documents first.";
      return;
    }
    if (manualResult.applied && docApplied) {
      manualStatus.textContent = "Manual fields and document registry applied to the JSON text area.";
      return;
    }
    if (manualResult.applied && !docApplied) {
      manualStatus.textContent = manualResult.createdNew
        ? "Started a new JSON from manual fields."
        : overwriteToggle?.checked
          ? "Manual fields overwrote existing values."
          : "Manual fields filled missing values.";
      return;
    }
    manualStatus.textContent = "Document registry applied to the JSON text area.";
  });

  manualReloadBtn.addEventListener("click", () => {
    const existing = parseEditorOrNull();
    if (!existing) {
      manualStatus.textContent = "Editor is empty or invalid. Paste or upload JSON first.";
      return;
    }
    renderManualFieldsFromJson();
    loadDocRegistryFromJson();
    renderDocRegistry();
    const hasCitation = !!manualFieldsEl.querySelector(".citation-field:not(.hidden)") ||
      Array.from(manualFieldsEl.querySelectorAll(".citation-field"))
        .some((f) => f.value && f.value.trim());
    if (hasCitation) {
      const fields = manualFieldsEl.querySelectorAll(".citation-field");
      fields.forEach((f) => f.classList.remove("hidden"));
      manualFieldsEl.querySelectorAll(".manual-row").forEach((row) => {
        row.classList.add("show-citations");
      });
      toggleCitationsBtn.textContent = "Hide citations";
    }
    manualFieldsEl.classList.add("pulse");
    setTimeout(() => manualFieldsEl.classList.remove("pulse"), 650);
    manualStatus.textContent = "Loaded fields from the JSON text area.";
    updateRequiredChecklist();
  });

  docAddBtn.addEventListener("click", () => {
    docRegistryState.push({
      id: crypto.randomUUID(),
      doc_id: "",
      name: "",
      type: "",
      effective_date: "",
      adoption_date: "",
      applicable_period: "",
      source_file: "",
      notes: "",
      viewer_id: "",
      citation: { doc_id: "", page: "", locator: "" }
    });
    renderDocRegistry();
  });

  toggleCitationsBtn.addEventListener("click", () => {
    const fields = manualFieldsEl.querySelectorAll(".citation-field");
    const isHidden = fields.length ? fields[0].classList.contains("hidden") : true;
    fields.forEach((f) => f.classList.toggle("hidden", !isHidden));
    manualFieldsEl.querySelectorAll(".manual-row").forEach((row) => {
      row.classList.toggle("show-citations", isHidden);
    });
    toggleCitationsBtn.textContent = isHidden ? "Hide citations" : "Show citations";
  });

  toggleDocCitationsBtn.addEventListener("click", () => {
    const fields = docRegistryEl.querySelectorAll(".citation-field");
    const isHidden = fields.length ? fields[0].classList.contains("hidden") : true;
    fields.forEach((f) => f.classList.toggle("hidden", !isHidden));
    toggleDocCitationsBtn.textContent = isHidden ? "Hide citations" : "Show citations";
  });

  metadataFileInput.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    try {
      const parsed = JSON.parse(stripJsonBom(text));
      const normalized = normalizePlanMetadata(parsed);
      const ok = validatePlanMetadata(normalized);
      if (!ok) {
        metadataStatus.textContent = "Schema validation failed.";
        validationOutput.textContent =
          "Validation errors: " +
          validatePlanMetadata.errors
            .map((err) => `${err.instancePath || "/"} ${err.message}`)
            .join("; ");
        return;
      }
      metadataStatus.textContent = `Loaded ${f.name}`;
      editor.value = stringifyStable(normalized);
      renderManualFieldsFromJson();
      loadDocRegistryFromJson();
      renderDocRegistry();
      updateRequiredChecklist();
      const missing = getMissingRequiredLabels(normalized);
      if (missing.length) {
        state.planMetadataApproved = false;
        saveStatusFocus.textContent = "Complete required fields first.";
        validationOutput.textContent = `Valid JSON. Missing required fields: ${missing.join(", ")}.`;
      } else {
        state.planMetadata = normalized;
        state.planMetadataApproved = true;
        const hash = await sha256HexString(stringifyStable(normalized));
        state.lastManifest = {
          app_version: state.appVersion,
          module_id: "metadata",
          module_version: "0.7.0",
          generated_at_utc: new Date().toISOString(),
          plan_metadata_hash: hash
        };
        saveState();
        validationOutput.textContent = "Valid PlanMetadata JSON.";
        saveStatusFocus.textContent = "Loaded and saved. Other modules unlocked.";
        setRoute("#/dashboard");
      }
    } catch (err) {
      metadataStatus.textContent = `Invalid JSON: ${err.message}`;
    }
  });

  useTemplateBtn.addEventListener("click", () => {
    const blank = defaultPlanMetadata();
    editor.value = stringifyStable(blank);
    updateRequiredChecklist();
    state.planMetadataApproved = false;
    saveStatusFocus.textContent = "";
    renderManualFieldsFromJson();
    loadDocRegistryFromJson();
    renderDocRegistry();
    validationOutput.textContent = "Blank template loaded into the editor.";
  });

  validateBtn.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(editor.value);
      const normalized = normalizePlanMetadata(parsed);
      editor.value = stringifyStable(normalized);
      updateRequiredChecklist();
      const ok = validatePlanMetadata(normalized);
      if (!ok) {
        validationOutput.textContent =
          "Validation errors: " +
          validatePlanMetadata.errors
            .map((err) => `${err.instancePath || "/"} ${err.message}`)
            .join("; ");
        return;
      }
      const missing = getMissingRequiredLabels(normalized);
      validationOutput.textContent = missing.length
        ? `Valid JSON. Missing required fields: ${missing.join(", ")}.`
        : "Valid PlanMetadata JSON.";
    } catch (err) {
      validationOutput.textContent = `Invalid JSON: ${err.message}`;
    }
  });

  saveBtn.addEventListener("click", async () => {
    try {
      const parsed = JSON.parse(editor.value);
      const normalized = normalizePlanMetadata(parsed);
      editor.value = stringifyStable(normalized);
      updateRequiredChecklist();
      const ok = validatePlanMetadata(normalized);
      if (!ok) {
        validationOutput.textContent =
          "Validation errors: " +
          validatePlanMetadata.errors
            .map((err) => `${err.instancePath || "/"} ${err.message}`)
            .join("; ");
        saveStatusFocus.textContent = "Fix errors before saving.";
        return;
      }
      if (!isMetadataReadyCandidate(normalized)) {
        const missing = getMissingRequiredLabels(normalized);
        validationOutput.textContent = missing.length
          ? `Missing required fields: ${missing.join(", ")}.`
          : "Please fill all required fields before saving.";
        saveStatusFocus.textContent = "Complete required fields first.";
        return;
      }
      state.planMetadata = normalized;
      state.planMetadataApproved = true;
      const hash = await sha256HexString(stringifyStable(normalized));
      state.lastManifest = {
        app_version: state.appVersion,
        module_id: "metadata",
        module_version: "0.7.0",
        generated_at_utc: new Date().toISOString(),
        plan_metadata_hash: hash
      };
      saveState();
      validationOutput.textContent = "Saved to workspace.";
      saveStatusFocus.textContent = "Saved. Other modules unlocked.";
      setRoute("#/dashboard");
    } catch (err) {
      validationOutput.textContent = `Invalid JSON: ${err.message}`;
      saveStatusFocus.textContent = "Fix errors before saving.";
    }
  });

  saveBtnFocus.addEventListener("click", () => {
    saveStatusFocus.textContent = "";
    saveBtn.click();
  });

  downloadBtn.addEventListener("click", async () => {
    try {
      const parsed = JSON.parse(editor.value);
      const ok = validatePlanMetadata(parsed);
      if (!ok) {
        validationOutput.textContent =
          "Validation errors: " +
          validatePlanMetadata.errors
            .map((err) => `${err.instancePath || "/"} ${err.message}`)
            .join("; ");
        return;
      }
      const blob = new Blob([stringifyStable(parsed)], {
        type: "application/json"
      });
      downloadBlob(blob, "plan-metadata.json");
    } catch (err) {
      validationOutput.textContent = `Invalid JSON: ${err.message}`;
    }
  });

  renderManualFieldsFromJson();
  loadDocRegistryFromJson();
  renderDocRegistry();
  updateRequiredChecklist();

  toggleAdvancedBtn.addEventListener("click", () => {
    const open = advancedPanel.classList.contains("hidden");
    advancedPanel.classList.toggle("hidden", !open);
    toggleAdvancedBtn.textContent = open ? "Hide Advanced" : "Show Advanced";
  });

  editor.addEventListener("input", () => {
    updateRequiredChecklist();
  });
}

function renderDashboard(container) {
  const cards = deliverableCards();
  const startRoute = isMetadataReady() ? "#/guide" : "#/metadata";
  const startLabel = isMetadataReady() ? "Open Case Guide" : "Start Metadata";
  container.innerHTML = `
    <section class="page-hero">
      <div class="page-title">
        <h2>Case Dashboard</h2>
        <p>Start from the current case context, then choose the next workflow based on the inputs you have.</p>
      </div>
    </section>

    ${planContextHtml()}

    ${renderWorkflowStatePanel({ title: "Current Case State" })}

    <div class="workflow-band">
      <h3>Recommended Next Action</h3>
      <p class="muted">The final goal is the Actuarial Case Memo. Start with Metadata, then use Case Guide and Evidence Guide to gather only the next missing evidence needed for downstream deliverables.</p>
      <div class="button-row">
        <button class="primary" data-dashboard-route="${startRoute}">${startLabel}</button>
        <button class="ghost" data-dashboard-route="#/guide">Case Guide</button>
        <button class="ghost" data-dashboard-route="#/evidence-guide">Next Evidence</button>
        <button class="ghost" data-dashboard-route="#/v1-engine-explorer">Open V1 Explorer</button>
        <button class="ghost" data-dashboard-route="#/v1-audit">Audit V1 Match</button>
        <button class="ghost" data-dashboard-route="#/metadata">Edit Metadata</button>
        <button class="ghost" data-dashboard-route="#/audit">Audit / Manifest</button>
      </div>
    </div>

    <div class="workflow-grid">
      ${cards
        .map((card) => {
          const readiness = upstreamReadiness(card.upstreamInputs);
          return `
            <article class="workflow-card ${card.status.toLowerCase().includes("scaffold") ? "scaffold" : ""}">
              <div class="workflow-card-head">
                <h3>${escapeHtml(card.title)}</h3>
                <span>${escapeHtml(card.status)}</span>
              </div>
              <p>${escapeHtml(card.description)}</p>
              <div class="workflow-output">
                <b>Output</b>
                <span>${escapeHtml(card.outputName ?? "unknown/na")}</span>
              </div>
              <div class="workflow-readiness ${readiness.complete ? "ready" : "missing"}">
                Shared inputs: ${readiness.ready}/${readiness.total} ready
              </div>
              <div class="workflow-inputs">
                <b>Inputs</b>
                <ul>
                  ${card.inputs.map((input) => `<li>${escapeHtml(input)}</li>`).join("")}
                </ul>
              </div>
              <button data-dashboard-route="${card.route}">${escapeHtml(card.action)}</button>
            </article>
          `;
        })
        .join("")}
    </div>
  `;

  hydratePlanContext(container);
  container.querySelectorAll("[data-dashboard-route]").forEach((btn) => {
    btn.addEventListener("click", () => setRoute(btn.dataset.dashboardRoute));
  });
}

function renderCaseGuide(container) {
  const activeStep = caseGuideSteps.find((step) => step.id === activeGuideStepId) ?? caseGuideSteps[0];
  const activeStatus = guideStepStatus(activeStep);
  const activeIndex = caseGuideSteps.findIndex((step) => step.id === activeStep.id);
  const canPrev = activeIndex > 0;
  const canNext = activeIndex < caseGuideSteps.length - 1;

  container.innerHTML = `
    <section class="page-hero">
      <div class="page-title">
        <h2>Case Guide</h2>
        <p>Follow the caseworkbench flow. Missing inputs are allowed, but they stay visible as warnings and unknown/na placeholders.</p>
      </div>
      <div class="page-actions">
        <button class="ghost" data-guide-route="#/evidence-guide">Next Evidence</button>
      </div>
    </section>

    ${planContextHtml()}

    ${renderWorkflowStatePanel({ title: "Shared Case Inputs" })}

    ${renderCanonicalDeliverablesPanel()}

    <div class="guide-shell">
      <nav class="guide-steps" aria-label="Case guide steps">
        ${caseGuideSteps.map(renderGuideStepButton).join("")}
      </nav>
      <section class="guide-dialog">
        <div class="guide-dialog-head">
          <div>
            <span>${escapeHtml(activeStep.phase)}</span>
            <h3>${escapeHtml(activeStep.title)}</h3>
          </div>
          <b class="${activeStatus.complete ? "ready" : "warning"}">${activeStatus.ready}/${activeStatus.total} ready</b>
        </div>
        <p>${escapeHtml(activeStep.prompt)}</p>
        <div class="guide-readiness">
          ${activeStatus.statuses
            .map(
              (status) => `
                <div class="${status.ready ? "ready" : "missing"}">
                  <b>${status.ready ? "Ready" : "Needed"}</b>
                  <span>${escapeHtml(status.label)}</span>
                  <small>${escapeHtml(status.detail)}</small>
                </div>`
            )
            .join("")}
        </div>
        <div class="guide-actions-grid">
          <div>
            <b>Gather Outside Info</b>
            <p>${escapeHtml(activeStep.uploadAction)}</p>
          </div>
          <div>
            <b>Manual Review</b>
            <p>${escapeHtml(activeStep.manualAction)}</p>
          </div>
          <div>
            <b>Programmed Step</b>
            <p>${escapeHtml(activeStep.programmedAction)}</p>
          </div>
        </div>
        <div class="banner subtle">
          ${activeStep.warnings.map((warning) => escapeHtml(warning)).join(" ")}
        </div>
        <div class="button-row">
          <button class="ghost" id="guide_prev" ${canPrev ? "" : "disabled"}>Previous</button>
          <button class="primary" data-guide-route="${escapeHtml(activeStep.route)}">Open ${escapeHtml(activeStep.title)}</button>
          ${activeStep.alternateRoute ? `<button class="ghost" data-guide-route="${escapeHtml(activeStep.alternateRoute)}">Alternate workflow</button>` : ""}
          <button class="ghost" id="guide_next" ${canNext ? "" : "disabled"}>Continue with warnings</button>
        </div>
      </section>
    </div>
  `;

  hydratePlanContext(container);

  container.querySelectorAll("[data-guide-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeGuideStepId = btn.dataset.guideStep;
      renderCaseGuide(container);
    });
  });
  container.querySelectorAll("[data-guide-route]").forEach((btn) => {
    btn.addEventListener("click", () => setRoute(btn.dataset.guideRoute));
  });
  const prevBtn = container.querySelector("#guide_prev");
  const nextBtn = container.querySelector("#guide_next");
  prevBtn?.addEventListener("click", () => {
    if (!canPrev) return;
    activeGuideStepId = caseGuideSteps[activeIndex - 1].id;
    renderCaseGuide(container);
  });
  nextBtn?.addEventListener("click", () => {
    if (!canNext) return;
    activeGuideStepId = caseGuideSteps[activeIndex + 1].id;
    renderCaseGuide(container);
  });
}

async function buildInputRequirementsExport() {
  const planMetadataHash = state.planMetadata
    ? await sha256HexString(stringifyStable(state.planMetadata))
    : "unknown";
  return {
    meta: {
      app_version: APP_VERSION,
      schema_version: SCHEMA_VERSION,
      module_id: "input-requirements-matrix",
      module_version: "0.7.0",
      generated_at_utc: new Date().toISOString(),
      case_number: state.planMetadata?.meta?.case_number?.value ?? "unknown",
      plan_metadata_hash: planMetadataHash
    },
    pure_input_families: [
      "Case metadata",
      "Plan document facts",
      "Participant/census/payee data",
      "Payment history/current benefit status",
      "PBGC and actuarial reference assumptions",
      "Templates and approved engine references"
    ],
    canonical_deliverables: canonicalDeliverables.map((item) => ({
      id: item.id,
      output_name: item.outputName,
      title: item.title,
      status: item.status,
      summary: item.summary,
      route: item.route
    })),
    deliverables: buildInputRequirementRows().map((item) => ({
      id: item.id,
      title: item.title,
      canonical_output_name: canonicalDeliverableById(inputMatrixToCanonicalDeliverable[item.id])?.outputName ?? "unknown/na",
      route: item.route,
      pure_inputs: item.pureInputs,
      upstream_outputs: item.upstreamOutputs,
      governing_references: item.governingReferences,
      readiness: item.readiness.map((status) => ({
        key: status.key,
        ready: status.ready,
        label: status.label,
        detail: status.detail
      })),
      ready_count: item.ready_count,
      required_count: item.required_count
    }))
  };
}

async function buildRulesRegistryExport() {
  const planMetadataHash = state.planMetadata
    ? await sha256HexString(stringifyStable(state.planMetadata))
    : "unknown";
  return {
    meta: {
      app_version: APP_VERSION,
      schema_version: SCHEMA_VERSION,
      module_id: "rules-registry",
      module_version: "0.7.0",
      generated_at_utc: new Date().toISOString(),
      case_number: state.planMetadata?.meta?.case_number?.value ?? "unknown",
      plan_metadata_hash: planMetadataHash
    },
    rule_classes: {
      mechanical: "Deterministic validators/generators/program logic suitable for browser execution.",
      llm_assisted: "Extraction or normalization tasks where messy documents or language require LLM assistance before validation.",
      human_review: "Actuarial/legal/ambiguity decisions requiring explicit user approval."
    },
    class_counts: rulesByClass(),
    rules: rulesRegistry
  };
}

function renderRulesRegistry(container) {
  const counts = rulesByClass();
  container.innerHTML = `
    <section class="page-hero">
      <div class="page-title">
        <h2>Technical Rules Registry</h2>
        <p>Developer/control reference for what can become deterministic code, what needs LLM extraction, and what requires human review.</p>
      </div>
      <div class="page-actions">
        <button class="primary" id="download_rules_registry">Download rules-registry.json</button>
        <button class="ghost" data-rules-route="#/evidence-guide">Back to Next Evidence</button>
      </div>
    </section>

    ${planContextHtml()}

    <div class="rules-summary-grid">
      <div><span>Mechanical</span><b>${escapeHtml(String(counts.mechanical ?? 0))}</b><small>Programable validators/generators</small></div>
      <div><span>LLM-assisted</span><b>${escapeHtml(String(counts.llm_assisted ?? 0))}</b><small>Extraction/normalization tasks</small></div>
      <div><span>Human review</span><b>${escapeHtml(String(counts.human_review ?? 0))}</b><small>Ambiguity and approval decisions</small></div>
    </div>

    <div class="banner subtle">
      This is not a workflow step for everyday use. It is the implementation roadmap behind the guided evidence flow.
    </div>

    <div class="rules-registry-list">
      ${rulesRegistry.map(renderRuleCard).join("")}
    </div>

    <pre id="rules_registry_status" class="code" style="margin-top:12px;"></pre>
  `;

  hydratePlanContext(container);
  container.querySelectorAll("[data-rules-route]").forEach((btn) => {
    btn.addEventListener("click", () => setRoute(btn.dataset.rulesRoute));
  });

  const downloadBtn = container.querySelector("#download_rules_registry");
  const statusEl = container.querySelector("#rules_registry_status");
  downloadBtn.addEventListener("click", async () => {
    try {
      const payload = await buildRulesRegistryExport();
      state.lastManifest = payload.meta;
      saveState();
      downloadBlob(
        new Blob([stringifyStable(payload)], { type: "application/json" }),
        "rules-registry.json"
      );
      statusEl.textContent = `Downloaded rules-registry.json\n\n${JSON.stringify(payload.meta, null, 2)}`;
    } catch (err) {
      statusEl.textContent = `ERROR: ${err.message}`;
    }
  });
}

function renderRuleCard(rule) {
  return `
    <article class="rule-card ${escapeHtml(rule.rule_class)}">
      <div class="workflow-card-head">
        <h3>${escapeHtml(rule.id)}: ${escapeHtml(rule.title)}</h3>
        <span>${escapeHtml(rule.rule_class.replace("_", " "))}</span>
      </div>
      <div class="rule-status">${escapeHtml(rule.status.replaceAll("_", " "))}</div>
      <div class="requirements-columns">
        <div><b>Deliverables</b><ul>${rule.deliverables.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
        <div><b>Inputs</b><ul>${rule.input_artifacts.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
        <div><b>Outputs</b><ul>${rule.output_artifacts.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
      </div>
      <div class="workflow-inputs">
        <b>Governing references</b>
        <ul>${rule.governing_references.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
    </article>
  `;
}

function renderInputsMatrix(container) {
  const rows = buildInputRequirementRows();
  container.innerHTML = `
    <section class="page-hero">
      <div class="page-title">
        <h2>Input Contracts</h2>
        <p>Technical reference showing raw inputs, upstream outputs, and governing references for each deliverable.</p>
      </div>
      <div class="page-actions">
        <button class="primary" id="download_inputs_matrix">Download requirements JSON</button>
        <button class="ghost" data-inputs-route="#/evidence-guide">Back to Next Evidence</button>
        <button class="ghost" id="open_rules_registry">Technical Rules</button>
      </div>
    </section>

    ${planContextHtml()}

    ${renderWorkflowStatePanel({ title: "Shared Case Inputs" })}

    <div class="banner subtle">
      This page is a reference table. For day-to-day workflow, use Next Evidence and Case Guide.
    </div>

    <div class="input-family-grid">
      ${[
        ["Case metadata", "Case number, plan name, dates, assigned staff, asset/status facts."],
        ["Plan document facts", "Plan documents, amendments, SPDs, CBAs, restatements, freeze evidence with citations."],
        ["Participant data", "Census, payee, beneficiary, alternate payee, and source-priority data."],
        ["Payment history", "Current benefits, estimated payments, over/underpayment facts, pay source/status."],
        ["PBGC assumptions", "Rates, mortality, limitations, 4022(c), aggregate limits, form/payment rules."],
        ["Templates / engines", "DOCX/XLSX templates, BSRS configs, approved V1Summary JSON references."]
      ]
        .map(
          ([title, desc]) => `
            <div class="input-family-card">
              <b>${escapeHtml(title)}</b>
              <span>${escapeHtml(desc)}</span>
            </div>`
        )
        .join("")}
    </div>

    <div class="requirements-list">
      ${rows
        .map(
          (item) => `
            <article class="requirements-card">
              <div class="workflow-card-head">
                <h3>${escapeHtml(item.title)}</h3>
                <span>${item.ready_count}/${item.required_count} ready</span>
              </div>
              <div class="requirements-readiness">
                ${item.readiness
                  .map(
                    (status) => `
                      <div class="${status.ready ? "ready" : "missing"}">
                        <b>${status.ready ? "Ready" : "Needed"}</b>
                        <span>${escapeHtml(status.label)}</span>
                        <small>${escapeHtml(status.detail)}</small>
                      </div>`
                  )
                  .join("")}
              </div>
              <div class="requirements-columns">
                <div>
                  <b>Pure inputs</b>
                  <ul>${item.pureInputs.map((input) => `<li>${escapeHtml(input)}</li>`).join("")}</ul>
                </div>
                <div>
                  <b>Upstream workbench outputs</b>
                  <ul>${item.upstreamOutputs.map((input) => `<li>${escapeHtml(input)}</li>`).join("")}</ul>
                </div>
                <div>
                  <b>Governing references</b>
                  <ul>${item.governingReferences.map((input) => `<li>${escapeHtml(input)}</li>`).join("")}</ul>
                </div>
              </div>
              <button class="ghost" data-requirement-route="${escapeHtml(item.route)}">Open workflow</button>
            </article>`
        )
        .join("")}
    </div>

    <pre id="inputs_matrix_status" class="code" style="margin-top:12px;"></pre>
  `;

  hydratePlanContext(container);
  container.querySelectorAll("[data-inputs-route]").forEach((btn) => {
    btn.addEventListener("click", () => setRoute(btn.dataset.inputsRoute));
  });

  container.querySelectorAll("[data-requirement-route]").forEach((btn) => {
    btn.addEventListener("click", () => setRoute(btn.dataset.requirementRoute));
  });

  const downloadBtn = container.querySelector("#download_inputs_matrix");
  const rulesBtn = container.querySelector("#open_rules_registry");
  const statusEl = container.querySelector("#inputs_matrix_status");
  rulesBtn.addEventListener("click", () => setRoute("#/rules"));
  downloadBtn.addEventListener("click", async () => {
    try {
      const payload = await buildInputRequirementsExport();
      state.lastManifest = payload.meta;
      saveState();
      downloadBlob(
        new Blob([stringifyStable(payload)], { type: "application/json" }),
        "case-input-requirements.json"
      );
      statusEl.textContent = `Downloaded case-input-requirements.json\n\n${JSON.stringify(payload.meta, null, 2)}`;
    } catch (err) {
      statusEl.textContent = `ERROR: ${err.message}`;
    }
  });
}

const CANONICAL_V1_RUN_ORDER = [
  "XRD",
  "XRDVAL",
  "NRD",
  "EURD",
  "ERD",
  "DOR",
  "DORNSF",
  "DORDOTR",
  "RBD",
  "QPSA",
  "PRDBVAL",
  "RETRO",
  "Single Run"
];

function canonicalV1RunOrder(runs) {
  const unique = [...new Set((runs ?? []).filter(Boolean).map(String))];
  const known = CANONICAL_V1_RUN_ORDER.filter((run) => unique.includes(run));
  const unknown = unique.filter((run) => !CANONICAL_V1_RUN_ORDER.includes(run)).sort();
  return [...known, ...unknown];
}

function getV1RecordById(recordId) {
  return state.v1Warehouse.records.find((record) => record.record_id === recordId);
}

function tabRunNames(cells) {
  const names = new Set();
  cells.forEach((cell) => Object.keys(cell.runs ?? {}).forEach((run) => names.add(run)));
  return canonicalV1RunOrder([...names]);
}

function buildV1ReconstructionPreview(record) {
  if (!record?.summary) return null;
  const cells = extractCellEntries(record.summary);
  const byTab = new Map();
  cells.forEach((cell) => {
    const tab = cell.sourceTab || "unknown";
    if (!byTab.has(tab)) byTab.set(tab, []);
    byTab.get(tab).push(cell);
  });

  const tabs = [...byTab.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tab, tabCells]) => {
      const formulaCells = tabCells.filter((cell) => cell.hasFormula || cell.formula);
      const runs = tabRunNames(tabCells);
      const runRows = runs.map((run, index) => ({
        run,
        row: 4 + index
      }));
      const warnings = [];
      if (!formulaCells.length) warnings.push("No formula cells identified for this tab.");
      if (!runs.length) warnings.push("No run mappings identified for this tab.");
      if (runs.length && runs[0] !== "XRD" && runs[0] !== "Single Run") {
        warnings.push(`First run is ${runs[0]}, not XRD.`);
      }
      return {
        tab_name: tab,
        formula_row: 2,
        first_run_row: runRows[0]?.row ?? "unknown",
        cell_count: tabCells.length,
        formula_count: formulaCells.length,
        input_count: tabCells.length - formulaCells.length,
        runs,
        run_rows: runRows,
        warnings
      };
    });

  const warnings = [];
  if (!tabs.length) warnings.push("No source tabs found.");
  if (!cells.length) warnings.push("No cells found.");
  return {
    record_id: record.record_id,
    workbook_name: record.workbook_name,
    source_file: record.source_file,
    sha256: record.sha256,
    assumptions: {
      formula_row: 2,
      first_run: "XRD when present",
      first_run_row: 4,
      canonical_run_order: CANONICAL_V1_RUN_ORDER
    },
    workbook_runs: canonicalV1RunOrder(record.summary.runs ?? []),
    tab_count: tabs.length,
    cell_count: cells.length,
    formula_count: cells.filter((cell) => cell.hasFormula || cell.formula).length,
    tabs,
    warnings
  };
}

function selectedOrTopV1Records(limit = 5) {
  const ids = [];
  const selected = getSelectedV1Summary();
  if (selected?.candidate_record_id) ids.push(selected.candidate_record_id);
  state.v1Warehouse.rankings.slice(0, limit).forEach((ranking) => ids.push(ranking.candidate_record_id));
  if (!ids.length) state.v1Warehouse.records.slice(0, limit).forEach((record) => ids.push(record.record_id));
  return [...new Set(ids)].map(getV1RecordById).filter(Boolean);
}

async function buildV1AuditExport() {
  const planMetadataHash = state.planMetadata
    ? await sha256HexString(stringifyStable(state.planMetadata))
    : "unknown";
  const records = selectedOrTopV1Records(5);
  return {
    meta: {
      app_version: APP_VERSION,
      schema_version: SCHEMA_VERSION,
      module_id: "v1-match-reconstruction-audit",
      module_version: "0.7.0",
      generated_at_utc: new Date().toISOString(),
      case_number: state.planMetadata?.meta?.case_number?.value ?? "unknown",
      plan_metadata_hash: planMetadataHash
    },
    r5_profile: getR5WorkflowSummary()?.profile ?? null,
    selected_candidate: getSelectedV1Summary() ?? null,
    ranking_assumptions: {
      current_score_formula: "0.70 domain overlap + 0.15 function breadth + 0.15 field breadth",
      warning: "Similarity is an advisory reuse signal only. It is not production approval."
    },
    rankings: state.v1Warehouse.rankings.slice(0, 10),
    reconstruction_previews: records.map(buildV1ReconstructionPreview).filter(Boolean)
  };
}

function normalizeV1TabName(tabName) {
  return String(tabName ?? "unknown")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function addCount(map, key, amount = 1) {
  const normalized = String(key ?? "").trim();
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) ?? 0) + amount);
}

function countMapToObject(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function topCounts(map, limit = 10) {
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

function extractV1CellRuns(cell) {
  const runs = cell?.runs;
  if (!runs || typeof runs !== "object" || Array.isArray(runs)) return [];
  return Object.entries(runs).map(([runName, runData]) => ({
    run_name: String(runName),
    field: runData?.field ? String(runData.field) : "",
    iob: runData?.iob ? String(runData.iob).toUpperCase() : ""
  }));
}

function inferV1TabPopulationSignals(tabName, fields, runs, descriptions) {
  const haystack = [tabName, ...fields, ...runs, ...descriptions].join(" ").toLowerCase();
  const signals = [];
  if (/\b(ap|qdro|alternate payee)\b/.test(haystack)) signals.push("alternate_payee_or_qdro");
  if (/\b(benes?|beneficiar|spouse|survivor|qpsa)\b/.test(haystack)) signals.push("beneficiary_or_survivor");
  if (/\b(retiree|retired|in pay|pay status)\b/.test(haystack)) signals.push("retiree_or_in_pay");
  if (/\b(sep|separated|vested|deferred|term vested)\b/.test(haystack)) signals.push("deferred_vested");
  if (/\b(active|accruing|employee)\b/.test(haystack)) signals.push("active_participant");
  if (/\b(disabled|disability)\b/.test(haystack)) signals.push("disabled_participant");
  if (runs.some((run) => String(run).toUpperCase() === "XRD")) signals.push("has_xrd_run");
  return [...new Set(signals)].sort();
}

function extractApprovedV1TabPattern(record) {
  const summary = record.summary ?? {};
  const cells = extractCellEntries(summary);
  const tabMap = new Map();
  const declaredTabs = Array.isArray(summary.sourceTabs) ? summary.sourceTabs : [];
  declaredTabs.forEach((tab) => tabMap.set(String(tab), []));

  cells.forEach((cell) => {
    const tab = String(cell.sourceTab ?? String(cell.key ?? "").split("::")[0] ?? "unknown").trim() || "unknown";
    if (!tabMap.has(tab)) tabMap.set(tab, []);
    tabMap.get(tab).push(cell);
  });

  const tabPatterns = [...tabMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([tabName, tabCells]) => {
      const fieldCounts = new Map();
      const runCounts = new Map();
      const iobCounts = new Map();
      const descriptions = [];
      let formulaCount = 0;

      tabCells.forEach((cell) => {
        if (cell.hasFormula || cell.formula) formulaCount += 1;
        if (cell.genericField) addCount(fieldCounts, cell.genericField);
        if (cell.description) descriptions.push(String(cell.description));
        extractV1CellRuns(cell).forEach((run) => {
          addCount(runCounts, run.run_name);
          if (run.iob) addCount(iobCounts, run.iob);
          if (run.field) addCount(fieldCounts, run.field);
        });
      });

      const fields = [...fieldCounts.keys()].sort();
      const runs = [...runCounts.keys()].sort();
      const normalizedTab = normalizeV1TabName(tabName);
      return {
        record_id: record.record_id,
        workbook_name: record.workbook_name,
        source_file: record.source_file,
        source_tab: tabName,
        normalized_tab_name: normalizedTab,
        pattern_signature: `${normalizedTab}|runs:${runs.join(",") || "none"}|fields:${fields.length}|formulas:${formulaCount}`,
        cell_count: tabCells.length,
        formula_count: formulaCount,
        runs,
        run_counts: countMapToObject(runCounts),
        field_count: fields.length,
        fields: fields.slice(0, 250),
        top_fields: topCounts(fieldCounts, 25),
        iob_counts: countMapToObject(iobCounts),
        population_signals: inferV1TabPopulationSignals(tabName, fields, runs, descriptions)
      };
    });

  return {
    record_id: record.record_id,
    workbook_name: record.workbook_name,
    source_file: record.source_file,
    sha256: record.sha256,
    schema_version: record.schema_version,
    declared_source_tabs: declaredTabs.map(String).sort(),
    declared_runs: Array.isArray(summary.runs) ? summary.runs.map(String).sort() : [],
    tab_count: tabPatterns.length,
    tab_patterns: tabPatterns
  };
}

async function buildV1TabPatternCorpus(records = state.v1Warehouse.records) {
  const planMetadataHash = state.planMetadata
    ? await sha256HexString(stringifyStable(state.planMetadata))
    : "unknown";
  const workbookPatterns = records.map(extractApprovedV1TabPattern);
  const allPatterns = workbookPatterns.flatMap((workbook) => workbook.tab_patterns);
  const tabNameFrequency = new Map();
  const runFrequencyByTab = new Map();
  const fieldFrequencyByTab = new Map();
  const signatureFrequency = new Map();
  const warnings = [];

  allPatterns.forEach((pattern) => {
    addCount(tabNameFrequency, pattern.normalized_tab_name);
    addCount(signatureFrequency, pattern.pattern_signature);
    if (!pattern.runs.includes("XRD")) {
      warnings.push(`${pattern.workbook_name}/${pattern.source_tab}: no XRD run detected.`);
    }
    if (!runFrequencyByTab.has(pattern.normalized_tab_name)) runFrequencyByTab.set(pattern.normalized_tab_name, new Map());
    if (!fieldFrequencyByTab.has(pattern.normalized_tab_name)) fieldFrequencyByTab.set(pattern.normalized_tab_name, new Map());
    pattern.runs.forEach((run) => addCount(runFrequencyByTab.get(pattern.normalized_tab_name), run));
    pattern.fields.forEach((field) => addCount(fieldFrequencyByTab.get(pattern.normalized_tab_name), field));
  });

  const tabCount = allPatterns.length;
  const unusualTabs = topCounts(tabNameFrequency, 500)
    .filter((item) => item.count === 1)
    .map((item) => item.name)
    .sort();
  const runFrequencyObject = {};
  const fieldFrequencyObject = {};
  [...runFrequencyByTab.keys()].sort().forEach((tab) => {
    runFrequencyObject[tab] = countMapToObject(runFrequencyByTab.get(tab));
  });
  [...fieldFrequencyByTab.keys()].sort().forEach((tab) => {
    fieldFrequencyObject[tab] = topCounts(fieldFrequencyByTab.get(tab), 75);
  });

  return {
    meta: {
      app_version: APP_VERSION,
      schema_version: SCHEMA_VERSION,
      module_id: "v1-tab-pattern-corpus",
      module_version: "0.7.0",
      generated_at_utc: new Date().toISOString(),
      case_number: state.planMetadata?.meta?.case_number?.value ?? "unknown",
      plan_metadata_hash: planMetadataHash,
      approved_v1_count: records.length,
      read_only: true
    },
    summary: {
      workbook_count: records.length,
      tab_pattern_count: tabCount,
      unique_tab_name_count: tabNameFrequency.size,
      common_tabs: topCounts(tabNameFrequency, 12),
      common_pattern_signatures: topCounts(signatureFrequency, 12),
      unusual_tabs,
      warning_count: warnings.length
    },
    workbook_patterns: workbookPatterns,
    tab_patterns: allPatterns.sort((a, b) => {
      const workbook = a.workbook_name.localeCompare(b.workbook_name);
      if (workbook) return workbook;
      return a.source_tab.localeCompare(b.source_tab);
    }),
    tab_name_frequencies: countMapToObject(tabNameFrequency),
    run_frequencies_by_tab: runFrequencyObject,
    field_frequencies_by_tab: fieldFrequencyObject,
    warnings
  };
}

function renderV1TabPatternCorpusSummary(corpus) {
  if (!corpus) {
    return `<div class="meta-line">No tab-pattern corpus built yet.</div>`;
  }
  return `
    <div class="v1-summary-grid">
      <div><b>${corpus.summary.workbook_count}</b><span>workbooks</span></div>
      <div><b>${corpus.summary.tab_pattern_count}</b><span>tab patterns</span></div>
      <div><b>${corpus.summary.unique_tab_name_count}</b><span>unique tab names</span></div>
    </div>
    <div class="requirements-columns">
      <div>
        <b>Common tabs</b>
        <ul>${corpus.summary.common_tabs.map((item) => `<li>${escapeHtml(item.name)} (${item.count})</li>`).join("") || "<li>none</li>"}</ul>
      </div>
      <div>
        <b>Unusual tabs</b>
        <ul>${corpus.summary.unusual_tabs.slice(0, 10).map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>none</li>"}</ul>
      </div>
      <div>
        <b>Warnings</b>
        <ul>${corpus.warnings.slice(0, 6).map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>none</li>"}</ul>
      </div>
    </div>
  `;
}

function collectBlueprintInputFields() {
  const fieldSet = new Set();
  const synthetic = getSyntheticPopulationSummary();
  (synthetic?.fields ?? []).forEach((field) => fieldSet.add(String(field).trim()));
  if (!fieldSet.size) {
    try {
      parseDdCsvCatalog(defaultDdCsvText).fields
        .filter((field) => field.inputField)
        .forEach((field) => fieldSet.add(field.name));
    } catch {
      // The bundled DD.csv is validated elsewhere; keep blueprint generation resilient.
    }
  }
  return [...fieldSet].filter(Boolean).sort();
}

function desiredV1PopulationSignals(r5Domains, inputFields) {
  const domains = new Set(r5Domains ?? []);
  const fields = new Set((inputFields ?? []).map((field) => String(field).toUpperCase()));
  const signals = new Set(["retiree_or_in_pay", "deferred_vested"]);
  if (domains.has("qpsa_qdro")) {
    signals.add("alternate_payee_or_qdro");
    signals.add("beneficiary_or_survivor");
  }
  if (domains.has("retirement_dates") || domains.has("service") || fields.has("RETSTAT")) {
    signals.add("active_participant");
  }
  if ([...fields].some((field) => field.includes("BEN") || field.includes("SP") || field.includes("SURV"))) {
    signals.add("beneficiary_or_survivor");
  }
  if ([...fields].some((field) => field.includes("QDRO") || /^AP(_|$)/.test(field) || field.includes("ALTERNATE_PAYEE"))) {
    signals.add("alternate_payee_or_qdro");
  }
  return [...signals].sort();
}

function findRepresentativeV1TabPattern(corpus, signal, selectedRecordId) {
  const patterns = corpus?.tab_patterns ?? [];
  const matching = patterns.filter((pattern) => (pattern.population_signals ?? []).includes(signal));
  if (!matching.length) return null;
  return matching
    .map((pattern) => ({
      pattern,
      score:
        (selectedRecordId && pattern.record_id === selectedRecordId ? 1000 : 0) +
        (pattern.runs.includes("XRD") ? 100 : 0) +
        pattern.formula_count / 100 +
        pattern.cell_count / 1000
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.pattern.pattern_signature.localeCompare(b.pattern.pattern_signature);
    })[0].pattern;
}

function fallbackV1TabNameForSignal(signal) {
  return {
    active_participant: "Active",
    alternate_payee_or_qdro: "AP",
    beneficiary_or_survivor: "Benes",
    deferred_vested: "Sep Vested",
    disabled_participant: "DBs",
    retiree_or_in_pay: "Retirees"
  }[signal] ?? signal;
}

async function buildV1TabBlueprintRecommendation() {
  if (!state.v1Warehouse.tabPatternCorpus) {
    if (!state.v1Warehouse.records.length) throw new Error("Build or import the V1 tab-pattern corpus first.");
    state.v1Warehouse.tabPatternCorpus = await buildV1TabPatternCorpus();
  }
  const corpus = state.v1Warehouse.tabPatternCorpus;
  const planMetadataHash = state.planMetadata
    ? await sha256HexString(stringifyStable(state.planMetadata))
    : "unknown";
  const r5Profile = getR5WorkflowSummary()?.profile ?? null;
  const selected = getSelectedV1Summary();
  const inputFields = collectBlueprintInputFields();
  const desiredSignals = desiredV1PopulationSignals(r5Profile?.recognized_domains ?? [], inputFields);
  const warnings = [];
  if (!r5Profile) warnings.push("No R5Summary profile loaded; recommendation uses default population classes and input fields only.");
  if (!selected) warnings.push("No selected V1 candidate; tab representatives are chosen from the corpus instead of a chosen workbook.");
  if (!getSyntheticPopulationSummary()) warnings.push("No synthetic/population field inventory found; bundled DD.csv input fields were used.");

  const tabs = desiredSignals.map((signal) => {
    const representative = findRepresentativeV1TabPattern(corpus, signal, selected?.candidate_record_id);
    const observedFields = representative?.fields ?? [];
    const fieldOverlap = inputFields.filter((field) => observedFields.includes(field));
    const missingFromRepresentative = inputFields.filter((field) => !observedFields.includes(field)).slice(0, 100);
    const runs = representative?.runs?.length ? representative.runs : ["XRD"];
    const tabWarnings = [];
    if (!representative) tabWarnings.push("No approved V1 corpus tab matched this population signal; tab name and XRD run are inferred.");
    if (!runs.includes("XRD")) tabWarnings.push("Representative approved tab lacks XRD run; review before workbook generation.");
    if (missingFromRepresentative.length) tabWarnings.push(`${missingFromRepresentative.length} input field(s) not observed on the representative tab.`);
    return {
      population_signal: signal,
      recommended_source_tab: representative?.source_tab ?? fallbackV1TabNameForSignal(signal),
      evidence_level: representative ? "observed_approved_v1_pattern" : "inferred_no_direct_pattern",
      representative_workbook: representative?.workbook_name ?? "none",
      representative_record_id: representative?.record_id ?? "none",
      pattern_signature: representative?.pattern_signature ?? "none",
      recommended_runs: runs,
      formula_row: 2,
      first_run_row: 4,
      run_order_rule: "XRD first when present; remaining runs retain approved/canonical order.",
      observed_formula_count: representative?.formula_count ?? 0,
      observed_cell_count: representative?.cell_count ?? 0,
      input_field_overlap: fieldOverlap,
      input_fields_not_observed_on_representative: missingFromRepresentative,
      warnings: tabWarnings
    };
  });

  return {
    meta: {
      app_version: APP_VERSION,
      schema_version: SCHEMA_VERSION,
      module_id: "v1-tab-blueprint-recommender",
      module_version: "0.7.0",
      generated_at_utc: new Date().toISOString(),
      case_number: state.planMetadata?.meta?.case_number?.value ?? "unknown",
      plan_metadata_hash: planMetadataHash,
      read_only: true
    },
    inputs: {
      r5_profile_loaded: !!r5Profile,
      recognized_r5_domains: r5Profile?.recognized_domains ?? [],
      selected_v1_candidate: selected ?? null,
      synthetic_population_loaded: !!getSyntheticPopulationSummary(),
      input_field_count: inputFields.length,
      corpus_meta: corpus.meta
    },
    recommendation: {
      status: warnings.length ? "usable_with_warnings" : "ready_for_review",
      recommended_tab_count: tabs.length,
      desired_population_signals: desiredSignals,
      tabs,
      non_mechanical_items: [
        "Plan-specific benefit formula interpretation remains outside this tab blueprint.",
        "Any tab without observed approved-V1 evidence requires actuarial review before production use.",
        "BCV/ATPBGC formula selection is not executed here; formulas remain opaque strings."
      ],
      warnings
    }
  };
}

function renderV1TabBlueprintSummary(blueprint) {
  if (!blueprint) return `<div class="meta-line">No V1 tab blueprint recommendation built yet.</div>`;
  return `
    <div class="v1-summary-grid">
      <div><b>${blueprint.recommendation.recommended_tab_count}</b><span>recommended tabs</span></div>
      <div><b>${blueprint.inputs.input_field_count}</b><span>input fields</span></div>
      <div><b>${blueprint.recommendation.warnings.length}</b><span>warnings</span></div>
    </div>
    <div class="requirements-list" style="margin-top:12px;">
      ${blueprint.recommendation.tabs
        .map(
          (tab) => `
            <div class="v1-list-item">
              <b>${escapeHtml(tab.recommended_source_tab)} | ${escapeHtml(tab.population_signal)}</b>
              <span>${escapeHtml(tab.evidence_level)} | runs: ${escapeHtml(tab.recommended_runs.join(", "))} | representative: ${escapeHtml(tab.representative_workbook)}</span>
            </div>`
        )
        .join("")}
    </div>
  `;
}

function renderV1Audit(container) {
  const records = selectedOrTopV1Records(5);
  const previews = records.map(buildV1ReconstructionPreview).filter(Boolean);
  container.innerHTML = `
    <section class="page-hero">
      <div class="page-title">
        <h2>V1 Match Audit</h2>
        <p>Inspect ranking evidence and workbook reconstruction assumptions before using a V1 candidate for production work.</p>
      </div>
      <div class="page-actions">
        <button class="primary" id="download_v1_audit">Download audit JSON</button>
      </div>
    </section>

    ${planContextHtml()}

    ${renderWorkflowStatePanel({ title: "Shared Case Inputs" })}

    <div class="banner subtle">
      Similarity is advisory. Production V1 generation should use this audit plus a template-based workbook reconstructor, not a blank workbook.
    </div>

    <div class="v1-audit-grid">
      <div class="card">
        <h3>Ranking Model</h3>
        <ul class="instruction-list">
          <li>Domain overlap weight: 70%</li>
          <li>Function breadth weight: 15%</li>
          <li>Field breadth weight: 15%</li>
          <li>Confidence increases with recognized R5 and matched candidate domains.</li>
        </ul>
      </div>
      <div class="card">
        <h3>Reconstruction Assumptions</h3>
        <ul class="instruction-list">
          <li>Formula row: row 2.</li>
          <li>First run row: row 4.</li>
          <li>Canonical first run: XRD when present.</li>
          <li>Single-run tabs retain one run row.</li>
        </ul>
      </div>
    </div>

    <div class="requirements-list">
      ${state.v1Warehouse.rankings.length
        ? state.v1Warehouse.rankings.slice(0, 10).map(renderV1AuditRankingCard).join("")
        : `<div class="card"><b>No ranking results yet.</b><p class="muted">Import approved V1 summaries, load R5, and rank candidates in V1 Explorer.</p></div>`}
    </div>

    <div class="section-divider"></div>
    <div class="card">
      <div class="workflow-card-head">
        <div>
          <h3>V1 Tab Pattern Corpus</h3>
          <p class="muted">Mine uploaded approved V1 summaries for source-tab populations, run sets, fields, and unusual tab names.</p>
        </div>
        <span>${state.v1Warehouse.records.length} approved V1 summaries loaded</span>
      </div>
      <div class="button-row">
        <button class="primary" id="build_v1_tab_corpus" ${state.v1Warehouse.records.length ? "" : "disabled"}>Build tab corpus</button>
        <button class="ghost" id="download_v1_tab_corpus" ${state.v1Warehouse.tabPatternCorpus ? "" : "disabled"}>Download corpus JSON</button>
      </div>
      <div id="v1_tab_corpus_summary" style="margin-top:12px;">
        ${renderV1TabPatternCorpusSummary(state.v1Warehouse.tabPatternCorpus)}
      </div>
    </div>

    <div class="card" style="margin-top:12px;">
      <div class="workflow-card-head">
        <div>
          <h3>V1 Tab Blueprint Recommendation</h3>
          <p class="muted">Recommend population tabs and run structure from R5 domains, population/DD fields, selected V1 evidence, and the approved tab corpus.</p>
        </div>
        <span>review required</span>
      </div>
      <div class="button-row">
        <button class="primary" id="build_v1_tab_blueprint" ${state.v1Warehouse.records.length || state.v1Warehouse.tabPatternCorpus ? "" : "disabled"}>Build tab blueprint</button>
        <button class="ghost" id="download_v1_tab_blueprint" ${state.v1Warehouse.tabBlueprintRecommendation ? "" : "disabled"}>Download blueprint JSON</button>
      </div>
      <div id="v1_tab_blueprint_summary" style="margin-top:12px;">
        ${renderV1TabBlueprintSummary(state.v1Warehouse.tabBlueprintRecommendation)}
      </div>
    </div>

    <div class="section-divider"></div>
    <h3>Reconstruction Preview</h3>
    <div class="requirements-list">
      ${previews.length
        ? previews.map(renderV1ReconstructionPreviewCard).join("")
        : `<div class="card"><b>No imported V1 summaries available.</b><p class="muted">Upload approved V1Summary JSON files in V1 Explorer first.</p></div>`}
    </div>

    <pre id="v1_audit_status" class="code" style="margin-top:12px;"></pre>
  `;

  hydratePlanContext(container);

  const downloadBtn = container.querySelector("#download_v1_audit");
  const buildCorpusBtn = container.querySelector("#build_v1_tab_corpus");
  const downloadCorpusBtn = container.querySelector("#download_v1_tab_corpus");
  const corpusSummaryEl = container.querySelector("#v1_tab_corpus_summary");
  const buildBlueprintBtn = container.querySelector("#build_v1_tab_blueprint");
  const downloadBlueprintBtn = container.querySelector("#download_v1_tab_blueprint");
  const blueprintSummaryEl = container.querySelector("#v1_tab_blueprint_summary");
  const statusEl = container.querySelector("#v1_audit_status");
  downloadBtn.addEventListener("click", async () => {
    try {
      const payload = await buildV1AuditExport();
      state.lastManifest = payload.meta;
      saveState();
      downloadBlob(
        new Blob([stringifyStable(payload)], { type: "application/json" }),
        "v1-match-reconstruction-audit.json"
      );
      statusEl.textContent = `Downloaded v1-match-reconstruction-audit.json\n\n${JSON.stringify(payload.meta, null, 2)}`;
    } catch (err) {
      statusEl.textContent = `ERROR: ${err.message}`;
    }
  });
  buildCorpusBtn.addEventListener("click", async () => {
    try {
      state.v1Warehouse.tabPatternCorpus = await buildV1TabPatternCorpus();
      state.v1Warehouse.tabBlueprintRecommendation = null;
      state.lastManifest = state.v1Warehouse.tabPatternCorpus.meta;
      saveState();
      corpusSummaryEl.innerHTML = renderV1TabPatternCorpusSummary(state.v1Warehouse.tabPatternCorpus);
      downloadCorpusBtn.disabled = false;
      downloadBlueprintBtn.disabled = true;
      blueprintSummaryEl.innerHTML = renderV1TabBlueprintSummary(null);
      statusEl.textContent = `Built v1-tab-pattern-corpus.json\n\n${JSON.stringify(state.v1Warehouse.tabPatternCorpus.meta, null, 2)}`;
    } catch (err) {
      statusEl.textContent = `ERROR: ${err.message}`;
    }
  });
  downloadCorpusBtn.addEventListener("click", () => {
    if (!state.v1Warehouse.tabPatternCorpus) return;
    downloadBlob(
      new Blob([stringifyStable(state.v1Warehouse.tabPatternCorpus)], { type: "application/json" }),
      "v1-tab-pattern-corpus.json"
    );
    statusEl.textContent = `Downloaded v1-tab-pattern-corpus.json\n\n${JSON.stringify(state.v1Warehouse.tabPatternCorpus.meta, null, 2)}`;
  });
  buildBlueprintBtn.addEventListener("click", async () => {
    try {
      state.v1Warehouse.tabBlueprintRecommendation = await buildV1TabBlueprintRecommendation();
      state.lastManifest = state.v1Warehouse.tabBlueprintRecommendation.meta;
      state.caseWorkflow.moduleRuns["v1-tab-blueprint"] = {
        output_name: "v1-tab-blueprint.json",
        generated_at_utc: state.v1Warehouse.tabBlueprintRecommendation.meta.generated_at_utc,
        manifest: state.v1Warehouse.tabBlueprintRecommendation.meta
      };
      saveState();
      corpusSummaryEl.innerHTML = renderV1TabPatternCorpusSummary(state.v1Warehouse.tabPatternCorpus);
      blueprintSummaryEl.innerHTML = renderV1TabBlueprintSummary(state.v1Warehouse.tabBlueprintRecommendation);
      downloadCorpusBtn.disabled = !state.v1Warehouse.tabPatternCorpus;
      downloadBlueprintBtn.disabled = false;
      statusEl.textContent = `Built v1-tab-blueprint.json\n\n${JSON.stringify(state.v1Warehouse.tabBlueprintRecommendation.meta, null, 2)}`;
    } catch (err) {
      statusEl.textContent = `ERROR: ${err.message}`;
    }
  });
  downloadBlueprintBtn.addEventListener("click", () => {
    if (!state.v1Warehouse.tabBlueprintRecommendation) return;
    downloadBlob(
      new Blob([stringifyStable(state.v1Warehouse.tabBlueprintRecommendation)], { type: "application/json" }),
      "v1-tab-blueprint.json"
    );
    statusEl.textContent = `Downloaded v1-tab-blueprint.json\n\n${JSON.stringify(state.v1Warehouse.tabBlueprintRecommendation.meta, null, 2)}`;
  });
}

function renderV1AuditRankingCard(result) {
  const selected = getSelectedV1Summary();
  const isSelected = selected?.candidate_record_id === result.candidate_record_id;
  return `
    <article class="requirements-card ${isSelected ? "selected" : ""}">
      <div class="workflow-card-head">
        <h3>${escapeHtml(result.workbook_name)}</h3>
        <span>${isSelected ? "Selected" : "Candidate"}</span>
      </div>
      <div class="v1-score-grid">
        <div><span>Overall</span><b>${escapeHtml(String(result.overall_score))}</b></div>
        <div><span>Confidence</span><b>${escapeHtml(String(result.confidence))}</b></div>
        <div><span>Completeness</span><b>${escapeHtml(String(result.completeness))}</b></div>
      </div>
      <div class="requirements-columns">
        <div><b>Matched domains</b><ul>${(result.matched_domains ?? []).map((d) => `<li>${escapeHtml(d)}</li>`).join("") || "<li>none</li>"}</ul></div>
        <div><b>Missing domains</b><ul>${(result.missing_domains ?? []).map((d) => `<li>${escapeHtml(d)}</li>`).join("") || "<li>none</li>"}</ul></div>
        <div><b>Warnings</b><ul>${(result.warnings ?? []).map((d) => `<li>${escapeHtml(d)}</li>`).join("") || "<li>none</li>"}</ul></div>
      </div>
    </article>
  `;
}

function renderV1ReconstructionPreviewCard(preview) {
  return `
    <article class="requirements-card">
      <div class="workflow-card-head">
        <h3>${escapeHtml(preview.workbook_name)}</h3>
        <span>${escapeHtml(String(preview.tab_count))} tab(s)</span>
      </div>
      <div class="v1-score-grid">
        <div><span>Cells</span><b>${escapeHtml(String(preview.cell_count))}</b></div>
        <div><span>Formulas</span><b>${escapeHtml(String(preview.formula_count))}</b></div>
        <div><span>Runs</span><b>${escapeHtml(preview.workbook_runs.join(", ") || "none")}</b></div>
      </div>
      <div class="v1-tab-preview-list">
        ${preview.tabs
          .slice(0, 12)
          .map(
            (tab) => `
              <div class="v1-tab-preview">
                <b>${escapeHtml(tab.tab_name)}</b>
                <span>Formula row ${escapeHtml(String(tab.formula_row))}; ${escapeHtml(String(tab.formula_count))} formulas; ${escapeHtml(String(tab.cell_count))} cells</span>
                <small>Run rows: ${escapeHtml(tab.run_rows.map((run) => `${run.run}->row ${run.row}`).join(", ") || "none")}</small>
                ${tab.warnings.length ? `<small>Warnings: ${escapeHtml(tab.warnings.join("; "))}</small>` : ""}
              </div>`
          )
          .join("")}
      </div>
      ${preview.warnings.length ? `<div class="meta-line">Workbook warnings: ${escapeHtml(preview.warnings.join("; "))}</div>` : ""}
    </article>
  `;
}

async function buildRunManifest(moduleId, moduleVersion, files) {
  const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const inputHashes = {};
  for (const file of sortedFiles) {
    inputHashes[file.name] = await sha256Hex(file);
  }
  const planMetadataHash = await sha256HexString(stringifyStable(state.planMetadata));
  return {
    app_version: APP_VERSION,
    schema_version: SCHEMA_VERSION,
    module_id: moduleId,
    module_version: moduleVersion,
    generated_at_utc: new Date().toISOString(),
    case_number: state.planMetadata?.meta?.case_number?.value ?? "unknown",
    input_hashes: inputHashes,
    plan_metadata_hash: planMetadataHash
  };
}

function extractFormulaReferences(formula) {
  const refs = new Set();
  const re = /\b[A-Z]{1,3}\$?\d+\b|\b[A-Za-z_][A-Za-z0-9_]*\b/g;
  const reserved = new Set([
    "IF",
    "AND",
    "OR",
    "NOT",
    "TRUE",
    "FALSE",
    "SUM",
    "MIN",
    "MAX",
    "ROUND",
    "VLOOKUP",
    "XLOOKUP",
    "INDEX",
    "MATCH"
  ]);
  for (const match of String(formula ?? "").matchAll(re)) {
    const token = match[0];
    if (!reserved.has(token.toUpperCase())) refs.add(token);
  }
  return [...refs].sort();
}

function collectFormulaStrings(value, out = [], path = "$") {
  if (out.length >= 250) return out;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("=") || /ATPBGC|Formula|formula|UDF/.test(trimmed)) {
      out.push({ path, formula: trimmed });
    }
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectFormulaStrings(item, out, `${path}[${i}]`));
    return out;
  }
  if (value && typeof value === "object") {
    Object.keys(value)
      .sort()
      .forEach((key) => collectFormulaStrings(value[key], out, `${path}.${key}`));
  }
  return out;
}

async function readTextPreview(file) {
  const textLike =
    file.type.startsWith("text/") ||
    /\.(json|txt|csv|md|xml)$/i.test(file.name);
  if (!textLike || file.size > 750000) return null;
  return file.text();
}

function buildGraphPayload(textPayloads) {
  const formulaRows = [];
  for (const item of textPayloads) {
    if (!item.text) continue;
    try {
      const parsed = JSON.parse(item.text);
      collectFormulaStrings(parsed).forEach((row) => {
        formulaRows.push({ source_file: item.name, ...row });
      });
    } catch {
      item.text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("=") || line.includes("ATPBGC"))
        .slice(0, 250)
        .forEach((formula, i) => {
          formulaRows.push({ source_file: item.name, path: `line:${i + 1}`, formula });
        });
    }
  }

  const nodes = new Map();
  const edges = [];
  formulaRows.slice(0, 250).forEach((row, i) => {
    const id = `${row.source_file}:${row.path}`;
    nodes.set(id, { id, label: row.path, source_file: row.source_file, formula: row.formula });
    extractFormulaReferences(row.formula).forEach((ref) => {
      nodes.set(ref, { id: ref, label: ref, source_file: "reference" });
      edges.push({ from: id, to: ref, relationship: "references" });
    });
  });

  return {
    formulas_analyzed: formulaRows.length,
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`))
  };
}

function buildCaseWorkflowContext(manifest) {
  const r5Summary = getR5WorkflowSummary();
  const selectedV1 = getSelectedV1Summary();
  return {
    plan_metadata: {
      case_number: manifest.case_number,
      plan_metadata_hash: manifest.plan_metadata_hash
    },
    r5_summary: r5Summary
      ? {
          status: "loaded",
          source_files: r5Summary.source_files ?? [],
          input_hashes: r5Summary.input_hashes ?? {},
          recognized_domains: r5Summary.profile?.recognized_domains ?? [],
          warnings: r5Summary.profile?.warnings ?? []
        }
      : {
          status: "unknown",
          source_files: [],
          input_hashes: {},
          recognized_domains: [],
          warnings: ["No R5 summary has been loaded into case state."]
        },
    selected_v1_engine: selectedV1
      ? {
          status: "selected",
          candidate_record_id: selectedV1.candidate_record_id ?? "unknown",
          workbook_name: selectedV1.workbook_name ?? "unknown",
          source_file: selectedV1.source_file ?? "unknown",
          sha256: selectedV1.sha256 ?? "unknown",
          overall_score: selectedV1.overall_score ?? "unknown",
          confidence: selectedV1.confidence ?? "unknown",
          matched_domains: selectedV1.matched_domains ?? []
        }
      : {
          status: "unknown",
          candidate_record_id: "unknown",
          workbook_name: "unknown",
          source_file: "unknown",
          sha256: "unknown",
          matched_domains: []
        }
  };
}

async function buildModuleArtifact(config, files, notes) {
  const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const manifest = await buildRunManifest(config.id, "0.7.0", sortedFiles);
  const textPayloads = [];
  for (const file of sortedFiles) {
    textPayloads.push({ name: file.name, text: await readTextPreview(file) });
  }

  const graph =
    config.id === "dag-viewer" || config.id === "formula-tree" || config.id === "v1-engine-generator"
      ? buildGraphPayload(textPayloads)
      : null;

  return {
    meta: manifest,
    case_context: buildCaseWorkflowContext(manifest),
    plan_metadata: {
      case_number: manifest.case_number,
      plan_metadata_hash: manifest.plan_metadata_hash
    },
    module: {
      id: config.id,
      title: config.title,
      status: "draft",
      rule: "Unknown or unsupported facts remain unknown/na. No plan provisions or factor values are invented."
    },
    inputs: sortedFiles.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type || "unknown",
      sha256: manifest.input_hashes[file.name]
    })),
    notes: notes.trim() || "unknown",
    citations_required: true,
    graph,
    next_steps: [
      "Review uploaded inputs against the reference/source documents.",
      "Add citations as doc_id, page, and locator before treating any fact as known.",
      "Download the companion manifest from the Audit panel or this module output."
    ]
  };
}

function renderArtifactModule(container, config) {
  const planName = getPlanValue(state.planMetadata, "plan_name") || "unknown";
  const caseNo = state.planMetadata?.meta?.case_number?.value ?? "unknown";

  container.innerHTML = `
    <section class="page-hero">
      <div class="page-title">
        <h2>${escapeHtml(config.title)}</h2>
        <p>${escapeHtml(config.description)}</p>
        <p class="meta-line"><b>Case:</b> ${escapeHtml(planName)} (${escapeHtml(caseNo)})</p>
      </div>
      <div class="page-actions">
        <button class="icon-button help" id="toggle_instructions" aria-label="Toggle instructions" data-help="Show quick instructions">i</button>
        <button class="ghost" id="ps_missing_metadata">Open Metadata</button>
      </div>
    </section>

    ${planContextHtml()}

    ${renderWorkflowStatePanel({ title: "Shared Case Inputs", keys: config.upstreamInputs ?? ["metadata"] })}

    <div class="banner subtle">
      ${config.id === "dag-viewer" || config.id === "formula-tree"
        ? "Scaffold viewer: this packages uploaded formula/engine evidence into graph JSON. Full interactive visualization is still being integrated."
        : "Scaffold module: this creates an audit-ready input package with manifests. It is not yet a final actuarial output generator."}
    </div>

    <div id="instructions_backdrop" class="drawer-backdrop"></div>
    <aside class="drawer-panel drawer-left" id="instructions_panel">
      <div class="drawer-header">
        <div class="drawer-title">How To Use This Module</div>
        <button class="icon-button" id="close_instructions" aria-label="Close instructions">x</button>
      </div>
      <div class="drawer-body">
        <ol class="instruction-list">
          <li>${escapeHtml(config.prompt)}</li>
          <li>Generate the artifact JSON; the output embeds app version, module version, input hashes, case number, and metadata hash.</li>
          <li>Use the Audit panel to download the latest manifest separately.</li>
        </ol>
      </div>
    </aside>

    <div class="card">
      <div class="input-checklist">
        <b>Required inputs</b>
        <ul>
          ${(config.requiredInputs ?? ["PlanMetadata", "Supporting source files"])
            .map((input) => `<li>${escapeHtml(input)}</li>`)
            .join("")}
        </ul>
      </div>
      <label><b>Input files</b></label><br/>
      <input id="module_files" type="file" multiple accept="${escapeHtml(config.accepted)}" />
      <div id="module_file_list" class="meta-line">No files selected.</div>

      <label style="display:block;margin-top:1rem;"><b>Run notes</b></label>
      <textarea id="module_notes" rows="5" placeholder="Optional notes. Do not enter PII."></textarea>

      <div class="button-row">
        <button id="module_generate" class="primary" disabled>Generate artifact JSON</button>
        <button id="module_manifest" class="ghost" disabled>Download manifest.json</button>
      </div>
      <pre id="module_status" class="code" style="margin-top:12px;"></pre>
    </div>
  `;

  const instructionsBtn = container.querySelector("#toggle_instructions");
  const instructionsPanel = container.querySelector("#instructions_panel");
  const instructionsBackdrop = container.querySelector("#instructions_backdrop");
  const instructionsClose = container.querySelector("#close_instructions");
  instructionsBtn.addEventListener("click", () => {
    instructionsPanel.classList.add("open");
    instructionsBackdrop.classList.add("show");
  });
  function closeInstructions() {
    instructionsPanel.classList.remove("open");
    instructionsBackdrop.classList.remove("show");
  }
  instructionsClose.addEventListener("click", closeInstructions);
  instructionsBackdrop.addEventListener("click", closeInstructions);

  const fileInput = container.querySelector("#module_files");
  const fileList = container.querySelector("#module_file_list");
  const notes = container.querySelector("#module_notes");
  const generateBtn = container.querySelector("#module_generate");
  const manifestBtn = container.querySelector("#module_manifest");
  const status = container.querySelector("#module_status");

  hydratePlanContext(container);

  let files = [];

  function update() {
    files = [...(fileInput.files ?? [])];
    generateBtn.disabled = files.length === 0;
    manifestBtn.disabled = !state.lastManifest || state.lastManifest.module_id !== config.id;
    fileList.textContent = files.length
      ? files.map((file) => `${file.name} (${file.size} bytes)`).join(", ")
      : "No files selected.";
  }

  fileInput.addEventListener("change", update);

  generateBtn.addEventListener("click", async () => {
    status.textContent = "Generating artifact...";
    try {
      const artifact = await buildModuleArtifact(config, files, notes.value);
      state.lastManifest = artifact.meta;
      state.caseWorkflow.moduleRuns[config.id] = {
        generated_at_utc: artifact.meta.generated_at_utc,
        output_name: config.outputName,
        input_hashes: artifact.meta.input_hashes
      };
      saveState();
      const blob = new Blob([stringifyStable(artifact)], { type: "application/json" });
      downloadBlob(blob, config.outputName);
      status.textContent = `DONE. Downloaded ${config.outputName}\n\nManifest:\n${JSON.stringify(state.lastManifest, null, 2)}`;
      update();
    } catch (err) {
      status.textContent = `ERROR: ${err.message}`;
    }
  });

  manifestBtn.addEventListener("click", () => {
    if (!state.lastManifest) return;
    const blob = new Blob([JSON.stringify(state.lastManifest, null, 2)], {
      type: "application/json"
    });
    downloadBlob(blob, `manifest.${config.id}.json`);
  });

  update();
}

function renderAudit(container) {
  container.innerHTML = `
    <section class="page-hero">
      <div class="page-title">
        <h2>Audit / Manifest</h2>
        <p>Review the latest manifest and hashes generated by this workbench.</p>
      </div>
      <div class="page-actions">
        <button class="icon-button help" id="toggle_instructions" aria-label="Toggle instructions" data-help="Show quick instructions">i</button>
      </div>
    </section>

    ${planContextHtml()}

    ${renderWorkflowStatePanel({ title: "Shared Case Inputs" })}

    <div id="instructions_backdrop" class="drawer-backdrop"></div>
    <aside class="drawer-panel drawer-left" id="instructions_panel">
      <div class="drawer-header">
        <div class="drawer-title">How To Use This Module</div>
        <button class="icon-button" id="close_instructions" aria-label="Close instructions">x</button>
      </div>
      <div class="drawer-body">
        <ol class="instruction-list">
          <li>Review the latest manifest for each module run.</li>
          <li>Use these hashes for audit trails and deterministic validation.</li>
        </ol>
      </div>
    </aside>

    <div class="card">
      <p class="muted">Last action manifest:</p>
      <pre class="code">${escapeHtml(
        JSON.stringify(state.lastManifest ?? { note: "No actions yet." }, null, 2)
      )}</pre>
      <div class="button-row">
        <button id="audit_download_manifest" ${state.lastManifest ? "" : "disabled"}>Download manifest.json</button>
      </div>
      <div class="meta-line" id="audit_hash">Plan metadata hash: (no metadata loaded)</div>
    </div>
  `;

  const instructionsBtn = container.querySelector("#toggle_instructions");
  const instructionsPanel = container.querySelector("#instructions_panel");
  const instructionsBackdrop = container.querySelector("#instructions_backdrop");
  const instructionsClose = container.querySelector("#close_instructions");
  hydratePlanContext(container);
  instructionsBtn.addEventListener("click", () => {
    instructionsPanel.classList.add("open");
    instructionsBackdrop.classList.add("show");
  });
  function closeInstructions() {
    instructionsPanel.classList.remove("open");
    instructionsBackdrop.classList.remove("show");
  }
  instructionsClose.addEventListener("click", closeInstructions);
  instructionsBackdrop.addEventListener("click", closeInstructions);

  const downloadManifestBtn = container.querySelector("#audit_download_manifest");
  downloadManifestBtn.addEventListener("click", () => {
    if (!state.lastManifest) return;
    const blob = new Blob([JSON.stringify(state.lastManifest, null, 2)], {
      type: "application/json"
    });
    downloadBlob(blob, "manifest.json");
  });

  const hashEl = container.querySelector("#audit_hash");
  if (!state.planMetadata || !hashEl) return;
  hashEl.textContent = "Plan metadata hash: computing...";
  sha256HexString(stringifyStable(state.planMetadata))
    .then((hash) => {
      hashEl.textContent = `Plan metadata hash: ${hash}`;
    })
    .catch(() => {
      hashEl.textContent = "Plan metadata hash: error computing";
    });
}

async function buildExplorerBridgeContext() {
  const planMetadataHash = state.planMetadata
    ? await sha256HexString(stringifyStable(state.planMetadata))
    : "unknown";
  return {
    app_version: APP_VERSION,
    schema_version: SCHEMA_VERSION,
    case_number: state.planMetadata?.meta?.case_number?.value ?? "unknown",
    plan_metadata_hash: planMetadataHash,
    plan_metadata: state.planMetadata,
    warehouse_state: {
      read_only: true,
      profiles: state.v1Warehouse.profiles,
      selected_candidate: getSelectedV1Summary()
    },
    r5_summary: getR5WorkflowSummary()
  };
}

async function sendExplorerBridgeContext(iframe, statusEl) {
  if (!iframe?.contentWindow) return;
  const context = await buildExplorerBridgeContext();
  iframe.contentWindow.postMessage(
    {
      type: "CASEWORKBENCH_CONTEXT",
      version: APP_VERSION,
      payload: context
    },
    "*"
  );
  if (statusEl) {
    statusEl.textContent = `Bridge sent: case ${context.case_number}, metadata ${context.plan_metadata_hash.slice(0, 12)}, ${context.warehouse_state.profiles.length} V1 profiles.`;
  }
}

function renderV1BuilderAlias(container) {
  setRoute("#/v1-engine-explorer");
  renderV1EngineExplorer(container);
}

function renderV1EngineExplorer(container) {
  const planName = getPlanValue(state.planMetadata, "plan_name") || "unknown";
  const caseNo = state.planMetadata?.meta?.case_number?.value ?? "unknown";

  container.innerHTML = `
    <section class="page-hero">
      <div class="page-title">
        <h2>V1 Engine Explorer</h2>
        <p><b>Case:</b> ${escapeHtml(planName)} (Case ${escapeHtml(caseNo)})</p>
      </div>
      <div class="page-actions">
        <button class="icon-button help" id="toggle_instructions" aria-label="Toggle instructions" data-help="Show quick instructions">i</button>
      </div>
    </section>

    ${planContextHtml()}

    ${renderWorkflowStatePanel({ title: "Shared Case Inputs" })}

    <div id="instructions_backdrop" class="drawer-backdrop"></div>
    <aside class="drawer-panel drawer-left" id="instructions_panel">
      <div class="drawer-header">
        <div class="drawer-title">How To Use This Module</div>
        <button class="icon-button" id="close_instructions" aria-label="Close instructions">x</button>
      </div>
      <div class="drawer-body">
        <ol class="instruction-list">
          <li>Upload approved V1Summary JSON files as read-only governing reference engines.</li>
          <li>Upload R5 summary JSON files for the current case and run reuse matching.</li>
          <li>The embedded explorer receives PlanMetadata context and lightweight V1 profiles from Caseworkbench.</li>
        </ol>
      </div>
    </aside>

    <div class="card v1-control-panel">
      <div class="input-checklist">
        <b>Workflow inputs</b>
        <ul>
          <li>Approved V1Summary JSON files selected from local reference material</li>
          <li>R5 summary JSON files for the current case</li>
          <li>Saved PlanMetadata from this workbench</li>
        </ul>
      </div>
      <div class="grid two">
        <div>
          <label><b>Approved V1 engines (read-only)</b></label><br/>
          <input id="v1_approved_files" type="file" multiple accept="application/json,.json" />
          <div class="button-row">
            <button id="v1_import_approved" class="primary" disabled>Import Approved V1</button>
            <button id="v1_import_manifest" class="ghost" ${state.v1Warehouse.importManifest ? "" : "disabled"}>Download import manifest</button>
          </div>
        </div>
        <div>
          <label><b>R5 summary JSON</b></label><br/>
          <input id="v1_r5_files" type="file" multiple accept="application/json,.json" />
          <div class="button-row">
            <button id="v1_load_r5" disabled>Load R5</button>
            <button id="v1_run_ranking" class="primary" ${state.v1Warehouse.profiles.length && state.v1Warehouse.r5Files.length ? "" : "disabled"}>Rank V1 Candidates</button>
            <button id="v1_ranking_manifest" class="ghost" ${state.v1Warehouse.rankingManifest ? "" : "disabled"}>Download ranking manifest</button>
          </div>
        </div>
      </div>
      <div class="button-row">
        <button id="v1_send_bridge" class="ghost">Send context to explorer</button>
        <button id="v1_open_audit" class="ghost">Open V1 audit</button>
        <button id="v1_clear_session" class="ghost">Clear V1 session</button>
      </div>
      <div id="v1_status" class="meta-line">Approved V1 records are read-only and stay in Caseworkbench memory for this browser session.</div>
      <div id="v1_bridge_status" class="meta-line"></div>
      <div id="v1_selected">${renderSelectedV1Summary()}</div>
      <div class="section-divider"></div>
      <h3>Approved Engine Warehouse</h3>
      <div id="v1_profiles">${renderV1ProfilesSummary()}</div>
      <div class="section-divider"></div>
      <h3>R5 Matching Results</h3>
      <div id="v1_rankings">${renderV1RankingResults()}</div>
    </div>

    <iframe
      id="v1_explorer_frame"
      title="V1 Engine Explorer"
      class="legacy-frame v1-explorer-frame"
      srcdoc="${escapeHtml(v1EngineExplorerSrcDoc)}"
      loading="eager"
    ></iframe>
  `;

  const instructionsBtn = container.querySelector("#toggle_instructions");
  const instructionsPanel = container.querySelector("#instructions_panel");
  const instructionsBackdrop = container.querySelector("#instructions_backdrop");
  const instructionsClose = container.querySelector("#close_instructions");
  instructionsBtn.addEventListener("click", () => {
    instructionsPanel.classList.add("open");
    instructionsBackdrop.classList.add("show");
  });
  function closeInstructions() {
    instructionsPanel.classList.remove("open");
    instructionsBackdrop.classList.remove("show");
  }
  instructionsClose.addEventListener("click", closeInstructions);
  instructionsBackdrop.addEventListener("click", closeInstructions);

  const approvedFiles = container.querySelector("#v1_approved_files");
  const importBtn = container.querySelector("#v1_import_approved");
  const importManifestBtn = container.querySelector("#v1_import_manifest");
  const r5Files = container.querySelector("#v1_r5_files");
  const loadR5Btn = container.querySelector("#v1_load_r5");
  const rankBtn = container.querySelector("#v1_run_ranking");
  const rankingManifestBtn = container.querySelector("#v1_ranking_manifest");
  const clearBtn = container.querySelector("#v1_clear_session");
  const openAuditBtn = container.querySelector("#v1_open_audit");
  const bridgeBtn = container.querySelector("#v1_send_bridge");
  const statusEl = container.querySelector("#v1_status");
  const bridgeStatusEl = container.querySelector("#v1_bridge_status");
  const selectedEl = container.querySelector("#v1_selected");
  const profilesEl = container.querySelector("#v1_profiles");
  const rankingsEl = container.querySelector("#v1_rankings");
  const iframe = container.querySelector("#v1_explorer_frame");

  hydratePlanContext(container);

  function refreshV1Ui() {
    selectedEl.innerHTML = renderSelectedV1Summary();
    profilesEl.innerHTML = renderV1ProfilesSummary();
    rankingsEl.innerHTML = renderV1RankingResults();
    importManifestBtn.disabled = !state.v1Warehouse.importManifest;
    rankingManifestBtn.disabled = !state.v1Warehouse.rankingManifest;
    rankBtn.disabled = !(state.v1Warehouse.profiles.length && state.v1Warehouse.r5Files.length);
  }

  approvedFiles.addEventListener("change", () => {
    importBtn.disabled = !(approvedFiles.files?.length);
  });

  r5Files.addEventListener("change", () => {
    loadR5Btn.disabled = !(r5Files.files?.length);
  });

  importBtn.addEventListener("click", async () => {
    statusEl.textContent = "Importing approved V1 engines...";
    try {
      const result = await importApprovedV1Files([...(approvedFiles.files ?? [])]);
      statusEl.textContent = `Imported ${result.imported.length}; skipped ${result.skipped.length}. ${result.diagnostics.slice(0, 3).join(" ")}`;
      refreshV1Ui();
      await sendExplorerBridgeContext(iframe, bridgeStatusEl);
    } catch (err) {
      statusEl.textContent = `ERROR: ${err.message}`;
    }
  });

  loadR5Btn.addEventListener("click", async () => {
    statusEl.textContent = "Loading R5 summaries...";
    try {
      const result = await importR5Files([...(r5Files.files ?? [])]);
      statusEl.textContent = `Loaded ${result.inputs.length} R5 file(s). Domains: ${result.profile.recognized_domains.join(", ") || "none"}. ${result.diagnostics.join(" ")}`;
      refreshV1Ui();
    } catch (err) {
      statusEl.textContent = `ERROR: ${err.message}`;
    }
  });

  rankBtn.addEventListener("click", async () => {
    statusEl.textContent = "Ranking approved V1 candidates...";
    try {
      const result = await runV1R5Ranking();
      const best = result.rankings[0];
      statusEl.textContent = best
        ? `Best candidate: ${best.workbook_name} (${best.candidate_record_id}) with score ${best.overall_score}. Reuse evidence only; not approval.`
        : "No candidate could be ranked.";
      refreshV1Ui();
      await sendExplorerBridgeContext(iframe, bridgeStatusEl);
    } catch (err) {
      statusEl.textContent = `ERROR: ${err.message}`;
    }
  });

  rankingsEl.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-select-v1]");
    if (!btn) return;
    const selected = selectV1Candidate(btn.dataset.selectV1);
    statusEl.textContent = selected
      ? `Selected current case V1 candidate: ${selected.workbook_name}.`
      : "Could not select that V1 candidate.";
    refreshV1Ui();
    sendExplorerBridgeContext(iframe, bridgeStatusEl).catch((err) => {
      bridgeStatusEl.textContent = `Bridge error: ${err.message}`;
    });
  });

  importManifestBtn.addEventListener("click", () => {
    if (!state.v1Warehouse.importManifest) return;
    downloadBlob(
      new Blob([JSON.stringify(state.v1Warehouse.importManifest, null, 2)], { type: "application/json" }),
      "manifest.v1-approved-import.json"
    );
  });

  rankingManifestBtn.addEventListener("click", () => {
    if (!state.v1Warehouse.rankingManifest) return;
    downloadBlob(
      new Blob([JSON.stringify(state.v1Warehouse.rankingManifest, null, 2)], { type: "application/json" }),
      "manifest.v1-r5-ranking.json"
    );
  });

  clearBtn.addEventListener("click", () => {
    resetV1Warehouse();
    state.caseWorkflow.r5Summary = null;
    state.caseWorkflow.selectedV1 = null;
    state.lastManifest = null;
    saveState();
    statusEl.textContent = "Cleared V1 session state.";
    refreshV1Ui();
  });

  openAuditBtn.addEventListener("click", () => {
    setRoute("#/v1-audit");
  });

  bridgeBtn.addEventListener("click", () => {
    sendExplorerBridgeContext(iframe, bridgeStatusEl).catch((err) => {
      bridgeStatusEl.textContent = `Bridge error: ${err.message}`;
    });
  });

  iframe.addEventListener("load", () => {
    sendExplorerBridgeContext(iframe, bridgeStatusEl).catch((err) => {
      bridgeStatusEl.textContent = `Bridge error: ${err.message}`;
    });
  });

  refreshV1Ui();
}

function parseCsvRows(csvText) {
  const normalized = String(csvText ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (normalized[i + 1] === "\"") {
          cell += "\"";
          i++;
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
      if (row.some((value) => String(value).trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((value) => String(value).trim() !== "")) rows.push(row);
  return rows;
}

function parseDdCsvCatalog(csvText) {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) throw new Error("DD.csv must include a header and at least one field row.");
  const headers = rows[0].map((header) => String(header).trim().toLowerCase());
  const fieldIdx = headers.findIndex((header) => ["field_name", "field", "fieldname", "name", "column", "columnname"].includes(header));
  const descIdx = headers.findIndex((header) => ["description", "desc", "definition"].includes(header));
  const typeIdx = headers.findIndex((header) => ["data_type", "datatype", "type"].includes(header));
  const inputIdx = headers.findIndex((header) => ["input_field", "input", "inputfield"].includes(header));
  if (fieldIdx < 0) throw new Error("DD.csv missing FIELD_NAME column.");
  const fields = rows
    .slice(1)
    .map((row) => {
      const name = String(row[fieldIdx] ?? "").trim();
      if (!name) return null;
      const description = descIdx >= 0 ? String(row[descIdx] ?? "").trim() : "";
      const explicitType = typeIdx >= 0 ? String(row[typeIdx] ?? "").trim() : "";
      return {
        name,
        description,
        dataType: inferSyntheticFieldType(name, explicitType, description),
        inputField: inputIdx >= 0 ? String(row[inputIdx] ?? "").trim().toUpperCase() === "X" : false
      };
    })
    .filter(Boolean);
  return { fields };
}

function inferSyntheticFieldType(name, explicitType = "", description = "") {
  const normalized = explicitType.trim().toLowerCase();
  if (["date", "datetime"].includes(normalized)) return "date";
  if (["number", "numeric", "decimal", "money", "currency"].includes(normalized)) return "number";
  if (["integer", "int"].includes(normalized)) return "integer";
  const haystack = `${name} ${description}`.toLowerCase();
  if (/(^|[_\s])(dob|doh|dop|dote|dor|dod|sdob|bdob|dopt|dobf)([_\s]|$)/.test(haystack) || /\bdate\b/.test(haystack)) return "date";
  if (/\b(age|count|years?|months?)\b/.test(haystack)) return "integer";
  if (/\b(amount|benefit|balance|salary|compensation|rate|percent|pay)\b/.test(haystack)) return "number";
  return "string";
}

function seededRandom(seed) {
  let stateValue = Math.abs(Number(seed) || 1) % 2147483647;
  if (stateValue === 0) stateValue = 1;
  return () => {
    stateValue = (stateValue * 48271) % 2147483647;
    return stateValue / 2147483647;
  };
}

function randInt(rand, min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}

function dateUtc(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

function addYears(date, years) {
  return dateUtc(date.getUTCFullYear() + years, date.getUTCMonth() + 1, date.getUTCDate());
}

function formatDateIso(date) {
  return date.toISOString().slice(0, 10);
}

function syntheticScenarioPlan(rowCount, mix) {
  const entries = Object.entries(mix).filter(([, weight]) => Number(weight) > 0);
  const active = entries.length ? entries : [["participant_in_pay", 1]];
  const total = active.reduce((sum, [, weight]) => sum + Number(weight), 0);
  const counts = active.map(([scenario, weight]) => {
    const raw = (Number(weight) / total) * rowCount;
    return { scenario, count: Math.floor(raw), fraction: raw - Math.floor(raw) };
  });
  let assigned = counts.reduce((sum, item) => sum + item.count, 0);
  counts
    .slice()
    .sort((a, b) => b.fraction - a.fraction || a.scenario.localeCompare(b.scenario))
    .forEach((item) => {
      if (assigned < rowCount) {
        counts.find((candidate) => candidate.scenario === item.scenario).count++;
        assigned++;
      }
    });
  return counts
    .sort((a, b) => a.scenario.localeCompare(b.scenario))
    .flatMap((item) => Array.from({ length: item.count }, () => item.scenario));
}

function defaultSyntheticFields(catalog) {
  const preferred = [
    "BCV_REC_ID", "CASE", "RETSTAT", "ID", "Cust_ID", "SSN", "FNAME", "LNAME", "DOB", "DOH", "DOP", "DOTE", "DOR",
    "DOD", "SEX", "MSTAT", "SFNAME", "SLNAME", "SDOB", "PA_AMB", "AMB", "VB", "FORM_CODE_ARD", "LEV_MB_ARD"
  ];
  const names = new Set(catalog.fields.map((field) => field.name));
  const picked = preferred.filter((field) => names.has(field));
  const inputFields = catalog.fields.filter((field) => field.inputField).map((field) => field.name).slice(0, 80);
  return [...new Set([...picked, ...inputFields])].slice(0, 120);
}

function syntheticFieldPresets(catalog) {
  const names = new Set(catalog.fields.map((field) => field.name));
  const keep = (fields) => fields.filter((field) => names.has(field));
  return {
    minimal_v1: keep([
      "CASE", "RETSTAT", "ID", "Cust_ID", "SSN", "FNAME", "LNAME", "DOB", "DOH", "DOP", "DOTE", "DOR", "DOD",
      "SEX", "MSTAT", "SDOB", "SFNAME", "SLNAME", "PA_AMB", "AMB", "VB", "FORM_CODE_ARD", "LEV_MB_ARD"
    ]),
    full_dd_inputs: catalog.fields.filter((field) => field.inputField).map((field) => field.name).slice(0, 200),
    bsrs_letters: keep([
      "CASE", "BCV_REC_ID", "Cust_ID", "SSN", "FNAME", "LNAME", "DOB", "DOR", "DOD", "RETSTAT", "ID",
      "SFNAME", "SLNAME", "SDOB", "FORM_CODE_ARD", "LEV_MB_ARD"
    ]),
    estimated_analysis: keep([
      "CASE", "Cust_ID", "RETSTAT", "ID", "DOB", "DOTE", "DOR", "PA_AMB", "AMB", "VB", "LEV_MB_ARD",
      "FORM_CODE_ARD", "MSTAT", "SDOB"
    ])
  };
}

function syntheticPresetOptionsHtml(catalog) {
  const presets = syntheticFieldPresets(catalog);
  return Object.entries(presets)
    .map(([key, fields]) => `<option value="${escapeHtml(key)}">${escapeHtml(key.replaceAll("_", " "))} (${fields.length})</option>`)
    .join("");
}

function renderSyntheticPopulationCurrentState() {
  const summary = getSyntheticPopulationSummary();
  if (!summary) {
    return `
      <div class="workflow-selected missing">
        <b>No Synthetic Population Generated</b>
        <span>Generate one here to make no-PII test data available to PF, V1, estimated analyses, and letters.</span>
      </div>
    `;
  }
  return `
    <div class="workflow-selected ready">
      <b>Synthetic Population Ready</b>
      <span>${escapeHtml(summary.output_name ?? "synthetic population")} | ${summary.row_count ?? "unknown"} rows | ${summary.field_count ?? "unknown"} fields | seed ${summary.seed ?? "unknown"}</span>
      <small>Synthetic test data only. Downstream modules can treat this as a no-PII testing input.</small>
    </div>
  `;
}

function syntheticConfigFromControls(container, fieldsBox) {
  const rowCount = Math.max(1, Math.min(5000, Number(container.querySelector("#synthetic_rows").value) || 100));
  const seed = Number(container.querySelector("#synthetic_seed").value) || 12345;
  const fields = fieldsBox.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const scenarioMix = JSON.parse(container.querySelector("#synthetic_mix").value);
  return { rowCount, seed, fields, scenarioMix };
}

function syntheticValueForField(field, context) {
  const name = field.name.toUpperCase();
  const { index, scenario, rand, metadata } = context;
  if (name === "CASE") return metadata?.meta?.case_number?.value ?? "SYNTHETIC-CASE";
  if (name === "BCV_REC_ID") return `SYN_BCV_${String(index + 1).padStart(7, "0")}`;
  if (name === "CUST_ID") return `SYN_CUST_${String(index + 1).padStart(7, "0")}`;
  if (name === "SSN") return `000-00-${String(index + 1).padStart(4, "0").slice(-4)}`;
  if (name === "FNAME" || name === "PFNAME") return `SYN_FN_${String(index + 1).padStart(4, "0")}`;
  if (name === "LNAME" || name === "PLNAME") return `SYN_LN_${String(index + 1).padStart(4, "0")}`;
  if (name === "SFNAME") return context.married ? `SYN_SFN_${String(index + 1).padStart(4, "0")}` : "";
  if (name === "SLNAME") return context.married ? `SYN_SLN_${String(index + 1).padStart(4, "0")}` : "";
  if (name === "ID") return scenario === "beneficiary_in_pay" ? "2" : scenario === "alternate_payee_in_pay" ? "4" : "1";
  if (name === "RETSTAT") {
    if (scenario === "participant_in_pay" || scenario === "beneficiary_in_pay" || scenario === "alternate_payee_in_pay") return "1";
    if (scenario === "participant_deferred_vested") return "2";
    if (scenario === "participant_active_vested") return "3";
    if (scenario === "participant_not_vested") return "4";
    if (scenario === "excluded") return "5";
    return "1";
  }
  if (name === "SEX" || name === "GENDER") return rand() > 0.5 ? "M" : "F";
  if (name === "MSTAT") return context.married ? "M" : "S";
  if (name === "DOB") return context.dob;
  if (name === "SDOB") return context.married ? context.sdob : "";
  if (name === "DOH") return context.doh;
  if (name === "DOP") return context.dop;
  if (name === "DOTE") return context.dote;
  if (name === "DOR") return ["participant_in_pay", "beneficiary_in_pay", "alternate_payee_in_pay"].includes(scenario) ? context.dor : "";
  if (name === "DOD") return scenario === "beneficiary_in_pay" ? context.dod : "";
  if (name.includes("FORM_CODE")) return ["participant_in_pay", "beneficiary_in_pay", "alternate_payee_in_pay"].includes(scenario) ? "SYN_FORM" : "";
  if (field.dataType === "date") return "";
  if (field.dataType === "integer") return String(randInt(rand, 0, 40));
  if (field.dataType === "number") return String((randInt(rand, 100, 500000) / 100).toFixed(2));
  if (name.includes("FLAG") || name.startsWith("IS_") || name.startsWith("HAS_")) return rand() > 0.5 ? "Y" : "N";
  return `SYN_${field.name}_${String(index + 1).padStart(4, "0")}`;
}

function generateSyntheticPopulation(catalog, fields, config, metadata) {
  const selectedFields = fields.map((name) => catalog.fields.find((field) => field.name === name)).filter(Boolean);
  const rand = seededRandom(config.seed);
  const scenarios = syntheticScenarioPlan(config.rowCount, config.scenarioMix);
  const clean = scenarios.map((scenario, index) => {
    const dobDate = dateUtc(randInt(rand, 1940, 1975), randInt(rand, 1, 12), randInt(rand, 1, 28));
    const dohDate = addYears(dobDate, randInt(rand, 18, 32));
    const dopDate = addYears(dohDate, randInt(rand, 0, 3));
    const doteDate = addYears(dopDate, randInt(rand, 5, 30));
    const dorDate = addYears(dobDate, randInt(rand, 55, 70));
    const married = rand() > 0.45;
    const context = {
      index,
      scenario,
      rand,
      metadata,
      married,
      dob: formatDateIso(dobDate),
      sdob: formatDateIso(addYears(dobDate, randInt(rand, -3, 3))),
      doh: formatDateIso(dohDate),
      dop: formatDateIso(dopDate),
      dote: formatDateIso(doteDate),
      dor: formatDateIso(dorDate),
      dod: formatDateIso(addYears(dorDate, randInt(rand, 1, 20)))
    };
    return Object.fromEntries(selectedFields.map((field) => [field.name, syntheticValueForField(field, context)]));
  });
  const dirty = clean.map((record, index) => {
    const copy = { ...record };
    if (index % 10 === 0 && "SDOB" in copy) copy.SDOB = "";
    if (index % 13 === 0 && "DOR" in copy && "DOTE" in copy) copy.DOR = copy.DOTE ? "1900-01-01" : copy.DOR;
    return copy;
  });
  return { clean, dirty, fields: selectedFields.map((field) => field.name), scenarios };
}

function recordsToCsv(records, fields) {
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [fields.map(escape).join(","), ...records.map((record) => fields.map((field) => escape(record[field])).join(","))].join("\n");
}

async function renderSyntheticPopulation(container) {
  const catalog = parseDdCsvCatalog(defaultDdCsvText);
  const defaultFields = defaultSyntheticFields(catalog);
  const caseNo = state.planMetadata?.meta?.case_number?.value ?? "unknown";
  const outputName = `${safeFileStem(getPlanValue(state.planMetadata, "plan_number") || caseNo)}SyntheticPopulation.zip`;
  container.innerHTML = `
    <section class="page-hero">
      <div class="page-title">
        <h2>Synthetic Population Builder</h2>
        <p>Generate deterministic no-PII participant/payee data for testing DEL, PF, V1, estimated analyses, and BSRS.</p>
      </div>
      <div class="page-actions">
        <button class="ghost" id="synthetic_edit_metadata">Edit Metadata</button>
      </div>
    </section>

    ${planContextHtml()}
    ${renderWorkflowStatePanel({ title: "Synthetic Population Inputs", keys: ["metadata", "r5"] })}

    <div class="banner subtle">All generated rows are synthetic test data. Do not use this output as production participant data.</div>

    <div class="card">
      <div id="synthetic_current_state">${renderSyntheticPopulationCurrentState()}</div>
      <div class="grid two">
        <div>
          <label><b>DD.csv override</b></label><br/>
          <input id="synthetic_dd" type="file" accept=".csv,text/csv" />
          <div id="synthetic_dd_status" class="meta-line">Using bundled reference/DD.csv (${catalog.fields.length} fields).</div>
        </div>
        <div>
          <label><b>Output</b></label>
          <div class="workflow-output"><span>${escapeHtml(outputName)}</span><small>clean CSV, dirty CSV, config, and manifest</small></div>
        </div>
      </div>
      <div class="grid two" style="margin-top:12px;">
        <div>
          <label><b>Rows</b></label><br/>
          <input id="synthetic_rows" type="number" min="1" max="5000" value="100" />
        </div>
        <div>
          <label><b>Seed</b></label><br/>
          <input id="synthetic_seed" type="number" value="12345" />
        </div>
      </div>
      <div style="margin-top:12px;">
        <label><b>Output fields</b></label>
        <div class="button-row" style="margin-top:6px;">
          <select id="synthetic_preset" aria-label="Synthetic field preset">
            ${syntheticPresetOptionsHtml(catalog)}
          </select>
          <button id="synthetic_apply_preset" class="ghost">Apply preset</button>
        </div>
        <textarea id="synthetic_fields" class="code" rows="8">${escapeHtml(defaultFields.join("\n"))}</textarea>
        <div class="meta-line">One DD.csv field per line. Defaults favor core input fields and common V1/BCV identifiers.</div>
      </div>
      <div style="margin-top:12px;">
        <label><b>Scenario mix JSON</b></label>
        <textarea id="synthetic_mix" class="code" rows="8">{
  "participant_in_pay": 35,
  "participant_deferred_vested": 25,
  "participant_active_vested": 15,
  "participant_not_vested": 10,
  "beneficiary_in_pay": 10,
  "alternate_payee_in_pay": 3,
  "excluded": 2
}</textarea>
      </div>
      <div class="button-row" style="margin-top:12px;">
        <button id="synthetic_generate" class="primary">Generate ${escapeHtml(outputName)}</button>
        <button id="synthetic_manifest" disabled class="ghost">Download manifest.json</button>
        <button id="synthetic_clear" class="ghost">Clear synthetic state</button>
      </div>
      <pre id="synthetic_status" class="code" style="margin-top:12px;"></pre>
    </div>
  `;
  hydratePlanContext(container);

  let activeCatalog = catalog;
  let activeDdText = defaultDdCsvText;
  let lastManifest = state.caseWorkflow.moduleRuns?.["synthetic-population"]?.manifest ?? null;
  const ddInput = container.querySelector("#synthetic_dd");
  const status = container.querySelector("#synthetic_status");
  const manifestBtn = container.querySelector("#synthetic_manifest");
  const fieldsBox = container.querySelector("#synthetic_fields");
  const presetSelect = container.querySelector("#synthetic_preset");
  const currentStateEl = container.querySelector("#synthetic_current_state");
  manifestBtn.disabled = !lastManifest;
  container.querySelector("#synthetic_edit_metadata").addEventListener("click", () => setRoute("#/metadata"));
  container.querySelector("#synthetic_apply_preset").addEventListener("click", () => {
    const fields = syntheticFieldPresets(activeCatalog)[presetSelect.value] ?? defaultSyntheticFields(activeCatalog);
    fieldsBox.value = fields.join("\n");
    status.textContent = `Applied ${presetSelect.options[presetSelect.selectedIndex]?.textContent ?? "field preset"}.`;
  });
  ddInput.addEventListener("change", async () => {
    const file = ddInput.files?.[0];
    if (!file) return;
    try {
      activeDdText = await file.text();
      activeCatalog = parseDdCsvCatalog(activeDdText);
      container.querySelector("#synthetic_dd_status").textContent = `${file.name} loaded (${activeCatalog.fields.length} fields).`;
      presetSelect.innerHTML = syntheticPresetOptionsHtml(activeCatalog);
    } catch (err) {
      status.textContent = `DD.csv error: ${err.message}`;
    }
  });

  container.querySelector("#synthetic_generate").addEventListener("click", async () => {
    try {
      const { rowCount, seed, fields, scenarioMix } = syntheticConfigFromControls(container, fieldsBox);
      const missing = fields.filter((field) => !activeCatalog.fields.some((candidate) => candidate.name === field));
      if (missing.length) throw new Error(`Unknown DD.csv field(s): ${missing.slice(0, 8).join(", ")}`);
      if (!fields.length) throw new Error("Select at least one output field.");
      const result = generateSyntheticPopulation(activeCatalog, fields, { rowCount, seed, scenarioMix }, state.planMetadata);
      const cleanCsv = recordsToCsv(result.clean, result.fields);
      const dirtyCsv = recordsToCsv(result.dirty, result.fields);
      const planMetadataHash = state.planMetadata ? await sha256HexString(stringifyStable(state.planMetadata)) : "unknown";
      const inputHashes = {
        "DD.csv": await sha256HexString(activeDdText),
        "synthetic-config.json": await sha256HexString(JSON.stringify({ rowCount, seed, scenarioMix, fields }, null, 2))
      };
      lastManifest = {
        app_version: APP_VERSION,
        schema_version: SCHEMA_VERSION,
        module_id: "synthetic-population",
        module_version: "0.7.0",
        generator_source: "Integrated from https://github.com/ErChulo/pbgc-mock-population-module patterns",
        generated_at_utc: new Date().toISOString(),
        case_number: caseNo,
        output_name: outputName,
        plan_metadata_hash: planMetadataHash,
        input_hashes: inputHashes,
        output_hashes: {
          "population.clean.csv": await sha256HexString(cleanCsv),
          "population.dirty.csv": await sha256HexString(dirtyCsv)
        },
        row_count: rowCount,
        seed,
        field_count: result.fields.length,
        synthetic_only: true,
        warnings: ["Synthetic test data only. No real participant data or PII source files used."]
      };
      state.caseWorkflow.moduleRuns["synthetic-population"] = {
        output_name: outputName,
        generated_at_utc: lastManifest.generated_at_utc,
        manifest: lastManifest
      };
      state.caseWorkflow.syntheticPopulation = {
        output_name: outputName,
        generated_at_utc: lastManifest.generated_at_utc,
        row_count: rowCount,
        field_count: result.fields.length,
        seed,
        fields: result.fields,
        clean_output_hash: lastManifest.output_hashes["population.clean.csv"],
        dirty_output_hash: lastManifest.output_hashes["population.dirty.csv"],
        synthetic_only: true
      };
      state.lastManifest = lastManifest;
      saveState();
      currentStateEl.innerHTML = renderSyntheticPopulationCurrentState();
      const zip = new JSZip();
      zip.file("population.clean.csv", cleanCsv);
      zip.file("population.dirty.csv", dirtyCsv);
      zip.file("synthetic-config.json", JSON.stringify({ rowCount, seed, scenarioMix, fields }, null, 2));
      zip.file("manifest.synthetic-population.json", JSON.stringify(lastManifest, null, 2));
      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, outputName);
      manifestBtn.disabled = false;
      status.textContent = `Generated ${rowCount} synthetic rows and ${result.fields.length} fields.\nDownloaded ${outputName}`;
    } catch (err) {
      status.textContent = `ERROR: ${err.message}`;
    }
  });

  manifestBtn.addEventListener("click", () => {
    if (!lastManifest) return;
    downloadBlob(new Blob([JSON.stringify(lastManifest, null, 2)], { type: "application/json" }), "manifest.synthetic-population.json");
  });

  container.querySelector("#synthetic_clear").addEventListener("click", () => {
    delete state.caseWorkflow.moduleRuns["synthetic-population"];
    state.caseWorkflow.syntheticPopulation = null;
    if (state.lastManifest?.module_id === "synthetic-population") state.lastManifest = null;
    lastManifest = null;
    manifestBtn.disabled = true;
    saveState();
    currentStateEl.innerHTML = renderSyntheticPopulationCurrentState();
    status.textContent = "Cleared synthetic population state. Previously downloaded files are not affected.";
  });
}

function getPlanValue(planMetadata, key) {
  return planMetadata?.plan?.[key]?.value ?? "";
}

function safeFileStem(value, fallback = "########") {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function r5OutputFilename(planMetadata) {
  const planNumber = getPlanValue(planMetadata, "plan_number");
  const caseNumber = planMetadata?.meta?.case_number?.value ?? "";
  return `${safeFileStem(planNumber || caseNumber)}R5.docx`;
}

function renderR5ValidationReport(report) {
  if (!report) {
    return `<div class="r5-validation empty">Upload R5Summary.json to see contract validation.</div>`;
  }
  const score = `${report.covered_required_count}/${report.required_item_count}`;
  const citationPct = Math.round((report.citation_coverage_ratio ?? 0) * 100);
  const missing = report.missing_items.slice(0, 8);
  const uncited = report.known_without_citations.slice(0, 8);
  return `
    <div class="r5-validation ${report.downstream_ready ? "ready" : "warning"}">
      <div class="r5-validation-head">
        <div>
          <b>R5Summary.json Contract Report</b>
          <span>${escapeHtml(report.source_file)} | ${escapeHtml(report.contract_version)}</span>
        </div>
        <strong>${report.downstream_ready ? "Ready" : "Needs Review"}</strong>
      </div>
      <div class="r5-validation-grid">
        <div><b>${report.schema_valid ? "Pass" : "Fail"}</b><span>JSON schema</span></div>
        <div><b>${escapeHtml(report.summary_stage ?? "unknown")}</b><span>summary stage</span></div>
        <div><b>${escapeHtml(score)}</b><span>required items covered</span></div>
        <div><b>${report.unknown_or_na_count}</b><span>unknown/na answers</span></div>
        <div><b>${report.known_without_citation_count}</b><span>known answers missing citations</span></div>
        <div><b>${citationPct}%</b><span>known-answer citation coverage</span></div>
      </div>
      <div class="r5-validation-grid">
        <div><b>${escapeHtml(report.recognized_domains.join(", ") || "none")}</b><span>recognized downstream domains</span></div>
      </div>
      ${
        report.warnings.length
          ? `<div class="banner subtle">${report.warnings.map((warning) => escapeHtml(warning)).join(" ")}</div>`
          : ""
      }
      ${
        report.schema_errors?.length
          ? `<div class="r5-validation-list"><b>First schema errors</b><ul>${report.schema_errors
              .slice(0, 8)
              .map((err) => `<li>${escapeHtml(err.instance_path || "/")}: ${escapeHtml(err.message)}</li>`)
              .join("")}</ul></div>`
          : ""
      }
      ${
        missing.length
          ? `<div class="r5-validation-list"><b>First missing required items</b><ul>${missing
              .map((item) => `<li>${item.item_id}. ${escapeHtml(item.question)}</li>`)
              .join("")}</ul></div>`
          : ""
      }
      ${
        uncited.length
          ? `<div class="r5-validation-list"><b>First known answers without citations</b><ul>${uncited
              .map((item) => `<li>${item.item_id}. ${escapeHtml(item.question)}</li>`)
              .join("")}</ul></div>`
          : ""
      }
    </div>
  `;
}

function renderPlanSummary(container) {
  if (!state.planMetadata) {
    container.innerHTML = `
      <section class="page-hero">
        <div class="page-title">
          <h2>Plan Summary</h2>
          <p>Generate a filled Plan Summary document once metadata is loaded.</p>
        </div>
        <div class="page-actions">
          <button class="icon-button help" id="toggle_instructions" aria-label="Toggle instructions" data-help="Show quick instructions">i</button>
        </div>
      </section>

      <div id="instructions_backdrop" class="drawer-backdrop"></div>
      <aside class="drawer-panel drawer-left" id="instructions_panel">
        <div class="drawer-header">
          <div class="drawer-title">How To Use This Module</div>
          <button class="icon-button" id="close_instructions" aria-label="Close instructions">x</button>
        </div>
        <div class="drawer-body">
          <ol class="instruction-list">
            <li>Load Plan Metadata first from the Metadata module.</li>
            <li>Upload the Plan Summary DOCX template and R5Summary.json.</li>
            <li>Generate the filled DOCX and download the manifest.</li>
          </ol>
        </div>
      </aside>

      <div class="alert error">Load or create plan-metadata.json in the Metadata module first. The R5 page uses that saved metadata from central case state.</div>
    `;
    const instructionsBtn = container.querySelector("#toggle_instructions");
    const instructionsPanel = container.querySelector("#instructions_panel");
    const instructionsBackdrop = container.querySelector("#instructions_backdrop");
    const instructionsClose = container.querySelector("#close_instructions");
    instructionsBtn.addEventListener("click", () => {
      instructionsPanel.classList.add("open");
      instructionsBackdrop.classList.add("show");
    });
    function closeInstructions() {
      instructionsPanel.classList.remove("open");
      instructionsBackdrop.classList.remove("show");
    }
    instructionsClose.addEventListener("click", closeInstructions);
    instructionsBackdrop.addEventListener("click", closeInstructions);
    container.querySelector("#ps_missing_metadata").addEventListener("click", () => setRoute("#/metadata"));
    return;
  }

  const planName = getPlanValue(state.planMetadata, "plan_name");
  const caseNo = state.planMetadata?.meta?.case_number?.value ?? "";
  const planNumber = getPlanValue(state.planMetadata, "plan_number") || "unknown";
  const outputName = r5OutputFilename(state.planMetadata);

  container.innerHTML = `
    <section class="page-hero">
      <div class="page-title">
        <h2>Plan Summary</h2>
        <p><b>Case:</b> ${escapeHtml(planName)} (Case ${escapeHtml(caseNo)})</p>
      </div>
      <div class="page-actions">
        <button class="icon-button help" id="toggle_instructions" aria-label="Toggle instructions" data-help="Show quick instructions">i</button>
        <button class="ghost" id="ps_edit_metadata">Edit Metadata</button>
      </div>
    </section>

    ${planContextHtml()}

    <div class="r5-context-grid">
      <div class="workflow-output">
        <b>Metadata Source</b>
        <span>Loaded from central PlanMetadata state</span>
        <small>Plan ${escapeHtml(planNumber)} | Case ${escapeHtml(caseNo || "unknown")}</small>
      </div>
      <div class="workflow-output">
        <b>Canonical Output</b>
        <span>${escapeHtml(outputName)}</span>
        <small>Generated from PlanMetadata + R5Summary.json + Plan Summary DOCX template</small>
      </div>
    </div>

    <div id="instructions_backdrop" class="drawer-backdrop"></div>
    <aside class="drawer-panel drawer-left" id="instructions_panel">
      <div class="drawer-header">
        <div class="drawer-title">How To Use This Module</div>
        <button class="icon-button" id="close_instructions" aria-label="Close instructions">x</button>
      </div>
      <div class="drawer-body">
        <ol class="instruction-list">
          <li>Upload the Plan Summary DOCX template and R5Summary.json.</li>
          <li>Generate the filled DOCX and download the manifest.</li>
        </ol>
      </div>
    </aside>

    <div class="card">
      <div class="r5-progress" aria-label="R5 required input status">
        <div class="r5-progress-item ready" id="ps_check_metadata">
          <b>Metadata</b>
          <span>Ready</span>
          <small>Loaded from the Metadata module.</small>
        </div>
        <div class="r5-progress-item missing" id="ps_check_template">
          <b>Template</b>
          <span>Needed</span>
          <small>Upload the Plan Summary DOCX template.</small>
        </div>
        <div class="r5-progress-item missing" id="ps_check_r5">
          <b>R5Summary.json</b>
          <span>Needed</span>
          <small>Upload the structured scraper output.</small>
        </div>
        <div class="r5-progress-item missing" id="ps_check_output">
          <b>Output</b>
          <span>Waiting</span>
          <small>${escapeHtml(outputName)}</small>
        </div>
      </div>
      <div class="grid two">
        <div>
          <label><b>Plan Summary DOCX template</b></label><br/>
          <input id="ps_docx" type="file" accept=".docx" />
          <div id="ps_docx_name" class="meta-line"></div>
        </div>

        <div>
          <label><b>R5Summary.json</b></label><br/>
          <input id="ps_r5json" type="file" accept="application/json,.json" />
          <div id="ps_r5json_name" class="meta-line"></div>
        </div>
      </div>

      <div class="button-row" style="margin-top:12px;">
        <button id="ps_download_r5_prompt" class="ghost">Download R5 scraper prompt v3</button>
        <button id="ps_download_r5_schema" class="ghost">Download R5Summary.schema.json</button>
        <button id="ps_generate" disabled>Generate ${escapeHtml(outputName)}</button>
        <button id="ps_manifest" disabled class="ghost">Download manifest.json</button>
        <button id="ps_validation_report" disabled class="ghost">Download R5 validation</button>
      </div>

      <div id="ps_r5_validation" style="margin-top:12px;">${renderR5ValidationReport(null)}</div>

      <pre id="ps_status" class="code" style="margin-top:12px;"></pre>
    </div>
  `;

  const instructionsBtn = container.querySelector("#toggle_instructions");
  const instructionsPanel = container.querySelector("#instructions_panel");
  const instructionsBackdrop = container.querySelector("#instructions_backdrop");
  const instructionsClose = container.querySelector("#close_instructions");
  hydratePlanContext(container);
  container.querySelector("#ps_edit_metadata").addEventListener("click", () => setRoute("#/metadata"));
  instructionsBtn.addEventListener("click", () => {
    instructionsPanel.classList.add("open");
    instructionsBackdrop.classList.add("show");
  });
  function closeInstructions() {
    instructionsPanel.classList.remove("open");
    instructionsBackdrop.classList.remove("show");
  }
  instructionsClose.addEventListener("click", closeInstructions);
  instructionsBackdrop.addEventListener("click", closeInstructions);

  const psDocx = container.querySelector("#ps_docx");
  const psJson = container.querySelector("#ps_r5json");
  const btn = container.querySelector("#ps_generate");
  const btnManifest = container.querySelector("#ps_manifest");
  const btnValidationReport = container.querySelector("#ps_validation_report");
  const btnR5Prompt = container.querySelector("#ps_download_r5_prompt");
  const btnR5Schema = container.querySelector("#ps_download_r5_schema");
  const status = container.querySelector("#ps_status");
  const validationEl = container.querySelector("#ps_r5_validation");
  const checkTemplate = container.querySelector("#ps_check_template");
  const checkR5 = container.querySelector("#ps_check_r5");
  const checkOutput = container.querySelector("#ps_check_output");

  let docxFile = null;
  let r5File = null;
  let r5Validation = null;

  function setProgressItem(el, ready, label, detail) {
    el.classList.toggle("ready", ready);
    el.classList.toggle("missing", !ready);
    el.querySelector("span").textContent = label;
    el.querySelector("small").textContent = detail;
  }

  function update() {
    const currentPlanSummaryManifest =
      state.lastManifest?.module_id === "plan-summary" ? state.lastManifest : null;
    container.querySelector("#ps_docx_name").textContent = docxFile ? docxFile.name : "";
    container.querySelector("#ps_r5json_name").textContent = r5File ? r5File.name : "";
    btnManifest.disabled = !currentPlanSummaryManifest;
    btnValidationReport.disabled = !r5Validation;
    btn.disabled = !(docxFile && r5File);
    validationEl.innerHTML = renderR5ValidationReport(r5Validation);
    setProgressItem(
      checkTemplate,
      !!docxFile,
      docxFile ? "Ready" : "Needed",
      docxFile ? docxFile.name : "Upload the Plan Summary DOCX template."
    );
    setProgressItem(
      checkR5,
      !!r5File,
      r5File ? "Ready" : "Needed",
      r5File ? r5File.name : "Upload the structured scraper output."
    );
    setProgressItem(
      checkOutput,
      !!currentPlanSummaryManifest?.output_name,
      currentPlanSummaryManifest?.output_name ? "Generated" : "Waiting",
      currentPlanSummaryManifest?.output_name ?? outputName
    );
  }

  psDocx.addEventListener("change", (e) => {
    docxFile = e.target.files?.[0] ?? null;
    update();
  });

  psJson.addEventListener("change", async (e) => {
    r5File = e.target.files?.[0] ?? null;
    update();
    if (!r5File) return;
    try {
      const result = await importR5Files([r5File]);
      r5Validation = result.inputs[0]?.validation ?? null;
      container.querySelector("#ps_r5json_name").textContent =
        `${r5File.name} loaded to case state (${result.profile.recognized_domains.join(", ") || "no recognized domains"})`;
      update();
    } catch (err) {
      r5Validation = null;
      status.textContent = `R5 case-state load warning: ${err.message}`;
      update();
    }
  });

  btn.addEventListener("click", async () => {
    status.textContent = "Reading inputs...";
    try {
      const r5Text = await r5File.text();
      const r5Obj = JSON.parse(stripJsonBom(r5Text));

      const [docxHash, r5Hash] = await Promise.all([
        sha256Hex(docxFile),
        sha256Hex(r5File)
      ]);

      const planMetadataHash = await sha256HexString(stringifyStable(state.planMetadata));

      state.lastManifest = {
        app_version: state.appVersion,
        module_id: "plan-summary",
        module_version: "0.7.0",
        generated_at_utc: new Date().toISOString(),
        case_number: state.planMetadata?.meta?.case_number?.value ?? "unknown",
        output_name: r5OutputFilename(state.planMetadata),
        r5_validation: r5Validation,
        plan_metadata_hash: planMetadataHash,
        input_hashes: {
          [docxFile.name]: docxHash,
          [r5File.name]: r5Hash
        }
      };
      saveState();
      update();

      status.textContent = "Filling DOCX...";
      const { blob, log } = await fillPlanSummaryDocx(docxFile, r5Obj, state.planMetadata);

      const generatedOutputName = r5OutputFilename(state.planMetadata);
      downloadBlob(blob, generatedOutputName);

      status.textContent =
        `DONE. Downloaded ${generatedOutputName}\n\nDOCX fill log:\n` +
        log.join("\n") +
        "\n\nManifest:\n" +
        JSON.stringify(state.lastManifest, null, 2);
    } catch (err) {
      status.textContent = "ERROR: " + err.message;
    }
  });

  btnManifest.addEventListener("click", () => {
    if (state.lastManifest?.module_id !== "plan-summary") return;
    const blob = new Blob([JSON.stringify(state.lastManifest, null, 2)], {
      type: "application/json"
    });
    downloadBlob(blob, "manifest.plan-summary.json");
  });

  btnR5Prompt.addEventListener("click", () => {
    downloadBlob(new Blob([r5ScraperPrompt], { type: "text/markdown" }), "r5-scraper-prompt.v3.md");
  });

  btnR5Schema.addEventListener("click", () => {
    downloadBlob(
      new Blob([JSON.stringify(r5SummarySchema, null, 2)], { type: "application/json" }),
      "R5Summary.schema.json"
    );
  });

  btnValidationReport.addEventListener("click", () => {
    if (!r5Validation) return;
    const blob = new Blob([JSON.stringify(r5Validation, null, 2)], {
      type: "application/json"
    });
    downloadBlob(blob, "r5-summary-validation.json");
  });

  update();
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function sha256Hex(file) {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const bytes = Array.from(new Uint8Array(hashBuf));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function resetV1Warehouse() {
  state.v1Warehouse = {
    records: [],
    profiles: [],
    importManifest: null,
    rankingManifest: null,
    diagnostics: [],
    r5Files: [],
    r5Profile: null,
    rankings: [],
    selectedCandidate: null,
    tabPatternCorpus: null,
    tabBlueprintRecommendation: null
  };
}

const V1_DOMAIN_KEYWORDS = {
  retirement_dates: ["nrd", "erd", "eurd", "xrd", "dor", "retirement date", "retirement age"],
  benefit_amounts: ["amb", "accrued monthly benefit", "vb", "vested monthly", "benefit amount", "monthly benefit"],
  service: ["credited service", "vesting service", "service", "cs", "vs"],
  form_conversion: ["form", "annuity", "joint", "survivor", "certain", "conversion", "ccf"],
  lump_sum: ["lump sum", "ls_rates", "small benefit", "cashout"],
  mortality_interest: ["npvf", "mortality", "interest", "rate", "pbgc_option_rates", "ls_rates"],
  pbgc_limits: ["maxlim", "pbgc max", "4022", "guarantee", "limitation", "benefit limitation"],
  section_436: ["436", "benefit freeze", "dobf", "restriction"],
  qpsa_qdro: ["qpsa", "qdro", "alternate payee", "spouse", "beneficiary"],
  compensation: ["compensation", "covered comp", "salary", "pay"]
};

function stableIdFromHash(prefix, hash) {
  return `${prefix}-${String(hash).slice(0, 16)}`;
}

function stripJsonBom(text) {
  return String(text ?? "").replace(/^\uFEFF/, "");
}

function collectTextValues(value, out = []) {
  if (out.length > 5000) return out;
  if (value == null) return out;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectTextValues(item, out));
    return out;
  }
  if (typeof value === "object") {
    Object.keys(value)
      .sort()
      .forEach((key) => {
        out.push(key);
        collectTextValues(value[key], out);
      });
  }
  return out;
}

function detectBenefitDomains(textParts) {
  const haystack = textParts.join(" ").toLowerCase();
  return Object.entries(V1_DOMAIN_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => haystack.includes(keyword)))
    .map(([domain]) => domain)
    .sort();
}

function validateV1Summary(obj) {
  const errors = [];
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    errors.push("JSON root must be an object.");
  }
  if (!obj?.cells || typeof obj.cells !== "object" || Array.isArray(obj.cells)) {
    errors.push("Missing object field: cells.");
  }
  if (obj?.runs != null && !Array.isArray(obj.runs)) {
    errors.push("Field runs must be an array when present.");
  }
  return { ok: errors.length === 0, errors };
}

function extractCellEntries(summary) {
  return Object.entries(summary?.cells ?? {}).map(([key, cell]) => ({
    key,
    ...(cell && typeof cell === "object" ? cell : {})
  }));
}

function createV1Profile(record) {
  const summary = record.summary;
  const cells = extractCellEntries(summary);
  const formulaCells = cells.filter((cell) => cell.hasFormula || cell.formula);
  const functionNames = new Set();
  const genericFields = new Set();
  const textParts = [
    summary?.workbookName,
    summary?.schemaVersion,
    ...(Array.isArray(summary?.sourceTabs) ? summary.sourceTabs : []),
    ...(Array.isArray(summary?.runs) ? summary.runs : [])
  ];

  cells.forEach((cell) => {
    if (cell.genericField) genericFields.add(String(cell.genericField));
    if (cell.description) textParts.push(String(cell.description));
    if (cell.formula) textParts.push(String(cell.formula));
    if (Array.isArray(cell.functions)) {
      cell.functions.forEach((fn) => functionNames.add(String(fn).toUpperCase()));
    }
  });

  return Object.freeze({
    record_id: record.record_id,
    source_file: record.source_file,
    sha256: record.sha256,
    read_only: true,
    schema_version: summary?.schemaVersion ?? "unknown",
    workbook_name: summary?.workbookName ?? record.source_file,
    source_tabs: Array.isArray(summary?.sourceTabs) ? [...summary.sourceTabs].sort() : [],
    runs: Array.isArray(summary?.runs) ? [...summary.runs].sort() : [],
    cell_count: cells.length,
    formula_count: formulaCells.length,
    named_range_count: Array.isArray(summary?.namedRanges) ? summary.namedRanges.length : 0,
    generic_fields: [...genericFields].filter(Boolean).sort().slice(0, 500),
    function_names: [...functionNames].filter(Boolean).sort(),
    benefit_domains: detectBenefitDomains([...textParts, ...genericFields, ...functionNames]),
    risk_flags: formulaCells.length > 1000 ? ["large_formula_surface"] : [],
    diagnostics: record.diagnostics ?? []
  });
}

async function importApprovedV1Files(files) {
  const diagnostics = [];
  const imported = [];
  const skipped = [];
  const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const existingById = new Map(state.v1Warehouse.records.map((record) => [record.record_id, record]));

  for (const file of sortedFiles) {
    try {
      const [hash, text] = await Promise.all([sha256Hex(file), file.text()]);
      const parsed = JSON.parse(stripJsonBom(text));
      const validation = validateV1Summary(parsed);
      if (!validation.ok) {
        skipped.push(file.name);
        diagnostics.push(`${file.name}: skipped (${validation.errors.join(" ")})`);
        continue;
      }
      const record = Object.freeze({
        record_id: stableIdFromHash("v1", hash),
        source_file: file.name,
        sha256: hash,
        read_only: true,
        schema_version: parsed.schemaVersion ?? "unknown",
        workbook_name: parsed.workbookName ?? file.name,
        summary: parsed,
        diagnostics: []
      });
      existingById.set(record.record_id, record);
      imported.push(record);
      diagnostics.push(`${file.name}: imported as ${record.record_id}`);
    } catch (err) {
      skipped.push(file.name);
      diagnostics.push(`${file.name}: skipped (${err.message})`);
    }
  }

  const records = [...existingById.values()].sort((a, b) => a.record_id.localeCompare(b.record_id));
  const profiles = records.map(createV1Profile);
  state.v1Warehouse.records = records;
  state.v1Warehouse.profiles = profiles;
  state.v1Warehouse.diagnostics = diagnostics;
  state.v1Warehouse.tabPatternCorpus = null;
  state.v1Warehouse.tabBlueprintRecommendation = null;
  state.v1Warehouse.importManifest = await buildV1RunManifest("v1-approved-import", {
    approvedProfiles: profiles,
    r5Inputs: [],
    imported_count: imported.length,
    skipped_count: skipped.length,
    diagnostics
  });
  state.lastManifest = state.v1Warehouse.importManifest;
  saveState();
  return { imported, skipped, diagnostics, manifest: state.v1Warehouse.importManifest };
}

async function buildV1RunManifest(moduleId, extra = {}) {
  const planMetadataHash = state.planMetadata
    ? await sha256HexString(stringifyStable(state.planMetadata))
    : "unknown";
  const approvedProfiles = extra.approvedProfiles ?? state.v1Warehouse.profiles;
  const approvedHashes = {};
  approvedProfiles.forEach((profile) => {
    approvedHashes[profile.source_file] = profile.sha256;
  });
  const r5Hashes = {};
  (extra.r5Inputs ?? state.v1Warehouse.r5Files).forEach((input) => {
    r5Hashes[input.source_file] = input.sha256;
  });

  return {
    app_version: APP_VERSION,
    schema_version: SCHEMA_VERSION,
    module_id: moduleId,
    module_version: "0.7.0",
    generated_at_utc: new Date().toISOString(),
    case_number: state.planMetadata?.meta?.case_number?.value ?? "unknown",
    plan_metadata_hash: planMetadataHash,
    input_hashes: {
      approved_v1: approvedHashes,
      r5: r5Hashes
    },
    imported_count: extra.imported_count,
    skipped_count: extra.skipped_count,
    best_candidate_record_id: extra.best_candidate_record_id,
    diagnostics: extra.diagnostics ?? []
  };
}

function createR5CaseProfile(inputs) {
  const textParts = [];
  const evidence = [];
  inputs.forEach((input) => {
    const parts = collectTextValues(input.json, []);
    textParts.push(...parts);
    parts
      .filter((part) => part.trim().length > 2)
      .slice(0, 50)
      .forEach((part) => {
        evidence.push({ source_file: input.source_file, snippet: part.slice(0, 180) });
      });
  });
  const recognizedDomains = detectBenefitDomains(textParts);
  return {
    source_files: inputs.map((input) => input.source_file).sort(),
    input_hashes: inputs.reduce((acc, input) => {
      acc[input.source_file] = input.sha256;
      return acc;
    }, {}),
    case_number: state.planMetadata?.meta?.case_number?.value ?? "unknown",
    recognized_domains: recognizedDomains,
    evidence,
    warnings: recognizedDomains.length ? [] : ["No recognized benefit/provision domains found in R5 inputs."]
  };
}

function normalizeR5Items(r5Json) {
  const rawItems = r5Json?.items ?? r5Json?.r5_items ?? r5Json?.answers ?? r5Json?.responses ?? [];
  let items = [];
  if (Array.isArray(rawItems)) {
    items = rawItems;
  } else if (rawItems && typeof rawItems === "object") {
    items = Object.entries(rawItems)
      .map(([key, value]) => {
        if (!value || typeof value !== "object") return null;
        return { item_id: Number(value.item_id ?? key), ...value };
      })
      .filter(Boolean);
  }
  return items.map((item, index) => {
    const itemId = Number(item?.item_id ?? item?.id ?? item?.number ?? item?.r5_item_id ?? item?.r5_id);
    const answer =
      item?.answer ??
      item?.response ??
      item?.summary_1line ??
      item?.value ??
      item?.summary ??
      item?.text ??
      "";
    const citations = item?.citations ?? item?.references ?? item?.citation ?? item?.sources ?? item?.source_citations ?? [];
    return {
      item_id: Number.isFinite(itemId) ? itemId : index + 1,
      label: item?.label ?? item?.question ?? item?.name ?? "",
      answer: String(answer ?? ""),
      citations: Array.isArray(citations) ? citations : citations ? [citations] : []
    };
  });
}

function isUnknownOrNa(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return !normalized || ["unknown", "unk", "n/a", "na", "not available", "not applicable"].includes(normalized);
}

function citationHasLocator(citation) {
  if (!citation) return false;
  if (typeof citation === "string") return citation.trim().length > 0;
  const doc = citation.doc_id ?? citation.document_id ?? citation.source_file ?? citation.source ?? citation.name;
  const page = citation.page ?? citation.page_number ?? citation.pages;
  const locator = citation.locator ?? citation.section ?? citation.line ?? citation.snippet ?? citation.quote;
  return !!String(doc ?? "").trim() && (!!String(page ?? "").trim() || !!String(locator ?? "").trim());
}

function validateR5SummaryJson(r5Json, sourceFile = "R5Summary.json") {
  const schemaValid = !!validateR5SummarySchema(r5Json);
  const schemaErrors = schemaValid
    ? []
    : (validateR5SummarySchema.errors ?? []).map((err) => ({
        instance_path: err.instancePath,
        schema_path: err.schemaPath,
        message: err.message,
        params: err.params
      }));
  const items = normalizeR5Items(r5Json);
  const byId = new Map();
  items.forEach((item) => {
    if (!byId.has(item.item_id)) byId.set(item.item_id, item);
  });

  const missing_items = [];
  const known_without_citations = [];
  const unknown_or_na_items = [];
  const duplicate_item_ids = [];
  const seen = new Set();
  items.forEach((item) => {
    if (seen.has(item.item_id)) duplicate_item_ids.push(item.item_id);
    seen.add(item.item_id);
  });

  r5RequiredItems.forEach((required) => {
    const item = byId.get(required.item_id);
    if (!item) {
      missing_items.push(required);
      return;
    }
    const unknown = isUnknownOrNa(item.answer);
    if (unknown) unknown_or_na_items.push({ item_id: required.item_id, question: required.question });
    const hasCitation = item.citations.some(citationHasLocator);
    if (!unknown && !hasCitation) {
      known_without_citations.push({ item_id: required.item_id, question: required.question });
    }
  });

  const coveredCount = R5_REQUIRED_ITEM_COUNT - missing_items.length;
  const knownCount = R5_REQUIRED_ITEM_COUNT - missing_items.length - unknown_or_na_items.length;
  const citationCoveredKnown = Math.max(0, knownCount - known_without_citations.length);
  const recognizedDomains = detectBenefitDomains(collectTextValues(r5Json, []));
  const warnings = [];
  if (!schemaValid) warnings.push(`R5Summary schema failed with ${schemaErrors.length} error(s).`);
  if (missing_items.length) warnings.push(`${missing_items.length} required R5 item(s) missing.`);
  if (known_without_citations.length) warnings.push(`${known_without_citations.length} known R5 answer(s) lack citations.`);
  if (!recognizedDomains.length) warnings.push("No recognized benefit/provision domains found.");
  if (duplicate_item_ids.length) warnings.push(`${duplicate_item_ids.length} duplicate R5 item id(s) found.`);

  return {
    source_file: sourceFile,
    contract_version: `r5-items-${R5_REQUIRED_ITEM_COUNT}`,
    schema_version_expected: SCHEMA_VERSION,
    schema_valid: schemaValid,
    schema_errors: schemaErrors,
    summary_stage: r5Json?.summary_stage ?? "unknown",
    required_item_count: R5_REQUIRED_ITEM_COUNT,
    item_count: items.length,
    covered_required_count: coveredCount,
    missing_required_count: missing_items.length,
    unknown_or_na_count: unknown_or_na_items.length,
    known_answer_count: knownCount,
    known_without_citation_count: known_without_citations.length,
    citation_covered_known_count: citationCoveredKnown,
    citation_coverage_ratio: knownCount ? Number((citationCoveredKnown / knownCount).toFixed(4)) : 0,
    recognized_domains: recognizedDomains,
    downstream_ready: schemaValid && missing_items.length === 0 && known_without_citations.length === 0 && recognizedDomains.length > 0,
    missing_items,
    unknown_or_na_items,
    known_without_citations,
    duplicate_item_ids: [...new Set(duplicate_item_ids)].sort((a, b) => a - b),
    warnings
  };
}

async function importR5Files(files) {
  const diagnostics = [];
  const inputs = [];
  const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));
  for (const file of sortedFiles) {
    try {
      const [hash, text] = await Promise.all([sha256Hex(file), file.text()]);
      inputs.push({
        source_file: file.name,
        sha256: hash,
        json: JSON.parse(stripJsonBom(text))
      });
      inputs[inputs.length - 1].validation = validateR5SummaryJson(inputs[inputs.length - 1].json, file.name);
      diagnostics.push(`${file.name}: loaded (${inputs[inputs.length - 1].validation.covered_required_count}/${R5_REQUIRED_ITEM_COUNT} required R5 items)`);
    } catch (err) {
      diagnostics.push(`${file.name}: skipped (${err.message})`);
    }
  }
  state.v1Warehouse.r5Files = inputs;
  state.v1Warehouse.r5Profile = createR5CaseProfile(inputs);
  state.caseWorkflow.r5Summary = {
    profile: state.v1Warehouse.r5Profile,
    source_files: state.v1Warehouse.r5Profile.source_files,
    input_hashes: state.v1Warehouse.r5Profile.input_hashes,
    validations: inputs.map((input) => input.validation),
    loaded_at_utc: new Date().toISOString()
  };
  saveState();
  return { inputs, diagnostics, profile: state.v1Warehouse.r5Profile };
}

function jaccardScore(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const union = new Set([...setA, ...setB]);
  if (!union.size) return 0;
  let intersection = 0;
  setA.forEach((item) => {
    if (setB.has(item)) intersection += 1;
  });
  return intersection / union.size;
}

function rankApprovedV1Profiles(r5Profile, profiles) {
  const r5Domains = r5Profile?.recognized_domains ?? [];
  return profiles
    .map((profile) => {
      const matchedDomains = profile.benefit_domains.filter((domain) => r5Domains.includes(domain)).sort();
      const missingDomains = r5Domains.filter((domain) => !profile.benefit_domains.includes(domain)).sort();
      const domainScore = jaccardScore(r5Domains, profile.benefit_domains);
      const functionBreadth = Math.min(profile.function_names.length / 15, 1);
      const fieldBreadth = Math.min(profile.generic_fields.length / 120, 1);
      const completeness = r5Domains.length ? matchedDomains.length / r5Domains.length : 0;
      const confidence = Math.min(1, 0.35 + r5Domains.length * 0.08 + matchedDomains.length * 0.08);
      const overall = domainScore * 0.7 + functionBreadth * 0.15 + fieldBreadth * 0.15;
      const warnings = [];
      if (!r5Domains.length) warnings.push("R5 evidence has no recognized domains.");
      if (!matchedDomains.length) warnings.push("No recognized benefit domains matched this candidate.");
      return {
        candidate_record_id: profile.record_id,
        workbook_name: profile.workbook_name,
        source_file: profile.source_file,
        sha256: profile.sha256,
        overall_score: Number(overall.toFixed(4)),
        confidence: Number(confidence.toFixed(4)),
        completeness: Number(completeness.toFixed(4)),
        matched_domains: matchedDomains,
        missing_domains: missingDomains,
        warnings,
        evidence: matchedDomains.map((domain) => ({
          domain,
          source: "domain-overlap",
          detail: `R5 and approved V1 profile both include ${domain}.`
        }))
      };
    })
    .sort((a, b) => {
      if (b.overall_score !== a.overall_score) return b.overall_score - a.overall_score;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.candidate_record_id.localeCompare(b.candidate_record_id);
    });
}

async function runV1R5Ranking() {
  const r5Profile = state.v1Warehouse.r5Profile;
  const profiles = state.v1Warehouse.profiles;
  if (!profiles.length) throw new Error("Import approved V1 engines first.");
  if (!r5Profile || !state.v1Warehouse.r5Files.length) throw new Error("Upload R5 summary JSON first.");
  const rankings = rankApprovedV1Profiles(r5Profile, profiles);
  state.v1Warehouse.rankings = rankings;
  state.v1Warehouse.rankingManifest = await buildV1RunManifest("v1-r5-ranking", {
    best_candidate_record_id: rankings[0]?.candidate_record_id ?? "none",
    diagnostics: r5Profile.warnings
  });
  state.lastManifest = state.v1Warehouse.rankingManifest;
  saveState();
  return { rankings, manifest: state.v1Warehouse.rankingManifest };
}

function renderV1ProfilesSummary() {
  const profiles = state.v1Warehouse.profiles;
  if (!profiles.length) return `<div class="meta-line">No approved V1 engines imported.</div>`;
  const top = profiles.slice(0, 8);
  return `
    <div class="v1-summary-grid">
      <div><b>${profiles.length}</b><span>approved engines</span></div>
      <div><b>${profiles.reduce((sum, p) => sum + p.formula_count, 0)}</b><span>formula cells</span></div>
      <div><b>${new Set(profiles.flatMap((p) => p.benefit_domains)).size}</b><span>benefit domains</span></div>
    </div>
    <div class="v1-list">
      ${top
        .map(
          (profile) => `
            <div class="v1-list-item">
              <b>${escapeHtml(profile.workbook_name)}</b>
              <span>${escapeHtml(profile.source_file)} | ${profile.formula_count} formulas | ${escapeHtml(profile.sha256.slice(0, 12))}</span>
            </div>`
        )
        .join("")}
    </div>
  `;
}

function selectV1Candidate(candidateRecordId) {
  const ranking = state.v1Warehouse.rankings.find((item) => item.candidate_record_id === candidateRecordId);
  const profile = state.v1Warehouse.profiles.find((item) => item.record_id === candidateRecordId);
  if (!ranking && !profile) return null;
  const selected = {
    candidate_record_id: candidateRecordId,
    workbook_name: ranking?.workbook_name ?? profile?.workbook_name ?? "unknown",
    source_file: ranking?.source_file ?? profile?.source_file ?? "unknown",
    sha256: ranking?.sha256 ?? profile?.sha256 ?? "unknown",
    overall_score: ranking?.overall_score ?? "unknown",
    confidence: ranking?.confidence ?? "unknown",
    completeness: ranking?.completeness ?? "unknown",
    matched_domains: ranking?.matched_domains ?? profile?.benefit_domains ?? [],
    missing_domains: ranking?.missing_domains ?? [],
    selected_at_utc: new Date().toISOString(),
    read_only: true
  };
  state.v1Warehouse.selectedCandidate = selected;
  state.caseWorkflow.selectedV1 = selected;
  saveState();
  return selected;
}

function renderSelectedV1Summary() {
  const selected = getSelectedV1Summary();
  if (!selected) {
    return `<div class="workflow-selected missing"><b>No current V1 engine selected.</b><span>Select one ranked approved candidate to make it available to downstream modules.</span></div>`;
  }
  return `
    <div class="workflow-selected ready">
      <b>Current case V1 engine: ${escapeHtml(selected.workbook_name ?? "unknown")}</b>
      <span>${escapeHtml(selected.source_file ?? "unknown")} | ${escapeHtml(String(selected.candidate_record_id ?? "unknown"))} | ${escapeHtml(String(selected.sha256 ?? "unknown").slice(0, 12))}</span>
    </div>
  `;
}

function renderV1RankingResults() {
  const rankings = state.v1Warehouse.rankings;
  if (!rankings.length) return `<div class="meta-line">No ranking run yet.</div>`;
  const selected = getSelectedV1Summary();
  return `
    <div class="v1-ranking-list">
      ${rankings
        .slice(0, 10)
        .map(
          (result, index) => `
            <div class="v1-ranking-item ${index === 0 ? "best" : ""}">
              <div>
                <b>${index + 1}. ${escapeHtml(result.workbook_name)}</b>
                <span>${escapeHtml(result.source_file)} | score ${result.overall_score} | confidence ${result.confidence} | completeness ${result.completeness}</span>
              </div>
              <div class="meta-line">Matched: ${escapeHtml(result.matched_domains.join(", ") || "none")}</div>
              <div class="meta-line">Missing: ${escapeHtml(result.missing_domains.join(", ") || "none")}</div>
              ${result.warnings.length ? `<div class="meta-line">Warnings: ${escapeHtml(result.warnings.join("; "))}</div>` : ""}
              <button class="ghost" data-select-v1="${escapeHtml(result.candidate_record_id)}">
                ${selected?.candidate_record_id === result.candidate_record_id ? "Selected for case" : "Use this V1 for case"}
              </button>
            </div>`
        )
        .join("")}
    </div>
  `;
}

function norm(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function normLabel(s) {
  return norm(s).replace(/:$/, "");
}

function nodeText(node) {
  const ts = node.getElementsByTagName("w:t");
  let out = "";
  for (let i = 0; i < ts.length; i++) out += ts[i].textContent ?? "";
  return out;
}

function isWordNode(node, localName) {
  return (
    node?.nodeType === 1 &&
    (node.localName === localName || node.nodeName === `w:${localName}` || String(node.nodeName ?? "").endsWith(`:${localName}`))
  );
}

function wordDirectChildren(parent, localName) {
  return Array.from(parent?.childNodes ?? []).filter((node) => isWordNode(node, localName));
}

function wordFirstChild(parent, localName) {
  return wordDirectChildren(parent, localName)[0] ?? null;
}

function wordAttr(el, localName) {
  if (!el?.attributes) return null;
  return (
    el.getAttribute(`w:${localName}`) ??
    el.getAttribute(localName) ??
    Array.from(el.attributes).find((attr) => String(attr.name ?? "").endsWith(`:${localName}`))?.value ??
    null
  );
}

function getCellByGridCol(tr, gridCol) {
  const cells = wordDirectChildren(tr, "tc");
  let col = 0;
  for (const cell of cells) {
    const tcPr = wordFirstChild(cell, "tcPr");
    const gridSpan = tcPr ? wordFirstChild(tcPr, "gridSpan") : null;
    const span = Math.max(1, Number.parseInt(wordAttr(gridSpan, "val") ?? "1", 10) || 1);
    if (gridCol >= col && gridCol < col + span) return cell;
    col += span;
  }
  return null;
}

function findTableAfterHeadingParagraph(doc, headingText) {
  const body = doc.getElementsByTagName("w:body")[0];
  if (!body) return null;

  const children = body.childNodes;
  const needle = headingText.toLowerCase();
  let seenHeading = false;

  for (let i = 0; i < children.length; i++) {
    const n = children[i];
    if (!n || !n.nodeName) continue;

    if (n.nodeName === "w:p") {
      const t = nodeText(n).toLowerCase();
      if (t.includes(needle)) seenHeading = true;
    } else if (n.nodeName === "w:tbl") {
      if (seenHeading) return n;
    }
  }
  return null;
}

function findTableContainingText(doc, headingText) {
  const tbls = doc.getElementsByTagName("w:tbl");
  const needle = headingText.toLowerCase();
  for (let i = 0; i < tbls.length; i++) {
    const t = nodeText(tbls[i]).toLowerCase();
    if (t.includes(needle)) return tbls[i];
  }
  return null;
}

function findRatesBlockTable(doc, headingText) {
  return (
    findTableAfterHeadingParagraph(doc, headingText) ||
    findTableContainingText(doc, headingText)
  );
}

function findPlanProvisionsTable(doc) {
  const tables = doc.getElementsByTagName("w:tbl");
  for (let i = 0; i < tables.length; i++) {
    const text = nodeText(tables[i]);
    const rows = tables[i].getElementsByTagName("w:tr").length;
    if (text.includes("Plan Provisions") && rows >= 70) return tables[i];
  }
  return null;
}

function findCellByLabelInTable(tbl, label) {
  const tcs = tbl.getElementsByTagName("w:tc");
  const target = normLabel(label);
  for (let i = 0; i < tcs.length; i++) {
    const txt = normLabel(nodeText(tcs[i]));
    if (txt === target) return tcs[i];
  }
  return null;
}

function findCellByLabelAnywhere(doc, label) {
  const tcs = doc.getElementsByTagName("w:tc");
  const target = normLabel(label);
  for (let i = 0; i < tcs.length; i++) {
    const txt = normLabel(nodeText(tcs[i]));
    if (txt === target) return tcs[i];
  }
  return null;
}

function appendTextWithBreaks(doc, pNode, text) {
  const W_NS =
    doc.documentElement.getAttribute("xmlns:w") ||
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

  const parts = String(text ?? "").split("\n");
  for (let i = 0; i < parts.length; i++) {
    const run = doc.createElementNS(W_NS, "w:r");
    const t = doc.createElementNS(W_NS, "w:t");
    t.setAttribute("xml:space", "preserve");
    t.appendChild(doc.createTextNode(parts[i]));
    run.appendChild(t);
    pNode.appendChild(run);

    if (i < parts.length - 1) {
      const runBr = doc.createElementNS(W_NS, "w:r");
      const br = doc.createElementNS(W_NS, "w:br");
      runBr.appendChild(br);
      pNode.appendChild(runBr);
    }
  }
}

function appendValueToCell(doc, tc, value, prefix = " ") {
  if (!value) return { ok: false, reason: "value missing" };
  const existing = nodeText(tc);
  if (existing.includes(value)) return { ok: true, reason: "already present" };

  let p = tc.getElementsByTagName("w:p")[0];
  if (!p) {
    const W_NS =
      doc.documentElement.getAttribute("xmlns:w") ||
      "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    p = doc.createElementNS(W_NS, "w:p");
    tc.appendChild(p);
  }

  appendTextWithBreaks(doc, p, `${prefix}${value}`);
  return { ok: true, reason: "appended" };
}

function appendValueToLabelInTable(doc, tbl, label, value, prefix = " ") {
  const tc = findCellByLabelInTable(tbl, label);
  if (!tc) return { ok: false, reason: `label not found in block: ${label}` };
  return appendValueToCell(doc, tc, value, prefix);
}

function appendValueToLabelAnywhere(doc, label, value, prefix = " ") {
  const tc = findCellByLabelAnywhere(doc, label);
  if (!tc) return { ok: false, reason: `label not found: ${label}` };
  return appendValueToCell(doc, tc, value, prefix);
}

function setCellText(doc, tc, value) {
  const W_NS =
    doc.documentElement.getAttribute("xmlns:w") ||
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

  while (tc.firstChild) tc.removeChild(tc.firstChild);

  const p = doc.createElementNS(W_NS, "w:p");
  appendTextWithBreaks(doc, p, String(value ?? ""));
  tc.appendChild(p);
}

function findTableContainingAllLabels(doc, labels) {
  const tbls = doc.getElementsByTagName("w:tbl");
  const needles = labels.map((x) => normLabel(x).toLowerCase());
  for (let i = 0; i < tbls.length; i++) {
    const txt = nodeText(tbls[i]).toLowerCase();
    if (needles.every((n) => txt.includes(n))) return tbls[i];
  }
  return null;
}

function setValueInCellRightOfLabel(doc, tbl, label, value) {
  const rows = tbl.getElementsByTagName("w:tr");
  const target = normLabel(label);
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].getElementsByTagName("w:tc");
    for (let c = 0; c < cells.length; c++) {
      const cellTxt = normLabel(nodeText(cells[c]));
      if (cellTxt === target) {
        const right = cells[c + 1];
        if (!right) return { ok: false, reason: `no value cell to right of '${label}'` };
        if (String(value ?? "").trim() === "") return { ok: false, reason: `value missing for '${label}'` };
        setCellText(doc, right, value);
        return { ok: true, reason: `set right-cell for '${label}'` };
      }
    }
  }
  return { ok: false, reason: `label not found in metadata table: '${label}'` };
}

function citationToDisplayText(citation) {
  if (!citation) return "";
  if (typeof citation === "string") return citation.trim();
  const parts = [];
  const doc = citation.doc_id ?? citation.document_id ?? citation.source_file ?? citation.source ?? citation.name;
  const page = citation.page ?? citation.page_number ?? citation.pages;
  const locator = citation.locator ?? citation.section ?? citation.line;
  if (doc) parts.push(String(doc));
  if (page) parts.push(`p. ${page}`);
  if (locator) parts.push(String(locator));
  return parts.join("; ");
}

function fillR5PlanProvisionItems(doc, r5Json) {
  const table = findPlanProvisionsTable(doc);
  if (!table) {
    return { ok: false, reason: "Could not locate Plan Provisions table.", written: 0, missing: R5_REQUIRED_ITEM_COUNT };
  }

  const rows = wordDirectChildren(table, "tr");
  const itemsById = new Map();
  normalizeR5Items(r5Json).forEach((item) => {
    if (!itemsById.has(item.item_id)) itemsById.set(item.item_id, item);
  });

  let written = 0;
  let missing = 0;
  let cellsMissing = 0;
  for (const required of r5RequiredItems) {
    const rowIndex = R5_ITEM_TO_PLAN_PROVISIONS_ROW[required.item_id];
    const row = rows[rowIndex];
    const cell = row ? getCellByGridCol(row, 1) : null;
    if (!cell) {
      cellsMissing++;
      continue;
    }

    const item = itemsById.get(required.item_id);
    const answer = String(item?.answer ?? "").trim();
    if (!answer) {
      missing++;
      setCellText(doc, cell, "");
      continue;
    }

    const citationLine = (item?.citations ?? []).map(citationToDisplayText).filter(Boolean).join("; ");
    setCellText(doc, cell, citationLine ? `${answer}\n${citationLine}` : answer);
    written++;
  }

  return {
    ok: cellsMissing === 0,
    reason: cellsMissing ? `${cellsMissing} Plan Provisions cell(s) not found.` : "Filled available R5 items.",
    written,
    missing,
    cells_missing: cellsMissing
  };
}

function pickValue(r5, meta, key, keywords = []) {
  const planVal = meta?.plan?.[key]?.value;
  if (planVal != null && String(planVal).trim() && String(planVal).trim() !== "unknown") {
    return String(planVal);
  }

  const m = meta?.dependent_fields?.[key];
  if (m != null && String(m).trim() !== "") return String(m);

  const d = r5?.dependent_fields?.[key];
  if (d != null && String(d).trim() !== "") return String(d);

  const t = r5?.[key];
  if (t != null && String(t).trim() !== "") return String(t);

  const items = Array.isArray(r5?.items) ? r5.items : [];
  const ks = keywords.map((x) => x.toLowerCase());
  for (const it of items) {
    const id = String(it?.r5_id ?? "").toLowerCase();
    const lbl = String(it?.label ?? "").toLowerCase();
    if (id === key.toLowerCase()) return String(it?.answer ?? "");
    if (ks.length && ks.some((k) => lbl.includes(k) || id.includes(k))) {
      const ans = String(it?.answer ?? "");
      if (ans.trim()) return ans;
    }
  }
  return "";
}

async function fillPlanSummaryDocx(docxFile, r5Json, planMetadata) {
  const buf = await docxFile.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  const docPath = "word/document.xml";
  const xmlText = await zip.file(docPath).async("text");

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");

  const log = [];

  const c = {
    plan_name: getPlanValue(planMetadata, "plan_name"),
    case_number: planMetadata?.meta?.case_number?.value ?? "",
    dopt: getPlanValue(planMetadata, "termination_date"),
    dotr: getPlanValue(planMetadata, "trusteeship_date"),
    bpd: getPlanValue(planMetadata, "valuation_date")
  };

  log.push(JSON.stringify(appendValueToLabelAnywhere(doc, "Plan Name", c.plan_name), null, 0));
  log.push(JSON.stringify(appendValueToLabelAnywhere(doc, "Case Number", c.case_number), null, 0));
  log.push(JSON.stringify(appendValueToLabelAnywhere(doc, "DOPT", c.dopt), null, 0));
  log.push(JSON.stringify(appendValueToLabelAnywhere(doc, "DOTR", c.dotr), null, 0));
  log.push(JSON.stringify(appendValueToLabelAnywhere(doc, "BPD", c.bpd), null, 0));

  const lumpTbl = findRatesBlockTable(doc, "PBGC Lump Sum Rates");
  const annTbl = findRatesBlockTable(doc, "PBGC Annuity Rates");

  const lsImm = pickValue(r5Json, planMetadata, "pbgc_lump_sum_immediate_rate", [
    "pbgc lump sum immediate",
    "lump sum immediate"
  ]);
  const lsDef = pickValue(r5Json, planMetadata, "pbgc_lump_sum_deferral_rate", [
    "pbgc lump sum deferral",
    "lump sum deferral"
  ]);

  const annImm =
    pickValue(r5Json, planMetadata, "pbgc_annuity_immediate_rate", [
      "pbgc annuity immediate",
      "annuity immediate"
    ]) ||
    pickValue(r5Json, planMetadata, "pbgc_annuity_rates", ["pbgc annuity rates", "annuity rates"]);

  const annDef =
    pickValue(r5Json, planMetadata, "pbgc_annuity_deferral_rate", [
      "pbgc annuity deferral",
      "annuity deferral"
    ]) ||
    pickValue(r5Json, planMetadata, "pbgc_annuity_rates", ["pbgc annuity rates", "annuity rates"]);

  if (!lumpTbl) log.push("ERROR: Could not locate PBGC Lump Sum Rates block table.");
  if (!annTbl) log.push("ERROR: Could not locate PBGC Annuity Rates block table.");

  if (lumpTbl) {
    log.push(`PBGC Lump Sum Rates: imm=${lsImm ? "OK" : "MISSING"}, def=${lsDef ? "OK" : "MISSING"}`);
    log.push(JSON.stringify(appendValueToLabelInTable(doc, lumpTbl, "Immediate Rate", lsImm), null, 0));
    log.push(JSON.stringify(appendValueToLabelInTable(doc, lumpTbl, "Deferral Rate", lsDef), null, 0));
  }

  if (annTbl) {
    log.push(`PBGC Annuity Rates: imm=${annImm ? "OK" : "MISSING"}, def=${annDef ? "OK" : "MISSING"}`);
    log.push(JSON.stringify(appendValueToLabelInTable(doc, annTbl, "Immediate Rate", annImm), null, 0));
    log.push(JSON.stringify(appendValueToLabelInTable(doc, annTbl, "Deferral Rate", annDef), null, 0));
  }

  const provisionFill = fillR5PlanProvisionItems(doc, r5Json);
  log.push(`Plan Provisions R5 items: written=${provisionFill.written}, missing_answers=${provisionFill.missing}, missing_cells=${provisionFill.cells_missing}`);
  if (!provisionFill.ok) log.push(`Plan Provisions warning: ${provisionFill.reason}`);

  const serializer = new XMLSerializer();
  const newXml = serializer.serializeToString(doc);
  zip.file(docPath, newXml);

  const outBuf = await zip.generateAsync({ type: "arraybuffer" });
  return {
    blob: new Blob([outBuf], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }),
    log
  };
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fileToBase64(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

window.JSZip = JSZip;
window.addEventListener("hashchange", renderRoute);
if (!location.hash) location.hash = "#/metadata";
loadState();
renderShell();
applyTheme("dark");
renderRoute();


