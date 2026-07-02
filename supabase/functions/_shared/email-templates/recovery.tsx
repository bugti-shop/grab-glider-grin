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
  confirmationUrl: string
}

export const RecoveryEmail = ({ confirmationUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your {BRAND.name} password</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Img src={BRAND.logoUrl} width="96" height="96" alt={BRAND.name} style={styles.logo} />
          <Text style={styles.brandName}>{BRAND.name}</Text>
          <Text style={styles.brandTag}>{BRAND.tagline}</Text>
        </Section>

        <Section style={styles.card}>
          <Heading style={styles.h1}>Reset your password</Heading>
          <Text style={styles.text}>
            We received a request to reset the password for your {BRAND.name} account.
            Tap the button below to choose a new one.
          </Text>
          <Section style={styles.buttonWrap}>
            <Button style={styles.button} href={confirmationUrl}>
              Reset password
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
            Didn't request a password reset? You can ignore this email — your password won't change.
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

export default RecoveryEmail
