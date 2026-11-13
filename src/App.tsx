import React,{ useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState } from 'react';
import { createAreaSuggestions } from './components/create/areaSuggestions';
import { Onboarding } from './components/onboarding/Onboarding';
import { PwaStatusBanner } from './components/pwa/PwaStatusAndInstallCard';
import { FloatingShell } from './components/shell/FloatingShell';
import { SessionSheet } from './components/today/SessionSheet';
import { TaskSheet } from './components/today/TaskSheet';
import { detectDeviceTimeZone,evaluateTimeZoneStatus,formatInstantInZone,todayLocalDateInZone } from './domain/temporal';
import { CalendarEvent,PlanuiDomainSnapshot,RecoverySnapshotRecord } from './domain/types';
import { PlanuiError } from './i18n/errorsUk';
import { UK_STRINGS } from './i18n/uk';
import { usePwaLifecycle } from './pwa/pwaController';
import { DestinationContextMap,ImplementedCreationActionKind,TabDestinationId,applyThemeAndAccessibilityToDocument,buildInitialCreationContext,createInitialDestinationContextMap,extractSubViewFromHash,formatHashForDestination,onTabTap,parseDestinationFromHash,updateDestinationContext } from './state/shellStore';
import { PlanuiRepositories } from './storage/repositories';
import { TaskLifecycleUndoToken } from './storage/repositoryTypes';
import { Toast } from './ui/feedback';
import { easings,ensureMotionRootAttribute,isReducedMotion,runInterruptibleAnimation,smoothScrollToTop,transitionCreation,tweens,wasRecentPopState } from './ui/motion';
import { FeedbackBanner } from './ui/primitives';
import { TodayWorkspaceView } from './views/TodayWorkspaceView';

import { CalendarWorkspaceView } from './views/CalendarWorkspaceView';
import { HabitsWorkspaceView } from './views/HabitsWorkspaceView';
import { MeWorkspaceView } from './views/MeWorkspaceView';
import { PlansView } from './views/PlansView';
const SharedEditorHost = React.lazy(() =>
  import('./components/editors/SharedEditorHost').then((m) => ({
    default: m.SharedEditorHost,
  }))
);

const repositories = new PlanuiRepositories();

