import { NextResponse, type NextRequest } from "next/server";
import { HttpError, requirePcmUser } from "@/app/api/management/tokens/_lib/auth";
import { recomputeServiceProgress } from "@/lib/progressHistoryServer";

export async function POST(request: NextRequest) {
  try {
    await requirePcmUser(request);
    const body = await request.json().catch(() => null) as { serviceId?: unknown } | null;
    const serviceId = typeof body?.serviceId === "string" ? body.serviceId.trim() : "";
    if (!serviceId) throw new HttpError(400, "serviceId ausente");
    const { percent, lastUpdate } = await recomputeServiceProgress(serviceId);
    return NextResponse.json({ ok: true, percent, lastUpdate });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    console.error("[pcm/servicos/recompute-progress]", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
