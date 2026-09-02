# ML Questions Gateway — Source of Truth (SOT)

| Campo | Valor |
|---|---|
| Versão do documento | 1.2.0 |
| Status | Target spec (produto lançável) |
| Implementação de referência | **Node.js 22 LTS + TypeScript + Fastify** (ml-questions-gateway) |
| Última revisão | 2026-09-01 |
| Propósito | Especificação language-agnostic para reconstruir, auditar ou evoluir o produto independentemente da stack |

> **Nota de revisão (v1.2.0):** estratégia de resposta migrada para **IA-first com contexto obrigatório do produto** (§5.7, §6.3). Perguntas sem resposta confiável são **escalonadas ao seller** (§5.8), não respondidas com fallback genérico. `OPENAI_API_KEY` passa a ser obrigatória no MVP. Ver ADRs: BIZ-001, BIZ-002, TECH-001, TECH-002.
>
> **Nota de revisão (v1.1.0):** migração da implementação de referência de Python/FastAPI para Node.js/TypeScript, e inclusão da seção **12.1 — Riscos de negócio não mapeados**, identificada em revisão crítica.

## 1. Visão do produto

### 1.1 O que é

ML Questions Gateway é um serviço SaaS multi-tenant que funciona como gateway de automação entre vendedores do Mercado Livre e uma plataforma operadora (você). Cada cliente (tenant) autoriza a conta ML dele na sua única aplicação do DevCenter; a partir daí o gateway monitora perguntas nos anúncios e responde automaticamente conforme regras configuradas.

### 1.2 Proposta de valor

| Para o operador (você) | Para o cliente (tenant) |
|---|---|
| Uma app ML, N clientes | Respostas rápidas 24/7 |
| Onboarding via link | Menos perda de venda por demora |
| Billing integrado (Stripe/Hotmart) | Sem precisar entender API do ML |
| Painel admin centralizado | Conexão OAuth em 1 clique |

### 1.3 Fora de escopo (v1 target, explicitamente)

- Gestão de pedidos, envios, estoque ou preços ML
- Mensagens pós-venda (topic messages)
- Vertical VIS (imóveis/automóveis) via `vis_leads` — fluxo diferente
- App mobile nativo
- Marketplace de integrações de terceiros

### 1.4 Validação de mercado (pendência, adicionado em revisão crítica)

Este documento assume demanda de mercado sem citar validação. Antes de investir no backlog P1 (§13), recomenda-se:

- Confirmar diferencial competitivo frente a soluções já homologadas pelo Mercado Livre que empacotam resposta automática dentro de ERPs (ex.: Bling, Tiny, Olist), pois o mercado de "responder perguntas automaticamente" já tem players estabelecidos.
- Validar com 3–5 vendedores reais antes de fechar precificação e prioridades do backlog.
- Decidir se o produto buscará **homologação oficial** junto ao Mercado Livre (ver §12.1) — isso muda prazo, custo e arquitetura de conformidade.

## 2. Atores e responsabilidades

| Ator | Descrição |
|---|---|
| Operador | Dono do gateway; gerencia tenants, billing e configuração global |
| Tenant (cliente) | Vendedor ML que compra a solução e autoriza sua conta |
| Comprador ML | Faz perguntas nos anúncios (não interage com o gateway) |
| Mercado Livre | OAuth, API REST, webhooks de notificações |
| Z-API | Envio opcional de WhatsApp (alertas) |
| Stripe / Hotmart | Cobrança e webhooks de ciclo de vida da assinatura |

## 3. Contexto do sistema

```
┌─────────────┐     OAuth      ┌──────────────────┐     webhooks      ┌─────────────┐
│   Tenant    │──────────────▶│  ML Questions    │◀─────────────────│ Mercado Livre│
│  (vendedor) │               │     Gateway      │                   │             │
└─────────────┘               └────────┬─────────┘                   └─────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
              ┌──────────┐     ┌──────────┐      ┌──────────┐
              │  Stripe  │     │ Hotmart  │      │  Z-API   │
              │ webhooks │     │ webhooks │      │ (opt-in) │
              └──────────┘     └──────────┘      └──────────┘
```

## 4. Arquitetura lógica

### 4.1 Componentes

