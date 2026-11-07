import {Icon} from '../ui/icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSubScreenTransition } from '../ui/motion';
import {
  Bookmark,
  Compass,
  Gift,
  Heart,
  Settings,
  Sparkles,
} from '../ui/icons';
import {
  EntityId,
  ExactPrice,
  InspirationItem,
  InspirationKind,
  LifeAreaAssessment,
  LifeAreaQuestion,
  MediaAssetMeta,
  PersonalRecord,
  PlanuiDomainSnapshot,
  PlanuiSettings,
  Project,
  RecoverySnapshotRecord,
  SUPPORTED_CURRENCIES,
  SupportedCurrencyCode,
  WishItem,
  WishPurchaseStatus,
  WishlistCategory,
  WishlistTimingGroup,
} from '../domain/types';
import {
  buildInspirationItemRecord,
  isMediaReferencedByLiveOrSnapshots,
  MediaObjectUrlRegistry,
  ValidatedMediaPreparationResult,
  validateAndPrepareRasterMedia,
  validateSafeHttpUrl,
} from '../domain/personalSpace';
import {
  buildWishItemRecord,
  computeWishlistCategoryDeleteImpact,
  filterAndGroupWishes,
  formatExactPriceUk,
  getWishPurchaseStatus,
  setWishArchivedState,
  setWishPurchaseStatus,
  sortWishlistCategories,
  WISH_STATUS_LABELS_UK,
  WISHLIST_TIMING_LABELS_UK,
  WishlistCategoryFilter,
  WishlistTimingFilter,
  WishlistViewScope,
} from '../domain/wishlist';
import { UK_STRINGS } from '../i18n/uk';
import { PwaLifecycleState } from '../pwa/pwaController';
import {
  ImplementedCreationActionKind,
  MeSubViewMode,
} from '../state/shellStore';
import { PlanuiRepositories } from '../storage/repositories';
import {
  ActionMenu,
  Card,
  Disclosure,
  EmptyState,
  InfoSheet,
  InputField,
  Orb,
  PageHeader,
  PillRow,
  RoundButton,
  Row,
  Section,
  Segmented,
  SelectField,
  Sheet,
  Slider,
  SubHeader,
  TextAreaField,
  Toggle,
} from '../ui';
import { BasicSettingsView } from './BasicSettingsView';
import { areaColor, itemColor, resolveArea } from '../domain/modelHelpers';
import { buildLifeReview, projectLifeAreaLinks, ReviewAnswerDraft } from '../domain/lifeAreas';
import { addDaysToLocalDate } from '../domain/temporal';

const AREA_ICONS = [
  'heart-pulse',
  'brain',
  'users',
  'briefcase',
  'wallet',
  'home',
  'book-open',
  'sun',
  'sparkles',
  'compass',
] as const;

const KIND_UK: Record<string, string> = {
  inspiration: 'Матеріал',
  folder: 'Папка',
  goal: 'Ціль',
  project: 'Проєкт',
  task: 'Завдання',
  habit: 'Звичка',
  event: 'Подія',
  wish: 'Бажання',
  reservation: 'Запланована дія',
};

function getErrorMessageUk(err: unknown): string {
  return err instanceof Error ? err.message : 'Сталася неочікувана помилка.';
}

export interface MeWorkspaceViewProps {
  subView: MeSubViewMode;
  activeWishlistCategoryId?: string | null;
  activeZone: string;
  actualTodayDate: string;
  personalRecords: PersonalRecord[];
  lifeAreaQuestions: LifeAreaQuestion[];
  lifeAreaAssessments: LifeAreaAssessment[];
  inspirationItems: InspirationItem[];
  mediaMeta: MediaAssetMeta[];
  mediaBlobs: ReadonlyMap<string, Uint8Array>;
  wishlistCategories: WishlistCategory[];
  wishes: WishItem[];
  projects: Project[];
  settings: PlanuiSettings;
  snapshot: PlanuiDomainSnapshot;
  recoverySnapshots: RecoverySnapshotRecord[];
  repositories: PlanuiRepositories;
  onChangeSubView: (
    subView: MeSubViewMode,
    activeWishlistCategoryId?: string | null
  ) => void;
  onOpenPlan: (kind: 'goal' | 'project', id: string) => void;
  onInspectCalendarEvent: (id: string) => void;
  onOpenGlobalCreation: (initialKind?: ImplementedCreationActionKind) => void;
  onSettingsPatch: (patch: Partial<PlanuiSettings>) => void;
  onDataChanged: (toastMessageUk?: string) => Promise<void>;
  onNavigateToWorkRoster: () => void;
  onNavigateToHabits: () => void;
  onSettingsConfirmationChange?: (open: boolean) => void;
  onModalStateChange?: (open: boolean) => void;
  pwaState?: PwaLifecycleState;
}

const INSPIRATION_KIND_LABELS_UK: Record<InspirationKind, string> = {
  text: 'Нотатка',
  quote: 'Цитата',
  link: 'Посилання',
  image: 'Фото',
};

const WISH_SCOPE_LABELS_UK: Record<WishlistViewScope, string> = {
  active: 'Хочу',
  purchased: 'Куплено',
  not_relevant: 'Більше не актуально',
  fulfilled: 'Здійснено раніше',
  archived: 'Архів',
};

type InspirationTypeFilter =
  | 'all'
  | 'favorite'
  | 'text'
  | 'quote'
  | 'link'
  | 'image';

type WishChipKey =
  | 'price'
  | 'link'
  | 'photo'
  | 'project'
  | 'category'
  | 'timing';

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function formatWishApproximatePriceUk(price: ExactPrice | null): string | null {
  if (!price) return null;
  if (price.currency === 'UAH' && price.amountMinor % 100 === 0) {
    const whole = new Intl.NumberFormat('uk-UA', {
      maximumFractionDigits: 0,
    }).format(BigInt(price.amountMinor) / 100n);
    return `≈ ${whole} грн`;
  }
  const exact = formatExactPriceUk(price);
  return exact ? `≈ ${exact}` : null;
}

