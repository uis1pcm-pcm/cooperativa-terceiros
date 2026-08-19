import { NextResponse, type NextRequest } from "next/server";

import { listPackagesPCM } from "@/lib/data";
import type { PCMPackageListItem, PCMListResponse } from "@/types/pcm";
import { createPackage,updatePackageMetadata } from "@/lib/repo/packages";
import { requirePcmUser } from "@/app/api/management/tokens/_lib/auth";

function parseLimit(param: string | null, fallback: number): number {
  if (!param) return fallback;
  const parsed = Number(param);
  if (!Number.isFinite(parsed)) return fallback;
  const safe = Math.max(1, Math.min(Math.floor(parsed), 50));
  return safe;
}
export async function POST(request:NextRequest){await requirePcmUser(request);const body=await request.json();const id=await createPackage(String(body.name??"").trim(),[]);await updatePackageMetadata(id,{description:body.description??null,plannedStart:body.plannedStart,plannedEnd:body.plannedEnd});return NextResponse.json({id},{status:201});}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"), 15);
  const cursor = url.searchParams.get("cursor");

  const result = await listPackagesPCM({
    limit,
    cursor: cursor ? cursor : null,
  });

  return NextResponse.json(result as PCMListResponse<PCMPackageListItem>);
}
