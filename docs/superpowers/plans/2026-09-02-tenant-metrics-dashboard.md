# Tenant Metrics Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar dashboard `/admin/metrics` com endpoint agregador que busca métricas ML (vendas, ads, billing, reputação, visitas) por tenant e calcula KPIs financeiros.

**Architecture:** `MetricsAggregatorService` orquestra chamadas paralelas via `MlClient` estendido; `FinancialCalculator` deriva KPIs; cache in-memory TTL 5 min; fail-soft com `partial_errors[]`.

**Tech Stack:** Node.js 22, TypeScript, Fastify, Zod, Prisma (tokens existentes), fetch nativo.

## Global Constraints

- Branch: `feature/e5-metrics` a partir de `develop`
- ADRs ADR-BIZ-003 e ADR-TECH-003 devem estar `accepted` antes do merge
- Não remover funcionalidades de questions gateway
- Período: query `period` enum `30` | `60` | `90` (default `30`)
- Cache TTL: 300 segundos; bypass com `refresh=1`
- Auth admin: header `X-API-Key`
- Fail-soft: ads/billing indisponível não aborta resposta

---

### Task 1: Tipos e schema de métricas

**Files:**
- Create: `src/types/metrics.ts`
- Create: `src/schemas/metrics.ts`

**Interfaces:**
- Produces: `TenantMetricsResponse`, `PartialError`, `FinancialSummary` types; `metricsQuerySchema` Zod

- [ ] **Step 1: Criar tipos**

```typescript
// src/types/metrics.ts
export type MetricsPeriod = 30 | 60 | 90;

export interface PartialError {
  source: string;
  message: string;
  status?: number;
}

export interface FinancialSummary {
  gross_revenue: number;
  orders_count: number;
  avg_ticket: number;
  ad_spend: number;
  ml_fees: number;
  net_revenue_estimated: number;
  roas: number;
  margin_after_ads: number;
  currency_id: string;
}

export interface TenantMetricsResponse {
  tenant_id: string;
  tenant_name: string;
  ml_user_id: number;
  period_days: MetricsPeriod;
  date_from: string;
  date_to: string;
  fetched_at: string;
  cached: boolean;
  financial: FinancialSummary;
  reputation: Record<string, unknown> | null;
  orders: { total: number; recent: Array<Record<string, unknown>> };
  ads: { available: boolean; advertiser_id?: number; metrics_summary?: Record<string, unknown> };
  billing: {
    available: boolean;
    period_key?: string;
    charges?: Array<{ label: string; amount: number; type: string }>;
    bonuses?: Array<{ label: string; amount: number; type: string }>;
    total_collected?: number;
  };
  traffic: { total_visits: number };
  listings: { active_count: number };
  partial_errors: PartialError[];
}
```

- [ ] **Step 2: Criar schema Zod**

```typescript
// src/schemas/metrics.ts
import { z } from "zod";

export const metricsQuerySchema = z.object({
  period: z.coerce.number().pipe(z.union([z.literal(30), z.literal(60), z.literal(90)])).default(30),
  refresh: z.enum(["0", "1"]).optional().default("0"),
});
```

- [ ] **Step 3: Verificar compilação**

Run: `npm run typecheck`
Expected: PASS (sem erros nos novos arquivos)

---

### Task 2: Estender MlClient

**Files:**
- Modify: `src/services/mlClient.ts`

**Interfaces:**
- Consumes: tipos existentes `Config`
- Produces: métodos abaixo usados pelo aggregator

- [ ] **Step 1: Adicionar helper de query string e métodos**

Adicionar ao `MlClient`:

```typescript
async getUser(userId: number, accessToken: string): Promise<Record<string, unknown>> {
  return this.authenticatedGet(`https://api.mercadolibre.com/users/${userId}`, accessToken);
}

async searchUserItems(userId: number, accessToken: string): Promise<{ paging: { total: number }; results: string[] }> {
  return this.authenticatedGet(
    `https://api.mercadolibre.com/users/${userId}/items/search?limit=1`,
    accessToken,
  );
}

async searchOrders(
  sellerId: number,
  accessToken: string,
  dateFrom: string,
  dateTo: string,
  offset = 0,
  limit = 50,
): Promise<{ paging: { total: number }; results: Array<Record<string, unknown>> }> {
  const params = new URLSearchParams({
    seller: String(sellerId),
    sort: "date_desc",
    limit: String(limit),
    offset: String(offset),
    "order.date_created.from": dateFrom,
    "order.date_created.to": dateTo,
  });
  return this.authenticatedGet(
    `https://api.mercadolibre.com/orders/search?${params}`,
    accessToken,
  );
}

