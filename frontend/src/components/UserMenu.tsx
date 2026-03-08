import React, { useState, useRef, useEffect } from 'react';
import { LogOut, ChevronDown, AlertCircle, X, UserPlus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useTranslation } from '../i18n/context';

const UserMenu: React.FC = () => {
    const { user, isAuthenticated, isLoading, authError, loginWithCredentials, openRegistrationModal, logout, clearError } = useAuth();
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [loginUsername, setLoginUsername] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogin = async () => {
        if (!loginUsername.trim() || !loginPassword) return;
        setLoginError('');
        setLoginLoading(true);
        try {
            await loginWithCredentials(loginUsername.trim(), loginPassword);
            setOpen(false);
            setLoginUsername('');
            setLoginPassword('');
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg === 'invalid_credentials') {
                setLoginError(t.auth.invalidCredentials);
            } else {
                setLoginError(msg);
            }
        } finally {
            setLoginLoading(false);
        }
    };

    if (isLoading) return null;

    return (
        <div className="relative" ref={menuRef}>
            {authError && (
                <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-lg border border-red-500/30 bg-red-950/80 p-3 shadow-xl">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="flex-1 text-xs text-red-300">{authError}</p>
                        <button onClick={clearError} className="text-red-400 hover:text-red-200">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            )}

            {!isAuthenticated ? (
                <>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={openRegistrationModal}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-400 transition hover:border-white/20 hover:bg-white/10"
                        >
                            <UserPlus className="h-3.5 w-3.5" />
                            {t.auth.registerButton}
                        </button>
                        <button
                            onClick={() => setOpen(!open)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/10"
                        >
                            {t.auth.signIn}
                            <ChevronDown className={`h-3 w-3 transition ${open ? 'rotate-180' : ''}`} />
                        </button>
                    </div>

                    {open && (
                        <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-xl border border-white/10 bg-zinc-900 p-3 shadow-xl">
                            {loginError && (
                                <div className="mb-2 px-2 py-1.5 rounded bg-red-900/40 border border-red-700/50 text-xs text-red-400">
                                    {loginError}
                                </div>
                            )}
                            <input
                                type="text"
                                value={loginUsername}
                                onChange={e => setLoginUsername(e.target.value)}
                                placeholder={t.auth.usernamePlaceholder}
                                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none mb-2"
                                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                                autoFocus
                            />
                            <input
                                type="password"
                                value={loginPassword}
                                onChange={e => setLoginPassword(e.target.value)}
                                placeholder={t.auth.passwordPlaceholder}
                                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none mb-2"
                                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                            />
                            <button
                                onClick={handleLogin}
                                disabled={loginLoading || !loginUsername.trim() || !loginPassword}
                                className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50 transition"
                            >
                                {loginLoading ? '...' : t.auth.signIn}
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <>
                    <button
                        onClick={() => setOpen(!open)}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-sm text-zinc-300 transition hover:border-white/20 hover:bg-white/10"
                    >
                        {user?.picture ? (
                            <img src={user.picture} alt="" className="h-6 w-6 rounded-full" referrerPolicy="no-referrer" />
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
                                {user?.email && <p className="text-xs text-zinc-400 truncate">{user.email}</p>}
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