export function App() {
  const detectedZone = detectDeviceTimeZone();
  const initialZone = detectedZone ?? 'UTC';
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const initialTodayDate = todayLocalDateInZone(initialZone, nowMs);

  const [activeDestination, setActiveDestination] =
    useState<TabDestinationId>(() =>
      typeof window !== 'undefined'
        ? parseDestinationFromHash(window.location.hash)
        : 'today'
    );

  const [isCalendarOpen, setIsCalendarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.location.hash.startsWith('#/calendar')
  );

  const [contexts, setContexts] = useState<DestinationContextMap>(() => {
    const map = createInitialDestinationContextMap(initialTodayDate);
    if (typeof window !== 'undefined') {
      const sub = extractSubViewFromHash(window.location.hash);
      if (sub) {
        map.me.subView = sub;
      }
      if (window.location.hash.startsWith('#/habits')) {
        map.today.mode = 'habits';
      }
    }
    return map;
  });

  const [snapshot, setSnapshot] = useState<PlanuiDomainSnapshot | null>(null);
  const [mediaBlobs, setMediaBlobs] = useState<Map<string, Uint8Array>>(
    () => new Map()
  );
  const [recoverySnapshots, setRecoverySnapshots] = useState<
    RecoverySnapshotRecord[]
  >([]);
  const [habitFilter, setHabitFilter] = useState<'active' | 'paused' | 'archived'>('active');
  const [habitOccurrence, setHabitOccurrence] = useState<{habitId: string; date: string} | null>(null);
  const [creationAreaId, setCreationAreaId] = useState<string | null>(null);
  const [sphereIntent, setSphereIntent] = useState<{ areaId?: string; review?: boolean; nonce: number }>();
  const [editorPrefill, setEditorPrefill] = useState<{ areaId?: string; targetTime?: string; targetDate?: string }>({});
  const [quickAdd, setQuickAdd] = useState(false);
  const [habitHistory,setHabitHistory]=useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  useEffect(() => { if (habitOccurrence && snapshot && !snapshot.habits.some(h => h.id === habitOccurrence.habitId)) setHabitOccurrence(null); }, [habitOccurrence, snapshot]);
  const [isLocalModalOpen, setIsLocalModalOpen] = useState(false);
  const [isSettingsConfirmationOpen, setIsSettingsConfirmationOpen] = useState(false);
  const [editorInitialAction, setEditorInitialAction] = useState<
    ImplementedCreationActionKind | undefined
  >(undefined);
  const [inspectedEvent, setInspectedEvent] = useState<CalendarEvent | null>(
    null
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastUndo, setToastUndo] = useState<(() => void) | undefined>(
    undefined
  );
  const [zoneNoticeMessage, setZoneNoticeMessage] = useState<string | null>(
    null
  );
  const [todayUndoToken, setTodayUndoToken] =
    useState<TaskLifecycleUndoToken | null>(null);
  const [midnightRolloverDate, setMidnightRolloverDate] = useState<
    string | null
  >(null);

  const [externalReplacement, setExternalReplacement] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const hydratedNextDayPrefRef = useRef(false);

  const reloadLocalData = useCallback(async () => {
    const { snapshot: snap, mediaBlobs: blobs } =
      await repositories.captureCoherentSnapshot();
    const recoveries = await repositories.listRecoverySnapshots();

    if (!hydratedNextDayPrefRef.current) {
      try {
        if (typeof window !== 'undefined') {
          if (window.localStorage.getItem('planui_text_scale_v6_reset') !== '1') {
            window.localStorage.setItem('planui_text_scale_v6_reset', '1');
            if (snap.settings.textScale !== 1 && snap.settings.textScale !== 'standard') {
              const resetSettings = {
                ...snap.settings,
                textScale: 1 as const,
                updatedAt: new Date().toISOString(),
                revision: snap.settings.revision + 1,
              };
              await repositories.saveSettings(resetSettings, snap.settings.revision);
              snap.settings = resetSettings;
            }
          }

        }
      } catch {
        // Ignore storage errors during startup reset
      }
    }

    setSnapshot(snap);
    setMediaBlobs(blobs);
    setRecoverySnapshots(recoveries);
    applyThemeAndAccessibilityToDocument(
      snap.settings.theme,
      snap.settings.reducedMotionOverride,
      snap.settings.textScale,
    );

    if (!hydratedNextDayPrefRef.current) {
      hydratedNextDayPrefRef.current = true;
      setContexts((prev) =>
        updateDestinationContext(prev, 'today', {
          nextDayCollapsed: Boolean(snap.settings.todayNextDayCollapsed),
          ...(!prev.today.hasInteraction ? { selectedDate: todayLocalDateInZone(snap.settings.timeZoneMode === 'manual' && snap.settings.manualTimeZone ? snap.settings.manualTimeZone : snap.settings.lastDetectedTimeZone, Date.now()) } : {}),
        })
      );
    }
  }, []);

  useEffect(() => {
    const reloadSafely = () => reloadLocalData().catch(error => {
      if (error instanceof PlanuiError && error.code === 'STALE_DB_GENERATION_CONFLICT') setExternalReplacement(true);
      else setStorageError(error instanceof PlanuiError ? error.message : 'Не вдалося прочитати локальні дані. Перезавантажте застосунок; дані не видалено.');
    });
    void reloadSafely();
    const unsubscribeTabSync = repositories.tabSync.subscribe((msg) => {
      if (msg.type === 'ENTITY_MUTATED' || msg.type === 'IMPORT_FINISHED') {
        const known = repositories.getKnownDbGeneration();
        if (known !== null && msg.dbGeneration !== known) {
          setExternalReplacement(true);
          return;
        }
        void reloadSafely();
      }
    });
    const unsubscribeWriteErr = repositories.subscribeStorageWriteErrors((msgUk) => {
      setToastMessage(msgUk);
    });
    return () => {
      unsubscribeTabSync();
      unsubscribeWriteErr();
    };
  }, [reloadLocalData]);

  const activeZone =
    snapshot?.settings.timeZoneMode === 'manual' &&
    snapshot.settings.manualTimeZone
      ? snapshot.settings.manualTimeZone
      : snapshot?.settings.lastDetectedTimeZone ?? initialZone;

  const actualTodayDate = useMemo(
    () => todayLocalDateInZone(activeZone, nowMs),
    [activeZone, nowMs]
  );

  const prevActualTodayRef = useRef<string>(actualTodayDate);

  // 6.3 Midnight transition: detect when actualTodayDate changes without ejecting user or forcing scroll jump
  useEffect(() => {
    const prevToday = prevActualTodayRef.current;
    if (prevToday !== actualTodayDate) {
      prevActualTodayRef.current = actualTodayDate;
      setMidnightRolloverDate(actualTodayDate);
    }
  }, [actualTodayDate]);

  
  const recheckDeviceTimeZone = useCallback(async () => {
    setNowMs(Date.now());
    if (!snapshot) return;
    const currentDeviceZone = detectDeviceTimeZone();
    const status = evaluateTimeZoneStatus(snapshot.settings, currentDeviceZone);
    if (status.requiresManualZoneChoice && status.explanationBannerUk) {
      setZoneNoticeMessage(status.explanationBannerUk);
      return;
    }
    if (
      status.zoneChangedInDeviceMode &&
      status.explanationBannerUk &&
      currentDeviceZone &&
      currentDeviceZone !== snapshot.settings.lastDetectedTimeZone
    ) {
      setZoneNoticeMessage(status.explanationBannerUk);
      const nextSettings = {
        ...snapshot.settings,
        lastDetectedTimeZone: currentDeviceZone,
        updatedAt: new Date().toISOString(),
        revision: snapshot.settings.revision + 1,
      };
      await repositories.saveSettings(nextSettings);
      setSnapshot((prev) =>
        prev ? { ...prev, settings: nextSettings } : prev
      );
    }
  }, [snapshot]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void recheckDeviceTimeZone();
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [recheckDeviceTimeZone]);

  // Follow system color-scheme changes only when theme === 'system' (3.3)
  useEffect(() => {
    if (!snapshot || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (snapshot.settings.theme === 'system') {
        applyThemeAndAccessibilityToDocument(
          snapshot.settings.theme,
          snapshot.settings.reducedMotionOverride,
          snapshot.settings.textScale,
        );
      }
    };
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [snapshot]);

  // Synchronize URL hash and fresh-start navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/calendar')) {
        setContexts((prev) =>
          updateDestinationContext(prev, 'calendar', {
            selectedDate: actualTodayDate,
            mode: 'month',
            secondaryFilter: 'all',
            scrollTop: 0,
          })
        );
        setIsCalendarOpen(true);
        return;
      }
      const nextDest = parseDestinationFromHash(hash);
      const subView = extractSubViewFromHash(hash);
      if (subView) {
        setContexts((oldMap) =>
          updateDestinationContext(oldMap, 'me', { subView })
        );
      } else if (nextDest === 'me' && hash === '#/me') {
        setContexts((oldMap) =>
          updateDestinationContext(oldMap, 'me', { subView: 'overview' })
        );
      }
      setActiveDestination(nextDest);

      if (hash.startsWith('#/plans')) {
        window.history.replaceState(null, '', '#/directions');
      } else if (hash.startsWith('#/habits')) {
        setContexts((prev) =>
          updateDestinationContext(prev, 'today', { mode: 'habits' })
        );
        window.history.replaceState(null, '', '#/today');
      } else if (hash.startsWith('#/diary') || hash.startsWith('#/records')) {
        window.history.replaceState(null, '', '#/me');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [actualTodayDate]);

  const tabContainerRef = useRef<HTMLDivElement>(null);
  const prevDestinationRef = useRef<TabDestinationId>(activeDestination);
  const didInitialFadeRef = useRef(false);

  // Fresh start on destination change: always scroll to top and animate stage
  useLayoutEffect(() => {
    const el = tabContainerRef.current;
    if (!el) return;
    ensureMotionRootAttribute(el);

    if (!didInitialFadeRef.current && snapshot) {
      didInitialFadeRef.current = true;
      runInterruptibleAnimation(el, [{ opacity: 0 }, { opacity: 1 }], {
        durationMs: isReducedMotion() ? tweens.reduced : 160,
        easing: easings.out,
        root: el,
        willChange: 'opacity',
      });
      return;
    }

    if (prevDestinationRef.current !== activeDestination) {
      prevDestinationRef.current = activeDestination;
      window.scrollTo({
        top: 0,
        behavior: 'instant' as ScrollBehavior,
      });
      if (!wasRecentPopState()) {
        if (isReducedMotion()) {
          runInterruptibleAnimation(el, [{ opacity: 0 }, { opacity: 1 }], {
            durationMs: tweens.reduced,
            easing: easings.out,
            root: el,
            willChange: 'opacity',
          });
        } else {
          runInterruptibleAnimation(
            el,
            [
              { opacity: 0, transform: 'translate3d(0, 6px, 0)' },
              { opacity: 1, transform: 'translate3d(0, 0, 0)' },
            ],
            {
              durationMs: 200,
              easing: easings.out,
              root: el,
              willChange: 'transform, opacity',
            }
          );
        }
      }
    }
  }, [activeDestination, Boolean(snapshot), contexts.today.mode]);

  const resetTabToHome = useCallback(
    (tab: TabDestinationId, smoothScroll = false) => {
      const fresh = createInitialDestinationContextMap(actualTodayDate);
      if (tab === 'today') {
        setHabitHistory(false);
        setContexts((prev) =>
          updateDestinationContext(prev, 'today', {
            ...fresh.today,
            nextDayCollapsed: Boolean(snapshot?.settings.todayNextDayCollapsed),
          })
        );
      } else if (tab === 'directions') {
        setContexts((prev) =>
          updateDestinationContext(prev, 'directions', fresh.directions)
        );
      } else if (tab === 'me') {
        setContexts((prev) => updateDestinationContext(prev, 'me', fresh.me));
        if (typeof window !== 'undefined' && window.location.hash !== '#/me') {
          window.history.replaceState(null, '', '#/me');
        }
      }
      if (typeof window !== 'undefined') {
        if (smoothScroll) {
          smoothScrollToTop(300);
        } else {
          window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        }
      }
    },
    [actualTodayDate, snapshot?.settings.todayNextDayCollapsed]
  );

  const switchToTab = useCallback(
    (dest: TabDestinationId) => {
      resetTabToHome(dest, false);
      setActiveDestination(dest);
      if (typeof window !== 'undefined') {
        const targetHash = formatHashForDestination(dest);
        if (window.location.hash !== targetHash) {
          window.history.replaceState(null, '', targetHash);
        }
      }
    },
    [resetTabToHome]
  );

  const handleSelectDestination = (dest: TabDestinationId) => {
    onTabTap(dest, {
      current: activeDestination,
      contexts,
      actualTodayDate,
      extraSubScreenOpen: activeDestination === 'today' && habitHistory,
      onResetCurrentTabToHome: (tab) => resetTabToHome(tab, true),
      onSwitchTab: switchToTab,
    });
  };

  const openCalendarWindow = useCallback(
    (initialMode: 'month' | 'week' = 'month') => {
      setContexts((prev) =>
        updateDestinationContext(prev, 'calendar', {
          selectedDate: actualTodayDate,
          mode: initialMode,
          secondaryFilter: 'all',
          scrollTop: 0,
        })
      );
      setIsCalendarOpen(true);
    },
    [actualTodayDate]
  );

  const handleToggleCalendarWindow = useCallback(() => {
    if (isCalendarOpen) {
      setIsCalendarOpen(false);
    } else {
      openCalendarWindow('month');
    }
  }, [isCalendarOpen, openCalendarWindow]);

  const openGlobalCreation = (
    preferredAction?: ImplementedCreationActionKind,
    prefill: { areaId?: string; targetTime?: string; targetDate?: string } = {}
  ) => {
    setEditorPrefill({ ...(activeDestination === 'me' && creationAreaId ? { areaId: creationAreaId } : {}), ...prefill });
    setQuickAdd(false);
    setEditorInitialAction(preferredAction);
    setIsEditorOpen(true);
  };

  const handleToggleTaskState = async (taskId: string) => {
    if (!snapshot) return;
    const existing = snapshot.tasks.find((t) => t.id === taskId);
    if (!existing) return;
    const nowIso = new Date().toISOString();
    try {
      if (existing.state === 'open') {
        const res = await repositories.completeTaskTransactionally(
          taskId,
          nowIso,
          existing.revision
        );
        setTodayUndoToken(res.undoToken);
      } else {
        setTodayUndoToken(null);
        await repositories.reopenTaskTransactionally(
          taskId,
          nowIso,
          existing.revision
        );
      }
      await reloadLocalData();
    } catch (err) {
      setToastMessage(
        err instanceof Error ? err.message : 'Не вдалося оновити стан справи.'
      );
    }
  };

  const handleUndoTodayLifecycle = async () => {
    if (!todayUndoToken) return;
    try {
      const res = await repositories.undoTaskLifecycleTransactionally(
        todayUndoToken,
        new Date().toISOString(),
        activeZone
      );
      setTodayUndoToken(null);
      await reloadLocalData();
      if (
        res.conflictReport.hasConflicts &&
        res.conflictReport.warningMessageUk
      ) {
        setToastMessage(res.conflictReport.warningMessageUk);
      } else {
        setToastMessage(UK_STRINGS.scheduling.undoSuccessFeedback);
      }
    } catch (err) {
      setTodayUndoToken(null);
      setToastMessage(
        err instanceof Error
          ? err.message
          : 'Не вдалося скасувати дію життєвого циклу справи.'
      );
    }
  };

  const handleCancelEvent = async (eventId: string, revision: number) => {
    try {
      await repositories.cancelCalendarEventTransactionally(
        eventId,
        new Date().toISOString(),
        revision
      );
      await reloadLocalData();
      setToastMessage('Подію скасовано.');
    } catch (err) {
      setToastMessage(
        err instanceof Error ? err.message : 'Не вдалося скасувати подію.'
      );
    }
  };

  const handleToggleNextDayCollapsed = async (nextCollapsed: boolean) => {
    setContexts((prev) =>
      updateDestinationContext(prev, 'today', {
        nextDayCollapsed: nextCollapsed,
      })
    );
    if (snapshot) {
      const nextSettings = {
        ...snapshot.settings,
        todayNextDayCollapsed: nextCollapsed,
        updatedAt: new Date().toISOString(),
        revision: snapshot.settings.revision + 1,
      };
      await repositories.saveSettings(nextSettings);
      setSnapshot((prev) =>
        prev ? { ...prev, settings: nextSettings } : prev
      );
    }
  };

  // Memoized selector slices so a single change doesn't re-render whole screens
  const folders = useMemo(() => snapshot?.folders ?? [], [snapshot?.folders]);
  const goals = useMemo(() => snapshot?.goals ?? [], [snapshot?.goals]);
  const projects = useMemo(() => snapshot?.projects ?? [], [snapshot?.projects]);
  const stages = useMemo(() => snapshot?.stages ?? [], [snapshot?.stages]);
  const tasks = useMemo(() => snapshot?.tasks ?? [], [snapshot?.tasks]);
  const reservations = useMemo(() => snapshot?.reservations ?? [], [snapshot?.reservations]);
  const events = useMemo(() => snapshot?.events ?? [], [snapshot?.events]);
  const shiftTemplates = useMemo(() => snapshot?.shiftTemplates ?? [], [snapshot?.shiftTemplates]);
  const dayOffAnnotations = useMemo(() => snapshot?.dayOffAnnotations ?? [], [snapshot?.dayOffAnnotations]);
  const habits = useMemo(() => snapshot?.habits ?? [], [snapshot?.habits]);
  const habitEntries = useMemo(() => snapshot?.habitEntries ?? [], [snapshot?.habitEntries]);
  const personalRecords = useMemo(() => snapshot?.personalRecords ?? [], [snapshot?.personalRecords]);
  const lifeAreaQuestions = useMemo(() => snapshot?.lifeAreaQuestions ?? [], [snapshot?.lifeAreaQuestions]);
  const creationAreaSuggestions = useMemo(() => snapshot ? createAreaSuggestions(snapshot, new Date(nowMs).toISOString(), activeZone) : [], [snapshot, nowMs, activeZone]);
  const lifeAreaAssessments = useMemo(() => snapshot?.lifeAreaAssessments ?? [], [snapshot?.lifeAreaAssessments]);
  const inspirationItems = useMemo(() => snapshot?.inspirationItems ?? [], [snapshot?.inspirationItems]);
  const mediaMeta = useMemo(() => snapshot?.mediaMeta ?? [], [snapshot?.mediaMeta]);
  const wishlistCategories = useMemo(() => snapshot?.wishlistCategories ?? [], [snapshot?.wishlistCategories]);
  const wishes = useMemo(() => snapshot?.wishes ?? [], [snapshot?.wishes]);
  const roadmapSource = useMemo(
    () => ({ folders, goals, projects, stages, tasks }),
    [folders, goals, projects, stages, tasks]
  );

  const calendarCtx = contexts.calendar;
  const directionsCtx = contexts.directions ?? contexts.plans;
  const todayCtx = contexts.today;
  const meCtx = contexts.me;

  const anyModalOpen =
    isEditorOpen ||
    Boolean(habitOccurrence) ||
    isLocalModalOpen ||
    isSettingsConfirmationOpen ||
    Boolean(inspectedEvent);
  // Inline personal/review forms are conservatively protected until leaving that view.
  const inlineEditorView = activeDestination === 'me' && ['records', 'life_areas'].includes(contexts.me.subView);
  const pwaState = usePwaLifecycle(anyModalOpen || inlineEditorView ? ['shared_modal_editor'] : []);

  const calendarOverlayContent =
    snapshot && isCalendarOpen ? (
      <div className="space-y-4" data-testid="destination-view-calendar">
        <React.Suspense fallback={null}>
          <CalendarWorkspaceView
            roadmapSource={roadmapSource}
            settings={snapshot.settings}
            selectedDate={calendarCtx.selectedDate}
            actualTodayDate={actualTodayDate}
            mode={calendarCtx.mode}
            secondaryFilter={calendarCtx.secondaryFilter ?? 'all'}
            displayZone={activeZone}
            nowMs={nowMs}
            events={events}
            reservations={reservations}
            tasks={tasks}
            dayOffAnnotations={dayOffAnnotations}
            lifeAreaQuestions={lifeAreaQuestions}
            lifeAreaAssessments={lifeAreaAssessments}
            onInspectHabitSession={(session) => {
              if (session.habitOccurrence) {
                setHabitOccurrence({
                  habitId: session.habitOccurrence.habitId,
                  date: session.habitOccurrence.localDate,
                });
              }
            }}
            shiftTemplates={shiftTemplates}
            repositories={repositories}
            habits={habits}
            habitEntries={habitEntries}
            onPlanHabit={(habitId, date) =>
              setHabitOccurrence({ habitId, date })
            }
            onChangeMode={(mode) =>
              setContexts((prev) =>
                updateDestinationContext(prev, 'calendar', { mode })
              )
            }
            onChangeSecondaryFilter={(secondaryFilter) =>
              setContexts((prev) =>
                updateDestinationContext(prev, 'calendar', {
                  secondaryFilter,
                })
              )
            }
            onSelectDate={(selectedDate) =>
              setContexts((prev) => {
                const nextCal = updateDestinationContext(prev, 'calendar', { selectedDate });
                return updateDestinationContext(nextCal, 'today', { selectedDate });
              })
            }
            onToggleTaskState={handleToggleTaskState}
            onCancelEvent={handleCancelEvent}
            onInspectEvent={(ev) => setInspectedEvent(ev)}
            onOpenGapPicker={gap => { const local = formatInstantInZone(gap.startInstant, activeZone); openGlobalCreation('task', { targetDate: local.localDate, targetTime: local.localTime.slice(0, 5) }); }}
            onOpenGlobalCreation={openGlobalCreation}
            onDataChanged={async (msg) => {
              await reloadLocalData();
              if (msg) setToastMessage(msg);
            }}
            onModalStateChange={setIsLocalModalOpen}
          />
        </React.Suspense>
      </div>
    ) : null;

  return (
    <>
      <Onboarding />
      <FloatingShell
        activeDestination={activeDestination}
        todayMode={todayCtx.mode ?? 'day'}
        directionsSubMode={directionsCtx.subMode ?? 'projects'}
        meSubView={meCtx.subView}
        calendarMode={calendarCtx.mode}
        isCalendarOpen={isCalendarOpen}
        habitsEnabled={true}
        wishlistEnabled={true}
        onSelectDestination={handleSelectDestination}
        onChangeTodayMode={(mode) => {
          setHabitHistory(false);
          setContexts((prev) =>
            updateDestinationContext(prev, 'today', {
              mode,
              hasInteraction: true,
              scrollTop: 0,
            })
          );
          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
          }
        }}
        onChangeDirectionsSubMode={(subMode) => {
          setContexts((prev) =>
            updateDestinationContext(prev, 'directions', {
              subMode,
              activeFolderId: null,
              activeProjectId: null,
              activeGoalId: null,
              searchQuery: '',
              scrollTop: 0,
            })
          );
          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
          }
        }}
        onChangeMeSubView={(subView) => {
          setContexts((prev) =>
            updateDestinationContext(prev, 'me', {
              subView,
              activeWishlistCategoryId: null,
              scrollTop: 0,
            })
          );
          if (typeof window !== 'undefined') {
            const targetHash =
              subView === 'overview' ? '#/me' : `#/${subView}`;
            if (window.location.hash !== targetHash) {
              window.history.replaceState(null, '', targetHash);
            }
            window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
          }
        }}
        onChangeCalendarMode={(mode) => {
          setContexts((prev) =>
            updateDestinationContext(prev, 'calendar', { mode })
          );
        }}
        onToggleCalendarWindow={handleToggleCalendarWindow}
        onCloseCalendarWindow={() => setIsCalendarOpen(false)}
        calendarWindowContent={calendarOverlayContent}
        onCenterCreateClick={() => {
          if (isEditorOpen) {
            transitionCreation(() => setIsEditorOpen(false));
          } else {
            transitionCreation(() => {
              openGlobalCreation(undefined);
            });
          }
        }}
        onCenterCreateLongPress={() => {
          const firstType: ImplementedCreationActionKind = isCalendarOpen
            ? 'event'
            : activeDestination === 'directions'
            ? (contexts.directions.subMode ?? 'projects') === 'goals'
              ? 'goal'
              : 'folder'
            : activeDestination === 'me'
            ? contexts.me.subView === 'wishlist'
              ? 'wish'
              : 'task'
            : 'task';
          transitionCreation(() => {
            openGlobalCreation(firstType);
            setQuickAdd(true);
          });
        }}
        isEditorOpen={isEditorOpen}
      >
        <div ref={tabContainerRef} data-motion="idle" data-ui="tab-stage" className="space-y-6">
          {storageError && <FeedbackBanner tone="error" message={storageError} />}
          {externalReplacement && <div role="alert" className="rounded-2xl border border-amber-400 p-4 space-y-3">
            <p>В іншій вкладці замінено локальні дані. Незбережене введення залишено на екрані, але збереження заблоковано. Скопіюйте потрібний текст перед перезавантаженням.</p>
            <button type="button" className="ui-pill px-4 py-2 text-xs" onClick={() => {
              window.location.reload();
            }}>Перезавантажити застосунок</button>
          </div>}
          <PwaStatusBanner pwaState={pwaState} />
          {toastMessage && (
            <Toast
              message={toastMessage}
              undo={toastUndo}
              onDismiss={() => {
                setToastMessage(null);
                setToastUndo(undefined);
              }}
            />
          )}

          {zoneNoticeMessage && (
            <FeedbackBanner
              tone="info"
              message={zoneNoticeMessage}
              onDismiss={() => setZoneNoticeMessage(null)}
            />
          )}

          
          {activeDestination === 'today' && snapshot && (
            <TodayWorkspaceView habitHistory={habitHistory} folders={folders}
              onOpenLifeAreas={(areaId, review) => { setSphereIntent({ areaId, review, nonce: Date.now() }); switchToTab('me'); }}
              goals={goals}
              lifeAreaQuestions={lifeAreaQuestions}
              lifeAreaAssessments={lifeAreaAssessments}
              mode={todayCtx.mode ?? 'day'}
              hasInteraction={todayCtx.hasInteraction}
              dailyPlans={snapshot.settings.dailyPlans}
              dailyPlan={snapshot.settings.dailyPlans?.[todayCtx.selectedDate]}
              onInteraction={() => { if (!todayCtx.hasInteraction) setContexts(prev => updateDestinationContext(prev, 'today', { hasInteraction: true })); }}
              onChangeMode={mode => { setContexts(prev => updateDestinationContext(prev, 'today', { mode, hasInteraction: true, scrollTop: 0 })); }}
              onModalStateChange={setIsLocalModalOpen}
              selectedDate={todayCtx.selectedDate}
              actualTodayDate={actualTodayDate}
              activeZone={activeZone}
              nowMs={nowMs}
              untimedCollapsed={todayCtx.untimedCollapsed}
              nextDayCollapsed={todayCtx.nextDayCollapsed}
              midnightRolloverDate={midnightRolloverDate}
              todayUndoToken={todayUndoToken}
              events={events}
              reservations={reservations}
              tasks={tasks}
              projects={projects}
              dayOffAnnotations={dayOffAnnotations}
              habitsContent={
                todayCtx.mode === 'habits' ? (
                  <React.Suspense fallback={null}>
                    <HabitsWorkspaceView
                      events={events}
                      zone={activeZone}
                      onHistoryChange={setHabitHistory}
                      nightShiftAlternative={events.some(
                        (e) =>
                          e.type === 'work_shift' &&
                          e.schedule.kind === 'timed' &&
                          e.schedule.interval.originEndLocalDate === actualTodayDate &&
                          e.schedule.interval.originStartLocalDate !== actualTodayDate
                      )}
                      selectedDate={todayCtx.selectedDate}
                      actualTodayDate={actualTodayDate}
                      filter={habitFilter}
                      onChangeFilter={setHabitFilter}
                      habits={habits}
                      habitEntries={habitEntries}
                      projects={projects}
                      goals={goals}
                      folders={folders}
                      lifeAreaQuestions={lifeAreaQuestions}
                      lifeAreaAssessments={lifeAreaAssessments}
                      dayOffDates={dayOffAnnotations.map((d) => d.localDate)}
                      repositories={repositories}
                      onSelectDate={(date) =>
                        setContexts((prev) =>
                          updateDestinationContext(prev, 'today', {
                            selectedDate: date,
                            hasInteraction: true,
                          })
                        )
                      }
                      onOpenGlobalCreation={openGlobalCreation}
                      onDataChanged={async (msg) => {
                        await reloadLocalData();
                        if (msg) setToastMessage(msg);
                      }}
                      onModalStateChange={setIsLocalModalOpen}
                      onPlanHabit={(habitId, date) => setHabitOccurrence({ habitId, date })}
                    />
                  </React.Suspense>
                ) : null
              }
              onInspectHabitSession={session => { if(session.habitOccurrence) setHabitOccurrence({habitId: session.habitOccurrence.habitId,date: session.habitOccurrence.localDate}); }}
              habits={habits}
              habitEntries={habitEntries}
              habitsEnabled={true}
              repositories={repositories}
              onSelectDate={(nextDate) =>
                setContexts((prev) =>
                  updateDestinationContext(prev, 'today', {
                    selectedDate: nextDate,
                    hasInteraction: true,
                  })
                )
              }
              onToggleUntimedCollapsed={() =>
                setContexts((prev) =>
                  updateDestinationContext(prev, 'today', {
                    untimedCollapsed: !prev.today.untimedCollapsed,
                  })
                )
              }
              onToggleNextDayCollapsed={handleToggleNextDayCollapsed}
              onDismissMidnightRollover={() => setMidnightRolloverDate(null)}
              onToggleTaskState={handleToggleTaskState}
              onUndoLifecycle={handleUndoTodayLifecycle}
              onCancelEvent={handleCancelEvent}
              onInspectEvent={(ev) => setInspectedEvent(ev)}
              onOpenGapPicker={gap => { const local = formatInstantInZone(gap.startInstant, activeZone); openGlobalCreation('task', { targetDate: local.localDate, targetTime: local.localTime.slice(0, 5) }); }}
              onOpenGlobalCreation={openGlobalCreation}
              onNavigateToHabits={(targetDate) => {
                setContexts((prev) =>
                  updateDestinationContext(prev, 'today', {
                    selectedDate: targetDate,
                  })
                );
              }}
              onDataChanged={async (msg) => {
                await reloadLocalData();
                if (msg) setToastMessage(msg);
              }}
            />
          )}

          {/* DESTINATION 2: ПРОЄКТИ (Directions - formerly Plans) */}
          {(activeDestination === 'directions' || (activeDestination as string) === 'plans') && (
            <div data-testid="destination-view-directions">
              <React.Suspense fallback={null}>
                <PlansView
                  folders={folders}
                  goals={goals}
                  projects={projects}
                  stages={stages}
                  tasks={tasks}
                  reservations={reservations}
                  events={events}
                  activeZone={activeZone}
                  actualTodayDate={actualTodayDate}
                  plansContext={directionsCtx}
                  settings={snapshot?.settings}
                  lifeAreaQuestions={lifeAreaQuestions}
                  lifeAreaAssessments={lifeAreaAssessments}
                  repositories={repositories}
                  onUpdatePlansContext={(patch) =>
                    setContexts((prev) =>
                      updateDestinationContext(prev, 'directions', patch)
                    )
                  }
                  onOpenGlobalCreation={openGlobalCreation}
                  onDataChanged={async (msg) => {
                    await reloadLocalData();
                    if (msg) setToastMessage(msg);
                  }}
                  onModalStateChange={setIsLocalModalOpen}
                  onToggleTaskState={handleToggleTaskState}
                />
              </React.Suspense>
            </div>
          )}

          {/* DESTINATION 3: Я (Me — Overview/Life Areas, Statistics, Wishlist, Settings) */}
          {activeDestination === 'me' && snapshot && (
            <React.Suspense fallback={null}>
              <MeWorkspaceView
                sphereIntent={sphereIntent}
                onSphereIntentHandled={() => setSphereIntent(undefined)}
                onSettingsConfirmationChange={setIsSettingsConfirmationOpen}
                onOpenPlan={(kind, id) => {
                  const entity = kind === 'goal' ? goals.find(g => g.id === id) : projects.find(p => p.id === id);
                  setActiveDestination('directions');
                  setContexts(prev => updateDestinationContext(prev, 'directions', { subMode: kind === 'goal' ? 'goals' : 'projects', activeFolderId: entity?.folderId ?? null, activeGoalId: kind === 'goal' ? id : projects.find(p => p.id === id)?.goalId ?? null, activeProjectId: kind === 'project' ? id : null }));
                }}
                onInspectCalendarEvent={id => { const event = events.find(e => e.id === id); if (event) setInspectedEvent(event); }}
                subView={meCtx.subView}
                activeWishlistCategoryId={meCtx.activeWishlistCategoryId ?? null}
                activeZone={activeZone}
                actualTodayDate={actualTodayDate}
                personalRecords={personalRecords}
                lifeAreaQuestions={lifeAreaQuestions}
                lifeAreaAssessments={lifeAreaAssessments}
                inspirationItems={inspirationItems}
                mediaMeta={mediaMeta}
                mediaBlobs={mediaBlobs}
                wishlistCategories={wishlistCategories}
                wishes={wishes}
                projects={projects}
                settings={snapshot.settings}
                snapshot={snapshot}
                recoverySnapshots={recoverySnapshots}
                repositories={repositories}
                onChangeSubView={(subView, activeWishlistCategoryId) => {
                  setContexts((prev) =>
                    updateDestinationContext(prev, 'me', {
                      subView,
                      ...(activeWishlistCategoryId !== undefined
                        ? { activeWishlistCategoryId }
                        : {}),
                    })
                  );
                  const targetHash = subView === 'overview' ? '#/me' : `#/${subView}`;
                  if (window.location.hash !== targetHash) {
                    window.history.replaceState(null, '', targetHash);
                  }
                }}
                onOpenGlobalCreation={openGlobalCreation}
                onSettingsPatch={(patch) => {
                  setSnapshot((prev) => {
                    if (!prev) return prev;
                    const merged = { ...prev.settings, ...patch };
                    applyThemeAndAccessibilityToDocument(
                      merged.theme,
                      merged.reducedMotionOverride,
                      merged.textScale,
                    );
                    return { ...prev, settings: merged };
                  });
                }}
                onDataChanged={async (msg) => {
                  await reloadLocalData();
                  if (msg) setToastMessage(msg);
                }}
                onNavigateToWorkRoster={() => {
                  openCalendarWindow('month');
                }}
                onNavigateToHabits={() => {
                  setActiveDestination('today');
                  setContexts(prev => updateDestinationContext(prev, 'today', { selectedDate: actualTodayDate, mode: 'habits' }));
                }}
                onCreationAreaChange={setCreationAreaId}
                onModalStateChange={setIsLocalModalOpen}
                pwaState={pwaState}
              />
            </React.Suspense>
          )}
        </div>
      </FloatingShell>

      {habitOccurrence &&
        snapshot &&
        habits.some((h) => h.id === habitOccurrence.habitId) && (
          <React.Suspense fallback={null}>
            <SessionSheet
              isOpen
              habit={habits.find((h) => h.id === habitOccurrence.habitId)!}
              habitEntries={habitEntries}
              date={habitOccurrence.date}
              zone={activeZone}
              tasks={tasks}
              events={events}
              reservations={reservations}
              repositories={repositories}
              onSaved={async (msg) => {
                await reloadLocalData();
                if (msg) setToastMessage(msg);
              }}
              onClose={() => setHabitOccurrence(null)}
            />
          </React.Suspense>
        )}

      {isEditorOpen && (
        <React.Suspense fallback={null}>
          <SharedEditorHost
            globalQuickAdd={quickAdd}
            isOpen={isEditorOpen}
            activeDestination={isCalendarOpen ? 'calendar' : activeDestination}
            contexts={contexts}
            initialContext={
              quickAdd
                ? {
                    ...buildInitialCreationContext(
                      isCalendarOpen ? 'calendar' : activeDestination,
                      contexts
                    ),
                    targetDate: null,
                    folderId: null,
                    goalId: null,
                    projectId: null,
                    stageId: null,
                  }
                : { ...buildInitialCreationContext(
                    isCalendarOpen ? 'calendar' : activeDestination,
                    contexts
                  ), ...editorPrefill }
            }
            initialActionKind={editorInitialAction}
            enabledModules={snapshot?.settings.modules}
            activeZone={activeZone}
            folders={folders}
            goals={goals}
            projects={projects}
            stages={stages}
            tasks={tasks}
            reservations={reservations}
            events={events}
            shiftTemplates={shiftTemplates}
            dayOffAnnotations={dayOffAnnotations}
            lifeAreaQuestions={creationAreaSuggestions}
            wishlistCategories={wishlistCategories}
            preferredWishlistCurrency={
              snapshot?.settings.preferredWishlistCurrency ?? null
            }
            repositories={repositories}
            onClose={() => transitionCreation(() => setIsEditorOpen(false))}
            onEntityCreated={async (msg, undoFn) => {
              await reloadLocalData();
              if (msg) {
                setToastMessage(msg);
                setToastUndo(() => undoFn);
              }
            }}
          />
        </React.Suspense>
      )}

      {inspectedEvent && (
        <React.Suspense fallback={null}>
          <TaskSheet
            event={inspectedEvent}
            date={
              inspectedEvent.schedule.kind === 'timed'
                ? inspectedEvent.schedule.interval.originStartLocalDate
                : inspectedEvent.schedule.startLocalDate
            }
            zone={activeZone}
            tasks={tasks}
            events={events}
            reservations={reservations}
            folders={folders}
            projects={projects}
            goals={goals}
            lifeAreas={lifeAreaQuestions}
            repositories={repositories}
            onClose={() => setInspectedEvent(null)}
            onSaved={async (msg) => {
              await reloadLocalData();
              if (msg) setToastMessage(msg);
            }}
          />
        </React.Suspense>
      )}
    </>
  );
}
export default App;


