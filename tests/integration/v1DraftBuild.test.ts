import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { sha256Hex } from "../../src/adapters/hashing/sha256";
import { compileAndBuildDraftV1 } from "../../src/app/V1DraftBuildService";
import type { V1CompilerBatch } from "../../src/domain/v1/contracts";

const HASH = "a".repeat(64);
const caseData: V1CompilerBatch = {
  schemaVersion: "v1-compiler-slice-1", caseId: "fictional-case", sourceSnapshotId:"synthetic-snapshot",
  architectureVersion:"test-v1", catalogFieldNames:["SYNTH_INPUT","SYNTH_OUTPUT"],
  namedRanges:[],
  cellMappings:[
    {mappingId:"input",scenarioId:"XRD",tabName:"Retirees",cellAddress:"B2",field:"SYNTH_INPUT",iobClassification:"I",
     dataSource:{sourceType:"population",sourceTab:"Retirees",sourceField:"SYNTH_INPUT"},formulaId:null},
    {mappingId:"output",scenarioId:"XRD",tabName:"Retirees",cellAddress:"C2",field:"SYNTH_OUTPUT",iobClassification:"O",
     dataSource:null,formulaId:"F1"},
  ],
  formulas:[{
    formulaId:"F1",scenarioId:"XRD",tabName:"Retirees",cellAddress:"C2",genericField:"SYNTH_OUTPUT",
    iobClassification:"O",formulaText:"=ROUND(B2*2,2)",declaredDependencies:[],
    provenance:{
      status:"approved",approvalId:"approved-synthetic-1",approvedBy:"synthetic-actuary",reviewedAt:"2026-11-13",
      sourcePlanRules:[{ruleId:"fictional-rule",ruleContentSha256:HASH,sourceArtifactId:"fictional-plan",locator:"section 5"}],
      validationOracleIds:["fictional-independent-oracle"],
      derivationDescription:"Two synthetic benefit units",
    },
  }],
};
const template=zipSync({
  "[Content_Types].xml":strToU8('<Types/>'),
  "xl/workbook.xml":strToU8('<workbook><sheets><sheet name="Retirees" r:id="rId1"/></sheets></workbook>'),
  "xl/_rels/workbook.xml.rels":strToU8('<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
  "xl/worksheets/sheet1.xml":strToU8('<worksheet><sheetData><row r="2"><c r="B2"><v>10</v></c><c r="C2" s="7"><v>0</v></c></row></sheetData></worksheet>'),
});
const templateDigest=async()=>sha256Hex(template.slice().buffer as ArrayBuffer);
describe("offline V1 compiler-to-template integration",()=>{
  it("compiles approved formulas, hashes the input template and emits only a review-required workbook",async()=>{
    const result=await compileAndBuildDraftV1({
      compilerInput:{batch:caseData},template,expectedTemplateSha256:await templateDigest(),
      requiredSheetNames:["Retirees"],
    });
    expect(result.status).toBe("draft-review-required");
    if(result.status!=="draft-review-required")return;
    expect(result.compiler.status).toBe("complete");
    expect(result.modifiedCells).toEqual(["RETIREES!C2"]);
    expect(result.workbookSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.requiredExternalChecks).toEqual(expect.arrayContaining([expect.stringMatching(/BCV/)]));
    const out=unzipSync(result.workbook);
    expect(strFromU8(out["xl/worksheets/sheet1.xml"]!))
      .toContain('<c r="C2" s="7"><f>ROUND((&apos;Retirees&apos;!B2*2),2)</f></c>');
  });
  it("fails if the supplied template hash differs from the reviewed version",async()=>{
    const result=await compileAndBuildDraftV1({
      compilerInput:{batch:caseData},template,expectedTemplateSha256:"0".repeat(64),
      requiredSheetNames:["Retirees"],
    });
    expect(result.status).toBe("blocked");
    if(result.status==="blocked")expect(result.reasons.join(" ")).toMatch(/SHA-256/);
  });
  it("does not export a workbook from a revoked formula",async()=>{
    const batch:V1CompilerBatch={...caseData,formulas:caseData.formulas.map(f=>({
      ...f,provenance:{...f.provenance,status:"revoked",approvalId:null},
    }))};
    const result=await compileAndBuildDraftV1({
      compilerInput:{batch},template,expectedTemplateSha256:await templateDigest(),
      requiredSheetNames:["Retirees"],
    });
    expect(result.status).toBe("blocked");
    if(result.status==="blocked")expect(result.compiler?.issues.map(x=>x.code)).toContain("FORMULA_NOT_APPROVED");
  });
});
