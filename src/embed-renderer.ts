/**
 * Drive Embedder - Renderer for `drive-embed` code blocks.
 * Downloads private files with the OAuth token and shows them from blob URLs.
 */
import { MarkdownPostProcessorContext, Platform } from 'obsidian';
import { DriveClient, DriveFileMetadata } from './drive-client';
import { driveViewUrl } from './drive-url';
import { parseEmbedBlock } from './embed-generator';
import { MediaLoader, categoryFor, describeError, formatSize, isGoogleNative } from './media-loader';
import { getFileTypeInfo, getSizeById } from './size-presets';
import { ContentCategory } from './types';

export class EmbedRenderer {
    constructor(private loader: MediaLoader) {}

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

        const client = this.loader.getClient();
        if (!client) {
            this.showMessage(body, 'Not connected to Google Drive. Connect in the plugin settings on desktop.', 'error');
            return;
        }

        const cached = this.loader.cachedUrl(id);
        if (cached) {
            this.renderMedia(body, category, cached, name, size.height);
            return;
        }

        this.showMessage(body, 'Loading from Google Drive…', 'loading');
        try {
            const meta = await this.loader.getMetadata(client, id);
            if (isGoogleNative(meta)) {
                this.showMessage(body, 'This is a Google Docs file. Open it in Drive.', 'info');
                return;
            }
            if (category === 'document' && Platform.isMobile) {
                await this.renderPdfPreview(body, client, meta);
                return;
            }
            if (!this.loader.autoLoads(meta)) {
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
            const url = await this.loader.getBlobUrl(client, meta);
            this.renderMedia(body, category, url, meta.name, height);
        } catch (error) {
            this.showError(body, error);
        }
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
        const url = await this.loader.getThumbnailUrl(client, meta);
        body.empty();
        if (url) {
            body.createEl('img', { cls: 'drive-embed-image', attr: { src: url, alt: meta.name } });
        } else {
            this.showMessage(body, 'PDF preview is not available on mobile. Open it in Drive.', 'info');
        }
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
            href: driveViewUrl(id),
            attr: { target: '_blank', rel: 'noopener' }
        });
    }

    private showMessage(target: HTMLElement, text: string, kind: 'loading' | 'info' | 'error'): void {
        target.empty();
        target.createDiv({ cls: `drive-embed-message drive-embed-${kind}`, text });
    }

    private showError(target: HTMLElement, error: unknown): void {
        console.error('Drive Embedder: render failed', error);
        this.showMessage(target, describeError(error), 'error');
    }
}
