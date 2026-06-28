export interface NoteStats {
  wordCount: number;
  characterCount: number;
  characterCountNoSpaces: number;
  readingTimeMinutes: number;
}

export function calculateNoteStats(content: string, title: string = ''): NoteStats {
  let inTag = false;
  let prevWasWord = true;
  let wordCount = title.trim() ? title.trim().split(/\s+/).length : 0;
  let characterCount = title.length + (title ? 1 : 0);
  let characterCountNoSpaces = title.replace(/\s/g, '').length;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inTag) {
      if (ch === '>') inTag = false;
      continue;
    }
    if (ch === '<') {
      inTag = true;
      if (!prevWasWord) prevWasWord = true;
      continue;
    }
    if (ch === '&') {
      const semi = content.indexOf(';', i + 1);
      if (semi !== -1 && semi - i <= 12) i = semi;
    }
    characterCount++;
    if (/\s/.test(ch)) {
      prevWasWord = true;
    } else {
      characterCountNoSpaces++;
      if (prevWasWord) wordCount++;
      prevWasWord = false;
    }
  }

  // Reading time - average reading speed is ~200-250 words per minute
  const wordsPerMinute = 200;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / wordsPerMinute));

  return {
    wordCount,
    characterCount,
    characterCountNoSpaces,
    readingTimeMinutes,
  };
}

export function formatReadingTime(minutes: number): string {
  if (minutes < 1) return 'Less than 1 min read';
  if (minutes === 1) return '1 min read';
  return `${minutes} min read`;
}
