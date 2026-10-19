/**
 * Drive Embedder - shared download layer for code blocks and image links.
 * Keeps a byte-capped cache of blob URLs, a metadata cache, and dedups concurrent downloads.
 */
import { DriveClient, DriveError, DriveFileMetadata } from './drive-client';
import { getFileTypeInfo } from './size-presets';
import { ContentCategory } from './types';

export const MB = 1024 * 1024;

export interface MediaHost {
    getClient(): DriveClient | null;
    readonly autoLoadLimitMB: number;
    readonly cacheLimitMB: number;
}

interface CachedBlob {
    url: string;
    bytes: number;
}

export function categoryFor(mime: string, name: string): ContentCategory {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('video/')) return 'video';
    const fromName = getFileTypeInfo(name)?.category;
    return fromName ?? 'document';
}

export function formatSize(bytes: number): string {
    return bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function isGoogleNative(meta: DriveFileMetadata): boolean {
    return meta.mimeType.startsWith('application/vnd.google-apps');
}

export function describeError(error: unknown): string {
    if (error instanceof DriveError) {
        if (error.status === 404) {
            return 'File not found in Google Drive, or no access to it. If you connected before v1.1.1, reconnect in the plugin settings on desktop.';
        }
        if (error.status === 403) {
            return 'No access to this file. If you connected before v1.1.1, reconnect to grant read access to Drive.';
        }
        if (error.status === 401) {
            return 'Google Drive session expired. Reconnect in the plugin settings on desktop.';
        }
    }
    return error instanceof Error ? error.message : String(error);
}

export class MediaLoader {
    /** Insertion order is recency order: hits are moved to the end. */
    private cache = new Map<string, CachedBlob>();
    private cacheBytes = 0;
    private inFlight = new Map<string, Promise<string>>();
    private metadata = new Map<string, Promise<DriveFileMetadata>>();

    constructor(private host: MediaHost) {}

    getClient(): DriveClient | null {
        return this.host.getClient();
    }

    /** True when the file is small enough to download without asking. */
    autoLoads(meta: DriveFileMetadata): boolean {
        const limit = this.host.autoLoadLimitMB * MB;
        return meta.size === undefined || limit <= 0 || meta.size <= limit;
    }

    cachedUrl(id: string): string | null {
        const entry = this.cache.get(id);
        if (!entry) return null;
        this.touch(id, entry);
        return entry.url;
    }

    getMetadata(client: DriveClient, id: string): Promise<DriveFileMetadata> {
        let pending = this.metadata.get(id);
        if (!pending) {
            pending = client.getMetadata(id);
            this.metadata.set(id, pending);
            // Don't keep failures: a reconnect may fix them.
            pending.catch(() => this.metadata.delete(id));
        }
        return pending;
    }

    getBlobUrl(client: DriveClient, meta: DriveFileMetadata): Promise<string> {
        const cached = this.cachedUrl(meta.id);
        if (cached) return Promise.resolve(cached);
        let pending = this.inFlight.get(meta.id);
        if (!pending) {
            pending = client.download(meta.id)
                .then((buffer) => {
                    const url = URL.createObjectURL(new Blob([buffer], { type: meta.mimeType }));
                    this.store(meta.id, { url, bytes: buffer.byteLength });
                    return url;
                })
                .finally(() => this.inFlight.delete(meta.id));
            this.inFlight.set(meta.id, pending);
        }
        return pending;
    }

    /** First-page thumbnail (used for PDFs on mobile); null when Drive has none. */
    async getThumbnailUrl(client: DriveClient, meta: DriveFileMetadata): Promise<string | null> {
        const key = `${meta.id}#thumb`;
        const cached = this.cachedUrl(key);
        if (cached) return cached;
        if (!meta.thumbnailLink) return null;
        try {
            const response = await client.request({ url: meta.thumbnailLink });
            const url = URL.createObjectURL(new Blob([response.arrayBuffer], { type: 'image/png' }));
            this.store(key, { url, bytes: response.arrayBuffer.byteLength });
            return url;
        } catch (error) {
            console.debug('Drive Embedder: thumbnail unavailable', error);
            return null;
        }
    }

    private touch(key: string, entry: CachedBlob): void {
        this.cache.delete(key);
        this.cache.set(key, entry);
    }

    private store(key: string, entry: CachedBlob): void {
        const previous = this.cache.get(key);
        if (previous) {
            this.cacheBytes -= previous.bytes;
            URL.revokeObjectURL(previous.url);
            this.cache.delete(key);
        }
        this.cache.set(key, entry);
        this.cacheBytes += entry.bytes;

        const limit = this.host.cacheLimitMB * MB;
        for (const [oldKey, old] of this.cache) {
            if (this.cacheBytes <= limit || oldKey === key) break;
            this.cache.delete(oldKey);
            this.cacheBytes -= old.bytes;
            URL.revokeObjectURL(old.url);
        }
    }

    clear(): void {
        for (const entry of this.cache.values()) {
            URL.revokeObjectURL(entry.url);
        }
        this.cache.clear();
        this.cacheBytes = 0;
        this.metadata.clear();
    }
}
