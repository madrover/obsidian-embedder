# Drive Embedder (private)

Upload local files to Google Drive and embed them directly in your Obsidian notes with intuitive size options.

> Private fork of [reallygood83/obsidian-embedder](https://github.com/reallygood83/obsidian-embedder). Uploads stay private in Drive: no sharing permission is added. Notes render the files by downloading them with the plugin's own OAuth token, so embeds only show inside Obsidian for the connected account.

## Features

- 🚀 **One-Click Upload**: Upload files directly to Google Drive from Obsidian
- 🔒 **Private Embeds**: Inserts a `drive-embed` block rendered with your OAuth token; files are never made public
- 📐 **Intuitive Size Options**: Clear size labels like "Compact", "Medium", "Large", "Full Width"
- 🎵 **Audio Optimized**: Special compact sizes for audio files ("Slim", "Standard")
- 📂 **Multi-Format Support**: Video (MP4, WebM, MOV, AVI), Audio (MP3, WAV, OGG, M4A), PDF, Images (JPG, PNG, GIF, WebP, SVG)
- 🔄 **Real-Time Progress**: Visual upload progress tracking
- 🎨 **Beautiful UI**: Clean, intuitive interface with worldwide language support

## Installation via BRAT

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. Open Obsidian Settings → BRAT → Add Beta plugin
3. Enter this repository URL: `reallygood83/obsidian-embedder`
4. Click "Add Plugin"
5. Enable "Drive Embedder" in Settings → Community plugins

## Google OAuth Setup

Before using the plugin, you need to set up Google OAuth credentials:

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable **Google Drive API**:
   - Navigate to "APIs & Services" → "Library"
   - Search for "Google Drive API"
   - Click "Enable"

### 2. Configure OAuth Consent Screen

1. Go to "APIs & Services" → "OAuth consent screen"
2. Select "External" user type
3. Fill in required fields:
   - App name: "Drive Embedder"
   - User support email: Your email
   - Developer contact: Your email
4. Add scope: `https://www.googleapis.com/auth/drive.file`
5. Save and continue

### 3. Create OAuth Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth Client ID"
3. Application type: **Desktop app**
4. Name: "Drive Embedder"
5. Click "Create"
6. Copy the **Client ID** and **Client Secret**

### 4. Configure Plugin

1. Open Obsidian Settings → Drive Embedder
2. Paste your **Client ID**
3. Paste your **Client Secret**
4. Click "Connect"
5. Follow the browser authorization flow
6. Grant permissions to your Google Drive

## Usage

### Upload and Embed Files

1. Click the cloud upload icon in the ribbon, or
2. Use command palette: "Drive Embedder: upload file and embed"
3. Select a file or drag & drop
4. Choose your preferred size (intuitive size labels)
5. Click "Upload & Embed"
6. Embed code is automatically inserted at cursor position

### Size Options

#### Video & Documents
- 🔹 **Compact**: Perfect for inline content
- 🔸 **Medium**: Recommended for most use cases
- 🔶 **Large**: For detailed viewing
- 🟠 **Full Width**: Immersive viewing experience

#### Audio
- 🎵 **Slim**: Minimal space (100px height)
- 🎶 **Standard**: With padding (120px height)

#### Images
- 🔹 **Small**: 300px width
- 🔸 **Medium**: 500px width
- 🔶 **Large**: 800px width
- 🟠 **Original Size**: Full resolution

## Settings

- **Google OAuth**: Client ID and Client Secret
- **Drive Folder**: Upload destination path (default: `Obsidian/DriveEmbedder`)
- **Show Title**: Display filename above embed by default
- **Auto-load limit (MB)**: Larger files show a "Load" button instead of downloading when the note opens (default 50, 0 = no limit)
- **Memory cache (MB)**: Downloaded files kept in memory while Obsidian is open (default 200)
- **Default Sizes**: Set preferred sizes for each content type

## Supported File Types

| Category | Formats |
|----------|---------|
| 🎬 Video | MP4, WebM, MOV, AVI |
| 🎵 Audio | MP3, WAV, OGG, M4A |
| 📄 Document | PDF |
| 🖼️ Image | JPG, PNG, GIF, WebP, SVG |

## Embed Format

Uploading inserts a code block like this one; the plugin renders it:

````markdown
```drive-embed
id: 1AbC...xyz
name: report.pdf
mime: application/pdf
size: medium
title: true
```
````

`size` is a preset id from the size options above. Images, audio and video play from the downloaded file; PDFs open in an inline viewer on desktop and show a first-page thumbnail on mobile. Each embed links to the file in Drive.

## Security & Privacy

- Your files are uploaded to **your own Google Drive** and stay private: no sharing permission is added
- Embeds only render inside Obsidian, for the connected account; they do not work in Obsidian Publish or other Markdown viewers
- The `drive.file` scope covers files created through the same Google Cloud project, so files uploaded by other tools using that project can be rendered too
- OAuth tokens and the client secret are stored in plain text in the plugin's `data.json`: keep that file out of git or any shared sync
- No third-party servers involved

## Mobile

Connect on desktop: the OAuth flow needs a local callback server. Once connected, the tokens travel with the vault's plugin folder (iCloud, Obsidian Sync) and mobile renders embeds with them. Uploading is desktop-only.

## Troubleshooting

### "Not Connected"
- Verify Client ID and Client Secret are correct
- Ensure Google Drive API is enabled
- Check OAuth consent screen is configured
- If the connection drops every 7 days, the consent screen is in "Testing": publish it under Google Auth Platform → Audience

### Upload Fails
- Check internet connection
- Verify Google Drive has sufficient storage
- Try disconnecting and reconnecting

### Token Expired
- Plugin automatically refreshes tokens
- If issues persist, disconnect and reconnect

## Version History

### v1.0.7 (2025-12-03)
- **🌍 Complete Internationalization**: All user-facing text converted to English for worldwide distribution
- **📝 Updated Interface**: Settings, modals, notices, and help documentation now in English
- **🌐 Global Ready**: Plugin prepared for official Obsidian community plugin registry
- No functionality changes - all features work exactly as before

### v1.0.6 (2025-12-03)
- **Audio Player Fix**: Increased audio embed height for proper Google Drive player display
- Changed audio heights: 슬림 (54px → 100px), 표준 (80px → 120px)
- Google Drive audio player now displays correctly with all controls visible
- Matches Google Drive's native audio player interface requirements

### v1.0.5 (2025-12-03)
- **Major Fix**: Switched to iframe-based embed for video/audio
- Resolved large file playback issues (files > 25MB)
- Now uses Google Drive's native player via `/preview` URL
- Eliminates virus scan redirect issues with direct download URLs
- Improved compatibility with all file sizes
- More stable playback in Obsidian share notes

### v1.0.4 (2025-12-03)
- **Critical Fix**: Corrected Google Drive URL parameter order
- Fixed URL format from `?id=...&export=download` to `?export=download&id=...`
- Videos and audio now play correctly without webContentLink dependency
- Eliminated URL format inconsistencies

### v1.0.3 (2025-12-03)
- **Fixed**: Video/audio embed now uses HTML5 tags for immediate playback
- **Fixed**: Eliminated "video still processing" error from Google Drive
- **Improved**: Direct content URL embedding for faster media loading
- Videos and audio files now play instantly without Google Drive processing delay

### v1.0.0 (2025-01-25)
- Initial release
- Google Drive upload with OAuth 2.0
- Intuitive Korean size labels
- Multi-format support (video, audio, PDF, images)
- Auto embed code generation
- Real-time upload progress

## Development

```bash
# Clone repository
git clone https://github.com/reallygood83/obsidian-embedder.git

# Install dependencies
npm install

# Build plugin
npm run build

# Development mode
npm run dev
```

## Credits

Developed by [reallygood83](https://github.com/reallygood83)

## License

MIT License

Copyright (c) 2025 reallygood83

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

Found a bug or have a feature request? Please open an issue on [GitHub](https://github.com/reallygood83/obsidian-embedder/issues).
