import { describe, expect, it } from "vitest";
import { planR1Assembly } from "../../src/domain/work-products/contributions";
import { describeV1DraftForR1 } from "../../src/domain/v1/r1-draft-handoff";
import type { V1CompileReport } from "../../src/domain/v1/formula-compiler/compile-batch";

const draft: V1CompileReport = {
  status:"complete",caseId:"fictional-case",sourceSnapshotId:"synthetic-snapshot",
  policyId:"excel-scalar-v1",policyVersion:"1.0.0",
  compiled:[],blocked:[],executionOrder:[],issues:[],
};
describe("V1 contribution to R1",()=>{
  it("publishes a traceable draft but blocks its inclusion in the final R1",()=>{
    const candidate=describeV1DraftForR1(draft,{
      findingId:"draft-v1-1",caseId:"fictional-case",sourceSnapshotId:"synthetic-snapshot",
      evidence:[{sourceArtifactId:"synthetic-rules",sourceSha256:"a".repeat(64),
        sourceLocation:"page 4",imageViewerDocumentNumber:null,citeAsImageViewer:false}],
      dependsOn:[{id:"synthetic-rule",version:"test-v1"}],
      targets:[{sectionId:"3",role:"summary"}],
    });
    expect(candidate.status).toBe("draft");
    expect(candidate.approval).toBeNull();
    const planned=planR1Assembly({
      caseId:"fictional-case",
      findings:[candidate],
      availableSectionIds:["3"],
      currentSourceSnapshots:{"wp.v1-valuation-summary":"synthetic-snapshot"},
      currentDependencies:{"synthetic-rule":"test-v1"},
    });
    expect(planned.ready).toBe(false);
    expect(planned.issues.map(x=>x.code)).toContain("finding-not-approved");
    expect(planned.sections[0]?.findings).toEqual([]);
  });
  it("rejects attaching a draft to another case or snapshot",()=>{
    expect(()=>describeV1DraftForR1(draft,{
      findingId:"draft-v1-2",caseId:"different-case",sourceSnapshotId:"synthetic-snapshot",
      evidence:[],dependsOn:[],targets:[],
    })).toThrow(/unrelated case/);
  });
});
