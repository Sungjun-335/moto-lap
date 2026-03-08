import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getAuthToken, setAuthToken, clearAuthToken, apiFetch } from '../utils/apiClient';

declare global {
    interface Window {
        google?: {
            accounts: {
                oauth2: {
                    initTokenClient: (config: {
                        client_id: string;
                        scope: string;
                        callback: (response: { access_token: string; error?: string }) => void;
                    }) => { requestAccessToken: () => void };
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
    nickname?: string;
}

export interface RegisterData {
    username: string;
    password: string;
    realName: string;
    nickname: string;
    teamName?: string;
    bikeName?: string;
    racingExperience?: string;
    primaryTrack?: string;
}

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || '').split(',').map((e: string) => e.trim()).filter(Boolean);

interface AuthContextValue {
    user: User | null;
    isAuthenticated: boolean;
    isAdmin: boolean;
    isLoading: boolean;
    authError: string | null;
    showRegistrationModal: boolean;
    openRegistrationModal: () => void;
    dismissRegistrationModal: () => void;
    loginWithGoogle: () => void;
    loginWithKakao: () => void;
    loginWithNaver: () => void;
    loginWithCredentials: (username: string, password: string) => Promise<void>;
    logout: () => void;
    clearError: () => void;
    register: (data: RegisterData) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    isAuthenticated: false,
    isAdmin: false,
    isLoading: true,
    authError: null,
    showRegistrationModal: false,
    openRegistrationModal: () => { },
    dismissRegistrationModal: () => { },
    loginWithGoogle: () => { },
    loginWithKakao: () => { },
    loginWithNaver: () => { },
    loginWithCredentials: async () => { },
    logout: () => { },
    clearError: () => { },
    register: async () => { },
});

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const KAKAO_CLIENT_ID = import.meta.env.VITE_KAKAO_CLIENT_ID || '';
const NAVER_CLIENT_ID = import.meta.env.VITE_NAVER_CLIENT_ID || '';
const API_URL = import.meta.env.VITE_API_URL || '';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const [showRegistrationModal, setShowRegistrationModal] = useState(false);
    const gsiLoadedRef = useRef(false);
    const googleClientRef = useRef<{ requestAccessToken: () => void } | null>(null);

    // Handle auth response (shared by all providers)
    const handleAuthResponse = useCallback(async (data: { token: string; user: User; is_new?: boolean; registration_complete?: boolean }) => {
        setAuthToken(data.token);
        setUser(data.user);
        setAuthError(null);
        // Show registration modal for new OAuth users who haven't completed registration
        if (!data.registration_complete) {
            setShowRegistrationModal(true);
        }
    }, []);

    // Verify existing token on mount
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        const provider = localStorage.getItem('oauth_provider');

        if (code && provider && (provider === 'kakao' || provider === 'naver' || provider === 'google')) {
            // OAuth redirect callback
            window.history.replaceState({}, '', window.location.pathname);
            localStorage.removeItem('oauth_provider');
            const savedState = localStorage.getItem('oauth_state');
            localStorage.removeItem('oauth_state');

            if (!state || state !== savedState) {
                setAuthError('Invalid OAuth state. Please try again.');
                setIsLoading(false);
                return;
            }

            const redirectUri = window.location.origin + '/';
            fetch(`${API_URL}/api/auth/${provider}/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, state, redirect_uri: redirectUri }),
            })
                .then(async resp => {
                    if (resp.ok) {
                        await handleAuthResponse(await resp.json());
                    } else {
                        const err = await resp.json().catch(() => ({ error: 'Login failed' }));
                        setAuthError(err.error || 'Login failed');
                    }
                })
                .catch(e => setAuthError(`Network error: ${e instanceof Error ? e.message : String(e)}`))
                .finally(() => setIsLoading(false));
        } else {
            // No OAuth callback — verify existing token
            const token = getAuthToken();
            if (token) {
                apiFetch('/api/auth/me')
                    .then(async resp => {
                        if (resp.ok) {
                            const data = await resp.json();
                            setUser(data);
                            if (!data.registration_complete) {
                                setShowRegistrationModal(true);
                            }
                        } else {
                            clearAuthToken();
                        }
                    })
                    .catch(() => clearAuthToken())
                    .finally(() => setIsLoading(false));
            } else {
                setIsLoading(false);
            }
        }
    }, [handleAuthResponse]);

    // Google token callback
    const handleGoogleToken = useCallback(async (tokenResponse: { access_token: string; error?: string }) => {
        if (tokenResponse.error) {
            setAuthError(`Google login error: ${tokenResponse.error}`);
            return;
        }
        try {
            setIsLoading(true);
            const resp = await fetch(`${API_URL}/api/auth/google-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_token: tokenResponse.access_token }),
            });
            if (resp.ok) {
                await handleAuthResponse(await resp.json());
            } else {
                const err = await resp.json().catch(() => ({ error: 'Login failed' }));
                setAuthError(err.error || 'Login failed');
            }
        } catch (e) {
            setAuthError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsLoading(false);
        }
    }, [handleAuthResponse]);

    // Load Google GSI script
    useEffect(() => {
        if (gsiLoadedRef.current || !GOOGLE_CLIENT_ID) return;
        gsiLoadedRef.current = true;
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.onload = () => {
            if (window.google?.accounts.oauth2) {
                googleClientRef.current = window.google.accounts.oauth2.initTokenClient({
                    client_id: GOOGLE_CLIENT_ID,
                    scope: 'email profile',
                    callback: handleGoogleToken,
                });
            }
        };
        document.head.appendChild(script);
    }, [handleGoogleToken]);

    const loginWithGoogle = useCallback(() => {
        if (googleClientRef.current) {
            googleClientRef.current.requestAccessToken();
        } else {
            setAuthError('Google Sign-In not loaded');
        }
    }, []);

    const loginWithKakao = useCallback(() => {
        const redirectUri = window.location.origin + '/';
        const state = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
        localStorage.setItem('oauth_state', state);
        localStorage.setItem('oauth_provider', 'kakao');
        window.location.href = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`;
    }, []);

    const loginWithNaver = useCallback(() => {
        const redirectUri = window.location.origin + '/';
        const state = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
        localStorage.setItem('oauth_state', state);
        localStorage.setItem('oauth_provider', 'naver');
        window.location.href = `https://nid.naver.com/oauth2.0/authorize?client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`;
    }, []);

    const loginWithCredentials = useCallback(async (username: string, password: string) => {
        setIsLoading(true);
        setAuthError(null);
        try {
            const resp = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            if (resp.ok) {
                const data = await resp.json();
                setAuthToken(data.token);
                setUser(data.user);
                setAuthError(null);
            } else {
                const err = await resp.json().catch(() => ({ error: 'Login failed' }));
                throw new Error(err.error || 'Login failed');
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    const logout = useCallback(() => {
        clearAuthToken();
        setUser(null);
        setShowRegistrationModal(false);
    }, []);

    const clearError = useCallback(() => setAuthError(null), []);

    const openRegistrationModal = useCallback(() => setShowRegistrationModal(true), []);
    const dismissRegistrationModal = useCallback(() => setShowRegistrationModal(false), []);

    const registerHandler = useCallback(async (data: RegisterData) => {
        const resp = await fetch(`${API_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (resp.ok) {
            const result = await resp.json();
            if (result.token) setAuthToken(result.token);
            if (result.user) setUser(result.user);
            setShowRegistrationModal(false);
        } else {
            const err = await resp.json().catch(() => ({ error: 'Registration failed' }));
            throw new Error(err.error || 'Registration failed');
        }
    }, []);

    const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email);

    const value = useMemo(() => ({
        user,
        isAuthenticated: !!user,
        isAdmin,
        isLoading,
        authError,
        showRegistrationModal,
        openRegistrationModal,
        dismissRegistrationModal,
        loginWithGoogle,
        loginWithKakao,
        loginWithNaver,
        loginWithCredentials,
        logout,
        clearError,
        register: registerHandler,
    }), [user, isAdmin, isLoading, authError, showRegistrationModal, openRegistrationModal, dismissRegistrationModal, loginWithGoogle, loginWithKakao, loginWithNaver, loginWithCredentials, logout, clearError, registerHandler]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export function useAuth() {
    return useContext(AuthContext);
}
