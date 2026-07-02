/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
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
  token: string
}

export const ReauthenticationEmail = ({ token }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {BRAND.name} verification code</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Img src={BRAND.logoUrl} width="56" height="56" alt={BRAND.name} style={styles.logo} />
          <Text style={styles.brandName}>{BRAND.name}</Text>
          <Text style={styles.brandTag}>{BRAND.tagline}</Text>
        </Section>

        <Section style={styles.card}>
          <Heading style={styles.h1}>Verify it's you</Heading>
          <Text style={styles.text}>
            Enter this code in {BRAND.name} to confirm your identity:
          </Text>
          <Section style={{ textAlign: 'center' }}>
            <Text style={styles.code}>{token}</Text>
          </Section>
          <Text style={styles.hint}>
            This code expires shortly. Never share it with anyone — the {BRAND.name} team
            will never ask you for this code.
          </Text>
        </Section>

        <Section style={styles.footer}>
          <Text style={styles.footerText}>
            Didn't request this code? You can safely ignore this email.
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

export default ReauthenticationEmail
