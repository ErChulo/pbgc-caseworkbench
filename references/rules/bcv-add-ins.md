# BCV ATPBGC add-in functions

## Source

- File: `BCV ATPBGC (Add-ins).pdf`
- Location: `pbgc-the-book-of-job / PBGC_CASEWORK_CURATED / 02_TECHNICAL_SPECIFICATIONS / 01_BCV_Documentation`
- Drive file id: `1yODPCsCmdLW9-xkcyfDzT9nnHRODYuTX`
- SHA-256: `92d409b29c299bd50dde17502e019a7abdae00a48710890bcc08eb1a521929d5`
- 176 pages; 54 distinct functions across 12 categories
- Indexed 2026-11-04 from the PDF text layer

This is the calculation authority the V1 valuation is expected to use. The workbench
does not derive its own benefit formulas where an add-in function exists.

## Status: indexed, not implemented

Every function below is transcribed to its name, signature, one-line return, and page.
**None is implemented in the workbench yet.** A function may be used in a calculation only
after all three of these hold:

1. its full semantics, parameter validation, and error codes are transcribed from the page cited;
2. the documented example reproduces in a unit test against the implementation;
3. any database dependency is sourced and cited (see below).

### Data dependency gap

The Add-In reads interest rates, mortality, and other tables from the `BCVATPBGC` schema
of the BCV Oracle database. Those table values are not in the corpus. Functions that read
them — the PBGC interest and guaranteed-benefit families in particular — cannot be
reproduced from the current source set until the table contents, or an approved public
authority for the same values, is recorded. Until then those functions must not be
approximated.

## Categories

| Category | Functions |
| --- | --- |
| Service Functions | 13 |
| Add-in Functions | 8 |
| Guaranteed Benefit Functions | 7 |
| PBGC Interest Functions | 6 |
| ERISA Vesting Functions | 4 |
| Salary Estimation Functions | 4 |
| Retirement Date Functions | 3 |
| Social Security Administration Functions | 3 |
| Age Functions | 2 |
| Average Compensation Functions | 2 |
| Complex Parameters Common to Multiple Functions | 1 |
| XRA/XRD Functions | 1 |

## Function index

