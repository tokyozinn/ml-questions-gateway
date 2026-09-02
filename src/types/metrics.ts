export type MetricsPeriod = 30 | 60 | 90;

export interface PartialError {
  source: string;
  message: string;
  status?: number;
}

export interface FinancialSummary {
  gross_revenue: number;
  orders_count: number;
  avg_ticket: number;
  ad_spend: number;
  ml_fees: number;
  net_revenue_estimated: number;
  roas: number;
  margin_after_ads: number;
  currency_id: string;
}

export interface TenantMetricsResponse {
  tenant_id: string;
  tenant_name: string;
  ml_user_id: number;
  period_days: MetricsPeriod;
  date_from: string;
  date_to: string;
  fetched_at: string;
  cached: boolean;
  financial: FinancialSummary;
  reputation: Record<string, unknown> | null;
  orders: { total: number; recent: Array<Record<string, unknown>> };
  ads: {
    available: boolean;
    advertiser_id?: number;
    metrics_summary?: Record<string, unknown>;
  };
  billing: {
    available: boolean;
    period_key?: string;
    charges?: Array<{ label: string; amount: number; type: string }>;
    bonuses?: Array<{ label: string; amount: number; type: string }>;
    total_collected?: number;
  };
  traffic: { total_visits: number };
  listings: { active_count: number };
  partial_errors: PartialError[];
}
