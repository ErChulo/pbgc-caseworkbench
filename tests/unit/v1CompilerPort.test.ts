import { describe, expect, it } from "vitest";
import type { V1CompilerBatch, V1CompileRequest, V1Formula } from "../../src/domain/v1/contracts";
import { compileV1FormulaBatch } from "../../src/domain/v1/formula-compiler/compile-batch";
import { parseFormula } from "../../src/domain/v1/formula-compiler/parser";
import { emitCanonicalFormula } from "../../src/domain/v1/formula-compiler/emitter";
import { excelScalarV1Policy } from "../../src/domain/v1/formula-compiler/policy";

const HASH = "a".repeat(64);
const provenance: V1Formula["provenance"] = {
  status: "approved",
  approvalId: "review-1", approvedBy: "synthetic-reviewer", reviewedAt: "2026-11-13",
  sourcePlanRules: [{ruleId:"synthetic-rule",ruleContentSha256:HASH,sourceArtifactId:"synthetic-plan",locator:"page 1"}],
  validationOracleIds: ["synthetic-independent-oracle"],
  derivationDescription:"Synthetic test; formula follows fictional plan rules.",
};
function inputs(): V1CompilerBatch {
  return {
    schemaVersion: "v1-compiler-slice-1",
    caseId: "fictional-case",
    sourceSnapshotId: "frozen-snapshot-1",
    architectureVersion: "test-v1",
    catalogFieldNames: ["SYNTH_IN","SYNTH_X","SYNTH_Y","SYNTH_Z"],
    formulas: [
      {formulaId:"F1",scenarioId:"XRD",tabName:"Separated Vesteds",cellAddress:"C2",genericField:"SYNTH_X",
        iobClassification:"O",formulaText:"=ROUND(B2*2,2)",declaredDependencies:[],provenance},
      {formulaId:"F2",scenarioId:"XRD",tabName:"Separated Vesteds",cellAddress:"D2",genericField:"SYNTH_Y",
        iobClassification:"O",formulaText:"=C2+1",declaredDependencies:["F1"],provenance},
    ],
    cellMappings: [
      {mappingId:"M1",scenarioId:"XRD",tabName:"Separated Vesteds",cellAddress:"B2",field:"SYNTH_IN",
        iobClassification:"I",formulaId:null,dataSource:{sourceType:"population",sourceTab:"Separated Vesteds",sourceField:"SYNTH_IN"}},
      {mappingId:"M2",scenarioId:"XRD",tabName:"Separated Vesteds",cellAddress:"C2",field:"SYNTH_X",
        iobClassification:"O",formulaId:"F1",dataSource:null},
      {mappingId:"M3",scenarioId:"XRD",tabName:"Separated Vesteds",cellAddress:"D2",field:"SYNTH_Y",
        iobClassification:"O",formulaId:"F2",dataSource:null},
    ],
    namedRanges: [],
  };
}
function request(batch: V1CompilerBatch=inputs()): V1CompileRequest {return {batch};}
function formula(batch: V1CompilerBatch, id: string) {return batch.formulas.find(x=>x.formulaId===id)!;}
function patchFormula(batch: V1CompilerBatch,id: string, patch: Partial<V1Formula>): V1CompilerBatch {
  return {...batch, formulas:batch.formulas.map(x=>x.formulaId===id?{...x,...patch}:x)};
}
describe("selectively ported V1 formula core",()=>{
  it("keeps the source parser canonicalization and source spans",()=>{
    const parsed=parseFormula("=IF(A1>0,ROUND(A1,2),0)",excelScalarV1Policy);
    expect(parsed.ok).toBe(true);
    if(parsed.ok)expect(emitCanonicalFormula(parsed.ast,new Map())).toBe("IF((A1>0),ROUND(A1,2),0)");
  });
  it("rejects unsupported external, dynamic array and volatile syntax",()=>{
    for(const expression of ["=A1#","=A1@","=[external.xlsx]Sheet1!A1"]){
      const parsed=parseFormula(expression,excelScalarV1Policy);
      expect(parsed.ok).toBe(false);
    }
  });
});
describe("governed V1 compilation batch",()=>{
  it("compiles mapped scalar formulas, resolves exact scenario references and orders dependencies",()=>{
    const result=compileV1FormulaBatch(request());
    expect(result.status).toBe("complete");
    expect(result.executionOrder).toEqual(["F1","F2"]);
    expect(result.compiled.map(x=>x.canonicalFormulaText)).toEqual([
      "ROUND(('Separated Vesteds'!B2*2),2)",
      "('Separated Vesteds'!C2+1)",
    ]);
    expect(result.compiled[1]?.dependencies).toEqual(["F1"]);
    expect(result.issues).toEqual([]);
  });
  it("does not allow an unapproved formula or its downstream dependent",()=>{
    const batch=patchFormula(inputs(),"F1",{provenance:{...provenance,status:"draft",approvalId:null}});
    const result=compileV1FormulaBatch(request(batch));
    expect(result.status).toBe("blocked");
    expect(result.blocked).toEqual([
      {formulaId:"F1",status:"failed",causes:[]},
      {formulaId:"F2",status:"dependency-blocked",causes:["F1"]},
    ]);
  });
  it("blocks a wrong, missing or non-dictionary field mapping",()=>{
    const batch=inputs();
    const invalid={...batch, cellMappings:batch.cellMappings.map(x=>x.mappingId==="M2"?{...x,field:"FICTIONAL_UNREGISTERED"}:x)};
    const result=compileV1FormulaBatch(request(invalid));
    expect(result.status).toBe("blocked");
    expect(result.issues.map(x=>x.code)).toContain("CELL_MAPPING_INVALID");
  });
  it("does not fabricate input mappings",()=>{
    const batch=inputs();
    const invalid={...batch,cellMappings:batch.cellMappings.map(x=>x.mappingId==="M1"?{...x,dataSource:null}:x)};
    expect(compileV1FormulaBatch(request(invalid)).issues.map(x=>x.code)).toContain("INPUT_SOURCE_MISSING");
  });
  it("requires declared dependency identities to match parsed references",()=>{
    const batch=patchFormula(inputs(),"F2",{declaredDependencies:[]});
    const result=compileV1FormulaBatch(request(batch));
    expect(result.status).toBe("partial");
    expect(result.compiled.map(x=>x.formulaId)).toEqual(["F1"]);
    expect(result.issues.map(x=>x.code)).toContain("DEPENDENCIES_MISMATCH");
  });
  it("blocks dependency cycles but permits an independent formula",()=>{
    const base=inputs();
    const batch: V1CompilerBatch = {
      ...base,
      formulas:[
        {...formula(base,"F1"),formulaText:"=D2+1",declaredDependencies:["F2"]},
        {...formula(base,"F2"),formulaText:"=C2+1",declaredDependencies:["F1"]},
        {formulaId:"F3",scenarioId:"XRD",tabName:"Separated Vesteds",cellAddress:"E2",genericField:"SYNTH_Z",
          iobClassification:"O",formulaText:"=B2*3",declaredDependencies:[],provenance},
      ],
      cellMappings:[...base.cellMappings,
        {mappingId:"M4",scenarioId:"XRD",tabName:"Separated Vesteds",cellAddress:"E2",field:"SYNTH_Z",
          iobClassification:"O",formulaId:"F3",dataSource:null}],
    };
    const result=compileV1FormulaBatch(request(batch));
    expect(result.status).toBe("partial");
    expect(result.compiled.map(x=>x.formulaId)).toEqual(["F3"]);
    expect(result.blocked.map(x=>x.status)).toEqual(["cycle-blocked","cycle-blocked"]);
  });
  it("fails closed on missing add-in authorization; permits only documented approved signature",()=>{
    const batch=patchFormula(inputs(),"F1",{formulaText:"=SYNTHFUN(B2)",declaredDependencies:[]});
    const blocked=compileV1FormulaBatch(request(batch));
    expect(blocked.issues.map(x=>x.code)).toContain("FUNCTION_NOT_ALLOWED");
    const approved=compileV1FormulaBatch({
      batch,
      addIns:{
        catalogVersion:"synthetic-1",approvalId:"review-addin-1",approvedBy:"synthetic-reviewer",approvedAt:"2026-11-13",
        functions:[{name:"SYNTHFUN",minimumArguments:1,maximumArguments:1,
          sourceArtifactId:"synthetic-addin-document",sourceLocator:"fictional page 1"}],
      },
    });
    expect(approved.status).toBe("complete");
    expect(approved.compiled[0]?.canonicalFormulaText).toBe("SYNTHFUN('Separated Vesteds'!B2)");
  });
  it("rejects unapproved add-in policy and incorrect arity",()=>{
    const batch=patchFormula(inputs(),"F1",{formulaText:"=SYNTHFUN(B2)",declaredDependencies:[]});
    const addIns={catalogVersion:"synthetic-1",approvalId:"",approvedBy:"synthetic-reviewer",approvedAt:"2026-11-13",
      functions:[{name:"SYNTHFUN",minimumArguments:2,maximumArguments:2,
        sourceArtifactId:"synthetic-addin-document",sourceLocator:"fictional page 1"}]};
    expect(compileV1FormulaBatch({batch,addIns}).issues.map(x=>x.code)).toContain("ADDIN_APPROVAL_MISSING");
    expect(compileV1FormulaBatch({batch,addIns:{...addIns,approvalId:"review-1"}}).issues.map(x=>x.code))
      .toContain("FUNCTION_ARITY_INVALID");
  });
  it("is invariant under input formula ordering",()=>{
    const batch=inputs();
    const reversed={...batch,formulas:[...batch.formulas].reverse(),cellMappings:[...batch.cellMappings].reverse()};
    expect(compileV1FormulaBatch(request(batch))).toEqual(compileV1FormulaBatch(request(reversed)));
  });
});
