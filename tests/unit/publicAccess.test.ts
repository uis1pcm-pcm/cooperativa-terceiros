import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({ state: {
  tokens: new Map<string, Record<string, unknown>>(),
  folders: new Map<string, Record<string, unknown>>(),
  services: new Map<string, Record<string, unknown>>(),
} }));

vi.mock("@/lib/d1/runtime", () => ({ getD1: () => ({
  prepare: (sql: string) => ({
    values: [] as unknown[],
    bind(...values: unknown[]) { this.values = values; return this; },
    async first() {
      if (sql.includes("FROM access_tokens")) return state.tokens.get(String(this.values[0])) ?? null;
      if (sql.includes("FROM package_folders")) return state.folders.get(String(this.values[0])) ?? null;
      if (sql.includes("FROM services")) return state.services.get(String(this.values[0])) ?? null;
      return null;
    },
    async all() {
      if (!sql.includes("FROM services")) return { success: true, results: [] };
      return { success: true, results: this.values.flatMap((id) => {
        const row = state.services.get(String(id));
        return row ? [row] : [];
      }) };
    },
    async run() { return { success: true, results: [] }; },
  }),
}) }));

import { requireServiceAccess } from "@/lib/public-access";

const service = (id: string, companyId: string) => ({ id, os: "OS-1", oc: null, code: null, tag: null,
  equipment_name: null, sector: null, planned_start: 1, planned_end: 2, total_hours: 10, description: null,
  status: "open", progress: 0, company_id: companyId, company_name: null, cnpj: null, package_id: null,
  previous_progress: null, has_checklist: 0, checklist_json: "[]", planned_daily_json: null, import_key: null,
  created_at: 1, updated_at: 1 });

describe("public access D1", () => {
  beforeEach(() => { state.tokens.clear(); state.folders.clear(); state.services.clear(); });

  it("allows a folder token to access an explicitly linked service", async () => {
    state.tokens.set("FOLDER-TOKEN", { token_code: "FOLDER-TOKEN", target_type: "folder", target_id: "folder-1", company_id: "empresa-a", package_id: null, active: 1, status: "active", expires_at: null });
    state.folders.set("folder-1", { id: "folder-1", package_id: "p1", name: "Pasta", company_id: "empresa-a", service_ids_json: '["service-1"]', token_code: "FOLDER-TOKEN", created_at: 1, updated_at: 1, token_created_at: 1 });
    state.services.set("service-1", service("service-1", "empresa-legada-diferente"));
    await expect(requireServiceAccess("folder-token", "service-1")).resolves.toMatchObject({ folderId: "folder-1", service: { id: "service-1" } });
  });

  it("keeps company validation for direct service tokens", async () => {
    state.tokens.set("SERVICE-TOKEN", { token_code: "SERVICE-TOKEN", target_type: "service", target_id: "service-1", company_id: "empresa-a", package_id: null, active: 1, status: "active", expires_at: null });
    state.services.set("service-1", service("service-1", "empresa-b"));
    await expect(requireServiceAccess("service-token", "service-1")).rejects.toMatchObject({ status: 403, message: "Token não possui acesso a este serviço" });
  });
});
