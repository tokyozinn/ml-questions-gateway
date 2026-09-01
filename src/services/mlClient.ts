import type { Config } from "../config.js";

export interface MlTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number;
  token_type: string;
  scope: string;
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
