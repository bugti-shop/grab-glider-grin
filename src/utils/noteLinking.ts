import { Note } from '@/types/note';

const scanForLink = (content: string, title: string): boolean => {
  if (!content || !title) return false;
  const needle = title.toLowerCase();
  const linkRegex = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(content)) !== null) {
    if (match[1].trim().toLowerCase() === needle) return true;
  }
  return false;
};

// Parse [[note title]] syntax and return linked content
export const parseNoteLinks = (content: string, notes: Note[]): string => {
  const linkRegex = /\[\[([^\]]+)\]\]/g;
  
  return content.replace(linkRegex, (match, noteTitle) => {
    const linkedNote = notes.find(
      n => n.title.toLowerCase() === noteTitle.toLowerCase().trim()
    );
    
    if (linkedNote) {
      return `<a href="#" class="note-link" data-note-id="${linkedNote.id}" style="color: #3B82F6; text-decoration: none; background: rgba(59, 130, 246, 0.1); padding: 2px 6px; border-radius: 4px; font-weight: 500;">📝 ${noteTitle}</a>`;
    }
    
    // Return unlinked style for non-existent notes
    return `<span class="note-link-missing" style="color: #9CA3AF; text-decoration: line-through; background: rgba(156, 163, 175, 0.1); padding: 2px 6px; border-radius: 4px;">[[${noteTitle}]]</span>`;
  });
};

// Extract all note links from content
export const extractNoteLinks = (content: string): string[] => {
  const linkRegex = /\[\[([^\]]+)\]\]/g;
  const links: string[] = [];
  let match;
  
  while ((match = linkRegex.exec(content)) !== null) {
    links.push(match[1].trim());
  }
  
  return links;
};

// Find notes that link to a specific note
export const findBacklinks = (targetNote: Note, allNotes: Note[]): Note[] => {
  if (!targetNote.title || allNotes.length > 500 || allNotes.some(note => note.content.length > 50_000)) {
    return [];
  }
  return allNotes.filter(note => {
    if (note.id === targetNote.id) return false;
    return scanForLink(note.content, targetNote.title);
  });
};

// Insert a note link at cursor position
export const insertNoteLink = (noteTitle: string): string => {
  return `[[${noteTitle}]]`;
};
