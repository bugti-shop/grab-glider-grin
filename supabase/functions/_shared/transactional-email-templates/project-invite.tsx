/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  inviterName?: string
  projectName?: string
  role?: string
  acceptUrl?: string
}

const FLOWIST_LOGO_URL = 'https://flowist.me/launcher-icon.png'
const FLOWIST_URL = 'https://flowist.me'

const ProjectInviteEmail = ({
  inviterName = 'A Flowist user',
  projectName = 'a project',
  role = 'member',
  acceptUrl = FLOWIST_URL,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{inviterName} invited you to join {projectName} on Flowist</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandRow}>
          <Img src={FLOWIST_LOGO_URL} alt="Flowist" width="40" height="40" style={logo} />
          <Heading style={brand}>Flowist</Heading>
        </Section>

        <Heading style={h1}>You've been invited to a project</Heading>
        <Text style={text}>
          <strong>{inviterName}</strong> invited you to collaborate on{' '}
          <strong>{projectName}</strong> as a <strong>{role}</strong>.
        </Text>
        <Text style={text}>
          Accept the invitation to start assigning tasks, tracking progress, and working together in real time.
        </Text>
        <Button style={button} href={acceptUrl}>Accept invitation</Button>
        <Text style={footer}>
          If you weren't expecting this invitation, you can safely ignore this email — it will expire in 14 days.
        </Text>
        <Text style={footerLink}>
          <Link href={FLOWIST_URL} style={link}>{FLOWIST_URL}</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ProjectInviteEmail,
  subject: (d: Record<string, any>) =>
    `${d.inviterName || 'Someone'} invited you to ${d.projectName || 'a project'} on Flowist`,
  displayName: 'Project invitation',
  previewData: {
    inviterName: 'Alex',
    projectName: 'Marketing Sprint',
    role: 'editor',
    acceptUrl: 'https://flowist.me/invite/sample-token',
  },
} satisfies TemplateEntry

const brandBlue = 'hsl(220, 85%, 59%)'
const foreground = 'hsl(222.2, 84%, 4.9%)'
const muted = 'hsl(215.4, 16.3%, 46.9%)'
const main = { backgroundColor: '#ffffff', fontFamily: 'Nunito, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '520px' }
const brandRow = { marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }
const logo = { borderRadius: '8px', display: 'inline-block', verticalAlign: 'middle', marginRight: '10px' }
const brand = { fontSize: '20px', fontWeight: 900 as const, color: brandBlue, margin: 0, letterSpacing: '-0.02em', display: 'inline-block', verticalAlign: 'middle' }
const h1 = { fontSize: '24px', fontWeight: 800 as const, color: foreground, margin: '0 0 16px' }
const text = { fontSize: '15px', color: muted, lineHeight: '1.55', margin: '0 0 16px' }
const link = { color: brandBlue, textDecoration: 'underline' }
const button = { backgroundColor: brandBlue, color: '#ffffff', fontSize: '15px', fontWeight: 700 as const, borderRadius: '10px', padding: '13px 22px', textDecoration: 'none', display: 'inline-block', marginTop: '8px' }
const footer = { fontSize: '12px', color: muted, margin: '28px 0 6px' }
const footerLink = { fontSize: '12px', color: muted, margin: 0 }
