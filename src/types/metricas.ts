export type MetricasPeriodo = 30 | 60 | 90;

export interface AvisoMetrica {
  fonte: string;
  mensagem: string;
  status?: number;
}

export interface TenantMetricasResponse {
  cliente_id: string;
  cliente_nome: string;
  ml_user_id: number;
  periodo_dias: MetricasPeriodo;
  data_inicio: string;
  data_fim: string;
  consultado_em: string;
  em_cache: boolean;
  moeda: string;
  vendas: {
    quantidade: number;
    receita_bruta: number;
    ticket_medio: number;
  };
  investimento: {
    ads_disponivel: boolean;
    gasto_ads: number;
    roas: number;
  };
  custos_ml: {
    disponivel: boolean;
    comissoes_e_taxas: number;
    periodo_faturamento?: string;
    cobrancas: Array<{ descricao: string; valor: number; tipo: string }>;
    bonus: Array<{ descricao: string; valor: number; tipo: string }>;
  };
  resultado: {
    receita_liquida_estimada: number;
    margem_apos_ads: number;
  };
  trafego: { visitas: number };
  anuncios: { ativos: number };
  avisos: AvisoMetrica[];
}
