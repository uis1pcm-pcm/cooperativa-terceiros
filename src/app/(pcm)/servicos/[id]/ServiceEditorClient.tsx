"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Field, FormRow } from "@/components/ui/form-controls";
import { maskCnpjInput } from "@/lib/cnpj";
import { dateOnlyToMillis, formatDateOnlyBR, maskDateOnlyInput, parseDateOnly } from "@/lib/dateOnly";
import { useFirebaseAuthSession } from "@/lib/useFirebaseAuthSession";

type ChecklistDraft = Array<{ id: string; descricao: string; peso: number | "" }>;

type PackageOption = { id: string; nome: string };

type UpdateHistoryItem = {
  id: string;
  date: Date | null;
  note?: string;
  totalPct?: number;
  items?: Array<{ itemId: string; pct: number }>;
  source: "updates" | "serviceUpdates";
};

function toDateTimeLocalInput(value: Date | null): string {
  if (!value) return "";
  const timezoneOffset = value.getTimezoneOffset();
  const localDate = new Date(value.getTime() - timezoneOffset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

function parseDateTimeLocal(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

const STATUS_OPTIONS = ["Aberto", "Pendente", "Concluído"] as const;

function toFormStatus(value: unknown): (typeof STATUS_OPTIONS)[number] {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "pendente") return "Pendente";
  if (raw === "concluido" || raw === "concluído" || raw === "encerrado") return "Concluído";
  return "Aberto";
}

function createChecklistId(seed: number) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `item-${seed}`;
}

function normaliseChecklistEntry(entry: unknown, index: number): ChecklistDraft[number] {
  const fallbackId = createChecklistId(index);
  if (!entry || typeof entry !== "object") {
    return { id: fallbackId, descricao: "", peso: 0 };
  }
  const record = entry as Record<string, unknown>;
  const idSource = record.id ?? record.itemId;
  const descricaoSource = record.descricao ?? record.description;
  const pesoSource = record.peso ?? record.weight;

  const id = typeof idSource === "string" && idSource ? idSource : fallbackId;
  const descricao = typeof descricaoSource === "string" ? descricaoSource : "";
  const pesoValue = typeof pesoSource === "number" ? pesoSource : Number(pesoSource ?? 0);

  return { id, descricao, peso: Number.isFinite(pesoValue) ? pesoValue : 0 };
}

function toDateInput(value: unknown): string {
  if (!value) return "";
  if (typeof value === "number" && Number.isFinite(value)) value = new Date(value);
  if (typeof value === "string" && value) {
    const parsed = parseDateOnly(value);
    if (parsed) {
      return formatDateOnlyBR(parsed);
    }
    const trimmed = value.trim();
    if (trimmed.length >= 10) {
      const fallback = parseDateOnly(trimmed.slice(0, 10));
      if (fallback) {
        return formatDateOnlyBR(fallback);
      }
    }
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return formatDateOnlyBR({
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    });
  }
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    if (!date || Number.isNaN(date.getTime())) return "";
    return formatDateOnlyBR({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    });
  }
  return "";
}

type ServiceEditorClientProps = {
  serviceId: string;
};

