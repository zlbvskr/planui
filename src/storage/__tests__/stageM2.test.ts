import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIMARY_NAV_ITEMS,
  parseDestinationFromHash,
  extractSubViewFromHash,
  formatHashForDestination,
  getContextualCreationActions,
  buildInitialCreationContext,
  createInitialDestinationContextMap,
} from '../../state/shellStore';
import { validateSettingsRecord } from '../../domain/validation';
import { createDefaultSettings, InMemoryTransactionalEngine } from '../db';
import { PlanuiRepositories } from '../repositories';
import { UK_STRINGS } from '../../i18n/uk';
import type { PlanuiSettings, OptionalModulesSettings } from '../../domain/types';

describe('Stage M2: Four-Destination Application Shell & Optional Modules Tests', () => {
  it('enforces exactly four primary destinations in order: Сьогодні, Календар, Напрями, Я', () => {
    assert.equal(PRIMARY_NAV_ITEMS.length, 4);

    assert.equal(PRIMARY_NAV_ITEMS[0].id, 'today');
    assert.equal(PRIMARY_NAV_ITEMS[0].labelUk, 'Сьогодні');
    assert.equal(PRIMARY_NAV_ITEMS[0].labelUk, UK_STRINGS.nav.today);

    assert.equal(PRIMARY_NAV_ITEMS[1].id, 'calendar');
    assert.equal(PRIMARY_NAV_ITEMS[1].labelUk, 'Календар');
    assert.equal(PRIMARY_NAV_ITEMS[1].labelUk, UK_STRINGS.nav.calendar);

    assert.equal(PRIMARY_NAV_ITEMS[2].id, 'directions');
    assert.equal(PRIMARY_NAV_ITEMS[2].labelUk, 'Напрями');
    assert.equal(PRIMARY_NAV_ITEMS[2].labelUk, UK_STRINGS.nav.directions);

    assert.equal(PRIMARY_NAV_ITEMS[3].id, 'me');
    assert.equal(PRIMARY_NAV_ITEMS[3].labelUk, 'Я');
    assert.equal(PRIMARY_NAV_ITEMS[3].labelUk, UK_STRINGS.nav.me);

    // Verify no separate primary destinations exist for habits, plans, wishlist, or diary
    const ids = PRIMARY_NAV_ITEMS.map((item) => item.id);
    assert.ok(!ids.includes('habits' as any));
    assert.ok(!ids.includes('plans' as any));
    assert.ok(!ids.includes('wishlist' as any));
    assert.ok(!ids.includes('diary' as any));
  });

  it('migrates legacy bookmarks and routes accurately without dead pages', () => {
    // Former Plans route opens Directions
    assert.equal(parseDestinationFromHash('#/plans'), 'directions');
    assert.equal(parseDestinationFromHash('#/plans/folder-1'), 'directions');

    // Canonical directions route
    assert.equal(parseDestinationFromHash('#/directions'), 'directions');

    // Former Habits route opens Today
    assert.equal(parseDestinationFromHash('#/habits'), 'today');

    // Former diary / records routes open Me with records subview
    assert.equal(parseDestinationFromHash('#/diary'), 'me');
    assert.equal(extractSubViewFromHash('#/diary'), 'records');

    assert.equal(parseDestinationFromHash('#/records'), 'me');
    assert.equal(extractSubViewFromHash('#/records'), 'records');

    // Former settings route opens Me with settings subview
    assert.equal(parseDestinationFromHash('#/settings'), 'me');
    assert.equal(extractSubViewFromHash('#/settings'), 'settings');

    // Wishlist route opens Me with wishlist subview
    assert.equal(parseDestinationFromHash('#/wishlist'), 'me');
    assert.equal(extractSubViewFromHash('#/wishlist'), 'wishlist');

    // Standard hash formatters
    assert.equal(formatHashForDestination('today'), '#/today');
    assert.equal(formatHashForDestination('calendar'), '#/calendar');
    assert.equal(formatHashForDestination('directions'), '#/directions');
    assert.equal(formatHashForDestination('me'), '#/me');
  });

  it('initializes fresh settings with all four optional modules disabled', () => {
    const defaultSettings = createDefaultSettings('Europe/Kyiv');
    assert.deepEqual(defaultSettings.modules, {
      habitsEnabled: false,
      stateCheckInsEnabled: false,
      desiredLifeEnabled: false,
      wishlistEnabled: false,
    });
  });

  it('validates optional module preference flags safely in validateSettingsRecord', () => {
    const defaultSettings = createDefaultSettings('2026-03-29T12:00:00.000Z');

    // Valid configuration
    assert.doesNotThrow(() => {
      validateSettingsRecord({
        ...defaultSettings,
        modules: {
          habitsEnabled: true,
          stateCheckInsEnabled: false,
          desiredLifeEnabled: true,
          wishlistEnabled: false,
          userConfigured: true,
        },
      });
    });

    // Invalid module value throws PlanuiError
    assert.throws(() => {
      validateSettingsRecord({
        ...defaultSettings,
        modules: {
          habitsEnabled: 'yes' as any,
          stateCheckInsEnabled: false,
          desiredLifeEnabled: false,
          wishlistEnabled: false,
        },
      });
    });
  });

  it('preserves existing user data by auto-enabling relevant modules when records exist', async () => {
    const engine = new InMemoryTransactionalEngine('m2_auto_enable_test');
    const repos = new PlanuiRepositories(engine);

    // Create a habit and a wish in the database with empty modules settings
    await repos.saveHabit({
      id: 'habit-water',
      name: 'Питний режим',
      description: 'Випити склянку води',
      icon: null,
      lifeAreaId: null,
      projectId: null,
      state: 'active',
      ruleRevisions: [
        {
          id: 'hr-1',
          effectiveFromLocalDate: '2026-03-29',
          rule: { kind: 'daily' },
          target: { kind: 'binary' },
          createdAt: '2026-03-29T08:00:00.000Z',
        },
      ],
      createdAt: '2026-03-29T08:00:00.000Z',
      updatedAt: '2026-03-29T08:00:00.000Z',
      revision: 1,
    });

    await repos.saveWishItem({
      id: 'wish-book',
      title: 'Книга з архітектури систем',
      note: null,
      categoryId: null,
      timing: 'someday',
      state: 'active',
      estimatedPrice: {
        amountMinor: 45000,
        amountDecimal: '450.00',
        currency: 'UAH',
      },
      fulfilledAt: null,
      archived: false,
      createdAt: '2026-03-29T08:00:00.000Z',
      updatedAt: '2026-03-29T08:00:00.000Z',
      revision: 1,
    });

    // Capture coherent snapshot
    const { snapshot } = await repos.captureCoherentSnapshot();

    // Verification: habits and wishlist must be auto-enabled so user records are not hidden!
    assert.equal(snapshot.settings.modules?.habitsEnabled, true);
    assert.equal(snapshot.settings.modules?.wishlistEnabled, true);
    // Unpopulated modules remain false
    assert.equal(snapshot.settings.modules?.stateCheckInsEnabled, false);
    assert.equal(snapshot.settings.modules?.desiredLifeEnabled, false);
  });

  it('filters contextual creation actions by destination and optional module status', () => {
    // When habits are disabled:
    const disabledModules: OptionalModulesSettings = {
      habitsEnabled: false,
      stateCheckInsEnabled: false,
      desiredLifeEnabled: false,
      wishlistEnabled: false,
    };

    const todayActionsNoHabits = getContextualCreationActions('today', disabledModules);
    assert.ok(todayActionsNoHabits.some((a) => a.kind === 'task'));
    assert.ok(todayActionsNoHabits.some((a) => a.kind === 'event'));
    assert.ok(!todayActionsNoHabits.some((a) => a.kind === 'habit'));

    // When habits are enabled:
    const enabledHabits: OptionalModulesSettings = {
      ...disabledModules,
      habitsEnabled: true,
    };
    const todayActionsWithHabits = getContextualCreationActions('today', enabledHabits);
    assert.ok(todayActionsWithHabits.some((a) => a.kind === 'habit'));

    // Directions actions always include task, goal, project, stage, folder
    const directionsActions = getContextualCreationActions('directions', disabledModules);
    assert.ok(directionsActions.some((a) => a.kind === 'task'));
    assert.ok(directionsActions.some((a) => a.kind === 'goal'));
    assert.ok(directionsActions.some((a) => a.kind === 'project'));
    assert.ok(directionsActions.some((a) => a.kind === 'stage'));
    assert.ok(directionsActions.some((a) => a.kind === 'folder'));

    // Me actions when modules disabled vs enabled
    const meActionsDisabled = getContextualCreationActions('me', disabledModules);
    assert.ok(!meActionsDisabled.some((a) => a.kind === 'personal_record'));
    assert.ok(!meActionsDisabled.some((a) => a.kind === 'wish'));

    const meActionsEnabled: OptionalModulesSettings = {
      habitsEnabled: true,
      stateCheckInsEnabled: true,
      desiredLifeEnabled: true,
      wishlistEnabled: true,
    };
    const meActionsAll = getContextualCreationActions('me', meActionsEnabled);
    assert.ok(meActionsAll.some((a) => a.kind === 'personal_record'));
    assert.ok(meActionsAll.some((a) => a.kind === 'wish'));
  });

  it('contextual creation preserves destination context without unintended cross-destination side effects', () => {
    const map = createInitialDestinationContextMap('2026-03-29');

    // Directions creation sets originDestination to 'directions' and does not schedule for today
    const directionsCtx = buildInitialCreationContext('directions', map);
    assert.equal(directionsCtx.originDestination, 'directions');
    assert.equal(directionsCtx.targetDate, null);

    // Today creation sets originDestination to 'today' and pre-fills targetDate
    const todayCtx = buildInitialCreationContext('today', map);
    assert.equal(todayCtx.originDestination, 'today');
    assert.equal(todayCtx.targetDate, '2026-03-29');
  });
});
