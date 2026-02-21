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
  { path: "#/plan-summary", title: "Plan Summary", render: renderPlanSummary },
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

async function sha256Hex(file) {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const bytes = Array.from(new Uint8Array(hashBuf));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderPlanSummary(container) {
  if (!state.planMetadata) {
    container.innerHTML = `<h2>Plan Summary</h2><p style="color:#900;">Load Plan Metadata first.</p>`;
    return;
  }

  const planName = state.planMetadata?.case?.plan_name ?? "";
  const caseNo = state.planMetadata?.case?.case_number ?? "";

  container.innerHTML = `
    <h2>Plan Summary</h2>
    <p><b>Case:</b> ${escapeHtml(planName)} (Case ${escapeHtml(caseNo)})</p>

    <div style="margin-top:12px; display:grid; gap:10px; max-width: 720px;">
      <div>
        <label><b>Plan Summary DOCX template</b></label><br/>
        <input id="ps_docx" type="file" accept=".docx" />
        <div id="ps_docx_name" style="opacity:0.7; margin-top:4px;"></div>
      </div>

      <div>
        <label><b>R5 JSON</b></label><br/>
        <input id="ps_r5json" type="file" accept="application/json,.json" />
        <div id="ps_r5json_name" style="opacity:0.7; margin-top:4px;"></div>
      </div>

      <div>
        <button id="ps_generate" disabled>Generate filled Plan Summary (stub)</button>
<button id="ps_manifest" disabled style="margin-left:8px;">Download manifest.json</button>
        <div style="opacity:0.7; margin-top:6px;">
          (Next step will actually fill the DOCX. For now we just validate inputs and create a manifest.)
        </div>
      </div>

      <pre id="ps_status" style="background:#111; color:#eee; padding:12px; border-radius:8px; overflow:auto; white-space:pre-wrap;"></pre>
    </div>
  `;

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
      JSON.parse(r5Text); // basic sanity check

      // minimal manifest stub (we’ll add hashing next)
      const [docxHash, r5Hash] = await Promise.all([
        sha256Hex(docxFile),
        sha256Hex(r5File),
      ]);

      state.lastManifest = {
        app_version: state.appVersion,
        module: "plan-summary",
        generated_at_utc: new Date().toISOString(),
        plan_metadata: {
          plan_name: planName,
          case_number: caseNo
        },
        input_hashes: {
          [docxFile.name]: docxHash,
          [r5File.name]: r5Hash
        }
      };
      status.textContent =
        "OK. Inputs loaded.\n\nNext: implement DOCX fill + download.\n\nManifest:\n" +
        JSON.stringify(state.lastManifest, null, 2);
    } catch (err) {
      status.textContent = "ERROR: " + err.message;
    }
  }

  );

  btnManifest.addEventListener("click", () => {
    if (!state.lastManifest) return;
    const blob = new Blob([JSON.stringify(state.lastManifest, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, "manifest.plan-summary.json");
  });

  update();
}

// ---- boot ----
window.addEventListener("hashchange", render);
if (!location.hash) location.hash = "#/metadata";
render();