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
  recipient: string
  confirmationUrl: string
}

export const InviteEmail = ({ recipient, confirmationUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to {BRAND.name}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Img src={BRAND.logoUrl} width="56" height="56" alt={BRAND.name} style={styles.logo} />
          <Text style={styles.brandName}>{BRAND.name}</Text>
          <Text style={styles.brandTag}>{BRAND.tagline}</Text>
        </Section>

        <Section style={styles.card}>
          <Heading style={styles.h1}>You're invited to {BRAND.name}</Heading>
          <Text style={styles.text}>
            Someone invited <strong>{recipient}</strong> to join {BRAND.name} — your
            all-in-one workspace for notes, tasks, and habits across every device.
          </Text>
          <Section style={styles.buttonWrap}>
            <Button style={styles.button} href={confirmationUrl}>
              Accept invitation
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
            Not expecting an invitation? You can safely ignore this email.
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

export default InviteEmail
