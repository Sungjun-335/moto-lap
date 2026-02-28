const TOKEN_KEY = 'motolap-auth-token';

export function getAuthToken(): string | null {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export function setAuthToken(token: string): void {
    try {
        localStorage.setItem(TOKEN_KEY, token);
    } catch { /* ignore */ }
}

export function clearAuthToken(): void {
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
