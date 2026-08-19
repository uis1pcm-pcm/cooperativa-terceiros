import type { D1Status } from "./types";

export function toMillis(value: unknown, fallback: number | null = null): number | null {
  if (value == null) return fallback;
  if (typeof value === "number" && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value;
  if (typeof value === "string") { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : fallback; }
  if (typeof value === "object") {
    const v = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof v.toMillis === "function") return v.toMillis();
    const seconds = v.seconds ?? v._seconds;
    if (typeof seconds === "number") return seconds * 1000;
  }
  return fallback;
}

export function normalizeStatus(value: unknown, progress: unknown): D1Status {
  const percent = Number(progress);
  if (Number.isFinite(percent) && percent >= 100) return "concluded";
  const status = String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (["concluido", "encerrado", "closed", "completed"].includes(status)) return "concluded";
  if (["pendente", "pending"].includes(status)) return "pending";
  return "open";
}

export function json(value: unknown, fallback: unknown = {}): string {
  return JSON.stringify(value == null ? fallback : value);
}

