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
            <Img src={BRAND.logoUrl} width="32" height="32" alt={BRAND.name} style={styles.logo} />
          </Section>

          <Heading style={styles.h1}>Confirm your email</Heading>

          <Text style={styles.text}>
            Click the link below to verify your email address:
          </Text>

          <Text style={styles.text}>
            <Link href={actionUrl} style={styles.link}>Verify email</Link>
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
}

export default ReauthenticationEmail
