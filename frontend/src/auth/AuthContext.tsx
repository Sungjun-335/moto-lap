import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getAuthToken, setAuthToken, clearAuthToken, apiFetch } from '../utils/apiClient';

interface User {
    id: string;
    email: string;
    name: string;
    picture: string;
}

const ADMIN_EMAILS = ['yy95211@gmail.com'];

interface AuthContextValue {
    user: User | null;
    isAuthenticated: boolean;
    isAdmin: boolean;
    isLoading: boolean;
    authError: string | null;
    loginWithGoogle: () => void;
    loginWithKakao: () => void;
    loginWithNaver: () => void;
    logout: () => void;
    clearError: () => void;
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    isAuthenticated: false,
    isAdmin: false,
    isLoading: true,
    authError: null,
    loginWithGoogle: () => {},
    loginWithKakao: () => {},
    loginWithNaver: () => {},
    logout: () => {},
    clearError: () => {},
});

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const KAKAO_CLIENT_ID = import.meta.env.VITE_KAKAO_CLIENT_ID || '';
const NAVER_CLIENT_ID = import.meta.env.VITE_NAVER_CLIENT_ID || '';
const API_URL = import.meta.env.VITE_API_URL || '';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);

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

    // Handle OAuth callback (Google/Kakao/Naver redirect with ?code=)
    const handleOAuthCallback = useCallback(async (provider: string, code: string, state: string | null) => {
        try {
            setIsLoading(true);
            const redirectUri = window.location.origin + '/';
            const resp = await fetch(`${API_URL}/api/auth/${provider}/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, state, redirect_uri: redirectUri }),
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
            setAuthError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Check for OAuth callback on mount
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        const provider = sessionStorage.getItem('oauth_provider');

        if (code && provider && (provider === 'google' || provider === 'kakao' || provider === 'naver')) {
            window.history.replaceState({}, '', window.location.pathname);
            sessionStorage.removeItem('oauth_provider');
            sessionStorage.removeItem('oauth_state');
            handleOAuthCallback(provider, code, state);
        }
    }, [handleOAuthCallback]);

    // Google login (redirect flow)
    const loginWithGoogle = useCallback(() => {
        const redirectUri = window.location.origin + '/';
        const state = crypto.randomUUID();
        sessionStorage.setItem('oauth_state', state);
        sessionStorage.setItem('oauth_provider', 'google');
        window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=email%20profile&state=${state}&prompt=select_account`;
    }, []);

    // Kakao login
    const loginWithKakao = useCallback(() => {
        const redirectUri = window.location.origin + '/';
        const state = crypto.randomUUID();
        sessionStorage.setItem('oauth_state', state);
        sessionStorage.setItem('oauth_provider', 'kakao');
        window.location.href = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`;
    }, []);

    // Naver login
    const loginWithNaver = useCallback(() => {
        const redirectUri = window.location.origin + '/';
        const state = crypto.randomUUID();
        sessionStorage.setItem('oauth_state', state);
        sessionStorage.setItem('oauth_provider', 'naver');
        window.location.href = `https://nid.naver.com/oauth2.0/authorize?client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`;
    }, []);

    const logout = useCallback(() => {
        clearAuthToken();
        setUser(null);
    }, []);

    const clearError = useCallback(() => {
        setAuthError(null);
    }, []);

    const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email);

    const value = useMemo(() => ({
        user,
        isAuthenticated: !!user,
        isAdmin,
        isLoading,
        authError,
        loginWithGoogle,
        loginWithKakao,
        loginWithNaver,
        logout,
        clearError,
    }), [user, isAdmin, isLoading, authError, loginWithGoogle, loginWithKakao, loginWithNaver, logout, clearError]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export function useAuth() {
    return useContext(AuthContext);
}
