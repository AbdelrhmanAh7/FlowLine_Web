export interface SpecGroup { description?: string; specs: string[] }
export const SPEC_DIR: string;
export const SPEC_SUFFIX: string;
export const GROUPS: Record<string, SpecGroup>;
export const STEP_ALIASES: Record<string, string[]>;
export function groupFiles(groups: Record<string, SpecGroup>, name: string): string[];
export function listSpecFiles(dir?: string): string[];
export function checkManifest(groups?: Record<string, SpecGroup>, onDisk?: string[]): string[];
export function resolveGroups(names: string[], groups?: Record<string, SpecGroup>): { groups: string[]; files: string[] };
export function expandSteps(names: string[]): string[];
