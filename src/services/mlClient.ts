import type { Config } from "../config.js";
import type { MlItem, MlQuestion } from "../types/product.js";

export interface MlTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number;
  token_type: string;
  scope: string;
}

export class MlApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "MlApiError";
  }
}

export class MlClient {
  constructor(private readonly config: Config) {}

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.ML_APP_ID,
      redirect_uri: this.config.ML_REDIRECT_URI,
      state,
    });

    return `https://auth.mercadolivre.com.br/authorization?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<MlTokenResponse> {
    return this.requestToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.config.ML_REDIRECT_URI,
    });
  }

  async refreshToken(refreshToken: string): Promise<MlTokenResponse> {
    return this.requestToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  async getQuestion(
    questionId: number,
    accessToken: string,
  ): Promise<MlQuestion> {
    return this.authenticatedGet<MlQuestion>(
      `https://api.mercadolibre.com/questions/${questionId}?api_version=4`,
      accessToken,
    );
  }

  async getItem(itemId: string, accessToken: string): Promise<MlItem> {
    return this.authenticatedGet<MlItem>(
      `https://api.mercadolibre.com/items/${itemId}`,
      accessToken,
    );
  }

  async getUser(
    userId: number,
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    return this.authenticatedGet(
      `https://api.mercadolibre.com/users/${userId}`,
      accessToken,
    );
  }

  async searchUserItems(
    userId: number,
    accessToken: string,
  ): Promise<{ paging: { total: number }; results: string[] }> {
    return this.authenticatedGet(
      `https://api.mercadolibre.com/users/${userId}/items/search?limit=1`,
      accessToken,
    );
  }

  async searchOrders(
    sellerId: number,
    accessToken: string,
    dateFrom: string,
    dateTo: string,
    offset = 0,
    limit = 50,
  ): Promise<{
    paging: { total: number };
    results: Array<Record<string, unknown>>;
  }> {
    const params = new URLSearchParams({
      seller: String(sellerId),
      sort: "date_desc",
      limit: String(limit),
      offset: String(offset),
      "order.date_created.from": dateFrom,
      "order.date_created.to": dateTo,
    });
    return this.authenticatedGet(
      `https://api.mercadolibre.com/orders/search?${params}`,
      accessToken,
    );
  }

  async getUserItemsVisits(
    userId: number,
    accessToken: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<{ total_visits: number }> {
    const params = new URLSearchParams({
      date_from: dateFrom,
      date_to: dateTo,
    });
    return this.authenticatedGet(
      `https://api.mercadolibre.com/users/${userId}/items_visits?${params}`,
      accessToken,
    );
  }

  async getAdvertisers(
    accessToken: string,
  ): Promise<{
    advertisers: Array<{ advertiser_id: number; site_id: string }>;
  }> {
    return this.authenticatedGet(
      "https://api.mercadolibre.com/advertising/advertisers?product_id=PADS",
      accessToken,
      { "Api-Version": "1" },
    );
  }

  async getProductAdsCampaignMetrics(
    advertiserId: number,
    accessToken: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<Record<string, unknown>> {
    const metrics =
      "clicks,prints,cost,roas,total_amount,direct_amount,indirect_amount,units_quantity,acos";
    const params = new URLSearchParams({
      limit: "50",
      offset: "0",
      date_from: dateFrom.slice(0, 10),
      date_to: dateTo.slice(0, 10),
      metrics,
      metrics_summary: "true",
    });
    return this.authenticatedGet(
      `https://api.mercadolibre.com/advertising/advertisers/${advertiserId}/product_ads/campaigns?${params}`,
      accessToken,
      { "api-version": "2" },
    );
  }

  async getBillingPeriods(
    accessToken: string,
  ): Promise<{
    results: Array<{
      key: string;
      period: { date_from: string; date_to: string };
    }>;
  }> {
    return this.authenticatedGet(
      "https://api.mercadolibre.com/billing/integration/monthly/periods?group=ML&document_type=BILL&limit=12",
      accessToken,
    );
  }

  async getBillingSummary(
    accessToken: string,
    periodKey: string,
  ): Promise<Record<string, unknown>> {
    return this.authenticatedGet(
      `https://api.mercadolibre.com/billing/integration/periods/key/${periodKey}/summary/details?group=ML`,
      accessToken,
    );
  }

  async postAnswer(
    questionId: number,
    text: string,
    accessToken: string,
  ): Promise<void> {
    const response = await fetch("https://api.mercadolibre.com/answers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ question_id: questionId, text }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new MlApiError(
        `ML post answer failed (${response.status}): ${errorBody}`,
        response.status,
        errorBody,
      );
    }
  }

  private async authenticatedGet<T>(
    url: string,
    accessToken: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        ...extraHeaders,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new MlApiError(
        `ML API failed (${response.status}): ${errorBody}`,
        response.status,
        errorBody,
      );
    }

    return response.json() as Promise<T>;
  }

  private async requestToken(
    body: Record<string, string>,
  ): Promise<MlTokenResponse> {
    const params = new URLSearchParams({
      client_id: this.config.ML_APP_ID,
      client_secret: this.config.ML_CLIENT_SECRET,
      ...body,
    });

    const response = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `ML token request failed (${response.status}): ${errorBody}`,
      );
    }

    return response.json() as Promise<MlTokenResponse>;
  }
}
