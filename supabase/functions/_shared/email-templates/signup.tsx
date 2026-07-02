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
import { BRAND, styles } from './_brand.ts'

interface Props {
  siteName?: string
  siteUrl?: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ recipient, confirmationUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email to start using {BRAND.name}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Img src={BRAND.logoUrl} width="56" height="56" alt={BRAND.name} style={styles.logo} />
          <Text style={styles.brandName}>{BRAND.name}</Text>
          <Text style={styles.brandTag}>{BRAND.tagline}</Text>
        </Section>

        <Section style={styles.card}>
          <Heading style={styles.h1}>Confirm your email</Heading>
          <Text style={styles.text}>
            Welcome to {BRAND.name}! Please confirm <strong>{recipient}</strong> to
            activate your account and start capturing notes, tasks, and habits everywhere.
          </Text>
          <Section style={styles.buttonWrap}>
            <Button style={styles.button} href={confirmationUrl}>
              Confirm my email
            </Button>
          </Section>
          <Text style={styles.hint}>
            Or copy this link into your browser:
            <br />
            <Link href={confirmationUrl} style={styles.link}>{confirmationUrl}</Link>
          </Text>
        </Section>

        <Section style={styles.footer}>
          <Text style={styles.footerText}>
            Didn't create a {BRAND.name} account? You can safely ignore this email.
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

export default SignupEmail
