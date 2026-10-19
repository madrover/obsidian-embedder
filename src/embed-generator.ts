/**
 * Drive Embedder - Embed Code Generator
 * Writes a `drive-embed` code block that the plugin renders with the OAuth token,
 * so files can stay private in Drive.
 */

import { DriveUploadResult, EmbedOptions } from './types';
import { getFileTypeInfo } from './size-presets';

export const EMBED_BLOCK_LANGUAGE = 'drive-embed';

export interface EmbedBlock {
    id: string;
    name: string;
    mime: string;
    size: string;
    title: boolean;
}

/** One `key: value` per line; values are kept on a single line. */
export function serializeEmbedBlock(block: EmbedBlock): string {
    const clean = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();
    return [
        '```' + EMBED_BLOCK_LANGUAGE,
        `id: ${clean(block.id)}`,
        `name: ${clean(block.name)}`,
        `mime: ${clean(block.mime)}`,
        `size: ${clean(block.size)}`,
        `title: ${block.title}`,
        '```'
    ].join('\n');
}

export function parseEmbedBlock(source: string): Partial<EmbedBlock> {
    const values: Record<string, string> = {};
    for (const line of source.split('\n')) {
        const sep = line.indexOf(':');
        if (sep < 0) continue;
        values[line.slice(0, sep).trim().toLowerCase()] = line.slice(sep + 1).trim();
    }
    return {
        id: values.id || undefined,
        name: values.name || undefined,
        mime: values.mime || undefined,
        size: values.size || undefined,
        title: values.title === undefined ? true : values.title !== 'false'
    };
}

export class EmbedGenerator {
    /**
     * Generate embed code for a file uploaded to Google Drive
     */
    generateEmbed(
        fileName: string,
        uploadResult: DriveUploadResult,
        options: EmbedOptions
    ): string {
        return serializeEmbedBlock({
            id: uploadResult.fileId,
            name: fileName,
            mime: uploadResult.mimeType || getFileTypeInfo(fileName)?.mimeType || 'application/octet-stream',
            size: options.size.id,
            title: options.showTitle
        });
    }

    /**
     * Generate markdown link format
     */
    generateMarkdownLink(fileName: string, result: DriveUploadResult): string {
        return `[${fileName}](${result.webViewLink})`;
    }
}
