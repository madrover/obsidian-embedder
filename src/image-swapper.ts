/**
 * Drive Embedder - renders standard `![alt](drive URL)` images from private Drive files.
 *
 * Obsidian turns those into <img src="https://drive.google.com/…">, which fails for private
 * files. A MutationObserver per window finds them in every view (reading, Live Preview,
 * hover popovers, canvas) and swaps in the file downloaded with the OAuth token.
 */
import { Platform } from 'obsidian';
import { DriveFileMetadata } from './drive-client';
import { driveViewUrl, parseDriveFileId } from './drive-url';
import { MediaLoader, categoryFor, describeError, formatSize, isGoogleNative } from './media-loader';

const CANDIDATES = 'img[src*="drive.google.com"], img[src*="docs.google.com"]';
const STATE = 'driveEmbed';      // data-drive-embed: loading | ready | error
const STATE_ID = 'driveEmbedId'; // data-drive-embed-id: file id being handled

export class ImageSwapper {
    private observers = new Map<Document, MutationObserver>();

    constructor(private loader: MediaLoader) {}

    attach(doc: Document): void {
        if (this.observers.has(doc) || !doc.body) return;
        const observer = new MutationObserver((records) => {
            for (const record of records) {
                if (record.type === 'attributes') {
                    if (record.target instanceof HTMLImageElement) this.handle(record.target);
                    continue;
                }
                record.addedNodes.forEach((node) => {
                    if (node instanceof HTMLImageElement) this.handle(node);
                    else if (node instanceof HTMLElement) this.scan(node);
                });
            }
        });
        observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
        this.observers.set(doc, observer);
        this.scan(doc.body);
    }

    detach(doc: Document): void {
        this.observers.get(doc)?.disconnect();
        this.observers.delete(doc);
    }

    detachAll(): void {
        for (const observer of this.observers.values()) observer.disconnect();
        this.observers.clear();
    }

    /** Also used as a reading-view post-processor, before elements are attached. */
    scan = (root: HTMLElement): void => {
        root.querySelectorAll<HTMLImageElement>(CANDIDATES).forEach((img) => this.handle(img));
    };

    private handle(img: HTMLImageElement): void {
        const id = parseDriveFileId(img.getAttribute('src'));
        if (!id) return; // not a Drive link, or already swapped to a blob: URL
        if (img.dataset[STATE] === 'loading' && img.dataset[STATE_ID] === id) return;
        img.dataset[STATE] = 'loading';
        img.dataset[STATE_ID] = id;
        void this.swap(img, id);
    }

    private async swap(img: HTMLImageElement, id: string): Promise<void> {
        const client = this.loader.getClient();
        if (!client) {
            this.replaceWithMessage(img, id, 'Not connected to Google Drive.');
            return;
        }
        try {
            const meta = await this.loader.getMetadata(client, id);
            if (isGoogleNative(meta)) {
                this.replaceWithMessage(img, id, `${meta.name}: Google Docs file.`, 'info');
                return;
            }
            const category = categoryFor(meta.mimeType, meta.name);
            if (category === 'document' && meta.mimeType !== 'application/pdf') {
                this.replaceWithMessage(img, id, `${meta.name} can't be shown inline.`, 'info');
                return;
            }
            if (!this.loader.autoLoads(meta)) {
                this.replaceWithLoadButton(img, id, meta);
                return;
            }
            await this.show(img, id, meta);
        } catch (error) {
            console.error('Drive Embedder: image swap failed', error);
            this.replaceWithMessage(img, id, describeError(error));
        }
    }

    private async show(img: HTMLImageElement, id: string, meta: DriveFileMetadata): Promise<void> {
        const client = this.loader.getClient();
        if (!client) return;
        const category = categoryFor(meta.mimeType, meta.name);

        if (category === 'document') {
            if (Platform.isMobile) {
                const thumb = await this.loader.getThumbnailUrl(client, meta);
                if (!thumb) {
                    this.replaceWithMessage(img, id, `${meta.name}: PDF preview is not available on mobile.`, 'info');
                    return;
                }
                this.setImage(img, id, thumb);
                return;
            }
            const url = await this.loader.getBlobUrl(client, meta);
            const frame = createEl('iframe', { cls: 'drive-embed-document', attr: { src: url, title: meta.name } });
            this.replace(img, frame);
            return;
        }

        const url = await this.loader.getBlobUrl(client, meta);
        if (category === 'image') {
            this.setImage(img, id, url);
        } else {
            const media = createEl(category, {
                cls: category === 'video' ? 'drive-embed-video' : 'drive-embed-audio',
                attr: { src: url, controls: '', preload: 'metadata', title: meta.name }
            });
            this.replace(img, media);
        }
    }

    private setImage(img: HTMLImageElement, id: string, url: string): void {
        // Only swap if the element still points at the same file (Live Preview may have reused it).
        if (img.dataset[STATE_ID] !== id) return;
        img.setAttribute('src', url);
        img.dataset[STATE] = 'ready';
        if (!img.closest('.cm-editor') && !img.dataset.driveEmbedClick) {
            img.dataset.driveEmbedClick = 'true';
            img.addClass('drive-embed-clickable');
            img.addEventListener('click', () => window.open(driveViewUrl(id)));
        }
    }

    /** Swap the <img> for another element, keeping Obsidian's width from `![alt|600](…)`. */
    private replace(img: HTMLImageElement, el: HTMLElement): void {
        const width = img.getAttribute('width');
        if (width) el.style.width = /^\d+$/.test(width) ? `${width}px` : width;
        el.dataset[STATE] = 'ready';
        img.replaceWith(el);
    }

    private replaceWithMessage(img: HTMLImageElement, id: string, text: string, kind: 'info' | 'error' = 'error'): void {
        img.dataset[STATE] = 'error';
        const span = createSpan({ cls: `drive-embed-inline drive-embed-${kind}` });
        span.createSpan({ text: `${text} ` });
        span.createEl('a', { text: 'Open in Drive', href: driveViewUrl(id), attr: { target: '_blank', rel: 'noopener' } });
        this.replace(img, span);
    }

    private replaceWithLoadButton(img: HTMLImageElement, id: string, meta: DriveFileMetadata): void {
        const span = createSpan({ cls: 'drive-embed-inline drive-embed-info' });
        span.createSpan({ text: `${meta.name} (${formatSize(meta.size ?? 0)}) ` });
        const button = span.createEl('button', { text: 'Load' });
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const placeholder = createEl('img');
            placeholder.dataset[STATE_ID] = id;
            const width = img.getAttribute('width');
            if (width) placeholder.setAttribute('width', width);
            span.replaceWith(placeholder);
            void this.show(placeholder, id, meta).catch((error) => {
                this.replaceWithMessage(placeholder, id, describeError(error));
            });
        });
        this.replace(img, span);
    }
}
