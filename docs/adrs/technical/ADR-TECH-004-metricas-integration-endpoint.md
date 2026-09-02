# ADR-TECH-004: Endpoint `/metricas` (contrato PT para integração)

| Campo | Valor |
|---|---|
| Status | **accepted** |
| Data | 2026-09-02 |
| Decisor | Coordenador do projeto |
| Categoria | Técnica |

## Contexto

O dashboard admin consome `GET /api/v1/tenants/:id/metrics` com payload em inglês, orientado à UI interna. Outro sistema do coordenador precisa consumir as mesmas informações financeiras (faturamento, investimento em ads, lucro estimado, vendas) via API estável, com campos em português.

## Decisão

### 1. Endpoint dedicado

```
GET /api/v1/tenants/:id/metricas?periodo=30|60|90&refresh=0|1
```

- Identificador: UUID do tenant (`tenants.id`)
- Auth MVP: header `X-API-Key` (`GATEWAY_API_KEY`) — mesma chave do admin
- Evolução futura: JWT (fora deste ADR)

### 2. Contrato em português

Resposta tipada (`TenantMetricasResponse`) com blocos de negócio: `vendas`, `investimento`, `custos_ml`, `resultado`, `trafego`, `anuncios`, `avisos`. Não espelha o JSON EN do dash.

### 3. Reuso do agregador

A rota chama `MetricsAggregatorService.getTenantMetrics` e aplica `metricasMapper` EN→PT. Cache e fail-soft permanecem os do ADR-TECH-003. O endpoint `/metrics` (dash) fica intacto.

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
|---|---|
| Alias do payload EN | Não atende contrato PT para o consumidor |
| Agregador paralelo | Duplicaria rate limit ML e lógica |
| Chave dedicada já no MVP | Prematuro; JWT planejado depois |

## Consequências

- Dois contratos públicos coexistentes (`/metrics` EN interno, `/metricas` PT integração)
- Mudanças de KPI no agregador exigem atualizar o mapper
- Documentar exemplo de consumo para o sistema externo

## Referências

- Spec: `docs/superpowers/specs/2026-09-02-tenant-metricas-api-design.md`
- ADR-TECH-003, ADR-BIZ-003