async getUserItemsVisits(
  userId: number,
  accessToken: string,
  dateFrom: string,
  dateTo: string,
): Promise<{ total_visits: number }> {
  const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
  return this.authenticatedGet(
    `https://api.mercadolibre.com/users/${userId}/items_visits?${params}`,
    accessToken,
  );
}

async getAdvertisers(accessToken: string): Promise<{ advertisers: Array<{ advertiser_id: number; site_id: string }> }> {
  const response = await fetch(
    "https://api.mercadolibre.com/advertising/advertisers?product_id=PADS",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        "Api-Version": "1",
      },
    },
  );
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ML advertisers failed (${response.status}): ${errorBody}`);
  }
  return response.json();
}

async getProductAdsCampaignMetrics(
  advertiserId: number,
  accessToken: string,
  dateFrom: string,
  dateTo: string,
): Promise<Record<string, unknown>> {
  const metrics = "clicks,prints,cost,roas,total_amount,direct_amount,indirect_amount,units_quantity,acos";
  const params = new URLSearchParams({
    limit: "50",
    offset: "0",
    date_from: dateFrom.slice(0, 10),
    date_to: dateTo.slice(0, 10),
    metrics,
    metrics_summary: "true",
  });
  const response = await fetch(
    `https://api.mercadolibre.com/advertising/advertisers/${advertiserId}/product_ads/campaigns?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        "api-version": "2",
      },
    },
  );
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ML ads metrics failed (${response.status}): ${errorBody}`);
  }
  return response.json();
}

async getBillingPeriods(accessToken: string): Promise<{ results: Array<{ key: string; period: { date_from: string; date_to: string } }> }> {
  return this.authenticatedGet(
    "https://api.mercadolibre.com/billing/integration/monthly/periods?group=ML&document_type=BILL&limit=12",
    accessToken,
  );
}

async getBillingSummary(accessToken: string, periodKey: string): Promise<Record<string, unknown>> {
  return this.authenticatedGet(
    `https://api.mercadolibre.com/billing/integration/periods/key/${periodKey}/summary/details?group=ML`,
    accessToken,
  );
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: PASS

---

### Task 3: FinancialCalculator

**Files:**
- Create: `src/services/financialCalculator.ts`

**Interfaces:**
- Consumes: orders results, ads summary, billing charges
- Produces: `calculateFinancialSummary(...)` → `FinancialSummary`

- [ ] **Step 1: Implementar calculadora**

