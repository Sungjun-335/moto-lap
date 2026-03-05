const TOKEN_KEY = 'motolap-auth-token';
let cachedToken: string | null = null;

export function getAuthToken(): string | null {
    if (cachedToken !== null) return cachedToken;
    try {
        cachedToken = localStorage.getItem(TOKEN_KEY);
    } catch {
        cachedToken = null;
    }
    return cachedToken;
}

export function setAuthToken(token: string): void {
    cachedToken = token;
    try {
        localStorage.setItem(TOKEN_KEY, token);
    } catch { /* ignore */ }
}

export function clearAuthToken(): void {
    cachedToken = null;
    try {
        localStorage.removeItem(TOKEN_KEY);
    } catch { /* ignore */ }
}

const API_URL = import.meta.env.VITE_API_URL || '';

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const token = getAuthToken();
    const headers = new Headers(options.headers);

    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    return fetch(`${API_URL}${path}`, {
        ...options,
        headers,
    });
}
