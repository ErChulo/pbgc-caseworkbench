# Rule transcription — Earliest PBGC Retirement Date (EPRD)

Source: `Earliest PBGC Retirement Date.pdf`, PBGC internal guidance, Corpus folder
`pbgc-the-book-of-job`. Issue date **03/27/2014**. 3 pages, 150,385 bytes.

SHA-256 of the source file:
`b10d471c380ff98036928f0b929f73c7bfeda3d839a611a705d41f4b98ce92f3`

Transcribed on 2026-11-04. Quotations are verbatim from the extracted text; the PDF was
not modified and is not committed.

## Guidance (verbatim, key passages)

> The Earliest PBGC Retirement Date (EPRD) establishes when a participant is first
> eligible to be placed in pay status by PBGC, affects the expected retirement age at
> which a participant's benefit is valued, and affects how much, if any, of a
> participant's benefit is in Priority Category 3.

> For valuation of benefits and allocation of assets, the EPRD applies to benefits in
> any plan with a Date of Plan Termination (DOPT) on or after June 1, 2002.

> For determining when participants will first be able to receive annuity benefits, the
> EPRD applies to benefits not yet in pay status as of June 1, 2002, in plans trusteed by
> PBGC on and after October 1, 1998. In plans trusteed by PBGC before October 1, 1998,
> PBGC will not apply the new age-55 rule, but, instead, will continue to apply only the
> facts-and-circumstances test.

> Earliest Annuity Date is the earliest date under plan provisions on which the
> participant could receive an immediate annuity. Earliest Annuity Date is generally
> determined based on the plan provisions in effect at the earlier of DOPT or the date
> the participant terminated employment.

> Age is age as of the last birthday unless otherwise stated or clear from context.

> If the participant's Earliest Annuity Date is on or after the date the participant
> reaches age 55, the EPRD will be the Earliest Annuity Date. However, if the
> participant's Earliest Annuity Date is before the date the participant reaches age 55,
> the EPRD will be the date the participant reaches age 55, unless PBGC determines, under
> a facts-and-circumstances test, that the participant could retire on an earlier date.
> ... EPRD will never be earlier than the participant's Earliest Annuity Date.

> When making a facts-and-circumstances determination, PBGC will consider plan
> provisions, the age at which employees customarily retire (under the plan or in the
> company or industry, as appropriate), and all other relevant factors.

The guidance also notes that EPRD does not affect PBGC guidance on annuity starting
dates, and its examples cite ERISA section 4044(a)(3)(B) as the retirement test used in
the facts-and-circumstances analysis.

## What this build implements

- The deterministic age-55 floor, using calendar arithmetic (`dateOfBirth + 55 years`,
  leap-day clamped by the shared calendar utility).
- The `Earliest Annuity Date >= age 55` branch.
- The applicability gate: a DOPT before 2002-06-01 is rejected with an explanation
  rather than valued under a rule the guidance does not apply.
- The "never earlier than the Earliest Annuity Date" constraint, enforced on any
  reviewer-supplied earlier date.

## What this build does **not** implement

- The facts-and-circumstances determination itself. The function marks the result when
  the floor governs, and accepts a reviewer-recorded earlier date only within the
  guidance's bounds. It never chooses that date.
- The pre-2002 valuation rule and the "trusteed before 1998-10-01" distinction. The
  workbench has no trusteed-date field, so those cases are refused, not guessed.
- Plan-provision derivation of the Earliest Annuity Date. The reviewer supplies it; the
  R5 provision questions are not yet evaluated.

## Open items before production use

- Independent review of this transcription against the PDF by a second reviewer.
- Confirmation of the guidance's current status (superseded/updated) at the time of use.
- A trusteed-date field and the pre-2002 rule if the office handles those cases.
