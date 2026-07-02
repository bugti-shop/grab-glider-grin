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
  token?: string
  confirmationUrl?: string
}

export const ReauthenticationEmail = ({ token, confirmationUrl }: Props) => {
  const actionUrl = confirmationUrl || `${BRAND.siteUrl}/auth/callback${token ? `?token=${token}` : ''}`
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Confirm it's you on {BRAND.name}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Img src={BRAND.logoUrl} width="96" height="96" alt={BRAND.name} style={styles.logo} />
            <Text style={styles.brandName}>{BRAND.name}</Text>
            <Text style={styles.brandTag}>{BRAND.tagline}</Text>
          </Section>

          <Section style={styles.card}>
            <Heading style={styles.h1}>Confirm your email</Heading>
            <Text style={styles.text}>
              Tap the button below to confirm it's you and continue securely in {BRAND.name}.
            </Text>
            <Section style={styles.buttonWrap}>
              <Button style={styles.button} href={actionUrl}>
                Confirm my email
              </Button>
            </Section>
            <Text style={styles.hint}>
              Or paste this link into your browser:
              <br />
              <Link href={actionUrl} style={styles.link}>{actionUrl}</Link>
            </Text>
          </Section>

          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              Didn't request this? You can safely ignore this email.
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
}

export default ReauthenticationEmail
