import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LogOut, ChevronDown, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useTranslation } from '../i18n/context';

const UserMenu: React.FC = () => {
    const { user, isAuthenticated, isLoading, authError, gsiReady, renderGoogleButton, logout, clearError } = useAuth();
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const googleBtnRef = useCallback((el: HTMLDivElement | null) => {
        if (el && gsiReady) renderGoogleButton(el);
    }, [gsiReady, renderGoogleButton]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (isLoading) return null;

    return (
        <div className="relative" ref={menuRef}>
            {authError && (
                <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-lg border border-red-500/30 bg-red-950/80 p-3 shadow-xl">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-xs text-red-300">Login failed: {authError}</p>
                        </div>
                        <button onClick={clearError} className="text-red-400 hover:text-red-200">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            )}

            {!isAuthenticated ? (
                <div ref={googleBtnRef} />
            ) : (
                <>
                    <button
                        onClick={() => setOpen(!open)}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-sm text-zinc-300 transition hover:border-white/20 hover:bg-white/10"
                    >
                        {user?.picture ? (
                            <img
                                src={user.picture}
                                alt=""
                                className="h-6 w-6 rounded-full"
                                referrerPolicy="no-referrer"
                            />
                        ) : (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/30 text-xs font-medium text-emerald-200">
                                {user?.name?.[0]?.toUpperCase() || '?'}
                            </div>
                        )}
                        <span className="hidden sm:inline max-w-[100px] truncate">{user?.name}</span>
                        <ChevronDown className={`h-3 w-3 transition ${open ? 'rotate-180' : ''}`} />
                    </button>

                    {open && (
                        <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-xl border border-white/10 bg-zinc-900 p-2 shadow-xl">
                            <div className="border-b border-white/10 px-3 py-2 mb-2">
                                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                                <p className="text-xs text-zinc-400 truncate">{user?.email}</p>
                            </div>
                            <button
                                onClick={() => { logout(); setOpen(false); }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10"
                            >
                                <LogOut className="h-4 w-4" />
                                {t.auth.signOut}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default UserMenu;
