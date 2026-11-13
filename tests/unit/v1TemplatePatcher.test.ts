import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { patchV1WorkbookTemplate } from "../../src/adapters/v1/xlsx-template-patcher";
import type { V1CompileReport } from "../../src/domain/v1/formula-compiler/compile-batch";

const HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
function zipTemplate(patch: Record<string, string> = {}): Uint8Array {
  const contents: Record<string,string> = {
    "[Content_Types].xml": HEADER + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    "xl/workbook.xml": HEADER + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Separated Vesteds" sheetId="1" r:id="rId1"/><sheet name="Summary" sheetId="2" r:id="rId2"/></sheets><definedNames><definedName name="PlanRate">Summary!$A$1</definedName></definedNames></workbook>',
    "xl/_rels/workbook.xml.rels": HEADER + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": HEADER + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="2"><c r="B2" s="4"><v>9.5</v></c><c r="C2" s="12" t="n"><f>1+1</f><v>2</v></c><c r="D2" s="12"><f>C2*2</f><v>4</v></c></row></sheetData></worksheet>',
    "xl/worksheets/sheet2.xml": HEADER + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>0.5</v></c></row></sheetData></worksheet>',
    "xl/styles.xml": '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>',
    "docProps/core.xml": '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"/>',
  };
  return zipSync(Object.fromEntries(Object.entries({...contents,...patch}).map(([k,v])=>[k,strToU8(v)])), {level:6});
}
function report(): V1CompileReport {
  return {
    status:"complete",caseId:"fictional-case",sourceSnapshotId:"synthetic-snapshot",
    policyId:"excel-scalar-v1",policyVersion:"1.0.0",
    compiled:[
      {formulaId:"F1",scenarioId:"XRD",tabName:"Separated Vesteds",cellAddress:"C2",genericField:"SYNTH_X",
        canonicalFormulaText:"ROUND(B2*2,2)",sourceFormulaText:"=ROUND(B2*2,2)",
        dependencies:[],references:[],sourceSnapshotId:"synthetic-snapshot",approvalId:"fake-review"},
      {formulaId:"F2",scenarioId:"XRD",tabName:"Separated Vesteds",cellAddress:"D2",genericField:"SYNTH_Y",
        canonicalFormulaText:"(C2<20)",sourceFormulaText:"=C2<20",
        dependencies:["F1"],references:[],sourceSnapshotId:"synthetic-snapshot",approvalId:"fake-review"},
    ],
    blocked:[],executionOrder:["F1","F2"],issues:[],
  };
}
const readZip = (blob: Uint8Array) => Object.fromEntries(
  Object.entries(unzipSync(blob)).map(([path,data])=>[path,strFromU8(data)]),
);
describe("restricted V1 XLSX template writer",()=>{
  it("patches only designated formula cells and preserves layouts, other sheets and support files",()=>{
    const template=zipTemplate();
    const original=readZip(template);
    const result=patchV1WorkbookTemplate(template,report(),["Summary","Separated Vesteds"]);
    expect(result.ok).toBe(true);
    if(!result.ok)return;
    const out=readZip(result.workbook);
    expect(result.modified).toEqual(["SEPARATED VESTEDS!C2","SEPARATED VESTEDS!D2"]);
    expect(out["xl/worksheets/sheet1.xml"]).toContain('<c r="C2" s="12"><f>ROUND(B2*2,2)</f></c>');
    expect(out["xl/worksheets/sheet1.xml"]).toContain('<c r="D2" s="12"><f>(C2&lt;20)</f></c>');
    for(const path of Object.keys(original).filter(x=>x!=="xl/worksheets/sheet1.xml")){
      expect(out[path]).toBe(original[path]);
    }
    expect(readZip(result.workbook)).toEqual(readZip(patchV1WorkbookTemplate(template,report(),["Summary"]).ok
      ? (patchV1WorkbookTemplate(template,report(),["Summary"]) as {ok:true;workbook:Uint8Array}).workbook
      : template));
  });
  it("fails when required sheet is missing",()=>{
    const result=patchV1WorkbookTemplate(zipTemplate(),report(),["UD Table"]);
    expect(result.ok).toBe(false);
    if(!result.ok)expect(result.issues[0]?.code).toBe("REQUIRED_SHEET_MISSING");
  });
  it("rejects an incomplete or partial compilation",()=>{
    const result=patchV1WorkbookTemplate(zipTemplate(),{...report(),status:"partial"});
    expect(result.ok).toBe(false);
    if(!result.ok)expect(result.issues[0]?.code).toBe("COMPILATION_NOT_COMPLETE");
  });
  it("does not invent target cells",()=>{
    const result=patchV1WorkbookTemplate(zipTemplate(),{...report(),compiled:[
      {...report().compiled[0]!,cellAddress:"Z999"}]});
    expect(result.ok).toBe(false);
    if(!result.ok)expect(result.issues[0]?.code).toBe("CELL_NOT_PATCHABLE");
  });
  it("rejects shared formula groups instead of damaging their structure",()=>{
    const original=readZip(zipTemplate());
    const sheet=original["xl/worksheets/sheet1.xml"]!.replace('<f>1+1</f>', '<f t="shared" si="1">1+1</f>');
    const result=patchV1WorkbookTemplate(zipTemplate({"xl/worksheets/sheet1.xml":sheet}),report());
    expect(result.ok).toBe(false);
    if(!result.ok)expect(result.issues[0]?.code).toBe("CELL_NOT_PATCHABLE");
  });
  it("blocks a macro-enabled workbook without stripping its VBA",()=>{
    const result=patchV1WorkbookTemplate(zipTemplate({"xl/vbaProject.bin":"synthetic-macro-placeholder"}),report());
    expect(result.ok).toBe(false);
    if(!result.ok)expect(result.issues[0]?.code).toBe("UNSUPPORTED_MACROS_OR_SIGNATURES");
  });
  it("blocks two scenario formulas targeting the same physical cell",()=>{
    const result=patchV1WorkbookTemplate(zipTemplate(),{...report(),compiled:[
      ...report().compiled, {...report().compiled[0]!,formulaId:"F3",scenarioId:"DOR"}]});
    expect(result.ok).toBe(false);
    if(!result.ok)expect(result.issues[0]?.code).toBe("DUPLICATE_TARGET");
  });
});
