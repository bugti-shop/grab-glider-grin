import { useState } from 'react';
import { ArrowLeft, Mail, Copy, Check, MessageSquare, Clock, Shield, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePageMeta } from '@/hooks/usePageMeta';

const SUPPORT_EMAIL = 'julie@flowist.me';
const BLUE = '#2E67F8';

const topics = [
  { label: 'General question', value: 'General question' },
  { label: 'Billing & subscription', value: 'Billing & subscription' },
  { label: 'Bug report', value: 'Bug report' },
  { label: 'Feature request', value: 'Feature request' },
  { label: 'Partnerships', value: 'Partnerships' },
];

const Contact = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState(topics[0].value);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  usePageMeta({
    title: 'Contact Flowist — Support & Feedback',
    description: 'Get in touch with the Flowist team. Reach us at julie@flowist.me for support, billing questions, bug reports, feature requests, and partnerships.',
    path: '/contact',
  });

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`[${topic}] ${name ? `— ${name}` : 'Flowist contact'}`);
    const body = encodeURIComponent(
      `${message}\n\n— \nFrom: ${name || '(unspecified)'}\nReply-to: ${email || '(unspecified)'}\nTopic: ${topic}`
    );
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3 sm:px-6">
          <button
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold tracking-tight text-slate-900">Contact</span>
          <a
            href="/"
            className="ml-auto text-sm font-semibold"
            style={{ color: BLUE }}
          >
            flowist.me
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-100">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(1000px 500px at 15% -10%, rgba(46,103,248,0.10), transparent 60%), radial-gradient(800px 420px at 90% 10%, rgba(46,103,248,0.06), transparent 60%)',
          }}
        />
        <div className="relative mx-auto max-w-5xl px-5 py-16 sm:px-6 sm:py-24">
          <div
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-600 backdrop-blur"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: BLUE }} />
            We reply within one business day
          </div>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            Let's talk.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Whether it's a question, a bug, a bright idea, or a partnership —
            Julie and the Flowist team read every message personally.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
              style={{ background: BLUE }}
            >
              <Mail className="h-4 w-4" />
              {SUPPORT_EMAIL}
            </a>
            <button
              onClick={copyEmail}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy email'}
            </button>
          </div>
        </div>
      </section>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-5 py-14 sm:px-6 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-5">
          {/* Info column */}
          <aside className="lg:col-span-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              How we can help
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Pick the fastest channel for what you need. For anything
              account-specific, email is best so we can look up your details.
            </p>

            <ul className="mt-6 space-y-4">
              {[
                {
                  Icon: MessageSquare,
                  title: 'Product support',
                  desc: 'Questions about tasks, notes, habits, or sync.',
                },
                {
                  Icon: Shield,
                  title: 'Billing & privacy',
                  desc: 'Subscriptions, refunds, data deletion, GDPR.',
                },
                {
                  Icon: Clock,
                  title: 'Response time',
                  desc: 'Usually within 24 hours, Mon–Fri.',
                },
              ].map(({ Icon, title, desc }) => (
                <li key={title} className="flex gap-3">
                  <div
                    className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ background: 'rgba(46,103,248,0.10)', color: BLUE }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{title}</div>
                    <div className="text-sm text-slate-600">{desc}</div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Prefer email?
              </div>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="mt-2 block text-base font-semibold"
                style={{ color: BLUE }}
              >
                {SUPPORT_EMAIL}
              </a>
              <p className="mt-1 text-xs text-slate-500">
                GMJP LLC · Flowist Support
              </p>
            </div>
          </aside>

          {/* Form column */}
          <div className="lg:col-span-3">
            <form
              onSubmit={handleSubmit}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_20px_60px_-30px_rgba(15,23,42,0.15)] sm:p-8"
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="name" className="block text-sm font-semibold text-slate-800">
                    Your name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ada Lovelace"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-transparent focus:ring-2"
                    style={{ boxShadow: 'none' }}
                    onFocus={(e) => (e.currentTarget.style.boxShadow = `0 0 0 2px ${BLUE}`)}
                    onBlur={(e) => (e.currentTarget.style.boxShadow = 'none')}
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-slate-800">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition"
                    onFocus={(e) => (e.currentTarget.style.boxShadow = `0 0 0 2px ${BLUE}`)}
                    onBlur={(e) => (e.currentTarget.style.boxShadow = 'none')}
                  />
                </div>
              </div>

              <div className="mt-5">
                <label htmlFor="topic" className="block text-sm font-semibold text-slate-800">
                  What's this about?
                </label>
                <select
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition"
                  onFocus={(e) => (e.currentTarget.style.boxShadow = `0 0 0 2px ${BLUE}`)}
                  onBlur={(e) => (e.currentTarget.style.boxShadow = 'none')}
                >
                  {topics.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-5">
                <label htmlFor="message" className="block text-sm font-semibold text-slate-800">
                  Message
                </label>
                <textarea
                  id="message"
                  required
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us a bit about what you need. If it's a bug, please include the steps to reproduce."
                  className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition"
                  onFocus={(e) => (e.currentTarget.style.boxShadow = `0 0 0 2px ${BLUE}`)}
                  onBlur={(e) => (e.currentTarget.style.boxShadow = 'none')}
                />
              </div>

              <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Your message opens in your email app, addressed to{' '}
                  <span className="font-semibold text-slate-700">{SUPPORT_EMAIL}</span>.
                </p>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
                  style={{ background: BLUE }}
                >
                  <Send className="h-4 w-4" />
                  Send message
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-3 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:px-6">
          <div>© {new Date().getFullYear()} GMJP LLC · Flowist</div>
          <div className="flex items-center gap-5">
            <a href="/privacy-policy" className="hover:text-slate-900">Privacy</a>
            <a href="/terms-and-conditions" className="hover:text-slate-900">Terms</a>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-slate-900">{SUPPORT_EMAIL}</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Contact;
