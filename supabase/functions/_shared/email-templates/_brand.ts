// Shared brand tokens & styles for Flowist auth emails.
// Minimal Apple-style layout: tiny logo top-right, bold heading, plain text, link.

export const BRAND = {
  name: 'Flowist',
  logoUrl: 'https://flowist.me/email-logo.png',
  siteUrl: 'https://flowist.me',
  ink: '#111111',
  link: '#2c5fc9',
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
    padding: '32px 28px 40px',
  } as const,
  header: {
    textAlign: 'right' as const,
    margin: '0 0 28px',
  },
  logo: {
    display: 'inline-block',
    borderRadius: '6px',
    width: '32px',
    height: '32px',
  } as const,
  h1: {
    fontSize: '30px',
    fontWeight: 800 as const,
    color: BRAND.ink,
    margin: '0 0 24px',
    letterSpacing: '-0.02em',
    lineHeight: '1.15',
  },
  text: {
    fontSize: '16px',
    color: BRAND.ink,
    lineHeight: '1.55',
    margin: '0 0 18px',
  },
  link: {
    color: BRAND.link,
    textDecoration: 'underline',
    wordBreak: 'break-all' as const,
    fontSize: '16px',
    fontWeight: 600 as const,
  },
}
