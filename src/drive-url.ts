/**
 * Recognise Google Drive file URLs and extract the file id.
 */

const ID = '([A-Za-z0-9_-]{10,})';
const FILE_PATH = new RegExp(`^/file/d/${ID}(?:/(?:view|preview|edit))?/?$`);

/**
 * File id for Drive file links (`open?id=`, `/file/d/<id>/…`, `uc?id=`, `thumbnail?id=`);
 * null for anything else, including folders and Docs/Sheets editor links.
 */
export function parseDriveFileId(raw: string | null | undefined): string | null {
    if (!raw) return null;
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:') return null;

    if (url.hostname === 'drive.google.com') {
        const path = url.pathname.replace(/^\/u\/\d+/, '');
        const fileMatch = FILE_PATH.exec(path);
        if (fileMatch) return fileMatch[1];
        if (path === '/open' || path === '/uc' || path === '/thumbnail') {
            return idParam(url);
        }
        return null;
    }
    if (url.hostname === 'docs.google.com' && url.pathname === '/uc') {
        return idParam(url);
    }
    return null;
}

function idParam(url: URL): string | null {
    const id = url.searchParams.get('id');
    return id && new RegExp(`^${ID}$`).test(id) ? id : null;
}

export function driveViewUrl(id: string): string {
    return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}

export function driveOpenUrl(id: string): string {
    return `https://drive.google.com/open?id=${encodeURIComponent(id)}`;
}
