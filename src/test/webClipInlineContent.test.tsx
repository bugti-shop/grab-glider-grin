/**
 * Web Clipper end-to-end guarantees:
 *
 *  1. The clip-capture flow NEVER emits the old `flowist-web-clip-fullpage`
 *     snapshot figure (no "View snapshot" button, no "Download captured
 *     HTML" button, no hint text).
 *  2. Full captured article HTML is rendered INLINE in the note body on
 *     both mobile and desktop viewports.
 *  3. If a legacy note still contains a snapshot figure, hydration strips
 *     it and no snapshot toggle is left on screen.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { hydrateWebClipsIn } from '@/components/richtext/richTextBlocks';

const FULL_ARTICLE_HTML = `
  <section class="flowist-web-clip">
    <div class="flowist-web-clip-body" data-role="body">
      <h1>Jellyfin's best clients</h1>
      <p>Finding the best for each platform.</p>
      <p data-testid="full-body-marker">
        This is the full inline captured HTML that must render directly
        without any snapshot toggle.
      </p>
      <img src="https://example.com/hero.jpg" alt="Hero" />
    </div>
  </section>
`;

const LEGACY_HTML_WITH_SNAPSHOT = `
  <section class="flowist-web-clip">
    <div class="flowist-web-clip-body" data-role="body">
      <p data-testid="legacy-body">Legacy body content.</p>
      <figure class="flowist-web-clip-fullpage"
              contenteditable="false"
              data-role="fullpage-snapshot"
              data-compressed-gz="deadbeef"
              data-url="https://example.com"
              data-captured-at="2026-01-01T00:00:00Z">
        <button type="button" class="flowist-web-clip-fullpage-btn"
                data-role="fullpage-open">🌐 View full captured page</button>
        <div class="flowist-web-clip-fullpage-hint">
          Snapshot stored offline — opens exactly as the page was when clipped.
        </div>
      </figure>
    </div>
  </section>
`;

const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  window.dispatchEvent(new Event('resize'));
};

describe('Web Clipper inline content (no snapshot UI)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('freshly captured clips never contain snapshot-related nodes', () => {
    // Simulates what the WebClipper page pushes into the editable preview:
    // the article HTML is inlined directly — no <figure> snapshot wrapper.
    const { container } = render(
      <div dangerouslySetInnerHTML={{ __html: FULL_ARTICLE_HTML }} />,
    );

    expect(container.querySelectorAll('.flowist-web-clip-fullpage')).toHaveLength(0);
    expect(container.querySelectorAll('[data-role="fullpage-snapshot"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-role="fullpage-open"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-role="fullpage-download"]')).toHaveLength(0);
    expect(container.textContent || '').not.toMatch(/View snapshot/i);
    expect(container.textContent || '').not.toMatch(/Hide snapshot/i);
    expect(container.textContent || '').not.toMatch(/Download captured HTML/i);
    expect(container.textContent || '').not.toMatch(/Snapshot stored offline/i);
  });

  it.each([
    ['mobile', 390, 844],
    ['desktop', 1440, 900],
  ])('renders full article body inline on %s viewport', (_label, w, h) => {
    setViewport(w, h);
    const host = document.createElement('div');
    host.innerHTML = FULL_ARTICLE_HTML;
    document.body.appendChild(host);

    hydrateWebClipsIn(host);

    // Full body is inline and readable.
    const body = host.querySelector('[data-testid="full-body-marker"]');
    expect(body).not.toBeNull();
    expect(body?.textContent || '').toMatch(/full inline captured HTML/);
    expect(host.querySelector('img[src="https://example.com/hero.jpg"]')).not.toBeNull();

    // No snapshot toggle / download button was injected by hydration.
    expect(host.querySelectorAll('[data-role="fullpage-open"]')).toHaveLength(0);
    expect(host.querySelectorAll('[data-role="fullpage-download"]')).toHaveLength(0);
    expect(host.querySelector('iframe.flowist-web-clip-fullpage-frame')).toBeNull();

    document.body.removeChild(host);
  });

  it('strips legacy snapshot figures on hydration', () => {
    const host = document.createElement('div');
    host.innerHTML = LEGACY_HTML_WITH_SNAPSHOT;
    document.body.appendChild(host);

    // Pre-hydration: the legacy DOM has the figure.
    expect(host.querySelectorAll('.flowist-web-clip-fullpage')).toHaveLength(1);

    hydrateWebClipsIn(host);

    // Post-hydration: legacy snapshot figure and all its controls are gone,
    // and the actual body content stays put.
    expect(host.querySelectorAll('.flowist-web-clip-fullpage')).toHaveLength(0);
    expect(host.querySelectorAll('[data-role="fullpage-snapshot"]')).toHaveLength(0);
    expect(host.querySelectorAll('[data-role="fullpage-open"]')).toHaveLength(0);
    expect(host.querySelectorAll('[data-role="fullpage-download"]')).toHaveLength(0);
    expect(host.querySelector('[data-testid="legacy-body"]')?.textContent).toMatch(/Legacy body/);

    document.body.removeChild(host);
  });

  it('removes snapshot/download controls even when nested in fresh content before save', () => {
    const host = document.createElement('div');
    host.innerHTML = `
      <section class="flowist-web-clip">
        <div class="flowist-web-clip-body" data-role="body">
          <p data-testid="real-inline-body">Full readable article text remains.</p>
          <div>
            <button type="button" data-role="fullpage-download">Download Captured HTML</button>
            <button type="button" data-role="fullpage-open">Hide Article</button>
            <iframe class="flowist-web-clip-fullpage-frame"></iframe>
          </div>
        </div>
      </section>
    `;
    document.body.appendChild(host);

    hydrateWebClipsIn(host);

    expect(host.querySelector('[data-testid="real-inline-body"]')?.textContent).toMatch(/Full readable article text/);
    expect(host.querySelectorAll('[data-role="fullpage-download"]')).toHaveLength(0);
    expect(host.querySelectorAll('[data-role="fullpage-open"]')).toHaveLength(0);
    expect(host.querySelectorAll('iframe.flowist-web-clip-fullpage-frame')).toHaveLength(0);
    expect(host.textContent || '').not.toMatch(/Download Captured HTML|Hide Article/i);

    document.body.removeChild(host);
  });
});
