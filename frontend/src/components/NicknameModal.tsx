import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useTranslation } from '../i18n/context';

const NicknameModal: React.FC = () => {
    const { showNicknameModal, setNickname, dismissNicknameModal } = useAuth();
    const { t } = useTranslation();
    const [value, setValue] = useState('');
    const [saving, setSaving] = useState(false);

    if (!showNicknameModal) return null;

    const handleSubmit = async () => {
        const trimmed = value.trim();
        if (!trimmed || trimmed.length > 20) return;
        setSaving(true);
        await setNickname(trimmed);
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-80 rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
                <h3 className="text-lg font-semibold text-white mb-1">{t.auth.welcomeTitle}</h3>
                <p className="text-sm text-zinc-400 mb-4">{t.auth.nicknamePrompt}</p>
                <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    maxLength={20}
                    placeholder={t.auth.nicknamePlaceholder}
                    className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    autoFocus
                />
                <div className="mt-4 flex gap-2">
                    <button
                        onClick={dismissNicknameModal}
                        className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-400 hover:bg-white/5"
                    >
                        {t.auth.skipNickname}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!value.trim() || saving}
                        className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                        {saving ? '...' : t.common.confirm}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NicknameModal;
