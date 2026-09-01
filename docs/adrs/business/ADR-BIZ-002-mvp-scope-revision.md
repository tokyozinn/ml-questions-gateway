# ADR-BIZ-002: Revisão de escopo do MVP (inclui IA)

| Campo | Valor |
|---|---|
| Status | **proposed** |
| Data | 2026-09-01 |
| Decisor | Coordenador do projeto |
| Categoria | Negócio |

## Contexto

Na Etapa 0 (bootstrap), o coordenador definiu MVP como:

> Core: OAuth + webhook + auto-resposta por regras (sem IA, sem billing, sem WhatsApp)

Em seguida, o coordenador explicitou requisito de IA-first com contexto do produto (ADR-BIZ-001), o que **altera o escopo do MVP**.

## Decisão proposta

Revisar o MVP de hoje para incluir:

| Incluído no MVP | Excluído do MVP |
|---|---|
| OAuth multi-tenant | Billing (Stripe/Hotmart) |
| Webhook ML + processamento assíncrono | WhatsApp (Z-API) |
| Answer Engine IA-first com contexto do item | Portal self-service |
| Sinalização ao seller (canal TBD — ver ADR-TECH-002) | PostgreSQL (SQLite local para demo) |
| Admin API básica (criar tenant, connect link) | Fila Redis/BullMQ (in-process para demo) |
| Deploy local + ngrok | Testes automatizados completos |

## Pendência para o coordenador

**Confirmar ou ajustar** esta revisão de escopo antes da Etapa 1 (implementação).

## Consequências

- Go-live de hoje foca em **demo funcional** (pergunta → IA responde ou sinaliza seller), não em produção comercial.
- `OPENAI_API_KEY` torna-se variável obrigatória para o MVP.
- Itens P0 da SOT (fila, PostgreSQL, nonce OAuth) ficam para etapas posteriores, salvo decisão contrária.

## Referências

- ADR-BIZ-001
- SOT §12 — Matriz de prontidão
- Decisão Etapa 0: deploy local + ngrok, billing skip
