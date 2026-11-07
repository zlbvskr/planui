import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CREATION_ACTION_REGISTRY,
  PRIMARY_NAV_ITEMS,
  buildInitialCreationContext,
  createInitialDestinationContextMap,
  formatHashForDestination,
  getContextualCreationActions,
  parseDestinationFromHash,
  resolveEffectiveTheme,
  updateDestinationContext,
  wcagContrastRatio,
} from '../../state/shellStore';

describe('Stage 3: Design System, Floating Shell, and Creation Host Unit Tests', () => {
  it('enforces four primary destinations in exact order with Ukrainian labels', () => {
    assert.equal(PRIMARY_NAV_ITEMS.length, 4);
    assert.deepEqual(
      PRIMARY_NAV_ITEMS.map((item) => item.id),
      ['today', 'calendar', 'directions', 'me']
    );
    assert.deepEqual(
      PRIMARY_NAV_ITEMS.map((item) => item.labelUk),
      ['Сьогодні', 'Календар', 'Проєкти', 'Я']
    );
  });

  it('parses and formats static-host-compatible hash routes and defaults unknown hashes to today', () => {
    assert.equal(parseDestinationFromHash('#/calendar'), 'calendar');
    assert.equal(parseDestinationFromHash('#/directions'), 'directions');
    // Legacy routes migrate seamlessly
    assert.equal(parseDestinationFromHash('#/plans'), 'directions');
    assert.equal(parseDestinationFromHash('#/habits'), 'today');
    assert.equal(parseDestinationFromHash('#/today'), 'today');
    assert.equal(parseDestinationFromHash('#/me'), 'me');
    assert.equal(parseDestinationFromHash(''), 'today');
    assert.equal(parseDestinationFromHash('#/unknown'), 'today');
    assert.equal(formatHashForDestination('directions'), '#/directions');
  });

  it('preserves per-destination context (selected date, mode, open container, scrollTop) independently across tab switches', () => {
    let map = createInitialDestinationContextMap('2026-03-29');

    map = updateDestinationContext(map, 'calendar', {
      selectedDate: '2026-04-10',
      mode: 'work_schedule',
      scrollTop: 180,
    });
    map = updateDestinationContext(map, 'plans', {
      activeFolderId: 'folder-home',
      scrollTop: 320,
    });
    map = updateDestinationContext(map, 'me', {
      subView: 'wishlist',
      scrollTop: 95,
    });

    // Verify Calendar, Plans, Today, Habits, and Me retain independent state
    assert.equal(map.calendar.selectedDate, '2026-04-10');
    assert.equal(map.calendar.mode, 'work_schedule');
    assert.equal(map.calendar.scrollTop, 180);

    assert.equal(map.plans.activeFolderId, 'folder-home');
    assert.equal(map.plans.scrollTop, 320);

    assert.equal(map.today.selectedDate, '2026-03-29');
    assert.equal(map.today.scrollTop, 0);

    assert.equal(map.me.subView, 'wishlist');
    assert.equal(map.me.scrollTop, 95);
  });

  it('exposes only implemented creation actions in UI while retaining architectural hooks for future stages', () => {
    // Architectural hooks include wish and wishlist_category for Stage 9
    const allKinds = CREATION_ACTION_REGISTRY.map((a) => a.kind);
    assert.ok(allKinds.includes('wish'));
    assert.ok(allKinds.includes('wishlist_category'));
    assert.ok(allKinds.includes('shift'));
    assert.ok(allKinds.includes('habit'));

    // UI menu only returns implemented actions, ordered by active destination
    const plansActions = getContextualCreationActions('plans');
    assert.ok(plansActions.every((a) => a.implementedInCurrentStage));
    assert.equal(plansActions[0].kind, 'task');
    assert.ok(plansActions.some((a) => a.kind === 'folder'));

    const meActions = getContextualCreationActions('me');
    assert.ok(meActions.every((a) => a.implementedInCurrentStage));
    assert.equal(meActions[0].kind, 'personal_record');
  });

  it('enforces C04 creation context rules: Plans creation does NOT silently schedule tasks for today', () => {
    let map = createInitialDestinationContextMap('2026-03-29');
    map = updateDestinationContext(map, 'plans', {
      activeFolderId: 'folder-music',
    });

    const plansCreationCtx = buildInitialCreationContext('plans', map);
    assert.ok(
      plansCreationCtx.originDestination === 'directions' ||
        plansCreationCtx.originDestination === 'plans'
    );
    assert.equal(plansCreationCtx.targetDate, null);
    assert.equal(plansCreationCtx.folderId, 'folder-music');

    const todayCreationCtx = buildInitialCreationContext('today', map);
    assert.equal(todayCreationCtx.originDestination, 'today');
    assert.equal(todayCreationCtx.targetDate, '2026-03-29');
    assert.equal(todayCreationCtx.folderId, null);
  });

  it('resolves system, light, and dark theme preferences deterministically', () => {
    assert.equal(resolveEffectiveTheme('system', false), 'light');
    assert.equal(resolveEffectiveTheme('system', true), 'dark');
    assert.equal(resolveEffectiveTheme('light', true), 'light');
    assert.equal(resolveEffectiveTheme('dark', false), 'dark');
  });

  it('verifies WCAG AA contrast ratios (>= 4.5:1) for C16 primary, secondary, and adjusted semantic text tokens', () => {
    // Light mode combinations
    assert.ok(wcagContrastRatio('#18191C', '#F5F5F7') >= 4.5);
    assert.ok(wcagContrastRatio('#18191C', '#FFFFFF') >= 4.5);
    assert.ok(wcagContrastRatio('#5D626C', '#F5F5F7') >= 4.5);
    assert.ok(wcagContrastRatio('#5D626C', '#FFFFFF') >= 4.5);
    assert.ok(wcagContrastRatio('#5D626C', '#ECEEF1') >= 4.5);
    assert.ok(wcagContrastRatio('#A63340', '#ECEEF1') >= 4.5);
    assert.ok(wcagContrastRatio('#75532E', '#FFFFFF') >= 4.5);
    assert.ok(wcagContrastRatio('#35614D', '#FFFFFF') >= 4.5);
    assert.ok(wcagContrastRatio('#345B8C', '#FFFFFF') >= 4.5);

    // Dark mode combinations
    assert.ok(wcagContrastRatio('#F5F5F7', '#000000') >= 4.5);
    assert.ok(wcagContrastRatio('#F5F5F7', '#111214') >= 4.5);
    assert.ok(wcagContrastRatio('#ADB1BA', '#000000') >= 4.5);
    assert.ok(wcagContrastRatio('#ADB1BA', '#111214') >= 4.5);
    assert.ok(wcagContrastRatio('#ADB1BA', '#1B1D21') >= 4.5);
    assert.ok(wcagContrastRatio('#F08B95', '#111214') >= 4.5);
    assert.ok(wcagContrastRatio('#C6A172', '#111214') >= 4.5);
    assert.ok(wcagContrastRatio('#8AB49E', '#111214') >= 4.5);
    assert.ok(wcagContrastRatio('#89AEE0', '#111214') >= 4.5);
    assert.ok(wcagContrastRatio('#B9A1DE', '#111214') >= 4.5);
    assert.ok(wcagContrastRatio('#A1ABC0', '#111214') >= 4.5);
  });
});
