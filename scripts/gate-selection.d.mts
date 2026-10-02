export interface GateSelectionInput {
  all: string[];
  browsers: string[];
  only: string[];
  skip: string[];
  tier: string;
  browserStacks: number;
  browsersMode: string;
}

export interface GateSelection {
  selected: Set<string>;
  parallelProjects: string[];
  stackCount: number;
}

export declare function selectGateSteps(input: GateSelectionInput): GateSelection;