| Componente | Responsabilidade |
|---|---|
| HTTP API | Endpoints públicos e admin |
| OAuth Handler | Fluxo ML server-side por tenant |
| Notification Receiver | Recebe webhooks ML; responde 200 em ≤500ms |
| Question Processor | Orquestra busca, decisão e resposta |
| Answer Engine | Regras + IA opcional |
| Token Manager | Access/refresh token por seller ML |
| Tenant Service | CRUD e ciclo de vida de clientes |
| Billing Handler | Stripe/Hotmart → ativar/suspender tenant |
| WhatsApp Notifier | Z-API (feature-flagged) |
| Persistence | Tenants, tokens, idempotência, audit log |
| Admin UI | Painel web do operador |

### 4.2 Princípios de design

- **Multi-tenant single app ML** — um `client_id` no DevCenter; isolamento por `ml_user_id` + `tenant_id`
- **Webhook-first** — polling (`missed_feeds`) é fallback, não primário
- **Idempotência** — mesma pergunta nunca gera duas respostas
- **Fail-open no webhook** — HTTP 200 imediato; processamento assíncrono
- **Feature flags globais** — WhatsApp e auto-resposta desligáveis por env
- **Billing gate** — tenant suspended não processa nem conecta OAuth

## 5. Modelo de domínio

### 5.1 Entidade: Tenant

| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID string | PK |
| name | string | Nome comercial do cliente |
| slug | string unique | Identificador legível |
| ml_user_id | int nullable | Seller ID ML após OAuth |
| status | enum | Ver §5.2 |
| auto_answer_enabled | bool | Override por tenant |
| whatsapp_phone | string nullable | DDI+DDD+número, só dígitos |
| billing_email | string nullable | Match fallback Hotmart/Stripe |
| billing_provider | enum nullable | stripe \| hotmart |
| billing_external_id | string nullable | Subscription ID externo |
| connected_at | datetime nullable | Quando OAuth concluiu |
| created_at | datetime | |

### 5.2 Estados do tenant

```
                    ┌──────────┐
         create ──▶ │ pending  │ ◀── billing activate (sem ML ainda)
                    └────┬─────┘
                         │ OAuth OK
                         ▼
                    ┌──────────┐
                    │  active  │ ◀── billing activate (com ML)
                    └────┬─────┘
           suspend ◀─────┼─────▶ disconnect
                ┌────────┴────────┐
                ▼                 ▼
          ┌───────────┐    ┌──────────────┐
          │ suspended │    │ disconnected │
          └───────────┘    └──────────────┘
```

| Status | Pode conectar ML? | Processa perguntas? |
|---|---|---|
| pending | Sim | Não (sem token) |
| active | Não necessário | Sim |
| suspended | Não | Não |
| disconnected | Sim (reconnect) | Não |

### 5.3 Entidade: OAuth Token (por seller ML)

| Campo | Tipo |
|---|---|
| user_id | int PK (= ml_user_id) |
| access_token | string |
| refresh_token | string |
| expires_at | unix timestamp |

Refresh: `POST https://api.mercadolibre.com/oauth/token` com `grant_type=refresh_token`. Token expira em 6 horas. Refresh token é single-use (ML gera novo a cada refresh).

**Adicionado em revisão crítica:** o mecanismo de disparo do refresh não estava definido. Definir explicitamente: job agendado (ex.: a cada 5h para tokens ativos) *e* fallback lazy-refresh no primeiro 401 recebido de uma chamada à API ML. Sem isso, falha de refresh vira erro silencioso de não-resposta.

### 5.4 Entidade: Processed Question (idempotência)

| Campo | Tipo |
|---|---|
| question_id | int PK |
| seller_id | int |
| item_id | string |
| question_text | string |
| answer_text | string |
| processed_at | datetime |

### 5.5 Entidade: WhatsApp Notification (idempotência)

| Campo | Tipo |
|---|---|
| question_id | int PK |
| sent_at | datetime |

### 5.6 Entidade: Billing Event (audit)

| Campo | Tipo |
|---|---|
| id | autoincrement |
| provider | stripe \| hotmart |
| event_type | string |
| tenant_id | string nullable |
| external_id | string nullable |
| payload | text (truncado) |
| created_at | datetime |

### 5.7 Entidade: Product Context (base de conhecimento por anúncio)

Construída em tempo de processamento a partir de `GET /items/{item_id}` (cacheável). **Toda pergunta deve ter contexto de produto antes de qualquer tentativa de resposta.**

