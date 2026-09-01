# ADR-BIZ-001: Estratégia de resposta IA-first com contexto do produto

| Campo | Valor |
|---|---|
| Status | **accepted** |
| Data | 2026-09-01 |
| Decisor | Coordenador do projeto |
| Categoria | Negócio |

## Contexto

A SOT v1.1.0 definia o Answer Engine com prioridade: (1) regex/palavra-chave, (2) IA opcional, (3) fallback genérico. O coordenador identificou que:

- Toda pergunta recebida está vinculada a um anúncio (`item_id`) e deve ter contexto do produto.
- Muitas perguntas podem ser respondidas com base na descrição e atributos do anúncio.
- Respostas baseadas apenas em regex são insuficientes para cobrir a variedade de perguntas reais.
- Perguntas que não puderem ser respondidas com confiança devem ser **sinalizadas ao seller**, não respondidas com texto genérico enganoso.

## Decisão

1. **IA-first**: o motor de respostas usará um modelo de linguagem prático e de baixo custo (default: `gpt-4o-mini`) como mecanismo primário.
2. **Contexto obrigatório**: toda tentativa de resposta inclui a base de conhecimento do produto (ver ADR-TECH-001).
3. **Regex como complemento opcional**: regras por tenant podem existir para casos específicos (ex.: resposta fixa de frete grátis), mas não substituem a IA como caminho principal.
4. **Escalation ao seller**: quando a IA não conseguir responder com confiança suficiente, a pergunta é sinalizada ao seller em vez de enviar resposta automática (ver ADR-TECH-002).
5. **Responsabilidade do tenant**: respostas automáticas permanecem sob responsabilidade do vendedor (CDC); termo de uso deve refletir isso.

## Consequências

### Positivas

- Maior taxa de respostas úteis sem manutenção manual de dezenas de regex.
- Reduz risco de respostas genéricas incorretas sobre garantia, devolução, etc.
- Alinhado com proposta de valor ("respostas rápidas 24/7 com qualidade").

### Negativas

- Custo por pergunta (tokens OpenAI) — mitigado com modelo barato e cache de contexto do item.
- Latência adicional vs. regex pura — aceitável dado processamento assíncrono pós-webhook.
- Dependência de `OPENAI_API_KEY` passa a ser **obrigatória** no MVP revisado.

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
|---|---|
| Regex-first (SOT v1.1.0) | Baixa cobertura; alto custo de manutenção por tenant |
| IA sem contexto do produto | Risco de alucinação; respostas desconectadas do anúncio |
| Sempre responder (nunca escalar) | Risco legal (CDC) e reputação do seller |

## Referências

- SOT §6.3 (atualizado em v1.2.0)
- ADR-TECH-001 — Base de conhecimento por produto
- ADR-TECH-002 — Sinalização ao seller
