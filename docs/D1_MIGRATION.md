# Preparação do Cloudflare D1

O runtime server-side usa D1 como persistência principal. Firebase Auth continua responsável pela autenticação e o binding `R2_BUCKET` não foi alterado.

## Inventário confirmado no código

* `services` é listado por data/status/empresa/pacote/OS/import key e contém aliases em português e inglês. Checklist existe tanto embutido quanto em `services/{id}/checklist`.
* O histórico usa `services/{id}/updates` e o legado `services/{id}/serviceUpdates`, ordenado por criação/data.
* `packages` é ordenado por criação; serviços são consultados por `packageId`.
* `packageFolders` é consultado por pacote e contém os arrays redundantes `services`, `serviceIds` e `servicos`.
* `accessTokens` é consultado diretamente pelo código e por `(targetType, targetId, active)`.
* `users` aparece apenas nas regras/autenticação, sem repository de perfil. `packageShares` é ativa e foi incluída como `package_shares` na migration 0002.

## Modelo e decisões de leitura

O schema está em `migrations/0001_d1_initial.sql`. Checklist, empresas atribuídas, IDs da pasta, planejamento diário e payload detalhado de atualização ficam em JSON para que a leitura do agregado normalmente custe uma linha. O status materializado é `open`, `pending` ou `concluded`; toda escrita deve usar `normalizeStatus`, que dá precedência a progresso 100. Triggers mantêm `service_stats` e `packages.services_count` sem varreduras no dashboard.

Os índices correspondem às consultas observadas: paginação recente global; status, empresa ou pacote; deduplicação de importação; OS; pacotes recentes; pastas por pacote/nome; histórico por serviço; e tokens ativos por alvo. Não foram criados índices sobre JSON nem sobre campos sem filtro real.

## Criar e configurar

1. Instale/use Wrangler: `npx wrangler d1 create cooperativa-terceiros` e, opcionalmente, `npx wrangler d1 create cooperativa-terceiros-dev`.
2. Substitua os placeholders `REPLACE_WITH_D1_*` em `wrangler.jsonc` pelos IDs retornados. IDs reais não pertencem ao repositório.
3. Para desenvolvimento puramente local, rode `npm run d1:migrate:local`. Para um banco de teste remoto, use `npx wrangler d1 migrations apply cooperativa-terceiros-dev --env development --remote`.
4. Produção (somente quando aprovada): `npm run d1:migrate:remote` ou o comando equivalente com `--env production`.

O Next.js é empacotado com OpenNext para Cloudflare; o helper server-only `getD1()` resolve o binding nativo `DB`. Repositories e route handlers não acessam a API REST do Cloudflare.

## Importar Firestore para D1 de teste

Configure `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID` e um `CLOUDFLARE_API_TOKEN` com escrita em D1. Configure Firebase por `FIREBASE_SERVICE_ACCOUNT_BASE64` ou pelo trio `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`. Depois execute:

```bash
npm run d1:import
```

O importador somente lê o Firestore, faz UPSERT por identificador, preserva estruturas complexas em JSON, combina checklist/subcollections e ambos os históricos, recalcula contadores e imprime totais. IDs de updates incluem serviço e collection de origem, evitando colisões e tornando reexecuções idempotentes. Erros são impressos individualmente e produzem exit code 1; não são ocultados.


## Runtime principal (OpenNext)

A aplicação usa `@opennextjs/cloudflare`; `src/lib/d1/runtime.ts#getD1()` lê o binding nativo `DB` de `getCloudflareContext()`. D1 nunca é entregue ao navegador. Firebase Admin permanece apenas para Firebase Auth e R2 continua no binding `R2_BUCKET`.

```bash
npm install
npm run d1:migrate:local
npm run preview
# remoto
npm run d1:migrate:remote
npm run deploy
```

`packageShares` é ativa (rota de compartilhamento e portal do terceiro) e foi migrada para `package_shares` pela migration 0002. A coleção `/users` não tem leitura/gravação de dados no código da aplicação; identidade e claims continuam no Firebase Auth, portanto não foi criada tabela sem uso.

A migration 0002 adiciona FTS5 trigram sincronizado por triggers, `idx_services_available`, índice de token ativo recente e `package_shares`. A migration 0003 remove índices redundantes e adiciona somente o índice alfabético de pacotes usado pelo editor. O importador também reconcilia `services.package_id` a partir das pastas legadas.

## Planos das consultas críticas

Execute `sqlite3 /tmp/d1.sqlite < docs/d1-query-plans.sql`. Os planos e a classificação completa dos scans estão em `docs/D1_PERFORMANCE_AUDIT.md`.

Em desenvolvimento, `D1_DEBUG_METRICS=true` habilita `logD1Metrics`; ele só registra `rows_read`, `rows_written` e duração quando o runtime realmente fornece esses metadados.
