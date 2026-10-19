/**
 * Google Drive Uploader with Progress Tracking
 * Uploads files privately (no sharing permissions are added)
 */
import { DriveClient, DRIVE_API_URL, DRIVE_UPLOAD_URL } from './drive-client';
import { DriveUploadResult, UploadProgress } from './types';
import { getFileTypeInfo } from './size-presets';

export class GoogleDriveUploader {
    constructor(private client: DriveClient) {}

    /**
     * Upload a file to Google Drive with progress callback
     */
    async uploadFile(
        file: File,
        folderPath: string,
        onProgress?: (progress: UploadProgress) => void
    ): Promise<DriveUploadResult | null> {
        try {
            onProgress?.({
                stage: 'preparing',
                message: 'Preparing upload...',
                progress: 10
            });

            const folderId = await this.ensureFolder(folderPath);
            const mimeType = file.type || getFileTypeInfo(file.name)?.mimeType || 'application/octet-stream';
            const base64Content = this.arrayBufferToBase64(await file.arrayBuffer());

            onProgress?.({
                stage: 'uploading',
                message: 'Uploading to Google Drive...',
                progress: 40
            });

            const metadata = {
                name: file.name,
                mimeType: mimeType,
                parents: [folderId]
            };

            const boundary = '-------314159265358979323846';
            const delimiter = `\r\n--${boundary}\r\n`;
            const closeDelimiter = `\r\n--${boundary}--`;

            const multipartBody =
                delimiter +
                'Content-Type: application/json\r\n\r\n' +
                JSON.stringify(metadata) +
                delimiter +
                `Content-Type: ${mimeType}\r\n` +
                'Content-Transfer-Encoding: base64\r\n\r\n' +
                base64Content +
                closeDelimiter;

            const uploadResponse = await this.client.request({
                url: `${DRIVE_UPLOAD_URL}/files?uploadType=multipart&fields=id,name,mimeType,webViewLink`,
                method: 'POST',
                contentType: `multipart/related; boundary=${boundary}`,
                body: multipartBody
            });

            const fileData = uploadResponse.json as { id: string; name: string; mimeType: string; webViewLink?: string };

            onProgress?.({
                stage: 'complete',
                message: 'Upload complete!',
                progress: 100
            });

            return {
                fileId: fileData.id,
                webViewLink: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`,
                fileName: fileData.name || file.name,
                mimeType: fileData.mimeType || mimeType
            };

        } catch (error) {
            console.error('Error uploading to Google Drive:', error);
            const message = error instanceof Error ? error.message : String(error);
            onProgress?.({
                stage: 'error',
                message: 'Upload failed',
                progress: 0,
                error: message
            });
            return null;
        }
    }

    /**
     * Ensure folder exists, creating if necessary
     */
    private async ensureFolder(folderPath: string): Promise<string> {
        const parts = folderPath.split('/').filter(p => p.length > 0);
        let parentId = 'root';

        for (const folderName of parts) {
            const existingId = await this.findFolder(folderName, parentId);
            parentId = existingId ?? await this.createFolder(folderName, parentId);
        }

        return parentId;
    }

    /**
     * Find a folder by name
     */
    private async findFolder(name: string, parentId: string): Promise<string | null> {
        const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const query = `name='${escaped}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

        const response = await this.client.request({
            url: `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=files(id)`
        });
        const data = response.json as { files?: { id: string }[] };
        return data.files && data.files.length > 0 ? data.files[0].id : null;
    }

    /**
     * Create a new folder
     */
    private async createFolder(name: string, parentId: string): Promise<string> {
        const response = await this.client.request({
            url: `${DRIVE_API_URL}/files?fields=id`,
            method: 'POST',
            contentType: 'application/json',
            body: JSON.stringify({
                name: name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId]
            })
        });
        return (response.json as { id: string }).id;
    }

    /**
     * Convert ArrayBuffer to base64
     */
    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    }
}
