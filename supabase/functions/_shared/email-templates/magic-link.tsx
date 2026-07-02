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
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import { BRAND, styles } from './_brand.ts'

interface Props {
  recipient?: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ confirmationUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Sign in to {BRAND.name}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Img src={BRAND.logoUrl} width="32" height="32" alt={BRAND.name} style={styles.logo} />
        </Section>

        <Heading style={styles.h1}>Sign in link</Heading>

        <Text style={styles.text}>
          Click the link below to sign in to your account:
        </Text>

        <Text style={styles.text}>
          <Link href={confirmationUrl} style={styles.link}>Sign in</Link>
        </Text>

        <Text style={styles.text}>
          This link will expire 30 minutes after this email was sent.
        </Text>

        <Text style={styles.text}>
          If you did not make this request, you can ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
