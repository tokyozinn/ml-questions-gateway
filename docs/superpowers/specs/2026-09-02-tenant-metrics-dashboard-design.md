# Tenant Metrics Dashboard — Design Spec

| Campo | Valor |
|---|---|
| Data | 2026-09-02 |
| Status | **approved** (coordenador) |
| ADRs | ADR-BIZ-003 (proposed), ADR-TECH-003 (proposed) |
| Épico | E5 — Métricas Financeiras |

## 1. Objetivo

Exibir no painel admin (`/admin/metrics`) um dashboard completo de métricas por tenant conectado, incluindo análise financeira: receita de vendas, gasto com Product Ads, comissões ML (billing), ROAS e margem estimada.

A funcionalidade de **questions gateway permanece** na SOT e no código; métricas passa a ser o **produto principal** do projeto.

## 2. Decisões fechadas

| Decisão | Escolha |
|---|---|
| Conta | Por tenant (multi-tenant) — selecionar tenant com `ml_user_id` conectado |
| Escopo de métricas | Completo (reputação, visitas, pedidos, ads, billing, perguntas/contatos) |
| Análise financeira | Sim — receita, ads, comissões, ROAS, margem |
| Período | Seletor no painel: **30 / 60 / 90 dias** |
| Arquitetura | Endpoint agregador único + cache in-memory TTL 5 min |

## 3. Arquitetura

```
Admin UI (/admin/metrics)
    │
    ▼
GET /api/v1/tenants/:id/metrics?period=30|60|90
    │
    ├── TokenManager.ensureAccessToken(ml_user_id)
    │
    └── MetricsAggregatorService
            ├── MlClient.getUser()
            ├── MlClient.searchUserItems()
            ├── MlClient.searchOrders()
            ├── MlClient.getUserItemsVisits()
            ├── MlClient.getAdvertisers(PADS)
            ├── MlClient.getProductAdsCampaignMetrics()
            └── MlClient.getBillingSummary()
                    │
                    ▼
            FinancialCalculator → KPIs derivados
                    │
                    ▼
            JSON normalizado + partial_errors[]
```

### Cache

- Chave: `metrics:{tenantId}:{periodDays}`
- TTL: 300 segundos (5 min)
- Implementação: `Map` in-memory (MVP); Redis em etapa futura

### Fail-soft

Se ads (404 — sem Publicidade) ou billing (403 — sem permissão) falhar, retorna demais blocos + `partial_errors[]`.

## 4. Endpoints ML consumidos

| Grupo | Endpoint ML | Uso |
|---|---|---|
| Reputação | `GET /users/{user_id}` | `seller_reputation`, transações, ratings |
| Anúncios | `GET /users/{user_id}/items/search` | Contagem e IDs de itens ativos |
| Pedidos | `GET /orders/search?seller={id}&order.date_created.from/to&sort=date_desc` | Receita, lista de vendas |
| Visitas | `GET /users/{user_id}/items_visits?date_from&date_to` | Tráfego total |
| Product Ads | `GET /advertising/advertisers?product_id=PADS` | Obter `advertiser_id` |
| Product Ads | `GET /advertising/advertisers/{id}/product_ads/campaigns?metrics_summary=true&...` | cost, roas, total_amount |
| Billing | `GET /billing/integration/monthly/periods` | Períodos disponíveis |
| Billing | `GET /billing/integration/periods/key/{key}/summary/details` | charges, bonuses, total_collected |

**Nota billing:** períodos são mensais (não 30/60/90 exatos). O agregador seleciona período(s) cujo `date_from`/`date_to` intersectam a janela escolhida; se nenhum, usa o período mais recente fechado.

## 5. API Gateway

### Request

```
GET /api/v1/tenants/:id/metrics?period=30
Header: X-API-Key: {GATEWAY_API_KEY}
```

Query `period`: enum `30` | `60` | `90` (default `30`).

### Response shape

