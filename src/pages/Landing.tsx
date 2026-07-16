import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLogo } from '@/components/AppLogo';
import { setSetting } from '@/utils/settingsStorage';
import todoDashboardImage from '@/assets/flowist-todo-dashboard.webp';
import calendarViewImage from '@/assets/flowist-calendar-view.webp';

const APP_STORE_URL = 'https://apps.apple.com/app/flowist';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=nota.npd.com';

export default function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    import('@/components/OnboardingFlow').catch(() => {});
    import('@/pages/todo/Today').catch(() => {});
  }, []);

  const handleGetStarted = async () => {
    const preload = import('@/components/OnboardingFlow').catch(() => {});
    await setSetting('onboarding_completed', false);
    try {
      sessionStorage.setItem('flowist_landing_acknowledged', 'true');
      localStorage.setItem('flowist_landing_acknowledged', 'true');
    } catch {}
    await preload;
    window.dispatchEvent(new Event('flowistLandingDismissed'));
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#faf8f3] text-[#0a0a0a]">
      {/* Nav */}
      <header className="sticky top-0 z-30 bg-[#faf8f3]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <div className="flex items-center gap-2">
            <AppLogo className="h-7 w-7" />
            <span className="text-lg font-semibold tracking-tight">Flowist</span>
          </div>
          <button
            onClick={handleGetStarted}
            className="rounded-full bg-[#0a0a0a] px-5 py-2 text-sm font-medium text-white transition hover:bg-black"
          >
            Try Free
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-5 py-16 md:grid-cols-2 md:gap-8 md:px-8 md:py-24 lg:py-32">
          {/* Left: copy */}
          <div className="order-2 md:order-1">
            <h1 className="text-[44px] font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
              Capture every idea,
              <br />
              plan every day
            </h1>
            <p className="mt-6 max-w-lg text-lg text-neutral-600 sm:text-xl">
              Rich notes, tasks, calendar and habits — synced across all your devices.
            </p>

            <ul className="mt-8 space-y-4">
              {['Beautiful note editor', 'Smart task priorities', 'Offline-first sync'].map((f) => (
                <li key={f} className="flex items-center gap-3 text-base font-medium sm:text-lg">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0a0a0a]">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  {f}
                </li>
              ))}
            </ul>

            {/* Store buttons */}
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 rounded-2xl bg-[#0a0a0a] px-5 py-3 text-white transition hover:bg-black"
              >
                <svg viewBox="0 0 384 512" className="h-7 w-7" fill="currentColor" aria-hidden="true">
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM255.6 105.4c30.4-36.1 27.7-69 26.8-80.4-27 1.6-58.1 18.4-75.9 39.1-19.6 22.3-31.1 49.9-28.6 79.8 29.2 2.3 55.9-12.8 77.7-38.5z" />
                </svg>
                <span className="text-left leading-tight">
                  <span className="block text-[10px] font-normal opacity-80">Download on the</span>
                  <span className="block text-lg font-semibold">App Store</span>
                </span>
              </a>
              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 rounded-2xl bg-[#0a0a0a] px-5 py-3 text-white transition hover:bg-black"
              >
                <svg viewBox="0 0 512 512" className="h-7 w-7" aria-hidden="true">
                  <path fill="#00d4ff" d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1z" />
                  <path fill="#ffce00" d="M104.6 499l220.7-220.7 60.1 60.1L104.6 499z" />
                  <path fill="#00f076" d="M104.6 13v486l220.7-220.7L104.6 13z" />
                  <path fill="#ff3a44" d="M385.4 174.2l-60.1 60.1 60.1 60.1L488 256c0-14.4-11.7-25-27.8-33.6l-74.8-48.2z" />
                </svg>
                <span className="text-left leading-tight">
                  <span className="block text-[10px] font-normal opacity-80">GET IT ON</span>
                  <span className="block text-lg font-semibold">Google Play</span>
                </span>
              </a>
            </div>

            <button
              onClick={handleGetStarted}
              className="mt-6 text-sm font-medium text-neutral-600 underline underline-offset-4 hover:text-black"
            >
              Or try the web app →
            </button>
          </div>

          {/* Right: phones */}
          <div className="relative order-1 md:order-2">
            <div className="relative mx-auto flex h-[520px] max-w-md items-center justify-center sm:h-[600px]">
              {/* Back phone */}
              <div className="absolute left-[8%] top-6 w-[52%] rotate-[-6deg] rounded-[36px] border-[10px] border-neutral-900 bg-neutral-900 shadow-2xl">
                <img
                  src={todoDashboardImage}
                  alt="Flowist note editor"
                  className="block w-full rounded-[26px]"
                  loading="eager"
                />
              </div>
              {/* Front phone */}
              <div className="absolute right-[6%] top-16 w-[52%] rotate-[4deg] rounded-[36px] border-[10px] border-neutral-900 bg-neutral-900 shadow-2xl">
                <img
                  src={calendarViewImage}
                  alt="Flowist calendar"
                  className="block w-full rounded-[26px]"
                  loading="eager"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