| Campo | Tipo | Fonte |
|---|---|---|
| item_id | string | `question.item_id` |
| title | string | `item.title` |
| description | string | `item.description` (plain text) |
| attributes | JSON | `item.attributes[]` (nome/valor) |
| price | number | `item.price` |
| available_quantity | int | `item.available_quantity` |
| shipping | JSON | `item.shipping` (frete grátis, etc.) |
| warranty | string nullable | `item.warranty` |
| cached_at | datetime | TTL default 1h |

Ver ADR-TECH-001.

### 5.8 Entidade: Escalated Question (sinalização ao seller)

Perguntas que a IA não consegue responder com confiança suficiente, ou cujo contexto do produto não está disponível.

| Campo | Tipo |
|---|---|
| question_id | int PK |
| tenant_id | UUID |
| item_id | string |
| question_text | string |
| reason | enum: `no_context`, `low_confidence`, `item_fetch_failed`, `sensitive_category` |
| product_context_snapshot | text (JSON truncado) |
| escalated_at | datetime |

**Não** entra em `processed_questions` — seller responde manualmente no ML. Ver ADR-TECH-002.

## 6. Fluxos principais

### 6.1 Onboarding do tenant (target)

```
Operador                    Gateway                     Tenant              Mercado Livre
   │                           │                          │                      │
   │ POST /api/v1/tenants      │                          │                      │
   │──────────────────────────▶│                          │                      │
   │◀ connect_url ─────────────│                          │                      │
   │                           │                          │                      │
   │ envia link ──────────────────────────────────────────▶│                      │
   │                           │                          │ GET /connect/{id}    │
   │                           │◀─────────────────────────│                      │
   │                           │ redirect OAuth ─────────────────────────────────▶│
   │                           │                          │ autoriza             │
   │                           │◀ callback code+state ────────────────────────────│
   │                           │ troca code → tokens      │                      │
   │                           │ tenant.status = active   │                      │
```

Pré-condições: tenant não `suspended`; conta ML é administrador (não operador/colaborador).

Pós-condições: tokens salvos; `ml_user_id` vinculado; unicidade 1 conta ML → 1 tenant.

**Adicionado em revisão crítica — risco de segurança:** o `state` do OAuth usa apenas `tenant_id` (UUID), sem nonce assinado ou expirável. Isso não impede que um link de `/connect/{tenant_id}` seja repassado/manipulado para vincular uma conta ML incorreta a um tenant. Requisito adicional: gerar um nonce de uso único e curta duração associado ao `tenant_id`, validado no callback, além de (idealmente) autenticação do próprio tenant antes de expor o link de connect.

### 6.2 Processamento de pergunta

```
ML webhook          Gateway              Processor           Answer Engine        ML API
    │                  │                     │                     │                │
    │ POST /notifications                   │                     │                │
    │─────────────────▶│ HTTP 200 (<500ms) │                     │                │
    │                  │ enqueue ───────────▶│                     │                │
    │                  │                     │ resolve tenant      │                │
    │                  │                     │ GET /questions/{id} │───────────────▶│
    │                  │                     │ if UNANSWERED:      │                │
    │                  │                     │ [WhatsApp if flag]  │                │
    │                  │                     │ generate answer ───▶│                │
    │                  │                     │ POST /answers ──────────────────────▶│
    │                  │                     │ mark processed      │                │
```

Regras de skip (não responde):

| Condição | Ação |
|---|---|
| topic != questions | Ignorar |
| Tenant não encontrado por user_id | Ignorar + log |
| status != active | Ignorar |
| Já em processed_questions | Ignorar |
| question.status != UNANSWERED | Ignorar |
| Texto vazio (ex.: BANNED) | Ignorar |
| auto_answer desligado (global ou tenant) | WhatsApp pode enviar; não responde |
| IA retorna `__ESCALATE__` ou contexto insuficiente | Escalonar ao seller (§5.8); **não** responder |
| `GET /items` falhou após retries | Escalonar ao seller |

### 6.3 Answer Engine (IA-first com contexto do produto)

**Adicionado em v1.2.0 — decisão do coordenador (ADR-BIZ-001).**

Fluxo obrigatório:

```
1. Resolver item_id da pergunta
2. Construir Product Context (§5.7) via GET /items/{item_id}
3. Se contexto indisponível → escalonar (§5.8), parar
4. Montar prompt com contexto do produto + pergunta
5. Chamar IA (modelo default: gpt-4o-mini)
6. Se IA retorna __ESCALATE__ → escalonar (§5.8), parar
7. Validar resposta (≤2.000 chars, sem alucinação) → POST /answers
```

Prioridade de resposta:

