/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import { BRAND, styles } from './_brand.ts'

interface Props {
  siteName?: string
  email?: string
  newEmail?: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({ email, newEmail, confirmationUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your new email for {BRAND.name}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Img src={BRAND.logoUrl} width="56" height="56" alt={BRAND.name} style={styles.logo} />
          <Text style={styles.brandName}>{BRAND.name}</Text>
          <Text style={styles.brandTag}>{BRAND.tagline}</Text>
        </Section>

        <Section style={styles.card}>
          <Heading style={styles.h1}>Confirm your new email</Heading>
          <Text style={styles.text}>
            You asked to change your {BRAND.name} sign-in email
            {email ? <> from <strong>{email}</strong></> : null}
            {newEmail ? <> to <strong>{newEmail}</strong></> : null}.
            Confirm this change to keep your account secure.
          </Text>
          <Section style={styles.buttonWrap}>
            <Button style={styles.button} href={confirmationUrl}>
              Confirm email change
            </Button>
          </Section>
          <Text style={styles.hint}>
            Or paste this link into your browser:
            <br />
            <Link href={confirmationUrl} style={styles.link}>{confirmationUrl}</Link>
          </Text>
        </Section>

        <Section style={styles.footer}>
          <Text style={styles.footerText}>
            Didn't request this change? Ignore this email or reset your password immediately.
          </Text>
          <Text style={styles.footerText}>
            © {new Date().getFullYear()} {BRAND.name} ·{' '}
            <Link href={BRAND.siteUrl} style={styles.footerLink}>flowist.me</Link>
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
