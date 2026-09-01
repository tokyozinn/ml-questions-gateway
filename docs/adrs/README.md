# Architecture Decision Records (ADRs)

Toda decisão relevante do projeto gera um ADR antes da implementação.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `business/` | Decisões de produto, negócio, compliance, priorização |
| `technical/` | Decisões de arquitetura, stack, integrações, padrões de código |

## Convenção de nomenclatura

```
ADR-{BIZ|TECH}-NNN-titulo-curto.md
```

## Status

| Status | Significado |
|---|---|
| `proposed` | Aguardando aprovação do coordenador |
| `accepted` | Aprovado — implementar |
| `rejected` | Rejeitado — não implementar |
| `superseded` | Substituído por ADR mais recente |

## Fluxo

1. Identificar dúvida ou ponto de risco → escalar ao **coordenador**
2. Coordenador decide → ADR criado/atualizado
3. SOT atualizada (versão incrementada) se comportamento do produto mudar
4. Implementação só após ADR `accepted`

## Índice

### Negócio

| ADR | Título | Status |
|---|---|---|
| [ADR-BIZ-001](business/ADR-BIZ-001-ai-first-answer-strategy.md) | Estratégia de resposta IA-first com contexto do produto | accepted |
| [ADR-BIZ-002](business/ADR-BIZ-002-mvp-scope-revision.md) | Revisão de escopo do MVP (inclui IA) | accepted |

### Técnica

| ADR | Título | Status |
|---|---|---|
| [ADR-TECH-001](technical/ADR-TECH-001-product-context-knowledge-base.md) | Base de conhecimento por produto (item ML) | accepted |
| [ADR-TECH-002](technical/ADR-TECH-002-seller-escalation-channel.md) | Sinalização ao seller quando IA não responde | accepted |
