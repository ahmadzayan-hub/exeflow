import registerJson from "@register";
import type { Portfolio } from "../types";
import { buildShowcase } from "./showcase";

export type DatasetKey = "showcase" | "register";

/** Public builds ship the fictional showcase. The private register is bundled only with VITE_DATASET=register. */
export function defaultDataset(): DatasetKey {
  const v = import.meta.env.VITE_DATASET;
  if (v === "register" || v === "showcase") return v;
  return import.meta.env.DEV && hasRegister() ? "register" : "showcase";
}

export function hasRegister(): boolean {
  return !(registerJson as { stub?: boolean }).stub;
}

export function baseFor(key: DatasetKey, now: Date = new Date()): Portfolio {
  if (key === "register" && hasRegister()) return registerJson as Portfolio;
  return buildShowcase(now);
}
