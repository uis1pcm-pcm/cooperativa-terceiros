import { NextResponse } from "next/server";
import { HttpError, requirePcmUser } from "@/app/api/management/tokens/_lib/auth";
import { patchServiceUpdateForEditor } from "@/lib/d1/serviceEditor";
import { decodeRouteParam } from "@/lib/decodeRouteParam";

export async function PATCH(req: Request, context: { params: Promise<{ serviceId: string; updateId: string }> }) {
  try {
    await requirePcmUser(req);
    const params = await context.params;
    const serviceId = decodeRouteParam(params.serviceId);
    const updateId = decodeRouteParam(params.updateId);
    const body = await req.json().catch(() => null) as { reportDate?: unknown; percent?: unknown } | null;
    if (!serviceId || !updateId || typeof body?.reportDate !== "number" || !Number.isFinite(body.reportDate) ||
      typeof body.percent !== "number" || !Number.isFinite(body.percent) || body.percent < 0 || body.percent > 100) {
      throw new HttpError(400, "Data ou percentual inválido");
    }
    const updated = await patchServiceUpdateForEditor(serviceId, updateId, { reportDate: body.reportDate, percent: body.percent });
    if (!updated) throw new HttpError(404, "Atualização não encontrada");
    return NextResponse.json({ ok: true, progress: body.percent });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    console.error("[editor update PATCH]", error);
    return NextResponse.json({ ok: false, error: "Erro interno" }, { status: 500 });
  }
}