1. **IA com contexto do produto** (mecanismo primário; `OPENAI_API_KEY` obrigatória)
2. Regras por regex/palavra-chave do tenant (override opcional para casos específicos; first match wins)
3. **Escalonamento ao seller** — substitui fallback genérico; nunca enviar texto inventado

Limites ML: resposta máx. 2.000 caracteres; usar `api_version=4` nas consultas.

Categorias sensíveis (garantia, devolução, originalidade): se o contexto do anúncio não contém informação suficiente, **escalonar** em vez de responder.

**Risco legal (CDC):** respostas automáticas permanecem sob responsabilidade do tenant. Termo de uso deve refletir isso. Escalonamento reduz passivo de respostas incorretas.

Ver ADRs: BIZ-001, TECH-001, TECH-002.

### 6.4 WhatsApp (Z-API, opcional)

Feature flag: `FEATURE_WHATSAPP_ENABLED=false` (default).

Endpoint Z-API:

```
POST https://api.z-api.io/instances/{INSTANCE_ID}/token/{TOKEN}/send-text
Headers: Content-Type: application/json
         Client-Token: {optional}
Body: { "phone": "5511999999999", "message": "..." }
```

Telefone destino: `tenant.whatsapp_phone` → fallback `Z_API_NOTIFY_PHONE`.

Quando enviar: após validar pergunta UNANSWERED com texto; antes da auto-resposta; idempotente por `question_id`.

### 6.5 Billing

Stripe webhook: `POST /webhooks/billing/stripe`

- Verificar `Stripe-Signature` com `STRIPE_WEBHOOK_SECRET`
- Resolver tenant: `metadata.tenant_id` → `billing_external_id` → `billing_email`

| Eventos ativam | Eventos suspendem |
|---|---|
| checkout.session.completed | customer.subscription.deleted |
| customer.subscription.created/updated | invoice.payment_failed |
| invoice.paid | status past_due, unpaid, canceled |

Hotmart webhook: `POST /webhooks/billing/hotmart`

- Validar header `X-Hotmart-Hottok` (obrigatório em produção)
- Ativar: `PURCHASE_COMPLETE`, `PURCHASE_APPROVED`, `SUBSCRIPTION_RENEWED`
- Suspender: `PURCHASE_CANCELED`, `PURCHASE_REFUNDED`, `SUBSCRIPTION_CANCELLATION`, `PURCHASE_CHARGEBACK`

**Adicionado em revisão crítica:** o fallback de resolução por `billing_email` é frágil — divergência entre e-mail de cobrança e e-mail cadastrado no tenant gera evento "órfão" processado silenciosamente. Adicionar: log de alerta (nível warning+) quando a resolução cai no fallback por e-mail, e fila/tela manual de reconciliação para eventos não resolvidos.

## 7. Contrato de API (HTTP)

### 7.1 Públicos (sem auth)

| Método | Path | Descrição |
|---|---|---|
| GET | / | Metadados do serviço |
| GET | /health | Health check |
| GET | /connect/{tenant_id} | Redirect OAuth ML |
| GET | /auth/callback | Callback OAuth (code, state=tenant_id) |
| POST | /notifications | Webhook ML |
| POST | /webhooks/billing/stripe | Webhook Stripe |
| POST | /webhooks/billing/hotmart | Webhook Hotmart |

### 7.2 Admin (header `X-API-Key: {GATEWAY_API_KEY}`)

| Método | Path | Body | Descrição |
|---|---|---|---|
| POST | /api/v1/tenants | TenantCreate | Criar cliente |
| GET | /api/v1/tenants | — | Listar |
| GET | /api/v1/tenants/{id} | — | Detalhe |
| PATCH | /api/v1/tenants/{id} | TenantUpdate | Atualizar |
| POST | /api/v1/tenants/{id}/disconnect | — | Desvincular ML |
| GET | /api/v1/escalations | — | Listar perguntas escalonadas ao seller |
| GET | /api/v1/tenants/{id}/metrics | query: `period`, `refresh` | Métricas agregadas (EN) — consumo do dash admin |
| GET | /api/v1/tenants/{id}/metricas | query: `periodo`, `refresh` | Métricas financeiras (PT) — integração externa (ADR-TECH-004) |

### 7.3 Admin UI

| Path | Descrição |
|---|---|
| GET /admin | Painel web (auth via API key em sessionStorage) |
| GET /admin/metrics | Dashboard de métricas por tenant |

