/**
 * Google Drive API client shared by the uploader and the embed renderer.
 * Owns the OAuth tokens and refreshes them; uses only `requestUrl`, so it works on mobile.
 */
import { requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { OAuthTokens } from './types';

export const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
export const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

export interface DriveClientConfig {
    clientId: string;
    clientSecret: string;
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: number;
    onTokenRefresh?: (tokens: OAuthTokens) => Promise<void>;
}

export interface DriveFileMetadata {
    id: string;
    name: string;
    mimeType: string;
    size?: number;
    thumbnailLink?: string;
    webViewLink?: string;
}

export class DriveError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = 'DriveError';
    }
}

export class DriveClient {
    private config: DriveClientConfig;
    private refreshing: Promise<string> | null = null;

    constructor(config: DriveClientConfig) {
        this.config = { ...config };
    }

    /**
     * A valid access token, refreshed when it is about to expire.
     * Concurrent callers share one refresh request.
     */
    async getAccessToken(): Promise<string> {
        if (!this.config.accessToken) {
            throw new DriveError('Not connected to Google Drive.', 401);
        }
        const expired = this.config.tokenExpiresAt > 0
            && Date.now() >= this.config.tokenExpiresAt - EXPIRY_MARGIN_MS;
        if (expired && this.config.refreshToken) {
            return this.refresh();
        }
        return this.config.accessToken;
    }

    private refresh(): Promise<string> {
        if (!this.refreshing) {
            this.refreshing = this.doRefresh().finally(() => {
                this.refreshing = null;
            });
        }
        return this.refreshing;
    }

    private async doRefresh(): Promise<string> {
        const response = await requestUrl({
            url: TOKEN_URL,
            method: 'POST',
            contentType: 'application/x-www-form-urlencoded',
            body: new URLSearchParams({
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                refresh_token: this.config.refreshToken,
                grant_type: 'refresh_token'
            }).toString(),
            throw: false
        });
        if (response.status !== 200) {
            throw new DriveError('Token refresh failed. Please reconnect Google Drive on desktop.', response.status);
        }
        const data = response.json as { access_token: string; expires_in: number };
        const tokens: OAuthTokens = {
            accessToken: data.access_token,
            refreshToken: this.config.refreshToken,
            expiresIn: data.expires_in,
            expiresAt: Date.now() + data.expires_in * 1000
        };
        this.config.accessToken = tokens.accessToken;
        this.config.tokenExpiresAt = tokens.expiresAt;
        if (this.config.onTokenRefresh) {
            await this.config.onTokenRefresh(tokens);
        }
        return tokens.accessToken;
    }

    /**
     * Authenticated request. Retries once with a fresh token on 401;
     * throws DriveError on any other 4xx/5xx.
     */
    async request(params: RequestUrlParam): Promise<RequestUrlResponse> {
        const send = async (token: string) => requestUrl({
            ...params,
            headers: { ...params.headers, Authorization: `Bearer ${token}` },
            throw: false
        });

        let response = await send(await this.getAccessToken());
        if (response.status === 401 && this.config.refreshToken) {
            response = await send(await this.refresh());
        }
        if (response.status >= 400) {
            throw new DriveError(this.describeError(response), response.status);
        }
        return response;
    }

    async getMetadata(fileId: string): Promise<DriveFileMetadata> {
        const fields = 'id,name,mimeType,size,thumbnailLink,webViewLink';
        const response = await this.request({
            url: `${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?fields=${fields}&supportsAllDrives=true`
        });
        const data = response.json as DriveFileMetadata & { size?: string | number };
        return { ...data, size: data.size !== undefined ? Number(data.size) : undefined };
    }

    async download(fileId: string): Promise<ArrayBuffer> {
        const response = await this.request({
            url: `${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`
        });
        return response.arrayBuffer;
    }

    private describeError(response: RequestUrlResponse): string {
        try {
            const body = response.json as { error?: { message?: string } };
            if (body?.error?.message) return body.error.message;
        } catch {
            // body is not JSON
        }
        return `Google Drive request failed (${response.status})`;
    }
}
