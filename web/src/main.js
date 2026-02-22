// web/src/main.js
import "./style.css";

import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

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

const STORAGE_KEY = "pbgc_caseworkbench_state_v0_7";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    // Only restore safe fields (no File objects)
    state.planMetadata = saved.planMetadata ?? null;
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
        lastManifest: state.lastManifest
      })
    );
  } catch {
    // ignore
  }
}

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
    saveState()
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

function norm(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function normLabel(s) {
  return norm(s).replace(/:$/, ""); // tolerate trailing colon in labels
}

function nodeText(node) {
  const ts = node.getElementsByTagName("w:t");
  let out = "";
  for (let i = 0; i < ts.length; i++) out += ts[i].textContent ?? "";
  return out;
}

// Walk body in-order and return the first table that occurs AFTER a paragraph containing headingText
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

// Fallback: return a table that itself contains the heading text somewhere
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

  // remove existing paragraphs
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

  // --- Fill core case metadata anywhere those labels exist ---
  const c = planMetadata?.case ?? {};
  log.push(JSON.stringify(appendValueToLabelAnywhere(doc, "Plan Name", c.plan_name), null, 0));
  log.push(JSON.stringify(appendValueToLabelAnywhere(doc, "Case Number", c.case_number), null, 0));
  log.push(JSON.stringify(appendValueToLabelAnywhere(doc, "DOPT", c.dopt), null, 0));
  log.push(JSON.stringify(appendValueToLabelAnywhere(doc, "DOTR", c.dotr), null, 0));
  log.push(JSON.stringify(appendValueToLabelAnywhere(doc, "BPD", c.bpd), null, 0));

  // --- PBGC Rates blocks ---
  const lumpTbl = findRatesBlockTable(doc, "PBGC Lump Sum Rates");
  const annTbl = findRatesBlockTable(doc, "PBGC Annuity Rates");

  const lsImm = pickValue(r5Json, planMetadata, "pbgc_lump_sum_immediate_rate", [
    "pbgc lump sum immediate",
    "lump sum immediate",
  ]);
  const lsDef = pickValue(r5Json, planMetadata, "pbgc_lump_sum_deferral_rate", [
    "pbgc lump sum deferral",
    "lump sum deferral",
  ]);

  const annImm =
    pickValue(r5Json, planMetadata, "pbgc_annuity_immediate_rate", [
      "pbgc annuity immediate",
      "annuity immediate",
    ]) ||
    pickValue(r5Json, planMetadata, "pbgc_annuity_rates", ["pbgc annuity rates", "annuity rates"]);

  const annDef =
    pickValue(r5Json, planMetadata, "pbgc_annuity_deferral_rate", [
      "pbgc annuity deferral",
      "annuity deferral",
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
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    log,
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
      const r5Obj = JSON.parse(r5Text);

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
          case_number: caseNo,
        },
        input_hashes: {
          [docxFile.name]: docxHash,
          [r5File.name]: r5Hash,
        },
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
      type: "application/json",
    });
    downloadBlob(blob, "manifest.plan-summary.json");
  });

  update();
}

// ---- boot ----
window.addEventListener("hashchange", render);
if (!location.hash) location.hash = "#/metadata";
loadState();
render();