### 7.4 Schemas

TenantCreate:

```json
{
  "name": "string (required)",
  "slug": "string (optional)",
  "auto_answer_enabled": true,
  "whatsapp_phone": "5511999999999",
  "billing_email": "email@optional.com"
}
```

TenantResponse: inclui `connect_url` quando aplicável.

NotificationPayload (ML):

```json
{
  "resource": "/questions/5036111111",
  "user_id": 123456789,
  "topic": "questions",
  "application_id": 2069392825111111,
  "attempts": 1
}
```

Resposta imediata webhook: HTTP 200 em ≤500ms. Corpo sugerido: `{"status":"accepted","question_id":N}`.

## 8. Integração Mercado Livre

### 8.1 DevCenter (configuração única)

| Setting | Valor |
|---|---|
| Escopos | read + write |
| Redirect URI | {GATEWAY_PUBLIC_URL}/auth/callback (HTTPS em produção) |
| Notification URL | {GATEWAY_PUBLIC_URL}/notifications |
| Tópico | questions |

### 8.2 OAuth (Server Side)

Autorização:

```
GET https://auth.mercadolivre.com.br/authorization
  ?response_type=code
  &client_id={ML_APP_ID}
  &redirect_uri={ML_REDIRECT_URI}
  &state={tenant_id}
```

Troca de token:

```
POST https://api.mercadolibre.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&client_id={ML_APP_ID}
&client_secret={ML_CLIENT_SECRET}
&code={code}
&redirect_uri={ML_REDIRECT_URI}
```

### 8.3 Endpoints ML usados

| Operação | Método | URL |
|---|---|---|
| Buscar pergunta | GET | /questions/{id}?api_version=4 |
| Buscar item | GET | /items/{item_id} |
| Responder | POST | /answers body: {question_id, text} |
| Listar não respondidas | GET | /questions/search?seller_id={id}&status=UNANSWERED&api_version=4 |
| Notificações perdidas | GET | /missed_feeds?app_id={APP_ID}&topic=questions |

### 8.4 Status de pergunta relevantes

`UNANSWERED`, `ANSWERED`, `BANNED`, `CLOSED_UNANSWERED`, `DISABLED`, `UNDER_REVIEW`

## 9. Configuração (variáveis de ambiente)

| Variável | Obrigatória | Default | Descrição |
|---|---|---|---|
| ML_APP_ID | Sim | — | Client ID DevCenter |
| ML_CLIENT_SECRET | Sim | — | Secret DevCenter |
| ML_REDIRECT_URI | Sim | — | Callback OAuth |
| GATEWAY_API_KEY | Sim (prod) | — | Auth admin API/UI |
| GATEWAY_PUBLIC_URL | Sim | — | URL pública base |
| APP_NAME | Não | ML Questions Gateway | Branding |
| FEATURE_WHATSAPP_ENABLED | Não | false | Master switch WhatsApp |
| FEATURE_AUTO_ANSWER_ENABLED | Não | true | Master switch auto-resposta |
| OPENAI_API_KEY | **Sim (MVP)** | — | IA obrigatória (ADR-BIZ-001) |
| OPENAI_MODEL | Não | gpt-4o-mini | Modelo IA (barato e prático) |
| PRODUCT_CONTEXT_CACHE_TTL | Não | 3600 | TTL cache do item em segundos |
| Z_API_INSTANCE_ID | Se WhatsApp | — | Z-API |
| Z_API_TOKEN | Se WhatsApp | — | Z-API |
| Z_API_CLIENT_TOKEN | Não | — | Z-API security |
| Z_API_NOTIFY_PHONE | Não | — | Fallback telefone |
| STRIPE_WEBHOOK_SECRET | Se Stripe | — | Verificação assinatura |
| HOTMART_WEBHOOK_TOKEN | Se Hotmart | — | Header hottok |
| DATABASE_URL | Não | file:./data/bot.db | Persistência (Postgres em prod; SQLite via Prisma só em dev) |
| REDIS_URL | Se fila | redis://localhost:6379 | BullMQ (fila + retry, ver §13) |
| HOST / PORT | Não | 0.0.0.0:8000 | Server bind |

## 10. Segurança