export default function ServiceEditorClient({ serviceId }: ServiceEditorClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const updateIdParam = searchParams?.get("updateId") ?? null;
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    os: "",
    cnpj: "",
    oc: "",
    tag: "",
    equipamento: "",
    setor: "",
    dataInicio: "",
    dataFim: "",
    horasPrevistas: "",
    empresaId: "",
    status: "Aberto" as (typeof STATUS_OPTIONS)[number],
    pacoteId: "",
  });
  const [andamento, setAndamento] = useState(0);
  const [withChecklist, setWithChecklist] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistDraft>([]);
  const [saving, setSaving] = useState(false);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [updates, setUpdates] = useState<UpdateHistoryItem[]>([]);
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
  const [editingUpdateSource, setEditingUpdateSource] = useState<UpdateHistoryItem["source"] | null>(null);
  const [editDateValue, setEditDateValue] = useState("");
  const [editPercentValue, setEditPercentValue] = useState("");
  const [savingUpdateEdit, setSavingUpdateEdit] = useState(false);
  const { ready: isAuthReady, issue: authIssue, user } = useFirebaseAuthSession();

  const authenticatedFetch = useCallback(async (url: string, init?: RequestInit) => {
    if (!user) throw new Error("Usuário não autenticado");
    const token = await user.getIdToken();
    return fetch(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}` } });
  }, [user]);

  const totalPeso = useMemo(
    () =>
      checklist.reduce((acc, item) => {
        const numeric = Number(item.peso);
        if (!Number.isFinite(numeric)) return acc;
        return acc + Math.max(0, Math.min(100, numeric));
      }, 0),
    [checklist],
  );

  const applyEditorResponse = useCallback((data: {
    service: Record<string, unknown>;
    packages: Array<{ id: string; name: string }>;
    updates: Array<Record<string, unknown>>;
  }) => {
    const service = data.service;
    setPackages(data.packages.map((item) => ({ id: item.id, nome: item.name })));
    setForm({
      os: String(service.os ?? ""),
      cnpj: typeof service.cnpj === "string" ? maskCnpjInput(service.cnpj) : "",
      oc: String(service.oc ?? ""),
      tag: String(service.tag ?? ""),
      equipamento: String(service.equipment_name ?? ""),
      setor: String(service.sector ?? ""),
      dataInicio: toDateInput(service.planned_start),
      dataFim: toDateInput(service.planned_end),
      horasPrevistas: service.total_hours ? String(service.total_hours) : "",
      empresaId: String(service.company_name ?? service.company_id ?? ""),
      status: toFormStatus(service.status),
      pacoteId: String(service.package_id ?? ""),
    });
    let checklistData: unknown[] = [];
    try { checklistData = JSON.parse(String(service.checklist_json ?? "[]")) as unknown[]; } catch { checklistData = []; }
    setChecklist(checklistData.map((item, index) => normaliseChecklistEntry(item, index)));
    setWithChecklist(checklistData.length > 0);
    setAndamento(Number(service.progress ?? 0));
    setUpdates(data.updates.map((row) => {
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(String(row.payload_json ?? "{}")) as Record<string, unknown>; } catch { payload = {}; }
      const timestamp = Number(row.report_date ?? row.created_at);
      return {
        id: String(row.id),
        date: Number.isFinite(timestamp) ? new Date(timestamp) : null,
        note: typeof row.description === "string" ? row.description : undefined,
        totalPct: typeof row.real_percent === "number" ? row.real_percent : undefined,
        items: Array.isArray(payload.items) ? payload.items as Array<{ itemId: string; pct: number }> : undefined,
        source: "updates" as const,
      };
    }));
  }, []);

  const loadEditor = useCallback(async () => {
    if (!isAuthReady || !user) return;
    setLoading(true);
    setLoadingPackages(true);
    setUpdatesLoading(true);
    try {
      const response = await authenticatedFetch(`/api/pcm/servicos/${encodeURIComponent(serviceId)}`);
      const data = await response.json() as { ok?: boolean; error?: string; service: Record<string, unknown>; packages: Array<{ id: string; name: string }>; updates: Array<Record<string, unknown>> };
      if (!response.ok) throw new Error(data.error ?? `Falha ao carregar (${response.status})`);
      applyEditorResponse(data);
    } catch (error) {
      console.error("[servicos/:id] Falha ao carregar editor D1", error);
      toast.error("Não foi possível carregar os dados do serviço.");
    } finally {
      setLoading(false);
      setLoadingPackages(false);
      setUpdatesLoading(false);
    }
  }, [applyEditorResponse, authenticatedFetch, isAuthReady, serviceId, user]);

  useEffect(() => { void loadEditor(); }, [loadEditor]);

  const startEditingUpdate = useCallback((update: UpdateHistoryItem) => {
    setEditingUpdateId(update.id);
    setEditingUpdateSource(update.source);
    setEditDateValue(toDateTimeLocalInput(update.date));
    setEditPercentValue(
      typeof update.totalPct === "number" && Number.isFinite(update.totalPct) ? String(update.totalPct) : "",
    );
  }, []);

  useEffect(() => {
    if (!updateIdParam) return;
    const target = updates.find((u) => u.id === updateIdParam);
    if (target) startEditingUpdate(target);
  }, [updateIdParam, updates, startEditingUpdate]);

  const cancelEditingUpdate = useCallback(() => {
    setEditingUpdateId(null);
    setEditingUpdateSource(null);
    setEditDateValue("");
    setEditPercentValue("");
    setSavingUpdateEdit(false);
  }, []);

  const saveEditingUpdate = useCallback(async () => {
    if (!isAuthReady || !editingUpdateId || !editingUpdateSource) return;
    const parsedDate = parseDateTimeLocal(editDateValue);
    const parsedPercent = Number(editPercentValue);
    if (!parsedDate || !Number.isFinite(parsedPercent) || parsedPercent < 0 || parsedPercent > 100) {
      toast.error("Informe data, hora e percentual válidos entre 0 e 100.");
      return;
    }
    setSavingUpdateEdit(true);
    try {
      const response = await authenticatedFetch(
        `/api/pcm/servicos/${encodeURIComponent(serviceId)}/updates/${encodeURIComponent(editingUpdateId)}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportDate: parsedDate.getTime(), percent: parsedPercent }) },
      );
      const data = await response.json() as { error?: string; progress?: number };
      if (!response.ok) throw new Error(data.error ?? "Falha ao atualizar lançamento");
      setAndamento(data.progress ?? parsedPercent);
      setUpdates((current) => current.map((item) => item.id === editingUpdateId
        ? { ...item, date: parsedDate, totalPct: parsedPercent }
        : item));
      cancelEditingUpdate();
      toast.success("Lançamento atualizado com sucesso.");
    } catch (error) {
      console.error("[servicos/:id] Falha ao alterar lançamento", error);
      toast.error("Não foi possível alterar o lançamento.");
    } finally { setSavingUpdateEdit(false); }
  }, [authenticatedFetch, cancelEditingUpdate, editDateValue, editPercentValue, editingUpdateId, editingUpdateSource, isAuthReady, serviceId]);

  function updateForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateChecklistItem(id: string, patch: Partial<ChecklistDraft[number]>) {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeChecklistItem(id: string) {
    setChecklist((prev) => prev.filter((item) => item.id !== id));
  }

  function addChecklistItem() {
    const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 11);
    setChecklist((prev) => [...prev, { id, descricao: "", peso: "" }]);
    setWithChecklist(true);
  }

  async function saveChanges() {
    if (!form.os.trim() || !form.tag.trim() || !form.equipamento.trim()) {
      toast.error("Preencha os campos obrigatórios (O.S, Tag e Equipamento).");
      return;
    }
    const inicioPrevisto = parseDateOnly(form.dataInicio);
    const fimPrevisto = parseDateOnly(form.dataFim);
    if (!inicioPrevisto || !fimPrevisto) {
      toast.error("Datas inválidas. Utilize o formato dd/mm/aaaa.");
      return;
    }
    const inicioMillis = dateOnlyToMillis(inicioPrevisto);
    const fimMillis = dateOnlyToMillis(fimPrevisto);
    if (inicioMillis > fimMillis) {
      toast.error("A data de término prevista deve ser posterior ou igual à data de início.");
      return;
    }
    const horas = Number(form.horasPrevistas);
    if (!Number.isFinite(horas) || horas <= 0) {
      toast.error("Horas previstas deve ser um número maior que zero.");
      return;
    }
    if (withChecklist && checklist.length > 0 && Math.round(totalPeso) !== 100) {
      toast.error("A soma dos pesos do checklist deve ser 100%.");
      return;
    }

    if (!isAuthReady) {
      toast.error("Sua sessão segura ainda não foi confirmada. Aguarde ou faça login novamente.");
      return;
    }
    setSaving(true);
    try {
      const status = form.status === "Concluído" ? "concluded" : form.status === "Pendente" ? "pending" : "open";
      const response = await authenticatedFetch(`/api/pcm/servicos/${encodeURIComponent(serviceId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          os: form.os.trim(), oc: form.oc.trim() || null, tag: form.tag.trim(),
          equipmentName: form.equipamento.trim(), sector: form.setor.trim() || null,
          plannedStart: inicioMillis, plannedEnd: fimMillis, totalHours: horas,
          companyId: form.empresaId.trim() || null, companyName: form.empresaId.trim() || null,
          cnpj: form.cnpj.trim() || null, status, packageId: form.pacoteId || null,
          checklist: withChecklist ? checklist.map((item) => ({
            id: item.id, description: item.descricao.trim(), weight: Math.max(0, Math.min(100, Number(item.peso) || 0)),
          })) : [],
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha ao salvar");
      toast.success("Serviço atualizado com sucesso.");
      router.push(`/servicos/${encodeURIComponent(serviceId)}`);
    } catch (error) {
      console.error("[servicos/:id] Falha ao salvar", error);
      toast.error("Não foi possível salvar as alterações.");
    } finally { setSaving(false); }
    }

  async function changeStatus(status: (typeof STATUS_OPTIONS)[number], progresso?: number) {
    if (!isAuthReady) return;
    setSaving(true);
    try {
      const canonical = status === "Concluído" ? "concluded" : status === "Pendente" ? "pending" : "open";
      const body: { status: string; progress?: number } = { status: canonical };
      if (typeof progresso === "number" && Number.isFinite(progresso)) body.progress = Math.max(0, Math.min(100, progresso));
      const response = await authenticatedFetch(`/api/pcm/servicos/${encodeURIComponent(serviceId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await response.json() as { error?: string; progress?: number };
      if (!response.ok) throw new Error(data.error ?? "Falha ao alterar status");
      setForm((previous) => ({ ...previous, status }));
      if (typeof data.progress === "number") setAndamento(data.progress);
      toast.success("Status atualizado.");
    } catch (error) {
      console.error("[servicos/:id] Falha ao alterar status", error);
      toast.error("Não foi possível alterar o status.");
    } finally { setSaving(false); }
  }

  if (!isAuthReady) {
    return (
      <div className="grid gap-6">
        <div className="rounded-2xl border bg-amber-50 p-6 text-sm text-amber-700 shadow-sm">
          {authIssue ?? "Sincronizando sessão segura. Aguarde..."}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl border bg-card/80 p-6 shadow-sm">
        {loading ? (
          <div className="space-y-4">
            <div className="h-6 w-3/4 animate-pulse rounded bg-muted/50" />
            <div className="h-40 animate-pulse rounded bg-muted/40" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Dados gerais</h2>
                <p className="text-sm text-muted-foreground">
                  Atualize os campos do serviço e gerencie o checklist utilizado nas medições.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <div className="rounded-lg border border-primary/40 bg-primary/5 px-4 py-2 text-sm">
                  Andamento atual: <span className="font-semibold text-primary">{Math.round(andamento)}%</span>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={saveChanges}
                  disabled={saving}
                  aria-busy={saving}
                >
                  {saving ? "Salvando..." : "Salvar edição"}
                </button>
              </div>
            </div>

            <FormRow>
              <div className="flex w-full flex-col gap-3">
                <Field label="O.S" value={form.os} onChange={(event) => updateForm("os", event.target.value)} required />
                <Field
                  label="CNPJ"
                  value={form.cnpj}
                  onChange={(event) => updateForm("cnpj", maskCnpjInput(event.target.value))}
                  placeholder="00.000.000/0000-00"
                  inputMode="numeric"
                  maxLength={18}
                />
              </div>
              <Field label="O.C" value={form.oc} onChange={(event) => updateForm("oc", event.target.value)} />
            </FormRow>
            <FormRow>
              <Field label="Tag" value={form.tag} onChange={(event) => updateForm("tag", event.target.value)} required />
              <Field
                label="Equipamento"
                value={form.equipamento}
                onChange={(event) => updateForm("equipamento", event.target.value)}
                required
              />
            </FormRow>
            <FormRow>
              <Field label="Setor" value={form.setor} onChange={(event) => updateForm("setor", event.target.value)} />
              <Field
                label="Empresa"
                value={form.empresaId}
                onChange={(event) => updateForm("empresaId", event.target.value)}
              />
            </FormRow>
            <FormRow>
              <Field
                label="Data de início prevista"
                value={form.dataInicio}
                onChange={(event) => updateForm("dataInicio", maskDateOnlyInput(event.target.value))}
                onBlur={(event) => updateForm("dataInicio", maskDateOnlyInput(event.target.value))}
                placeholder="dd/mm/aaaa"
                inputMode="numeric"
                maxLength={10}
                pattern="\d{2}/\d{2}/\d{4}"
                required
              />
              <Field
                label="Data de término prevista"
                value={form.dataFim}
                onChange={(event) => updateForm("dataFim", maskDateOnlyInput(event.target.value))}
                onBlur={(event) => updateForm("dataFim", maskDateOnlyInput(event.target.value))}
                placeholder="dd/mm/aaaa"
                inputMode="numeric"
                maxLength={10}
                pattern="\d{2}/\d{2}/\d{4}"
                required
              />
            </FormRow>
            <FormRow>
              <Field
                label="Horas previstas"
                type="number"
                min={0}
                step="0.5"
                value={form.horasPrevistas}
                onChange={(event) => updateForm("horasPrevistas", event.target.value)}
                required
              />
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground/90" htmlFor="status">
                  Status
                </label>
                <select
                  id="status"
                  value={form.status}
                  onChange={(event) => updateForm("status", event.target.value as (typeof STATUS_OPTIONS)[number])}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </FormRow>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/90" htmlFor="pacote">
                Pacote
              </label>
              <select
                id="pacote"
                value={form.pacoteId}
                onChange={(event) => updateForm("pacoteId", event.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40"
                disabled={loadingPackages}
              >
                <option value="">Nenhum pacote</option>
                {packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.nome || `Pacote ${pkg.id}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-dashed bg-muted/20 p-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground/90">
                <input
                  type="checkbox"
                  checked={withChecklist}
                  onChange={(event) => setWithChecklist(event.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Utilizar checklist para este serviço
              </label>

              {withChecklist ? (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-muted-foreground">Itens do checklist</span>
                    <button type="button" onClick={addChecklistItem} className="btn btn-secondary text-xs">
                      Adicionar item
                    </button>
                  </div>
                  {checklist.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      Nenhum item cadastrado.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {checklist.map((item) => (
                        <div key={item.id} className="rounded-lg border bg-background p-4 shadow-sm">
                          <div className="flex flex-col gap-3 sm:flex-row">
                            <div className="flex-1">
                              <label
                                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                htmlFor={`desc-${item.id}`}
                              >
                                Descrição
                              </label>
                              <textarea
                                id={`desc-${item.id}`}
                                value={item.descricao}
                                onChange={(event) => updateChecklistItem(item.id, { descricao: event.target.value })}
                                rows={2}
                                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40"
                              />
                            </div>
                            <div className="w-full sm:w-40">
                              <label
                                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                htmlFor={`peso-${item.id}`}
                              >
                                Peso (%)
                              </label>
                              <input
                                id={`peso-${item.id}`}
                                type="number"
                                min={0}
                                max={100}
                                step="0.5"
                                value={item.peso === "" ? "" : item.peso}
                                onChange={(event) => {
                                  const raw = event.target.value;
                                  if (raw === "") {
                                    updateChecklistItem(item.id, { peso: "" });
                                    return;
                                  }
                                  const parsed = Number(raw);
                                  if (!Number.isFinite(parsed)) return;
                                  const clamped = Math.max(0, Math.min(100, parsed));
                                  updateChecklistItem(item.id, { peso: clamped });
                                }}
                                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40"
                              />
                            </div>
                          </div>
                          <div className="mt-3 text-right">
                            <button
                              type="button"
                              onClick={() => removeChecklistItem(item.id)}
                              className="text-xs font-medium text-destructive hover:underline"
                            >
                              Remover item
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="rounded-lg border bg-background/60 p-3 text-sm">
                    <div className="flex items-center justify-between font-medium">
                      <span>Soma dos pesos</span>
                      <span className={Math.round(totalPeso) === 100 ? "text-primary" : "text-amber-600"}>
                        {totalPeso.toFixed(1)}%
                      </span>
                    </div>
                    {Math.round(totalPeso) !== 100 ? (
                      <p className="mt-1 text-xs text-amber-600">A soma precisa atingir 100%.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={saveChanges}
                disabled={saving}
                aria-busy={saving}
              >
                {saving ? "Salvando..." : "Salvar alterações"}
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => changeStatus("Concluído", 100)}
                  disabled={saving}
                >
                  Concluir serviço
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => changeStatus("Pendente")}
                  disabled={saving}
                >
                  Marcar como pendente
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-card/80 p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Histórico de atualizações</h2>
        {updatesLoading ? (
          <div className="mt-4 space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-muted/40" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted/40" />
          </div>
        ) : updates.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Nenhuma atualização registrada até o momento.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {updates.map((update) => (
              <li key={update.id} className="rounded-lg border bg-background p-4 shadow-sm">
                <div className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold text-foreground">
                    {update.date
                      ? update.date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
                      : "Data não informada"}
                  </span>
                  {typeof update.totalPct === "number" ? (
                    <span className="text-xs text-muted-foreground">Percentual total: {Math.round(update.totalPct)}%</span>
                  ) : null}
                  {Array.isArray(update.items) && update.items.length > 0 ? (
                    <div className="text-xs text-muted-foreground">
                      Itens: {update.items.map((item) => `${item.itemId}: ${Math.round(item.pct)}%`).join(", ")}
                    </div>
                  ) : null}
                  {update.note ? <p className="text-sm text-muted-foreground">{update.note}</p> : null}
                </div>
                {updateIdParam && update.id !== updateIdParam ? null : editingUpdateId === update.id ? (
                  <div className="mt-3 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Data e hora do lançamento
                        </label>
                        <input
                          type="datetime-local"
                          value={editDateValue}
                          onChange={(event) => setEditDateValue(event.target.value)}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Percentual total (%)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.5"
                          value={editPercentValue}
                          onChange={(event) => setEditPercentValue(event.target.value)}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={saveEditingUpdate}
                        disabled={savingUpdateEdit}
                      >
                        {savingUpdateEdit ? "Salvando..." : "Salvar alterações"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={cancelEditingUpdate}
                        disabled={savingUpdateEdit}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => startEditingUpdate(update)}
                    >
                      Alterar lançamento
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
