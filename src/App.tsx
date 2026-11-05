import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SharedEditorHost } from './components/editors/SharedEditorHost';
import { HabitSessionSheet } from './components/habits/HabitSessionSheet';
import {
  PwaStatusBanner,
  PwaInstallAndOfflineCard,
} from './components/pwa/PwaStatusAndInstallCard';
import { FloatingShell } from './components/shell/FloatingShell';
import { transitionCreation } from './components/shell/creationTransition';
import { EventDetailSheet } from './components/timeline/EventDetailSheet';
import { GapTaskPickerSheet } from './components/timeline/GapTaskPickerSheet';
import { FeedbackBanner } from './components/ui/primitives';
import { selectAmbientContext } from './domain/projections';
import type { UnoccupiedTimeGap } from './domain/scheduling';
import {
  detectDeviceTimeZone,
  evaluateTimeZoneStatus,
  todayLocalDateInZone,
} from './domain/temporal';
import { restoreTodayInteraction } from './domain/today';
import { CalendarEvent, PlanuiDomainSnapshot, RecoverySnapshotRecord } from './domain/types';
import { PlanuiError } from './i18n/errorsUk';
import { PrimaryDestinationId, UK_STRINGS } from './i18n/uk';
import { usePwaLifecycle } from './pwa/pwaController';
import {
  DestinationContextMap,
  ImplementedCreationActionKind,
  applyThemeAndAccessibilityToDocument,
  buildInitialCreationContext,
  createInitialDestinationContextMap,
  extractSubViewFromHash,
  formatHashForDestination,
  parseDestinationFromHash,
  updateDestinationContext,
} from './state/shellStore';
import { PlanuiRepositories, TaskLifecycleUndoToken } from './storage/repositories';
import { CalendarWorkspaceView } from './views/CalendarWorkspaceView';
import { HabitsWorkspaceView } from './views/HabitsWorkspaceView';
import { MeWorkspaceView } from './views/MeWorkspaceView';
import { PlansView } from './views/PlansView';
import { TodayWorkspaceView } from './views/TodayWorkspaceView';

const repositories = new PlanuiRepositories();