```typescript
import type { FinancialSummary } from "../types/metrics.js";

const PAID_STATUSES = new Set(["paid"]);

export function sumOrderRevenue(orders: Array<Record<string, unknown>>): { revenue: number; count: number; currency: string } {
  let revenue = 0;
  let count = 0;
  let currency = "BRL";
  for (const order of orders) {
    const status = String(order.status ?? "");
    if (!PAID_STATUSES.has(status)) continue;
    const total = Number(order.total_amount ?? 0);
    revenue += total;
    count += 1;
    if (order.currency_id) currency = String(order.currency_id);
  }
  return { revenue, count, currency };
}

export function sumBillingFees(
  charges: Array<{ label: string; amount: number; type: string }> | undefined,
  excludeTypes: string[] = ["PADS"],
): number {
  if (!charges) return 0;
  return charges
    .filter((c) => !excludeTypes.includes(c.type))
    .reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
}

export function extractAdsCost(adsPayload: Record<string, unknown> | undefined): number {
  const summary = adsPayload?.metrics_summary as Record<string, unknown> | undefined;
  return Number(summary?.cost ?? 0);
}

export function extractAdsRoas(adsPayload: Record<string, unknown> | undefined): number | null {
  const summary = adsPayload?.metrics_summary as Record<string, unknown> | undefined;
  const roas = Number(summary?.roas ?? NaN);
  return Number.isFinite(roas) ? roas : null;
}

export function calculateFinancialSummary(input: {
  orders: Array<Record<string, unknown>>;
  adsPayload?: Record<string, unknown>;
  billingCharges?: Array<{ label: string; amount: number; type: string }>;
}): FinancialSummary {
  const { revenue, count, currency } = sumOrderRevenue(input.orders);
  const adSpend = extractAdsCost(input.adsPayload);
  const mlFees = sumBillingFees(input.billingCharges);
  const netRevenue = revenue - mlFees;
  const apiRoas = extractAdsRoas(input.adsPayload);
  const roas = apiRoas ?? (adSpend > 0 ? revenue / adSpend : 0);
  const avgTicket = count > 0 ? revenue / count : 0;

  return {
    gross_revenue: round2(revenue),
    orders_count: count,
    avg_ticket: round2(avgTicket),
    ad_spend: round2(adSpend),
    ml_fees: round2(mlFees),
    net_revenue_estimated: round2(netRevenue),
    roas: round2(roas),
    margin_after_ads: round2(netRevenue - adSpend),
    currency_id: currency,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: PASS

---

### Task 4: MetricsAggregatorService + cache

**Files:**
- Create: `src/services/metricsAggregator.ts`

**Interfaces:**
- Consumes: `MlClient`, `TokenManager`, `TenantService`, `FinancialCalculator`
- Produces: `getTenantMetrics(tenantId, period, refresh)` → `TenantMetricsResponse`

- [ ] **Step 1: Implementar agregador**

Pontos-chave:
- Cache `Map<string, { expiresAt: number; data: TenantMetricsResponse }>`
- `buildDateRange(periodDays)` → `{ dateFrom, dateTo }` ISO
- Buscar token via `tokenManager.ensureAccessToken(mlUserId)`
- Paralelizar com `Promise.allSettled`: user, items, orders (até 3 páginas), visits, advertisers
- Se advertisers OK → ads metrics (filtrar `site_id` MLB se tenant BR)
- Billing: pick period key que intersecta date range
- Montar `partial_errors` de rejections
- Chamar `calculateFinancialSummary`

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: PASS

---

### Task 5: Rota API

**Files:**
- Modify: `src/routes/gateway.ts`

**Interfaces:**
- Consumes: `MetricsAggregatorService`, `metricsQuerySchema`

- [ ] **Step 1: Registrar rota**

```typescript
app.get(
  "/api/v1/tenants/:id/metrics",
  { preHandler: apiKeyGuard },
  async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = metricsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const tenant = await tenantService.getById(id);
    if (!tenant) return reply.code(404).send({ error: "Tenant not found" });
    if (!tenant.mlUserId) {
      return reply.code(400).send({ error: "Tenant not connected to Mercado Livre" });
    }

    const metrics = await metricsAggregator.getTenantMetrics(
      tenant,
      parsed.data.period,
      parsed.data.refresh === "1",
    );
    return metrics;
  },
);
```

- [ ] **Step 2: Teste manual**

Run: `npm run dev`
```powershell
curl -H "X-API-Key: $env:GATEWAY_API_KEY" "http://localhost:8000/api/v1/tenants/{TENANT_ID}/metrics?period=30"
```
Expected: JSON com blocos `financial`, `reputation`, `partial_errors` (pode ter erros parciais se ads/billing indisponível)

---

### Task 6: Página admin `/admin/metrics`

**Files:**
- Create: `src/views/metrics.html`
- Modify: `src/routes/adminPanel.ts`
- Modify: `src/views/admin.html`

**Interfaces:**
- Consumes: `GET /api/v1/tenants`, `GET /api/v1/tenants/:id/metrics`

- [ ] **Step 1: Rota HTML**

Em `adminPanel.ts`:
```typescript
app.get("/admin/metrics", async (_request, reply) => {
  const html = await readFile(join(__dirname, "../views/metrics.html"), "utf-8");
  return reply.type("text/html").send(html);
});
```

- [ ] **Step 2: Criar metrics.html**

UI com:
- Reuso de CSS do admin.html
- Dropdown tenants (filtrar `ml_user_id != null`)
- Radio/buttons 30/60/90
- Cards financeiros formatados `pt-BR` currency
- Tabela pedidos recentes
- Seções ads/billing/reputação/tráfego
- Banner amarelo para `partial_errors`

- [ ] **Step 3: Link no admin.html**

Adicionar no topo do dashboard:
```html
<p><a href="/admin/metrics">Ver métricas financeiras →</a></p>
```

- [ ] **Step 4: Teste manual no browser**

1. Abrir `http://localhost:8000/admin/metrics`
2. Inserir API key
3. Selecionar tenant conectado + período 30
4. Verificar cards financeiros e tabela de pedidos

---

### Task 7: Documentação e encerramento

**Files:**
- Modify: `docs/ROADMAP.md` — marcar tasks E5 concluídas
- Coordenador: ADR-BIZ-003 + ADR-TECH-003 → `accepted`

- [ ] **Step 1: Atualizar ROADMAP após implementação**

- [ ] **Step 2: PR para `develop`**

Título: `[EPIC-05] Dashboard métricas financeiras por tenant`

Corpo: spec, ADRs, como testar, ações manuais DevCenter

---

## Self-Review (spec coverage)

| Requisito spec | Task |
|---|---|
| Endpoint agregador único | Task 5 |
| Período 30/60/90 | Task 1, 5, 6 |
| KPIs financeiros | Task 3, 4 |
| Fail-soft partial_errors | Task 4 |
| Cache TTL 5 min | Task 4 |
| Product Ads | Task 2, 4 |
| Billing | Task 2, 4 |
| UI /admin/metrics | Task 6 |
| Questions gateway intacto | Nenhuma task remove código existente |

## Execução

Após aprovação dos ADRs pelo coordenador, iniciar branch `feature/e5-metrics` e executar Tasks 1–6 em ordem.
