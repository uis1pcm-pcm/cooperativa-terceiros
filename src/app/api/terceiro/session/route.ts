import { NextResponse } from "next/server";

import { getTokenCookie } from "@/lib/tokenSession";
import { getServicesForToken, getTokenDoc } from "@/lib/terceiroService";
import { DatabaseUnavailableError } from "@/lib/databaseUnavailable";
import { mapDatabaseError } from "@/lib/utils/databaseErrors";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const token = await getTokenCookie();
    if (!token) {
      return NextResponse.json({ ok: false, error: "missing_token" }, { status: 401 });
    }

    const tokenDoc = await getTokenDoc(token);
    if (!tokenDoc) {
      return NextResponse.json({ ok: false, error: "token_not_found" }, { status: 404 });
    }

    const companyId =
      (typeof tokenDoc.companyId === "string" && tokenDoc.companyId.trim()) ||
      (typeof tokenDoc.empresa === "string" && tokenDoc.empresa.trim()) ||
      (typeof tokenDoc.company === "string" && tokenDoc.company.trim()) ||
      null;

    const services = await getServicesForToken(token);

    return NextResponse.json({ ok: true, companyId, services });
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      console.error("[api/terceiro/session] Banco D1 indisponível", error);
      return NextResponse.json({ ok: false, error: "Configuração de acesso ao banco indisponível." }, { status: 500 });
    }

    const mapped = mapDatabaseError(error);
    if (mapped) {
      console.warn("[api/terceiro/session] Falha ao consultar dados", error);
      return NextResponse.json({ ok: false, error: mapped.message }, { status: mapped.status });
    }

    console.error("[api/terceiro/session] Erro inesperado", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
