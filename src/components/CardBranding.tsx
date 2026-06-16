/**
 * Shared branding and user profile components for all shareable cards.
 * Includes Flowist logo footer and user avatar + name strip.
 * 
 * IMPORTANT: All styles use inline CSS for html2canvas compatibility.
 * Do NOT use Tailwind classes here — they can break when rendering to image.
 */
import npdLogo from '@/assets/npd-reminder-logo.webp';

interface CardBrandingFooterProps {
  color?: string;
  showUserProfile?: boolean;
  userName?: string;
  userAvatar?: string;
}

/**
 * Combined footer: user profile line + Flowist branding
 * For use inside shareable card designs (html2canvas-friendly).
 */
export const CardBrandingFooter = ({
  color = 'hsl(0, 0%, 40%)',
  showUserProfile = true,
  userName,
  userAvatar,
}: CardBrandingFooterProps) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
    {showUserProfile && userName && (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {userAvatar ? (
          <img src={userAvatar} alt="" style={{ width: '16px', height: '16px', borderRadius: '50%', objectFit: 'cover' }} />
        ) : null}
        <span style={{ fontSize: '9px', fontWeight: 600, color }}>{userName}</span>
      </div>
    )}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
      <img src={npdLogo} alt="Flowist" style={{ width: '20px', height: '20px', borderRadius: '4px', objectFit: 'cover' }} />
      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color }}>
        Flowist • task manager
      </span>
    </div>
  </div>
);

/**
 * Large branding footer for Instagram Stories-sized share cards (1080×1920).
 */
export const CardBrandingFooterLarge = ({
  color = 'rgba(255,255,255,0.4)',
  userName,
  userAvatar,
}: { color?: string; userName?: string; userAvatar?: string }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginTop: '40px' }}>
    {userName && (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {userAvatar && (
          <img src={userAvatar} alt="" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
        )}
        <span style={{ fontSize: '26px', fontWeight: 600, color }}>{userName}</span>
      </div>
    )}
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <img src={npdLogo} alt="Flowist" style={{ width: '48px', height: '48px', borderRadius: '12px' }} />
      <span style={{ fontSize: '32px', fontWeight: 700, color, letterSpacing: '4px' }}>Flowist</span>
    </div>
  </div>
);
