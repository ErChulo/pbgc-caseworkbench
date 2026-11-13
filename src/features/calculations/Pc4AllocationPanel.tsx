/** Local, unapproved PC4(A)/PC4(B) present-value allocation preview. */
import { useState, type FormEvent } from "react";
import {
  previewPc4TierAllocation,
  type Pc4AllocationPreview,
  type Pc4LiabilityInput,
} from "../../domain/calculations/pc4Allocation";
import { KeyValue, Panel, StatusPill } from "../../ui/components";

type OwnerStatus = "" | Pc4LiabilityInput["ownerStatus"];
type Row = { key:number; alias:string; ownerStatus:OwnerStatus; guaranteed:string; aggregate:string; owner:string };
const blankRow = (key:number):Row => ({ key,alias:"",ownerStatus:"",guaranteed:"",aggregate:"",owner:"" });

export function Pc4AllocationPanel({planDopt}:{planDopt?:string|undefined}) {
  const [date,setDate]=useState(planDopt ?? "");
  const [basis,setBasis]=useState("");
  const [assets,setAssets]=useState("");
  const [rows,setRows]=useState<Row[]>([blankRow(1)]);
  const [nextKey,setNextKey]=useState(2);
  const [report,setReport]=useState<Pc4AllocationPreview|null>(null);
  const [error,setError]=useState("");
  const reset=()=>{setReport(null);setError("");};
  const update=(key:number,patch:Partial<Row>)=>{
    setRows(previous=>previous.map(p=>p.key===key?{...p,...patch}:p));
    reset();
  };
  function submit(event:FormEvent) {
    event.preventDefault();
    reset();
    try {
      const result=previewPc4TierAllocation({
        valuationDate:date,liabilityBasisId:basis,
        netOfHigherPriorityCategories:true,
        assetsAvailableToPc4PV:assets,
        participants:rows.map(p=>({
          participantAlias:p.alias,
          ownerStatus:p.ownerStatus as Pc4LiabilityInput["ownerStatus"],
          tier1GuaranteedPV:p.guaranteed,
          tier1AggregateLimitPV:p.aggregate,
          tier2MajorityOwnerPV:p.owner,
          sourceRefs:[],
        })),
      });
      setReport(result);
    } catch (cause) {
      setError(cause instanceof Error?cause.message:"The input was not valid.");
    }
  }
  return (
    <Panel
      id="pc4-a-b-allocation"
      eyebrow="§4044 asset allocation · Draft"
      title="PC4(A) / Tier 1 and PC4(B) / Tier 2"
      description="Tier 1 includes guaranteed benefits and nonguaranteed amounts lost to the aggregate limit. Tier 2 includes amounts lost to the majority-owner limitation. Tier 2 can receive assets only after Tier 1 is fully funded."
      aside={<StatusPill tone="warning">Preview only · Not BCV-approved</StatusPill>}
    >
      <p className="panel-description">
        ERISA §4044(a)(4)(A)-(B), §4044(b)(3), and 29 CFR §§4044.10(e)-(f), 4044.14.
        All inputs must be net present values at the same valuation date. Do not enter monthly benefits.
      </p>
      <form className="calc-form" onSubmit={submit}>
        <div className="calc-inputs">
          <label className="stacked-field">
            <span>Allocation valuation date</span>
            <input type="date" required value={date} onChange={e=>{setDate(e.target.value);reset();}}/>
          </label>
          <label className="stacked-field">
            <span>Present-value basis identifier</span>
            <input type="text" required value={basis} placeholder="Reviewed §4044 assumption-set ID"
              onChange={e=>{setBasis(e.target.value);reset();}}/>
          </label>
          <label className="stacked-field">
            <span>Assets available after PC1-PC3 (PV dollars)</span>
            <input type="text" inputMode="decimal" required value={assets} placeholder="0.00"
              onChange={e=>{setAssets(e.target.value);reset();}}/>
            <small>Do not enter plan assets before the preceding categories.</small>
          </label>
        </div>
        <h3 className="subhead">Participant PC4 liability components</h3>
        {rows.map((row,index)=>(
          <fieldset key={row.key} className="calc-form">
            <legend>Participant {index+1}</legend>
            <div className="calc-inputs">
              <label className="stacked-field">
                <span>Participant alias (not PII)</span>
                <input type="text" required value={row.alias} onChange={e=>update(row.key,{alias:e.target.value})}/>
              </label>
              <label className="stacked-field">
                <span>Majority-owner classification</span>
                <select required value={row.ownerStatus} onChange={e=>update(row.key,{ownerStatus:e.target.value as OwnerStatus})}>
                  <option value="">Select status</option>
                  <option value="not-majority-owner">Not a majority owner</option>
                  <option value="majority-owner">Majority owner</option>
                </select>
              </label>
              <label className="stacked-field">
                <span>PC4(A): guaranteed PV</span>
                <input type="text" inputMode="decimal" required placeholder="0.00" value={row.guaranteed}
                  onChange={e=>update(row.key,{guaranteed:e.target.value})}/>
              </label>
              <label className="stacked-field">
                <span>PC4(A): aggregate-limit PV</span>
                <input type="text" inputMode="decimal" required placeholder="0.00" value={row.aggregate}
                  onChange={e=>update(row.key,{aggregate:e.target.value})}/>
              </label>
              <label className="stacked-field">
                <span>PC4(B): majority-owner PV</span>
                <input type="text" inputMode="decimal" required placeholder="0.00" value={row.owner}
                  onChange={e=>update(row.key,{owner:e.target.value})}/>
              </label>
            </div>
            <button type="button" disabled={rows.length===1} onClick={()=>{
              setRows(previous=>previous.filter(p=>p.key!==row.key));reset();
            }}>Remove participant</button>
          </fieldset>
        ))}
        <div className="button-row">
          <button type="button" onClick={()=>{
            setRows(previous=>[...previous,blankRow(nextKey)]);
            setNextKey(previous=>previous+1);reset();
          }}>Add participant</button>
          <button className="primary" type="submit">Evaluate PC4 funding</button>
        </div>
      </form>
      {error?<div className="warning-block" role="alert"><strong>Calculation blocked</strong><p>{error}</p></div>:null}
      {report?(
        <div role="region" aria-label="Unapproved PC4 funding preview" className="calc-form">
          <div className="warning-block" role="note">
            <strong>Draft calculation only.</strong>
            <p>This is not a final benefit determination or approved §4044 asset allocation.</p>
          </div>
          <dl className="key-value-list">
            <KeyValue label="PC4(A) guaranteed PV">{"$"}{report.tier1GuaranteedPV}</KeyValue>
            <KeyValue label="PC4(A) aggregate-limit PV">{"$"}{report.tier1AggregateLimitPV}</KeyValue>
            <KeyValue label="Tier 1 total PV">{"$"}{report.tier1LiabilityPV}</KeyValue>
            <KeyValue label="Tier 2 total PV">{"$"}{report.tier2MajorityOwnerPV}</KeyValue>
            <KeyValue label="Assets assigned to Tier 1">{"$"}{report.tier1FundedPV}</KeyValue>
            <KeyValue label="Assets assigned to Tier 2">{"$"}{report.tier2FundedPV}</KeyValue>
            <KeyValue label="Unfunded Tier 1 PV">{"$"}{report.tier1UnfundedPV}</KeyValue>
            <KeyValue label="Unfunded Tier 2 PV">{"$"}{report.tier2UnfundedPV}</KeyValue>
            <KeyValue label="Assets remaining for PC5">{"$"}{report.assetsRemainingForPc5PV}</KeyValue>
            <KeyValue label="Allocation stage">{report.phase}</KeyValue>
            <KeyValue label="Tier 2 funding ratio">
              {report.tier2FundingFraction
                ? report.tier2FundingFraction.numeratorCents + "/" + report.tier2FundingFraction.denominatorCents + " (exact)"
                : "Not applicable"}
            </KeyValue>
          </dl>
          <h3 className="subhead">Participant funding</h3>
          <ul className="trace-list">{report.participants.map(p=>(
            <li key={p.participantAlias}>
              <strong>{p.participantAlias}</strong>: Tier 1 liability {"$"}{p.tier1LiabilityPV};
              Tier 2 liability {"$"}{p.tier2LiabilityPV};
              Tier 1 funded {p.tier1FundedPV??"unresolved"};
              Tier 2 funded {p.tier2FundedPV ?? (p.tier2PartialShare
                ? "unrounded fraction, cents: " + p.tier2PartialShare.numeratorCentsSquared + "/" + p.tier2PartialShare.denominatorCents
                : "unresolved")}.
            </li>
          ))}</ul>
          <h3 className="subhead">Required review</h3>
          <ul className="trace-list">{report.blockers.map(item=><li key={item}>{item}</li>)}</ul>
        </div>
      ):null}
    </Panel>
  );
}
