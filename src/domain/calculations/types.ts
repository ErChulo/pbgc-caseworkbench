export type ProvenancedInput = {
  id: string;
  value: unknown;
  units?: string;
  provenanceIds: string[];
};

export type RoundingStep = {
  stage: string;
  mode: "half-up" | "half-even" | "floor" | "ceiling" | "truncate";
  digits: number;
};

export type CalculationResult<T> = {
  value: T;
  units: string;
  inputs: ProvenancedInput[];
  ruleIds: string[];
  assumptionSetId?: string;
  formula: string;
  intermediates: Record<string, number | string>;
  rounding: RoundingStep[];
  warnings: string[];
  engineVersion: string;
};

