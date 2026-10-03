export interface MonitorCheck { status: "ok" | "warn" | "fail"; detail: string }
export declare const REQUIRED_OPS_CHECKS: string[];
export declare function createMonitor(options: {
  base: string; token?: string; hook?: string; fetcher?: typeof fetch; log?: (message: string) => void;
}): {
  probe(): Promise<Record<string, MonitorCheck>>;
  tick(): Promise<Record<string, MonitorCheck>>;
  alert(message: string): Promise<boolean>;
};
