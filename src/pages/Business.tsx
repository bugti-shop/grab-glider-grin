import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Check, GraduationCap, Briefcase, Building2, ShieldCheck, Users, Sparkles } from 'lucide-react';
import { usePageMeta } from '@/hooks/usePageMeta';

const leadSchema = z.object({
  company_name: z.string().trim().min(1, 'Required').max(200),
  contact_name: z.string().trim().min(1, 'Required').max(200),
  work_email: z.string().trim().email('Enter a valid email').max(320),
  role: z.string().trim().max(120).optional().or(z.literal('')),
  audience: z.enum(['school', 'team', 'agency', 'other']),
  team_size: z.coerce.number().int().min(1).max(100000),
  use_case: z.string().trim().max(1000).optional().or(z.literal('')),
  message: z.string().trim().max(4000).optional().or(z.literal('')),
});

type LeadInput = z.infer<typeof leadSchema>;

const Benefit = ({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) => (
  <div className="rounded-2xl border bg-card p-5">
    <div className="h-10 w-10 grid place-items-center rounded-xl bg-primary/10 text-primary mb-3">{icon}</div>
    <h3 className="font-semibold text-base mb-1">{title}</h3>
    <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
  </div>
);

const Tier = ({ name, audience, blurb, features }: {
  name: string; audience: string; blurb: string; features: string[];
}) => (
  <div className="rounded-2xl border bg-card p-6 flex flex-col">
    <div className="text-xs uppercase tracking-widest text-muted-foreground">{audience}</div>
    <h3 className="text-xl font-semibold mt-1">{name}</h3>
    <p className="text-sm text-muted-foreground mt-2">{blurb}</p>
    <ul className="mt-4 space-y-2 text-sm flex-1">
      {features.map(f => (
        <li key={f} className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />{f}</li>
      ))}
    </ul>
  </div>
);

const Business = () => {
  usePageMeta({
    title: 'Flowist for Business — Managed licenses for classrooms & workplaces',
    description: 'Request managed Flowist licenses for your school, team, or organization. Bulk seats, centralized billing, and onboarding support.',
    path: '/business',
  });

  const [form, setForm] = useState<LeadInput>({
    company_name: '',
    contact_name: '',
    work_email: '',
    role: '',
    audience: 'team',
    team_size: 25,
    use_case: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Prefill from logged-in profile if available
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data?.user;
      if (!u || cancelled) return;
      setForm(prev => ({
        ...prev,
        work_email: prev.work_email || u.email || '',
        contact_name: prev.contact_name || (u.user_metadata?.full_name as string) || (u.user_metadata?.name as string) || '',
      }));
    })();
    return () => { cancelled = true; };
  }, []);

  const onChange = <K extends keyof LeadInput>(key: K, value: LeadInput[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = leadSchema.safeParse(form);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      toast.error(first?.message || 'Please complete the form');
      return;
    }
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const d = parsed.data;
      const payload = {
        company_name: d.company_name,
        contact_name: d.contact_name,
        work_email: d.work_email,
        audience: d.audience,
        team_size: d.team_size,
        role: d.role ? d.role : null,
        use_case: d.use_case ? d.use_case : null,
        message: d.message ? d.message : null,
        user_id: userData?.user?.id ?? null,
        source: 'business-page',
      };
      const { error } = await supabase.from('business_leads').insert(payload);
      if (error) throw error;
      setSubmitted(true);
      toast.success('Thanks — we will be in touch within 1 business day.');
    } catch (err) {
      console.error('[business-leads] submit failed', err);
      toast.error('Could not submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-5 py-4 flex items-center justify-between">
          <Link to="/" className="font-semibold tracking-tight">Flowist</Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/" className="text-muted-foreground hover:text-foreground">Home</Link>
            <Link to="/privacy-policy" className="text-muted-foreground hover:text-foreground">Privacy</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-12 md:py-16">
        {/* Hero */}
        <section className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full">
            <Sparkles className="h-3.5 w-3.5" /> Flowist for Business
          </div>
          <h1 className="mt-4 text-4xl md:text-5xl font-semibold tracking-tight">
            Managed Flowist licenses for classrooms & workplaces
          </h1>
          <p className="mt-4 text-muted-foreground text-lg leading-relaxed">
            Equip students and teams with the focus, habit, and note tools they need —
            centrally billed, easy to deploy, and supported by humans.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <a href="#lead-form">
              <Button size="lg">Request a quote</Button>
            </a>
            <a href="#tiers" className="text-sm text-muted-foreground hover:text-foreground">View plans</a>
          </div>
        </section>

        {/* Benefits */}
        <section className="mt-16 grid gap-4 md:grid-cols-3">
          <Benefit icon={<Users className="h-5 w-5" />} title="Centralized seats" body="Add, remove, and reassign seats from a single admin dashboard. No per-user receipts." />
          <Benefit icon={<ShieldCheck className="h-5 w-5" />} title="Privacy-first" body="Data stays inside each user's account. Admins manage access, never read personal notes." />
          <Benefit icon={<Building2 className="h-5 w-5" />} title="Invoiced billing" body="Annual invoices, POs, and tax IDs supported. Pay by card or bank transfer." />
        </section>

        {/* Tiers */}
        <section id="tiers" className="mt-16">
          <h2 className="text-2xl font-semibold tracking-tight text-center">Plans built for groups</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Tier
              name="Classroom"
              audience="Schools & educators"
              blurb="For teachers running a single class or workshop cohort."
              features={['Up to 40 student seats', 'Teacher dashboard', 'Focus Mode + Habit Tracker', 'Email support']}
            />
            <Tier
              name="Team"
              audience="Startups & workplaces"
              blurb="For small teams that want shared productivity rituals."
              features={['10–250 seats', 'Centralized billing & SSO-ready', 'All premium features', 'Priority support']}
            />
            <Tier
              name="Enterprise"
              audience="Districts & organizations"
              blurb="For schools, districts, and companies that need scale."
              features={['250+ seats', 'Custom onboarding', 'SAML SSO + audit logs', 'Dedicated success manager']}
            />
          </div>
        </section>

        {/* Lead Form */}
        <section id="lead-form" className="mt-16 grid gap-8 md:grid-cols-[1fr_1.2fr] items-start">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Request a managed license</h2>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              Tell us about your group and intended use. We'll reply within 1 business day
              with pricing, a deployment plan, and next steps.
            </p>
            <div className="mt-6 space-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-primary" /> Education discounts available</div>
              <div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" /> Annual & multi-year contracts</div>
              <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> GDPR & FERPA-friendly setup</div>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-6 md:p-7">
            {submitted ? (
              <div className="text-center py-10">
                <div className="mx-auto h-12 w-12 grid place-items-center rounded-full bg-primary/10 text-primary">
                  <Check className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">Request received</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Thanks — a member of the Flowist team will reach out to{' '}
                  <span className="font-medium text-foreground">{form.work_email}</span> within one business day.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="company">Organization *</Label>
                    <Input id="company" required maxLength={200} value={form.company_name}
                      onChange={e => onChange('company_name', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact">Your name *</Label>
                    <Input id="contact" required maxLength={200} value={form.contact_name}
                      onChange={e => onChange('contact_name', e.target.value)} />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Work email *</Label>
                    <Input id="email" type="email" required maxLength={320} value={form.work_email}
                      onChange={e => onChange('work_email', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="role">Your role</Label>
                    <Input id="role" maxLength={120} placeholder="e.g. Principal, Ops Lead"
                      value={form.role} onChange={e => onChange('role', e.target.value)} />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Audience *</Label>
                    <Select value={form.audience} onValueChange={(v) => onChange('audience', v as LeadInput['audience'])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="school">School / classroom</SelectItem>
                        <SelectItem value="team">Workplace / team</SelectItem>
                        <SelectItem value="agency">Agency / consultancy</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="size">Approx. seats *</Label>
                    <Input id="size" type="number" min={1} max={100000} required value={form.team_size}
                      onChange={e => onChange('team_size', Number(e.target.value) as LeadInput['team_size'])} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="usecase">Primary use case</Label>
                  <Input id="usecase" maxLength={1000} placeholder="e.g. Study habits for Grade 10 students"
                    value={form.use_case} onChange={e => onChange('use_case', e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="message">Anything else?</Label>
                  <Textarea id="message" rows={4} maxLength={4000}
                    placeholder="Timeline, deployment questions, required integrations..."
                    value={form.message} onChange={e => onChange('message', e.target.value)} />
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                  {submitting ? 'Sending…' : 'Request a quote'}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  By submitting, you agree to be contacted about Flowist for Business.
                </p>
              </form>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t mt-16">
        <div className="mx-auto max-w-6xl px-5 py-6 text-xs text-muted-foreground flex justify-between">
          <span>© Flowist</span>
          <Link to="/terms-and-conditions" className="hover:text-foreground">Terms</Link>
        </div>
      </footer>
    </div>
  );
};

export default Business;
