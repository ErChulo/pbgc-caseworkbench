
import "./style.css";

import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import r5BuilderLegacyHtml from "./legacy/r5-builder.v0.7.9.html?raw";
import logoSvg from "./assets/logo.svg?raw";
import metadataScraperPrompt from "./assets/metadata-scraper-prompt.txt?raw";

import Ajv from "ajv";
import planMetadataSchema from "./planMetadata.schema.json";

const APP_VERSION = "0.7.0";

const ajv = new Ajv({ allErrors: true, strict: false });
const validatePlanMetadata = ajv.compile(planMetadataSchema);

const state = {
  appVersion: APP_VERSION,
  planMetadata: null,
  planMetadataApproved: false,
  lastManifest: null,
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
        lastManifest: state.lastManifest
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
  state.lastError = null;
  localStorage.removeItem(STORAGE_KEY);
}

const routes = [
  { path: "#/metadata", title: "Metadata", render: renderMetadata },
  { path: "#/r5-builder", title: "R5 Builder", render: renderR5Builder },
  { path: "#/plan-summary", title: "Plan Summary", render: renderPlanSummary },
  { path: "#/audit", title: "Audit", render: renderAudit }
];

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
  if (!ready && route.path !== "#/metadata") {
    route = routes[0];
    setRoute(route.path);
  }
  document.querySelectorAll("button[data-route]").forEach((btn) => {
    const isMeta = btn.dataset.route === "#/metadata";
    btn.disabled = !ready && !isMeta;
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

function defaultPlanMetadata() {
  const empty = { value: "unknown", citations: [] };
  return {
    schema_version: "0.7.0",
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
          <div id="required_status" class="meta-line"></div>
          <div id="required_list" class="required-list"></div>
        </div>
        <div class="button-row" style="margin-top:0;">
          <button id="toggle_citations" class="ghost">Show citations</button>
        </div>
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
  const requiredList = container.querySelector("#required_list");

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
    const json = parseEditorOrNull();
    if (!json) {
      requiredStatus.textContent = "Paste or upload JSON to evaluate required fields.";
      requiredList.innerHTML = "";
      return;
    }
    const missing = getMissingRequiredLabels(json);
    requiredStatus.textContent = missing.length
      ? `${missing.length} required fields missing.`
      : "All required fields complete.";
    requiredList.innerHTML = REQUIRED_METADATA_FIELDS.map((field) => {
      const isMissing = missing.includes(field.label);
      return `
        <div class="required-item ${isMissing ? "missing" : "ok"}">
          <span class="required-dot"></span>
          <span>${escapeHtml(field.label)}</span>
        </div>
      `;
    }).join("");
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
        return `
          <div class="manual-row">
            <div class="manual-label">${escapeHtml(field.label)} ${requiredMark}</div>
            <input data-field="${field.id}" class="manual-value" placeholder="${escapeHtml(currentValue || "value")}" value="" />
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
    for (const field of manualFields) {
      const entry = values[field.id] ?? { value: "", citations: [] };
      const val = entry.value === "" ? "unknown" : entry.value;
      if (field.target.type === "plan") {
        json.plan[field.target.key] = { value: val, citations: entry.citations ?? [] };
      } else if (field.target.type === "meta") {
        json.meta[field.target.key] = { value: val, citations: entry.citations ?? [] };
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
        : "Manual fields applied to the JSON text area.";
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
      const parsed = JSON.parse(text);
      const ok = validatePlanMetadata(parsed);
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
      editor.value = stringifyStable(parsed);
      updateRequiredChecklist();
      state.planMetadataApproved = false;
      saveStatusFocus.textContent = "";
      const missing = getMissingRequiredLabels(parsed);
      validationOutput.textContent = missing.length
        ? `Valid JSON. Missing required fields: ${missing.join(", ")}.`
        : "Valid PlanMetadata JSON.";
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
      updateRequiredChecklist();
      const ok = validatePlanMetadata(parsed);
      if (!ok) {
        validationOutput.textContent =
          "Validation errors: " +
          validatePlanMetadata.errors
            .map((err) => `${err.instancePath || "/"} ${err.message}`)
            .join("; ");
        return;
      }
      const missing = getMissingRequiredLabels(parsed);
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
      updateRequiredChecklist();
      const ok = validatePlanMetadata(parsed);
      if (!ok) {
        validationOutput.textContent =
          "Validation errors: " +
          validatePlanMetadata.errors
            .map((err) => `${err.instancePath || "/"} ${err.message}`)
            .join("; ");
        saveStatusFocus.textContent = "Fix errors before saving.";
        return;
      }
      if (!isMetadataReadyCandidate(parsed)) {
        const missing = getMissingRequiredLabels(parsed);
        validationOutput.textContent = missing.length
          ? `Missing required fields: ${missing.join(", ")}.`
          : "Please fill all required fields before saving.";
        saveStatusFocus.textContent = "Complete required fields first.";
        return;
      }
      state.planMetadata = parsed;
      state.planMetadataApproved = true;
      const hash = await sha256HexString(stringifyStable(parsed));
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
      <div class="meta-line" id="audit_hash">Plan metadata hash: (no metadata loaded)</div>
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

  psJson.addEventListener("change", (e) => {
    r5File = e.target.files?.[0] ?? null;
    update();
  });

  btn.addEventListener("click", async () => {
    status.textContent = "Reading inputs...";
    try {
      const r5Text = await r5File.text();
      const r5Obj = JSON.parse(r5Text);

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


