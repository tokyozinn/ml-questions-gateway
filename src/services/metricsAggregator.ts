import type { Tenant } from "@prisma/client";
import type { MlClient } from "./mlClient.js";
import { MlApiError } from "./mlClient.js";
import type { TokenManager } from "./tokenManager.js";
import { calculateFinancialSummary } from "./financialCalculator.js";
import type {
  MetricsPeriod,
  PartialError,
  TenantMetricsResponse,
} from "../types/metrics.js";

const CACHE_TTL_MS = 300_000;
const MAX_ORDER_PAGES = 3;
const ORDERS_PER_PAGE = 50;

interface CacheEntry {
  expiresAt: number;
  data: TenantMetricsResponse;
}

function buildDateRange(periodDays: MetricsPeriod): {
  dateFrom: string;
  dateTo: string;
} {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - periodDays);
  from.setUTCHours(0, 0, 0, 0);
  to.setUTCHours(23, 59, 59, 999);

  return {
    dateFrom: from.toISOString(),
    dateTo: to.toISOString(),
  };
}

function toPartialError(source: string, err: unknown): PartialError {
  if (err instanceof MlApiError) {
    return { source, message: err.message, status: err.status };
  }
  if (err instanceof Error) {
    return { source, message: err.message };
  }
  return { source, message: String(err) };
}

function pickBillingPeriodKey(
  results: Array<{ key: string; period: { date_from: string; date_to: string } }>,
  dateFrom: string,
  dateTo: string,
): string | null {
  if (!results.length) return null;

  const fromMs = Date.parse(dateFrom);
  const toMs = Date.parse(dateTo);

  const sorted = [...results].sort(
    (a, b) => Date.parse(b.period.date_to) - Date.parse(a.period.date_to),
  );

  const intersecting = sorted.find((r) => {
    const pFrom = Date.parse(r.period.date_from);
    const pTo = Date.parse(r.period.date_to);
    return pFrom <= toMs && pTo >= fromMs;
  });

  return intersecting?.key ?? sorted[0]?.key ?? null;
}

function mapBillingItems(
  items: unknown,
): Array<{ label: string; amount: number; type: string }> {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      label: String(row.label ?? ""),
      amount: Number(row.amount ?? 0),
      type: String(row.type ?? ""),
    };
  });
}

function normalizeRecentOrder(
  order: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: order.id,
    status: order.status,
    total_amount: order.total_amount,
    currency_id: order.currency_id,
    date_created: order.date_created,
    date_closed: order.date_closed,
  };
}