```json
{
  "tenant_id": "uuid",
  "tenant_name": "Loja do João",
  "ml_user_id": 123456,
  "period_days": 30,
  "date_from": "2026-08-03T00:00:00.000Z",
  "date_to": "2026-09-02T23:59:59.999Z",
  "fetched_at": "2026-09-02T14:00:00.000Z",
  "cached": false,
  "financial": {
    "gross_revenue": 45230.50,
    "orders_count": 87,
    "avg_ticket": 519.89,
    "ad_spend": 3200.00,
    "ml_fees": 6780.30,
    "net_revenue_estimated": 31250.20,
    "roas": 4.2,
    "margin_after_ads": 28050.20,
    "currency_id": "BRL"
  },
  "reputation": {
    "level_id": "5_green",
    "power_seller_status": "platinum",
    "metrics": {}
  },
  "orders": {
    "total": 87,
    "recent": []
  },
  "ads": {
    "available": true,
    "advertiser_id": 000,
    "metrics_summary": {}
  },
  "billing": {
    "available": true,
    "period_key": "2026-08-01",
    "charges": [],
    "bonuses": [],
    "total_collected": 0
  },
  "traffic": {
    "total_visits": 12400
  },
  "listings": {
    "active_count": 45
  },
  "partial_errors": []
}
```

### KPIs calculados

| KPI | Fórmula |
|---|---|
| `gross_revenue` | Soma `total_amount` de pedidos com status pago no período |
| `orders_count` | Count de pedidos incluídos |
| `avg_ticket` | `gross_revenue / orders_count` |
| `ad_spend` | `ads.metrics_summary.cost` (0 se indisponível) |
| `ml_fees` | Soma `billing.charges` (excl. tipo PADS se já contado em ad_spend) |
| `net_revenue_estimated` | `gross_revenue - ml_fees` |
| `roas` | `ads.metrics_summary.roas` ou `gross_revenue / ad_spend` se ad_spend > 0 |
| `margin_after_ads` | `net_revenue_estimated - ad_spend` |

## 6. UI — `/admin/metrics`

1. Seletor de tenant (dropdown — apenas tenants com OAuth conectado)
2. Seletor de período (30 / 60 / 90 dias)
3. Botão Atualizar (ignora cache se `?refresh=1` no endpoint)
4. Cards financeiros: receita bruta, gasto ads, ROAS, comissões ML, margem estimada
5. Tabela pedidos recentes
6. Bloco Ads (cost, clicks, ROAS, total_amount)
7. Bloco Billing (charges agrupados)
8. Bloco Reputação + Tráfego + Anúncios ativos
9. Banner de aviso para `partial_errors`

Estilo: dark theme igual ao `/admin` existente.

## 7. Arquivos novos/modificados

| Arquivo | Ação |
|---|---|
| `src/types/metrics.ts` | Criar — tipos de resposta |
| `src/schemas/metrics.ts` | Criar — Zod query params |
| `src/services/mlClient.ts` | Estender — novos métodos ML |
| `src/services/financialCalculator.ts` | Criar — KPIs |
| `src/services/metricsAggregator.ts` | Criar — orquestração + cache |
| `src/routes/gateway.ts` | Modificar — rota metrics |
| `src/routes/adminPanel.ts` | Modificar — rota `/admin/metrics` |
| `src/views/metrics.html` | Criar — página admin |
| `src/views/admin.html` | Modificar — link para métricas |

## 8. Fora de escopo (Etapa 1)

- Gráficos temporais (sparklines)
- Export CSV/PDF
- Cache Redis
- Histórico persistido no DB
- Brand Ads / Display Ads (só Product Ads PADS)

## 9. Ações manuais (coordenador)

1. Verificar permissões do app DevCenter ML: **read orders**, **billing**, **advertising**
2. Reconectar OAuth do tenant após habilitar novas permissões
3. Aprovar ADR-BIZ-003 e ADR-TECH-003 (`proposed` → `accepted`)

## 10. Referências

- [ML Metrics](https://developers.mercadolibre.com.ar/en_us/en_us/metrics)
- [Product Ads](https://developers.mercadolibre.com.ar/en_us/en_us/product-ads-us-read)
- [Billing Reports](https://developers.mercadolibre.com.bo/en_us/news/billing-reports)
- [Orders Search](https://developers.mercadolibre.com.ve/gestiona-ventas)
