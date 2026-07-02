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
  newEmail?: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({ confirmationUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your new email address</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Img src={BRAND.logoUrl} width="32" height="32" alt={BRAND.name} style={styles.logo} />
        </Section>

        <Heading style={styles.h1}>Confirm email change</Heading>

        <Text style={styles.text}>
          Click the link below to confirm your new email address:
        </Text>

        <Section style={styles.buttonWrap}>
          <Button href={confirmationUrl} style={styles.button}>Confirm email</Button>
        </Section>

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

export default EmailChangeEmail
