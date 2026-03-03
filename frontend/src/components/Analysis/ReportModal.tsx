import React, { useEffect, useRef, useCallback, useState } from 'react';
import { X, Copy, Check, Loader2, AlertCircle, RefreshCw, Sparkles, History, ArrowLeft } from 'lucide-react';
import { renderMarkdown, markdownStyles } from '../../utils/markdownRenderer';
import { useTranslation } from '../../i18n/context';
import type { StoredReport } from '../../utils/sessionStorage';
import type { SessionData } from '../../types';
import type { AnalysisPoint } from '../../utils/analysis';
import ReportCharts from './ReportCharts';

interface ReportModalProps {
  status: 'confirm' | 'loading' | 'error' | 'success';
  report: string;
  error: string;
  onClose: () => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  reportLang: 'ko' | 'en';
  onLangChange: (lang: 'ko' | 'en') => void;
  savedReports?: StoredReport[];
  chartData?: {
    data: SessionData;
    viewData: AnalysisPoint[];
    refLapIndex: number;
    anaLapIndex: number;
  };
}

const ReportModal: React.FC<ReportModalProps> = ({
  status, report, error, onClose, onGenerate, onRegenerate,
  reportLang, onLangChange, savedReports, chartData
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [viewingPastReport, setViewingPastReport] = useState<StoredReport | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // ESC key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showLog || viewingPastReport) {
          setShowLog(false);
          setViewingPastReport(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, showLog, viewingPastReport]);

  // Click outside to close
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose],
  );

  const handleCopy = useCallback(async () => {
    const textToCopy = viewingPastReport ? viewingPastReport.report : report;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [report, viewingPastReport]);

  const handleSelectPastReport = useCallback((r: StoredReport) => {
    setViewingPastReport(r);
    setShowLog(false);
  }, []);

  const handleBackFromPast = useCallback(() => {
    setViewingPastReport(null);
  }, []);

  const handleBackFromLog = useCallback(() => {
    setShowLog(false);
  }, []);

  const isViewingPast = viewingPastReport !== null;
  const displayReport = isViewingPast ? viewingPastReport.report : report;
  const showingSuccess = isViewingPast || status === 'success';

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })
      + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-2xl max-h-[80vh] mx-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            {(showLog || isViewingPast) && (
              <button
                onClick={showLog ? handleBackFromLog : handleBackFromPast}
                className="flex items-center justify-center w-7 h-7 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
              >
                <ArrowLeft size={14} />
              </button>
            )}
            <h2 className="text-sm font-semibold text-zinc-200">
              {showLog
                ? t.report.pastReports
                : isViewingPast
                  ? t.report.loadedPastReport
                  : t.report.title}
            </h2>
            {isViewingPast && (
              <span className="text-[10px] text-zinc-500 font-mono">
                L{viewingPastReport.anaLapIndex} vs L{viewingPastReport.refLapIndex} ({viewingPastReport.lang.toUpperCase()})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Past Reports Log Button — only in main view (not log, not past view) */}
            {!showLog && !isViewingPast && savedReports && savedReports.length > 0 && (
              <button
                onClick={() => setShowLog(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors
                  border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              >
                <History size={12} />
                {t.report.pastReports}
              </button>
            )}
            {/* Language Toggle — hide in log view */}
            {!showLog && (
              <div className="flex rounded-md border border-zinc-700 overflow-hidden">
                <button
                  onClick={() => onLangChange('ko')}
                  disabled={status === 'loading'}
                  className={`px-2 py-1 text-[11px] font-medium transition-colors ${
                    reportLang === 'ko'
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                  } ${status === 'loading' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  한국어
                </button>
                <button
                  onClick={() => onLangChange('en')}
                  disabled={status === 'loading'}
                  className={`px-2 py-1 text-[11px] font-medium transition-colors ${
                    reportLang === 'en'
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                  } ${status === 'loading' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  English
                </button>
              </div>
            )}
            {/* Regenerate */}
            {!showLog && showingSuccess && !isViewingPast && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors
                  border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                title={t.report.regenerate}
              >
                <RefreshCw size={12} />
                {t.report.regenerate}
              </button>
            )}
            {/* Copy */}
            {!showLog && showingSuccess && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors
                  border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              >
                {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                {copied ? t.report.copied : t.report.copy}
              </button>
            )}
            <button
              onClick={onClose}
              className="flex items-center justify-center w-7 h-7 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {/* Past Reports Log View */}
          {showLog && (
            <div className="space-y-2">
              {(!savedReports || savedReports.length === 0) ? (
                <p className="text-sm text-zinc-500 text-center py-8">{t.report.noPastReports}</p>
              ) : (
                savedReports
                  .slice()
                  .sort((a, b) => b.savedAt - a.savedAt)
                  .map(r => (
                    <button
                      key={r.id}
                      onClick={() => handleSelectPastReport(r)}
                      className="w-full text-left p-3 bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg border border-zinc-700/50 hover:border-zinc-600 transition-all group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-red-400">L{r.anaLapIndex}</span>
                          <span className="text-[10px] text-zinc-500">vs</span>
                          <span className="text-xs font-mono font-bold text-orange-400">L{r.refLapIndex}</span>
                          <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${
                            r.lang === 'ko' ? 'bg-blue-900/30 text-blue-400' : 'bg-green-900/30 text-green-400'
                          }`}>
                            {r.lang === 'ko' ? '한국어' : 'EN'}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500">{formatDate(r.savedAt)}</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                        {r.report.slice(0, 150).replace(/[#*_\n]/g, ' ').trim()}...
                      </p>
                    </button>
                  ))
              )}
            </div>
          )}

          {/* Viewing a past report */}
          {!showLog && isViewingPast && (
            <>
              {chartData && (
                <ReportCharts
                  data={chartData.data}
                  viewData={chartData.viewData}
                  refLapIndex={viewingPastReport.refLapIndex}
                  anaLapIndex={viewingPastReport.anaLapIndex}
                />
              )}
              <style>{markdownStyles}</style>
              <div
                className="prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(displayReport) }}
              />
            </>
          )}

          {/* Current report states — only when not in log or past view */}
          {!showLog && !isViewingPast && (
            <>
              {status === 'confirm' && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Sparkles size={28} className="text-violet-400" />
                  <p className="text-sm text-zinc-300">{t.report.noReport}</p>
                  <p className="text-sm text-zinc-500">{t.report.generatePrompt}</p>
                  <button
                    onClick={onGenerate}
                    className="mt-2 flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors
                      bg-violet-600 hover:bg-violet-500 text-white"
                  >
                    <Sparkles size={14} />
                    {t.report.generate}
                  </button>
                </div>
              )}

              {status === 'loading' && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 size={28} className="text-blue-400 animate-spin" />
                  <p className="text-sm text-zinc-400">{t.report.generating}</p>
                </div>
              )}

              {status === 'error' && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <AlertCircle size={28} className="text-red-400" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {status === 'success' && (
                <>
                  {chartData && (
                    <ReportCharts
                      data={chartData.data}
                      viewData={chartData.viewData}
                      refLapIndex={chartData.refLapIndex}
                      anaLapIndex={chartData.anaLapIndex}
                    />
                  )}
                  <style>{markdownStyles}</style>
                  <div
                    className="prose prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(report) }}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportModal;
