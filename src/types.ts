/**
 * Drive Embedder - Type Definitions
 */

// Content categories for size presets
export type ContentCategory = 'video' | 'document' | 'image' | 'audio';

// Supported file types
export interface SupportedFileType {
    extension: string;
    mimeType: string;
    category: ContentCategory;
    icon: string;
    label: string;
}

// Size option for embed
export interface SizeOption {
    id: string;
    label: string;
    icon: string;
    description: string;
    width: string;
    height: string;
    recommended?: boolean;
}

// Upload result from Google Drive
export interface DriveUploadResult {
    fileId: string;
    webViewLink: string;
    fileName: string;
    mimeType: string;
}

// Embed options for generating code
export interface EmbedOptions {
    size: SizeOption;
    showTitle: boolean;
}

// Upload progress callback
export interface UploadProgress {
    stage: 'preparing' | 'uploading' | 'complete' | 'error';
    message: string;
    progress: number; // 0-100
    error?: string;
}

// OAuth tokens
export interface OAuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    expiresAt: number;
}

// Plugin settings
export interface DriveEmbedderSettings {
    // Google OAuth
    googleClientId: string;
    googleClientSecret: string;
    googleAccessToken: string;
    googleRefreshToken: string;
    tokenExpiresAt: number;

    // Drive settings
    driveFolder: string;

    // Embed settings
    showTitleByDefault: boolean;

    // Rendering (files are downloaded with the OAuth token)
    autoLoadLimitMB: number;
    cacheLimitMB: number;

    // Default sizes per category
    defaultVideoSize: string;
    defaultDocumentSize: string;
    defaultImageSize: string;
    defaultAudioSize: string;
}

// Modal result
export interface UploadModalResult {
    file: File;
    category: ContentCategory;
    sizeOption: SizeOption;
    title: string;
    showTitle: boolean;
}
