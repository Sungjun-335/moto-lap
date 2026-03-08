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
    phone: string;
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
    loginWithGoogle: () => void;
    loginWithKakao: () => void;
    loginWithNaver: () => void;
    loginWithCredentials: (username: string, password: string) => Promise<void>;
    logout: () => void;
    clearError: () => void;
    register: (data: RegisterData) => Promise<void>;
    dismissRegistrationModal: () => void;
    // Keep old nickname API for backward compat
    setNickname: (nickname: string) => Promise<void>;
    showNicknameModal: boolean;
    dismissNicknameModal: () => void;
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    isAuthenticated: false,
    isAdmin: false,
    isLoading: true,
    authError: null,
    showRegistrationModal: false,
    loginWithGoogle: () => { },
    loginWithKakao: () => { },
    loginWithNaver: () => { },
    loginWithCredentials: async () => { },
    logout: () => { },
    clearError: () => { },
    register: async () => { },
    dismissRegistrationModal: () => { },
    setNickname: async () => { },
    showNicknameModal: false,
    dismissNicknameModal: () => { },
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

    // Verify existing token on mount
    const verifyToken = useCallback(async () => {
        try {
            const resp = await apiFetch('/api/auth/me');
            if (resp.ok) {
                const data = await resp.json();
                setUser(data);
                // Show registration modal if not completed
                if (!data.registration_complete) {
                    setShowRegistrationModal(true);
                }
            } else {
                clearAuthToken();
                setUser(null);
            }
        } catch {
            clearAuthToken();
            setUser(null);
        }
    }, []);

    // Handle auth response (shared by all providers)
    const handleAuthResponse = useCallback(async (data: { token: string; user: User; is_new?: boolean; registration_complete?: boolean }) => {
        setAuthToken(data.token);
        setUser(data.user);
        setAuthError(null);
        // Show registration modal if registration not complete
        if (!data.registration_complete) {
            setShowRegistrationModal(true);
        }
    }, []);

    // Google token callback — receives access_token via popup
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
                const data = await resp.json();
                await handleAuthResponse(data);
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

    // Load Google GSI script + init token client
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

    // Handle OAuth callback (Kakao/Naver redirect with ?code=)
    const handleOAuthCallback = useCallback(async (provider: string, code: string, state: string | null) => {
        // Validate OAuth state to prevent CSRF
        const savedState = localStorage.getItem('oauth_state');
        if (!state || state !== savedState) {
            setAuthError('Invalid OAuth state. Please try again.');
            setIsLoading(false);
            return;
        }

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
                await handleAuthResponse(data);
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

    // On mount: handle OAuth callback OR verify existing token (not both)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        const provider = localStorage.getItem('oauth_provider');

        if (code && provider && (provider === 'kakao' || provider === 'naver')) {
            // OAuth redirect callback — exchange code for new token
            window.history.replaceState({}, '', window.location.pathname);
            localStorage.removeItem('oauth_provider');
            localStorage.removeItem('oauth_state');
            handleOAuthCallback(provider, code, state);
        } else {
            // No OAuth callback — verify existing token
            const token = getAuthToken();
            if (token) {
                verifyToken().finally(() => setIsLoading(false));
            } else {
                setIsLoading(false);
            }
        }
    }, [verifyToken, handleOAuthCallback]);

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
        try {
            setIsLoading(true);
            setAuthError(null);
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
                if (!data.registration_complete) {
                    setShowRegistrationModal(true);
                }
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

    const clearError = useCallback(() => {
        setAuthError(null);
    }, []);

    const registerHandler = useCallback(async (data: RegisterData) => {
        const resp = await apiFetch('/api/auth/register', {
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

    const dismissRegistrationModal = useCallback(() => {
        setShowRegistrationModal(false);
    }, []);

    // Legacy nickname support
    const setNicknameHandler = useCallback(async (nickname: string) => {
        try {
            const resp = await apiFetch('/api/auth/nickname', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nickname }),
            });
            if (resp.ok) {
                const data = await resp.json();
                if (data.token) setAuthToken(data.token);
                if (data.user) setUser(data.user);
            } else {
                const err = await resp.json().catch(() => ({ error: 'Failed' }));
                setAuthError(err.error || 'Failed to set nickname');
            }
        } catch {
            setAuthError('Network error');
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
        loginWithGoogle,
        loginWithKakao,
        loginWithNaver,
        loginWithCredentials,
        logout,
        clearError,
        register: registerHandler,
        dismissRegistrationModal,
        setNickname: setNicknameHandler,
        showNicknameModal: false,
        dismissNicknameModal: dismissRegistrationModal,
    }), [user, isAdmin, isLoading, authError, showRegistrationModal, loginWithGoogle, loginWithKakao, loginWithNaver, loginWithCredentials, logout, clearError, registerHandler, dismissRegistrationModal, setNicknameHandler]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export function useAuth() {
    return useContext(AuthContext);
}
