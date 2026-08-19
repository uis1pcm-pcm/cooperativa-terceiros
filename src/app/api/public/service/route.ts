import { NextResponse } from "next/server";

import { PublicAccessError, fetchServiceChecklist, requireServiceAccess } from "@/lib/public-access";
import { listUpdates } from "@/lib/repo/services";
import { DatabaseUnavailableError } from "@/lib/databaseUnavailable";
import { mapDatabaseError } from "@/lib/utils/databaseErrors";

const HISTORY_LIMIT = 20;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId") ?? "";
  const token = searchParams.get("token") ?? "";

  try {
    const { service } = await requireServiceAccess(token, serviceId);
    let checklist = service.hasChecklist ? await fetchServiceChecklist(service.id) : [];
    
    // Se não há checklist, criar um padrão "GERAL" com peso 100
    if (checklist.length === 0) {
      checklist = [{
        id: "default-geral",
        serviceId: service.id,
        description: "GERAL",
        weight: 100,
        progress: service.realPercent ?? 0,
        status: "andamento" as const,
        updatedAt: Date.now(),
      }];
    }
    
    const updates = await listUpdates(service.id, HISTORY_LIMIT);

    return NextResponse.json(
      {
        ok: true,
        service: {
          ...service,
          hasChecklist: true, // Sempre considerar que tem checklist (pelo menos o padrão)
        },
        checklist,
        updates,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    if (err instanceof PublicAccessError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }

    if (err instanceof DatabaseUnavailableError) {
      console.error("[api/public/service] Banco D1 indisponível", err);
      return NextResponse.json(
        { ok: false, error: "Configuração de acesso ao banco indisponível." },
        { status: 500 },
      );
    }

    const mapped = mapDatabaseError(err);
    if (mapped) {
      console.warn("[api/public/service] Falha de acesso ao banco", err);
      return NextResponse.json({ ok: false, error: mapped.message }, { status: mapped.status });
    }

    console.error("[api/public/service] Falha inesperada", err);
    return NextResponse.json({ ok: false, error: "Erro interno" }, { status: 500 });
  }
}
