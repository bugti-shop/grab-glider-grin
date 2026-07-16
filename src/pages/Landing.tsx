import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Check, Calendar, StickyNote, Sparkles, Repeat, RefreshCw, ArrowRight, ChevronDown, X, Pencil, AlignLeft, Code2, Brain, LayoutGrid, Flag, Layers, BellRing, Filter as FilterIcon, BarChart3, Lock, Moon, Clock } from 'lucide-react';
import { AppLogo } from '@/components/AppLogo';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { setSetting } from '@/utils/settingsStorage';
import socialX from '@/assets/social-x.png';
import socialReddit from '@/assets/social-reddit.png';
import socialYoutube from '@/assets/social-youtube.png';
import socialInstagram from '@/assets/social-instagram.png';
import todoDashboardImage from '@/assets/flowist-todo-dashboard.webp';
import sketchEditorImage from '@/assets/flowist-sketch-editor.webp';
import linedNoteImage from '@/assets/flowist-lined-note.webp';
import regularNoteImage from '@/assets/flowist-regular-note.webp';
import stickyNoteImage from '@/assets/flowist-sticky-note.webp';
import codeEditorImage from '@/assets/flowist-code-editor.webp';
import taskNlpImage from '@/assets/flowist-task-nlp.webp';
import calendarViewImage from '@/assets/flowist-calendar-view.webp';
import flatLayoutImage from '@/assets/flowist-flat-layout.webp';
import landingTodoImg from '@/assets/landing-todo.jpg';
import landingTodoImg2 from '@/assets/landing-todo-2.jpg';
import landingCalendarImg from '@/assets/landing-calendar.jpg';
import landingPomodoroImg from '@/assets/landing-pomodoro.jpg';
import landingHabitsImg from '@/assets/landing-habits.jpg';
import landingHabitsImg2 from '@/assets/landing-habits-2.jpg';
import landingCountdownImg from '@/assets/landing-countdown.jpg';
import landingSyncDevicesImg from '@/assets/landing-sync-devices.webp';
import landingHeroAsset from '@/assets/landing/landing-hero.jpg.asset.json';

const BLUE = '#3c78f0';
const BLUE_DARK = '#2b5dbf';

