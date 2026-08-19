import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePcmUser: vi.fn(),
  getServiceEditorData: vi.fn(),
  patchServiceForEditor: vi.fn(),
  patchServiceUpdateForEditor: vi.fn(),
}));

vi.mock("@/app/api/management/tokens/_lib/auth", () => {
  class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
  return { HttpError, requirePcmUser: mocks.requirePcmUser };
});
vi.mock("@/lib/d1/serviceEditor", () => ({
  getServiceEditorData: mocks.getServiceEditorData,
  patchServiceForEditor: mocks.patchServiceForEditor,
  patchServiceUpdateForEditor: mocks.patchServiceUpdateForEditor,
}));
vi.mock("@/lib/repo/services", () => ({ deleteService: vi.fn() }));

import { GET, PATCH } from "@/app/api/pcm/servicos/[serviceId]/route";
import { PATCH as PATCH_UPDATE } from "@/app/api/pcm/servicos/[serviceId]/updates/[updateId]/route";
import { HttpError } from "@/app/api/management/tokens/_lib/auth";

const context = (serviceId = "svc") => ({ params: Promise.resolve({ serviceId }) });
const request = (method: string, body?: unknown, authenticated = true) => new Request("http://localhost/api/pcm/servicos/svc", {
  method,
  headers: authenticated ? { authorization: "Bearer test", "content-type": "application/json" } : { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

describe("service editor API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePcmUser.mockResolvedValue({ uid: "pcm", email: "pcm@example.com" });
    mocks.getServiceEditorData.mockResolvedValue({ service: { id: "svc" }, packages: [], updates: [] });
    mocks.patchServiceForEditor.mockResolvedValue({ updatedAt: 2, progress: 10 });
    mocks.patchServiceUpdateForEditor.mockResolvedValue(true);
  });

  it("loads an authenticated editor snapshot", async () => {
    const response = await GET(request("GET"), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, service: { id: "svc" } });
  });

  it("rejects unauthenticated access", async () => {
    mocks.requirePcmUser.mockRejectedValue(new HttpError(401, "Authorization header ausente"));
    const response = await GET(request("GET", undefined, false), context());
    expect(response.status).toBe(401);
  });

  it("returns 404 for an unknown service", async () => {
    mocks.getServiceEditorData.mockResolvedValue({ service: null, packages: [], updates: [] });
    expect((await GET(request("GET"), context("missing"))).status).toBe(404);
  });

  it("patches one field without manufacturing unrelated fields", async () => {
    const response = await PATCH(request("PATCH", { equipmentName: "Motor" }), context());
    expect(response.status).toBe(200);
    expect(mocks.patchServiceForEditor).toHaveBeenCalledWith("svc", { equipmentName: "Motor" });
  });

  it("validates and patches several canonical fields", async () => {
    const body = { os: "OS-2", equipmentName: "Bomba", sector: "Utilidades", companyId: "c1", companyName: "Empresa", plannedStart: 10, plannedEnd: 20, totalHours: 8 };
    expect((await PATCH(request("PATCH", body), context())).status).toBe(200);
    expect(mocks.patchServiceForEditor).toHaveBeenCalledWith("svc", body);
  });

  it.each([
    [{ extra: true }],
    [{ progress: 101 }],
    [{ plannedStart: 20, plannedEnd: 10 }],
    [{ status: "Encerrado" }],
    [{ checklist: [{ id: "a", description: "A", weight: 50 }] }],
  ])("rejects an invalid payload %#", async (body) => {
    expect((await PATCH(request("PATCH", body), context())).status).toBe(400);
    expect(mocks.patchServiceForEditor).not.toHaveBeenCalled();
  });

  it("supports progress, conclusion, reopening and checklist patches", async () => {
    for (const body of [
      { progress: 42 },
      { status: "concluded" },
      { status: "pending" },
      { checklist: [{ id: "a", description: "Geral", weight: 100 }] },
    ]) {
      expect((await PATCH(request("PATCH", body), context())).status).toBe(200);
    }
    expect(mocks.patchServiceForEditor).toHaveBeenCalledTimes(4);
  });

  it("edits an authenticated update without changing its creation order", async () => {
    const response = await PATCH_UPDATE(request("PATCH", { reportDate: 1000, percent: 55 }), {
      params: Promise.resolve({ serviceId: "svc", updateId: "upd" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.patchServiceUpdateForEditor).toHaveBeenCalledWith("svc", "upd", { reportDate: 1000, percent: 55 });
  });

  it("rejects an invalid update percentage", async () => {
    const response = await PATCH_UPDATE(request("PATCH", { reportDate: 1000, percent: 200 }), {
      params: Promise.resolve({ serviceId: "svc", updateId: "upd" }),
    });
    expect(response.status).toBe(400);
  });
});
