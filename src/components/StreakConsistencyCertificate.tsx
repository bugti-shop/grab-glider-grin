import { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { m as motion } from 'framer-motion';
import { Share2, Edit3, Check, Copy, Download } from 'lucide-react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { triggerHaptic } from '@/utils/haptics';
import { shareImageBlob } from '@/utils/shareImage';

const QRCodeSVG = lazy(() => import('qrcode.react').then(m => ({ default: m.QRCodeSVG })));

const exportElementToBlob = async (element: HTMLElement): Promise<Blob | null> => {
  const html2canvas = (await import('html2canvas')).default;
  const canvas = await html2canvas(element, {
    scale: 4,
    useCORS: true,
    backgroundColor: null,
    logging: false,
  });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
};

interface StreakConsistencyCertificateProps {
  currentStreak: number;
  totalCompletions: number;
  longestStreak: number;
}

const getShareText = (streak: number, totalTasks: number, userName: string) => {
  const lines = [
    `🔥 I'm on a ${streak}-${streak === 1 ? 'day' : 'days'} productivity streak!`,
    '',
    `✅ ${totalTasks} tasks completed with consistency.`,
    `💪 Every day counts!`,
  ];
  if (userName) lines.push('', `— ${userName}`);
  lines.push('', 'Track your productivity with Flowist 👇', 'https://onelink.to/9xy8rz');
  return lines.join('\n');
};

const getStreakColor = (_streak: number) => {
  return { bg: 'linear-gradient(135deg, #f98e40, #f87415)', accent: '#f87415', glow: 'rgba(248, 116, 21, 0.4)' };
};

export const StreakConsistencyCertificate = ({ currentStreak, totalCompletions, longestStreak }: StreakConsistencyCertificateProps) => {
  const { t } = useTranslation();
  const { profile } = useUserProfile();
  const cardRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [cardName, setCardName] = useState(profile.name || '');
  const [copiedText, setCopiedText] = useState(false);
  const [cardWidth, setCardWidth] = useState(360);

  useEffect(() => {
    if (!cardName && profile.name) setCardName(profile.name);
  }, [profile.name]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setCardWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Scale factor: 360px baseline; clamp between 0.82 and 1.4
  const scale = Math.max(0.82, Math.min(1.4, cardWidth / 360));
  const s = (n: number) => Math.round(n * scale);

  const colors = getStreakColor(currentStreak);
  const displayName = cardName.trim();


  const handleShare = useCallback(async () => {
    setIsSharing(true);
    triggerHaptic('medium').catch(() => {});

    try {
      const element = cardRef.current;
      if (!element) return;

      // Temporarily adjust positions for export
      const introText = element.querySelector('[data-streak-intro]') as HTMLElement | null;
      const streakNum = element.querySelector('[data-streak-number]') as HTMLElement | null;
      const streakLabel = element.querySelector('[data-streak-label]') as HTMLElement | null;
      const origIntroMargin = introText?.style.marginTop;
      const origNumMargin = streakNum?.style.marginTop;
      const origLabelMargin = streakLabel?.style.marginTop;
      if (introText) introText.style.marginTop = '-13px';
      if (streakNum) streakNum.style.marginTop = '-12px';
      if (streakLabel) streakLabel.style.marginTop = '13px';

      const blob = await exportElementToBlob(element);

      // Restore original positions
      if (introText) introText.style.marginTop = origIntroMargin || '';
      if (streakNum) streakNum.style.marginTop = origNumMargin || '';
      if (streakLabel) streakLabel.style.marginTop = origLabelMargin || '';
      if (!blob) return;

      await shareImageBlob({
        blob,
        fileName: `flowist-streak-${currentStreak}.png`,
        title: `${currentStreak} Day Streak!`,
        text: getShareText(currentStreak, totalCompletions, displayName),
        dialogTitle: 'Share Streak',
      });
    } catch (e) {
      console.error('[StreakCert] Share failed:', e);
    } finally {
      setIsSharing(false);
    }
  }, [currentStreak, totalCompletions, longestStreak, displayName]);

  const handleCopyText = useCallback(async () => {
    const text = getShareText(currentStreak, totalCompletions, displayName);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedText(true);
    triggerHaptic('light').catch(() => {});
    setTimeout(() => setCopiedText(false), 2000);
  }, [currentStreak, totalCompletions, displayName]);

  const [isDownloading, setIsDownloading] = useState(false);
  const handleDownloadPdf = useCallback(async () => {
    setIsDownloading(true);
    triggerHaptic('medium').catch(() => {});
    try {
      const element = cardRef.current;
      if (!element) return;

      // Match share-time layout tweaks
      const introText = element.querySelector('[data-streak-intro]') as HTMLElement | null;
      const streakNum = element.querySelector('[data-streak-number]') as HTMLElement | null;
      const streakLabel = element.querySelector('[data-streak-label]') as HTMLElement | null;
      const origIntroMargin = introText?.style.marginTop;
      const origNumMargin = streakNum?.style.marginTop;
      const origLabelMargin = streakLabel?.style.marginTop;
      if (introText) introText.style.marginTop = '-13px';
      if (streakNum) streakNum.style.marginTop = '-12px';
      if (streakLabel) streakLabel.style.marginTop = '13px';

      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(element, {
        scale: 4,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      if (introText) introText.style.marginTop = origIntroMargin || '';
      if (streakNum) streakNum.style.marginTop = origNumMargin || '';
      if (streakLabel) streakLabel.style.marginTop = origLabelMargin || '';

      const imgData = canvas.toDataURL('image/png', 1.0);
      const { jsPDF } = await import('jspdf');

      // A4 portrait in mm
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;

      const ratio = canvas.width / canvas.height;
      let drawW = maxW;
      let drawH = drawW / ratio;
      if (drawH > maxH) {
        drawH = maxH;
        drawW = drawH * ratio;
      }
      const x = (pageW - drawW) / 2;
      const y = (pageH - drawH) / 2;

      pdf.addImage(imgData, 'PNG', x, y, drawW, drawH, undefined, 'FAST');

      // Footer
      pdf.setFontSize(9);
      pdf.setTextColor(120);
      pdf.text('Flowist — Notepad & To Do List', pageW / 2, pageH - 8, { align: 'center' });

      const fileName = `flowist-streak-${currentStreak}-days.pdf`;

      // Try native share on mobile (Capacitor) if available; otherwise download
      const blob = pdf.output('blob');
      try {
        const anyNav = navigator as any;
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (anyNav.canShare && anyNav.canShare({ files: [file] })) {
          await anyNav.share({ files: [file], title: 'Flowist Streak' });
        } else {
          pdf.save(fileName);
        }
      } catch {
        pdf.save(fileName);
      }
    } catch (e) {
      console.error('[StreakCert] PDF download failed:', e);
    } finally {
      setIsDownloading(false);
    }
  }, [currentStreak]);


  return (
    <div className="space-y-3" ref={wrapRef}>
      {/* The shareable card */}
      <div
        ref={cardRef}
        style={{
          background: colors.bg,
          borderRadius: 20,
          padding: `${s(36)}px ${s(28)}px ${s(32)}px`,
          position: 'relative',
          overflow: 'hidden',
          minHeight: s(340),
        }}
      >
        {/* Decorative glow circles */}
        <div style={{
          position: 'absolute', top: -40, right: -40,
          width: s(180), height: s(180), borderRadius: '50%',
          background: `radial-gradient(circle, ${colors.glow}30, transparent 70%)`,
        }} />
        <div style={{
          position: 'absolute', bottom: -30, left: -30,
          width: s(120), height: s(120), borderRadius: '50%',
          background: `radial-gradient(circle, ${colors.glow}20, transparent 70%)`,
        }} />

        {/* "I'm on a" text */}
        <p data-streak-intro style={{
          color: '#ffffffdd',
          fontSize: s(22),
          fontWeight: 700,
          margin: 0,
          lineHeight: 1.3,
          position: 'relative',
          zIndex: 1,
        }}>
          I'm on a
        </p>

        {/* Big streak number */}
        <p data-streak-number style={{
          color: '#ffffff',
          fontSize: s(currentStreak >= 10000 ? 36 : currentStreak >= 1000 ? 42 : 48),
          fontWeight: 900,
          margin: '0 0 2px',
          lineHeight: 1,
          position: 'relative',
          zIndex: 1,
          textShadow: `0 4px 20px ${colors.glow}`,
          textAlign: 'left',
        }}>
          {currentStreak.toLocaleString()}
        </p>

        {/* "day/days productivity streak!" */}
        <p data-streak-label style={{
          color: '#ffffffdd',
          fontSize: s(22),
          fontWeight: 700,
          margin: 0,
          lineHeight: 1.3,
          position: 'relative',
          zIndex: 1,
        }}>
          {currentStreak === 1 ? 'day' : 'days'} productivity<br />streak!
        </p>

        {/* User name */}
        {displayName && (
          <p style={{
            color: '#ffffffbb',
            fontSize: s(13),
            fontWeight: 600,
            marginTop: s(12),
            position: 'relative',
            zIndex: 1,
            maxWidth: '60%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {displayName}
          </p>
        )}

        {/* Bottom row: stats only */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: s(16),
          marginTop: s(28),
          position: 'relative',
          zIndex: 1,
        }}>
          <div style={{ display: 'flex', gap: s(24), flexShrink: 0 }}>
            <div>
              <p style={{ color: '#ffffff', fontSize: s(22), fontWeight: 800, margin: 0, lineHeight: 1.1 }}>{totalCompletions}</p>
              <p style={{ color: '#ffffffaa', fontSize: s(11), margin: `${s(4)}px 0 0`, fontWeight: 500 }}>Tasks Done</p>
            </div>
            <div>
              <p style={{ color: '#ffffff', fontSize: s(22), fontWeight: 800, margin: 0, lineHeight: 1.1 }}>{longestStreak}</p>
              <p style={{ color: '#ffffffaa', fontSize: s(11), margin: `${s(4)}px 0 0`, fontWeight: 500 }}>Best Streak</p>
            </div>
          </div>
        </div>

        {/* Flame icon — moved up, aligned right next to the big streak number */}
        <div style={{
          position: 'absolute',
          top: s(60),
          left: s(28) + s(currentStreak >= 10000 ? 36 : currentStreak >= 1000 ? 42 : 48) * String(currentStreak).length * 0.62 + s(8),
          opacity: 0.9,
          zIndex: 1,
          pointerEvents: 'none',
        }}>
          <svg width={s(56)} height={s(72)} viewBox="0 0 24 24" fill="white" style={{ opacity: 0.85 }}>
            <path d="M12 23c-3.866 0-7-3.134-7-7 0-3.866 4-9 7-13 3 4 7 9.134 7 13 0 3.866-3.134 7-7 7z" />
          </svg>
        </div>

        {/* QR + Flowist branding — small, right side */}
        <div style={{
          position: 'absolute',
          right: s(20),
          bottom: s(20),
          display: 'flex',
          alignItems: 'center',
          gap: s(8),
          zIndex: 2,
        }}>
          <Suspense fallback={null}>
            {(() => {
              const qrSize = Math.max(52, Math.min(72, s(48)));
              const quietZone = Math.max(6, Math.round(qrSize * 0.1));
              return (
                <div style={{
                  background: '#ffffff',
                  borderRadius: 8,
                  padding: quietZone,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                }}>
                  <QRCodeSVG
                    value="https://onelink.to/9xy8rz"
                    size={qrSize}
                    level="H"
                    bgColor="#ffffff"
                    fgColor="#000000"
                    marginSize={0}
                  />
                </div>
              );
            })()}
          </Suspense>
          <div>
            <p style={{ color: '#ffffffee', fontSize: s(11), fontWeight: 700, margin: 0 }}>Flowist</p>
            <p style={{ color: '#ffffff99', fontSize: s(8), margin: `${s(2)}px 0 0` }}>Notepad & To Do List</p>
          </div>
        </div>

      </div>


      {/* Name input */}
      <div className="bg-card border rounded-xl p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Your Name</span>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="text-xs text-primary flex items-center gap-1"
          >
            <Edit3 className="h-3 w-3" />
            {isEditing ? 'Done' : 'Edit'}
          </button>
        </div>
        {isEditing ? (
          <input
            type="text"
            value={cardName}
            onChange={(e) => setCardName(e.target.value)}
            placeholder={t('common.enterYourName', 'Enter your name')}
            maxLength={40}
            autoFocus
            className="w-full text-sm bg-muted rounded-lg px-3 py-2 border border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        ) : (
          <p className="text-sm font-medium truncate">{displayName || t('common.tapEditName', 'Tap Edit to add your name')}</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleShare}
          disabled={isSharing}
          className="flex-1 min-w-[120px] bg-primary text-primary-foreground rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSharing ? (
            <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          {isSharing ? 'Exporting...' : 'Share'}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleDownloadPdf}
          disabled={isDownloading}
          className="bg-card border rounded-xl px-4 py-3 text-sm flex items-center gap-2 disabled:opacity-50"
        >
          {isDownloading ? (
            <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          ) : (
            <Download className="h-4 w-4 text-muted-foreground" />
          )}
          {isDownloading ? 'Preparing...' : 'PDF'}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleCopyText}
          className="bg-card border rounded-xl px-4 py-3 text-sm flex items-center gap-2"
        >
          {copiedText ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
          {copiedText ? 'Copied!' : 'Copy'}
        </motion.button>
      </div>
    </div>
  );
};
