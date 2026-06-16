// Smart Detection for URLs, Emails, and Phone Numbers
// Extracted from RichTextEditor.tsx

export interface SmartDetectionSettings {
  urls: boolean;
  phoneNumbers: boolean;
  emailAddresses: boolean;
}

export const applySmartDetection = (
  textNode: Text,
  cursorOffset: number,
  settings: SmartDetectionSettings
) => {
  if (!textNode.textContent) return;
  
  const text = textNode.textContent;
  // Don't process if already inside a link
  if (textNode.parentElement?.closest('a')) return;
  
  // Common TLDs for plain domain detection (like WhatsApp)
  const commonTLDs = 'com|org|net|edu|gov|io|co|app|dev|ai|me|info|biz|us|uk|de|fr|es|it|ru|cn|jp|in|br|au|ca|nl|se|no|fi|dk|pl|cz|at|ch|be|pt|gr|tr|mx|ar|cl|za|kr|tw|hk|sg|my|th|vn|id|ph|pk|bd|ae|sa|eg|ng|ke';
  
  // Regex patterns
  const urlPattern = new RegExp(
    `(?:https?:\\/\\/)?(?:www\\.)?[a-zA-Z0-9][a-zA-Z0-9-]*(?:\\.[a-zA-Z0-9][a-zA-Z0-9-]*)*\\.(?:${commonTLDs})(?:\\/[^\\s<]*)?`,
    'gi'
  );
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const phonePattern = /(?:\+\d{1,4}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{2,6}/g;
  
  let match: RegExpExecArray | null;
  const replacements: { start: number; end: number; type: 'url' | 'email' | 'phone'; text: string }[] = [];
  
  // Find emails FIRST to prevent them being detected as URLs
  if (settings.emailAddresses) {
    while ((match = emailPattern.exec(text)) !== null) {
      if (match.index + match[0].length < cursorOffset) {
        replacements.push({
          start: match.index,
          end: match.index + match[0].length,
          type: 'email',
          text: match[0]
        });
      }
    }
  }
  
  // Find URLs (skip if overlaps with email)
  if (settings.urls) {
    while ((match = urlPattern.exec(text)) !== null) {
      if (match.index + match[0].length < cursorOffset) {
        const overlapsEmail = replacements.some(r => 
          r.type === 'email' && 
          !(match!.index >= r.end || match!.index + match![0].length <= r.start)
        );
        if (!overlapsEmail) {
          replacements.push({
            start: match.index,
            end: match.index + match[0].length,
            type: 'url',
            text: match[0]
          });
        }
      }
    }
  }
  
  // Find phone numbers (only if 7+ digits to avoid false positives)
  if (settings.phoneNumbers) {
    while ((match = phonePattern.exec(text)) !== null) {
      const digitsOnly = match[0].replace(/\D/g, '');
      if (digitsOnly.length >= 7 && match.index + match[0].length < cursorOffset) {
        const overlapsExisting = replacements.some(r => 
          !(match!.index >= r.end || match!.index + match![0].length <= r.start)
        );
        if (!overlapsExisting) {
          replacements.push({
            start: match.index,
            end: match.index + match[0].length,
            type: 'phone',
            text: match[0]
          });
        }
      }
    }
  }
  
  // Sort by position (descending) to replace from end to start
  replacements.sort((a, b) => b.start - a.start);
  
  // Apply replacements
  if (replacements.length > 0 && textNode.parentNode) {
    for (const repl of replacements) {
      const before = text.substring(0, repl.start);
      const linkText = repl.text;
      const after = text.substring(repl.end);
      
      // Create link
      const link = document.createElement('a');
      link.textContent = linkText;
      link.style.color = 'hsl(var(--primary))';
      link.style.textDecoration = 'underline';
      link.setAttribute('data-smart-link', repl.type);
      
      if (repl.type === 'url') {
        link.href = linkText.match(/^https?:\/\//i) ? linkText : `https://${linkText}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      } else if (repl.type === 'email') {
        link.href = `mailto:${linkText}`;
      } else if (repl.type === 'phone') {
        link.href = `tel:${linkText.replace(/\D/g, '')}`;
      }
      
      // Split text node and insert link
      const beforeNode = document.createTextNode(before);
      const afterNode = document.createTextNode(after);
      
      const parent = textNode.parentNode;
      parent.insertBefore(beforeNode, textNode);
      parent.insertBefore(link, textNode);
      parent.insertBefore(afterNode, textNode);
      parent.removeChild(textNode);
      
      // Move cursor to after the link
      const selection = window.getSelection();
      if (selection && afterNode.textContent !== null) {
        const range = document.createRange();
        range.setStart(afterNode, 0);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      
      break; // Process one at a time
    }
  }
};
