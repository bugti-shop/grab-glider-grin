const SNAPSHOT_FRAME_CLASS = 'flowist-web-clip-page';
const SNAPSHOT_FRAME_ROLE = 'page-embed';
const SNAPSHOT_SOURCE_ATTR = 'data-snapshot-source';
const SNAPSHOT_SOURCE_VALUE = 'fullPageSnapshot';

const escapeAttr = (value: string): string =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const createSnapshotFrameHtml = (): string =>
  `<iframe class="${SNAPSHOT_FRAME_CLASS}" data-role="${SNAPSHOT_FRAME_ROLE}" ${SNAPSHOT_SOURCE_ATTR}="${SNAPSHOT_SOURCE_VALUE}" ` +
  `sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" ` +
  `referrerpolicy="no-referrer-when-downgrade" loading="eager" ` +
  `style="width:100%;height:80vh;min-height:640px;border:1px solid hsl(var(--border));border-radius:12px;background:hsl(var(--background));display:block;" ` +
  `src="about:blank" title="Captured web page"></iframe>`;

export const createSnapshotBannerHtml = (args: {
  filename: string;
  bytes: number;
  sizeLabel: string;
  savedLabel: string;
  hintLabel: string;
}): string =>
  `<aside class="flowist-offline-snapshot-info" contenteditable="false" data-snapshot-filename="${escapeAttr(args.filename)}" data-snapshot-bytes="${args.bytes}">` +
    `<strong>📥 ${args.savedLabel}</strong>` +
    `<span>${escapeAttr(args.filename)} · ${escapeAttr(args.sizeLabel)}</span>` +
    `<em>${args.hintLabel}</em>` +
  `</aside>`;

export const hydrateSnapshotFrames = (root: HTMLElement | null, html: string): (() => void) => {
  if (!root || !html) return () => {};
  const frames = Array.from(
    root.querySelectorAll<HTMLIFrameElement>(
      `iframe.${SNAPSHOT_FRAME_CLASS}[data-role="${SNAPSHOT_FRAME_ROLE}"]`,
    ),
  );
  if (!frames.length) return () => {};

  const objectUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  frames.forEach((frame) => {
    frame.removeAttribute('srcdoc');
    frame.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    frame.setAttribute('loading', 'eager');
    frame.src = objectUrl;
  });

  return () => {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };
};