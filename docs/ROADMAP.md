# Roadmap — ML Questions Gateway

Desenvolvimento em etapas. **Não avançar para próxima etapa sem aprovação do coordenador.**

Legenda: `[ ]` pendente | `[~]` em progresso | `[x]` concluído

---

## Épico 0 — Bootstrap (esta etapa)

| ID | Tipo | Descrição | Status |
|---|---|---|---|
| E0-T1 | Task | Criar repo GitHub + estrutura base | [x] |
| E0-T2 | Task | Cursor rules + ADRs iniciais | [x] |
| E0-T3 | Task | SOT v1.2.0 (IA-first + Product Context) | [x] |
| E0-T4 | Task | Aprovar ADR-BIZ-002 (escopo MVP revisado) | [x] |
| E0-T5 | Task | Aprovar ADR-TECH-002 (canal de escalonamento) | [x] |

---

## Épico 1 — Fundação (MVP demo) `[x]`

**Objetivo:** servidor rodando local + ngrok, health check, config.

| ID | Tipo | Descrição | Status | Branch |
|---|---|---|---|---|
| E1-US1 | História | Como operador, quero iniciar o servidor com variáveis validadas | [x] | `feature/e1-foundation` |
| E1-T1 | Task | Scaffold Node 22 + TypeScript + Fastify | [x] | |
| E1-T2 | Task | `config.ts` com Zod (env vars SOT §9) | [x] | |
| E1-T3 | Task | `GET /` e `GET /health` | [x] | |
| E1-T4 | Task | `.env.example` documentado | [x] | |

**Ação manual (coordenador):** fornecer credenciais ML + OpenAI no `.env`

---

## Épico 2 — Multi-tenant + OAuth

**Objetivo:** criar tenant, gerar connect link, completar OAuth ML.

| ID | Tipo | Descrição | Status | Branch |
|---|---|---|---|---|
| E2-US1 | História | Como operador, quero criar tenant e enviar link de conexão ML | [ ] | `feature/e2-oauth` |
| E2-T1 | Task | Prisma schema: Tenant, OAuthToken | [ ] | |
| E2-T2 | Task | `POST/GET /api/v1/tenants` (admin API) | [ ] | |
| E2-T3 | Task | `GET /connect/{tenant_id}` + `GET /auth/callback` | [ ] | |
| E2-T4 | Task | Token manager (save + refresh básico) | [ ] | |

**Ação manual (coordenador):** configurar Redirect URI no DevCenter ML

---

## Épico 3 — Webhook + Answer Engine IA

**Objetivo:** receber pergunta ML, buscar contexto do produto, responder com IA ou escalar.

| ID | Tipo | Descrição | Status | Branch |
|---|---|---|---|---|
| E3-US1 | História | Como tenant, quero que perguntas sejam respondidas automaticamente com base no meu anúncio | [ ] | `feature/e3-answer-engine` |
| E3-US2 | História | Como tenant, quero ser avisado quando o sistema não conseguir responder | [ ] | |
| E3-T1 | Task | `POST /notifications` (200 imediato + async) | [ ] | |
| E3-T2 | Task | Product Context builder (`GET /items`) + cache | [ ] | |
| E3-T3 | Task | Answer Engine IA-first (OpenAI) | [ ] | |
| E3-T4 | Task | Escalonamento: `escalated_questions` + `GET /api/v1/escalations` | [ ] | |
| E3-T5 | Task | Idempotência (`processed_questions`) | [ ] | |

**Ação manual (coordenador):** configurar Notification URL no DevCenter + ngrok

---

## Épico 4 — Demo go-live

**Objetivo:** demonstração funcional ao cliente.

| ID | Tipo | Descrição | Status | Branch |
|---|---|---|---|---|
| E4-US1 | História | Como operador, quero ver tenants e escalonamentos no painel admin básico | [ ] | `feature/e4-demo` |
| E4-T1 | Task | Admin UI mínima (`/admin`) | [ ] | |
| E4-T2 | Task | Script de teste end-to-end documentado | [ ] | |
| E4-T3 | Task | ngrok setup guide em `docs/DEPLOY-DEMO.md` | [ ] | |

---

## Backlog pós-MVP (P0 SOT)

- Fila BullMQ + Redis (retry)
- Job `missed_feeds`
- PostgreSQL (prod)
- Nonce OAuth assinado
- Cota rate limit por tenant
- Billing Stripe/Hotmart
- Testes automatizados (Vitest)
