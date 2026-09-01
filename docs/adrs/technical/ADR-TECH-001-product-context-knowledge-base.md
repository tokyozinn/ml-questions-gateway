# ADR-TECH-001: Base de conhecimento por produto (item ML)

| Campo | Valor |
|---|---|
| Status | **accepted** |
| Data | 2026-09-01 |
| Decisor | Coordenador do projeto |
| Categoria | Técnica |

## Contexto

Toda pergunta ML chega com `item_id` (anúncio). Para responder com qualidade, o sistema precisa de uma **base de conhecimento** vinculada ao produto — não apenas o texto da pergunta isolado.

A SOT v1.1.0 mencionava `GET /items/{item_id}` no fluxo, mas não explicitava isso como requisito formal de "knowledge base".

## Decisão

### 1. Entidade implícita: Product Context (por `item_id`)

Construída em tempo de processamento (cacheável) a partir da API ML:

| Campo | Fonte ML API |
|---|---|
| `item_id` | `GET /questions/{id}` → `item_id` |
| `title` | `GET /items/{item_id}` → `title` |
| `description` | `GET /items/{item_id}` → `description` (plain text) |
| `attributes` | `GET /items/{item_id}` → `attributes[]` (nome/valor) |
| `price` | `GET /items/{item_id}` → `price` |
| `available_quantity` | `GET /items/{item_id}` → `available_quantity` |
| `shipping` | `GET /items/{item_id}` → `shipping` (frete grátis, etc.) |
| `warranty` | `GET /items/{item_id}` → `warranty` (se presente) |
| `seller_custom_field` | Campos customizados do anúncio, se houver |

### 2. Cache

- Cache em memória/DB com TTL configurável (default: 1h) para evitar chamadas repetidas ao ML para o mesmo item.
- Invalidação: TTL expira naturalmente; refresh forçado no primeiro 404/stale.

### 3. Prompt da IA

O Answer Engine monta um prompt estruturado:

```
Contexto do produto:
- Título: {title}
- Descrição: {description}
- Atributos: {attributes formatted}
- Preço: {price}
- Estoque: {available_quantity}
- Frete: {shipping summary}

Pergunta do comprador: {question_text}

Instruções: Responda APENAS com base no contexto acima. Se não houver informação suficiente, responda com o token especial __ESCALATE__.
```

### 4. Validação ML

- Usar `api_version=4` em todas as chamadas de questions (conforme doc ML MCP).
- Confirmar campos disponíveis via MCP Mercado Livre antes de cada integração nova.

## Consequências

- `questionProcessor` **deve** buscar item antes de chamar Answer Engine.
- Falha em `GET /items` → reenfileirar/retry (P0 futuro) ou escalar ao seller se esgotar tentativas.
- Aumenta consumo de rate limit ML — mitigado por cache.

## Referências

- SOT §5.7 (novo), §6.3, §8.3
- ML API: `GET /items/{item_id}`, `GET /questions/{id}?api_version=4`
- MCP Mercado Livre: `/perguntas-e-respostas`
