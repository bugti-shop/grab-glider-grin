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

export const SignupEmail = ({ confirmationUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email for {BRAND.name}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Img src={BRAND.logoUrl} width="32" height="32" alt={BRAND.name} style={styles.logo} />
        </Section>

        <Heading style={styles.h1}>Verify your email</Heading>

        <Text style={styles.text}>
          Verify your email by clicking the link below. It will open Flowist and
          sign you in automatically — you won't need to enter your password again.
        </Text>

        <Section style={styles.buttonWrap}>
          <Button href={confirmationUrl} style={styles.button}>Verify email &amp; open Flowist</Button>
        </Section>

        <Text style={styles.text}>
          Or paste this link into your browser:<br />
          <a href={confirmationUrl} style={styles.link}>{confirmationUrl}</a>
        </Text>

        <Text style={styles.text}>
          This link expires 30 minutes after this email was sent. If you didn't
          request this, you can safely ignore it.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
