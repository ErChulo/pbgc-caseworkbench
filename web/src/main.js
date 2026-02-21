// web/src/main.js
import "./style.css";

import Ajv from "ajv";
import planMetadataSchema from "./planMetadata.schema.json";

// ---- version (temporary; we will move to shared file next) ----
const APP_VERSION = "0.7.0";

const ajv = new Ajv({ allErrors: true, strict: false });
const validatePlanMetadata = ajv.compile(planMetadataSchema);

// ---- simple global state ----
const state = {
  appVersion: APP_VERSION,
  planMetadata: null,
  lastManifest: null,
  lastError: null,
};

// ---- hash router ----
const routes = [
  { path: "#/metadata", title: "Metadata", render: renderMetadata },
  { path: "#/audit", title: "Audit", render: renderAudit },
];

function setRoute(path) {
  if (location.hash !== path) location.hash = path;
}

function currentRoute() {
  const h = location.hash || "#/metadata";
  return routes.find((r) => r.path === h) ?? routes[0];
}

// ---- UI shell ----
function renderShell() {
  const app = document.querySelector("#app");
  const nav = routes
    .map(
      (r) => `<button data-route="${r.path}" style="margin-right:8px;">${r.title}</button>`
    )
    .join("");

  app.innerHTML = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 16px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          ${nav}
        </div>
        <div style="opacity:0.7;">v${state.appVersion}</div>
      </div>
      <hr style="margin:12px 0;" />
      <div id="page"></div>
    </div>
  `;

  app.querySelectorAll("button[data-route]").forEach((btn) => {
    btn.addEventListener("click", () => setRoute(btn.dataset.route));
  });
}

function render() {
  renderShell();
  const page = document.querySelector("#page");
  const route = currentRoute();
  route.render(page);
}

// ---- Metadata page ----
function renderMetadata(container) {
  const pm = state.planMetadata ?? {
    case: { plan_name: "", case_number: "", dopt: "" },
    documents: [],
    dependent_fields: {},
  };

  container.innerHTML = `
    <h2>Plan Metadata</h2>

    ${state.lastError ? `<pre style="background:#fee; color:#900; padding:12px; border-radius:8px; white-space:pre-wrap;">${escapeHtml(state.lastError)}</pre>` : ""}

    <div style="display:grid; grid-template-columns: 160px 1fr; gap:8px; max-width: 720px;">
      <label>Plan name</label>
      <input id="plan_name" value="${escapeHtml(pm.case.plan_name ?? "")}" />

      <label>Case number</label>
      <input id="case_number" value="${escapeHtml(String(pm.case.case_number ?? ""))}" />

      <label>DOPT</label>
      <input id="dopt" placeholder="MM/DD/YYYY" value="${escapeHtml(pm.case.dopt ?? "")}" />
    </div>

    <div style="margin-top:12px;">
      <button id="save">Save metadata</button>
      <button id="export" style="margin-left:8px;">Download metadata.json</button>
      <label style="margin-left:12px;">
        <input id="import" type="file" accept="application/json" style="display:none;" />
        <button id="importBtn">Upload metadata.json</button>
      </label>
    </div>

    <pre style="margin-top:12px; background:#111; color:#eee; padding:12px; border-radius:8px; overflow:auto;">
${escapeHtml(JSON.stringify(pm, null, 2))}
    </pre>
  `;

  container.querySelector("#save").addEventListener("click", () => {
    const plan_name = container.querySelector("#plan_name").value.trim();
    const case_number = container.querySelector("#case_number").value.trim();
    const dopt = container.querySelector("#dopt").value.trim();

    state.planMetadata = {
      ...pm,
      case: { ...pm.case, plan_name, case_number, dopt },
    };
    state.lastManifest = {
      app_version: state.appVersion,
      module: "metadata",
      generated_at_utc: new Date().toISOString(),
    };
    render();
  });

  container.querySelector("#export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.planMetadata ?? pm, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, "plan-metadata.json");
  });

  container.querySelector("#importBtn").addEventListener("click", () => {
    container.querySelector("#import").click();
  });

  container.querySelector("#import").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      state.lastError = `Invalid JSON: ${err.message}`;
      render();
      return;
    }

    const ok = validatePlanMetadata(parsed);
    if (!ok) {
      state.lastError =
        "Metadata schema validation failed:\n" +
        validatePlanMetadata.errors.map(e => `- ${e.instancePath || "/"} ${e.message}`).join("\n");
      render();
      return;
    }

    state.lastError = null;
    state.planMetadata = parsed;
    state.lastManifest = {
      app_version: state.appVersion,
      module: "metadata",
      generated_at_utc: new Date().toISOString(),
      input_file: f.name
    };
    render();
  });
}

// ---- Audit page ----
function renderAudit(container) {
  container.innerHTML = `
    <h2>Audit / Manifest</h2>
    <p>Last action manifest:</p>
    <pre style="background:#111; color:#eee; padding:12px; border-radius:8px; overflow:auto;">
${escapeHtml(JSON.stringify(state.lastManifest ?? { note: "No actions yet." }, null, 2))}
    </pre>
  `;
}

// ---- utilities ----
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

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---- boot ----
window.addEventListener("hashchange", render);
if (!location.hash) location.hash = "#/metadata";
render();