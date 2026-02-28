import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getAuthToken, setAuthToken, clearAuthToken, apiFetch } from '../utils/apiClient';

declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize: (config: Record<string, unknown>) => void;
                    prompt: () => void;
                    renderButton: (el: HTMLElement, config: Record<string, unknown>) => void;
                    revoke: (email: string, cb: () => void) => void;
                };
            };
        };
    }
}

interface User {
    id: string;
    email: string;
    name: string;
    picture: string;
}

interface AuthContextValue {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    authError: string | null;
    gsiReady: boolean;
    renderGoogleButton: (el: HTMLElement) => void;
    logout: () => void;
    clearError: () => void;
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    authError: null,
    gsiReady: false,
    renderGoogleButton: () => {},
    logout: () => {},
    clearError: () => {},
});

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const API_URL = import.meta.env.VITE_API_URL || '';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const [gsiReady, setGsiReady] = useState(false);
    const initializedRef = useRef(false);

    // Handle Google credential response
    const handleCredentialResponse = useCallback(async (credential: string) => {
        try {
            const resp = await fetch(`${API_URL}/api/auth/google-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_token: credential }),
            });
            if (resp.ok) {
                const data = await resp.json();
                setAuthToken(data.token);
                setUser(data.user);
                setAuthError(null);
            } else {
                const err = await resp.json().catch(() => ({ error: 'Login failed' }));
                setAuthError(err.error || 'Login failed');
            }
        } catch (e) {
            console.error('Auth error:', e);
            setAuthError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
        }
    }, []);

    // Initialize GIS
    useEffect(() => {
        if (!GOOGLE_CLIENT_ID || initializedRef.current) {
            if (!GOOGLE_CLIENT_ID) setIsLoading(false);
            return;
        }

        const initGsi = () => {
            if (!window.google?.accounts?.id) return false;
            initializedRef.current = true;
            window.google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: (resp: { credential: string }) => {
                    handleCredentialResponse(resp.credential);
                },
                auto_select: true,
            });
            setGsiReady(true);
            return true;
        };

        if (!initGsi()) {
            const interval = setInterval(() => {
                if (initGsi()) clearInterval(interval);
            }, 100);
            const timeout = setTimeout(() => {
                clearInterval(interval);
                setIsLoading(false);
            }, 5000);
            return () => { clearInterval(interval); clearTimeout(timeout); };
        }
    }, [handleCredentialResponse]);

    // Verify existing token on mount
    const verifyToken = useCallback(async () => {
        try {
            const resp = await apiFetch('/api/auth/me');
            if (resp.ok) {
                const data = await resp.json();
                setUser(data);
            } else {
                clearAuthToken();
                setUser(null);
            }
        } catch {
            clearAuthToken();
            setUser(null);
        }
    }, []);

    useEffect(() => {
        const token = getAuthToken();
        if (token) {
            verifyToken().finally(() => setIsLoading(false));
        } else {
            setIsLoading(false);
        }
    }, [verifyToken]);

    // Render Google Sign-In button into a container element
    const renderGoogleButton = useCallback((el: HTMLElement) => {
        if (!window.google?.accounts?.id) return;
        window.google.accounts.id.renderButton(el, {
            type: 'standard',
            theme: 'filled_black',
            size: 'medium',
            shape: 'pill',
            text: 'signin_with',
            width: 200,
        });
    }, []);

    const logout = useCallback(() => {
        clearAuthToken();
        setUser(null);
        if (user?.email && window.google?.accounts?.id) {
            window.google.accounts.id.revoke(user.email, () => {});
        }
    }, [user?.email]);

    const clearError = useCallback(() => {
        setAuthError(null);
    }, []);

    const value = useMemo(() => ({
        user,
        isAuthenticated: !!user,
        isLoading,
        authError,
        gsiReady,
        renderGoogleButton,
        logout,
        clearError,
    }), [user, isLoading, authError, gsiReady, renderGoogleButton, logout, clearError]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export function useAuth() {
    return useContext(AuthContext);
}
