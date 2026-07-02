/// <reference types="npm:@types/react@18.3.1" />
import type * as React from 'npm:react@18.3.1'
import { template as projectInviteTemplate } from './project-invite.tsx'
import { template as taskMentionTemplate } from './task-mention.tsx'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'project-invite': projectInviteTemplate,
  'task-mention': taskMentionTemplate,
}
