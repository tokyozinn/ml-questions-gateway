# ML Questions Gateway

Gateway SaaS multi-tenant de automação de respostas a perguntas do Mercado Livre.

## Documentação

| Documento | Descrição |
|---|---|
| [docs/SOT.md](docs/SOT.md) | Source of Truth (spec completa) — **v1.2.0** |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Épicos, histórias e tasks |
| [docs/adrs/](docs/adrs/) | Architecture Decision Records |

## Stack (referência)

- Node.js 22 LTS + TypeScript + Fastify
- Prisma (SQLite dev / PostgreSQL prod)
- OpenAI `gpt-4o-mini` (IA-first com contexto do produto)
- BullMQ + Redis (pós-MVP)

## Status

**Etapa 0 — Bootstrap** em andamento. Ver [ROADMAP](docs/ROADMAP.md).

## Governança

- Coordenador aprova todas as decisões
- Toda decisão → ADR
- Mudança de comportamento → SOT (versão incrementada)
- Desenvolvimento em etapas via Gitflow (feature → PR → develop → main)

## Ações manuais do coordenador

- [x] Aprovar ADR-BIZ-002 (escopo MVP revisado)
- [x] Aprovar ADR-TECH-002 (canal de escalonamento)
- [ ] Fornecer credenciais ML DevCenter
- [ ] Fornecer `OPENAI_API_KEY`
- [ ] Configurar ngrok para demo
