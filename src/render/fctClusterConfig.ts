export interface FctClusterConfig {
  /** Idle time before flushing accumulated low ticks (ms). */
  clusterWindowMs: number;
  /** Ticks above this value show immediately without clustering. */
  clusterPerTickMax: number;
  /** Flush early when buffered sum reaches this value. */
  clusterInstantFlush: number;
}

export const DEFAULT_FCT_CLUSTER_CONFIG: FctClusterConfig = {
  clusterWindowMs: 400,
  clusterPerTickMax: 8,
  clusterInstantFlush: 15,
};

export const fctClusterConfig: FctClusterConfig = { ...DEFAULT_FCT_CLUSTER_CONFIG };

const STORAGE_KEY = 'fct_cluster_config_v1';

export function loadFctClusterConfig(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<FctClusterConfig>;
    Object.assign(fctClusterConfig, DEFAULT_FCT_CLUSTER_CONFIG, parsed);
  } catch {
    // ignore corrupt storage
  }
}

export function saveFctClusterConfig(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fctClusterConfig));
  } catch {
    // ignore quota errors
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as { __fctClusterConfig?: FctClusterConfig }).__fctClusterConfig =
    fctClusterConfig;
}
