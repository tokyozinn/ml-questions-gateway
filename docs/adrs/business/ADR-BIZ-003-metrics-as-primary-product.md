# ADR-BIZ-003: Métricas financeiras como produto principal

| Campo | Valor |
|---|---|
| Status | **accepted** |
| Data | 2026-09-02 |
| Decisor | Coordenador do projeto |
| Categoria | Negócio |

## Contexto

O projeto iniciou como **ML Questions Gateway** (automação de respostas a perguntas). A infraestrutura base (OAuth, tokens, ngrok, painel admin) está operacional.

O coordenador definiu que a **funcionalidade principal passa a ser métricas da conta ML**, com foco em análise financeira (receita, gasto com ads, ROAS, comissões). O gateway de questions permanece no escopo, mas deixa de ser o diferencial comercial imediato.

## Decisão proposta

1. **Produto principal:** dashboard de métricas financeiras e operacionais por tenant conectado.
2. **Questions gateway:** mantido na SOT e no código; sem remoção de funcionalidades existentes.
3. **MVP desta feature (Épico 5):**
   - Seletor tenant + período (30/60/90 dias)
   - KPIs financeiros: receita bruta, gasto ads, ROAS, comissões ML, margem estimada
   - Blocos operacionais: reputação, visitas, pedidos, billing, Product Ads
4. **Demo go-live:** operador seleciona tenant conectado e visualiza painel financeiro completo.

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
|---|---|
| Substituir questions por métricas (remover webhook) | Perde demo já funcional; coordenador pediu manter SOT |
| Métricas só do operador (single account) | Não aproveita multi-tenant já implementado |
| MVP só reputação + visitas | Insuficiente para análise financeira solicitada |

## Consequências

- Novo épico no ROADMAP (E5) priorizado sobre backlog P0 restante.
- SOT receberá seção complementar de métricas (sem remover seções de questions).
- App ML pode precisar permissões adicionais (billing, ads) — ação manual do coordenador.
- Posicionamento comercial do produto evolui de "resposta automática" para "inteligência financeira + operação ML".

## Referências

- Spec: `docs/superpowers/specs/2026-09-02-tenant-metrics-dashboard-design.md`
- ADR-TECH-003
- SOT §1 (visão do produto — atualização futura)
