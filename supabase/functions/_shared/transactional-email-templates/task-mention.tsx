/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  mentionerName?: string
  taskTitle?: string
  projectName?: string
  commentBody?: string
  taskUrl?: string
}

const FLOWIST_LOGO_URL = 'https://flowist.me/launcher-icon.png'
const FLOWIST_URL = 'https://flowist.me'

const TaskMentionEmail = ({
  mentionerName = 'A Flowist user',
  taskTitle = 'a task',
  projectName,
  commentBody = '',
  taskUrl = FLOWIST_URL,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{mentionerName} mentioned you on {taskTitle}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandRow}>
          <Img src={FLOWIST_LOGO_URL} alt="Flowist" width="40" height="40" style={logo} />
          <Heading style={brand}>Flowist</Heading>
        </Section>

        <Heading style={h1}>You were mentioned</Heading>
        <Text style={text}>
          <strong>{mentionerName}</strong> mentioned you in a comment on{' '}
          <strong>{taskTitle}</strong>
          {projectName ? <> in <strong>{projectName}</strong></> : null}.
        </Text>
        {commentBody ? (
          <Section style={quoteBox}>
            <Text style={quoteText}>{commentBody.slice(0, 500)}</Text>
          </Section>
        ) : null}
        <Button style={button} href={taskUrl}>Open task</Button>
        <Text style={footer}>
          You're receiving this because someone @mentioned you in a task comment on Flowist.
        </Text>
        <Text style={footerLink}>
          <Link href={FLOWIST_URL} style={link}>{FLOWIST_URL}</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TaskMentionEmail,
  subject: (d: Record<string, any>) =>
    `${d.mentionerName || 'Someone'} mentioned you on ${d.taskTitle || 'a task'}`,
  displayName: 'Task mention',
  previewData: {
    mentionerName: 'Alex',
    taskTitle: 'Ship Q3 launch',
    projectName: 'Marketing Sprint',
    commentBody: 'Hey @you — can you review the copy today?',
    taskUrl: 'https://flowist.me',
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
const quoteBox = { borderLeft: `3px solid ${brandBlue}`, background: '#f7f9ff', padding: '12px 14px', borderRadius: '6px', margin: '0 0 20px' }
const quoteText = { fontSize: '14px', color: foreground, whiteSpace: 'pre-wrap' as const, margin: 0, lineHeight: '1.5' }
const link = { color: brandBlue, textDecoration: 'underline' }
const button = { backgroundColor: brandBlue, color: '#ffffff', fontSize: '15px', fontWeight: 700 as const, borderRadius: '10px', padding: '13px 22px', textDecoration: 'none', display: 'inline-block', marginTop: '8px' }
const footer = { fontSize: '12px', color: muted, margin: '28px 0 6px' }
const footerLink = { fontSize: '12px', color: muted, margin: 0 }
