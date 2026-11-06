import {Icon} from '../ui/icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Disclosure,
  EmptyState,
  InfoSheet,
  PageHeader,
  PillRow,
  RoundButton,
  Row,
  Section,
  Segmented,
  SelectField,
  Sheet,
  SubHeader,
  Toggle,
} from '../ui';
import { InputField, TextAreaField } from '../components/ui/primitives';
import { BasicSettingsView } from './BasicSettingsView';
import { LifeAreasReviewView } from './LifeAreasReviewView';
import { StateCheckInsView } from './StateCheckInsView';
import { WeeklyReviewSheet } from '../components/today/WeeklyReviewSheet';

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
  onSettingsPatch,
  onDataChanged,
  onNavigateToWorkRoster,
  onNavigateToHabits,
  onSettingsConfirmationChange,
  onModalStateChange,
  pwaState,
}) => {
  const [planningReviewOpen, setPlanningReviewOpen] = useState(false);
  const [weeklyOpen, setWeeklyOpen] = useState(false);

  // Guard disabled module subviews so turning a module off hides its screen too
  const effectiveSubView: MeSubViewMode = useMemo(() => {
    if (
      subView === 'records' &&
      settings.modules?.stateCheckInsEnabled === false
    ) {
      return 'overview';
    }
    if (
      subView === 'inspiration' &&
      settings.modules?.desiredLifeEnabled === false
    ) {
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

  const handleSubViewChange = (
    next: MeSubViewMode,
    categoryId?: string | null,
    keepPlanningReview = false
  ) => {
    if (!keepPlanningReview) {
      setPlanningReviewOpen(false);
    }
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
      isInspModalOpen ||
        isWishSheetOpen ||
        isCategoryManagerOpen ||
        confirmDeleteCategoryId
    );
    onModalStateChange?.(anyModal);
    return () => onModalStateChange?.(false);
  }, [
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
    setEditingWishId(null);
    setWishTitleInput('');
    setWishNoteInput('');
    setWishTimingInput(
      wishlistTimingFilter !== 'all' ? wishlistTimingFilter : 'later'
    );
    setWishCategoryInput(
      effectiveCategoryFilter !== 'all' &&
        effectiveCategoryFilter !== 'uncategorized'
        ? effectiveCategoryFilter
        : ''
    );
    setWishPriceInput('');
    setWishCurrencyInput(settings.preferredWishlistCurrency ?? 'UAH');
    setWishLinkInput('');
    setWishProjectInput('');
    setWishMediaIdInput(null);
    setWishPreparedMedia(null);
    setWishStatusInput('want');
    setConfirmWishCurrency(false);
    setQuickNewCatName('');
    setActiveWishChips(new Set());
    setWishFormError(null);
    setIsWishSheetOpen(true);
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
    <div className="space-y-4 pb-8" data-testid="destination-view-me">
      {effectiveSubView === 'overview' ? (
        <PageHeader title={UK_STRINGS.nav.me} />
      ) : (
        <SubHeader
          title={
            effectiveSubView === 'records'
              ? 'Стан'
              : effectiveSubView === 'life_areas'
              ? 'Сфери життя'
              : effectiveSubView === 'inspiration'
              ? 'Моє бажане життя'
              : effectiveSubView === 'wishlist'
              ? 'Список бажань'
              : 'Налаштування'
          }
          onBack={() => handleSubViewChange('overview')}
          actions={
            effectiveSubView === 'inspiration' ? (
              <div className="flex items-center gap-2">
                <InfoSheet title="Моє бажане життя">
                  <p>
                    Простір для описів, фото й орієнтирів без зобов’язань.
                    Необов’язкові питання для роздумів:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 mt-2">
                    <li>Який вигляд має мій звичайний бажаний день?</li>
                    <li>Які люди й стосунки мене оточують?</li>
                    <li>Як я працюю і як відпочиваю?</li>
                    <li>Яке місце займає творчість або розвиток?</li>
                    <li>Чого я хочу більше, а чого — менше?</li>
                  </ul>
                </InfoSheet>
                <RoundButton
                  aria-label="Додати"
                  data-testid="open-inspiration-modal-button"
                  onClick={openNewInspirationModal}
                >
                  +
                </RoundButton>
              </div>
            ) : effectiveSubView === 'wishlist' ? (
              <div className="flex items-center gap-2">
                <RoundButton
                  aria-label="Додати бажання"
                  data-testid="open-add-wish-button"
                  onClick={openNewWishModal}
                >
                  +
                </RoundButton>
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
              </div>
            ) : undefined
          }
        />
      )}

      {/* SUBVIEW: OVERVIEW ("Я" Hub) */}
      {effectiveSubView === 'overview' && (
        <div
          className="space-y-4"
          data-testid="me-subview-overview"
          data-ui="content-start"
        >
          <Section>
            <div data-testid="me-overview-drilldown-list">
              {(
                [
                  ['records', 'Стан'],
                  ['life_areas', 'Сфери життя'],
                  ['inspiration', 'Моє бажане життя'],
                  ['wishlist', 'Список бажань'],
                  ['settings', 'Налаштування'],
                ] as const
              )
                .filter(
                  ([id]) =>
                    (id !== 'records' ||
                      (settings.modules?.stateCheckInsEnabled ?? false)) &&
                    (id !== 'inspiration' ||
                      (settings.modules?.desiredLifeEnabled ?? false)) &&
                    (id !== 'wishlist' ||
                      (settings.modules?.wishlistEnabled ?? false))
                )
                .map(([id, title]) => (
                  <Disclosure
                    key={id}
                    title={title}
                    testId={`me-drilldown-${id.replace('_', '-')}`}
                    onClick={() => handleSubViewChange(id)}
                  />
                ))}
            </div>
          </Section>
          <Section>
            <Disclosure
              title="Щотижневий огляд"
              onClick={() => setWeeklyOpen(true)}
            />
            <Disclosure
              title="Короткий огляд планування"
              testId="me-planning-review"
              onClick={() => {
                setPlanningReviewOpen(true);
                handleSubViewChange('life_areas', undefined, true);
              }}
            />
          </Section>
          {weeklyOpen && (
            <WeeklyReviewSheet
              snapshot={snapshot}
              today={actualTodayDate}
              repositories={repositories}
              onClose={() => setWeeklyOpen(false)}
              onOpenPlan={onOpenPlan}
              onPause={(p) => {
                void repositories
                  .saveProject(
                    {
                      ...p,
                      state: 'paused',
                      updatedAt: new Date().toISOString(),
                    },
                    p.revision
                  )
                  .then(() => onDataChanged());
              }}
              onInspectEvent={onInspectCalendarEvent}
              onChanged={onDataChanged}
            />
          )}
        </div>
      )}

      {/* SUBVIEW: RECORDS ("Стан") */}
      {effectiveSubView === 'records' && (
        <div data-testid="me-subview-records" data-ui="content-start">
          <StateCheckInsView
            events={snapshot.events}
            records={personalRecords}
            today={actualTodayDate}
            zone={activeZone}
            enabled={settings.modules?.stateCheckInsEnabled ?? false}
            repositories={repositories}
            onChanged={() => onDataChanged()}
          />
        </div>
      )}

      {/* SUBVIEW: LIFE AREAS ("Сфери життя") */}
      {effectiveSubView === 'life_areas' && (
        <LifeAreasReviewView
          key={planningReviewOpen ? 'planning' : 'areas'}
          initialPlanningReview={planningReviewOpen}
          snapshot={snapshot}
          zone={activeZone}
          today={actualTodayDate}
          repositories={repositories}
          onChanged={() => onDataChanged()}
          onOpenPlan={onOpenPlan}
          onInspectEvent={onInspectCalendarEvent}
          onModalStateChange={onModalStateChange}
        />
      )}

      {/* SUBVIEW: INSPIRATION ("Моє бажане життя") */}
      {effectiveSubView === 'inspiration' && (
        <div
          className="space-y-4"
          data-testid="me-subview-inspiration"
          data-ui="content-start"
        >
          <Segmented<'preferred_life' | 'saved'>
            label="Колекція"
            value={inspCollectionFilter}
            onChange={setInspCollectionFilter}
            options={[
              { value: 'preferred_life', label: 'Моє бажане життя' },
              { value: 'saved', label: 'Збережене' },
            ]}
          />

          <PillRow<InspirationTypeFilter>
            label="Тип матеріалу"
            value={inspTypeFilter}
            onChange={setInspTypeFilter}
            options={[
              { value: 'all', label: 'Усі' },
              { value: 'favorite', label: 'Вибрані' },
              { value: 'text', label: 'Нотатки' },
              { value: 'quote', label: 'Цитати' },
              { value: 'link', label: 'Посилання' },
              { value: 'image', label: 'Зображення' },
            ]}
          />

          {filteredInspirationItems.length === 0 ? (
            <Section>
              <EmptyState
                text="Ще немає записів"
                action="Додати"
                onAction={openNewInspirationModal}
              />
            </Section>
          ) : (
            <div
              className="grid grid-cols-2 gap-3"
              data-testid="inspiration-items-grid"
            >
              {filteredInspirationItems.map((item) => {
                const imgUrl = item.mediaId
                  ? mediaUrlById.get(item.mediaId)
                  : undefined;
                const linkedGoal = item.goalId
                  ? snapshot.goals.find((g) => g.id === item.goalId)
                  : undefined;
                const linkedArea = item.lifeAreaId
                  ? lifeAreaQuestions.find((a) => a.id === item.lifeAreaId)
                  : undefined;

                return (
                  <article
                    key={item.id}
                    className="rounded-[20px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 flex flex-col justify-between gap-2 min-w-0"
                    data-testid={`inspiration-item-card-${item.id}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[0.6875rem] font-medium text-[var(--text-secondary)] truncate">
                        {INSPIRATION_KIND_LABELS_UK[item.kind]}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleToggleInspirationFavorite(item)}
                        aria-label={
                          item.isFavorite
                            ? 'Прибрати з вибраного'
                            : 'Додати у вибране'
                        }
                        aria-pressed={item.isFavorite}
                        data-testid={`toggle-favorite-inspiration-${item.id}`}
                        className={`w-11 h-11 -mr-2 -mt-2 inline-flex items-center justify-center rounded-full shrink-0 text-sm ${
                          item.isFavorite
                            ? 'text-amber-400'
                            : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        <span aria-hidden="true">
                          <Icon name="star" fill={item.isFavorite?'currentColor':'none'}/>
                        </span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => openEditInspirationModal(item)}
                      data-testid={`open-inspiration-detail-${item.id}`}
                      className="text-left flex-1 flex flex-col gap-1.5 min-h-[48px] min-w-0"
                    >
                      {item.kind === 'image' && imgUrl && (
                        <div className="w-full h-24 rounded-[12px] overflow-hidden bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                          <img
                            src={imgUrl}
                            alt={item.title ?? 'Зображення'}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            data-testid={`inspiration-image-preview-${item.id}`}
                          />
                        </div>
                      )}

                      {item.title && (
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] leading-snug line-clamp-2 break-words">
                          {item.title}
                        </h3>
                      )}

                      {item.contentText && (
                        <p
                          className={`text-xs text-[var(--text-secondary)] line-clamp-3 break-words ${
                            item.kind === 'quote' ? 'italic' : ''
                          }`}
                        >
                          {item.contentText.length > 90
                            ? `${item.contentText.slice(0, 88)}…`
                            : item.contentText}
                        </p>
                      )}

                      {item.kind === 'link' && item.linkUrl && (
                        <span className="text-xs text-[var(--color-brand-text)] truncate block">
                          {safeHostname(item.linkUrl)}
                        </span>
                      )}

                      {linkedArea && !linkedGoal && (
                        <span className="text-[0.6875rem] text-[var(--text-secondary)] truncate block mt-auto pt-1">
                          {linkedArea.questionTextUk}
                        </span>
                      )}
                    </button>

                    {linkedGoal && (
                      <button
                        type="button"
                        onClick={() => onOpenPlan('goal', linkedGoal.id)}
                        className="min-h-[44px] px-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-left text-xs font-medium text-[var(--text-secondary)] truncate w-full"
                      >
                        {`Ціль: ${linkedGoal.title}`}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
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
                  'fulfilled',
                  'archived',
                ] as const
              ).map((scope) => ({
                label: WISH_SCOPE_LABELS_UK[scope],
                onSelect: () => setWishlistViewScope(scope),
              }))}
            >
              <span className="ui-pill px-3 py-2 inline-flex items-center gap-1 text-xs font-medium bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-full whitespace-nowrap">
                {WISH_SCOPE_LABELS_UK[wishlistViewScope]} ⌄
              </span>
            </ActionMenu>
          </div>

          {sortedCategories.length > 0 && (
            <PillRow<WishlistCategoryFilter>
              label="Категорії бажань"
              value={effectiveCategoryFilter}
              onChange={handleSelectCategoryFilter}
              options={[
                { value: 'all', label: 'Усі категорії' },
                { value: 'uncategorized', label: 'Без категорії' },
                ...sortedCategories.map((cat) => ({
                  value: cat.id,
                  label: cat.name,
                })),
              ]}
            />
          )}

          {groupedWishes.totalMatchingCount === 0 ? (
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
              {groupedWishes.wishes.map((wish) => {
                const approxPrice = formatWishApproximatePriceUk(
                  wish.estimatedPrice
                );
                const cat = wish.categoryId
                  ? sortedCategories.find((c) => c.id === wish.categoryId)
                  : undefined;
                const linkedProject = wish.projectId
                  ? projects.find((p) => p.id === wish.projectId)
                  : undefined;
                const wishImgUrl = wish.mediaId
                  ? mediaUrlById.get(wish.mediaId)
                  : undefined;
                const secondaryParts = [
                  approxPrice,
                  WISHLIST_TIMING_LABELS_UK[wish.timing],
                  linkedProject ? linkedProject.title : null,
                ].filter(Boolean);

                return (
                  <div
                    key={wish.id}
                    className="ui-row border-b last:border-b-0 border-[var(--border-subtle)] px-3 py-2 flex items-center gap-3"
                    data-testid={`wish-item-card-${wish.id}`}
                  >
                    <button
                      type="button"
                      onClick={() => openEditWishModal(wish)}
                      data-testid={`edit-wish-button-${wish.id}`}
                      className="flex items-center gap-3 flex-1 min-w-0 min-h-[48px] text-left"
                    >
                      <span
                        className="ui-icon-tile shrink-0 overflow-hidden"
                        aria-hidden="true"
                      >
                        {wishImgUrl ? (
                          <img
                            src={wishImgUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Gift className="w-4 h-4 text-[var(--color-brand-text)]" />
                        )}
                      </span>
                      <span className="ui-row-text">
                        <span>{wish.title}</span>
                        {secondaryParts.length > 0 && (
                          <small data-testid={`wish-price-${wish.id}`}>
                            {secondaryParts.join(' · ')}
                          </small>
                        )}
                      </span>
                    </button>

                    <span className="ui-row-trailing">
                      {cat && (
                        <span className="px-2.5 py-1 rounded-full text-xs bg-[var(--bg-pressed)] text-[var(--text-secondary)] truncate max-w-[100px]">
                          {cat.name}
                        </span>
                      )}
                      <ActionMenu
                        label={`Дії: ${wish.title}`}
                        testId={`wish-actions-${wish.id}`}
                        items={[
                          ...(getWishPurchaseStatus(wish) !== 'purchased'
                            ? [
                                {
                                  label: 'Куплено',
                                  onSelect: () =>
                                    void handleSetWishStatus(wish, 'purchased'),
                                },
                              ]
                            : []),
                          ...(getWishPurchaseStatus(wish) !== 'not_relevant'
                            ? [
                                {
                                  label: 'Більше не актуально',
                                  onSelect: () =>
                                    void handleSetWishStatus(
                                      wish,
                                      'not_relevant'
                                    ),
                                },
                              ]
                            : []),
                          ...(getWishPurchaseStatus(wish) !== 'want'
                            ? [
                                {
                                  label: 'Хочу',
                                  onSelect: () =>
                                    void handleSetWishStatus(wish, 'want'),
                                },
                              ]
                            : []),
                          {
                            label: wish.archived ? 'З архіву' : 'В архів',
                            onSelect: () => void handleToggleArchiveWish(wish),
                          },
                          ...(linkedProject
                            ? [
                                {
                                  label: `Проєкт: ${linkedProject.title}`,
                                  onSelect: () =>
                                    onOpenPlan('project', linkedProject.id),
                                },
                              ]
                            : []),
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
                    </span>
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
            className="flex items-end gap-2"
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
              className="ui-primary text-xs px-4 py-2.5 shrink-0"
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
                          className="ui-primary text-xs px-3 py-2"
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
    </div>
  );
};