| Requisito | Implementação target |
|---|---|
| Secrets em env, nunca em repo | `.env` + `.gitignore` |
| Admin API autenticada | `X-API-Key` |
| Stripe webhook | HMAC SHA256 signature |
| Hotmart webhook | `X-Hotmart-Hottok` obrigatório em prod |
| OAuth state | `state=tenant_id` (UUID) **+ nonce assinado/expirável (ver §6.1)** |
| Tokens ML | Server-side only; refresh automático (job + lazy-refresh, ver §5.3) |
| HTTPS | Obrigatório em produção (ML + webhooks) |
| Rate limiting | Target: aplicar em `/connect`, `/notifications`, **e cota interna por tenant para não estourar limite do app compartilhado (ver §12.1)** |
| Admin UI | Target: migrar API key para cookie httpOnly ou SSO |
| **LGPD (adicionado)** | **Definir base legal e política de retenção para `question_text`/`answer_text` de compradores (dados de terceiros armazenados sem consentimento direto)** |

## 11. Requisitos não-funcionais (target)

| Área | Requisito |
|---|---|
| Disponibilidade | 99.5% (MVP comercial) |
| Latência webhook | Resposta 200 em ≤500ms (exigência ML) |
| Throughput | Suportar dezenas de tenants; fila para picos |
| Persistência | PostgreSQL (prod); SQLite apenas dev/MVP local |
| Observabilidade | Logs estruturados + métricas (perguntas/min, erros, latency) |
| Recuperação | Job `missed_feeds` a cada 15min |
| Retry | Fila com backoff para falhas em `POST /answers` |
| Backup | DB diário; retenção `billing_events` 90 dias |
| **Cota por tenant (adicionado)** | **Limitar throughput por tenant para não estourar rate limit do app ML compartilhado por todos os tenants** |

## 12. Matriz de prontidão para lançamento

Legenda: ✅ Implementado \| ⚠️ Parcial \| ❌ Não implementado \| 🔴 Bloqueador (decisão do operador)

| Capacidade | Status atual | Target launch | Prioridade |
|---|---|---|---|
| Multi-tenant OAuth | ✅ | ✅ | — |
| Webhook ML questions | ✅ | ✅ | — |
| Auto-resposta IA-first + contexto produto | ❌ 🔴 | ✅ | **P0 (v1.2.0)** |
| Escalonamento ao seller | ❌ 🔴 | ✅ | **P0 (v1.2.0)** |
| Base de conhecimento por item (Product Context) | ❌ 🔴 | ✅ | **P0 (v1.2.0)** |
| Idempotência resposta | ✅ | ✅ | — |
| Feature flag WhatsApp | ✅ | ✅ | — |
| Admin panel | ✅ | ✅ | — |
| Billing Stripe/Hotmart | ⚠️ | ✅ | P1 |
| Fila + retry falhas | ❌ 🔴 | ✅ | P0 |
| Job missed_feeds | ❌ 🔴 | ✅ | P0 |
| PostgreSQL (prod) | ❌ 🔴 | ✅ | P0 |
| Regras por tenant | ❌ 🔴 | ✅ | P0 |
| Nonce OAuth assinado | ❌ 🔴 | ✅ | **P0 (adicionado)** |
| Cota de rate limit por tenant | ❌ 🔴 | ✅ | **P0 (adicionado)** |
| Portal self-service cliente | ❌ 🔴 | ✅ | P1 |
| Checkout Stripe automático | ❌ 🔴 | ✅ | P1 |
| Remover /auth/login legado | ❌ 🔴 | ✅ | P0 |
| Testes automatizados | ❌ 🔴 | ✅ | P0 |
| OAuth success page (HTML) | ❌ | ✅ | P2 |
| Rate limiting | ❌ | ✅ | P2 |
| Monitoramento/alertas | ❌ | ✅ | P2 |
| Política de retenção LGPD | ❌ | ✅ | **P1 (adicionado)** |
| Decisão sobre homologação ML | ❌ | ✅ | **P1 (adicionado)** |
| PKCE OAuth | ❌ | Opcional | P3 |
| Multi-país (MLA, MLM…) | ❌ | Opcional | P3 |

### 12.1 Riscos de negócio não mapeados (adicionado em revisão crítica)

Estes riscos não são bugs de implementação — são decisões estratégicas que a SOT original não expõe:

1. **Concentração em um único app ML (single point of failure de negócio).** Toda a base de tenants depende de um único `client_id` no DevCenter. Se um tenant violar política do Mercado Livre (spam, resposta enganosa, denúncias), o ML pode limitar ou suspender o aplicativo inteiro — derrubando *todos* os clientes simultaneamente, não só o infrator. Isso não tem mitigação técnica trivial; é uma decisão de produto (ex.: monitorar reputação por tenant e desconectar proativamente outliers antes que afetem o app todo).
2. **Falta de homologação oficial.** Provedores estabelecidos no ecossistema ML (Bling, Tiny, LogManager, etc.) operam como aplicativos homologados, com nível de serviço monitorado pelo próprio Mercado Livre. Operar sem esse status é viável para validar o produto, mas é um risco a ser reavaliado antes de escalar comercialmente — muda a percepção de confiabilidade do tenant e pode ser exigido para lidar com volume maior de contas.
3. **Diferenciação competitiva não declarada.** O mercado de resposta automática de perguntas já tem players consolidados, muitas vezes embutidos em ERPs que o vendedor já usa. Nada na SOT define por que um tenant escolheria este produto isoladamente.

## 13. Backlog priorizado (bloqueadores confirmados)

### P0 — Antes de cobrar clientes

- **Fila de processamento + retry**
  - Ao falhar `GET /questions`, `GET /items` ou `POST /answers`, reenfileirar com backoff (ex.: 3 tentativas em 1/5/15 min)
  - Não marcar `processed_questions` até sucesso confirmado
  - Implementação de referência: **BullMQ + Redis**
- **Job missed_feeds**
  - Worker agendado: `GET /missed_feeds?app_id={ML_APP_ID}&topic=questions`
  - Reprocessar notificações perdidas (ML guarda até 2 dias)
  - Implementação de referência: **BullMQ repeatable job** ou `node-cron`
- **Migrar persistência para PostgreSQL**
  - Substituir SQLite; connection pool; migrations versionadas com **Prisma Migrate** (ou Knex, se preferir SQL builder em vez de ORM)
- **Regras de resposta por tenant**
  - Tabela `tenant_answer_rules` ou JSON config por tenant
  - Admin UI: editar regras por cliente
- **Nonce OAuth assinado (adicionado)**
  - Gerar nonce de uso único, curta duração, vinculado ao `tenant_id`; validar no callback além do `state`
- **Cota de rate limit por tenant (adicionado)**
  - Throttling interno por tenant para não permitir que um cliente de alto volume consuma o rate limit do app inteiro
- **Remover rota /auth/login legada**
  - OAuth sem `state` quebra multi-tenant; redirecionar para documentação
- **Suite de testes mínima**
  - Unit: answer engine, tenant state machine, billing handlers — **Vitest**
  - Integration: webhook → processor (mock ML API) — **Vitest + nock/msw**
  - E2E: OAuth callback mock

### P1 — Experiência comercial

- **Portal self-service do tenant**
  - Ver status da conexão ML, link reconnect, toggle auto-resposta, histórico de perguntas
- **Checkout Stripe automático**
  - Ao criar tenant → gerar Payment Link / Checkout Session com `metadata.tenant_id`
  - Retornar URL de pagamento no `TenantResponse`
- **Hotmart hottok obrigatório em prod**
  - Rejeitar webhooks sem token quando `ENV=production`
- **Política de retenção LGPD (adicionado)**
  - Definir prazo de retenção de `question_text`/`answer_text`, base legal e processo de exclusão sob solicitação
- **Decisão sobre homologação ML (adicionado)**
  - Avaliar custo/prazo de submeter o app ao processo de homologação do Mercado Livre antes de escalar comercialmente

### P2 — Operação

- Página HTML de sucesso/erro pós-OAuth
- Rate limiting e IP allowlist (ML notification IPs documentados)
- Dashboard de métricas

## 14. Mapa da implementação de referência (Node.js/TypeScript)

```
ml-questions-bot/
├── src/
│   ├── server.ts               # Fastify app bootstrap
│   ├── config.ts               # Settings / feature flags (zod-validated env)
│   ├── db/
│   │   ├── prisma/schema.prisma
│   │   └── client.ts
│   ├── plugins/
│   │   └── apiKeyGuard.ts      # Admin API key guard (Fastify plugin)
│   ├── routes/
│   │   ├── gateway.ts          # Admin API + OAuth + connect
│   │   ├── notifications.ts    # ML webhook
│   │   ├── billing.ts          # Stripe/Hotmart webhooks
│   │   ├── adminPanel.ts       # Admin UI (SSR ou API para SPA)
│   │   └── auth.ts             # LEGADO — remover (P0)
│   ├── services/
│   │   ├── tenantService.ts
│   │   ├── tokenManager.ts
│   │   ├── mlClient.ts
│   │   ├── questionProcessor.ts
│   │   ├── answerEngine.ts
│   │   ├── zapiClient.ts
│   │   └── billingService.ts
│   ├── queues/
│   │   ├── questionQueue.ts    # BullMQ — fila + retry (P0)
│   │   └── missedFeedsJob.ts   # BullMQ repeatable job (P0)
│   ├── schemas/
│   │   └── tenant.ts           # zod schemas (validação + tipos)
│   └── views/admin.html
├── scripts/
│   ├── setup.sh
│   ├── start-dev.sh
│   └── poll.ts                 # Polling manual (dev)
├── docs/SOT.md                 # Este documento
├── .env.example
├── package.json
└── tsconfig.json
```