| Function | Signature | Returns (transcribed summary) | Page |
| --- | --- | --- | --- |
| `ANB` | `ANB(dob, thruDate)` | The age nearest birthday as of thruDate. | 3 |
| `ATT` | `ATT(dob, thruDate)` | The attained age at the thruDate. | 4 |
| `BFCFAEQ` | `BFCFAEQ(FromBftForm, FromSurvPct, FromMthsCert, FromMthsTemp, ToBftForm, ToSurvPct,` | The actuarially equivalent benefit form conversion factor calculated using the inputs provided. | 44 |
| `CCF` | `CCF(monthsCertain)` | The PBGC form conversion factor for a SLA to a ##C&C annuity (for the monthsCertain). Note A non-integer entry in this parameter will be used without… | 37 |
| `COMPAM` | `COMPAM(startDate, thruDate)` | The number of completed whole calendar months between the two Input dates. | 8 |
| `COMPAYM` | `COMPAYM(startDate, thruDate)` | The number of completed years and completed whole calendar months between the startDate and thruDate | 9 |
| `COMPM` | `COMPM(startDate, thruDate)` | The number of completed months between the two Input dates. | 8 |
| `COMPYM` | `COMPYM(startDate, thruDate)` | The number of completed years and months between the startDate and thruDate | 8 |
| `ERVYPA` | `SERVYPA(startDate, thruDate, planDate, hoursRequired)` | The service between the two dates, startDate and thruDate, expressed in full years using the hoursRequired, applied on a planDate basis using averaged… | 14 |
| `G515V` | `G515V(service)` | The vesting percent as a decimal for a participant with service years using the "5-15 graded" vesting schedule (25% after 5 years; 5% per year through… | 15 |
| `HAVG` | `HAVG(numberOfYears, salaryData, IgnoreZeros)` | The average of the high non-consecutive numberOfYears in the salaryData | 46 |
| `HCAVG` | `HCAVG(numberOfYears, salaryData, IgnoreZeros)` | The average of the high consecutive numberOfYears in the salaryData | 46 |
| `IIF` | `IIF(startDate, thruDate)` | The interest index factor for a stream of payments between startDate and thruDate using PBGC immediate lump-sum rates. | 23 |
| `IIR` | `IIR(interestDate)` | The interest index rate at interestDate using PBGC immediate lump-sum interest rates | 24 |
| `IIRL` | `IIRL(startDate, thruDate)` | The Lump Sum Interest factor for startDate and thruDate using PBGC immediate lump-sum interest rates | 24 |
| `INTCODE` | `02/26/2016` |  | 65 |
| `NEX` | `02/26/2016` |  | 108 |
| `NNX` | `02/26/2016` |  | 109 |
| `NNXY` | `02/26/2016` |  | 110 |
| `NPVF2` | `12/28/2020` |  | 67 |
| `NPVFSS` | `12/28/2020` |  | 80 |
| `NRD` | `NRD(dob, nra)` | The first of the month coincident with or next following nra-th birthday for an individual born on dob. | 4 |
| `NRDA` | `NRDA(dob, planDate, nra)` | The plan anniversary date nearest attainment of nra for an individual born on dob. | 4 |
| `NXY` | `02/26/2016` |  | 107 |
| `PACSIIF` | `PACSIIF(startDate, thruDate, estIndicator, lastDate)` | The PBGC interest index factor for a stream of payments between startDate and thruDate using PACS interest rates. The use of estimated rates can be sp… | 24 |
| `PACSIIR` | `PACSIIR(InterestDate, InterestRateType)` | The PBGC interest index rate at InterestDate using PACS backpayment rates. | 25 |
| `PACSIIRL` | `PACSIIRL(startDate, thruDate, estIndicator, lastDate)` | The PBGC lump sum interest rate factor for accumulating a lump sum with interest start startDate to thruDate using PACS interest rates. The use of est… | 26 |
| `PBGCERF` | `PBGCERF(monthsEarly)` | The PBGC early retirement factor for a benefit commencing at monthsEarly. Note There is a PBGCME function that can be used to compute the months early… | 16 |
| `PBGCME` | `PBGCME(DOPT, BPD, XRD, DOB, SDOB, BDOB, Nonspind, RETSTAT, ID, Disabmil)` | The months early that is required as an input to the PBGCERF function. Note The months early are computed from the 65th birthday. | 17 |
| `PBGCML` | `PBGCML(DOPT, BPD, XRD, DOB, SDOB, BDOB, Nonspind, RETSTAT, ID)` | The months late that can be added to age 65 to obtain the age that is required as an input to the PBGCLRF function. Note The months late are computed… | 23 |
| `PHASEIN` | `PHASEIN(percent, benefit)` | The phased-in benefit amount for the benefit at the phase-in percent | 54 |
| `PHASEINPCT` | `PHASEINPCT(EffectiveDate, AdoptedDate, DOPT, BPD, UCEBdate, SEPPAA)` | The phase-in percentage used to populate the percent parameter in the PHASEIN function | 54 |
| `PLANYEAR` | `PLANYEAR(lookupdate, plananniv)` | Four-Digit Plan Year The PLANYEAR function calculates the 4-digit plan year for the date specified. | 61 |
| `PPALSAVG` | `PPALSAVG(dopt, stabilityperiod, lookbackperiod, plananniv, segment, planeffectivedate)` | PPA Lump Sum Average Rate 60 The PPALSAVG function calculates the average of the 417(e) applicable interest rates (30-year treasury prior to the start… | 59 |
| `PPALSDATE` | `PPALSDATE(distdate, stabilityperiod, lookbackperiod, plananniv)` | PPA Lump Sum Date The PPALSDATE function calculates the date to use for looking up the 417(e) interest rate or the first day of the stability period c… | 58 |
| `PPALSRATE` | `PPALSRATE(distdate, stabilityperiod, lookbackperiod, plananniv, segment)` | PPA Lump Sum Rate The PPALSRATE function looks up the individual 417(e) applicable interest rates (30-year treasury prior to the start of the 2008 pla… | 59 |
| `RATETIER` | `12/28/2020` |  | 65 |
| `RETDATE` | `RETDATE(birthdate, theRA, foma, Anniv)` | Calculates a date using the inputs specified. Generally used for calculating retirement dates. | 5 |
| `SERV` | `SERV(startDate,thruDate,hoursRequirement,period,hoursPerPeriod,planAnniversary,extraDaysOptions,fo` | The service between the two dates, startDate and thruDate, calculated based on the other parameters. This function consolidates and extends the functi… | 9 |
| `SERVBA` | `SERVBA(startDate, thruDate, planDate, serviceArray)` | The service between the two dates, startDate and thruDate, expressed in years and decimals using the serviceArray, applied on a planDate basis using a… | 11 |
| `SERVBW` | `SERVBW(startDate, thruDate, planDate, serviceArray)` | The service between the two dates, startDate and thruDate, expressed in years and decimals using the serviceArray, applied on a planDate basis using 8… | 12 |
| `SERVYCA` | `SERVYCA(startDate, thruDate, hoursRequired)` | The service between the two dates, startDate and thruDate, expressed in full years using the hoursRequired, applied on a calendar basis using averaged… | 13 |
| `SERVYCP` | `SERVYCP(startDate, thruDate, hoursRequired, avgHours)` | The service between the two dates, startDate and thruDate, expressed in full years using the hoursRequired, applied on a calendar basis using user-def… | 13 |
| `SERVYCW` | `SERVYCW(startDate, thruDate, hoursRequired)` | The service between the two dates, startDate and thruDate, expressed in full years using the hoursRequired, applied on a calendar basis using 8-hour w… | 13 |
| `SERVYPP` | `SERVYPP(startDate, thruDate, planDate, hoursRequired, avgHours)` | The service between the two dates, startDate and thruDate, expressed in full years using the hoursRequired, applied on a planDate basis using user-def… | 14 |
| `SERVYPW` | `SERVYPW(startDate, thruDate, planDate, hoursRequired)` | The service between the two dates, startDate and thruDate, expressed in full years using the hoursRequired, applied on a planDate basis using 8-hour w… | 15 |
| `SESTAVG_2` | `SESTAVG_2(year_of_est, salavg, yearfrst, yearlast, planmonth, estype, intype)` | The ASD Standard Salary Estimation for year_of_est based on participant’s average compensation. This estimate for each of the calendar/plan year salar… | 35 |
| `SEST_2` | `SEST_2(year_of_est, range1, salyrind, reversesalaries)` | The ASD Standard Estimation of Missing Salary for year_of_est. The missing salary is estimated by multiplying the closest actual salary known by the r… | 34 |
| `SSACALC` | `SSACALC(Rslt, Sex, DOB, DOD, BenTp, Ntldt, BenDt, FstSlPrjYr, LstSlPrjYr, BckPrjTp, Bckprjpct, FstSlYr,` | Based on entry in the Rslt parameter. The user can specify any of the following results: Worker's Primary Insurance Amount—monthly Social Security ben… | 120 |
| `SSASAMPLE` | `SSASAMPLE(Result, ParamSource, Compyr)` | Based on entry in the Result parameter. The user can specify any of the following results: Worker’s Primary Insurance Amount - monthly Social Security… | 140 |
| `SSAVAL` | `SSAVAL(DataValue, YearValue, Source)` | Returns the data value specified (national average wage, COLA, or wage base) for the year specified from the specified source (SSA_VAL table in the AT… | 142 |
| `VERSION` | `VERSION()` | The version function returns the following for each of the identifiers listed above: OS: The operating system on the device running Excel, e.g., Windo… | 173 |
| `WAM` | `WAM(dopt, part_level_benefit, dob, sdob, end_date_certain, surv_benefit_int1, start_date_int1,` | Weighted Average Method The WAM function uses the Weighted Average Method to calculate the Survivor Percentage to be used for applying the Maximum Ins… | 56 |
| `XRD2` | `XRD2(retstat, dopt, bderd, xra, dob, foma, Anniv, dop)` | Expected Retirement Date For a retiree, XRD2 is always set to the 1st of the month on or after dopt. For all other participants, XRD2 is always set to… | 31 |

## Extraction method

Deterministic parse of the PDF text layer (`pypdf`), anchored on each `Format` heading:
the function name and its revision date precede it, the signature follows, and the return
text runs to the next `Example`, `Parameters`, or `Notes` heading. Duplicates across
revisions were collapsed by name (54 unique). Signatures are verbatim. Return summaries
can be cut by a page break, so the cited page is authoritative over this table.

