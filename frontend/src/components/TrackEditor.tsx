import React, { useEffect, useMemo } from 'react';
import { useTranslation } from '../i18n/context';

const API_URL = import.meta.env.VITE_API_URL || '';

interface TrackEditorProps {
  onBack: () => void;
}

const TrackEditor: React.FC<TrackEditorProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const iframeSrc = useMemo(
    () => `/track-editor.html?apiUrl=${encodeURIComponent(API_URL)}`,
    []
  );

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'track-editor-go-home') onBack();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onBack]);

  return (
    <div className="flex h-screen flex-col bg-zinc-950">
      <iframe
        src={iframeSrc}
        className="flex-1 border-0"
        title={t.admin.trackManager}
      />
    </div>
  );
};

export default TrackEditor;
