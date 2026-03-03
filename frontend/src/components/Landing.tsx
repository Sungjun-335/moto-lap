
import React, { useMemo } from 'react';
import {
  ArrowRight,
  Sparkles,
  GitCompare,
  TrendingDown,
  Folders,
  Activity,
  FileUp,
  Map,
  HardDrive,
  Settings,
} from 'lucide-react';
import { useTranslation } from '../i18n/context';
import { LanguageToggle } from '../i18n/context';
import { useAuth } from '../auth/AuthContext';
import UserMenu from './UserMenu';

interface LandingProps {
  onStart: () => void;
  onSeeSessions: () => void;
  onTrackEditor: () => void;
  savedSessionCount?: number;
}

const Landing: React.FC<LandingProps> = ({ onStart, onSeeSessions, onTrackEditor, savedSessionCount = 0 }) => {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();

  const features = useMemo(() => [
    {
      title: t.landing.feat1Title,
      description: t.landing.feat1Desc,
      icon: Sparkles,
    },
    {
      title: t.landing.feat2Title,
      description: t.landing.feat2Desc,
      icon: Map,
    },
    {
      title: t.landing.feat3Title,
      description: t.landing.feat3Desc,
      icon: GitCompare,
    },
    {
      title: t.landing.feat4Title,
      description: t.landing.feat4Desc,
      icon: TrendingDown,
    },
  ], [t]);

  const steps = useMemo(() => [
    {
      step: '01',
      title: t.landing.step1Title,
      description: t.landing.step1Desc,
      icon: FileUp,
    },
    {
      step: '02',
      title: t.landing.step2Title,
      description: t.landing.step2Desc,
      icon: Folders,
    },
    {
      step: '03',
      title: t.landing.step3Title,
      description: t.landing.step3Desc,
      icon: Activity,
    },
  ], [t]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-black via-zinc-950 to-zinc-950 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10%] top-[-10%] h-[320px] w-[320px] rounded-full bg-emerald-500/25 blur-[160px]" />
        <div className="absolute right-[-5%] top-[20%] h-[280px] w-[280px] rounded-full bg-cyan-500/20 blur-[160px]" />
        <div className="absolute bottom-[-10%] left-[30%] h-[260px] w-[260px] rounded-full bg-amber-400/15 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.05),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.08),transparent_40%)]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 pt-10 pb-16 lg:pb-24">
        <header className="mb-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/40 bg-emerald-500/15 text-lg font-bold text-emerald-200">
              M
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-emerald-200">motolap</p>
              <p className="text-xs text-zinc-400">{t.landing.tagline}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <UserMenu />
            <LanguageToggle />
            {isAdmin && (
              <button
                onClick={onTrackEditor}
                className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 transition hover:border-amber-400/50 hover:bg-amber-500/20"
              >
                <Settings className="h-3.5 w-3.5" />
                {t.admin.trackManager}
              </button>
            )}
            {savedSessionCount > 0 && (
              <button
                onClick={onSeeSessions}
                className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200 transition hover:border-cyan-400/50 hover:bg-cyan-500/20"
              >
                <HardDrive className="h-3.5 w-3.5" />
                {t.landing.mySessions} ({savedSessionCount})
              </button>
            )}
            <button
              onClick={onStart}
              className="group inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:shadow-[0_10px_40px_-12px_rgba(16,185,129,0.6)]"
            >
              {t.landing.uploadCsv}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
          </div>
        </header>

        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.2em] text-emerald-200">
              <Sparkles className="h-4 w-4 text-amber-300" />
              {t.landing.trackDayDataAnalysis}
            </div>
            <div className="space-y-4">
              <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
                {t.landing.heroTitle1}<br />{t.landing.heroTitle2}
              </h1>
              <p className="text-lg text-zinc-300 md:text-xl">
                {t.landing.heroSubtitle}<br />
                <span className="text-sm text-emerald-200">{t.landing.heroSubtitleCompat}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={onStart}
                className="group inline-flex items-center gap-3 rounded-xl bg-gradient-to-r from-emerald-500 via-cyan-400 to-amber-300 px-6 py-3 text-sm font-semibold text-black shadow-[0_20px_60px_-25px_rgba(16,185,129,0.8)] transition hover:shadow-[0_20px_60px_-18px_rgba(59,130,246,0.8)]"
              >
                {t.landing.uploadCsv}
                <FileUp className="h-4 w-4 transition group-hover:translate-y-[-2px]" />
              </button>
              {savedSessionCount > 0 && (
                <button
                  onClick={onSeeSessions}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-3 text-sm text-cyan-200 transition hover:border-cyan-400/50 hover:bg-cyan-500/20"
                >
                  <HardDrive className="h-4 w-4" />
                  {t.landing.mySessions} ({savedSessionCount})
                </button>
              )}
            </div>
            <p className="text-sm text-zinc-400">
              {t.landing.noSignup}
            </p>

            <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <div className="flex items-center gap-3 text-sm text-emerald-200">
                <Sparkles className="h-4 w-4" />
                <span>{t.landing.syncLabel}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                  <p className="text-xs text-zinc-400">{t.landing.bestLap}</p>
                  <p className="mt-1 text-2xl font-semibold text-emerald-300">1:45.309</p>
                  <p className="text-xs text-emerald-200">{t.landing.vsPrevious}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                  <p className="text-xs text-zinc-400">{t.landing.throttleVsBrake}</p>
                  <p className="mt-2 text-sm text-zinc-200">Corner 3 · 67% → 18%</p>
                  <p className="text-xs text-cyan-300">{t.landing.coastingZoneHighlight}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                  <p className="text-xs text-zinc-400">{t.landing.gpsTrace}</p>
                  <p className="mt-2 text-sm text-zinc-200">{t.landing.lineCompare}</p>
                  <p className="text-xs text-amber-300">{t.landing.colorCodedDeltas}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute left-10 top-0 h-32 w-32 rounded-full bg-emerald-400/20 blur-[120px]" />
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_30px_80px_-50px_rgba(16,185,129,0.8)] backdrop-blur">
              {/* 10-second demo placeholder - replace with actual GIF/video */}
              <div className="aspect-video w-full bg-gradient-to-br from-black via-zinc-900 to-black">
                <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
                  <div className="rounded-full bg-emerald-500/20 p-4">
                    <Activity className="h-8 w-8 text-emerald-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-200">{t.landing.demoTitle}</p>
                    <p className="mt-1 text-xs text-zinc-400">{t.landing.demoSubtitle}</p>
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    {t.landing.demoReplace}
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-3 gap-3 text-sm text-zinc-200">
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-3 text-center">
                    <FileUp className="h-4 w-4 text-emerald-300" />
                    <div>
                      <p className="text-xs text-zinc-400">{t.landing.step1}</p>
                      <p className="text-xs font-semibold text-white">{t.landing.upload}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-3 text-center">
                    <Sparkles className="h-4 w-4 text-cyan-300" />
                    <div>
                      <p className="text-xs text-zinc-400">{t.landing.step2}</p>
                      <p className="text-xs font-semibold text-white">{t.landing.autoDetect}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-3 text-center">
                    <TrendingDown className="h-4 w-4 text-amber-300" />
                    <div>
                      <p className="text-xs text-zinc-400">{t.landing.step3}</p>
                      <p className="text-xs font-semibold text-white">{t.landing.analyze}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>



        {/* Features Grid */}
        <div className="mt-24">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-semibold text-white md:text-4xl">{t.landing.featuresTitle}</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(feature => (
              <div
                key={feature.title}
                className="rounded-xl border border-white/5 bg-white/5 p-5 transition hover:-translate-y-1 hover:border-emerald-400/40 hover:bg-white/10"
              >
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-200">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm text-zinc-300">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* How it Works Section - moved after features */}
        <div className="mt-24 mb-24">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-semibold text-white md:text-4xl">{t.landing.howItWorks}</h2>
            <p className="mt-4 text-zinc-400">{t.landing.howItWorksSubtitle}</p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((step) => (
              <div key={step.step} className="group relative">
                <div className="relative z-10 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur transition hover:border-emerald-500/30 hover:bg-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-4xl font-bold text-white/10 transition group-hover:text-white/20">{step.step}</span>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-200">
                      <step.icon className="h-5 w-5" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white">{step.title}</h3>
                    <p className="mt-2 text-sm text-zinc-400">{step.description}</p>
                  </div>
                  {/* Image Placeholder */}
                  <div className="mt-4 aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-black/40">
                    <div className="flex h-full w-full items-center justify-center text-center text-xs text-zinc-600">
                      {step.title} {t.landing.screenshot}<br />(Drop Image Here)
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Final CTA Section */}
        <div className="mb-24">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/10 via-cyan-500/10 to-amber-400/10 p-12 text-center backdrop-blur">
            <div className="absolute left-0 top-0 h-48 w-48 rounded-full bg-emerald-400/20 blur-[120px]" />
            <div className="absolute right-0 bottom-0 h-48 w-48 rounded-full bg-cyan-400/20 blur-[120px]" />
            <div className="relative z-10">
              <h2 className="text-3xl font-semibold text-white md:text-4xl">
                {t.landing.ctaTitle}
              </h2>
              <p className="mt-4 text-lg text-zinc-300">
                {t.landing.ctaSubtitle}
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <button
                  onClick={onStart}
                  className="group inline-flex items-center gap-3 rounded-xl bg-gradient-to-r from-emerald-500 via-cyan-400 to-amber-300 px-8 py-4 text-base font-semibold text-black shadow-[0_20px_60px_-25px_rgba(16,185,129,0.8)] transition hover:shadow-[0_20px_60px_-18px_rgba(59,130,246,0.8)]"
                >
                  {t.landing.uploadCsv}
                  <FileUp className="h-5 w-5 transition group-hover:translate-y-[-2px]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Landing;
