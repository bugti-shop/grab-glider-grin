/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
  token?: string
}

const FLOWIST_SITE_NAME = 'Flowist'
const FLOWIST_SITE_URL = 'https://flowist.me'
const FLOWIST_LOGO_URL = 'https://flowist.me/launcher-icon.png'


export const EmailChangeEmail = ({
  oldEmail,
  newEmail,
  confirmationUrl,
  token,
}: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your Flowist email change code{token ? `: ${token}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandRow}>
          <Img src={FLOWIST_LOGO_URL} alt="Flowist" width="40" height="40" style={logo} />
          <Heading style={brand}>{FLOWIST_SITE_NAME}</Heading>
        </Section>

        <Heading style={h1}>Confirm your email change</Heading>
        <Text style={text}>
          You requested to change your Flowist email from{' '}
          <Link href={`mailto:${oldEmail}`} style={link}>{oldEmail}</Link>{' '}
          to{' '}
          <Link href={`mailto:${newEmail}`} style={link}>{newEmail}</Link>.
        </Text>

        {token ? (
          <Section style={codeBox}>
            <Text style={codeStyle}>{token}</Text>
            <Text style={codeHint}>Enter this 6-digit code in Flowist to finish the change.</Text>
          </Section>
        ) : null}

        <Hr style={hr} />

        <Text style={text}>Prefer one-click confirmation? Use the button below.</Text>
        <Button style={button} href={confirmationUrl}>Confirm email change</Button>

        <Text style={footer}>
          Didn't request this change? Ignore this email and consider updating
          your Flowist password.
        </Text>
        <Text style={footerLink}>
          <Link href={FLOWIST_SITE_URL} style={link}>{FLOWIST_SITE_URL}</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

const brandBlue = 'hsl(220, 85%, 59%)'
const foreground = 'hsl(222.2, 84%, 4.9%)'
const muted = 'hsl(215.4, 16.3%, 46.9%)'

const main = { backgroundColor: '#ffffff', fontFamily: 'Nunito, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '520px' }
const brandRow = { marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }
const logo = { borderRadius: '8px', display: 'inline-block', verticalAlign: 'middle', marginRight: '10px' }
const brand = { fontSize: '20px', fontWeight: 900 as const, color: brandBlue, margin: 0, letterSpacing: '-0.02em', display: 'inline-block', verticalAlign: 'middle' }
const h1 = { fontSize: '24px', fontWeight: 800 as const, color: foreground, margin: '0 0 16px' }
const text = { fontSize: '15px', color: muted, lineHeight: '1.55', margin: '0 0 20px' }
const codeBox = {
  backgroundColor: '#f4f7ff',
  border: `1px solid ${brandBlue}`,
  borderRadius: '12px',
  padding: '20px',
  textAlign: 'center' as const,
  margin: '0 0 24px',
}
const codeStyle = {
  fontFamily: '"SF Mono", Menlo, Consolas, monospace',
  fontSize: '34px',
  fontWeight: 800 as const,
  color: foreground,
  letterSpacing: '0.4em',
  margin: '0 0 6px',
}
const codeHint = { fontSize: '12px', color: muted, margin: 0 }
const hr = { border: 'none', borderTop: '1px solid #eef0f4', margin: '8px 0 24px' }
const link = { color: brandBlue, textDecoration: 'underline' }
const button = {
  backgroundColor: brandBlue,
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 700 as const,
  borderRadius: '10px',
  padding: '13px 22px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = { fontSize: '12px', color: muted, margin: '28px 0 6px' }
const footerLink = { fontSize: '12px', color: muted, margin: 0 }
