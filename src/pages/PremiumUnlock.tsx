/**
 * Web-only premium unlock route: /mustafabugti890
 * Activates the admin bypass so all premium features become accessible.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setSetting } from '@/utils/settingsStorage';

const PremiumUnlock = () => {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        await setSetting('flowist_admin_bypass', true);
      } catch (e) {
        console.warn('PremiumUnlock: setSetting failed', e);
      }
      try {
        window.dispatchEvent(new Event('adminBypassActivated'));
      } catch {}
      setTimeout(() => navigate('/', { replace: true }), 600);
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-center px-6">
        <h1 className="text-2xl font-bold mb-2">Premium Unlocked</h1>
        <p className="text-sm text-muted-foreground">All premium features have been enabled on this device.</p>
      </div>
    </div>
  );
};

export default PremiumUnlock;