export default function Landing() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>('Made For');
  const [activeSection, setActiveSection] = useState<string>('');
  const [activeFeature, setActiveFeature] = useState<string>('Sketch Editor');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Aggressively preload onboarding + today chunks immediately so tapping
  // "Get Flowist Free" opens the language selection instantly (no 7s white page).
  useEffect(() => {
    import('@/components/OnboardingFlow').catch(() => {});
    import('@/pages/todo/Today').catch(() => {});
  }, []);

  // Track which section is currently in view (for footer link highlight)
  useEffect(() => {
    const ids = ['about', 'features', 'whats-new', 'faq'];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const smoothScrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMenuOpen(false);
  };

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

  const menuGroups: { label: string; items: { label: string; href: string }[] }[] = [
    {
      label: 'Made For',
      items: [
        { label: 'Task Management', href: '#features' },
        { label: 'Note Taking', href: '#features' },
        { label: 'Sketching', href: '#features' },
        { label: 'Habit Forming', href: '#features' },
        { label: 'Daily Planning', href: '#features' },
      ],
    },
    {
      label: 'Resources',
      items: [
        { label: 'FAQ', href: '#faq' },
        { label: 'Privacy', href: '/privacy-policy' },
        { label: 'Terms', href: '/terms-and-conditions' },
      ],
    },
  ];

  const productCards = [
    {
      label: 'To-Do List',
      title: 'Organize everything in your life',
      desc: "Whether it's work projects, personal tasks, or study plans, Flowist helps you organize and confidently tackle everything in your life.",
      icon: Check,
      gradient: 'from-[#eaf1ff] to-[#f5f9ff]',
      image: todoDashboardImage,
      imageAlt: 'Flowist to-do dashboard with task folders and priority tasks',
    },
    {
      label: 'Sketch Editor',
      title: 'Sketch your ideas freely',
      desc: 'A powerful infinite canvas with shapes, layers and templates — capture thoughts visually, the way your mind actually works.',
      icon: Sparkles,
      gradient: 'from-[#fff4ea] to-[#fffaf3]',
      image: sketchEditorImage,
      imageAlt: 'Flowist sketch editor with ruler, protractor and geometric shapes',
    },
    {
      label: 'Regular Notes',
      title: 'Capture thoughts in a clean editor',
      desc: 'A distraction-free notes editor with rich formatting, tags and folders — perfect for journaling, ideas and quick captures.',
      icon: StickyNote,
      gradient: 'from-[#eafff1] to-[#f4fff8]',
      image: regularNoteImage,
      imageAlt: 'Flowist regular note editor with formatted text',
    },
    {
      label: 'Lined Notes',
      title: 'Write neatly on ruled paper',
      desc: 'Classic ruled paper with a modern feel — handwrite or type with perfect alignment for a calm, focused writing experience.',
      icon: Calendar,
      gradient: 'from-[#fdeaff] to-[#fbf3ff]',
      image: linedNoteImage,
      imageAlt: 'Flowist lined note editor with ruled paper style',
    },
  ];

  const features = [
    { label: 'Sketch Editor', icon: Pencil, gradient: 'from-[#fff4ea] to-[#fffaf3]', image: sketchEditorImage, imageAlt: 'Flowist sketch editor with drawing tools and geometry helpers' },
    { label: 'Regular Note', icon: StickyNote, gradient: 'from-[#eafff1] to-[#f4fff8]', image: regularNoteImage, imageAlt: 'Flowist regular note editor' },
    { label: 'Lined Note', icon: AlignLeft, gradient: 'from-[#fdeaff] to-[#fbf3ff]', image: linedNoteImage, imageAlt: 'Flowist lined note editor' },
    { label: 'Sticky Note', icon: StickyNote, gradient: 'from-[#ffeaf5] to-[#fff5fb]', image: stickyNoteImage, imageAlt: 'Flowist sticky note editor with color options' },
    { label: 'Code Editor', icon: Code2, gradient: 'from-[#eaf1ff] to-[#f5f9ff]', image: codeEditorImage, imageAlt: 'Flowist code note editor with HTML syntax highlighting' },
    { label: 'NLP', icon: Brain, gradient: 'from-[#fff0f0] to-[#fff7f7]', image: taskNlpImage, imageAlt: 'Flowist natural language task input detecting date and repeat details' },
    { label: 'Task Dashboard', icon: Check, gradient: 'from-[#eaf1ff] to-[#f5f9ff]', image: todoDashboardImage, imageAlt: 'Flowist task dashboard with priority tasks and bottom navigation' },
    { label: 'Calendar', icon: Calendar, gradient: 'from-[#eaf6ff] to-[#f4fbff]', image: calendarViewImage, imageAlt: 'Flowist monthly calendar view with highlighted task dates' },
    { label: 'Priority', icon: Flag, gradient: 'from-[#ffeaea] to-[#fff5f5]', image: todoDashboardImage, imageAlt: 'Flowist high priority tasks section' },
    { label: 'Flat Layout', icon: Layers, gradient: 'from-[#eafff7] to-[#f4fffb]', image: flatLayoutImage, imageAlt: 'Flowist clean flat task layout' },
  ];

  const suiteFeatures = [
    { title: 'Reminder', desc: 'Notifications keep ringing until you complete the task — nothing slips by.', icon: BellRing },
    { title: 'Repeat', desc: 'Flexible recurring rules — daily, weekly, monthly or fully custom schedules.', icon: RefreshCw },
    { title: 'NLP', desc: 'Type naturally and Flowist auto-detects dates, times and reminder cues.', icon: Brain },
    { title: 'Filter', desc: 'Build smart filters like “high-priority this week” to focus on what matters.', icon: FilterIcon },
    { title: 'Progress', desc: 'Track focus time, streaks and habit logs to see your real momentum daily.', icon: BarChart3 },
    { title: 'Lock', desc: 'Protect private notes and tasks behind a passcode or biometric lock.', icon: Lock },
    { title: 'Dark Mode', desc: 'A calm, eye-friendly dark theme that follows your system preference.', icon: Moon },
    { title: 'Time Track', desc: 'Log time on tasks and habits to see exactly where your day really goes.', icon: Clock },
  ];

  const faqs = [
    { q: 'Is Flowist free?', a: 'Yes — start free. Upgrade anytime for unlimited everything from $1.49/week.' },
    { q: 'Does it work offline?', a: 'Fully. Your tasks and notes are saved on your device and sync when you’re back online.' },
    { q: 'Can I switch devices?', a: 'Yes. Sign in and your tasks, notes and habits follow you across web, Android and iOS.' },
    { q: 'Is my data private?', a: 'Always. You own your data. Export or back it up to Google Drive anytime.' },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased selection:bg-[#3c78f0]/20">
      {/* Header */}
      <header
        className={`sticky top-0 z-40 w-full border-b border-slate-200 transition-all ${
          scrolled ? 'bg-white/90 backdrop-blur-xl' : 'bg-white'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 sm:px-6 sm:py-2.5">
          <a href="#top" className="flex items-center gap-2">
            <AppLogo size="md" />
            <span className="text-xl font-extrabold tracking-tight" style={{ color: BLUE }}>Flowist</span>
          </a>

          <div className="flex items-center gap-2">


            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button
                  aria-label="Open menu"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 transition-colors active:bg-slate-100"
                >
                  <Menu className="h-6 w-6" strokeWidth={2.25} />
                </button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="flex w-full max-w-full flex-col border-l border-slate-200 bg-white p-0 sm:max-w-sm [&>button]:hidden"
              >
                {/* Top bar inside menu (Todoist-style) */}
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <AppLogo size="md" />
                    <span className="text-lg font-extrabold" style={{ color: BLUE }}>Flowist</span>
                    <button
                      onClick={() => { setMenuOpen(false); handleGetStarted(); }}
                      className="ml-2 rounded-lg px-4 py-2 text-sm font-bold text-white"
                      style={{ backgroundColor: BLUE }}
                    >
                      Start for free
                    </button>
                  </div>
                  <button
                    onClick={() => setMenuOpen(false)}
                    aria-label="Close menu"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 active:bg-slate-100"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Collapsible groups */}
                <div className="flex-1 overflow-y-auto px-2 py-4">
                  {menuGroups.map((group) => {
                    const isOpen = openGroup === group.label;
                    return (
                      <div key={group.label} className="mb-2">
                        <button
                          onClick={() => setOpenGroup(isOpen ? null : group.label)}
                          className={`flex w-full items-center justify-between rounded-xl px-5 py-4 text-left text-lg font-semibold text-slate-900 transition-colors ${
                            isOpen ? 'bg-slate-100' : 'hover:bg-slate-50'
                          }`}
                        >
                          <span>{group.label}</span>
                          <ChevronDown
                            className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          />
                        </button>
                        {isOpen && (
                          <div className="mt-1 flex flex-col">
                            {group.items.map((item) => (
                              <a
                                key={item.label}
                                href={item.href}
                                onClick={() => setMenuOpen(false)}
                                className="px-9 py-3 text-base text-slate-700 transition-colors active:bg-slate-50"
                              >
                                {item.label}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <a
                    href="#faq"
                    onClick={() => setMenuOpen(false)}
                    className="mt-1 block rounded-xl px-5 py-4 text-lg font-semibold text-slate-900 hover:bg-slate-50"
                  >
                    Pricing
                  </a>
                </div>

                {/* Bottom buttons */}
                <div className="border-t border-slate-200 px-4 py-4">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => { setMenuOpen(false); handleGetStarted(); }}
                      className="rounded-lg bg-slate-100 py-3 text-base font-bold text-slate-900 active:bg-slate-200"
                    >
                      Log in
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); handleGetStarted(); }}
                      className="rounded-lg py-3 text-base font-bold text-white"
                      style={{ backgroundColor: BLUE }}
                    >
                      Start for free
                    </button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section id="about" className="relative overflow-hidden scroll-mt-20 bg-[#f7f4ec]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-gradient-to-b from-[#f2ede1] via-[#f7f4ec] to-[#f7f4ec]" />
          <div className="relative mx-auto grid max-w-6xl grid-cols-2 items-center gap-3 px-2 pt-5 pb-8 sm:gap-8 sm:px-6 sm:pt-14 sm:pb-16 md:gap-14 md:pt-16 md:pb-20">
            {/* Left: built mockups + sticky note */}
            <div className="relative">
              <div className="pointer-events-none absolute -inset-4 sm:-inset-8 rounded-[48px] bg-black/5 blur-3xl" />
              <div className="relative flex items-end justify-center gap-[6%]">
                {/* Phone 1 — Notes editor */}
                <div className="relative w-[52%] -rotate-[6deg] translate-y-2 rounded-[18px] sm:rounded-[28px] md:rounded-[36px] bg-black p-[3px] sm:p-[5px] md:p-[7px] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.45)]">
                  <div className="relative aspect-[9/19.5] overflow-hidden rounded-[15px] sm:rounded-[24px] md:rounded-[30px] bg-white">
                    <div className="absolute left-1/2 top-1 sm:top-2 z-10 h-2 sm:h-3 md:h-4 w-[38%] -translate-x-1/2 rounded-full bg-black" />
                    <div className="flex h-full flex-col px-1.5 pt-3 sm:px-2.5 sm:pt-5 md:px-3 md:pt-7 text-slate-900">
                      <div className="mb-1 flex items-center justify-between text-[5px] sm:text-[8px] md:text-[10px] font-semibold">
                        <span>9:41</span>
                        <span>≡ ✦ Flowist ⇪</span>
                      </div>
                      <span className="mb-0.5 sm:mb-1 self-start rounded-full bg-violet-100 px-1 py-[1px] text-[4px] sm:text-[7px] md:text-[9px] font-medium text-violet-700">Ideas</span>
                      <h3 className="text-[7px] sm:text-[11px] md:text-[15px] font-bold leading-tight">Product Ideas</h3>
                      <p className="mt-0.5 text-[4px] sm:text-[7px] md:text-[9px] text-slate-600">💡 Ideas that solve real problems.</p>
                      <p className="mt-1 text-[5px] sm:text-[8px] md:text-[10px] font-semibold">1. Focus Mode</p>
                      <p className="text-[4px] sm:text-[6px] md:text-[8px] text-slate-600 leading-snug">A minimal Pomodoro timer with website blocking and analytics.</p>
                      <p className="mt-0.5 rounded-sm bg-yellow-100 px-0.5 text-[4px] sm:text-[6px] md:text-[8px] text-slate-800 leading-snug">Helps users stay deep in work.</p>
                      <p className="mt-1 text-[5px] sm:text-[8px] md:text-[10px] font-semibold">2. AI Meeting Notes</p>
                      <p className="text-[4px] sm:text-[6px] md:text-[8px] text-slate-600 leading-snug">Transcribe, summarize and extract action items.</p>
                      <p className="mt-0.5 rounded-sm bg-violet-100 px-0.5 text-[4px] sm:text-[6px] md:text-[8px] text-slate-800 leading-snug">Saves time, keeps everyone aligned.</p>
                    </div>
                  </div>
                </div>
                {/* Phone 2 — Calendar */}
                <div className="relative w-[52%] rotate-[5deg] rounded-[18px] sm:rounded-[28px] md:rounded-[36px] bg-black p-[3px] sm:p-[5px] md:p-[7px] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.45)]">
                  <div className="relative aspect-[9/19.5] overflow-hidden rounded-[15px] sm:rounded-[24px] md:rounded-[30px] bg-white">
                    <div className="absolute left-1/2 top-1 sm:top-2 z-10 h-2 sm:h-3 md:h-4 w-[38%] -translate-x-1/2 rounded-full bg-black" />
                    <div className="flex h-full flex-col px-1.5 pt-3 sm:px-2.5 sm:pt-5 md:px-3 md:pt-7 text-slate-900">
                      <div className="mb-1 flex items-center justify-between text-[5px] sm:text-[8px] md:text-[10px] font-semibold">
                        <span>9:41</span>
                        <span>≡ Flowist ⌕ +</span>
                      </div>
                      <p className="text-[6px] sm:text-[10px] md:text-[13px] font-bold">May 2025 ⌄</p>
                      <div className="mt-1 grid grid-cols-7 text-center text-[3px] sm:text-[5px] md:text-[7px] font-semibold text-slate-500">
                        {['M','T','W','T','F','S','S'].map((d,i)=><span key={i}>{d}</span>)}
                      </div>
                      <div className="mt-0.5 grid grid-cols-7 gap-y-0.5 text-center text-[4px] sm:text-[6px] md:text-[8px] font-medium">
                        {Array.from({length:35}).map((_,i)=>{
                          const day=i-2; const isSel=day===15;
                          return <span key={i} className={`mx-auto flex h-2 w-2 sm:h-3 sm:w-3 md:h-4 md:w-4 items-center justify-center rounded-full ${isSel?'bg-violet-600 text-white':''}`}>{day>0&&day<=31?day:''}</span>;
                        })}
                      </div>
                      <p className="mt-1.5 text-[3px] sm:text-[5px] md:text-[7px] font-bold text-slate-500 tracking-wider">THU, MAY 15</p>
                      <div className="mt-0.5 space-y-0.5 sm:space-y-1">
                        {[['bg-violet-500','Design review'],['bg-orange-400','Write marketing plan'],['bg-emerald-500','Product demo'],['bg-pink-400','Read 20 pages']].map(([c,t])=>(
                          <div key={t} className="flex items-center gap-1">
                            <span className={`h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full ${c}`} />
                            <span className="text-[4px] sm:text-[6px] md:text-[8px] font-semibold">{t}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Sticky note */}
              <div className="absolute -bottom-2 -left-1 sm:-bottom-4 sm:-left-3 md:-bottom-6 md:-left-6 w-[35%] -rotate-[8deg] rounded-[3px] bg-[#fff3b0] p-1.5 sm:p-2.5 md:p-3.5 shadow-[0_10px_25px_-10px_rgba(0,0,0,0.4)]" style={{fontFamily:'"Caveat","Comic Sans MS",cursive'}}>
                <p className="text-[6px] sm:text-[10px] md:text-[13px] font-bold text-slate-800 border-b border-slate-400/40 pb-0.5 mb-1">Project Tasks</p>
                <ul className="space-y-[2px] sm:space-y-1 text-[5px] sm:text-[9px] md:text-[12px] text-slate-800">
                  {[['Research users',true],['Define MVP',true],['Create wireframes',false],['User testing',false],['Launch 🚀',false]].map(([t,done])=>(
                    <li key={t as string} className="flex items-center gap-1">
                      <span className={`inline-block h-1.5 w-1.5 sm:h-2 sm:w-2 md:h-2.5 md:w-2.5 border border-slate-600 rounded-[1px] ${done?'bg-slate-700':''}`} />
                      <span>{t as string}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Right: copy */}
            <div className="text-left">
              <h1 className="mb-2 text-[16px] font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:mb-4 sm:text-[32px] md:text-[52px]">
                <span className="block">Capture every idea,</span>
                <span className="block">plan every day</span>
              </h1>
              <p className="mb-3 max-w-xl text-[10px] leading-snug text-slate-600 sm:mb-6 sm:text-base md:text-lg">
                Rich notes, tasks, calendar and habits — synced across all your devices.
              </p>

              <ul className="mb-3 flex flex-col gap-1.5 sm:mb-6 sm:gap-3">
                {['Beautiful note editor','Smart task priorities','Offline-first sync'].map((item) => (
                  <li key={item} className="flex items-center gap-1.5 sm:gap-3">
                    <span className="inline-flex h-3.5 w-3.5 sm:h-6 sm:w-6 md:h-7 md:w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
                      <Check className="h-2 w-2 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4" strokeWidth={3} />
                    </span>
                    <span className="text-[10px] sm:text-[15px] md:text-[17px] font-semibold leading-snug text-slate-900">{item}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-3">
                <a
                  href="https://apps.apple.com/us/app/flowist-ai-note-taker/id6772996510"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 sm:h-[54px] items-center justify-center gap-1.5 sm:gap-2 rounded-md sm:rounded-xl bg-black px-2 sm:px-3 text-white transition-transform active:translate-y-0.5"
                  aria-label="Download Flowist on the App Store"
                >
                  <svg viewBox="0 0 384 512" className="h-3.5 w-3.5 sm:h-7 sm:w-7 fill-current shrink-0" aria-hidden="true">
                    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM256.5 105.7c30.1-35.7 27.4-68.2 26.5-79.9-26.6 1.5-57.4 18.1-74.9 38.5-19.3 21.9-30.6 49-28.2 78.8 28.7 2.2 54.9-12.5 76.6-37.4z"/>
                  </svg>
                  <div className="flex flex-col items-start leading-tight">
                    <span className="text-[6px] sm:text-[10px] font-medium opacity-90">Download on the</span>
                    <span className="text-[10px] sm:text-[17px] font-semibold tracking-tight">App Store</span>
                  </div>
                </a>
                <a
                  href="https://play.google.com/store/apps/details?id=nota.npd.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 sm:h-[54px] items-center justify-center gap-1.5 sm:gap-2 rounded-md sm:rounded-xl bg-black px-2 sm:px-3 text-white transition-transform active:translate-y-0.5"
                  aria-label="Get it on Google Play"
                >
                  <svg viewBox="0 0 512 512" className="h-3.5 w-3.5 sm:h-7 sm:w-7 shrink-0" aria-hidden="true">
                    <path fill="#00d7fe" d="M99.6 14.4C77.7 21.5 64 41.6 64 67.7v376.6c0 26.1 13.7 46.2 35.6 53.3l217.4-251.8L99.6 14.4z"/>
                    <path fill="#ffce00" d="M396.7 314.2l-79.7-58.4 70.9-82.1 105.4 60.7c19.7 11.4 19.7 39.8 0 51.2l-96.6 28.6z"/>
                    <path fill="#ff3a44" d="M396.7 314.2l-79.7-58.4-217.4 242.6c8.7 2.8 18.8 1.9 28.6-3.7l268.5-180.5z"/>
                    <path fill="#48ff48" d="M99.6 14.4c-9.8-5.6-19.9-6.5-28.6-3.7l245.9 244.7 79.7-82.1L99.6 14.4z"/>
                  </svg>
                  <div className="flex flex-col items-start leading-tight">
                    <span className="text-[6px] sm:text-[10px] font-medium opacity-90">GET IT ON</span>
                    <span className="text-[10px] sm:text-[17px] font-semibold tracking-tight">Google Play</span>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Trust bar removed per request */}

        {/* Feature cards — TickTick-style: label, big title, description, image */}
        <section id="features" className="relative overflow-hidden scroll-mt-20 bg-gradient-to-b from-slate-100 via-[#eef2fb] to-slate-100 pt-6 pb-0 sm:pt-10 sm:pb-0">
          {/* Soft ambient accents */}
          <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[#3c78f0]/15 blur-[120px]" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-[300px] w-[300px] rounded-full bg-[#8ab4ff]/15 blur-[100px]" />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.5]"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(60,120,240,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(60,120,240,0.08) 1px, transparent 1px)',
              backgroundSize: '56px 56px',
              maskImage:
                'radial-gradient(ellipse at center, rgba(0,0,0,0.85) 0%, transparent 75%)',
            }}
          />

          <div className="relative mx-auto max-w-xl px-4 sm:px-6">
            <div className="flex flex-col gap-4 sm:gap-5">
              {[
                {
                  label: 'To-Do List',
                  title: 'Organize everything in your life',
                  desc: "Whether it's work projects, personal tasks, or study plans, Flowist helps you organize and confidently tackle everything in your life.",
                  img: landingTodoImg,
                  alt: 'To-do list app screen',
                },
                {
                  label: 'Calendar Views',
                  title: 'Easily plan your schedule',
                  desc: 'Different calendar views like yearly, monthly, weekly, daily, and agenda help you plan your time more efficiently.',
                  img: landingCalendarImg,
                  alt: 'Calendar with colorful event blocks',
                },
                {
                  label: 'Pomodoro',
                  title: 'Track time and stay focused',
                  desc: 'Adopt the popular "Pomodoro Technique" — break tasks into 25-minute intervals to stay focused and achieve a productive flow.',
                  img: landingPomodoroImg,
                  alt: 'Tomato pomodoro timer illustration',
                },
                {
                  label: 'Habit Tracker',
                  title: 'Develop and maintain good habits',
                  desc: 'A rich habit library, flexible tracking options, and insightful statistics help you build good habits effortlessly and lead a fulfilling life.',
                  img: landingHabitsImg2,
                  alt: 'Habit streak chart',
                },
                {
                  label: 'Countdown',
                  title: 'Capture every important moment',
                  desc: 'Easily record important dates like birthdays, anniversaries, exams, and project deadlines with Flowist, so you never miss the moments that matter.',
                  img: landingCountdownImg,
                  alt: 'Countdown cards for memorable dates',
                },
              ].map((c) => (
                <article
                  key={c.label}
                  className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_-15px_rgba(15,23,42,0.18)] sm:p-5"
                >
                  <p className="text-[12px] font-semibold sm:text-[13px]" style={{ color: BLUE }}>
                    {c.label}
                  </p>
                  <h3 className="mt-1.5 text-[17px] font-extrabold leading-[1.2] tracking-tight text-slate-900 sm:text-[20px]">
                    {c.title}
                  </h3>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600 sm:text-[13.5px]">
                    {c.desc}
                  </p>
                  <div className="mt-4 aspect-[4/3] overflow-hidden rounded-lg bg-slate-50">
                    <img
                      src={c.img}
                      alt={c.alt}
                      loading="lazy"
                      width={1024}
                      height={768}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>



        {/* Comprehensive suite of features (TickTick-style 8-card grid) */}
        <section className="bg-gradient-to-b from-slate-100 to-white pt-8 pb-12 sm:pt-16 sm:pb-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="mb-10 text-center sm:mb-14">
              <h2 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[40px]" style={{ color: BLUE }}>
                A comprehensive suite of features
              </h2>
              <p className="mt-2 text-[24px] font-extrabold tracking-tight text-slate-900 sm:text-[32px]">
                Meet your unique needs
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-5">
              {suiteFeatures.map(({ title, desc, icon: Icon }) => (
                <div
                  key={title}
                  className="flex h-full flex-col rounded-[20px] bg-white p-5 shadow-[0_2px_8px_-4px_rgba(15,23,42,0.08)] sm:p-6"
                >
                  <Icon className="mb-3 h-5 w-5 text-slate-900 sm:h-6 sm:w-6" strokeWidth={1.75} />
                  <h3 className="mb-2 truncate whitespace-nowrap text-[15px] font-extrabold tracking-tight text-slate-900 sm:text-[17px]">
                    {title}
                  </h3>
                  <p className="line-clamp-4 text-[13px] leading-relaxed text-slate-600 sm:text-[14px]">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>




        {/* FAQ */}
        <section id="faq" className="bg-slate-50 py-20 sm:py-28">
          <div className="mx-auto max-w-3xl px-5 sm:px-6">
            <div className="mb-10 text-center">
              <p className="mb-3 text-sm font-bold uppercase tracking-wider" style={{ color: BLUE }}>FAQ</p>
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                Quick answers
              </h2>
            </div>
            <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {faqs.map((f) => (
                <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-4">
                    <span className="text-base font-semibold text-slate-900">{f.q}</span>
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lg font-bold transition-transform group-open:rotate-45"
                      style={{ backgroundColor: `${BLUE}15`, color: BLUE }}
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
        {/* Sync across all platforms */}
        <section className="relative overflow-hidden" style={{ backgroundColor: BLUE }}>
          <div className="pointer-events-none absolute -top-24 -left-24 h-[420px] w-[420px] rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-24 h-[420px] w-[420px] rounded-full bg-white/10 blur-3xl" />
          <div className="relative mx-auto max-w-6xl px-4 pt-6 pb-4 text-center sm:px-6 sm:pt-10 sm:pb-8">
            <h2 className="whitespace-nowrap text-[22px] font-extrabold tracking-tight text-white sm:text-[40px]">
              Sync across all platforms
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-relaxed text-white/85 sm:text-base">
              Whether it's your phone, computer, or tablet, Flowist offers real-time sync and a seamless experience.
            </p>
            <div className="mt-5 flex justify-center">
              <a
                href="https://apps.apple.com/us/app/flowist-ai-note-taker/id6772996510"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/70 px-10 text-base font-semibold text-white transition-all hover:bg-white hover:text-[#3c78f0]"
              >
                Download
              </a>
            </div>
            <div className="mt-4 sm:mt-6 flex justify-center overflow-hidden">
              <img
                src={landingSyncDevicesImg}
                alt="Flowist running on laptop, tablet and phones"
                loading="lazy"
                width={1536}
                height={1024}
                className="block h-auto w-[130%] sm:w-full max-w-none object-contain"
              />
            </div>
          </div>
        </section>
      </main>


      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6 sm:py-16">
          {/* Top: logo + social icons */}
          <div className="mb-6 flex flex-nowrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AppLogo size="sm" />
              <span className="text-base font-extrabold" style={{ color: BLUE }}>Flowist</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <a href="https://x.com" target="_blank" rel="noopener noreferrer" aria-label="Flowist on X (Twitter)" className="inline-block transition-transform hover:scale-105">
                <img src={socialX} alt="X social icon" className="h-9 w-9 object-contain" loading="lazy" />
              </a>
              <a href="https://reddit.com" target="_blank" rel="noopener noreferrer" aria-label="Flowist on Reddit" className="inline-block transition-transform hover:scale-105">
                <img src={socialReddit} alt="Reddit social icon" className="h-9 w-9 object-contain" loading="lazy" />
              </a>
              <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="Flowist on YouTube" className="inline-block transition-transform hover:scale-105">
                <img src={socialYoutube} alt="YouTube social icon" className="h-9 w-9 object-contain" loading="lazy" />
              </a>
              <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Flowist on Instagram" className="inline-block transition-transform hover:scale-105">
                <img src={socialInstagram} alt="Instagram social icon" className="h-9 w-9 object-contain" loading="lazy" />
              </a>
            </div>
          </div>
          <p className="mb-10 text-sm text-slate-500">© {new Date().getFullYear()} GMJP LLC.</p>

          {/* Link grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
            <div>
              <h4 className="mb-4 text-base font-bold text-slate-900">Company</h4>
              <ul className="space-y-3 text-sm text-slate-600">
                <li><a href="/privacy-policy" className="hover:text-slate-900">Privacy</a></li>
                <li><a href="/terms-and-conditions" className="hover:text-slate-900">Terms</a></li>
                <li>
                  <a
                    href="#about"
                    onClick={smoothScrollTo('about')}
                    className="hover:text-slate-900"
                  >
                    About
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-base font-bold text-slate-900">Download</h4>
              <ul className="space-y-3 text-sm text-slate-600">
                <li><a href="https://apps.apple.com/us/app/flowist-ai-note-taker/id6772996510" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900">iOS</a></li>
                <li><a href="https://onelink.to/9xy8rz" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900">Android</a></li>
                <li><button onClick={handleGetStarted} className="hover:text-slate-900">Web App</button></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-base font-bold text-slate-900">Resources</h4>
              <ul className="space-y-3 text-sm text-slate-600">
                <li>
                  <a
                    href="#faq"
                    onClick={smoothScrollTo('faq')}
                    className="hover:text-slate-900"
                  >
                    FAQ
                  </a>
                </li>
                <li>
                  <a
                    href="#features"
                    onClick={smoothScrollTo('features')}
                    className="hover:text-slate-900"
                  >
                    Features
                  </a>
                </li>
                <li>
                  <a
                    href="#about"
                    onClick={smoothScrollTo('about')}
                    className="hover:text-slate-900"
                  >
                    About
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-base font-bold text-slate-900">Flowist for</h4>
              <ul className="space-y-3 text-sm text-slate-600">
                <li><span>Students</span></li>
                <li><span>Professionals</span></li>
                <li><span>Creators</span></li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
