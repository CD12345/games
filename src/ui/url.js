export function getBasePath() {
    const path = window.location.pathname || '/';
    if (path.endsWith('/')) {
        return path;
    }
    if (path.includes('.')) {
        const lastSlash = path.lastIndexOf('/');
        return lastSlash >= 0 ? path.slice(0, lastSlash + 1) : '/';
    }
    return `${path}/`;
}

const ENTRY_PATH_KEY = 'entryPath';

export function storeEntryPath() {
    const path = window.location.pathname || '/';
    sessionStorage.setItem(ENTRY_PATH_KEY, path);
}

export function getEntryPath() {
    return sessionStorage.getItem(ENTRY_PATH_KEY) || window.location.pathname || '/';
}