export const MeWorkspaceView: React.FC<MeWorkspaceViewProps> = ({
  subView,
  activeWishlistCategoryId,
  activeZone,
  actualTodayDate,
  personalRecords,
  lifeAreaQuestions,
  lifeAreaAssessments,
  inspirationItems,
  mediaMeta,
  mediaBlobs,
  wishlistCategories,
  wishes,
  projects,
  settings,
  snapshot,
  recoverySnapshots,
  repositories,
  onChangeSubView,
  onOpenPlan,
  onInspectCalendarEvent,
  onOpenGlobalCreation,
  onSettingsPatch,
  onDataChanged,
  onNavigateToWorkRoster,
  onNavigateToHabits,
  onSettingsConfirmationChange,
  onModalStateChange,
  pwaState,
}) => {
  // Life Areas Sheet & Review State
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [scoreDraft, setScoreDraft] = useState<number | null>(null);
  const [definitionDraft, setDefinitionDraft] = useState('');
  const [focusDraft, setFocusDraft] = useState(false);
  const [isLinkPickerOpen, setIsLinkPickerOpen] = useState(false);
  const [lifeReviewOpen, setLifeReviewOpen] = useState(false);
  const [reviewStep, setReviewStep] = useState(0);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewAnswerDraft>>({});
  const [activeWishFolderId, setActiveWishFolderId] = useState<string | null>(null);

  // Guard disabled module subviews so turning a module off hides its screen too
  const effectiveSubView: MeSubViewMode = useMemo(() => {
    if (subView === 'inspiration' || subView === 'life_areas') {
      return 'overview';
    }
    if (
      subView === 'wishlist' &&
      settings.modules?.wishlistEnabled === false
    ) {
      return 'overview';
    }
    return subView;
  }, [subView, settings.modules]);

  const modelContext = useMemo(
    () => ({
      folders: snapshot.folders,
      projects,
      goals: snapshot.goals,
      areas: lifeAreaQuestions,
    }),
    [snapshot.folders, projects, snapshot.goals, lifeAreaQuestions]
  );

  const activeLifeAreas = useMemo(() => {
    return [...snapshot.lifeAreaQuestions]
      .filter((a) => !a.archived && !a.mergedIntoId)
      .sort((a, b) => a.order - b.order);
  }, [snapshot.lifeAreaQuestions]);

  const latestAssessmentAnswer = useCallback(
    (id: string) =>
      [...snapshot.lifeAreaAssessments]
        .filter((r) => r.scale?.min === 0)
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
        .flatMap((r) => r.answers)
        .find((a) => a.questionId === id),
    [snapshot.lifeAreaAssessments]
  );

  const selectedArea = useMemo(
    () => activeLifeAreas.find((a) => a.id === selectedAreaId) ?? null,
    [activeLifeAreas, selectedAreaId]
  );

  const links = useMemo(() => projectLifeAreaLinks(snapshot), [snapshot]);

  const relatedLinks = useMemo(() => {
    if (!selectedArea) return [];
    return links.filter((l) => l.effectiveId === selectedArea.id && l.kind !== 'reservation');
  }, [links, selectedArea]);

  const completedTwoWeeksCount = useMemo(() => {
    if (!selectedArea) return 0;
    const twoWeeksAgo = addDaysToLocalDate(actualTodayDate, -13);
    return snapshot.tasks.filter((t) => {
      const matchesArea = t.lifeAreaId === selectedArea.id || t.areaId === selectedArea.id;
      return (
        matchesArea &&
        t.completedAt &&
        t.completedAt.slice(0, 10) >= twoWeeksAgo &&
        t.completedAt.slice(0, 10) <= actualTodayDate
      );
    }).length;
  }, [snapshot.tasks, selectedArea, actualTodayDate]);

  const handleSaveSelectedArea = async () => {
    if (!selectedArea) return;
    try {
      const nowIso = new Date().toISOString();
      const updatedArea: LifeAreaQuestion = {
        ...selectedArea,
        rating: scoreDraft,
        ratedAt: scoreDraft !== null ? nowIso : selectedArea.ratedAt,
        goodEnoughUk: definitionDraft.trim() || null,
        focus: focusDraft,
        updatedAt: nowIso,
        revision: selectedArea.revision + 1,
      };
      await repositories.saveLifeAreaQuestion(updatedArea, selectedArea.revision);

      await repositories.saveLifeAreaAssessment(
        buildLifeReview(
          crypto.randomUUID(),
          [updatedArea],
          { [updatedArea.id]: { score: scoreDraft as ReviewAnswerDraft['score'], attentionNow: focusDraft, usefulChangeUk: null } },
          actualTodayDate,
          actualTodayDate,
          nowIso
        )
      );

      await onDataChanged('Сферу оновлено');
      setSelectedAreaId(null);
    } catch (err) {
      console.error('Failed to save life area', err);
    }
  };

  const currentReviewArea = activeLifeAreas[reviewStep] ?? null;
  const currentReviewAnswer = currentReviewArea
    ? reviewDrafts[currentReviewArea.id] ??
      latestAssessmentAnswer(currentReviewArea.id) ?? {
        score: currentReviewArea.rating ?? null,
        attentionNow: currentReviewArea.focus ?? null,
        usefulChangeUk: null,
      }
    : { score: null, attentionNow: null, usefulChangeUk: null };

  const updateReviewDraft = (id: string, patch: Partial<ReviewAnswerDraft>) => {
    setReviewDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? latestAssessmentAnswer(id) ?? {
          score: null,
          attentionNow: null,
          usefulChangeUk: null,
        }),
        ...patch,
      },
    }));
  };

  const handleSavePeriodicReview = async () => {
    try {
      const nowIso = new Date().toISOString();
      const twoWeeksAgo = addDaysToLocalDate(actualTodayDate, -13);

      await repositories.saveLifeAreaAssessment(
        buildLifeReview(
          crypto.randomUUID(),
          activeLifeAreas,
          reviewDrafts,
          twoWeeksAgo,
          actualTodayDate,
          nowIso
        )
      );

      for (const area of activeLifeAreas) {
        const draft = reviewDrafts[area.id];
        if (draft && (draft.score !== undefined || draft.attentionNow !== undefined)) {
          const updated: LifeAreaQuestion = {
            ...area,
            rating: draft.score !== undefined ? draft.score : area.rating,
            ratedAt: draft.score !== undefined && draft.score !== null ? nowIso : area.ratedAt,
            focus: draft.attentionNow !== undefined ? draft.attentionNow : area.focus,
            updatedAt: nowIso,
            revision: area.revision + 1,
          };
          await repositories.saveLifeAreaQuestion(updated, area.revision);
        }
      }

      await onDataChanged('Огляд сфер збережено');
      setLifeReviewOpen(false);
      setReviewDrafts({});
    } catch (err) {
      console.error('Failed to save periodic review', err);
    }
  };

  const { containerRef: meStageRef, captureOutgoingScreen } =
    useSubScreenTransition(effectiveSubView, (v) => v !== 'overview');

  const handleSubViewChange = (
    next: MeSubViewMode,
    categoryId?: string | null
  ) => {
    captureOutgoingScreen();
    onChangeSubView(next, categoryId);
  };

  // ==========================================================================
  // MEDIA OBJECT URL REGISTRY
  // ==========================================================================
  const urlRegistryRef = useRef<MediaObjectUrlRegistry | null>(null);
  if (!urlRegistryRef.current) {
    urlRegistryRef.current = new MediaObjectUrlRegistry();
  }

  useEffect(() => {
    const registry = urlRegistryRef.current;
    return () => {
      registry?.revokeAll();
    };
  }, []);

  const mediaUrlById = useMemo(() => {
    const registry = urlRegistryRef.current!;
    const activeIds = new Set<string>();
    const map = new Map<string, string>();

    for (const meta of mediaMeta) {
      const rawBytes = mediaBlobs.get(meta.id);
      if (!rawBytes) continue;
      activeIds.add(meta.id);
      const bytes =
        rawBytes instanceof Uint8Array
          ? rawBytes
          : new Uint8Array(
              Object.values(rawBytes as unknown as Record<string, number>)
            );
      const url = registry.getOrCreateUrl(meta.id, bytes, meta.mimeType);
      map.set(meta.id, url);
    }

    for (const meta of mediaMeta) {
      if (!activeIds.has(meta.id)) {
        registry.revokeMediaUrl(meta.id);
      }
    }

    return map;
  }, [mediaMeta, mediaBlobs]);

  // ==========================================================================
  // 1. INSPIRATION ("Моє бажане життя") STATE & HANDLERS
  // ==========================================================================
  const [inspCollectionFilter, setInspCollectionFilter] = useState<
    'preferred_life' | 'saved'
  >('preferred_life');
  const [inspTypeFilter, setInspTypeFilter] =
    useState<InspirationTypeFilter>('all');

  const [isInspModalOpen, setIsInspModalOpen] = useState(false);
  const [editingInspId, setEditingInspId] = useState<EntityId | null>(null);
  const [inspModalCollection, setInspModalCollection] = useState<
    'preferred_life' | 'saved'
  >('preferred_life');
  const [inspModalKind, setInspModalKind] = useState<InspirationKind>('text');
  const [inspModalTitle, setInspModalTitle] = useState('');
  const [inspModalText, setInspModalText] = useState('');
  const [inspModalUrl, setInspModalUrl] = useState('');
  const [inspModalProjectId, setInspModalProjectId] = useState<string>('');
  const [inspModalLifeAreaId, setInspModalLifeAreaId] = useState<string>('');
  const [inspModalGoalId, setInspModalGoalId] = useState<string>('');
  const [inspModalFavorite, setInspModalFavorite] = useState(false);
  const [inspModalPreparedMedia, setInspModalPreparedMedia] =
    useState<ValidatedMediaPreparationResult | null>(null);
  const [inspModalError, setInspModalError] = useState<string | null>(null);
  const [isSavingInspiration, setIsSavingInspiration] = useState(false);
  const inspFileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredInspirationItems = useMemo(() => {
    return [...inspirationItems]
      .filter((item) => {
        if (
          inspCollectionFilter === 'preferred_life'
            ? item.collection === 'saved'
            : item.collection !== 'saved'
        ) {
          return false;
        }
        if (inspTypeFilter === 'favorite') {
          return item.isFavorite;
        }
        if (inspTypeFilter !== 'all' && item.kind !== inspTypeFilter) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [inspirationItems, inspCollectionFilter, inspTypeFilter]);

  const openNewInspirationModal = () => {
    setEditingInspId(null);
    setInspModalCollection(inspCollectionFilter);
    setInspModalKind('text');
    setInspModalTitle('');
    setInspModalText('');
    setInspModalUrl('');
    setInspModalProjectId('');
    setInspModalLifeAreaId('');
    setInspModalGoalId('');
    setInspModalFavorite(false);
    setInspModalPreparedMedia(null);
    setInspModalError(null);
    setIsInspModalOpen(true);
  };

  const openEditInspirationModal = (item: InspirationItem) => {
    setEditingInspId(item.id);
    setInspModalCollection(
      item.collection === 'saved' ? 'saved' : 'preferred_life'
    );
    setInspModalKind(item.kind);
    setInspModalTitle(item.title ?? '');
    setInspModalText(item.contentText ?? '');
    setInspModalUrl(item.linkUrl ?? '');
    setInspModalProjectId(item.projectId ?? '');
    setInspModalLifeAreaId(item.lifeAreaId ?? '');
    setInspModalGoalId(item.goalId ?? '');
    setInspModalFavorite(item.isFavorite);
    setInspModalPreparedMedia(null);
    setInspModalError(null);
    setIsInspModalOpen(true);
  };

  const handleInspirationFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setInspModalError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const mediaId = `media-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const prepared = await validateAndPrepareRasterMedia({
        id: mediaId,
        bytes,
        declaredMimeType: file.type || undefined,
        nowIso: new Date().toISOString(),
      });
      setInspModalPreparedMedia(prepared);
      if (!inspModalTitle.trim()) {
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        setInspModalTitle(baseName);
      }
    } catch (err) {
      setInspModalPreparedMedia(null);
      setInspModalError(getErrorMessageUk(err));
    }
  };

  const handleSaveInspirationModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setInspModalError(null);
    setIsSavingInspiration(true);
    try {
      const nowIso = new Date().toISOString();
      const existing = editingInspId
        ? inspirationItems.find((i) => i.id === editingInspId)
        : undefined;

      if (existing) {
        const trimmedTitle = inspModalTitle.trim() || null;
        const trimmedText = inspModalText.trim() || null;
        let nextLinkUrl: string | null = null;
        if (inspModalKind === 'link' || inspModalUrl.trim()) {
          nextLinkUrl = validateSafeHttpUrl(inspModalUrl);
        } else if (inspModalKind === 'text' || inspModalKind === 'quote') {
          if (!trimmedTitle && !trimmedText) {
            throw new Error('Вкажіть заголовок або текст.');
          }
        }

        const nextMediaId =
          inspModalKind === 'image'
            ? inspModalPreparedMedia?.meta.id ?? existing.mediaId
            : null;
        if (inspModalKind === 'image' && !nextMediaId) {
          throw new Error('Оберіть зображення JPEG, PNG або WebP.');
        }

        const updated: InspirationItem = {
          ...existing,
          kind: inspModalKind,
          collection: inspModalCollection,
          lifeAreaId: inspModalLifeAreaId || null,
          goalId: inspModalGoalId || null,
          title: trimmedTitle,
          contentText: trimmedText,
          linkUrl: nextLinkUrl,
          mediaId: nextMediaId,
          isFavorite: inspModalFavorite,
          projectId: inspModalProjectId || null,
          updatedAt: nowIso,
          revision: existing.revision + 1,
        };

        await repositories.saveInspirationWithMediaTransactionally(
          updated,
          inspModalPreparedMedia ?? undefined
        );
        setIsInspModalOpen(false);
        await onDataChanged('Запис оновлено');
      } else {
        const id = `insp-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        const built = buildInspirationItemRecord({
          id,
          kind: inspModalKind,
          title: inspModalTitle,
          contentText: inspModalText,
          linkUrl: inspModalUrl,
          mediaId:
            inspModalKind === 'image'
              ? inspModalPreparedMedia?.meta.id ?? null
              : null,
          isFavorite: inspModalFavorite,
          projectId: inspModalProjectId || null,
          nowIso,
        });
        const newItem: InspirationItem = {
          ...built,
          collection: inspModalCollection,
          lifeAreaId: inspModalLifeAreaId || null,
          goalId: inspModalGoalId || null,
        };

        await repositories.saveInspirationWithMediaTransactionally(
          newItem,
          inspModalKind === 'image' && inspModalPreparedMedia
            ? inspModalPreparedMedia
            : undefined
        );
        setIsInspModalOpen(false);
        await onDataChanged('Запис додано');
      }
    } catch (err) {
      setInspModalError(getErrorMessageUk(err));
    } finally {
      setIsSavingInspiration(false);
    }
  };

  const handleToggleInspirationFavorite = async (item: InspirationItem) => {
    try {
      const nowIso = new Date().toISOString();
      const updated: InspirationItem = {
        ...item,
        isFavorite: !item.isFavorite,
        updatedAt: nowIso,
        revision: item.revision + 1,
      };
      await repositories.saveInspirationWithMediaTransactionally(updated);
      await onDataChanged();
    } catch {
      // Ignore
    }
  };

  const handleDeleteInspirationItem = async (item: InspirationItem) => {
    try {
      const nowIso = new Date().toISOString();
      let deleteMediaId: string | undefined;
      if (item.mediaId) {
        const stillReferenced = isMediaReferencedByLiveOrSnapshots(
          item.mediaId,
          inspirationItems,
          recoverySnapshots,
          item.id,
          wishes
        );
        if (!stillReferenced) {
          deleteMediaId = item.mediaId;
        }
      }
      await repositories.deleteInspirationItemTransactionally(item.id, nowIso);
      if (deleteMediaId) {
        urlRegistryRef.current?.revokeMediaUrl(deleteMediaId);
      }
      setIsInspModalOpen(false);
      await onDataChanged('Запис видалено');
    } catch (err) {
      setInspModalError(getErrorMessageUk(err));
    }
  };

  // ==========================================================================
  // 2. WISHLIST ("Список бажань") STATE & HANDLERS
  // ==========================================================================
  const [wishlistViewScope, setWishlistViewScope] =
    useState<WishlistViewScope>('active');
  const [wishlistCategoryFilter, setWishlistCategoryFilter] =
    useState<WishlistCategoryFilter>(activeWishlistCategoryId ?? 'all');
  const [wishlistTimingFilter, setWishlistTimingFilter] =
    useState<WishlistTimingFilter>('all');

  useEffect(() => {
    if (
      activeWishlistCategoryId !== undefined &&
      activeWishlistCategoryId !== null
    ) {
      setWishlistCategoryFilter(activeWishlistCategoryId);
    }
  }, [activeWishlistCategoryId]);

  const sortedCategories = useMemo(
    () => sortWishlistCategories(wishlistCategories),
    [wishlistCategories]
  );

  const effectiveCategoryFilter: WishlistCategoryFilter = useMemo(() => {
    if (
      wishlistCategoryFilter === 'all' ||
      wishlistCategoryFilter === 'uncategorized'
    ) {
      return wishlistCategoryFilter;
    }
    const exists = sortedCategories.some(
      (c) => c.id === wishlistCategoryFilter
    );
    return exists ? wishlistCategoryFilter : 'all';
  }, [wishlistCategoryFilter, sortedCategories]);

  const groupedWishes = useMemo(
    () =>
      filterAndGroupWishes({
        wishes,
        viewScope: wishlistViewScope,
        categoryFilter: effectiveCategoryFilter,
        timingFilter: wishlistTimingFilter,
      }),
    [wishes, wishlistViewScope, effectiveCategoryFilter, wishlistTimingFilter]
  );

  const childWishFolders = useMemo(() => {
    return snapshot.folders.filter(
      (f) => f.kind === 'wishes' && (f.parentId ?? null) === activeWishFolderId
    );
  }, [snapshot.folders, activeWishFolderId]);

  const displayWishes = useMemo(() => {
    return groupedWishes.wishes.filter(
      (w) => (w.folderId ?? null) === activeWishFolderId
    );
  }, [groupedWishes.wishes, activeWishFolderId]);

  // Add / Edit Wish Sheet state
  const [isWishSheetOpen, setIsWishSheetOpen] = useState(false);
  const [editingWishId, setEditingWishId] = useState<EntityId | null>(null);
  const [wishTitleInput, setWishTitleInput] = useState('');
  const [wishNoteInput, setWishNoteInput] = useState('');
  const [wishTimingInput, setWishTimingInput] =
    useState<WishlistTimingGroup>('later');
  const [wishCategoryInput, setWishCategoryInput] = useState<string>('');
  const [wishPriceInput, setWishPriceInput] = useState<string>('');
  const [wishCurrencyInput, setWishCurrencyInput] = useState<string>(
    settings.preferredWishlistCurrency ?? 'UAH'
  );
  const [wishLinkInput, setWishLinkInput] = useState<string>('');
  const [wishProjectInput, setWishProjectInput] = useState<string>('');
  const [wishMediaIdInput, setWishMediaIdInput] = useState<string | null>(null);
  const [wishPreparedMedia, setWishPreparedMedia] =
    useState<ValidatedMediaPreparationResult | null>(null);
  const [wishStatusInput, setWishStatusInput] =
    useState<WishPurchaseStatus>('want');
  const [confirmWishCurrency, setConfirmWishCurrency] = useState(false);
  const [activeWishChips, setActiveWishChips] = useState<Set<WishChipKey>>(
    new Set()
  );
  const [quickNewCatName, setQuickNewCatName] = useState('');
  const [wishFormError, setWishFormError] = useState<string | null>(null);
  const [isSavingWish, setIsSavingWish] = useState(false);
  const wishFileInputRef = useRef<HTMLInputElement | null>(null);

  // Category management Sheet state
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<EntityId | null>(
    null
  );
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [confirmDeleteCategoryId, setConfirmDeleteCategoryId] =
    useState<EntityId | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  useEffect(() => {
    const anyModal = Boolean(
      selectedAreaId ||
        lifeReviewOpen ||
        isLinkPickerOpen ||
        isInspModalOpen ||
        isWishSheetOpen ||
        isCategoryManagerOpen ||
        confirmDeleteCategoryId
    );
    onModalStateChange?.(anyModal);
    return () => onModalStateChange?.(false);
  }, [
    selectedAreaId,
    lifeReviewOpen,
    isLinkPickerOpen,
    isInspModalOpen,
    isWishSheetOpen,
    isCategoryManagerOpen,
    confirmDeleteCategoryId,
    onModalStateChange,
  ]);

  const handleSelectCategoryFilter = (next: WishlistCategoryFilter) => {
    setWishlistCategoryFilter(next);
    onChangeSubView(
      'wishlist',
      next === 'all' || next === 'uncategorized' ? null : next
    );
  };

  const toggleWishChip = (chip: WishChipKey) => {
    setActiveWishChips((prev) => {
      const next = new Set(prev);
      if (next.has(chip)) {
        next.delete(chip);
      } else {
        next.add(chip);
      }
      return next;
    });
  };

  const openNewWishModal = () => {
    onOpenGlobalCreation('wish');
  };

  const openEditWishModal = (wish: WishItem) => {
    setEditingWishId(wish.id);
    setWishTitleInput(wish.title);
    setWishNoteInput(wish.note ?? '');
    setWishTimingInput(wish.timing);
    setWishCategoryInput(wish.categoryId ?? '');
    setWishPriceInput(wish.estimatedPrice?.amountDecimal ?? '');
    setWishCurrencyInput(
      wish.estimatedPrice?.currency ??
        settings.preferredWishlistCurrency ??
        'UAH'
    );
    setWishLinkInput(wish.linkUrl ?? '');
    setWishProjectInput(wish.projectId ?? '');
    setWishMediaIdInput(wish.mediaId ?? null);
    setWishPreparedMedia(null);
    const currentStatus = getWishPurchaseStatus(wish);
    setWishStatusInput(
      currentStatus === 'legacy_fulfilled' ? 'purchased' : currentStatus
    );
    setConfirmWishCurrency(false);
    setQuickNewCatName('');
    const initialChips = new Set<WishChipKey>();
    if (wish.estimatedPrice) initialChips.add('price');
    if (wish.linkUrl) initialChips.add('link');
    if (wish.mediaId) initialChips.add('photo');
    if (wish.projectId) initialChips.add('project');
    if (wish.categoryId) initialChips.add('category');
    initialChips.add('timing');
    setActiveWishChips(initialChips);
    setWishFormError(null);
    setIsWishSheetOpen(true);
  };

  const handleWishPhotoChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWishFormError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const id = `media-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const media = await validateAndPrepareRasterMedia({
        id,
        bytes,
        declaredMimeType: file.type || undefined,
        nowIso: new Date().toISOString(),
      });
      setWishMediaIdInput(media.meta.id);
      setWishPreparedMedia(media);
    } catch (err) {
      setWishFormError(getErrorMessageUk(err));
    }
  };

  const handleSaveWishSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    setWishFormError(null);
    setIsSavingWish(true);
    try {
      const nowIso = new Date().toISOString();
      let resolvedCategoryId = wishCategoryInput || null;

      // Support creating a custom category right from the wish sheet
      if (quickNewCatName.trim()) {
        const catId = `wcat-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 7)}`;
        const maxOrder = sortedCategories.reduce(
          (max, c) => Math.max(max, c.order),
          0
        );
        await repositories.saveWishlistCategory({
          id: catId,
          name: quickNewCatName.trim(),
          order: maxOrder + 1,
          createdAt: nowIso,
          updatedAt: nowIso,
          revision: 1,
        });
        resolvedCategoryId = catId;
      }

      const existing = editingWishId
        ? wishes.find((w) => w.id === editingWishId)
        : undefined;
      const id =
        existing?.id ??
        `wish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const { wish: builtWish, explicitCurrencySelected } = buildWishItemRecord(
        {
          id,
          title: wishTitleInput,
          note: wishNoteInput || null,
          categoryId: resolvedCategoryId,
          timing: wishTimingInput,
          rawPriceAmount: wishPriceInput.trim() ? wishPriceInput : null,
          currencyCode: wishPriceInput.trim() ? wishCurrencyInput : null,
          preferredCurrency: settings.preferredWishlistCurrency,
          nowIso,
          existingWish: existing,
          linkUrl: wishLinkInput.trim()
            ? validateSafeHttpUrl(wishLinkInput)
            : null,
          mediaId: wishMediaIdInput,
          projectId: wishProjectInput || null,
          confirmCurrencyChange: confirmWishCurrency,
        }
      );

      const finalWish: WishItem = existing
        ? {
            ...builtWish,
            purchaseStatus: wishStatusInput,
            purchasedAt:
              wishStatusInput === 'purchased'
                ? existing.purchasedAt ?? nowIso
                : existing.purchasedAt ?? null,
          }
        : {
            ...builtWish,
            purchaseStatus: 'want',
            purchasedAt: null,
          };

      await repositories.saveWishItem(finalWish, existing?.revision, {
        media: wishPreparedMedia ?? undefined,
        confirmCurrencyChange: confirmWishCurrency,
      });

      if (
        explicitCurrencySelected &&
        explicitCurrencySelected !== settings.preferredWishlistCurrency
      ) {
        await repositories.updateSettingsPatch(
          { preferredWishlistCurrency: explicitCurrencySelected },
          nowIso
        );
        onSettingsPatch({
          preferredWishlistCurrency: explicitCurrencySelected,
        });
      }

      setIsWishSheetOpen(false);
      await onDataChanged(existing ? 'Бажання оновлено' : 'Бажання додано');
    } catch (err) {
      setWishFormError(getErrorMessageUk(err));
    } finally {
      setIsSavingWish(false);
    }
  };

  const handleSetWishStatus = async (
    wish: WishItem,
    status: WishPurchaseStatus
  ) => {
    try {
      const nowIso = new Date().toISOString();
      const updated = setWishPurchaseStatus(wish, status, nowIso);
      await repositories.saveWishItem(updated, wish.revision);
      await onDataChanged();
    } catch (err) {
      setWishFormError(getErrorMessageUk(err));
    }
  };

  const handleToggleArchiveWish = async (wish: WishItem) => {
    try {
      const nowIso = new Date().toISOString();
      const updated = setWishArchivedState(wish, !wish.archived, nowIso);
      await repositories.saveWishItem(updated, wish.revision);
      await onDataChanged(
        updated.archived ? 'Перенесено в архів' : 'Повернено з архіву'
      );
    } catch (err) {
      setWishFormError(getErrorMessageUk(err));
    }
  };

  const handleDeleteWish = async (wishId: EntityId) => {
    try {
      const nowIso = new Date().toISOString();
      await repositories.deleteWishItemTransactionally(wishId, nowIso);
      setIsWishSheetOpen(false);
      await onDataChanged('Бажання видалено');
    } catch (err) {
      setWishFormError(getErrorMessageUk(err));
    }
  };

  // Category CRUD handlers
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCategoryError(null);
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      setCategoryError('Введіть назву категорії.');
      return;
    }
    try {
      const nowIso = new Date().toISOString();
      const id = `wcat-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;
      const maxOrder = sortedCategories.reduce(
        (max, c) => Math.max(max, c.order),
        0
      );
      const cat: WishlistCategory = {
        id,
        name: trimmed,
        order: maxOrder + 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        revision: 1,
      };
      await repositories.saveWishlistCategory(cat);
      setNewCategoryName('');
      await onDataChanged('Категорію створено');
    } catch (err) {
      setCategoryError(getErrorMessageUk(err));
    }
  };

  const handleSaveRenameCategory = async (cat: WishlistCategory) => {
    setCategoryError(null);
    const trimmed = editingCategoryName.trim();
    if (!trimmed) {
      setCategoryError('Назва категорії не може бути порожньою.');
      return;
    }
    try {
      const nowIso = new Date().toISOString();
      await repositories.saveWishlistCategory(
        {
          ...cat,
          name: trimmed,
          updatedAt: nowIso,
          revision: cat.revision + 1,
        },
        cat.revision
      );
      setEditingCategoryId(null);
      setEditingCategoryName('');
      await onDataChanged('Категорію перейменовано');
    } catch (err) {
      setCategoryError(getErrorMessageUk(err));
    }
  };

  const handleMoveCategoryOrder = async (
    index: number,
    direction: -1 | 1
  ) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sortedCategories.length) return;
    const current = sortedCategories[index];
    const neighbor = sortedCategories[targetIndex];
    try {
      const nowIso = new Date().toISOString();
      await repositories.saveWishlistCategory(
        {
          ...current,
          order: neighbor.order,
          updatedAt: nowIso,
          revision: current.revision + 1,
        },
        current.revision
      );
      await repositories.saveWishlistCategory(
        {
          ...neighbor,
          order: current.order,
          updatedAt: nowIso,
          revision: neighbor.revision + 1,
        },
        neighbor.revision
      );
      await onDataChanged();
    } catch (err) {
      setCategoryError(getErrorMessageUk(err));
    }
  };

  const handleConfirmDeleteCategory = async (categoryId: EntityId) => {
    setCategoryError(null);
    try {
      const nowIso = new Date().toISOString();
      await repositories.deleteWishlistCategoryTransactionally(
        categoryId,
        nowIso
      );
      setConfirmDeleteCategoryId(null);
      if (wishlistCategoryFilter === categoryId) {
        handleSelectCategoryFilter('all');
      }
      await onDataChanged('Категорію видалено');
    } catch (err) {
      setCategoryError(getErrorMessageUk(err));
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  const editingInspItem = editingInspId
    ? inspirationItems.find((i) => i.id === editingInspId) ?? null
    : null;
  const editingWishItem = editingWishId
    ? wishes.find((w) => w.id === editingWishId) ?? null
    : null;

  return (
    <div
      ref={meStageRef}
      data-motion="idle"
      className="space-y-4 pb-8"
      data-testid="destination-view-me"
    >
      {effectiveSubView === 'overview' ? (
        <PageHeader
          title={UK_STRINGS.nav.me}
          actions={
            <button
              type="button"
              className="ui-pill"
              onClick={() => {
                setReviewStep(0);
                setReviewDrafts({});
                setLifeReviewOpen(true);
              }}
            >
              Огляд
            </button>
          }
        />
      ) : (
        <SubHeader
          title={
            effectiveSubView === 'records'
              ? 'Статистика'
              : effectiveSubView === 'wishlist'
              ? 'Список бажань'
              : 'Налаштування'
          }
          onBack={() => handleSubViewChange('overview')}
          actions={
            effectiveSubView === 'wishlist' ? (
              <ActionMenu
                label="Дії списку бажань"
                testId="wishlist-header-menu"
                items={[
                  {
                    label: 'Керувати категоріями',
                    onSelect: () => setIsCategoryManagerOpen(true),
                  },
                ]}
              />
            ) : undefined
          }
        />
      )}

      {/* SUBVIEW: OVERVIEW (Life Areas Are The Screen) */}
      {effectiveSubView === 'overview' && (
        <div
          className="space-y-4"
          data-testid="me-subview-overview"
          data-ui="content-start"
        >
          {/* ONE white card of 10 rows: GEL ORB in area color with thin icon, name, slim bar + "7/10" or "-", dot for "Фокус зараз" */}
          <Card className="life-areas-card">
            {activeLifeAreas.map((area, index) => {
              const answer = latestAssessmentAnswer(area.id);
              const rating = area.rating ?? answer?.score ?? null;
              const color = areaColor(rating);
              const iconName = AREA_ICONS[index % AREA_ICONS.length];
              const isFocus = Boolean(area.focus || answer?.attentionNow);

              return (
                <Row
                  key={area.id}
                  leading={
                    <Orb color={color} size={32}>
                      <Icon name={iconName} size={16} color="rgba(255, 255, 255, 0.95)" />
                    </Orb>
                  }
                  title={area.questionTextUk}
                  trailing={
                    <div className="flex items-center gap-2">
                      <span className="area-score-bar">
                        <i
                          style={{
                            width: rating !== null ? `${rating * 10}%` : '0%',
                            backgroundColor: color,
                          }}
                        />
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-[var(--text-secondary)] w-7 text-right">
                        {rating !== null ? `${rating}/10` : '-'}
                      </span>
                      {isFocus && (
                        <span className="area-focus-dot text-blue-500 font-bold" title="Фокус зараз">
                          ●
                        </span>
                      )}
                      <Icon name="chevron-right" size={16} className="text-[var(--text-secondary)] opacity-50" />
                    </div>
                  }
                  onClick={() => {
                    setSelectedAreaId(area.id);
                    setScoreDraft(rating);
                    setDefinitionDraft(area.goodEnoughUk ?? '');
                    setFocusDraft(isFocus);
                  }}
                />
              );
            })}
          </Card>
        </div>
      )}

      {/* SUBVIEW: RECORDS ("Статистика") */}
      {effectiveSubView === 'records' && (
        <div data-testid="me-subview-records" data-ui="content-start" className="space-y-4">
          <EmptyState text="Статистика з'явиться пізніше" />
        </div>
      )}

      {/* SUBVIEW: WISHLIST ("Список бажань") */}
      {effectiveSubView === 'wishlist' && (
        <div
          className="space-y-3"
          data-testid="me-subview-wishlist"
          data-ui="content-start"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <PillRow<WishlistTimingFilter>
                label="Група наміру"
                value={wishlistTimingFilter}
                onChange={setWishlistTimingFilter}
                options={[
                  { value: 'all', label: 'Усі' },
                  { value: 'now', label: 'Зараз' },
                  { value: 'later', label: 'Пізніше' },
                  { value: 'someday', label: 'Колись' },
                ]}
              />
            </div>

            <ActionMenu
              label="Статус бажань"
              testId="wishlist-status-menu"
              items={(
                [
                  'active',
                  'purchased',
                  'not_relevant',
                  'archived',
                ] as const
              ).map((scope) => ({
                label: WISH_SCOPE_LABELS_UK[scope],
                onSelect: () => setWishlistViewScope(scope),
              }))}
            >
              <span className="ui-pill px-3 py-2 inline-flex items-center gap-1 text-xs font-medium bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-full whitespace-nowrap">
                {WISH_SCOPE_LABELS_UK[wishlistViewScope]} <Icon name="chevron-down" size={14} />
              </span>
            </ActionMenu>
          </div>

          {/* Folder tree first: Breadcrumbs if inside folder, and child folders */}
          {activeWishFolderId && (
            <div className="folder-breadcrumbs flex items-center gap-2 py-1">
              <RoundButton
                aria-label="Назад до всіх папок"
                onClick={() => {
                  const currentFolder = snapshot.folders.find((f) => f.id === activeWishFolderId);
                  setActiveWishFolderId(currentFolder?.parentId ?? null);
                }}
              >
                <Icon name="chevron-left" size={18} />
              </RoundButton>
              <span className="breadcrumb-path font-semibold text-sm">
                {snapshot.folders.find((f) => f.id === activeWishFolderId)?.name ?? 'Папка'}
              </span>
            </div>
          )}

          {/* Child folders for wishes */}
          {childWishFolders.length > 0 && (
            <div className="folders-list space-y-1">
              {childWishFolders.map((folder) => {
                const folderArea = resolveArea(folder, modelContext);
                const folderColor = folderArea ? itemColor(folder, modelContext) : 'var(--color-neutral-slate)';
                const folderWishesCount = wishes.filter((w) => w.folderId === folder.id).length;

                return (
                  <div
                    key={folder.id}
                    className="folder-row flex items-center justify-between p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] cursor-pointer"
                    onClick={() => setActiveWishFolderId(folder.id)}
                  >
                    <div className="folder-info flex items-center gap-2">
                      <Orb color={folderColor} size={24}>
                        <Icon name="folder" size={13} color="rgba(255, 255, 255, 0.95)" />
                      </Orb>
                      <strong className="text-sm font-semibold">{folder.name}</strong>
                    </div>
                    <div className="folder-actions flex items-center gap-2">
                      {folderWishesCount > 0 && (
                        <span className="folder-count text-xs text-[var(--text-secondary)]">
                          {folderWishesCount}
                        </span>
                      )}
                      <Icon name="chevron-right" size={16} className="text-[var(--text-secondary)] opacity-50" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Wish rows */}
          {displayWishes.length === 0 && childWishFolders.length === 0 ? (
            <Section>
              <EmptyState
                text="Список бажань порожній"
                action="Додати"
                actionTestId="empty-add-wish-button"
                onAction={openNewWishModal}
              />
            </Section>
          ) : (
            <Section>
              {displayWishes.map((wish) => {
                const approxPrice = formatWishApproximatePriceUk(wish.estimatedPrice);
                const wishAreaColor = itemColor(wish, modelContext);
                const currentStatus = getWishPurchaseStatus(wish);
                const timingLabel = WISHLIST_TIMING_LABELS_UK[wish.timing];

                return (
                  <div
                    key={wish.id}
                    className="ui-row border-b last:border-b-0 border-[var(--border-subtle)] px-3 py-2 flex items-center gap-3"
                    data-testid={`wish-item-card-${wish.id}`}
                  >
                    {/* Orb tile in area color */}
                    <Orb color={wishAreaColor} size={32}>
                      <Icon name="gift" size={16} color="rgba(255, 255, 255, 0.95)" />
                    </Orb>

                    <button
                      type="button"
                      onClick={() => openEditWishModal(wish)}
                      data-testid={`edit-wish-button-${wish.id}`}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        {wish.title}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mt-0.5">
                        {approxPrice && <span>{approxPrice}</span>}
                        {timingLabel && (
                          <span className="px-1.5 py-0.5 rounded text-[0.6875rem] bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                            {timingLabel}
                          </span>
                        )}
                      </div>

                      {/* Measure bar when set */}
                      {wish.measure && (
                        <div className="wish-measure-block mt-1">
                          <div className="wish-measure-track h-1 bg-[rgba(0,0,0,0.08)] rounded-full overflow-hidden w-28">
                            <div
                              className="wish-measure-fill h-full bg-[var(--text-primary)]"
                              style={{
                                width: wish.measure.target
                                  ? `${Math.min(100, Math.round((wish.measure.current / wish.measure.target) * 100))}%`
                                  : '0%',
                              }}
                            />
                          </div>
                          <span className="text-[0.6875rem] text-[var(--text-secondary)] tabular-nums">
                            {wish.measure.current} / {wish.measure.target ?? '—'} {wish.measure.unit}
                          </span>
                        </div>
                      )}
                    </button>

                    {/* Status menu "Хочу ⌄" (keeping every existing status, never auto-creates tasks) */}
                    <ActionMenu
                      label={`Статус: ${WISH_STATUS_LABELS_UK[currentStatus]}`}
                      items={[
                        { label: 'Хочу', onSelect: () => void handleSetWishStatus(wish, 'want') },
                        { label: 'Куплено', onSelect: () => void handleSetWishStatus(wish, 'purchased') },
                        { label: 'Більше не актуально', onSelect: () => void handleSetWishStatus(wish, 'not_relevant') },
                      ]}
                    >
                      <span className="ui-pill text-xs px-2.5 py-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-full flex items-center gap-1 cursor-pointer">
                        {WISH_STATUS_LABELS_UK[currentStatus]} <Icon name="chevron-down" size={12} />
                      </span>
                    </ActionMenu>

                    {/* ⋯ ActionMenu */}
                    <ActionMenu
                      label={`Дії: ${wish.title}`}
                      testId={`wish-actions-${wish.id}`}
                      items={[
                        ...(currentStatus !== 'purchased'
                          ? [{ label: 'Куплено', onSelect: () => void handleSetWishStatus(wish, 'purchased') }]
                          : []),
                        ...(currentStatus !== 'not_relevant'
                          ? [{ label: 'Більше не актуально', onSelect: () => void handleSetWishStatus(wish, 'not_relevant') }]
                          : []),
                        {
                          label: wish.archived ? 'З архіву' : 'В архів',
                          onSelect: () => void handleToggleArchiveWish(wish),
                        },
                        {
                          label: 'Редагувати',
                          onSelect: () => openEditWishModal(wish),
                        },
                        {
                          label: 'Видалити',
                          onSelect: () => void handleDeleteWish(wish.id),
                        },
                      ]}
                    />
                  </div>
                );
              })}
            </Section>
          )}
        </div>
      )}

      {/* SUBVIEW: SETTINGS ("Налаштування") */}
      {effectiveSubView === 'settings' && (
        <BasicSettingsView
          onConfirmationStateChange={onSettingsConfirmationChange}
          settings={settings}
          activeZone={activeZone}
          snapshot={snapshot}
          recoverySnapshots={recoverySnapshots}
          repositories={repositories}
          onSettingsUpdated={onSettingsPatch}
          onDataReplacedOrReset={onDataChanged}
          onOpenWorkRoster={onNavigateToWorkRoster}
          onOpenHabits={onNavigateToHabits}
          onOpenWishlistCategories={() => {
            handleSubViewChange('wishlist');
            setIsCategoryManagerOpen(true);
          }}
          pwaState={pwaState}
        />
      )}

      {/* ====================================================================
          SHEET 1: INSPIRATION ADD / DETAIL SHEET
          ==================================================================== */}
      <Sheet
        isOpen={isInspModalOpen}
        onClose={() => setIsInspModalOpen(false)}
        title={editingInspItem ? 'Деталі запису' : 'Додати натхнення'}
      >
        <form onSubmit={handleSaveInspirationModal} className="space-y-3.5">
          {inspModalError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 text-xs text-[var(--color-danger)]"
            >
              {inspModalError}
            </div>
          )}

          <Segmented<'preferred_life' | 'saved'>
            label="Колекція запису"
            value={inspModalCollection}
            onChange={setInspModalCollection}
            options={[
              { value: 'preferred_life', label: 'Моє бажане життя' },
              { value: 'saved', label: 'Збережене' },
            ]}
          />

          <Segmented<InspirationKind>
            label="Тип запису"
            value={inspModalKind}
            onChange={setInspModalKind}
            options={[
              { value: 'text', label: 'Нотатка' },
              { value: 'quote', label: 'Цитата' },
              { value: 'link', label: 'Посилання' },
              { value: 'image', label: 'Фото' },
            ]}
          />

          <InputField
            label="Заголовок"
            value={inspModalTitle}
            onChange={(e) => setInspModalTitle(e.target.value)}
            placeholder="Коротка назва або орієнтир"
            data-testid="insp-modal-title-input"
          />

          {inspModalKind === 'link' && (
            <InputField
              label="Посилання (http/https)"
              type="url"
              value={inspModalUrl}
              onChange={(e) => setInspModalUrl(e.target.value)}
              placeholder="https://example.com"
              data-testid="insp-modal-url-input"
            />
          )}

          {inspModalKind === 'image' && (
            <div className="space-y-2">
              <input
                ref={inspFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleInspirationFileChange}
                className="hidden"
                data-testid="insp-modal-file-input"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => inspFileInputRef.current?.click()}
                  className="min-h-[44px] px-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)]"
                >
                  {inspModalPreparedMedia || editingInspItem?.mediaId
                    ? 'Змінити фото'
                    : 'Обрати фото'}
                </button>
                {inspModalPreparedMedia && (
                  <span className="text-xs text-emerald-500">
                    {inspModalPreparedMedia.meta.width}×
                    {inspModalPreparedMedia.meta.height} px
                  </span>
                )}
              </div>
            </div>
          )}

          <TextAreaField
            label={inspModalKind === 'quote' ? 'Текст цитати' : 'Опис або думка'}
            value={inspModalText}
            onChange={(e) => setInspModalText(e.target.value)}
            rows={3}
            placeholder="Запишіть думку, опис бажаного дня або деталі…"
            data-testid="insp-modal-text-input"
          />

          <Section title="Пов’язати як орієнтир">
            <SelectField
              label="Сфера життя (необов’язково)"
              value={inspModalLifeAreaId}
              onChange={(e) => setInspModalLifeAreaId(e.target.value)}
              options={[
                { value: '', label: 'Без сфери' },
                ...lifeAreaQuestions
                  .filter((a) => !a.archived && !a.mergedIntoId)
                  .map((a) => ({ value: a.id, label: a.questionTextUk })),
              ]}
            />
            <SelectField
              label="Ціль (необов’язково)"
              value={inspModalGoalId}
              onChange={(e) => setInspModalGoalId(e.target.value)}
              options={[
                { value: '', label: 'Без цілі' },
                ...snapshot.goals
                  .filter((g) => !g.archived)
                  .map((g) => ({ value: g.id, label: g.title })),
              ]}
            />
            <SelectField
              label="Проєкт (необов’язково)"
              value={inspModalProjectId}
              onChange={(e) => setInspModalProjectId(e.target.value)}
              data-testid="insp-modal-project-select"
              options={[
                { value: '', label: 'Без проєкту' },
                ...projects
                  .filter((p) => !p.archived || p.id === inspModalProjectId)
                  .map((p) => ({ value: p.id, label: p.title })),
              ]}
            />
            <Row
              title="У вибраному"
              trailing={
                <Toggle
                  label="У вибраному"
                  checked={inspModalFavorite}
                  onChange={setInspModalFavorite}
                  testId="insp-modal-favorite-checkbox"
                />
              }
            />
          </Section>

          <p className="text-xs text-[var(--text-secondary)]">
            Підтримуються нотатки, цитати, посилання та фото JPEG, PNG, WebP.
          </p>

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="submit"
              disabled={isSavingInspiration}
              data-testid="save-inspiration-modal-button"
              className="ui-primary w-full font-semibold"
            >
              Зберегти
            </button>

            {editingInspItem && (
              <div className="flex items-center justify-between gap-2">
                {editingInspItem.linkUrl && (
                  <a
                    href={editingInspItem.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`inspiration-external-link-${editingInspItem.id}`}
                    className="min-h-[44px] px-4 inline-flex items-center rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--color-brand-text)]"
                  >
                    Відкрити посилання
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => void handleDeleteInspirationItem(editingInspItem)}
                  data-testid={`delete-inspiration-${editingInspItem.id}`}
                  className="min-h-[44px] px-4 rounded-full text-xs font-medium text-[var(--color-danger)] ml-auto"
                >
                  Видалити
                </button>
              </div>
            )}
          </div>
        </form>
      </Sheet>

      {/* ====================================================================
          SHEET 2: WISHLIST ADD / EDIT SHEET
          ==================================================================== */}
      <Sheet
        isOpen={isWishSheetOpen}
        onClose={() => setIsWishSheetOpen(false)}
        title={editingWishItem ? 'Редагувати бажання' : 'Додати бажання'}
      >
        <form onSubmit={handleSaveWishSheet} className="space-y-3.5">
          {wishFormError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 text-xs text-[var(--color-danger)]"
            >
              {wishFormError}
            </div>
          )}

          <InputField
            label="Назва бажання"
            value={wishTitleInput}
            onChange={(e) => setWishTitleInput(e.target.value)}
            placeholder="Що ви хочете придбати або спробувати?"
            data-testid={
              editingWishItem
                ? 'edit-wish-title-input'
                : 'wishlist-quick-title-input'
            }
          />

          {/* Optional property chips */}
          <div
            className="ui-pill-row"
            data-ui="pill-row"
            role="group"
            aria-label="Додаткові поля бажання"
          >
            {(
              [
                ['price', 'Ціна + валюта'],
                ['link', 'Посилання'],
                ['photo', 'Фото'],
                ['project', 'Проєкт'],
                ['category', 'Власна категорія'],
                ['timing', 'Група наміру'],
              ] as const
            ).map(([chipKey, label]) => (
              <button
                key={chipKey}
                type="button"
                className="ui-pill"
                aria-pressed={activeWishChips.has(chipKey)}
                onClick={() => toggleWishChip(chipKey)}
              >
                {label}
              </button>
            ))}
          </div>

          {activeWishChips.has('price') && (
            <div className="space-y-2.5 p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <InputField
                label="Орієнтовна сума"
                value={wishPriceInput}
                onChange={(e) => setWishPriceInput(e.target.value)}
                placeholder="Наприклад: 3500"
                inputMode="decimal"
                data-testid={
                  editingWishItem
                    ? 'edit-wish-price-input'
                    : 'wishlist-quick-price-input'
                }
              />
              <SelectField
                label="Валюта"
                value={wishCurrencyInput}
                onChange={(e) => setWishCurrencyInput(e.target.value)}
                data-testid={
                  editingWishItem
                    ? 'edit-wish-currency-select'
                    : 'wishlist-quick-currency-select'
                }
                options={Object.values(SUPPORTED_CURRENCIES).map((spec) => ({
                  value: spec.code,
                  label: spec.labelUk,
                }))}
              />
              {editingWishItem?.estimatedPrice &&
                editingWishItem.estimatedPrice.currency !==
                  wishCurrencyInput && (
                  <Row
                    title={`Змінити валюту з ${editingWishItem.estimatedPrice.currency} на ${wishCurrencyInput}`}
                    trailing={
                      <Toggle
                        label="Підтвердити зміну валюти"
                        checked={confirmWishCurrency}
                        onChange={setConfirmWishCurrency}
                        testId="confirm-wish-currency-toggle"
                      />
                    }
                  />
                )}
            </div>
          )}

          {activeWishChips.has('link') && (
            <InputField
              label="Посилання (http/https)"
              type="url"
              value={wishLinkInput}
              onChange={(e) => setWishLinkInput(e.target.value)}
              placeholder="https://example.com"
            />
          )}

          {activeWishChips.has('photo') && (
            <div className="flex items-center gap-2">
              <input
                ref={wishFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleWishPhotoChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => wishFileInputRef.current?.click()}
                className="min-h-[44px] px-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)]"
              >
                {wishMediaIdInput ? 'Змінити фото' : 'Обрати фото'}
              </button>
              {wishMediaIdInput && (
                <button
                  type="button"
                  onClick={() => {
                    setWishMediaIdInput(null);
                    setWishPreparedMedia(null);
                  }}
                  className="min-h-[44px] px-3 rounded-xl text-xs font-medium text-[var(--color-danger)]"
                >
                  Прибрати
                </button>
              )}
            </div>
          )}

          {activeWishChips.has('project') && (
            <Section>
              <SelectField
                label="Проєкт (лише зв’язок)"
                value={wishProjectInput}
                onChange={(e) => setWishProjectInput(e.target.value)}
                data-testid="wish-project-select"
                options={[
                  { value: '', label: 'Без проєкту' },
                  ...projects
                    .filter((p) => !p.archived || p.id === wishProjectInput)
                    .map((p) => ({ value: p.id, label: p.title })),
                ]}
              />
            </Section>
          )}

          {activeWishChips.has('category') && (
            <div className="space-y-2">
              {sortedCategories.length > 0 && (
                <Section>
                  <SelectField
                    label="Категорія"
                    value={wishCategoryInput}
                    onChange={(e) => setWishCategoryInput(e.target.value)}
                    data-testid={
                      editingWishItem
                        ? 'edit-wish-category-select'
                        : 'wishlist-quick-category-select'
                    }
                    options={[
                      { value: '', label: 'Без категорії' },
                      ...sortedCategories.map((c) => ({
                        value: c.id,
                        label: c.name,
                      })),
                    ]}
                  />
                </Section>
              )}
              <InputField
                label="Нова власна категорія"
                value={quickNewCatName}
                onChange={(e) => setQuickNewCatName(e.target.value)}
                placeholder="Наприклад: Для музики"
              />
            </div>
          )}

          {activeWishChips.has('timing') && (
            <Segmented<WishlistTimingGroup>
              label="Група наміру"
              value={wishTimingInput}
              onChange={setWishTimingInput}
              options={[
                { value: 'now', label: 'Зараз' },
                { value: 'later', label: 'Пізніше' },
                { value: 'someday', label: 'Колись' },
              ]}
            />
          )}

          {editingWishItem && (
            <>
              <TextAreaField
                label="Нотатка"
                value={wishNoteInput}
                onChange={(e) => setWishNoteInput(e.target.value)}
                rows={2}
                data-testid="edit-wish-note-input"
              />
              <Segmented<WishPurchaseStatus>
                label="Статус бажання"
                value={wishStatusInput}
                onChange={setWishStatusInput}
                options={[
                  { value: 'want', label: 'Хочу' },
                  { value: 'purchased', label: 'Куплено' },
                  { value: 'not_relevant', label: 'Не актуально' },
                ]}
              />
            </>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="submit"
              disabled={isSavingWish}
              data-testid={
                editingWishItem
                  ? 'confirm-save-wish-button'
                  : 'wishlist-quick-submit-button'
              }
              className="ui-primary w-full font-semibold"
            >
              {editingWishItem ? 'Зберегти зміни' : 'Додати бажання'}
            </button>

            {editingWishItem && (
              <button
                type="button"
                onClick={() => void handleDeleteWish(editingWishItem.id)}
                data-testid={`delete-wish-button-${editingWishItem.id}`}
                className="min-h-[44px] px-4 rounded-full text-xs font-medium text-[var(--color-danger)] self-end"
              >
                Видалити бажання
              </button>
            )}
          </div>
        </form>
      </Sheet>

      {/* ====================================================================
          SHEET 3: WISHLIST CATEGORY MANAGER SHEET
          ==================================================================== */}
      <Sheet
        isOpen={isCategoryManagerOpen}
        onClose={() => {
          setIsCategoryManagerOpen(false);
          setEditingCategoryId(null);
          setConfirmDeleteCategoryId(null);
          setCategoryError(null);
        }}
        title="Категорії бажань"
      >
        <div className="space-y-4">
          {categoryError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 text-xs text-[var(--color-danger)]"
            >
              {categoryError}
            </div>
          )}

          <form
            onSubmit={handleCreateCategory}
            className="flex flex-col gap-2 [&>*]:w-full"
          >
            <div className="flex-1">
              <InputField
                label="Нова категорія"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Наприклад: Книги, Дім, Хобі"
                data-testid="new-wishlist-category-input"
              />
            </div>
            <button
              type="submit"
              data-testid="create-wishlist-category-button"
              className="ui-primary"
            >
              Додати
            </button>
          </form>

          {sortedCategories.length === 0 ? (
            <Section>
              <Row title="Категорій поки немає" />
            </Section>
          ) : (
            <Section title="Ваші категорії">
              {sortedCategories.map((cat, idx) => {
                const isRenaming = editingCategoryId === cat.id;
                const isConfirmingDelete = confirmDeleteCategoryId === cat.id;
                const impact = computeWishlistCategoryDeleteImpact(
                  cat.id,
                  wishes
                );

                return (
                  <div
                    key={cat.id}
                    className="p-3 border-b last:border-b-0 border-[var(--border-subtle)] space-y-2"
                    data-testid={`wishlist-category-row-${cat.id}`}
                  >
                    {isRenaming ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingCategoryName}
                          onChange={(e) =>
                            setEditingCategoryName(e.target.value)
                          }
                          className="flex-1 px-3 py-2 min-h-[44px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] text-sm text-[var(--text-primary)]"
                          data-testid={`rename-category-input-${cat.id}`}
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveRenameCategory(cat)}
                          data-testid={`save-rename-category-${cat.id}`}
                          className="ui-pill text-xs px-3 py-2"
                        >
                          Зберегти
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCategoryId(null)}
                          className="min-h-[44px] px-3 rounded-xl text-xs"
                         aria-label="Скасувати">
                          <Icon name="x"/>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {cat.name}
                          </p>
                          <p className="text-xs text-[var(--text-secondary)]">
                            Бажань: {impact.affectedWishesCount}
                          </p>
                        </div>
                        <ActionMenu
                          label={`Дії категорії: ${cat.name}`}
                          items={[
                            ...(idx > 0
                              ? [
                                  {
                                    label: 'Вище',
                                    onSelect: () =>
                                      void handleMoveCategoryOrder(idx, -1),
                                  },
                                ]
                              : []),
                            ...(idx < sortedCategories.length - 1
                              ? [
                                  {
                                    label: 'Нижче',
                                    onSelect: () =>
                                      void handleMoveCategoryOrder(idx, 1),
                                  },
                                ]
                              : []),
                            {
                              label: 'Перейменувати',
                              onSelect: () => {
                                setEditingCategoryId(cat.id);
                                setEditingCategoryName(cat.name);
                              },
                            },
                            {
                              label: 'Видалити',
                              onSelect: () =>
                                setConfirmDeleteCategoryId(cat.id),
                            },
                          ]}
                        />
                      </div>
                    )}

                    {isConfirmingDelete && (
                      <div
                        className="p-2.5 rounded-xl bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 space-y-2"
                        data-testid={`confirm-delete-category-box-${cat.id}`}
                      >
                        <p className="text-xs text-[var(--color-danger)]">
                          Категорію буде видалено, а бажання залишаться без
                          категорії.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void handleConfirmDeleteCategory(cat.id)
                            }
                            data-testid={`confirm-delete-category-btn-${cat.id}`}
                            className="min-h-[44px] px-3 rounded-xl bg-[var(--color-danger)] text-white text-xs font-medium"
                          >
                            Видалити
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteCategoryId(null)}
                            className="min-h-[44px] px-3 rounded-xl text-xs"
                           aria-label="Скасувати">
                            <Icon name="x"/>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </Section>
          )}
        </div>
      </Sheet>

      {/* ====================================================================
          SHEET 4: LIFE AREA DETAILS & EDIT
          ==================================================================== */}
      <Sheet
        isOpen={selectedArea !== null}
        onClose={() => setSelectedAreaId(null)}
        title={selectedArea?.questionTextUk ?? 'Сфера життя'}
      >
        {selectedArea && (
          <div className="space-y-4">
            {/* Slider 0-10 (unset state; the value floats while dragging) */}
            <div className="p-3.5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  Рівень задоволеності
                </span>
                <span className="text-sm font-bold tabular-nums text-[var(--text-secondary)]">
                  {scoreDraft !== null ? `${scoreDraft}/10` : 'Не визначено'}
                </span>
              </div>
              <Slider
                label="Рівень задоволеності"
                value={scoreDraft}
                min={0}
                max={10}
                step={1}
                onChange={(v) => setScoreDraft(v)}
              />
              {scoreDraft !== null && (
                <button
                  type="button"
                  onClick={() => setScoreDraft(null)}
                  className="text-xs text-[var(--text-secondary)] underline hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Скинути оцінку
                </button>
              )}
            </div>

            {/* Field: "Що означає «достатньо добре» для мене" */}
            <TextAreaField
              label="Що означає «достатньо добре» для мене"
              value={definitionDraft}
              onChange={(e) => setDefinitionDraft(e.target.value)}
              placeholder="Опишіть орієнтир для цієї сфери..."
              rows={3}
            />

            {/* Toggle: "Фокус зараз" */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Фокус зараз</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Приділяти більше уваги у щоденному плануванні
                </p>
              </div>
              <Toggle
                label="Фокус зараз"
                checked={focusDraft}
                onChange={(checked) => setFocusDraft(checked)}
              />
            </div>

            {/* Section: "Що підтримує цю сферу" (items that use this area; effort only as "N кроків за 2 тижні" when > 0; NEVER changes rating) */}
            <Section title="Що підтримує цю сферу">
              {completedTwoWeeksCount > 0 && (
                <div className="px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] bg-[var(--bg-elevated)]/50 rounded-xl mb-1">
                  {completedTwoWeeksCount}{' '}
                  {completedTwoWeeksCount === 1
                    ? 'крок'
                    : completedTwoWeeksCount < 5
                    ? 'кроки'
                    : 'кроків'}{' '}
                  за 2 тижні
                </div>
              )}
              {relatedLinks.length === 0 ? (
                <div className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                  Немає пов'язаних записів
                </div>
              ) : (
                relatedLinks.map((l) => (
                  <Row
                    key={`${l.kind}-${l.id}`}
                    leading={
                      <Orb color={areaColor(selectedArea.rating)} size={24}>
                        <Icon
                          name={
                            l.kind === 'project'
                              ? 'folder'
                              : l.kind === 'goal'
                              ? 'check'
                              : l.kind === 'habit'
                              ? 'sparkles'
                              : 'check'
                          }
                          size={12}
                          color="rgba(255, 255, 255, 0.95)"
                        />
                      </Orb>
                    }
                    title={l.title}
                    secondary={
                      l.kind === 'project'
                        ? 'Проєкт'
                        : l.kind === 'goal'
                        ? 'Ціль'
                        : l.kind === 'habit'
                        ? 'Звичка'
                        : l.kind === 'folder'
                        ? 'Папка'
                        : l.kind === 'event'
                        ? 'Подія'
                        : l.kind === 'inspiration'
                        ? 'Матеріал'
                        : 'Завдання'
                    }
                  />
                ))
              )}
            </Section>

            {/* Rows: "Додати крок" and "Пов'язати запис" */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedAreaId(null);
                  onOpenGlobalCreation?.('task');
                }}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                <Icon name="plus" size={16} /> Додати крок
              </button>
              <button
                type="button"
                onClick={() => setIsLinkPickerOpen(true)}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              >
                <Icon name="link" size={16} /> Пов'язати запис
              </button>
            </div>

            {/* Sticky: "Зберегти" */}
            <div className="sticky bottom-0 pt-3 bg-gradient-to-t from-[var(--bg-surface)] via-[var(--bg-surface)] to-transparent pb-1">
              <button
                type="button"
                onClick={() => void handleSaveSelectedArea()}
                className="ui-primary w-full font-semibold"
              >
                Зберегти
              </button>
            </div>
          </div>
        )}
      </Sheet>

      {/* ====================================================================
          SHEET 5: LINK RECORD TO AREA
          ==================================================================== */}
      <Sheet
        isOpen={isLinkPickerOpen}
        onClose={() => setIsLinkPickerOpen(false)}
        title="Пов'язати запис зі сферою"
      >
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-secondary)]">
            Оберіть елемент, щоб пов'язати його зі сферою «{selectedArea?.questionTextUk}»:
          </p>
          <div className="max-h-[60vh] overflow-y-auto space-y-1">
            {/* Unlinked or other projects */}
            {projects
              .filter((p) => p.lifeAreaId !== selectedArea?.id && !p.archived)
              .map((p) => (
                <Row
                  key={p.id}
                  leading={
                    <Orb color="var(--color-neutral-slate)" size={24}>
                      <Icon name="folder" size={12} color="rgba(255, 255, 255, 0.95)" />
                    </Orb>
                  }
                  title={p.title}
                  secondary="Проєкт"
                  onClick={async () => {
                    if (!selectedArea) return;
                    await repositories.setLifeAreaLink('project', p.id, selectedArea.id, p.revision);
                    await onDataChanged("Проєкт пов'язано зі сферою");
                    setIsLinkPickerOpen(false);
                  }}
                />
              ))}
            {/* Unlinked or other habits */}
            {snapshot.habits
              .filter((h) => h.lifeAreaId !== selectedArea?.id && h.state !== 'archived')
              .map((h) => (
                <Row
                  key={h.id}
                  leading={
                    <Orb color="var(--color-neutral-slate)" size={24}>
                      <Icon name="sparkles" size={12} color="rgba(255, 255, 255, 0.95)" />
                    </Orb>
                  }
                  title={h.name}
                  secondary="Звичка"
                  onClick={async () => {
                    if (!selectedArea) return;
                    await repositories.setLifeAreaLink('habit', h.id, selectedArea.id, h.revision);
                    await onDataChanged("Звичку пов'язано зі сферою");
                    setIsLinkPickerOpen(false);
                  }}
                />
              ))}
            {/* Unlinked open tasks */}
            {snapshot.tasks
              .filter((t) => t.state === 'open' && t.lifeAreaId !== selectedArea?.id)
              .slice(0, 30)
              .map((t) => (
                <Row
                  key={t.id}
                  leading={
                    <Orb color="var(--color-neutral-slate)" size={24}>
                      <Icon name="check" size={12} color="rgba(255, 255, 255, 0.95)" />
                    </Orb>
                  }
                  title={t.title}
                  secondary="Завдання"
                  onClick={async () => {
                    if (!selectedArea) return;
                    await repositories.setLifeAreaLink('task', t.id, selectedArea.id, t.revision);
                    await onDataChanged("Завдання пов'язано зі сферою");
                    setIsLinkPickerOpen(false);
                  }}
                />
              ))}
            {/* Unlinked active wishes */}
            {wishes
              .filter((w) => w.areaId !== selectedArea?.id && !w.archived)
              .map((w) => (
                <Row
                  key={w.id}
                  leading={
                    <Orb color="var(--color-neutral-slate)" size={24}>
                      <Icon name="gift" size={12} color="rgba(255, 255, 255, 0.95)" />
                    </Orb>
                  }
                  title={w.title}
                  secondary="Бажання"
                  onClick={async () => {
                    if (!selectedArea) return;
                    const updatedWish: WishItem = {
                      ...w,
                      areaId: selectedArea.id,
                      updatedAt: new Date().toISOString(),
                      revision: w.revision + 1,
                    };
                    await repositories.saveWishItem(updatedWish, w.revision);
                    await onDataChanged("Бажання пов'язано зі сферою");
                    setIsLinkPickerOpen(false);
                  }}
                />
              ))}
          </div>
        </div>
      </Sheet>

      {/* ====================================================================
          SHEET 6: PERIODIC LIFE AREAS REVIEW
          ==================================================================== */}
      <Sheet
        isOpen={lifeReviewOpen}
        onClose={() => {
          setLifeReviewOpen(false);
          setReviewDrafts({});
        }}
        title="Огляд сфер життя"
      >
        {currentReviewArea && (
          <div className="space-y-4">
            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1.5 py-1">
              {activeLifeAreas.map((area, idx) => {
                const isDone = reviewDrafts[area.id] !== undefined;
                const isCurrent = idx === reviewStep;
                return (
                  <button
                    key={area.id}
                    type="button"
                    aria-label={`Сфера ${idx + 1}: ${area.questionTextUk}`}
                    onClick={() => setReviewStep(idx)}
                    className={`h-2 rounded-full transition-all duration-200 cursor-pointer ${
                      isCurrent
                        ? 'w-6 bg-[var(--text-primary)]'
                        : isDone
                        ? 'w-2 bg-[var(--text-primary)]/50'
                        : 'w-2 bg-[var(--border-subtle)]'
                    }`}
                  />
                );
              })}
            </div>

            {/* Current Area Header */}
            <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <Orb color={areaColor(currentReviewAnswer.score)} size={36}>
                <Icon
                  name={AREA_ICONS[reviewStep % AREA_ICONS.length]}
                  size={18}
                  color="rgba(255, 255, 255, 0.95)"
                />
              </Orb>
              <div>
                <span className="text-xs text-[var(--text-secondary)] font-medium">
                  Сфера {reviewStep + 1} з {activeLifeAreas.length}
                </span>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  {currentReviewArea.questionTextUk}
                </h3>
              </div>
            </div>

            {/* Satisfaction Slider */}
            <div className="p-3.5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  Задоволеність (0–10)
                </span>
                <span className="text-sm font-bold tabular-nums text-[var(--text-secondary)]">
                  {currentReviewAnswer.score !== null
                    ? `${currentReviewAnswer.score}/10`
                    : 'Не визначено'}
                </span>
              </div>
              <Slider
                label="Задоволеність"
                value={currentReviewAnswer.score}
                min={0}
                max={10}
                step={1}
                onChange={(v) =>
                  updateReviewDraft(currentReviewArea.id, {
                    score: v as ReviewAnswerDraft['score'],
                  })
                }
              />
            </div>

            {/* Toggle "Приділити увагу зараз?" */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Приділити увагу зараз?
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Зробити цю сферу фокусною на найближчий період
                </p>
              </div>
              <Toggle
                label="Приділити увагу зараз?"
                checked={Boolean(currentReviewAnswer.attentionNow)}
                onChange={(checked) =>
                  updateReviewDraft(currentReviewArea.id, { attentionNow: checked })
                }
              />
            </div>

            {/* One helpful change via pills */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">
                Одна корисна зміна
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  'Додати регулярну дію',
                  'Створити проєкт',
                  'Звільнити час',
                  'Запланувати зустріч',
                  'Знизити навантаження',
                  'Змінити підхід',
                ].map((pillText) => {
                  const isSelected =
                    currentReviewAnswer.usefulChangeUk === pillText;
                  return (
                    <button
                      key={pillText}
                      type="button"
                      onClick={() =>
                        updateReviewDraft(currentReviewArea.id, {
                          usefulChangeUk: isSelected ? null : pillText,
                        })
                      }
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--text-primary)] text-[var(--bg-surface)] border-[var(--text-primary)]'
                          : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {pillText}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Navigation & Submit footer */}
            <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                disabled={reviewStep === 0}
                onClick={() => setReviewStep((s) => Math.max(0, s - 1))}
                className="ui-pill px-4 py-2 text-xs font-medium disabled:opacity-30 cursor-pointer"
              >
                Назад
              </button>
              {reviewStep < activeLifeAreas.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setReviewStep((s) => s + 1)}
                  className="ui-primary text-xs px-5 py-2 cursor-pointer"
                >
                  Далі
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSavePeriodicReview()}
                  className="ui-primary text-xs px-5 py-2 font-semibold cursor-pointer"
                >
                  Зберегти огляд
                </button>
              )}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
};
