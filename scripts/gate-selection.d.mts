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
export declare function shouldUseNativeBrowserRunner(platform?: string, env?: { FLOWLINE_GATE_NATIVE_BROWSERS?: string }): boolean;

export declare const PG_MAX_CONNECTIONS: number;
export declare const PG_RESERVED_CONNECTIONS: number;
export declare const DEFAULT_POOL_MAX: number;
export declare const MIN_POOL_MAX: number;
export declare function stackConnections(stackCount: number, poolMax: number): number;
export declare function stackPoolMax(stackCount: number, options?: { maxConnections?: number; reserved?: number; defaultPool?: number; minPool?: number }): number | null;
export declare function integrationConnections(shards: number, poolMax?: number): number;
