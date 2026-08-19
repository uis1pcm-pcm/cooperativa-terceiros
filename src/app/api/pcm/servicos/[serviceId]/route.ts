import { NextResponse } from "next/server";

import { HttpError, requirePcmUser } from "@/app/api/management/tokens/_lib/auth";
import { decodeRouteParam } from "@/lib/decodeRouteParam";
import { deleteService } from "@/lib/repo/services";
import { getServiceEditorData, patchServiceForEditor, type ServiceEditorPatch } from "@/lib/d1/serviceEditor";

const ALLOWED_PATCH_FIELDS = new Set([
  "os", "oc", "tag", "equipmentName", "sector", "plannedStart", "plannedEnd", "totalHours",
  "companyId", "companyName", "cnpj", "description", "packageId", "status", "progress", "checklist",
]);
const MAX_TEXT = 500;

function serviceIdFrom(value: string) {
  const decoded = decodeRouteParam(value);
  return (decoded || value).trim();
}

async function authenticate(req: Request) {
  try {
    await requirePcmUser(req);
    return null;
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: "Erro ao validar usuário" }, { status: 401 });
  }
}

function optionalText(value: unknown, field: string, nullable = true) {
  if (value === null && nullable) return null;
  if (typeof value !== "string") throw new HttpError(400, `${field} inválido`);
  const text = value.trim();
  if (text.length > MAX_TEXT) throw new HttpError(400, `${field} excede ${MAX_TEXT} caracteres`);
  return text || (nullable ? null : "");
}

function parsePatch(body: unknown): ServiceEditorPatch {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Payload inválido");
  const source = body as Record<string, unknown>;
  const unknown = Object.keys(source).filter((key) => !ALLOWED_PATCH_FIELDS.has(key));
  if (unknown.length) throw new HttpError(400, `Campos desconhecidos: ${unknown.join(", ")}`);
  if (!Object.keys(source).length) throw new HttpError(400, "Nenhum campo informado");
  const patch: ServiceEditorPatch = {};
  if ("os" in source) patch.os = optionalText(source.os, "os", false) ?? "";
  if ("tag" in source) patch.tag = optionalText(source.tag, "tag", false) ?? "";
  if ("equipmentName" in source) patch.equipmentName = optionalText(source.equipmentName, "equipmentName", false) ?? "";
  for (const field of ["oc", "sector", "companyId", "companyName", "cnpj", "description", "packageId"] as const) {
    if (field in source) patch[field] = optionalText(source[field], field);
  }
  if ("plannedStart" in source || "plannedEnd" in source) {
    for (const field of ["plannedStart", "plannedEnd"] as const) {
      if (!(field in source)) continue;
      if (typeof source[field] !== "number" || !Number.isFinite(source[field])) throw new HttpError(400, `${field} inválido`);
      patch[field] = source[field];
    }
    if (patch.plannedStart !== undefined && patch.plannedEnd !== undefined && patch.plannedStart > patch.plannedEnd) {
      throw new HttpError(400, "A data final deve ser posterior ou igual à inicial");
    }
  }
  if ("totalHours" in source) {
    if (typeof source.totalHours !== "number" || !Number.isFinite(source.totalHours) || source.totalHours <= 0) throw new HttpError(400, "totalHours inválido");
    patch.totalHours = source.totalHours;
  }
  if ("progress" in source) {
    if (typeof source.progress !== "number" || !Number.isFinite(source.progress) || source.progress < 0 || source.progress > 100) throw new HttpError(400, "progress deve estar entre 0 e 100");
    patch.progress = source.progress;
  }
  if ("status" in source) {
    if (!(["open", "pending", "concluded"] as unknown[]).includes(source.status)) throw new HttpError(400, "status inválido");
    patch.status = source.status as ServiceEditorPatch["status"];
  }
  if ("checklist" in source) {
    if (!Array.isArray(source.checklist) || source.checklist.length > 100) throw new HttpError(400, "checklist inválido");
    patch.checklist = source.checklist.map((item, index) => {
      if (!item || typeof item !== "object") throw new HttpError(400, `checklist[${index}] inválido`);
      const row = item as Record<string, unknown>;
      const id = optionalText(row.id, `checklist[${index}].id`, false);
      const description = optionalText(row.description, `checklist[${index}].description`, false);
      if (!id || !description || typeof row.weight !== "number" || !Number.isFinite(row.weight) || row.weight < 0 || row.weight > 100) throw new HttpError(400, `checklist[${index}] inválido`);
      return { id, description, weight: row.weight };
    });
    const total = patch.checklist.reduce((sum, item) => sum + item.weight, 0);
    if (patch.checklist.length && Math.round(total) !== 100) throw new HttpError(400, "A soma dos pesos deve ser 100");
  }
  return patch;
}

export async function GET(req: Request, context: { params: Promise<{ serviceId: string }> }) {
  const authError = await authenticate(req);
  if (authError) return authError;
  const id = serviceIdFrom((await context.params).serviceId);
  if (!id) return NextResponse.json({ ok: false, error: "serviceId ausente" }, { status: 400 });
  const data = await getServiceEditorData(id);
  if (!data.service) return NextResponse.json({ ok: false, error: "Serviço não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true, ...data });
}

export async function PATCH(req: Request, context: { params: Promise<{ serviceId: string }> }) {
  try {
    const authError = await authenticate(req);
    if (authError) return authError;
    const id = serviceIdFrom((await context.params).serviceId);
    if (!id) throw new HttpError(400, "serviceId ausente");
    const patch = parsePatch(await req.json().catch(() => null));
    const result = await patchServiceForEditor(id, patch);
    if (!result) throw new HttpError(404, "Serviço não encontrado");
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "PACKAGE_NOT_FOUND") return NextResponse.json({ ok: false, error: "Pacote não encontrado" }, { status: 400 });
    console.error("[api/pcm/servicos PATCH]", error);
    return NextResponse.json({ ok: false, error: "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ serviceId: string }> },
): Promise<NextResponse> {
  const { serviceId } = await context.params;
  const decodedId = decodeRouteParam(serviceId);
  const idCandidates = Array.from(
    new Set([decodedId, serviceId].filter((value) => typeof value === "string" && value.length > 0)),
  );

  if (idCandidates.length === 0) {
    return NextResponse.json({ ok: false, error: "serviceId ausente" }, { status: 400 });
  }

  try {
    await requirePcmUser(req);
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error("[api/pcm/servicos] Falha ao autenticar usuário", error);
    return NextResponse.json({ ok: false, error: "Erro ao validar usuário" }, { status: 401 });
  }

  try {
    for (const candidate of idCandidates) {
      const existed = await deleteService(candidate);
      if (existed) {
        return NextResponse.json({ ok: true });
      }
    }
    return NextResponse.json({ ok: false, error: "Serviço não encontrado" }, { status: 404 });
  } catch (error) {
    console.error(`[api/pcm/servicos] Falha ao excluir serviço ${idCandidates[0]}`, error);
    return NextResponse.json({ ok: false, error: "Erro interno ao excluir serviço" }, { status: 500 });
  }
}
