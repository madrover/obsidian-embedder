/**
 * Drive Embedder - Renderer for `drive-embed` code blocks.
 * Downloads private files with the OAuth token and shows them from blob URLs.
 */
import { MarkdownPostProcessorContext, Platform } from 'obsidian';
import { DriveClient, DriveError, DriveFileMetadata } from './drive-client';
import { parseEmbedBlock } from './embed-generator';
import { getFileTypeInfo, getSizeById } from './size-presets';
import { ContentCategory } from './types';

const MB = 1024 * 1024;

export interface EmbedRendererHost {
    getClient(): DriveClient | null;
    readonly autoLoadLimitMB: number;
    readonly cacheLimitMB: number;
}

interface CachedBlob {
    url: string;
    bytes: number;
}

function categoryFor(mime: string, name: string): ContentCategory {
    const fromName = getFileTypeInfo(name)?.category;
    if (fromName) return fromName;
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('video/')) return 'video';
    return 'document';
}

function formatSize(bytes: number): string {
    return bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export class EmbedRenderer {
    /** Insertion order is recency order: hits are moved to the end. */
    private cache = new Map<string, CachedBlob>();
    private cacheBytes = 0;
    private inFlight = new Map<string, Promise<string>>();

    constructor(private host: EmbedRendererHost) {}

    process = async (source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext): Promise<void> => {
        const block = parseEmbedBlock(source);
        const container = el.createDiv({ cls: 'drive-embed' });

        if (!block.id) {
            this.showMessage(container, 'Drive embed is missing an "id:" line.', 'error');
            return;
        }

        const id = block.id;
        const name = block.name || id;
        const mime = block.mime || getFileTypeInfo(name)?.mimeType || '';
        const category = categoryFor(mime, name);
        const size = getSizeById(category, block.size || '');
        container.style.width = size.width;

        if (block.title) {
            container.createDiv({ cls: 'drive-embed-title', text: `📁 ${name}` });
        }
        const body = container.createDiv({ cls: 'drive-embed-body' });
        this.addFooter(container, id);

        const client = this.host.getClient();
        if (!client) {
            this.showMessage(body, 'Not connected to Google Drive. Connect in the plugin settings on desktop.', 'error');
            return;
        }

        const cached = this.cache.get(id);
        if (cached) {
            this.touch(id, cached);
            this.renderMedia(body, category, cached.url, name, size.height);
            return;
        }

        this.showMessage(body, 'Loading from Google Drive…', 'loading');
        try {
            const meta = await client.getMetadata(id);
            if (meta.mimeType.startsWith('application/vnd.google-apps')) {
                this.showMessage(body, 'This is a Google Docs file. Open it in Drive.', 'info');
                return;
            }
            if (category === 'document' && Platform.isMobile) {
                await this.renderPdfPreview(body, client, meta);
                return;
            }
            const limit = this.host.autoLoadLimitMB * MB;
            if (meta.size !== undefined && limit > 0 && meta.size > limit) {
                this.renderLoadCard(body, client, meta, category, size.height);
                return;
            }
            await this.loadAndRender(body, client, meta, category, size.height);
        } catch (error) {
            this.showError(body, error);
        }
    };

    private async loadAndRender(
        body: HTMLElement,
        client: DriveClient,
        meta: DriveFileMetadata,
        category: ContentCategory,
        height: string
    ): Promise<void> {
        this.showMessage(body, 'Loading from Google Drive…', 'loading');
        try {
            const url = await this.getBlobUrl(client, meta);
            this.renderMedia(body, category, url, meta.name, height);
        } catch (error) {
            this.showError(body, error);
        }
    }

    private getBlobUrl(client: DriveClient, meta: DriveFileMetadata): Promise<string> {
        const cached = this.cache.get(meta.id);
        if (cached) {
            this.touch(meta.id, cached);
            return Promise.resolve(cached.url);
        }
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

    private renderMedia(body: HTMLElement, category: ContentCategory, url: string, name: string, height: string): void {
        body.empty();
        switch (category) {
            case 'image': {
                const img = body.createEl('img', { cls: 'drive-embed-image', attr: { src: url, alt: name } });
                if (height !== 'auto') img.style.height = height;
                break;
            }
            case 'audio':
                body.createEl('audio', { cls: 'drive-embed-audio', attr: { src: url, controls: '', preload: 'metadata' } });
                break;
            case 'video': {
                const video = body.createEl('video', { cls: 'drive-embed-video', attr: { src: url, controls: '', preload: 'metadata' } });
                video.style.height = height;
                break;
            }
            default: {
                const frame = body.createEl('iframe', { cls: 'drive-embed-document', attr: { src: url, title: name } });
                frame.style.height = height;
            }
        }
    }

    /** Mobile has no inline PDF viewer for blob URLs: show the first-page thumbnail. */
    private async renderPdfPreview(body: HTMLElement, client: DriveClient, meta: DriveFileMetadata): Promise<void> {
        body.empty();
        if (meta.thumbnailLink) {
            try {
                const response = await client.request({ url: meta.thumbnailLink });
                const url = URL.createObjectURL(new Blob([response.arrayBuffer], { type: 'image/png' }));
                this.store(`${meta.id}#thumb`, { url, bytes: response.arrayBuffer.byteLength });
                body.createEl('img', { cls: 'drive-embed-image', attr: { src: url, alt: meta.name } });
                return;
            } catch (error) {
                console.debug('Drive Embedder: thumbnail unavailable', error);
            }
        }
        this.showMessage(body, 'PDF preview is not available on mobile. Open it in Drive.', 'info');
    }

    private renderLoadCard(
        body: HTMLElement,
        client: DriveClient,
        meta: DriveFileMetadata,
        category: ContentCategory,
        height: string
    ): void {
        body.empty();
        const card = body.createDiv({ cls: 'drive-embed-message drive-embed-info' });
        card.createSpan({ text: `${meta.name} is ${formatSize(meta.size ?? 0)}. ` });
        const button = card.createEl('button', { text: 'Load' });
        button.addEventListener('click', () => {
            void this.loadAndRender(body, client, meta, category, height);
        });
    }

    private addFooter(container: HTMLElement, id: string): void {
        const footer = container.createDiv({ cls: 'drive-embed-footer' });
        footer.createEl('a', {
            text: 'Open in Drive',
            href: `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`,
            attr: { target: '_blank', rel: 'noopener' }
        });
    }

    private showMessage(target: HTMLElement, text: string, kind: 'loading' | 'info' | 'error'): void {
        target.empty();
        target.createDiv({ cls: `drive-embed-message drive-embed-${kind}`, text });
    }

    private showError(target: HTMLElement, error: unknown): void {
        console.error('Drive Embedder: render failed', error);
        let text = error instanceof Error ? error.message : String(error);
        if (error instanceof DriveError) {
            if (error.status === 404) {
                text = 'File not found in Google Drive, or no access to it. If you connected before v1.1.1, reconnect in the plugin settings on desktop.';
            } else if (error.status === 403) {
                text = 'No access to this file. If you connected before v1.1.1, reconnect to grant read access to Drive.';
            } else if (error.status === 401) {
                text = 'Google Drive session expired. Reconnect in the plugin settings on desktop.';
            }
        }
        this.showMessage(target, text, 'error');
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
    }
}