**Notas de stack (adicionado):**

- **Fastify** em vez de Express: overhead menor, validação de schema nativa via JSON Schema/`fastify-type-provider-zod`, bom encaixe para workload I/O-bound (webhooks).
- **Prisma** para ORM + migrations versionadas (substitui Alembic da stack Python).
- **BullMQ + Redis** para fila e retry (P0) e para o job `missed_feeds` — não existe equivalente direto do Celery/APScheduler em Node com a mesma maturidade fora do ecossistema BullMQ.
- **Zod** para validação de payloads (webhooks ML, Stripe, Hotmart) — substitui o papel do Pydantic.
- **Vitest** para testes unitários e de integração.
- **TypeScript obrigatório**, não JavaScript puro — dado que o sistema lida com billing e tokens, tipagem estática reduz uma classe inteira de bugs silenciosos.

## 15. Guia de reconstrução (qualquer linguagem)

Para reimplementar a partir desta SOT:

1. Implementar Tenant Service + schema §5
2. Implementar OAuth handler §6.1 + §8.2 (incluindo nonce assinado, ver nota de risco)
3. Implementar Notification receiver §6.2 + §7.1 (200 imediato + async)
4. Implementar ML API client §8.3
5. Implementar Answer engine §6.3
6. Implementar Token manager com refresh §5.3 (job + lazy-refresh)
7. Adicionar Billing handlers §6.5
8. Adicionar WhatsApp condicional §6.4 + `FEATURE_WHATSAPP_ENABLED`
9. Construir Admin API §7.2 + UI §7.3
10. Fechar bloqueadores P0 §13 antes de produção

Ordem de teste manual:

```
1. POST /api/v1/tenants → connect_url
2. Abrir connect_url → OAuth → callback OK
3. Simular POST /notifications com question_id real
4. Verificar resposta publicada no anúncio ML
5. Simular webhook Stripe activate/suspend
```

## 16. Referências externas

| Recurso | URL |
|---|---|
| ML — Perguntas e respostas | https://developers.mercadolivre.com.br/pt_br/perguntas-e-respostas |
| ML — Notificações | https://developers.mercadolivre.com.br/pt_br/produto-receba-notificacoes |
| ML — OAuth | https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao |
| ML — Criar aplicação | https://developers.mercadolivre.com.br/pt_br/crie-uma-aplicacao-no-mercado-livre |
| Z-API — Intro | https://developer.z-api.io/quickstart/introduction |
| Z-API — Send text | https://developer.z-api.io/message/send-text |
| Z-API — Auth | https://developer.z-api.io/security/introduction |

## 17. Controle de versão deste documento

| Versão | Data | Mudança |
|---|---|---|
| 1.0.0 | 2026-09-01 | Spec inicial target; bloqueadores P0–P2 definidos |
| 1.1.0 | 2026-09-01 | Migração da stack de referência para Node.js/TypeScript; adição de riscos críticos (§1.4, §12.1) e requisitos derivados (nonce OAuth, cota por tenant, LGPD, homologação ML) |
| 1.2.0 | 2026-09-01 | IA-first com contexto obrigatório do produto (§5.7, §6.3); escalonamento ao seller (§5.8); `OPENAI_API_KEY` obrigatória no MVP. ADRs: BIZ-001, BIZ-002, TECH-001, TECH-002 |
| 1.3.0 | 2026-09-02 | Endpoint `GET /api/v1/tenants/{id}/metricas` (contrato PT para integração externa); dash permanece em `/metrics` (EN). ADR-TECH-004 |

Regra: qualquer mudança de comportamento do produto deve atualizar este SOT (incrementar versão) **e** gerar ADR antes do código. Este arquivo é a fonte da verdade.
