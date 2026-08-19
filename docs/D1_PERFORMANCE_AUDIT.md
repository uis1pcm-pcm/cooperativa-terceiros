# Auditoria final de persistência e performance D1

## Persistência runtime

`ServiceEditorClient` usa apenas APIs autenticadas. `GET/PATCH /api/pcm/servicos/:id` lê e altera o serviço; `PATCH /api/pcm/servicos/:id/updates/:updateId` corrige lançamentos. O browser envia Firebase ID Token, validado por Firebase Admin Auth. O binding D1 nunca é exposto.

A busca global por imports/APIs Firestore no runtime retorna zero. Firebase permanece em `src/lib/firebase.ts` (Auth client), `src/lib/firebaseAdmin.ts` e verificadores de sessão (Admin Auth). A única leitura Firestore está no importador offline `scripts/migrate-firestore-to-d1.mjs`; um mock de compatibilidade permanece em um teste preexistente.

O editor não possuía autosave: as gravações sempre ocorreram pelos botões de salvar/status. Portanto não foi introduzido debounce artificial. O botão continua bloqueado durante a requisição, e o PATCH atualiza somente colunas explicitamente enviadas, evitando lost update entre campos não relacionados.

## Queries frequentes

| Operação | Estratégia | Índice | Retorno normal | `rows_read` |
|---|---|---|---:|---|
| Serviço por ID | `WHERE id=? LIMIT 1` | PK `services` | 0–1 | não disponível localmente |
| Serviços recentes | `ORDER BY updated_at,id LIMIT 20` | `idx_services_updated` | 20 | não disponível localmente |
| Paginação | keyset `updated_at + id`, sem OFFSET | `idx_services_updated` | 15–100 | não disponível localmente |
| Dashboard | uma linha de `service_stats` | PK `service_stats(id)` | 1 | não disponível localmente |
| Busca | FTS5 trigram + join por `rowid`, com LIMIT | índice virtual FTS5 | até o limite | não disponível localmente |
| Disponíveis | partial predicate + LIMIT | `idx_services_available` | até 500 | não disponível localmente |
| Serviços do pacote | `package_id`, key order, LIMIT | `idx_services_package_created` | até limite | não disponível localmente |
| Pastas do pacote | `package_id`, nome | `idx_folders_package_name` | normalmente poucas | não disponível localmente |
| Serviços da pasta | uma consulta `id IN (...)` | PK `services` | IDs da pasta | não disponível localmente |
| Token por código | `token_code=? LIMIT 1` | PK `access_tokens` | 0–1 | não disponível localmente |
| Último token ativo | alvo/ativo + ordem/limit | `idx_access_tokens_latest` | 0–1 | não disponível localmente |
| Updates | serviço + ordem + LIMIT | `idx_service_updates_service_created` | até 50/200 | não disponível localmente |
| Package share | token único + LIMIT | unique automático de `token` | 0–1 | não disponível localmente |

`D1_DEBUG_METRICS=true` está conectado a serviço por ID, páginas/busca, recentes, disponíveis, estatísticas, pacotes, updates, tokens, shares e editor. O logger emite valores somente quando `D1Result.meta` realmente contém `rows_read`, `rows_written` ou duração. O SQLite local não fornece a metadata de faturamento do D1, portanto nenhum número foi inferido.

## FTS e termos curtos

`services_fts` indexa OS, OC, code, tag, equipamento, setor, IDs/nomes de empresa e CNPJ. Triggers cobrem INSERT, DELETE e UPDATE de todos esses campos. O tokenizer `trigram` atende fragmentos com três ou mais caracteres. Termos com menos de três caracteres não usam fallback `LIKE`, conscientemente: retornar nenhum resultado é preferível a um full scan silencioso de `services`.

## Planos e scans

Os 15 comandos reproduzíveis estão em `docs/d1-query-plans.sql`.

* `SEARCH ... sqlite_autoindex_services_1`: detalhes e listas `IN`, esperado.
* `SEARCH ... idx_services_updated/status_updated/company_updated/package_created`: paginação e filtros, esperado.
* `SCAN services USING idx_services_updated`: primeira página recente; scan **do índice**, interrompido pelo LIMIT, aceitável.
* `SCAN services USING idx_services_available`: scan do partial index já restrito, interrompido pelo LIMIT, aceitável.
* `SCAN packages USING idx_packages_created`: scan do índice com LIMIT 20, aceitável.
* `SEARCH package_folders`, `service_updates`, `access_tokens` e `package_shares`: indexado, esperado.
* `SCAN services_fts VIRTUAL TABLE`: operação interna normal do FTS5, esperado; não é scan de `services`.
* Nenhum scan problemático de tabela normal permanece nas rotas frequentes auditadas.

## Índices finais

| Índice | Query/frequência | Decisão |
|---|---|---|
| `idx_services_updated` | páginas/recentes, alta | manter |
| `idx_services_status_updated` | filtro dashboard/lista, média | manter |
| `idx_services_company_updated` | filtro empresa, média | manter |
| `idx_services_package_created` | detalhe pacote, alta | manter |
| `idx_services_import_key` | importação/idempotência, baixa mas crítica | manter |
| `idx_services_os` | lookup OS/importação | manter |
| `idx_services_available` | seleção para pacote, alta | manter partial |
| `idx_packages_created` | dashboard/lista, alta | manter |
| `idx_packages_name` | opções do editor, média | adicionar em 0003 |
| `idx_folders_package_name` | detalhe pacote, alta | manter |
| `idx_service_updates_service_created` | histórico, alta | manter |
| `idx_access_tokens_latest` | portal/fallback, alta | manter partial |

`idx_access_tokens_target` foi removido por ser coberto pelo índice partial do fluxo ativo. `idx_package_shares_token_active` foi removido porque `token UNIQUE` já cria o índice usado pelo lookup. Isso reduz `rows_written` sem prejudicar as queries reais.

## Benchmark local reproduzível

`npm run d1:benchmark` cria temporariamente 10.000 serviços, 100 pacotes, 200 pastas, 50.000 updates, 2.000 tokens e 100 shares. Ele mede dashboard, recentes, primeira/deep page keyset, busca com 0/1 resultado, disponíveis, pacote, pasta, histórico, token e share. O tempo inclui startup do processo `sqlite3`; serve para regressão relativa, não representa billing/latência D1 remota.

Execução observada em 2026-08-19 (ms): dashboard 13,19; recentes 17,32; página 1 11,63; página profunda keyset 12,38; FTS 1 resultado 13,75; FTS 0 resultados 13,42; disponíveis 11,70; pacote 11,60; pasta 12,41; histórico 12,14; token 17,40; share 11,67. A página profunda permaneceu equivalente à primeira página, sem crescimento proporcional à posição.
