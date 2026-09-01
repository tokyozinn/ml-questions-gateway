# ADR-TECH-002: Sinalização ao seller quando IA não responde

| Campo | Valor |
|---|---|
| Status | **accepted** |
| Data | 2026-09-01 |
| Decisor | Coordenador do projeto |
| Categoria | Técnica |

## Contexto

ADR-BIZ-001 define que perguntas sem resposta confiável devem ser sinalizadas ao seller, não respondidas automaticamente com texto genérico.

A SOT v1.1.0 previa WhatsApp (Z-API) como canal opcional de alerta, mas isso está **fora do escopo do MVP** (ADR-BIZ-002).

## Decisão proposta

### Critérios de escalonamento (não responder automaticamente)

| Condição | Ação |
|---|---|
| IA retorna token `__ESCALATE__` | Sinalizar seller |
| Confiança abaixo do threshold (configurável, default: implícito via prompt) | Sinalizar seller |
| `GET /items` falhou após retries | Sinalizar seller |
| Categoria sensível (garantia, devolução, originalidade) sem info no anúncio | Sinalizar seller |

### Canal de sinalização — opções

| Canal | MVP? | Ação necessária |
|---|---|---|
| **A) Log + registro em DB** (`escalated_questions`) | ✅ Proposto para demo | Automático |
| **B) WhatsApp via Z-API** | ❌ Fora do MVP | Requer credenciais Z-API (manual) |
| **C) E-mail ao tenant** | ⚠️ Alternativa | Requer SMTP/SendGrid (manual) |
| **D) Notificação no painel admin** | ⚠️ Alternativa | Requer UI (Etapa posterior) |

**Proposta para go-live de hoje:** canal A (DB + log estruturado) + endpoint admin `GET /api/v1/escalations` para o coordenador visualizar na demo.

### Entidade: Escalated Question

| Campo | Tipo |
|---|---|
| `question_id` | int PK |
| `tenant_id` | UUID |
| `item_id` | string |
| `question_text` | string |
| `reason` | enum: `no_context`, `low_confidence`, `item_fetch_failed`, `sensitive_category` |
| `product_context_snapshot` | text (JSON truncado) |
| `escalated_at` | datetime |

## Pendência para o coordenador

1. **Confirmar canal A** (DB + API) para demo de hoje, ou escolher outro canal.
2. **Definir se WhatsApp entra na Etapa 2** como canal primário de alerta.

## Consequências

- Perguntas escaladas **não** são marcadas em `processed_questions` como respondidas.
- Seller precisa responder manualmente no ML (fora do gateway).
- Evita passivo legal de respostas incorretas.

## Referências

- ADR-BIZ-001
- SOT §5.8 (novo), §6.3
- SOT §6.4 (WhatsApp — futuro)
