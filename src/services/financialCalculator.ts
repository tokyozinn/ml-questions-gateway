import type { FinancialSummary } from "../types/metrics.js";

const PAID_STATUSES = new Set(["paid"]);

export function sumOrderRevenue(
  orders: Array<Record<string, unknown>>,
): { revenue: number; count: number; currency: string } {
  let revenue = 0;
  let count = 0;
  let currency = "BRL";

  for (const order of orders) {
    const status = String(order.status ?? "");
    if (!PAID_STATUSES.has(status)) continue;

    revenue += Number(order.total_amount ?? 0);
    count += 1;
    if (order.currency_id) currency = String(order.currency_id);
  }

  return { revenue, count, currency };
}

export function sumBillingFees(
  charges:
    | Array<{ label: string; amount: number; type: string }>
    | undefined,
  excludeTypes: string[] = ["PADS"],
): number {
  if (!charges) return 0;
  return charges
    .filter((c) => !excludeTypes.includes(c.type))
    .reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
}

export function extractAdsCost(
  adsPayload: Record<string, unknown> | undefined,
): number {
  const summary = adsPayload?.metrics_summary as
    | Record<string, unknown>
    | undefined;
  return Number(summary?.cost ?? 0);
}

export function extractAdsRoas(
  adsPayload: Record<string, unknown> | undefined,
): number | null {
  const summary = adsPayload?.metrics_summary as
    | Record<string, unknown>
    | undefined;
  const roas = Number(summary?.roas ?? NaN);
  return Number.isFinite(roas) ? roas : null;
}

export function calculateFinancialSummary(input: {
  orders: Array<Record<string, unknown>>;
  adsPayload?: Record<string, unknown>;
  billingCharges?: Array<{ label: string; amount: number; type: string }>;
}): FinancialSummary {
  const { revenue, count, currency } = sumOrderRevenue(input.orders);
  const adSpend = extractAdsCost(input.adsPayload);
  const mlFees = sumBillingFees(input.billingCharges);
  const netRevenue = revenue - mlFees;
  const apiRoas = extractAdsRoas(input.adsPayload);
  const roas = apiRoas ?? (adSpend > 0 ? revenue / adSpend : 0);
  const avgTicket = count > 0 ? revenue / count : 0;

  return {
    gross_revenue: round2(revenue),
    orders_count: count,
    avg_ticket: round2(avgTicket),
    ad_spend: round2(adSpend),
    ml_fees: round2(mlFees),
    net_revenue_estimated: round2(netRevenue),
    roas: round2(roas),
    margin_after_ads: round2(netRevenue - adSpend),
    currency_id: currency,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
