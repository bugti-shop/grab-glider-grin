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

export const MagicLinkEmail = ({ confirmationUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {BRAND.name} sign-in link</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Img src={BRAND.logoUrl} width="56" height="56" alt={BRAND.name} style={styles.logo} />
          <Text style={styles.brandName}>{BRAND.name}</Text>
          <Text style={styles.brandTag}>{BRAND.tagline}</Text>
        </Section>

        <Section style={styles.card}>
          <Heading style={styles.h1}>Sign in to {BRAND.name}</Heading>
          <Text style={styles.text}>
            Tap the button below to sign in. This link is single-use and expires shortly.
          </Text>
          <Section style={styles.buttonWrap}>
            <Button style={styles.button} href={confirmationUrl}>
              Sign in to {BRAND.name}
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
            Didn't request this link? You can safely ignore this email — no one can sign in without it.
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

export default MagicLinkEmail
