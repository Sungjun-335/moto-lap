import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useTranslation } from '../i18n/context';
import { Loader2, LogOut } from 'lucide-react';

const RegistrationModal: React.FC = () => {
    const { showRegistrationModal, register, logout } = useAuth();
    const { t } = useTranslation();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [realName, setRealName] = useState('');
    const [nickname, setNickname] = useState('');
    const [teamName, setTeamName] = useState('');
    const [bikeName, setBikeName] = useState('');
    const [racingExperience, setRacingExperience] = useState('');
    const [primaryTrack, setPrimaryTrack] = useState('');
    const [agreeTerms, setAgreeTerms] = useState(false);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    if (!showRegistrationModal) return null;

    const handleSubmit = async () => {
        setError('');

        if (!agreeTerms) {
            setError(t.auth.termsRequired); return;
        }
        if (!username.trim() || username.trim().length < 4) {
            setError(t.auth.usernameMinLength); return;
        }
        if (!password || password.length < 8 || !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
            setError(t.auth.passwordMinLength); return;
        }
        if (password !== passwordConfirm) {
            setError(t.auth.passwordMismatch); return;
        }
        if (!realName.trim()) {
            setError(t.auth.realNameRequired); return;
        }
        if (!nickname.trim() || nickname.trim().length > 20) {
            setError(t.auth.nicknameInvalid); return;
        }

        setSaving(true);
        try {
            await register({
                username: username.trim(),
                password,
                realName: realName.trim(),
                nickname: nickname.trim(),
                teamName: teamName.trim() || undefined,
                bikeName: bikeName.trim() || undefined,
                racingExperience: racingExperience.trim() || undefined,
                primaryTrack: primaryTrack.trim() || undefined,
            });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg === 'username_taken') {
                setError(t.auth.usernameTaken);
            } else {
                setError(msg);
            }
        } finally {
            setSaving(false);
        }
    };

    const inputClass = "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none";
    const labelClass = "text-xs text-zinc-400 mb-1";

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-md max-h-[90vh] overflow-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-1">{t.auth.registerTitle}</h3>
                <p className="text-sm text-zinc-400 mb-5">{t.auth.registerSubtitle}</p>

                {error && (
                    <div className="mb-4 px-3 py-2 rounded-lg bg-red-900/40 border border-red-700/50 text-sm text-red-400">
                        {error}
                    </div>
                )}

                <div className="space-y-3">
                    {/* Terms of Service */}
                    <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
                        <div className="max-h-28 overflow-auto text-xs text-zinc-400 mb-3 leading-relaxed">
                            {t.auth.termsContent}
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={agreeTerms}
                                onChange={e => setAgreeTerms(e.target.checked)}
                                className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                            />
                            <span className="text-sm text-zinc-300">{t.auth.agreeTerms}</span>
                        </label>
                    </div>

                    {/* Required fields */}
                    <div className="flex flex-col">
                        <label className={labelClass}>{t.auth.username} *</label>
                        <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                            placeholder={t.auth.usernamePlaceholder} className={inputClass} maxLength={20} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col">
                            <label className={labelClass}>{t.auth.password} *</label>
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                                placeholder={t.auth.passwordPlaceholder} className={inputClass} />
                        </div>
                        <div className="flex flex-col">
                            <label className={labelClass}>{t.auth.passwordConfirm} *</label>
                            <input type="password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)}
                                placeholder={t.auth.passwordConfirmPlaceholder} className={inputClass} />
                        </div>
                    </div>

                    <div className="flex flex-col">
                        <label className={labelClass}>{t.auth.realName} *</label>
                        <input type="text" value={realName} onChange={e => setRealName(e.target.value)}
                            placeholder={t.auth.realNamePlaceholder} className={inputClass} />
                    </div>

                    <div className="flex flex-col">
                        <label className={labelClass}>{t.auth.nickname} *</label>
                        <input type="text" value={nickname} onChange={e => setNickname(e.target.value)}
                            placeholder={t.auth.nicknamePlaceholder} className={inputClass} maxLength={20} />
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-2 pt-2">
                        <div className="flex-1 h-px bg-zinc-700" />
                        <span className="text-xs text-zinc-500">{t.auth.optionalFields}</span>
                        <div className="flex-1 h-px bg-zinc-700" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col">
                            <label className={labelClass}>{t.auth.teamName}</label>
                            <input type="text" value={teamName} onChange={e => setTeamName(e.target.value)}
                                placeholder={t.auth.teamNamePlaceholder} className={inputClass} />
                        </div>
                        <div className="flex flex-col">
                            <label className={labelClass}>{t.auth.bikeName}</label>
                            <input type="text" value={bikeName} onChange={e => setBikeName(e.target.value)}
                                placeholder={t.auth.bikeNamePlaceholder} className={inputClass} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col">
                            <label className={labelClass}>{t.auth.racingExperience}</label>
                            <input type="text" value={racingExperience} onChange={e => setRacingExperience(e.target.value)}
                                placeholder={t.auth.racingExperiencePlaceholder} className={inputClass} />
                        </div>
                        <div className="flex flex-col">
                            <label className={labelClass}>{t.auth.primaryTrack}</label>
                            <input type="text" value={primaryTrack} onChange={e => setPrimaryTrack(e.target.value)}
                                placeholder={t.auth.primaryTrackPlaceholder} className={inputClass} />
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex gap-3">
                    <button
                        onClick={logout}
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2.5 text-sm text-zinc-400 hover:bg-zinc-800 transition"
                    >
                        <LogOut size={14} />
                        {t.auth.signOut}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving || !agreeTerms}
                        className="flex-1 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50 transition flex items-center justify-center gap-2"
                    >
                        {saving && <Loader2 size={14} className="animate-spin" />}
                        {t.auth.registerButton}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RegistrationModal;
