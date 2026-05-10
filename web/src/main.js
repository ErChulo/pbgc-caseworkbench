
import "./style.css";

import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import r5BuilderLegacyHtml from "./legacy/r5-builder.v0.7.9.html?raw";
import v1EngineExplorerHtml from "./legacy/pbgc-v1-engine-explorer.html?raw";
import logoSvg from "./assets/logo.svg?raw";
import metadataScraperPrompt from "./assets/metadata-scraper-prompt.txt?raw";

import Ajv from "ajv";
import planMetadataSchema from "./planMetadata.schema.json";
import { APP_VERSION, SCHEMA_VERSION } from "./version.js";

const ajv = new Ajv({ allErrors: true, strict: false });
const validatePlanMetadata = ajv.compile(planMetadataSchema);

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
    selectedCandidate: null
  },
  caseWorkflow: {
    r5Summary: null,
    selectedV1: null,
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
  state.caseWorkflow = { r5Summary: null, selectedV1: null, moduleRuns: {} };
  state.lastError = null;
  localStorage.removeItem(STORAGE_KEY);
}

const routes = [
  { path: "#/metadata", title: "Metadata", render: renderMetadata },
  { path: "#/dashboard", title: "Dashboard", render: renderDashboard },
  { path: "#/guide", title: "Case Guide", render: renderCaseGuide },
  { path: "#/inputs", title: "Inputs Matrix", render: renderInputsMatrix },
  { path: "#/rules", title: "Rules Registry", render: renderRulesRegistry },
  { path: "#/r5-builder", title: "R5 Builder", render: renderR5Builder },
  { path: "#/plan-summary", title: "Plan Summary", render: renderPlanSummary },
  { path: "#/v1-engine-explorer", title: "V1 Explorer", render: renderV1EngineExplorer },
  { path: "#/v1-audit", title: "V1 Audit", render: renderV1Audit },
  { path: "#/del", title: "DEL", readiness: "scaffold", render: (container) => renderArtifactModule(container, artifactModuleConfigs.del) },
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

const artifactModuleConfigs = {
  del: {
    id: "data-elements",
    title: "DEL Data Elements",
    description: "Package Data Element List source evidence and extracted fields for the current case.",
    outputName: "data-elements.artifact.json",
    accepted: ".json,.csv,.txt,.xlsx,.xlsm,.xls,.pdf,.docx",
    prompt: "Upload DEL extracts, source worksheets, DD.csv mappings, and supporting cited references.",
    requiredInputs: ["PlanMetadata", "R5 summary JSON/profile", "DEL source files", "Cited source evidence"],
    upstreamInputs: ["metadata", "r5"]
  },
  factors: {
    id: "plan-factors",
    title: "Plan Factors",
    description: "Package uploaded factor source files into a cited, audit-ready extraction workspace.",
    outputName: "plan-factors.artifact.json",
    accepted: ".json,.csv,.txt,.xlsx,.xlsm,.xls,.pdf,.docx",
    prompt: "Upload factor tables, plan provisions, and supporting references.",
    requiredInputs: ["PlanMetadata", "R5 summary JSON/profile", "Selected V1 engine profile when available", "Plan factor source files", "Cited plan provisions"],
    upstreamInputs: ["metadata", "r5", "v1"]
  },
  section436: {
    id: "section-436",
    title: "Section 436 Limitation Memo",
    description: "Build a memo input package for section 436 limitations without inventing missing provisions.",
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
    requiredInputs: ["PlanMetadata", "R5 summary JSON/profile", "Selected V1 engine profile when available", "Estimated benefit extracts", "Adjustment workpapers"],
    upstreamInputs: ["metadata", "r5", "v1"]
  },
  estimatedAdministration: {
    id: "estimated-benefit-administration",
    title: "Estimated Benefit Administration Analysis",
    description: "Create an administration analysis package from uploaded extracts and source notes.",
    outputName: "estimated-benefit-administration.artifact.json",
    accepted: ".json,.csv,.txt,.xlsx,.xlsm,.xls,.pdf",
    prompt: "Upload administration extracts, sample notices, or operational notes.",
    requiredInputs: ["PlanMetadata", "R5 summary JSON/profile", "Administration extracts", "Operational notes"],
    upstreamInputs: ["metadata", "r5"]
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
    description: "Create a deterministic BSRS/BCV letter generation config package from uploaded templates and variable maps.",
    outputName: "bsrs-bcv-letter-config.artifact.json",
    accepted: ".json,.txt,.csv,.docx,.xlsx,.xlsm,.xls",
    prompt: "Upload letter templates, BSRS configs, and variable mappings.",
    requiredInputs: ["PlanMetadata", "R5 summary JSON/profile", "Letter templates", "BCV/BSRS config inputs"],
    upstreamInputs: ["metadata", "r5"]
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
  const preMetadataRoutes = new Set(["#/metadata", "#/guide"]);
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

const legacyR5SrcDoc = r5BuilderLegacyHtml
  .replace(
    /<script[^>]*cdnjs\.cloudflare\.com\/ajax\/libs\/jszip[^>]*><\/script>\s*/gi,
    ""
  )
  .replace(
    /<head([^>]*)>/i,
    `<head$1><script>window.JSZip = parent.JSZip;<\/script>`
  );

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

function workflowInputStatus() {
  const metadataReady = isMetadataReady();
  const r5Summary = getR5WorkflowSummary();
  const selectedV1 = getSelectedV1Summary();
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

function deliverableCards() {
  return [
    {
      route: "#/plan-summary",
      title: "Plan Summary / R5",
      status: "Functional legacy generator",
      description: "Generate the filled Plan Summary document and use the R5 JSON as the case summary evidence.",
      inputs: ["PlanMetadata", "Plan Summary DOCX template", "R5 summary JSON"],
      action: "Generate Plan Summary",
      upstreamInputs: ["metadata", "r5"]
    },
    {
      route: "#/del",
      title: "DEL Data Elements",
      status: "Scaffold package",
      description: "Package Data Element List source evidence and extracted fields.",
      inputs: artifactModuleConfigs.del.requiredInputs,
      action: "Package DEL inputs",
      upstreamInputs: artifactModuleConfigs.del.upstreamInputs
    },
    {
      route: "#/factors",
      title: "Plan Factors",
      status: "Scaffold package",
      description: "Package factor source files, cited plan provisions, and selected engine context.",
      inputs: artifactModuleConfigs.factors.requiredInputs,
      action: "Package PF inputs",
      upstreamInputs: artifactModuleConfigs.factors.upstreamInputs
    },
    {
      route: "#/436",
      title: "Section 436",
      status: "Scaffold package",
      description: "Package limitation memo evidence, amendments, and freeze references.",
      inputs: artifactModuleConfigs.section436.requiredInputs,
      action: "Package 436 inputs",
      upstreamInputs: artifactModuleConfigs.section436.upstreamInputs
    },
    {
      route: "#/estimated-adjustments",
      title: "Estimated Adjustments",
      status: "Scaffold package",
      description: "Package estimated benefit adjustment extracts and workpapers.",
      inputs: artifactModuleConfigs.estimatedAdjustments.requiredInputs,
      action: "Package adjustment inputs",
      upstreamInputs: artifactModuleConfigs.estimatedAdjustments.upstreamInputs
    },
    {
      route: "#/estimated-administration",
      title: "Estimated Administration",
      status: "Scaffold package",
      description: "Package estimated benefit administration extracts and operational notes.",
      inputs: artifactModuleConfigs.estimatedAdministration.requiredInputs,
      action: "Package administration inputs",
      upstreamInputs: artifactModuleConfigs.estimatedAdministration.upstreamInputs
    },
    {
      route: "#/v1-engine-explorer",
      title: "Calculation Engine / V1",
      status: "Primary workflow",
      description: "Rank approved V1 engines against R5 evidence and select the current case candidate.",
      inputs: ["PlanMetadata", "R5 summary JSON", "Approved V1Summary JSON files"],
      action: "Rank and select V1",
      upstreamInputs: ["metadata", "r5"]
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
      status: "Scaffold package",
      description: "Package letter templates, variable maps, and BSRS/BCV config inputs.",
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
    title: "Plan Summary / R5",
    route: "#/plan-summary",
    pureInputs: [
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
    title: "DEL Data Elements",
    route: "#/del",
    pureInputs: [
      "Participant/census/payee records with no repo PII",
      "Source priority for each field: payroll, plan administrator files, paying agent files, participant forms, participant files",
      "Field-level citations or source notes for manually entered values"
    ],
    upstreamOutputs: ["PlanMetadata", "R5 summary/profile"],
    governingReferences: ["reference/DD.csv", "reference/CASE_PROCESSING.txt", "reference/case.schema.json"],
    readinessKeys: ["metadata", "r5"]
  },
  {
    id: "plan-factors",
    title: "Plan Factors / PF",
    route: "#/factors",
    pureInputs: [
      "Plan factor rules from R5/plan documents: early, late, form conversion, actuarial equivalence, lump sum, optional forms",
      "PBGC/plan assumption basis: interest, mortality, lookback/stability periods, thresholds",
      "PF template or workbook fixture when producing Excel output"
    ],
    upstreamOutputs: ["PlanMetadata", "R5 summary/profile", "Selected V1 engine when available"],
    governingReferences: ["reference/README - plan_factors.md", "reference/24884900PF.v0.7.13.xlsx", "reference/plan-summary-rules.txt"],
    readinessKeys: ["metadata", "r5", "v1"]
  },
  {
    id: "section-436",
    title: "Section 436 Limitation Analysis",
    route: "#/436",
    pureInputs: [
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
    title: "Estimated Benefit Adjustment Analysis",
    route: "#/estimated-adjustments",
    pureInputs: [
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
    title: "Estimated Benefit Administration Analysis",
    route: "#/estimated-administration",
    pureInputs: [
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
    title: "Calculation Engine / V1",
    route: "#/v1-engine-explorer",
    pureInputs: [
      "Approved V1Summary JSON files selected by upload from local reference material",
      "R5 summary JSON/profile for the current case",
      "DEL field model and participant input schema when participant calculations are implemented"
    ],
    upstreamOutputs: ["PlanMetadata", "R5 summary/profile", "Plan Factors when available"],
    governingReferences: ["reference/raw-approved-v1-engines", "reference/run_catalog_seed.v0.7.0.json", "reference/output_contract_seed.v0.7.0.json", "reference/sample-2-v1.xlsm"],
    readinessKeys: ["metadata", "r5", "v1"]
  },
  {
    id: "bsrs-bcv",
    title: "BSRS / BCV Letter Config",
    route: "#/letters-bcv",
    pureInputs: [
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

const rulesRegistry = [
  {
    id: "RULE-R5-001",
    title: "R5 question inventory",
    rule_class: "mechanical",
    status: "planned_validator",
    deliverables: ["Plan Summary / R5"],
    governing_references: ["reference/r5-items.txt"],
    input_artifacts: ["PlanMetadata", "Plan document extraction JSON"],
    output_artifacts: ["r5-summary.json", "Plan Summary DOCX"]
  },
  {
    id: "RULE-R5-002",
    title: "Plan Summary document coverage and citation rules",
    rule_class: "mechanical",
    status: "partially_implemented",
    deliverables: ["Plan Summary / R5", "Inputs Matrix"],
    governing_references: ["reference/plan-summary-rules.txt"],
    input_artifacts: ["PlanMetadata", "document registry", "R5 summary JSON"],
    output_artifacts: ["Plan Summary DOCX", "manifest.json"]
  },
  {
    id: "RULE-R5-003",
    title: "Plan provision extraction from PDFs and amendments",
    rule_class: "llm_assisted",
    status: "planned_extractor",
    deliverables: ["Plan Summary / R5", "Plan Factors / PF", "V1"],
    governing_references: ["reference/plan-summary-rules.txt", "reference/metadata-scraper-prompt.txt"],
    input_artifacts: ["plan documents", "amendments", "SPDs", "CBAs"],
    output_artifacts: ["PlanMetadata", "r5-summary.json", "plan-layer extraction JSON"]
  },
  {
    id: "RULE-R5-004",
    title: "Ambiguous provision and conflict resolution",
    rule_class: "human_review",
    status: "manual_required",
    deliverables: ["Plan Summary / R5", "Plan Factors / PF", "V1"],
    governing_references: ["reference/plan-summary-rules.txt"],
    input_artifacts: ["conflicting extracted facts", "citations"],
    output_artifacts: ["approved fact selection", "review notes"]
  },
  {
    id: "RULE-DEL-001",
    title: "DEL direct input versus calculated field split",
    rule_class: "mechanical",
    status: "planned_validator",
    deliverables: ["DEL Data Elements", "V1", "BSRS / BCV"],
    governing_references: ["reference/DD.csv"],
    input_artifacts: ["participant/census/payee data", "DD.csv field dictionary"],
    output_artifacts: ["data-elements.json", "field coverage report"]
  },
  {
    id: "RULE-DEL-002",
    title: "Participant source priority and field provenance",
    rule_class: "llm_assisted",
    status: "planned_extractor",
    deliverables: ["DEL Data Elements", "Estimated Administration"],
    governing_references: ["reference/CASE_PROCESSING.txt", "reference/DD.csv"],
    input_artifacts: ["census files", "payee files", "participant forms", "source notes"],
    output_artifacts: ["source-priority map", "DEL source citations"]
  },
  {
    id: "RULE-DEL-003",
    title: "Acceptance of participant data assumptions",
    rule_class: "human_review",
    status: "manual_required",
    deliverables: ["DEL Data Elements", "Estimated Adjustments", "Estimated Administration"],
    governing_references: ["reference/CASE_PROCESSING.txt"],
    input_artifacts: ["DEL source report", "missing/unknown field report"],
    output_artifacts: ["approved assumptions", "case notes"]
  },
  {
    id: "RULE-V1-001",
    title: "Approved V1Summary import shape",
    rule_class: "mechanical",
    status: "implemented",
    deliverables: ["V1"],
    governing_references: ["reference/raw-approved-v1-engines"],
    input_artifacts: ["approved V1Summary JSON files"],
    output_artifacts: ["approved V1 warehouse profiles", "import manifest"]
  },
  {
    id: "RULE-V1-002",
    title: "V1 run ordering and reconstruction preview",
    rule_class: "mechanical",
    status: "implemented",
    deliverables: ["V1", "V1 Match Audit"],
    governing_references: ["reference/run_catalog_seed.v0.7.0.json", "reference/sample-2-v1.xlsm"],
    input_artifacts: ["approved V1Summary JSON files"],
    output_artifacts: ["v1-match-reconstruction-audit.json"]
  },
  {
    id: "RULE-V1-003",
    title: "V1 output field contract",
    rule_class: "mechanical",
    status: "planned_validator",
    deliverables: ["V1", "BSRS / BCV"],
    governing_references: ["reference/output_contract_seed.v0.7.0.json"],
    input_artifacts: ["V1 engine profile", "DEL field model"],
    output_artifacts: ["output coverage report"]
  },
  {
    id: "RULE-V1-004",
    title: "V1 candidate actuarial suitability",
    rule_class: "human_review",
    status: "manual_required",
    deliverables: ["V1"],
    governing_references: ["reference/raw-approved-v1-engines", "reference/plan-summary-rules.txt"],
    input_artifacts: ["ranking evidence", "R5 profile", "reconstruction preview"],
    output_artifacts: ["selected V1 candidate", "review signoff"]
  },
  {
    id: "RULE-PF-001",
    title: "Plan factor workbook input contract",
    rule_class: "mechanical",
    status: "planned_validator",
    deliverables: ["Plan Factors / PF"],
    governing_references: ["reference/README - plan_factors.md", "reference/24884900PF.v0.7.13.xlsx"],
    input_artifacts: ["case.json", "planFactors.json"],
    output_artifacts: ["########PF.v0.7.13.xlsx"]
  },
  {
    id: "RULE-PF-002",
    title: "Factor rule extraction from plan provisions",
    rule_class: "llm_assisted",
    status: "planned_extractor",
    deliverables: ["Plan Factors / PF", "V1"],
    governing_references: ["reference/plan-summary-rules.txt", "reference/plan-layer-object-variables.txt"],
    input_artifacts: ["R5 summary", "plan provisions"],
    output_artifacts: ["planFactors.json"]
  },
  {
    id: "RULE-436-001",
    title: "Section 436 input package and memo scaffold",
    rule_class: "mechanical",
    status: "partially_implemented",
    deliverables: ["Section 436"],
    governing_references: ["reference/Benefit Limitations Under PPA 2006 - Section 436.pdf", "reference/pbgc-436-webapp-v0.2.0"],
    input_artifacts: ["DOPT", "DOTR", "BPD", "DOBF", "AFTAP/CBA facts"],
    output_artifacts: ["section-436-memo.artifact.json"]
  },
  {
    id: "RULE-436-002",
    title: "Section 436 applicability judgment",
    rule_class: "human_review",
    status: "manual_required",
    deliverables: ["Section 436"],
    governing_references: ["reference/Benefit Limitations Under PPA 2006 - Section 436.pdf"],
    input_artifacts: ["freeze evidence", "AFTAP facts", "plan amendments"],
    output_artifacts: ["approved 436 conclusion"]
  },
  {
    id: "RULE-EST-001",
    title: "Estimated adjustment payment-history package",
    rule_class: "mechanical",
    status: "planned_validator",
    deliverables: ["Estimated Adjustments"],
    governing_references: ["reference/Computation and Netting of Post-DOPT Overpayments and Underpayments.pdf", "reference/Benefit Corrections.pdf"],
    input_artifacts: ["payment history", "estimated benefit extract", "current benefit status"],
    output_artifacts: ["estimated-benefit-adjustments.artifact.json"]
  },
  {
    id: "RULE-ADMIN-001",
    title: "Estimated administration input package",
    rule_class: "mechanical",
    status: "planned_validator",
    deliverables: ["Estimated Administration"],
    governing_references: ["reference/CASE_PROCESSING.txt", "reference/Frequency of Benefit Payments.pdf"],
    input_artifacts: ["payee administration extract", "PIF/verification status", "operational notes"],
    output_artifacts: ["estimated-benefit-administration.artifact.json"]
  },
  {
    id: "RULE-BSRS-001",
    title: "BSRS authoring function allow-list",
    rule_class: "mechanical",
    status: "planned_validator",
    deliverables: ["BSRS / BCV"],
    governing_references: ["reference/BSRS functions.txt"],
    input_artifacts: ["BSRS expression/config files"],
    output_artifacts: ["BSRS validation report"]
  },
  {
    id: "RULE-BSRS-002",
    title: "BSRS/BCV config template shape",
    rule_class: "mechanical",
    status: "planned_generator",
    deliverables: ["BSRS / BCV"],
    governing_references: ["reference/sample-bsrs-statement-config.txt", "reference/sample-bsrs-baseData-config.txt", "reference/DD.csv"],
    input_artifacts: ["DEL data", "V1 outputs", "letter variable mappings"],
    output_artifacts: ["bsrs-bcv-letter-config.artifact.json"]
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
    prompt: "Start or confirm the case identity, key dates, staff, plan status, and document registry.",
    uploadAction: "Upload PlanMetadata JSON",
    manualAction: "Enter or edit metadata manually",
    programmedAction: "Validate and save PlanMetadata",
    warnings: ["Without metadata, other modules cannot create reliable manifests."]
  },
  {
    id: "inputs",
    title: "Inputs Matrix",
    phase: "Planning",
    route: "#/inputs",
    readinessKeys: ["metadata"],
    prompt: "Review which pure inputs, upstream outputs, and governing references are needed for each deliverable.",
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
    alternateRoute: "#/r5-builder",
    readinessKeys: ["metadata", "r5"],
    prompt: "Create or load the R5 summary from plan documents, amendments, SPDs, CBAs, and manual citations.",
    uploadAction: "Upload R5 JSON or Plan Summary DOCX template",
    manualAction: "Use R5 Builder or manual provision review",
    programmedAction: "Generate Plan Summary or load R5 into case state",
    warnings: ["Ambiguous provisions should remain unknown/na until reviewed."]
  },
  {
    id: "data-elements",
    title: "DEL",
    phase: "Upfront Work",
    route: "#/del",
    readinessKeys: ["metadata", "r5", "data-elements"],
    prompt: "Package participant/census/payee source data against DD.csv and source-priority notes.",
    uploadAction: "Upload DEL/census/source files",
    manualAction: "Document missing participant fields and source assumptions",
    programmedAction: "Generate DEL input package",
    warnings: ["No PII should be stored in repo fixtures; use browser upload only."]
  },
  {
    id: "plan-factors",
    title: "Plan Factors",
    phase: "Upfront Work",
    route: "#/factors",
    readinessKeys: ["metadata", "r5", "plan-factors"],
    prompt: "Package or derive plan factor inputs from R5 provisions and factor source material.",
    uploadAction: "Upload factor tables/workpapers",
    manualAction: "Enter cited factor assumptions where files are unavailable",
    programmedAction: "Generate PF input package",
    warnings: ["Do not invent factors; unknown factors remain unknown/na."]
  },
  {
    id: "section-436",
    title: "436",
    phase: "Upfront Work",
    route: "#/436",
    readinessKeys: ["metadata", "r5", "section-436"],
    prompt: "Package 436 limitation evidence, freeze amendments, AFTAP/CBA facts, and memo notes.",
    uploadAction: "Upload 436 references/amendments",
    manualAction: "Enter AFTAP/CBA/freeze facts with citations",
    programmedAction: "Generate 436 input package",
    warnings: ["436 applicability conclusions require review before final use."]
  },
  {
    id: "estimated-analyses",
    title: "Estimated Analyses",
    phase: "Estimated Work",
    route: "#/estimated-adjustments",
    alternateRoute: "#/estimated-administration",
    readinessKeys: ["metadata", "r5", "estimated-benefit-adjustments", "estimated-benefit-administration"],
    prompt: "Prepare estimated benefit adjustment and administration packages from payment, payee, and operational data.",
    uploadAction: "Upload payment/admin extracts",
    manualAction: "Record payment history gaps and operational notes",
    programmedAction: "Generate adjustment/admin packages",
    warnings: ["Payment history gaps should be called out explicitly."]
  },
  {
    id: "v1",
    title: "V1",
    phase: "Actuarial Work",
    route: "#/v1-engine-explorer",
    alternateRoute: "#/v1-audit",
    readinessKeys: ["metadata", "r5", "v1"],
    prompt: "Import approved V1 summaries, rank candidates, select one, and audit reconstruction assumptions.",
    uploadAction: "Upload approved V1Summary JSON files",
    manualAction: "Review candidate suitability and reconstruction warnings",
    programmedAction: "Rank V1 candidates and export audit JSON",
    warnings: ["Similarity is advisory; selected V1 requires actuarial review."]
  },
  {
    id: "bsrs-bcv",
    title: "BSRS / BCV",
    phase: "Statements",
    route: "#/letters-bcv",
    readinessKeys: ["metadata", "r5", "data-elements", "v1", "letters-bcv-config"],
    prompt: "Package letter templates, BSRS configs, BCV fields, and variable mappings for statement generation.",
    uploadAction: "Upload templates/configs/mappings",
    manualAction: "Review letter variables and missing BCV fields",
    programmedAction: "Generate BSRS/BCV config package",
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
      <p class="muted">Use Case Guide as the primary workflow. It walks through Metadata, Inputs Matrix, R5, DEL, PF, 436, Estimated Analyses, V1, and BSRS/BCV with warnings instead of hard blocks.</p>
      <div class="button-row">
        <button class="primary" data-dashboard-route="#/guide">Open Case Guide</button>
        <button class="ghost" data-dashboard-route="#/v1-engine-explorer">Open V1 Explorer</button>
        <button class="ghost" data-dashboard-route="#/v1-audit">Audit V1 Match</button>
        <button class="ghost" data-dashboard-route="#/inputs">Review Inputs Matrix</button>
        <button class="ghost" data-dashboard-route="#/rules">Rules Registry</button>
        <button class="ghost" data-dashboard-route="#/r5-builder">Open R5 Builder</button>
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
        <button class="ghost" data-guide-route="#/inputs">Inputs Matrix</button>
        <button class="ghost" data-guide-route="#/rules">Rules Registry</button>
      </div>
    </section>

    ${planContextHtml()}

    ${renderWorkflowStatePanel({ title: "Shared Case Inputs" })}

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
    deliverables: buildInputRequirementRows().map((item) => ({
      id: item.id,
      title: item.title,
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
        <h2>Rules Registry</h2>
        <p>Reference-derived control map for what the workbench can program, what needs LLM extraction, and what requires human review.</p>
      </div>
      <div class="page-actions">
        <button class="primary" id="download_rules_registry">Download rules-registry.json</button>
      </div>
    </section>

    ${planContextHtml()}

    <div class="rules-summary-grid">
      <div><span>Mechanical</span><b>${escapeHtml(String(counts.mechanical ?? 0))}</b><small>Programable validators/generators</small></div>
      <div><span>LLM-assisted</span><b>${escapeHtml(String(counts.llm_assisted ?? 0))}</b><small>Extraction/normalization tasks</small></div>
      <div><span>Human review</span><b>${escapeHtml(String(counts.human_review ?? 0))}</b><small>Ambiguity and approval decisions</small></div>
    </div>

    <div class="banner subtle">
      This registry is the implementation roadmap. Mechanical rules should become code and tests. LLM-assisted rules should become scraper prompts and schemas. Human-review rules should become explicit approval gates.
    </div>

    <div class="rules-registry-list">
      ${rulesRegistry.map(renderRuleCard).join("")}
    </div>

    <pre id="rules_registry_status" class="code" style="margin-top:12px;"></pre>
  `;

  hydratePlanContext(container);

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
        <h2>Inputs Matrix</h2>
        <p>Pure inputs, derived upstream outputs, and governing references for the minimum PBGC deliverables.</p>
      </div>
      <div class="page-actions">
        <button class="primary" id="download_inputs_matrix">Download requirements JSON</button>
        <button class="ghost" id="open_rules_registry">Open Rules Registry</button>
      </div>
    </section>

    ${planContextHtml()}

    ${renderWorkflowStatePanel({ title: "Shared Case Inputs" })}

    <div class="banner subtle">
      Pure inputs are raw case facts or files you must provide or enter manually. Upstream outputs are workbench artifacts that can be derived after earlier modules run.
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

function renderR5Builder(container) {
  container.innerHTML = `
    <section class="page-hero">
      <div class="page-title">
        <h2>R5 Builder</h2>
        <p>Embedded legacy R5 builder (offline via srcdoc).</p>
      </div>
      <div class="page-actions">
        <button class="icon-button help" id="toggle_instructions" aria-label="Toggle instructions" data-help="Show quick instructions">i</button>
      </div>
    </section>

    ${planContextHtml()}

    ${renderWorkflowStatePanel({ title: "Shared Case Inputs", keys: ["metadata", "r5"] })}

    <div class="banner subtle">Legacy embedded tool: use it to produce R5 JSON, then return to Dashboard or V1 Explorer for the integrated workflow.</div>

    <div id="instructions_backdrop" class="drawer-backdrop"></div>
    <aside class="drawer-panel drawer-left" id="instructions_panel">
      <div class="drawer-header">
        <div class="drawer-title">How To Use This Module</div>
        <button class="icon-button" id="close_instructions" aria-label="Close instructions">x</button>
      </div>
      <div class="drawer-body">
        <ol class="instruction-list">
          <li>Use the embedded legacy builder to produce R5 JSON.</li>
          <li>Export the JSON and use it in downstream modules.</li>
        </ol>
      </div>
    </aside>

    <iframe
      title="Legacy R5 Builder"
      class="legacy-frame"
      srcdoc="${escapeHtml(legacyR5SrcDoc)}"
      loading="eager"
    ></iframe>
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

function getPlanValue(planMetadata, key) {
  return planMetadata?.plan?.[key]?.value ?? "";
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
            <li>Upload the Plan Summary DOCX template and R5 JSON.</li>
            <li>Generate the filled DOCX and download the manifest.</li>
          </ol>
        </div>
      </aside>

      <div class="alert error">Load Plan Metadata first.</div>
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
    return;
  }

  const planName = getPlanValue(state.planMetadata, "plan_name");
  const caseNo = state.planMetadata?.meta?.case_number?.value ?? "";

  container.innerHTML = `
    <section class="page-hero">
      <div class="page-title">
        <h2>Plan Summary</h2>
        <p><b>Case:</b> ${escapeHtml(planName)} (Case ${escapeHtml(caseNo)})</p>
      </div>
      <div class="page-actions">
        <button class="icon-button help" id="toggle_instructions" aria-label="Toggle instructions" data-help="Show quick instructions">i</button>
      </div>
    </section>

    ${planContextHtml()}

    ${renderWorkflowStatePanel({ title: "Shared Case Inputs", keys: ["metadata", "r5"] })}

    <div id="instructions_backdrop" class="drawer-backdrop"></div>
    <aside class="drawer-panel drawer-left" id="instructions_panel">
      <div class="drawer-header">
        <div class="drawer-title">How To Use This Module</div>
        <button class="icon-button" id="close_instructions" aria-label="Close instructions">x</button>
      </div>
      <div class="drawer-body">
        <ol class="instruction-list">
          <li>Upload the Plan Summary DOCX template and R5 JSON.</li>
          <li>Generate the filled DOCX and download the manifest.</li>
        </ol>
      </div>
    </aside>

    <div class="card">
      <div class="input-checklist">
        <b>Required inputs</b>
        <ul>
          <li>Saved PlanMetadata</li>
          <li>Plan Summary DOCX template</li>
          <li>R5 JSON</li>
        </ul>
      </div>
      <div class="grid two">
        <div>
          <label><b>Plan Summary DOCX template</b></label><br/>
          <input id="ps_docx" type="file" accept=".docx" />
          <div id="ps_docx_name" class="meta-line"></div>
        </div>

        <div>
          <label><b>R5 JSON</b></label><br/>
          <input id="ps_r5json" type="file" accept="application/json,.json" />
          <div id="ps_r5json_name" class="meta-line"></div>
        </div>
      </div>

      <div class="button-row" style="margin-top:12px;">
        <button id="ps_generate" disabled>Generate filled Plan Summary</button>
        <button id="ps_manifest" disabled class="ghost">Download manifest.json</button>
      </div>

      <pre id="ps_status" class="code" style="margin-top:12px;"></pre>
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

  const psDocx = container.querySelector("#ps_docx");
  const psJson = container.querySelector("#ps_r5json");
  const btn = container.querySelector("#ps_generate");
  const btnManifest = container.querySelector("#ps_manifest");
  const status = container.querySelector("#ps_status");

  let docxFile = null;
  let r5File = null;

  function update() {
    container.querySelector("#ps_docx_name").textContent = docxFile ? docxFile.name : "";
    container.querySelector("#ps_r5json_name").textContent = r5File ? r5File.name : "";
    btnManifest.disabled = !state.lastManifest;
    btn.disabled = !(docxFile && r5File);
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
      container.querySelector("#ps_r5json_name").textContent =
        `${r5File.name} loaded to case state (${result.profile.recognized_domains.join(", ") || "no recognized domains"})`;
    } catch (err) {
      status.textContent = `R5 case-state load warning: ${err.message}`;
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

      downloadBlob(blob, "PlanSummary.FILLED.docx");

      status.textContent =
        "DONE. Downloaded PlanSummary.FILLED.docx\n\nDOCX fill log:\n" +
        log.join("\n") +
        "\n\nManifest:\n" +
        JSON.stringify(state.lastManifest, null, 2);
    } catch (err) {
      status.textContent = "ERROR: " + err.message;
    }
  });

  btnManifest.addEventListener("click", () => {
    if (!state.lastManifest) return;
    const blob = new Blob([JSON.stringify(state.lastManifest, null, 2)], {
      type: "application/json"
    });
    downloadBlob(blob, "manifest.plan-summary.json");
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
    selectedCandidate: null
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
      diagnostics.push(`${file.name}: loaded`);
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
  const r = doc.createElementNS(W_NS, "w:r");
  const t = doc.createElementNS(W_NS, "w:t");
  t.setAttribute("xml:space", "preserve");
  t.appendChild(doc.createTextNode(String(value ?? "")));
  r.appendChild(t);
  p.appendChild(r);
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


