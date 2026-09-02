# Guia de Demo — Go-live Local + ngrok

Este guia cobre o go-live de demonstração ao cliente usando servidor local exposto via ngrok.

## Pré-requisitos

| Item | Ação |
|---|---|
| Node.js 22+ | Já instalado |
| Conta DevCenter ML | App criada com escopos read + write |
| OpenAI API Key | Para Answer Engine (ADR-BIZ-001) |
| ngrok | [ngrok.com/download](https://ngrok.com/download) |

## 1. Configurar ambiente

```powershell
cd C:\Users\Andre\Projects\ml-questions-gateway
copy .env.example .env
```

Preencha no `.env`:

```env
ML_APP_ID=seu_app_id
ML_CLIENT_SECRET=seu_secret
GATEWAY_API_KEY=uma-chave-segura
OPENAI_API_KEY=sk-...
GATEWAY_PUBLIC_URL=https://SEU_SUBDOMINIO.ngrok-free.app
ML_REDIRECT_URI=https://SEU_SUBDOMINIO.ngrok-free.app/auth/callback
```

> **Importante:** `GATEWAY_PUBLIC_URL` e `ML_REDIRECT_URI` devem usar a URL do ngrok (passo 2).

## 2. Iniciar servidor + ngrok

Terminal 1 — servidor:

```powershell
npm run db:push
npm run dev
```

Terminal 2 — ngrok:

```powershell
ngrok http 8000
```

Copie a URL HTTPS gerada (ex: `https://abc123.ngrok-free.app`) e atualize `.env`:

- `GATEWAY_PUBLIC_URL`
- `ML_REDIRECT_URI`

Reinicie o servidor após alterar `.env`.

## 3. Configurar DevCenter ML

Acesse [applications.mercadolibre.com](https://applications.mercadolibre.com/) e configure:

| Campo | Valor |
|---|---|
| Redirect URI | `https://{ngrok}/auth/callback` |
| Notification URL | `https://{ngrok}/notifications` |
| Tópico | `questions` |

## 4. Fluxo de demonstração

### 4.1 Painel admin

Abra: `https://{ngrok}/admin`

1. Informe a `GATEWAY_API_KEY`
2. Crie um tenant (ex: "Loja Demo")
3. Clique em **Conectar ML** → autorize com conta de testes
4. Confirme status `active` na lista

### 4.2 Testar pergunta

1. Acesse um anúncio da conta conectada no Mercado Livre
2. Faça uma pergunta (ex: "Qual o prazo de entrega?")
3. Aguarde ~10s
4. Verifique:
   - Resposta automática no anúncio (se contexto suficiente)
   - Ou escalonamento em `/admin` → seção Escalonamentos

### 4.3 Script automatizado (smoke test)

```powershell
.\scripts\demo-test.ps1 -ApiKey "sua-chave" -BaseUrl "http://localhost:8000"
```

## 5. Troubleshooting

| Problema | Solução |
|---|---|
| OAuth falha | Verificar Redirect URI exata no DevCenter |
| Webhook não chega | Verificar Notification URL + ngrok ativo |
| IA não responde | Verificar `OPENAI_API_KEY` no `.env` |
| Escalonamento sempre | Pergunta pode exigir info não presente no anúncio |
| `invalid_operator_user_id` | Usar conta **administrador**, não colaborador |

## 6. Ordem de teste manual (SOT §15)

```
1. POST /api/v1/tenants → connect_url
2. Abrir connect_url → OAuth → callback OK
3. Simular POST /notifications com question_id real
4. Verificar resposta publicada no anúncio ML
5. Verificar escalonamentos em GET /api/v1/escalations
6. (Integração) GET /api/v1/tenants/{id}/metricas?periodo=30
```

## 7. API `/metricas` (consumo externo)

Contrato em português para outro sistema (ADR-TECH-004). Auth: mesma `X-API-Key`.

```powershell
$tenantId = "UUID-DO-TENANT"
$apiKey = "sua-GATEWAY_API_KEY"
Invoke-RestMethod -Headers @{ "X-API-Key" = $apiKey } `
  -Uri "http://localhost:8000/api/v1/tenants/$tenantId/metricas?periodo=30"
```

Via ngrok:

```powershell
Invoke-RestMethod -Headers @{ "X-API-Key" = $apiKey } `
  -Uri "https://{ngrok}/api/v1/tenants/$tenantId/metricas?periodo=30&refresh=1"
```

Resposta inclui `vendas`, `investimento`, `custos_ml`, `resultado`, `trafego`, `anuncios`, `avisos`. Spec: `docs/superpowers/specs/2026-09-02-tenant-metricas-api-design.md`.

## Ações manuais do coordenador

- [ ] Criar/configurar app no DevCenter ML
- [ ] Fornecer credenciais no `.env`
- [ ] Subir ngrok e atualizar URLs
- [ ] Conta ML de testes (administrador, não colaborador)
- [ ] Anúncio ativo para receber perguntas de teste
