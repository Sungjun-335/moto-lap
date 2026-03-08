import React, { useState, useRef, useEffect } from 'react';
import { LogOut, ChevronDown, AlertCircle, X, UserPlus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useTranslation } from '../i18n/context';

const KakaoIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 3C6.477 3 2 6.463 2 10.691c0 2.72 1.807 5.109 4.527 6.454-.163.588-.592 2.132-.678 2.464-.107.414.152.408.319.297.132-.088 2.096-1.423 2.953-2.003.575.085 1.168.13 1.776.13h.103c5.523 0 10-3.463 10-7.691v-.651C20.897 6.463 17.523 3 12 3z"/>
    </svg>
);

const NaverIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.273 12.845L7.376 3H3v18h4.727V11.155L16.624 21H21V3h-4.727z"/>
    </svg>
);

const GoogleIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
);

const UserMenu: React.FC = () => {
    const { user, isAuthenticated, isLoading, authError, loginWithGoogle, loginWithKakao, loginWithNaver, loginWithCredentials, openRegistrationModal, logout, clearError } = useAuth();
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [showLoginForm, setShowLoginForm] = useState(false);
    const [loginUsername, setLoginUsername] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpen(false);
                setShowLoginForm(false);
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
            setShowLoginForm(false);
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
                            {!showLoginForm ? (
                                <>
                                    {/* OAuth buttons */}
                                    <button
                                        onClick={() => { setOpen(false); loginWithGoogle(); }}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10"
                                    >
                                        <GoogleIcon className="h-4 w-4" />
                                        {t.auth.signInGoogle}
                                    </button>
                                    <button
                                        onClick={() => { setOpen(false); loginWithKakao(); }}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10"
                                    >
                                        <KakaoIcon className="h-4 w-4 text-[#FEE500]" />
                                        {t.auth.signInKakao}
                                    </button>
                                    <button
                                        onClick={() => { setOpen(false); loginWithNaver(); }}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10"
                                    >
                                        <NaverIcon className="h-4 w-4 text-[#03C75A]" />
                                        {t.auth.signInNaver}
                                    </button>

                                    <div className="flex items-center gap-2 my-2">
                                        <div className="flex-1 h-px bg-zinc-700" />
                                        <span className="text-[10px] text-zinc-500">{t.auth.or}</span>
                                        <div className="flex-1 h-px bg-zinc-700" />
                                    </div>

                                    <button
                                        onClick={() => setShowLoginForm(true)}
                                        className="w-full rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/10 transition"
                                    >
                                        {t.auth.signInWithId}
                                    </button>
                                </>
                            ) : (
                                <>
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
                                        className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50 transition mb-2"
                                    >
                                        {loginLoading ? '...' : t.auth.signIn}
                                    </button>
                                    <button
                                        onClick={() => { setShowLoginForm(false); setLoginError(''); }}
                                        className="w-full text-xs text-zinc-500 hover:text-zinc-300 transition"
                                    >
                                        {t.common.back}
                                    </button>
                                </>
                            )}
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
