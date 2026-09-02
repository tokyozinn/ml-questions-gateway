# ADR-TECH-003: Agregador de métricas ML com cache TTL

| Campo | Valor |
|---|---|
| Status | **accepted** |
| Data | 2026-09-02 |
| Decisor | Coordenador do projeto |
| Categoria | Técnica |

## Contexto

Métricas completas de um tenant ML exigem 6–8 chamadas à API Mercado Libre (users, orders, visits, ads, billing). Chamar cada endpoint separadamente no frontend geraria:

- Múltiplas round-trips e UX fragmentada
- Risco de rate limit ML (429)
- Duplicação de lógica de token refresh

## Decisão proposta

### 1. Endpoint agregador único

```
GET /api/v1/tenants/:id/metrics?period=30|60|90&refresh=0|1
```

Protegido por `X-API-Key` (mesmo guard do admin API).

### 2. Serviços

| Serviço | Responsabilidade |
|---|---|
| `MetricsAggregatorService` | Orquestra chamadas ML em paralelo (`Promise.allSettled`), monta resposta unificada |
| `FinancialCalculator` | Deriva KPIs (receita, ROAS, margem) a partir dos blocos brutos |
| `MlClient` (estendido) | Métodos tipados por recurso ML |

### 3. Cache in-memory

- Chave: `metrics:{tenantId}:{periodDays}`
- TTL: 300 segundos
- Bypass: query `refresh=1`
- Evolução futura: Redis (backlog P0 SOT)

### 4. Fail-soft

Chamadas ML que falham (403 billing, 404 ads) não abortam a resposta. Erros parciais vão em `partial_errors[]`; blocos indisponíveis retornam `available: false`.

### 5. Paginação de pedidos

Para cálculo de receita, buscar pedidos pagos no período com paginação até `limit=50` por página, máximo 3 páginas (150 pedidos) no MVP — suficiente para demo; expandir depois.

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
|---|---|
| Endpoints por bloco | UX fragmentada, muitas chamadas frontend |
| Job assíncrono + DB snapshot | Over-engineering para MVP demo |
| Sem cache | Rate limit e latência 5–10s por load |

## Consequências

- `mlClient.ts` cresce com novos métodos; manter métodos focados por recurso.
- Billing usa períodos mensais — agregador faz interseção com janela 30/60/90d.
- Product Ads requer header `Api-Version: 1` ou `api-version: 2` conforme endpoint.
- Testes manuais via painel + tenant conectado (Vitest no backlog).

## Referências

- Spec: `docs/superpowers/specs/2026-09-02-tenant-metrics-dashboard-design.md`
- ADR-BIZ-003
- [ML Product Ads API](https://developers.mercadolibre.com.ar/en_us/en_us/product-ads-us-read)
- [ML Billing Reports](https://developers.mercadolibre.com.bo/en_us/news/billing-reports)