export class MetricsAggregatorService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly mlClient: MlClient,
    private readonly tokenManager: TokenManager,
  ) {}

  async getTenantMetrics(
    tenant: Tenant,
    periodDays: MetricsPeriod,
    refresh = false,
  ): Promise<TenantMetricsResponse> {
    if (!tenant.mlUserId) {
      throw new Error("Tenant not connected to Mercado Livre");
    }

    const cacheKey = `metrics:${tenant.id}:${periodDays}`;
    if (!refresh) {
      const hit = this.cache.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) {
        return { ...hit.data, cached: true };
      }
    }

    const accessToken = await this.tokenManager.ensureAccessToken(
      tenant.mlUserId,
    );
    if (!accessToken) {
      throw new Error("Unable to obtain Mercado Livre access token");
    }

    const { dateFrom, dateTo } = buildDateRange(periodDays);
    const partialErrors: PartialError[] = [];
    const mlUserId = tenant.mlUserId;

    const [userResult, itemsResult, visitsResult, ordersBundle, advertisersResult] =
      await Promise.all([
        this.settle(
          "reputation",
          this.mlClient.getUser(mlUserId, accessToken),
          partialErrors,
        ),
        this.settle(
          "listings",
          this.mlClient.searchUserItems(mlUserId, accessToken),
          partialErrors,
        ),
        this.settle(
          "traffic",
          this.mlClient.getUserItemsVisits(
            mlUserId,
            accessToken,
            dateFrom,
            dateTo,
          ),
          partialErrors,
        ),
        this.fetchOrders(mlUserId, accessToken, dateFrom, dateTo, partialErrors),
        this.settleAds(accessToken, partialErrors),
      ]);

    let adsPayload: Record<string, unknown> | undefined;
    let advertiserId: number | undefined;

    if (advertisersResult) {
      const advertisers = advertisersResult.advertisers ?? [];
      const preferred =
        advertisers.find((a) => a.site_id === "MLB") ?? advertisers[0];
      if (preferred) {
        advertiserId = preferred.advertiser_id;
        adsPayload =
          (await this.settle(
            "ads_metrics",
            this.mlClient.getProductAdsCampaignMetrics(
              preferred.advertiser_id,
              accessToken,
              dateFrom,
              dateTo,
            ),
            partialErrors,
          )) ?? undefined;
      } else {
        partialErrors.push({
          source: "ads",
          message: "No Product Ads advertiser found for this account",
        });
      }
    }

    let billingCharges:
      | Array<{ label: string; amount: number; type: string }>
      | undefined;
    let billingBonuses:
      | Array<{ label: string; amount: number; type: string }>
      | undefined;
    let billingPeriodKey: string | undefined;
    let totalCollected: number | undefined;
    let billingAvailable = false;

    const periods = await this.settle(
      "billing",
      this.mlClient.getBillingPeriods(accessToken),
      partialErrors,
    );

    if (periods) {
      const key = pickBillingPeriodKey(periods.results ?? [], dateFrom, dateTo);
      if (key) {
        billingPeriodKey = key;
        const summary = await this.settle(
          "billing_summary",
          this.mlClient.getBillingSummary(accessToken, key),
          partialErrors,
        );
        if (summary) {
          billingAvailable = true;
          const billIncludes = summary.bill_includes as
            | Record<string, unknown>
            | undefined;
          const paymentCollected = summary.payment_collected as
            | Record<string, unknown>
            | undefined;
          billingCharges = mapBillingItems(billIncludes?.charges);
          billingBonuses = mapBillingItems(billIncludes?.bonuses);
          totalCollected = Number(paymentCollected?.total_collected ?? 0);
        }
      }
    }

    const reputation =
      userResult && typeof userResult.seller_reputation === "object"
        ? (userResult.seller_reputation as Record<string, unknown>)
        : null;

    const financial = calculateFinancialSummary({
      orders: ordersBundle.orders,
      adsPayload,
      billingCharges,
    });

    const response: TenantMetricsResponse = {
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      ml_user_id: mlUserId,
      period_days: periodDays,
      date_from: dateFrom,
      date_to: dateTo,
      fetched_at: new Date().toISOString(),
      cached: false,
      financial,
      reputation,
      orders: {
        total: ordersBundle.total,
        recent: ordersBundle.orders.slice(0, 20).map(normalizeRecentOrder),
      },
      ads: {
        available: Boolean(adsPayload),
        ...(advertiserId !== undefined && { advertiser_id: advertiserId }),
        ...(adsPayload?.metrics_summary
          ? {
              metrics_summary: adsPayload.metrics_summary as Record<
                string,
                unknown
              >,
            }
          : adsPayload
            ? { metrics_summary: adsPayload }
            : {}),
      },
      billing: {
        available: billingAvailable,
        ...(billingPeriodKey && { period_key: billingPeriodKey }),
        ...(billingCharges && { charges: billingCharges }),
        ...(billingBonuses && { bonuses: billingBonuses }),
        ...(totalCollected !== undefined && {
          total_collected: totalCollected,
        }),
      },
      traffic: {
        total_visits: Number(visitsResult?.total_visits ?? 0),
      },
      listings: {
        active_count: Number(itemsResult?.paging?.total ?? 0),
      },
      partial_errors: partialErrors,
    };

    this.cache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: response,
    });

    return response;
  }

  private async settleAds(
    accessToken: string,
    partialErrors: PartialError[],
  ): Promise<{
    advertisers: Array<{ advertiser_id: number; site_id: string }>;
  } | null> {
    try {
      return await this.mlClient.getAdvertisers(accessToken);
    } catch (err) {
      if (err instanceof MlApiError && err.status === 404) {
        partialErrors.push({
          source: "ads",
          message:
            "Product Ads not enabled for this seller (ML: enable under Mi perfil → Publicidad)",
          status: 404,
        });
        return null;
      }
      partialErrors.push(toPartialError("ads", err));
      return null;
    }
  }

  private async settle<T>(
    source: string,
    promise: Promise<T>,
    partialErrors: PartialError[],
  ): Promise<T | null> {
    try {
      return await promise;
    } catch (err) {
      partialErrors.push(toPartialError(source, err));
      return null;
    }
  }

  private async fetchOrders(
    sellerId: number,
    accessToken: string,
    dateFrom: string,
    dateTo: string,
    partialErrors: PartialError[],
  ): Promise<{ total: number; orders: Array<Record<string, unknown>> }> {
    const orders: Array<Record<string, unknown>> = [];
    let total = 0;

    for (let page = 0; page < MAX_ORDER_PAGES; page++) {
      const offset = page * ORDERS_PER_PAGE;
      const pageResult = await this.settle(
        page === 0 ? "orders" : `orders_page_${page}`,
        this.mlClient.searchOrders(
          sellerId,
          accessToken,
          dateFrom,
          dateTo,
          offset,
          ORDERS_PER_PAGE,
        ),
        partialErrors,
      );

      if (!pageResult) break;

      total = Number(pageResult.paging?.total ?? 0);
      orders.push(...(pageResult.results ?? []));

      if (orders.length >= total || (pageResult.results?.length ?? 0) < ORDERS_PER_PAGE) {
        break;
      }
    }

    return { total, orders };
  }
}
