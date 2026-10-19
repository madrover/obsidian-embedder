/**
 * Drive Embedder - Plugin Settings
 */

import { DriveEmbedderSettings } from './types';

export const DEFAULT_SETTINGS: DriveEmbedderSettings = {
    // Google OAuth
    googleClientId: '',
    googleClientSecret: '',
    googleAccessToken: '',
    googleRefreshToken: '',
    tokenExpiresAt: 0,

    // Drive settings
    driveFolder: 'Obsidian/DriveEmbedder',

    // Embed settings
    showTitleByDefault: true,

    // Rendering
    autoLoadLimitMB: 50,
    cacheLimitMB: 200,

    // Default sizes per category
    defaultVideoSize: 'medium',
    defaultDocumentSize: 'medium',
    defaultImageSize: 'medium',
    defaultAudioSize: 'slim'
};
