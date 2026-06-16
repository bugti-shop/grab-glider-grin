import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Eye, Sparkles, Trophy, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ALL_ACHIEVEMENTS, loadAchievementsData } from '@/utils/gamificationStorage';
import { loadTodoItems } from '@/utils/todoItemsStorage';
import { loadNotesFromDB } from '@/utils/noteStorage';
import { loadStreakData } from '@/utils/streakStorage';
import { getJourneyBadges, loadJourneyData, JourneyBadge, RARITY_CONFIG } from '@/utils/virtualJourneyStorage';

interface CertMilestone {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

export const ProfileAchievements = ({ onViewCertificate }: { onViewCertificate?: () => void }) => {
  const { t } = useTranslation();
  const [unlockedAchievements, setUnlockedAchievements] = useState<typeof ALL_ACHIEVEMENTS>([]);
  const [journeyBadges, setJourneyBadges] = useState<JourneyBadge[]>([]);
  const [journeyCompletionBadges, setJourneyCompletionBadges] = useState<JourneyBadge[]>([]);
  const [unlockedCerts, setUnlockedCerts] = useState<CertMilestone[]>([]);
  const [selectedItem, setSelectedItem] = useState<{ icon: string; name: string; description: string; rarity?: string; earnedAt?: string; type: 'achievement' | 'journey' } | null>(null);

  useEffect(() => {
    const load = async () => {
      const [achievements, tasks, notes, streak] = await Promise.all([
        loadAchievementsData(),
        loadTodoItems(),
        loadNotesFromDB(),
        loadStreakData('flowist_streak'),
      ]);

      // Only unlocked achievements
      const unlocked = ALL_ACHIEVEMENTS.filter(a => achievements.unlockedAchievements.includes(a.id));
      setUnlockedAchievements(unlocked);

      // Journey badges (only earned ones)
      const jData = loadJourneyData();
      const jBadges = getJourneyBadges(jData);
      // Split: milestone badges go to Badges, journey_complete go to Certificates
      setJourneyBadges(jBadges.filter(b => b.type === 'milestone'));

      // Only unlocked certificates
      const completed = tasks.filter(t => t.completed).length;
      const allCerts: CertMilestone[] = [
        { id: 'beginner', title: t('cert.beginner', 'Beginner'), description: t('cert.beginnerDesc', 'Complete 10 tasks & create 5 notes'), icon: '🌱', unlocked: completed >= 10 && notes.length >= 5 },
        { id: 'intermediate', title: t('cert.intermediate', 'Intermediate'), description: t('cert.intermediateDesc', 'Complete 50 tasks & 7-day streak'), icon: '⭐', unlocked: completed >= 50 && streak.longestStreak >= 7 },
        { id: 'advanced', title: t('cert.advanced', 'Advanced'), description: t('cert.advancedDesc', 'Complete 200 tasks & 30-day streak'), icon: '🏆', unlocked: completed >= 200 && streak.longestStreak >= 30 },
        { id: 'master', title: t('cert.master', 'Master'), description: t('cert.masterDesc', 'Complete 500 tasks & 100-day streak'), icon: '👑', unlocked: completed >= 500 && streak.longestStreak >= 100 },
      ];
      setUnlockedCerts(allCerts.filter(c => c.unlocked));

      // Journey completion badges go into certificates section
      setJourneyCompletionBadges(jBadges.filter(b => b.type === 'journey_complete'));
    };
    load();
  }, []);

  const hasAchievements = unlockedAchievements.length > 0;
  const hasJourneyBadges = journeyBadges.length > 0;
  const hasCerts = unlockedCerts.length > 0 || journeyCompletionBadges.length > 0;
  const hasAnything = hasAchievements || hasJourneyBadges || hasCerts;

  if (!hasAnything) {
    return (
      <div className="text-center py-8">
        <Trophy className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">{t('profile.noAchievementsYet', 'Complete tasks to earn badges & certificates!')}</p>
      </div>
    );
  }

  return (
    <>
      {/* Achievements Section */}
      {hasAchievements && (
        <>
          <h3 className="text-lg font-bold text-foreground mb-3">{t('profile.achievementsTitle', 'Achievements')}</h3>
          <div className="overflow-x-auto -mx-5 px-5 pb-2 scrollbar-hide">
            <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
              {unlockedAchievements.map((badge, i) => (
                <motion.button
                  key={badge.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => setSelectedItem({ icon: badge.icon, name: badge.name, description: badge.description, type: 'achievement' })}
                  className="flex flex-col items-center p-3 rounded-2xl border bg-card border-warning/30 transition-all relative overflow-hidden w-[90px] shrink-0"
                >
                  <motion.div className="absolute inset-0 bg-gradient-to-b from-warning/10 to-transparent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.1 }} />
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl relative bg-gradient-to-br from-warning/25 to-warning/10">
                    {badge.icon}
                    <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-warning" />
                  </div>
                  <p className="text-[10px] font-semibold mt-1.5 text-center leading-tight line-clamp-2 text-foreground">{badge.name}</p>
                  <div className="w-full mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 0.6, delay: i * 0.05 }} className="h-full rounded-full bg-gradient-to-r from-success to-success/70" />
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Journey Badges Section */}
      {hasJourneyBadges && (
        <>
          <h3 className="text-lg font-bold text-foreground mt-6 mb-3">{t('profile.journeyBadges', 'Journey Badges')}</h3>
          <div className="overflow-x-auto -mx-5 px-5 pb-2 scrollbar-hide">
            <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
              {journeyBadges.map((badge, i) => {
                const rarityConf = RARITY_CONFIG[badge.rarity];
                return (
                  <motion.button
                    key={badge.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => setSelectedItem({ icon: badge.icon, name: badge.label, description: badge.description, rarity: rarityConf.label, earnedAt: badge.earnedAt, type: 'journey' })}
                    className={cn(
                      "flex flex-col items-center p-3 rounded-2xl border bg-card transition-all relative overflow-hidden w-[100px] shrink-0",
                      badge.type === 'journey_complete' ? "border-warning/40" : "border-primary/30"
                    )}
                  >
                    <motion.div
                      className={cn("absolute inset-0", badge.type === 'journey_complete' ? "bg-gradient-to-b from-warning/10 to-transparent" : "bg-gradient-to-b from-primary/8 to-transparent")}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.1 }}
                    />
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center text-xl relative",
                      badge.type === 'journey_complete' ? "bg-gradient-to-br from-warning/25 to-warning/10" : "bg-gradient-to-br from-primary/20 to-primary/5"
                    )}>
                      {badge.icon}
                      {badge.type === 'journey_complete' && <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-warning" />}
                    </div>
                    <p className="text-[10px] font-semibold mt-1.5 text-center leading-tight line-clamp-2 text-foreground relative z-10">{badge.label}</p>
                    <p className={cn("text-[8px] font-medium mt-0.5 relative z-10", rarityConf.color)}>{rarityConf.label}</p>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Certificates Section */}
      {hasCerts && (
        <>
          <h3 className="text-lg font-bold text-foreground mt-6 mb-3">{t('profile.certificatesTitle', 'Certificates')}</h3>
          <div className="overflow-x-auto -mx-5 px-5 pb-2 scrollbar-hide">
            <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
              {unlockedCerts.map((cert, i) => (
                <motion.div
                  key={cert.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.06 }}
                  onClick={onViewCertificate}
                  className="flex flex-col items-center p-3 rounded-2xl border bg-card border-primary/20 cursor-pointer relative overflow-hidden w-[110px] shrink-0"
                >
                  <motion.div className="absolute inset-0 bg-gradient-to-b from-primary/8 to-transparent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0 relative z-10 bg-primary/10">
                    {cert.icon}
                  </div>
                  <p className="text-[11px] font-semibold mt-2 text-center relative z-10 text-foreground">{cert.title}</p>
                  <div className="mt-1 relative z-10">
                    <Eye className="h-3.5 w-3.5 text-primary mx-auto" />
                  </div>
                </motion.div>
              ))}
              {journeyCompletionBadges.map((badge, i) => {
                const rarityConf = RARITY_CONFIG[badge.rarity];
                return (
                  <motion.div
                    key={badge.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: (unlockedCerts.length + i) * 0.06 }}
                    onClick={() => setSelectedItem({ icon: badge.icon, name: badge.label, description: badge.description, rarity: rarityConf.label, earnedAt: badge.earnedAt, type: 'journey' })}
                    className="flex flex-col items-center p-3 rounded-2xl border bg-card border-warning/30 cursor-pointer relative overflow-hidden w-[110px] shrink-0"
                  >
                    <motion.div className="absolute inset-0 bg-gradient-to-b from-warning/10 to-transparent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0 relative z-10 bg-gradient-to-br from-warning/25 to-warning/10">
                      {badge.icon}
                      <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-warning" />
                    </div>
                    <p className="text-[11px] font-semibold mt-2 text-center relative z-10 text-foreground">{badge.label}</p>
                    <p className={cn("text-[8px] font-medium mt-0.5 relative z-10", rarityConf.color)}>{rarityConf.label}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm"
            onClick={() => setSelectedItem(null)}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-card rounded-t-3xl border-t border-border w-full max-w-md p-6 pb-10 text-center shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-6" />
              <motion.div className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl mx-auto mb-4 relative bg-gradient-to-br from-warning/25 to-warning/10 shadow-lg">
                <motion.span initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', delay: 0.2 }}>
                  {selectedItem.icon}
                </motion.span>
                {[...Array(6)].map((_, pi) => (
                  <motion.div
                    key={pi} className="absolute w-2 h-2 rounded-full bg-warning"
                    initial={{ opacity: 1, scale: 1 }}
                    animate={{ opacity: 0, scale: 0, x: Math.cos((pi * 60 * Math.PI) / 180) * 50, y: Math.sin((pi * 60 * Math.PI) / 180) * 50 }}
                    transition={{ duration: 0.8, delay: 0.3 + pi * 0.05 }}
                  />
                ))}
              </motion.div>
              <h3 className="text-xl font-bold text-foreground">{selectedItem.name}</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">{selectedItem.description}</p>
              {selectedItem.rarity && (
                <p className="text-xs font-semibold text-warning mt-2">{selectedItem.rarity}</p>
              )}
              {selectedItem.earnedAt && (
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(selectedItem.earnedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
              <div className="mt-5 inline-block px-4 py-1.5 rounded-full text-xs font-semibold bg-success/20 text-success">
                ✅ {t('profile.badgeUnlocked', 'Unlocked')}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
