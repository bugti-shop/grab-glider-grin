// Shared brand tokens & styles for Flowist auth emails.
// Every template must import from here so header/footer/buttons stay consistent.

export const BRAND = {
  name: 'Flowist',
  tagline: 'Notes, tasks & habits — everywhere',
  logoUrl: 'https://flowist.me/icon-512.png',
  siteUrl: 'https://flowist.me',
  primary: '#3c78f0',
  primaryDark: '#2c5fc9',
  ink: '#0f172a',
  muted: '#64748b',
  border: '#e5e7eb',
  bg: '#ffffff',
  panel: '#f7f9fc',
}

export const styles = {
  main: {
    backgroundColor: '#ffffff',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    color: BRAND.ink,
    margin: 0,
    padding: 0,
  } as const,
  container: {
    maxWidth: '560px',
    margin: '0 auto',
    padding: '0',
  } as const,
  header: {
    padding: '28px 32px 20px',
    textAlign: 'center' as const,
  },
  logo: {
    display: 'block',
    margin: '0 auto 10px',
    borderRadius: '14px',
  },
  brandName: {
    fontSize: '18px',
    fontWeight: 800 as const,
    color: BRAND.ink,
    margin: '0',
    letterSpacing: '-0.01em',
  },
  brandTag: {
    fontSize: '12px',
    color: BRAND.muted,
    margin: '2px 0 0',
  },
  card: {
    background: BRAND.panel,
    border: `1px solid ${BRAND.border}`,
    borderRadius: '14px',
    padding: '32px 28px',
    margin: '8px 32px 24px',
  } as const,
  h1: {
    fontSize: '22px',
    fontWeight: 800 as const,
    color: BRAND.ink,
    margin: '0 0 14px',
    letterSpacing: '-0.01em',
  },
  text: {
    fontSize: '15px',
    color: '#334155',
    lineHeight: '1.55',
    margin: '0 0 18px',
  },
  button: {
    display: 'inline-block',
    backgroundColor: BRAND.primary,
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 700 as const,
    borderRadius: '10px',
    padding: '13px 26px',
    textDecoration: 'none',
    textAlign: 'center' as const,
  } as const,
  buttonWrap: {
    textAlign: 'center' as const,
    margin: '8px 0 22px',
  },
  code: {
    display: 'inline-block',
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    fontSize: '26px',
    fontWeight: 800 as const,
    color: BRAND.primary,
    background: '#eaf1ff',
    border: `1px solid ${BRAND.primary}33`,
    borderRadius: '10px',
    padding: '12px 22px',
    letterSpacing: '6px',
    margin: '4px 0 18px',
  } as const,
  link: {
    color: BRAND.primary,
    textDecoration: 'underline',
    wordBreak: 'break-all' as const,
    fontSize: '13px',
  },
  hint: {
    fontSize: '13px',
    color: BRAND.muted,
    lineHeight: '1.55',
    margin: '0',
  },
  footer: {
    padding: '18px 32px 28px',
    textAlign: 'center' as const,
    borderTop: `1px solid ${BRAND.border}`,
    margin: '0 32px',
  },
  footerText: {
    fontSize: '12px',
    color: BRAND.muted,
    margin: '10px 0 0',
    lineHeight: '1.5',
  },
  footerLink: {
    color: BRAND.muted,
    textDecoration: 'underline',
  },
}
