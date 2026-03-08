import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getAuthToken, setAuthToken, clearAuthToken, apiFetch } from '../utils/apiClient';

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
    loginWithCredentials: async () => { },
    logout: () => { },
    clearError: () => { },
    register: async () => { },
});

const API_URL = import.meta.env.VITE_API_URL || '';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const [showRegistrationModal, setShowRegistrationModal] = useState(false);

    // Verify existing token on mount
    useEffect(() => {
        const token = getAuthToken();
        if (!token) {
            setIsLoading(false);
            return;
        }
        apiFetch('/api/auth/me')
            .then(async resp => {
                if (resp.ok) {
                    setUser(await resp.json());
                } else {
                    clearAuthToken();
                    setUser(null);
                }
            })
            .catch(() => {
                clearAuthToken();
                setUser(null);
            })
            .finally(() => setIsLoading(false));
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

    const clearError = useCallback(() => {
        setAuthError(null);
    }, []);

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

    const openRegistrationModal = useCallback(() => {
        setShowRegistrationModal(true);
    }, []);

    const dismissRegistrationModal = useCallback(() => {
        setShowRegistrationModal(false);
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
        loginWithCredentials,
        logout,
        clearError,
        register: registerHandler,
    }), [user, isAdmin, isLoading, authError, showRegistrationModal, openRegistrationModal, dismissRegistrationModal, loginWithCredentials, logout, clearError, registerHandler]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export function useAuth() {
    return useContext(AuthContext);
}
