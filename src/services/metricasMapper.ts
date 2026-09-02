import type { TenantMetricsResponse } from "../types/metrics.js";
import type {
  AvisoMetrica,
  MetricasPeriodo,
  TenantMetricasResponse,
} from "../types/metricas.js";

function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function mapCharge(row: { label: string; amount: number; type: string }): {
  descricao: string;
  valor: number;
  tipo: string;
} {
  return {
    descricao: row.label,
    valor: row.amount,
    tipo: row.type,
  };
}

function translateAviso(err: {
  source: string;
  message: string;
  status?: number;
}): AvisoMetrica {
  const lower = err.message.toLowerCase();
  if (
    err.source === "ads" ||
    err.source === "ads_metrics" ||
    lower.includes("product ads")
  ) {
    return {
      fonte: "ads",
      mensagem: "Product Ads não habilitado nesta conta",
      ...(err.status !== undefined && { status: err.status }),
    };
  }
  if (err.source.startsWith("billing")) {
    return {
      fonte: "custos_ml",
      mensagem: "Não foi possível obter o resumo de faturamento do ML",
      ...(err.status !== undefined && { status: err.status }),
    };
  }
  if (err.source === "traffic") {
    return {
      fonte: "trafego",
      mensagem: "Não foi possível obter visitas no período",
      ...(err.status !== undefined && { status: err.status }),
    };
  }
  return {
    fonte: err.source,
    mensagem: err.message,
    ...(err.status !== undefined && { status: err.status }),
  };
}

export function mapToMetricasResponse(
  raw: TenantMetricsResponse,
): TenantMetricasResponse {
  return {
    cliente_id: raw.tenant_id,
    cliente_nome: raw.tenant_name,
    ml_user_id: raw.ml_user_id,
    periodo_dias: raw.period_days as MetricasPeriodo,
    data_inicio: toDateOnly(raw.date_from),
    data_fim: toDateOnly(raw.date_to),
    consultado_em: raw.fetched_at,
    em_cache: raw.cached,
    moeda: raw.financial.currency_id,
    vendas: {
      quantidade: raw.financial.orders_count,
      receita_bruta: raw.financial.gross_revenue,
      ticket_medio: raw.financial.avg_ticket,
    },
    investimento: {
      ads_disponivel: raw.ads.available,
      gasto_ads: raw.financial.ad_spend,
      roas: raw.financial.roas,
    },
    custos_ml: {
      disponivel: raw.billing.available,
      comissoes_e_taxas: raw.financial.ml_fees,
      ...(raw.billing.period_key && {
        periodo_faturamento: raw.billing.period_key,
      }),
      cobrancas: (raw.billing.charges ?? []).map(mapCharge),
      bonus: (raw.billing.bonuses ?? []).map(mapCharge),
    },
    resultado: {
      receita_liquida_estimada: raw.financial.net_revenue_estimated,
      margem_apos_ads: raw.financial.margin_after_ads,
    },
    trafego: { visitas: raw.traffic.total_visits },
    anuncios: { ativos: raw.listings.active_count },
    avisos: raw.partial_errors.map(translateAviso),
  };
}
