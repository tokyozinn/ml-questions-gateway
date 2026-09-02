# Design: API `/metricas` (contrato PT para integração)

**Data:** 2026-09-02  
**Status:** approved (coordenador)  
**ADRs:** ADR-TECH-004, ADR-TECH-003

## Objetivo

Expor `GET /api/v1/tenants/:id/metricas` com JSON estável em português para outro sistema consumir e renderizar métricas financeiras/operacionais do tenant ML.

## Contrato

```
GET /api/v1/tenants/:id/metricas?periodo=30|60|90&refresh=0|1
Header: X-API-Key: {GATEWAY_API_KEY}
```

### Resposta (exemplo)

```json
{
  "cliente_id": "uuid",
  "cliente_nome": "Loja Demo",
  "ml_user_id": 123,
  "periodo_dias": 30,
  "data_inicio": "2026-08-03",
  "data_fim": "2026-09-02",
  "consultado_em": "2026-09-02T15:00:00.000Z",
  "em_cache": false,
  "moeda": "BRL",
  "vendas": {
    "quantidade": 42,
    "receita_bruta": 15000.5,
    "ticket_medio": 357.15
  },
  "investimento": {
    "ads_disponivel": false,
    "gasto_ads": 0,
    "roas": 0
  },
  "custos_ml": {
    "disponivel": true,
    "comissoes_e_taxas": 1200.0,
    "periodo_faturamento": "2026-08-01",
    "cobrancas": [{ "descricao": "...", "valor": 100, "tipo": "CV" }],
    "bonus": []
  },
  "resultado": {
    "receita_liquida_estimada": 13800.5,
    "margem_apos_ads": 13800.5
  },
  "trafego": { "visitas": 1000 },
  "anuncios": { "ativos": 12 },
  "avisos": [
    { "fonte": "ads", "mensagem": "Product Ads não habilitado nesta conta" }
  ]
}
```

## Implementação

- Reuso de `MetricsAggregatorService` + `metricasMapper`
- Sem alteração do endpoint EN `/metrics` nem do HTML do dash
- JWT / chave dedicada: backlog

## Erros HTTP

| Código | Quando |
|---|---|
| 400 | Query inválida ou tenant sem ML conectado |
| 401 | API key ausente/inválida |
| 404 | Tenant não encontrado |
| 502 | Falha total ao obter token / agregação |
