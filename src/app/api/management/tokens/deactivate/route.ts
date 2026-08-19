import { NextResponse } from "next/server";
import { getD1 } from "@/lib/d1/runtime";
import { HttpError, requirePcmUser } from "../_lib/auth";

type DeactivateBody = {
  token?: unknown;
};

function parseBody(body: DeactivateBody): string {
  if (!body || typeof body.token !== "string" || !body.token.trim()) {
    throw new HttpError(400, "token inválido");
  }
  return body.token.trim();
}

export async function POST(req: Request) {
  try {
    await requirePcmUser(req);

    const body = (await req.json().catch(() => ({}))) as DeactivateBody;
    const token = parseBody(body);

    const found=await getD1().prepare("SELECT token_code FROM access_tokens WHERE token_code=?1").bind(token).first();
    if (!found) {
      throw new HttpError(404, "Token não encontrado");
    }

    await getD1().prepare("UPDATE access_tokens SET active=0,status='revoked',updated_at=?1 WHERE token_code=?2").bind(Date.now(),token).run();

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    console.error("[tokens/deactivate] Erro inesperado", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
