export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export interface Health {
  version: string;
  routing: { default_provider: string; roles: Record<string, string>; allow_rows: boolean; mock: boolean; providers_with_keys: string[] };
  supported_files: string[];
  datasets: number;
}

export interface DatasetMeta {
  id: string;
  name: string;
  filename: string;
  kind: string;
  created_at: string;
  tables: { name: string; columns: string[]; row_count: number }[];
  text_chunks: number;
}

export interface Finding {
  title: string;
  detail: string;
  metric?: string;
  value?: number | string | null;
  evidence: string[];
  severity: "high" | "medium" | "low";
  recommendation?: string;
  review?: string;
  reason?: string;
}

export interface ChartSpec {
  type: "bar" | "line";
  title: string;
  series: { name: string; points: { x: string; y: number }[] }[];
  evidence: string;
}

export interface RunResult {
  run_id: string;
  dataset: DatasetMeta;
  question: string | null;
  lang: "en" | "ar";
  models: Record<string, string>;
  findings: Finding[];
  rejected: Finding[];
  kpis: { label: string; value: number | string; unit?: string; evidence: string; trend?: "up" | "down" | "flat" | null }[];
  charts: ChartSpec[];
  report_md: string;
  evidence: Record<string, { tool: string; args: Record<string, unknown>; result: unknown }>;
  memory_used: { id: string; kind: string; text: string }[];
  memory_written: { id: string; kind: string; text: string }[];
  timings: Record<string, number>;
  warnings: string[];
}

export interface MemoryItem {
  id: string;
  kind: string;
  text: string;
  source?: string | null;
  created_at: string;
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.detail ?? JSON.stringify(body);
    } catch {
      /* keep statusText */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => fetch(`${API_BASE}/api/health`).then((r) => j<Health>(r)),
  datasets: () => fetch(`${API_BASE}/api/datasets`).then((r) => j<{ datasets: DatasetMeta[] }>(r)),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${API_BASE}/api/upload`, { method: "POST", body: fd }).then((r) => j<{ dataset: DatasetMeta }>(r));
  },
  analyse: (dataset_id: string, question: string, lang: "en" | "ar") =>
    fetch(`${API_BASE}/api/analyse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataset_id, question: question || null, lang }) }).then((r) => j<RunResult>(r)),
  runs: (dataset_id?: string) => fetch(`${API_BASE}/api/runs${dataset_id ? `?dataset_id=${dataset_id}` : ""}`).then((r) => j<{ runs: { id: string; dataset_id: string; question: string | null; lang: string; status: string; created_at: string }[] }>(r)),
  run: (id: string) => fetch(`${API_BASE}/api/runs/${id}`).then((r) => j<{ result: RunResult }>(r)),
  memory: () => fetch(`${API_BASE}/api/memory`).then((r) => j<{ items: MemoryItem[] }>(r)),
  remember: (kind: string, text: string) =>
    fetch(`${API_BASE}/api/memory`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, text }) }).then((r) => j<MemoryItem>(r)),
  forget: (id: string) => fetch(`${API_BASE}/api/memory/${id}`, { method: "DELETE" }).then((r) => j<{ ok: boolean }>(r)),
};