export function App() {
  const detectedZone = detectDeviceTimeZone();
  const initialZone = detectedZone ?? 'UTC';
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const initialTodayDate = todayLocalDateInZone(initialZone, nowMs);

  const [activeDestination, setActiveDestination] =
    useState<PrimaryDestinationId>(() =>
      typeof window !== 'undefined'
        ? parseDestinationFromHash(window.location.hash)
        : 'today'
    );

  const [contexts, setContexts] = useState<DestinationContextMap>(() => {
    const map = createInitialDestinationContextMap(initialTodayDate);
    if (typeof window !== 'undefined') {
      const sub = extractSubViewFromHash(window.location.hash);
      if (sub) {
        map.me.subView = sub;
      }
    }
    try {
      Object.assign(map.today, restoreTodayInteraction(window.sessionStorage.getItem('planui.today-context.v1'), initialTodayDate));
    } catch { /* Session storage can be unavailable; in-memory context still works. */ }
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#/habits')) map.today.mode = 'habits';
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
  const [quickAdd, setQuickAdd] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  useEffect(() => { if (habitOccurrence && snapshot && !snapshot.habits.some(h => h.id === habitOccurrence.habitId)) setHabitOccurrence(null); }, [habitOccurrence, snapshot]);
  const [isLocalModalOpen, setIsLocalModalOpen] = useState(false);
  const [isSettingsConfirmationOpen, setIsSettingsConfirmationOpen] = useState(false);
  const [editorInitialAction, setEditorInitialAction] = useState<
    ImplementedCreationActionKind | undefined
  >(undefined);
  const [activeGapForPicker, setActiveGapForPicker] =
    useState<UnoccupiedTimeGap | null>(null);
  const [inspectedEvent, setInspectedEvent] = useState<CalendarEvent | null>(
    null
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
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
    setSnapshot(snap);
    setMediaBlobs(blobs);
    setRecoverySnapshots(recoveries);
    applyThemeAndAccessibilityToDocument(
      snap.settings.theme,
      snap.settings.reducedMotionOverride,
      snap.settings.reducedTransparencyOverride
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
    const unsubscribe = repositories.tabSync.subscribe((msg) => {
      if (msg.type === 'ENTITY_MUTATED' || msg.type === 'IMPORT_FINISHED') {
        const known = repositories.getKnownDbGeneration();
        if (known !== null && msg.dbGeneration !== known) {
          setExternalReplacement(true);
          return;
        }
        void reloadSafely();
      }
    });
    return unsubscribe;
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

  // Stage 5 (5.2 / C08) & Stage 6 (6.3): Recheck device time zone and clock on foregrounding and ~once per minute
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
          snapshot.settings.reducedTransparencyOverride
        );
      }
    };
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [snapshot]);

  // Synchronize URL hash and window scroll per destination (3.1 Preserve route/context/scroll per destination)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const nextDest = parseDestinationFromHash(hash);
      const subView = extractSubViewFromHash(hash);
      if (subView) {
        setContexts((oldMap) =>
          updateDestinationContext(oldMap, 'me', { subView })
        );
      }
      setActiveDestination((prev) => {
        if (prev !== nextDest) {
          const currentScroll = window.scrollY;
          setContexts((oldMap) =>
            updateDestinationContext(oldMap, prev, { scrollTop: currentScroll })
          );
        }
        return nextDest;
      });

      // Migrate legacy route bookmarks in browser URL
      if (hash.startsWith('#/plans')) {
        window.history.replaceState(null, '', '#/directions');
      } else if (hash.startsWith('#/habits')) {
        setContexts(prev => updateDestinationContext(prev, 'today', {mode: 'habits'}));
        window.history.replaceState(null, '', '#/today');
      } else if (hash.startsWith('#/diary') || hash.startsWith('#/records')) {
        window.history.replaceState(null, '', '#/me');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Restore saved scroll position when switching destinations (never on clock ticks)
  useLayoutEffect(() => {
    const targetScroll = contexts[activeDestination].scrollTop ?? 0;
    window.scrollTo({
      top: targetScroll,
      behavior: 'instant' as ScrollBehavior,
    });
  }, [activeDestination, Boolean(snapshot), contexts.today.mode]);

  useEffect(() => {
    if (activeDestination !== 'today' || !snapshot) return;
    const save = () => {
      try { window.sessionStorage.setItem('planui.today-context.v1', JSON.stringify({ selectedDate: contexts.today.selectedDate, mode: contexts.today.mode ?? 'day', scrollTop: window.scrollY })); } catch { /* Optional interaction context only. */ }
    };
    save();
    window.addEventListener('scroll', save, { passive: true });
    window.addEventListener('pagehide', save);
    return () => { window.removeEventListener('scroll', save); window.removeEventListener('pagehide', save); };
  }, [activeDestination, Boolean(snapshot), contexts.today.selectedDate, contexts.today.mode]);

  const handleSelectDestination = (dest: PrimaryDestinationId) => {
    if (dest === activeDestination) return;
    const currentScroll = typeof window !== 'undefined' ? window.scrollY : 0;
    setContexts((prev) =>
      updateDestinationContext(prev, activeDestination, {
        scrollTop: currentScroll,
      })
    );
    setActiveDestination(dest);
    if (typeof window !== 'undefined') {
      const targetHash = formatHashForDestination(dest);
      if (window.location.hash !== targetHash) {
        window.history.pushState(null, '', targetHash);
      }
    }
  };

  const openGlobalCreation = (
    preferredAction?: ImplementedCreationActionKind
  ) => {
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

  // Derived data for current views
  const folders = snapshot?.folders ?? [];
  const goals = snapshot?.goals ?? [];
  const projects = snapshot?.projects ?? [];
  const stages = snapshot?.stages ?? [];
  const tasks = snapshot?.tasks ?? [];
  const reservations = snapshot?.reservations ?? [];
  const events = snapshot?.events ?? [];
  const shiftTemplates = snapshot?.shiftTemplates ?? [];
  const dayOffAnnotations = snapshot?.dayOffAnnotations ?? [];
  const habits = snapshot?.habits ?? [];
  const habitEntries = snapshot?.habitEntries ?? [];
  const personalRecords = snapshot?.personalRecords ?? [];
  const lifeAreaQuestions = snapshot?.lifeAreaQuestions ?? [];
  const lifeAreaAssessments = snapshot?.lifeAreaAssessments ?? [];
  const inspirationItems = snapshot?.inspirationItems ?? [];
  const mediaMeta = snapshot?.mediaMeta ?? [];
  const wishlistCategories = snapshot?.wishlistCategories ?? [];
  const wishes = snapshot?.wishes ?? [];

  const calendarCtx = contexts.calendar;
  const directionsCtx = contexts.directions ?? contexts.plans;
  const todayCtx = contexts.today;
  const meCtx = contexts.me;

  const anyModalOpen =
    isEditorOpen ||
    Boolean(habitOccurrence) ||
    isLocalModalOpen ||
    isSettingsConfirmationOpen ||
    Boolean(activeGapForPicker) ||
    Boolean(inspectedEvent);
  // Inline personal/review forms are conservatively protected until leaving that view.
  const inlineEditorView = activeDestination === 'me' && ['records', 'life_areas'].includes(contexts.me.subView);
  const pwaState = usePwaLifecycle(anyModalOpen || inlineEditorView ? ['shared_modal_editor'] : []);

  return (
    <>
      <FloatingShell
        ambient={selectAmbientContext({ events }, nowMs, activeDestination === 'directions' ? folders.find(folder => folder.id === directionsCtx.activeFolderId)?.name : '')}
        activeDestination={activeDestination}
        onSelectDestination={handleSelectDestination}
        onOpenGlobalCreate={() => transitionCreation(() => { openGlobalCreation('task'); setQuickAdd(true); })}
        isModalOpen={anyModalOpen}
        isBackgroundInert={Boolean(habitOccurrence) || isEditorOpen || isLocalModalOpen || Boolean(activeGapForPicker) || Boolean(inspectedEvent)}
      >
        <div className="space-y-6">
          {storageError && <FeedbackBanner tone="error" message={storageError} />}
          {externalReplacement && <div role="alert" className="rounded-2xl border border-amber-400 p-4 space-y-3">
            <p>В іншій вкладці замінено локальні дані. Незбережене введення залишено на екрані, але збереження заблоковано. Скопіюйте потрібний текст перед перезавантаженням.</p>
            <button type="button" onClick={() => {
              if (window.confirm('Перезавантажити застосунок? Незбережене введення буде втрачено. Спочатку скопіюйте потрібні дані.')) window.location.reload();
            }}>Перезавантажити застосунок</button>
          </div>}
          <PwaStatusBanner pwaState={pwaState} />
          {toastMessage && (
            <FeedbackBanner
              tone="success"
              message={toastMessage}
              onDismiss={() => setToastMessage(null)}
            />
          )}

          {zoneNoticeMessage && (
            <FeedbackBanner
              tone="info"
              message={zoneNoticeMessage}
              onDismiss={() => setZoneNoticeMessage(null)}
            />
          )}

          {/* DESTINATION 1: СЬОГОДНІ (Today — Stage 6 Workspace & Timeline) */}
          {activeDestination === 'today' && snapshot && (
            <TodayWorkspaceView folders={folders}
              mode={todayCtx.mode ?? 'day'}
              hasInteraction={todayCtx.hasInteraction}
              savedScrollTop={todayCtx.scrollTop}
              dailyPlans={snapshot.settings.dailyPlans}
              dailyPlan={snapshot.settings.dailyPlans?.[todayCtx.selectedDate]}
              onInteraction={() => { if (!todayCtx.hasInteraction) setContexts(prev => updateDestinationContext(prev, 'today', { hasInteraction: true })); }}
              onChangeMode={mode => { const currentScroll = window.scrollY; setContexts(prev => updateDestinationContext(prev, 'today', { mode, hasInteraction: true, scrollTop: prev.today.modeScrollTops?.[mode] ?? 0, modeScrollTops: { ...prev.today.modeScrollTops, [prev.today.mode ?? 'day']: currentScroll } })); }}
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
              habitsContent={<HabitsWorkspaceView selectedDate={todayCtx.selectedDate} actualTodayDate={actualTodayDate} filter={habitFilter} onChangeFilter={setHabitFilter} habits={habits} habitEntries={habitEntries} projects={projects} folders={folders} lifeAreaQuestions={lifeAreaQuestions} dayOffDates={dayOffAnnotations.map(d => d.localDate)} repositories={repositories} onSelectDate={date => setContexts(prev => updateDestinationContext(prev, 'today', {selectedDate: date, hasInteraction: true}))} onOpenGlobalCreation={openGlobalCreation} onDataChanged={async msg => { await reloadLocalData(); if(msg) setToastMessage(msg); }} onModalStateChange={setIsLocalModalOpen} onPlanHabit={(habitId,date) => setHabitOccurrence({habitId,date})} />}
              onInspectHabitSession={session => { if(session.habitOccurrence) setHabitOccurrence({habitId: session.habitOccurrence.habitId,date: session.habitOccurrence.localDate}); }}
              habits={habits}
              habitEntries={habitEntries}
              habitsEnabled={snapshot?.settings.modules?.habitsEnabled !== false}
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
              onOpenGapPicker={(gap) => setActiveGapForPicker(gap)}
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

          {/* DESTINATION 2: КАЛЕНДАР (Calendar — Stage 7 Month/Week/Day + Stage 8 Work Schedule) */}
          {activeDestination === 'calendar' && snapshot && (
            <div className="space-y-4" data-testid="destination-view-calendar">
              <CalendarWorkspaceView
                roadmapSource={{ folders, goals, projects, stages, tasks }}
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
                onInspectHabitSession={session => { if(session.habitOccurrence) setHabitOccurrence({habitId: session.habitOccurrence.habitId,date: session.habitOccurrence.localDate}); }}
              shiftTemplates={shiftTemplates}
                repositories={repositories}
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
                  setContexts((prev) =>
                    updateDestinationContext(prev, 'calendar', { selectedDate })
                  )
                }
                onToggleTaskState={handleToggleTaskState}
                onCancelEvent={handleCancelEvent}
                onInspectEvent={(ev) => setInspectedEvent(ev)}
                onOpenGapPicker={(gap) => setActiveGapForPicker(gap)}
                onOpenGlobalCreation={openGlobalCreation}
                onDataChanged={async (msg) => {
                  await reloadLocalData();
                  if (msg) setToastMessage(msg);
                }}
                onModalStateChange={setIsLocalModalOpen}
              />
            </div>
          )}

          {/* DESTINATION 3: НАПРЯМИ (Directions - formerly Plans) */}
          {(activeDestination === 'directions' || (activeDestination as string) === 'plans') && (
            <div data-testid="destination-view-directions">
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
              />
            </div>
          )}

          {/* DESTINATION 4: Я (Me — Overview, Personal Records, Life Areas, Inspiration, Wishlist, Settings) */}
          {activeDestination === 'me' && snapshot && (
            <MeWorkspaceView
              onSettingsConfirmationChange={setIsSettingsConfirmationOpen}
              onOpenPlan={(kind, id) => {
                const entity = kind === 'goal' ? goals.find(g => g.id === id) : projects.find(p => p.id === id);
                setContexts(prev => updateDestinationContext(prev, 'directions', { activeFolderId: entity?.folderId ?? null, activeGoalId: kind === 'goal' ? id : projects.find(p => p.id === id)?.goalId ?? null, activeProjectId: kind === 'project' ? id : null }));
                handleSelectDestination('directions');
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
              onChangeSubView={(subView, activeWishlistCategoryId) =>
                setContexts((prev) =>
                  updateDestinationContext(prev, 'me', {
                    subView,
                    ...(activeWishlistCategoryId !== undefined
                      ? { activeWishlistCategoryId }
                      : {}),
                  })
                )
              }
              onOpenGlobalCreation={openGlobalCreation}
              onSettingsPatch={(patch) => {
                setSnapshot((prev) => {
                  if (!prev) return prev;
                  const merged = { ...prev.settings, ...patch };
                  applyThemeAndAccessibilityToDocument(
                    merged.theme,
                    merged.reducedMotionOverride,
                    merged.reducedTransparencyOverride
                  );
                  return { ...prev, settings: merged };
                });
              }}
              onDataChanged={async (msg) => {
                await reloadLocalData();
                if (msg) setToastMessage(msg);
              }}
              onNavigateToWorkRoster={() => {
                setContexts((prev) =>
                  updateDestinationContext(prev, 'calendar', {
                    mode: 'work_schedule',
                  })
                );
                handleSelectDestination('calendar');
              }}
              onNavigateToHabits={() => {
                setContexts(prev => updateDestinationContext(prev, 'today', {mode: 'habits'}));
                handleSelectDestination('today');
              }}
              onModalStateChange={setIsLocalModalOpen}
            />
          )}
          {activeDestination === 'me' && contexts.me.subView === 'settings' && <PwaInstallAndOfflineCard pwaState={pwaState} />}
        </div>
      </FloatingShell>

      {habitOccurrence && snapshot && habits.some(h => h.id === habitOccurrence.habitId) && <HabitSessionSheet habit={habits.find(h => h.id === habitOccurrence.habitId)!} date={habitOccurrence.date} zone={activeZone} tasks={tasks} events={events} reservations={reservations} entries={habitEntries} repositories={repositories} allowPlanning={snapshot.settings.modules?.habitsEnabled !== false} onChanged={reloadLocalData} onClose={() => setHabitOccurrence(null)} />}
      <SharedEditorHost
        globalQuickAdd={quickAdd}
        isOpen={isEditorOpen}
        activeDestination={activeDestination}
        contexts={contexts}
        initialContext={quickAdd ? { ...buildInitialCreationContext(activeDestination, contexts), targetDate: null, folderId: null, goalId: null, projectId: null, stageId: null } : buildInitialCreationContext(
          activeDestination,
          contexts
        )}
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
        lifeAreaQuestions={lifeAreaQuestions}
        wishlistCategories={wishlistCategories}
        preferredWishlistCurrency={
          snapshot?.settings.preferredWishlistCurrency ?? null
        }
        repositories={repositories}
        onClose={() => transitionCreation(() => setIsEditorOpen(false))}
        onEntityCreated={async (msg) => {
          await reloadLocalData();
          setToastMessage(msg);
        }}
      />

      <GapTaskPickerSheet
        isOpen={Boolean(activeGapForPicker)}
        gap={activeGapForPicker}
        displayZone={activeZone}
        tasks={tasks}
        projects={projects}
        events={events}
        reservations={reservations}
        repositories={repositories}
        onClose={() => setActiveGapForPicker(null)}
        onReservationCreated={async (msg) => {
          await reloadLocalData();
          setToastMessage(msg);
        }}
      />

      <EventDetailSheet
        event={inspectedEvent}
        displayZone={activeZone}
        events={events}
        reservations={reservations}
        tasks={tasks}
        repositories={repositories}
        onClose={() => setInspectedEvent(null)}
        onEventUpdated={async (msg) => {
          await reloadLocalData();
          setToastMessage(msg);
        }}
      />
    </>
  );
}
export default App;
