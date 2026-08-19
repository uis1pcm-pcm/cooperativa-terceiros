export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { ReactNode } from "react";
import Link from "next/link";

import { requireFolderAccess } from "@/lib/public-access";
import type { Service } from "@/lib/types";
import { formatDate } from "@/lib/formatDateTime";
import { DatabaseUnavailableError } from "@/lib/databaseUnavailable";
import { mapDatabaseError } from "@/lib/utils/databaseErrors";

function normaliseStatus(value?: string | null): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw.includes("conclu")) return "Concluído";
  if (raw === "pendente") return "Pendente";
  if (raw.includes("andamento")) return "Em andamento";
  return "Aberto";
}

function deriveStatusLabel(status: Service["status"], progress: number): string {
  const normalised = normaliseStatus(status);
  if (normalised === "Pendente") return normalised;
  if (progress >= 100) return "Concluído";
  return normalised;
}

function resolveProgress(service: Service): number {
  const candidates = [
    service.realPercent,
    service.progress,
    service.andamento,
    service.previousProgress,
  ];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.min(100, Math.max(0, Math.round(value)));
    }
  }
  return 0;
}

function serviceTitle(service: Service): string {
  if (service.os) return `OS ${service.os}`;
  if (service.tag) return service.tag;
  if (service.code) return `Código ${service.code}`;
  return `Serviço ${service.id}`;
}

function serviceSubtitle(service: Service): string | null {
  if (service.equipmentName) return service.equipmentName;
  if (service.company) return `Empresa: ${service.company}`;
  return null;
}

function formatDateLabel(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "—";
  return formatDate(value, { timeZone: "America/Sao_Paulo", fallback: "—" }) || "—";
}

function formatHours(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const formatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  return `${formatter.format(value)}h`;
}

function InfoItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

function formatServiceIdList(ids: string[]): string {
  if (ids.length === 0) return "";
  if (ids.length === 1) return ids[0];
  return ids.join(", ");
}

export default async function FolderPublicPage({
  params,
  searchParams,
}: {
  params: { folderId: string };
  searchParams?: { token?: string };
}) {
  const token = searchParams?.token?.trim().toUpperCase() ?? "";
  if (!token) {
    return <div className="card p-6">Token não informado. Inclua ?token=... na URL.</div>;
  }

  try {
    const { folder, services, unavailableServices } = await requireFolderAccess(token, params.folderId);

    const sortedServices = [...services].sort((a, b) =>
      serviceTitle(a).localeCompare(serviceTitle(b), "pt-BR", { sensitivity: "base" }),
    );

    const unavailableMessage = unavailableServices.length
      ? `Alguns serviços vinculados ao subpacote não estão disponíveis para exibição (${formatServiceIdList(
          unavailableServices,
        )}).`
      : null;

    return (
      <div className="container-page max-w-5xl pb-16">
        <Link href="/" className="link inline-flex items-center gap-1 mb-4">
          ← Voltar
        </Link>

        <div className="card bg-card/60 p-6 shadow-sm backdrop-blur">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">
            {folder.name ? `Serviços de ${folder.name}` : "Serviços do subpacote"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Consulte abaixo todos os serviços disponíveis com o token informado.
            {folder.company ? ` Empresa responsável: ${folder.company}.` : ""}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {sortedServices.length} serviço{sortedServices.length === 1 ? "" : "s"} disponível{sortedServices.length === 1 ? "" : "s"}.
          </p>
          {unavailableMessage ? (
            <p className="mt-2 text-xs text-amber-600">{unavailableMessage}</p>
          ) : null}
        </div>

        {sortedServices.length === 0 ? (
          <div className="mt-6 card p-6 text-sm text-muted-foreground">
            Nenhum serviço elegível foi encontrado para este subpacote.
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {sortedServices.map((service) => {
              const progress = resolveProgress(service);
              const statusLabel = deriveStatusLabel(service.status, progress);
              const subtitle = serviceSubtitle(service);
              return (
                <article key={service.id} className="card border shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b px-6 py-4">
                    <div className="min-w-0 space-y-1">
                      <h2 className="text-lg font-semibold text-foreground">{serviceTitle(service)}</h2>
                      <p className="text-sm text-muted-foreground">{subtitle ?? `ID: ${service.id}`}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2 text-sm font-semibold">
                      <span
                        className={`rounded-full px-3 py-1 ${
                          statusLabel === "Concluído"
                            ? "border border-emerald-200 bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/70 dark:border-emerald-700/70 dark:bg-emerald-900/40 dark:text-emerald-50 dark:ring-emerald-700/60"
                            : "border border-primary/40 bg-primary/10 text-primary"
                        }`}
                      >
                        {statusLabel}
                      </span>
                      <span className="text-muted-foreground">{progress}% concluído</span>
                    </div>
                  </div>

                  <div className="px-6 py-4">
                    <dl className="grid gap-4 sm:grid-cols-2">
                      <InfoItem label="OS" value={service.os?.trim() || "—"} />
                      <InfoItem label="Tag" value={service.tag?.trim() || "—"} />
                      <InfoItem label="Código" value={service.code?.trim() || "—"} />
                      <InfoItem label="Equipamento" value={service.equipmentName?.trim() || "—"} />
                      <InfoItem label="Descrição" value={service.description?.trim() || "—"} />
                      <InfoItem label="Setor" value={service.sector?.trim() || service.setor?.trim() || "—"} />
                      <InfoItem label="Empresa" value={service.company?.trim() || service.empresa?.trim() || "—"} />
                      <InfoItem label="CNPJ" value={service.cnpj?.trim() || "—"} />
                      <InfoItem label="Início previsto" value={formatDateLabel(service.plannedStart)} />
                      <InfoItem label="Término previsto" value={formatDateLabel(service.plannedEnd)} />
                      <InfoItem label="Horas totais" value={formatHours(service.totalHours)} />
                    </dl>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3 border-t bg-muted/40 px-6 py-4 text-sm">
                    <Link
                      href={`/s/${service.id}?token=${encodeURIComponent(token)}`}
                      className="btn btn-primary"
                    >
                      PREENCHER RDO
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    );
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      const status = (error as { status?: number }).status ?? 403;
      const message = error.message || "Acesso não autorizado.";
      return <div className="card p-6">{status === 404 ? "Subpacote não encontrado." : message}</div>;
    }

    if (error instanceof DatabaseUnavailableError) {
      console.error(`[public/subpacotes/${params.folderId}] Banco D1 indisponível`, error);
      return <div className="card p-6">Configuração de acesso ao banco indisponível.</div>;
    }

    const mapped = mapDatabaseError(error);
    if (mapped) {
      console.warn(`[public/subpacotes/${params.folderId}] Falha ao carregar subpacote`, error);
      const message = mapped.status === 404 ? "Subpacote não encontrado." : mapped.message;
      return <div className="card p-6">{message}</div>;
    }

    console.error(`[public/subpacotes/${params.folderId}] Falha inesperada`, error);
    return <div className="card p-6">Não foi possível carregar os serviços deste subpacote.</div>;
  }
}
