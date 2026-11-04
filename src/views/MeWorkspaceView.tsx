import { LifeAreasReviewView } from './LifeAreasReviewView';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  ChevronRight,
  Compass,
  Edit3,
  ExternalLink,
  Gift,
  HeartHandshake,
  Image as ImageIcon,
  Link2,
  Plus,
  Quote,
  RotateCcw,
  Settings,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Archive,
} from 'lucide-react';
import { UK_STRINGS } from '../i18n/uk';
import {
  ImplementedCreationActionKind,
  MeSubViewMode,
} from '../state/shellStore';
import {
  IanaTimeZone,
  InspirationItem,
  InspirationItemKind,
  LifeAreaAssessment,
  LifeAreaQuestion,
  MediaAssetMeta,
  PersonalRecord,
  PlanuiDomainSnapshot,
  PlanuiSettings,
  Project,
  RecoverySnapshotRecord,
  SUPPORTED_CURRENCIES,
  Scale1To10,
  Scale1To5,
  SupportedCurrencyCode,
  WishItem,
  WishlistCategory,
  WishlistTimingGroup,
} from '../domain/types';
import {
  ENERGY_SCALE_LABELS_UK,
  LIFE_AREA_SCALE_1_10_LABELS_UK,
  MOOD_SCALE_LABELS_UK,
  MediaObjectUrlRegistry,
  PERSONAL_STATE_QUESTIONS_UK,
  STRESS_SCALE_LABELS_UK,
  buildInspirationItemRecord,
  buildLifeAreaAssessmentSnapshot,
  normalizeSimpleTags,
  sortPersonalRecordsChronologically,
  updateLifeAreaQuestionWording,
  updatePersonalRecordInPlace,
  validateAndPrepareRasterMedia,
} from '../domain/personalSpace';
import {
  WISHLIST_TIMING_LABELS_UK,
  WISHLIST_TIMING_ORDER,
  WishlistCategoryFilter,
  WishlistTimingFilter,
  WishlistViewScope,
  buildWishItemRecord,
  computeWishlistCategoryDeleteImpact,
  filterAndGroupWishes,
  formatExactPriceUk,
  fulfillWishItem,
  reopenWishItem,
  setWishArchivedState,
  sortWishlistCategories,
} from '../domain/wishlist';
import { PlanuiRepositories } from '../storage/repositories';
import { BasicSettingsView } from './BasicSettingsView';
import {
  Button,
  Card,
  EmptyStateCard,
  FeedbackBanner,
  InputField,
  ModalSheet,
  SegmentedControl,
  SelectField,
  TextAreaField,
} from '../components/ui/primitives';

export interface MeWorkspaceViewProps {
  onOpenPlan: (kind: 'goal' | 'project', id: string) => void;
  onInspectCalendarEvent: (id: string) => void;
  subView: MeSubViewMode;
  activeWishlistCategoryId: string | null;
  activeZone: IanaTimeZone;
  actualTodayDate: string;
  personalRecords: PersonalRecord[];
  lifeAreaQuestions: LifeAreaQuestion[];
  lifeAreaAssessments: LifeAreaAssessment[];
  inspirationItems: InspirationItem[];
  mediaMeta: MediaAssetMeta[];
  mediaBlobs: Map<string, Uint8Array>;
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
  onOpenGlobalCreation: (
    preferredAction?: ImplementedCreationActionKind
  ) => void;
  onSettingsPatch: (patch: Partial<PlanuiSettings>) => void;
  onDataChanged: (feedbackMessage?: string) => Promise<void>;
  onNavigateToWorkRoster: () => void;
  onNavigateToHabits: () => void;
  onModalStateChange?: (isOpen: boolean) => void;
}

export const MeWorkspaceView: React.FC<MeWorkspaceViewProps> = ({
  onOpenPlan, onInspectCalendarEvent,
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
  onOpenGlobalCreation,
  onSettingsPatch,
  onDataChanged,
  onNavigateToWorkRoster,
  onNavigateToHabits,
  onModalStateChange,
}) => {
  const [initialPlanningReview, setInitialPlanningReview] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // 10.2 Personal Records State
  // ---------------------------------------------------------------------------
  const [recordFilterTag, setRecordFilterTag] = useState<string>('');
  const [recordSearchQuery, setRecordSearchQuery] = useState<string>('');
  const [quickRecordText, setQuickRecordText] = useState<string>('');
  const [quickRecordMood, setQuickRecordMood] = useState<string>('');
  const [quickRecordEnergy, setQuickRecordEnergy] = useState<string>('');
  const [quickRecordStress, setQuickRecordStress] = useState<string>('');
  const [quickRecordTags, setQuickRecordTags] = useState<string>('');
  const [editingRecord, setEditingRecord] = useState<PersonalRecord | null>(
    null
  );
  const [editRecordText, setEditRecordText] = useState<string>('');
  const [editRecordMood, setEditRecordMood] = useState<string>('');
  const [editRecordEnergy, setEditRecordEnergy] = useState<string>('');
  const [editRecordStress, setEditRecordStress] = useState<string>('');
  const [editRecordTags, setEditRecordTags] = useState<string>('');

  // ---------------------------------------------------------------------------
  // 10.3 Life Areas State
  // ---------------------------------------------------------------------------
  const [periodStartDate, setPeriodStartDate] =
    useState<string>(actualTodayDate);
  const [periodEndDate, setPeriodEndDate] = useState<string>(actualTodayDate);
  const [draftScores, setDraftScores] = useState<
    Record<string, Scale1To10 | null>
  >({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [editingQuestion, setEditingQuestion] =
    useState<LifeAreaQuestion | null>(null);
  const [editingQuestionText, setEditingQuestionText] = useState<string>('');

  // ---------------------------------------------------------------------------
  // 10.4 Inspiration & Media State
  // ---------------------------------------------------------------------------
  const [inspFilterKind, setInspFilterKind] = useState<
    'all' | InspirationItemKind | 'favorites'
  >('all');
  const [inspFilterProjectId, setInspFilterProjectId] = useState<string>('');
  const [isInspModalOpen, setIsInspModalOpen] = useState<boolean>(false);
  const [inspKind, setInspKind] = useState<InspirationItemKind>('text');
  const [inspTitle, setInspTitle] = useState<string>('');
  const [inspText, setInspText] = useState<string>('');
  const [inspUrl, setInspUrl] = useState<string>('');
  const [inspProjectId, setInspProjectId] = useState<string>('');
  const [inspFavorite, setInspFavorite] = useState<boolean>(false);
  const [inspImageCandidate, setInspImageCandidate] = useState<{
    bytes: Uint8Array;
    mimeType: string;
    wasOptimized: boolean;
    originalWidth?: number;
    originalHeight?: number;
  } | null>(null);

  const objectUrlRegistryRef = useRef<MediaObjectUrlRegistry | null>(null);
  if (!objectUrlRegistryRef.current) {
    objectUrlRegistryRef.current = new MediaObjectUrlRegistry();
  }

  // Release temporary Object URLs when unmounted (10.4)
  useEffect(() => {
    const reg = objectUrlRegistryRef.current;
    return () => {
      reg?.revokeAll();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 10.5 - 10.7 Wishlist & Flat Categories State
  // ---------------------------------------------------------------------------
  const [wishlistCategoryFilter, setWishlistCategoryFilter] =
    useState<WishlistCategoryFilter>(() =>
      activeWishlistCategoryId ? activeWishlistCategoryId : 'all'
    );
  const [wishlistTimingFilter, setWishlistTimingFilter] =
    useState<WishlistTimingFilter>('all');
  const [wishlistScope, setWishlistScope] =
    useState<WishlistViewScope>('active');

  // Inline fast wish creation with progressive disclosure (10.6)
  const [quickWishTitle, setQuickWishTitle] = useState<string>('');
  const [showQuickWishDetails, setShowQuickWishDetails] =
    useState<boolean>(false);
  const [quickWishNote, setQuickWishNote] = useState<string>('');
  const [quickWishTiming, setQuickWishTiming] =
    useState<WishlistTimingGroup>('later');
  const [quickWishCategoryId, setQuickWishCategoryId] = useState<string>('');
  const [quickWishPriceInput, setQuickWishPriceInput] = useState<string>('');
  const [quickWishCurrency, setQuickWishCurrency] = useState<
    SupportedCurrencyCode | ''
  >('');

  // Wish Edit / Delete modals
  const [editingWish, setEditingWish] = useState<WishItem | null>(null);
  const [editWishTitle, setEditWishTitle] = useState<string>('');
  const [editWishNote, setEditWishNote] = useState<string>('');
  const [editWishTiming, setEditWishTiming] =
    useState<WishlistTimingGroup>('later');
  const [editWishCategoryId, setEditWishCategoryId] = useState<string>('');
  const [editWishPriceInput, setEditWishPriceInput] = useState<string>('');
  const [editWishCurrency, setEditWishCurrency] = useState<
    SupportedCurrencyCode | ''
  >('');
  const [deletingWish, setDeletingWish] = useState<WishItem | null>(null);

  // Category Manager modal
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] =
    useState<boolean>(false);
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(
    null
  );
  const [renamingCategoryText, setRenamingCategoryText] = useState<string>('');
  const [deletingCategory, setDeletingCategory] =
    useState<WishlistCategory | null>(null);

  const [isSettingsModalOpen, setIsSettingsModalOpen] =
    useState<boolean>(false);

  // Sync modal state upward so FloatingShell hides global button during sheet editing (C17)
  useEffect(() => {
    const anyModal =
      Boolean(editingRecord) ||
      Boolean(editingQuestion) ||
      isInspModalOpen ||
      Boolean(editingWish) ||
      Boolean(deletingWish) ||
      isCategoryManagerOpen ||
      isSettingsModalOpen;
    onModalStateChange?.(anyModal);
  }, [
    editingRecord,
    editingQuestion,
    isInspModalOpen,
    editingWish,
    deletingWish,
    isCategoryManagerOpen,
    isSettingsModalOpen,
    onModalStateChange,
  ]);

  // Keep category filter in sync with shell context
  useEffect(() => {
    if (
      wishlistCategoryFilter !== 'all' &&
      wishlistCategoryFilter !== 'uncategorized'
    ) {
      if (activeWishlistCategoryId !== wishlistCategoryFilter) {
        onChangeSubView(subView, wishlistCategoryFilter);
      }
      setQuickWishCategoryId(wishlistCategoryFilter);
    } else if (activeWishlistCategoryId !== null) {
      onChangeSubView(subView, null);
    }
  }, [wishlistCategoryFilter]);

  // Sorted records & categories
  const sortedPersonalRecords = useMemo(
    () => sortPersonalRecordsChronologically(personalRecords),
    [personalRecords]
  );

  const allRecordTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of personalRecords) {
      for (const t of r.tags) {
        set.add(t);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'uk'));
  }, [personalRecords]);

  const filteredPersonalRecords = useMemo(() => {
    const q = recordSearchQuery.trim().toLowerCase();
    return sortedPersonalRecords.filter((rec) => {
      if (recordFilterTag && !rec.tags.includes(recordFilterTag)) {
        return false;
      }
      if (q) {
        const textMatch = rec.text?.toLowerCase().includes(q) ?? false;
        const dateMatch = rec.localDate.includes(q);
        const tagMatch = rec.tags.some((t) => t.toLowerCase().includes(q));
        if (!textMatch && !dateMatch && !tagMatch) return false;
      }
      return true;
    });
  }, [sortedPersonalRecords, recordFilterTag, recordSearchQuery]);

  const sortedLifeQuestions = useMemo(
    () => [...lifeAreaQuestions].sort((a, b) => a.order - b.order),
    [lifeAreaQuestions]
  );

  const sortedAssessments = useMemo(
    () =>
      [...lifeAreaAssessments].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      ),
    [lifeAreaAssessments]
  );

  const sortedCategories = useMemo(
    () => sortWishlistCategories(wishlistCategories),
    [wishlistCategories]
  );

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of wishlistCategories) {
      map.set(c.id, c.name);
    }
    return map;
  }, [wishlistCategories]);

  const groupedWishes = useMemo(
    () =>
      filterAndGroupWishes({
        wishes,
        categoryFilter: wishlistCategoryFilter,
        timingFilter: wishlistTimingFilter,
        viewScope: wishlistScope,
      }),
    [wishes, wishlistCategoryFilter, wishlistTimingFilter, wishlistScope]
  );

  const activeWishCount = useMemo(
    () => wishes.filter((w) => !w.archived && w.state === 'active').length,
    [wishes]
  );
  const fulfilledWishCount = useMemo(
    () => wishes.filter((w) => !w.archived && w.state === 'fulfilled').length,
    [wishes]
  );
  const archivedWishCount = useMemo(
    () => wishes.filter((w) => w.archived).length,
    [wishes]
  );

  const filteredInspirationItems = useMemo(() => {
    return [...inspirationItems]
      .filter((item) => {
        if (inspFilterKind === 'favorites' && !item.isFavorite) return false;
        if (
          inspFilterKind !== 'all' &&
          inspFilterKind !== 'favorites' &&
          item.kind !== inspFilterKind
        ) {
          return false;
        }
        if (inspFilterProjectId && item.projectId !== inspFilterProjectId) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [inspirationItems, inspFilterKind, inspFilterProjectId]);

  const mediaMetaById = useMemo(() => {
    const map = new Map<string, MediaAssetMeta>();
    for (const m of mediaMeta) {
      map.set(m.id, m);
    }
    return map;
  }, [mediaMeta]);

  const currencySelectOptions = useMemo(
    () =>
      (Object.keys(SUPPORTED_CURRENCIES) as SupportedCurrencyCode[]).map(
        (code) => ({
          value: code,
          label: SUPPORTED_CURRENCIES[code].labelUk,
        })
      ),
    []
  );

  // ---------------------------------------------------------------------------
  // Handlers: 10.2 Personal Records
  // ---------------------------------------------------------------------------
  const handleSaveQuickRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    try {
      const nowIso = new Date().toISOString();
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const mood = quickRecordMood
        ? (Number(quickRecordMood) as Scale1To5)
        : null;
      const energy = quickRecordEnergy
        ? (Number(quickRecordEnergy) as Scale1To5)
        : null;
      const stress = quickRecordStress
        ? (Number(quickRecordStress) as Scale1To5)
        : null;
      const tags = normalizeSimpleTags(
        quickRecordTags ? quickRecordTags.split(',') : []
      );

      await repositories.savePersonalRecord({
        id,
        recordedAt: nowIso,
        localDate: actualTodayDate,
        zoneId: activeZone,
        text: quickRecordText.trim() ? quickRecordText.trim() : null,
        mood,
        energy,
        stress,
        tags,
        createdAt: nowIso,
        updatedAt: nowIso,
        revision: 1,
      });

      setQuickRecordText('');
      setQuickRecordMood('');
      setQuickRecordEnergy('');
      setQuickRecordStress('');
      setQuickRecordTags('');
      await onDataChanged('Особистий запис збережено.');
    } catch (err) {
      // 10.8: Handle quota/validation failures without discarding entered text
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Не вдалося зберегти особистий запис.'
      );
    }
  };

  const handleSaveEditedRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    setLocalError(null);
    try {
      const nowIso = new Date().toISOString();
      const updated = updatePersonalRecordInPlace(
        editingRecord,
        {
          text: editRecordText,
          mood: editRecordMood ? (Number(editRecordMood) as Scale1To5) : null,
          energy: editRecordEnergy
            ? (Number(editRecordEnergy) as Scale1To5)
            : null,
          stress: editRecordStress
            ? (Number(editRecordStress) as Scale1To5)
            : null,
          tags: editRecordTags ? editRecordTags.split(',') : [],
        },
        nowIso
      );
      await repositories.savePersonalRecord(updated, editingRecord.revision);
      setEditingRecord(null);
      await onDataChanged('Особистий запис оновлено.');
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Не вдалося оновити особистий запис.'
      );
    }
  };

  const handleDeleteRecord = async (rec: PersonalRecord) => {
    setLocalError(null);
    try {
      await repositories.deletePersonalRecordTransactionally(
        rec.id,
        new Date().toISOString()
      );
      if (editingRecord?.id === rec.id) {
        setEditingRecord(null);
      }
      await onDataChanged('Особистий запис видалено.');
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Не вдалося видалити особистий запис.'
      );
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers: 10.3 Life Areas
  // ---------------------------------------------------------------------------
  const handleSaveLifeAreaAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    try {
      const nowIso = new Date().toISOString();
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `la-assess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const built = buildLifeAreaAssessmentSnapshot({
        id,
        periodStartLocalDate: periodStartDate,
        periodEndLocalDate: periodEndDate,
        questions: sortedLifeQuestions,
        scoresByQuestionId: draftScores,
        notesByQuestionId: draftNotes,
        nowIso,
      });

      await repositories.saveLifeAreaAssessment(built);
      setDraftScores({});
      setDraftNotes({});
      await onDataChanged('Оцінку сфер життя збережено.');
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Не вдалося зберегти оцінку сфер життя.'
      );
    }
  };

  const handleSaveEditedQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;
    setLocalError(null);
    try {
      const nowIso = new Date().toISOString();
      const updated = updateLifeAreaQuestionWording(
        editingQuestion,
        editingQuestionText,
        nowIso
      );
      await repositories.saveLifeAreaQuestion(updated, editingQuestion.revision);
      setEditingQuestion(null);
      await onDataChanged(
        'Формулювання запитання оновлено (попередні оцінки зберегли тогочасну версію).'
      );
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Не вдалося оновити формулювання запитання.'
      );
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers: 10.4 Inspiration & Media
  // ---------------------------------------------------------------------------
  const handleSelectInspirationImage = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) {
      setInspImageCandidate(null);
      return;
    }
    setLocalError(null);
    try {
      const rawBuffer = await file.arrayBuffer();
      const rawBytes = new Uint8Array(rawBuffer);

      // First validate actual binary magic bytes and header dimensions
      const tempValidation = await validateAndPrepareRasterMedia({
        id: 'temp-check',
        bytes: rawBytes,
        declaredMimeType: file.type,
        nowIso: new Date().toISOString(),
      });

      // Optional canvas downscaling if dimensions exceed 1920px
      let finalBytes = rawBytes;
      let finalMime: string = tempValidation.meta.mimeType;
      let wasOptimized = false;
      const origW = tempValidation.meta.width;
      const origH = tempValidation.meta.height;

      if (
        (origW > 1920 || origH > 1920) &&
        typeof document !== 'undefined' &&
        typeof createImageBitmap === 'function'
      ) {
        try {
          const blob = new Blob([rawBytes as unknown as BlobPart], {
            type: tempValidation.meta.mimeType,
          });
          const bitmap = await createImageBitmap(blob);
          const scale = Math.min(
            1920 / bitmap.width,
            1920 / bitmap.height,
            1
          );
          if (scale < 1) {
            const targetW = Math.max(1, Math.round(bitmap.width * scale));
            const targetH = Math.max(1, Math.round(bitmap.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(bitmap, 0, 0, targetW, targetH);
              const outBlob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, 'image/webp', 0.86)
              );
              if (outBlob && outBlob.size < rawBytes.byteLength) {
                const optBuf = await outBlob.arrayBuffer();
                finalBytes = new Uint8Array(optBuf);
                finalMime = 'image/webp';
                wasOptimized = true;
              }
            }
          }
          bitmap.close();
        } catch {
          // Fallback to original validated raster bytes if canvas optimization is unavailable
        }
      }

      setInspImageCandidate({
        bytes: finalBytes,
        mimeType: finalMime,
        wasOptimized,
        originalWidth: origW,
        originalHeight: origH,
      });
    } catch (err) {
      setInspImageCandidate(null);
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Не вдалося перевірити зображення.'
      );
    }
  };

  const handleSaveInspiration = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    try {
      const nowIso = new Date().toISOString();
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `insp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      let preparedMedia:
        | { meta: MediaAssetMeta; bytes: Uint8Array }
        | undefined = undefined;
      let optNotice = '';
      if (inspKind === 'image') {
        if (!inspImageCandidate) {
          throw new Error(
            'Оберіть растрове зображення (JPEG, PNG або WebP) для збереження.'
          );
        }
        const mediaId =
          typeof crypto !== 'undefined' &&
          typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const prepared = await validateAndPrepareRasterMedia({
          id: mediaId,
          bytes: inspImageCandidate.bytes,
          declaredMimeType: inspImageCandidate.mimeType,
          wasOptimized: inspImageCandidate.wasOptimized,
          originalWidth: inspImageCandidate.originalWidth,
          originalHeight: inspImageCandidate.originalHeight,
          nowIso,
        });

        preparedMedia = prepared;
        if (prepared.meta.optimizationNoteUk) {
          optNotice = ` (${prepared.meta.optimizationNoteUk})`;
        }
      }

      const item = buildInspirationItemRecord({
        id,
        kind: inspKind,
        title: inspTitle,
        contentText: inspText,
        linkUrl: inspUrl,
        mediaId: preparedMedia?.meta.id ?? null,
        isFavorite: inspFavorite,
        projectId: inspProjectId || null,
        nowIso,
      });

      await repositories.saveInspirationWithMediaTransactionally(
        item,
        preparedMedia
      );
      setIsInspModalOpen(false);
      setInspTitle('');
      setInspText('');
      setInspUrl('');
      setInspImageCandidate(null);
      setInspFavorite(false);
      await onDataChanged(`Елемент натхнення збережено${optNotice}.`);
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Не вдалося зберегти елемент натхнення.'
      );
    }
  };

  const handleToggleInspirationFavorite = async (item: InspirationItem) => {
    setLocalError(null);
    try {
      await repositories.saveInspirationWithMediaTransactionally(
        {
          ...item,
          isFavorite: !item.isFavorite,
          updatedAt: new Date().toISOString(),
          revision: item.revision + 1,
        },
        undefined,
        item.revision
      );
      await onDataChanged();
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Не вдалося оновити елемент.'
      );
    }
  };

  const handleDeleteInspiration = async (item: InspirationItem) => {
    setLocalError(null);
    try {
      await repositories.deleteInspirationItemTransactionally(
        item.id,
        new Date().toISOString()
      );
      if (item.mediaId) {
        objectUrlRegistryRef.current?.revokeMediaUrl(item.mediaId);
      }
      await onDataChanged('Елемент натхнення видалено.');
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Не вдалося видалити елемент натхнення.'
      );
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers: 10.5 - 10.7 Wishlist & Flat Categories
  // ---------------------------------------------------------------------------
  const handleQuickCreateWish = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    try {
      const nowIso = new Date().toISOString();
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `wish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const built = buildWishItemRecord({
        id,
        title: quickWishTitle,
        note: quickWishNote,
        categoryId: quickWishCategoryId || null,
        timing: quickWishTiming,
        rawPriceAmount: quickWishPriceInput,
        currencyCode: quickWishCurrency ? quickWishCurrency : null,
        preferredCurrency: settings.preferredWishlistCurrency,
        nowIso,
      });

      await repositories.saveWishItem(built.wish);

      // 10.7: Persist preferred currency when first chosen
      if (
        built.explicitCurrencySelected &&
        !settings.preferredWishlistCurrency
      ) {
        const updatedSettings = await repositories.updateSettingsPatch({
          preferredWishlistCurrency: built.explicitCurrencySelected,
        });
        onSettingsPatch(updatedSettings);
      }

      setQuickWishTitle('');
      setQuickWishNote('');
      setQuickWishPriceInput('');
      setQuickWishTiming('later');
      setShowQuickWishDetails(false);
      await onDataChanged(`Бажання «${built.wish.title}» додано.`);
    } catch (err) {
      // 10.8: Preserve entered text on validation or storage error
      setLocalError(
        err instanceof Error ? err.message : 'Не вдалося зберегти бажання.'
      );
    }
  };

  const openEditWishModal = (wish: WishItem) => {
    setEditingWish(wish);
    setEditWishTitle(wish.title);
    setEditWishNote(wish.note ?? '');
    setEditWishTiming(wish.timing);
    setEditWishCategoryId(wish.categoryId ?? '');
    setEditWishPriceInput(
      wish.estimatedPrice
        ? wish.estimatedPrice.amountDecimal.replace('.', ',')
        : ''
    );
    setEditWishCurrency(
      wish.estimatedPrice?.currency ?? settings.preferredWishlistCurrency ?? ''
    );
    setLocalError(null);
  };

  const handleSaveEditedWish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWish) return;
    setLocalError(null);
    try {
      const nowIso = new Date().toISOString();
      const built = buildWishItemRecord({
        id: editingWish.id,
        title: editWishTitle,
        note: editWishNote,
        categoryId: editWishCategoryId || null,
        timing: editWishTiming,
        rawPriceAmount: editWishPriceInput,
        currencyCode: editWishCurrency ? editWishCurrency : null,
        preferredCurrency:
          editingWish.estimatedPrice?.currency ??
          settings.preferredWishlistCurrency,
        nowIso,
        existingWish: editingWish,
      });

      await repositories.saveWishItem(built.wish, editingWish.revision);

      if (
        built.explicitCurrencySelected &&
        !settings.preferredWishlistCurrency
      ) {
        const updatedSettings = await repositories.updateSettingsPatch({
          preferredWishlistCurrency: built.explicitCurrencySelected,
        });
        onSettingsPatch(updatedSettings);
      }

      setEditingWish(null);
      await onDataChanged(`Бажання «${built.wish.title}» оновлено.`);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Не вдалося оновити бажання.'
      );
    }
  };

  const handleToggleWishFulfilled = async (wish: WishItem) => {
    setLocalError(null);
    try {
      const nowIso = new Date().toISOString();
      const next =
        wish.state === 'active'
          ? fulfillWishItem(wish, nowIso)
          : reopenWishItem(wish, nowIso);
      await repositories.saveWishItem(next, wish.revision);
      await onDataChanged(
        next.state === 'fulfilled'
          ? `Бажання «${wish.title}» позначено як здійснене (без запису фінансової витрати).`
          : `Бажання «${wish.title}» повернуто до активних.`
      );
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Не вдалося змінити стан бажання.'
      );
    }
  };

  const handleToggleWishArchived = async (wish: WishItem) => {
    setLocalError(null);
    try {
      const nowIso = new Date().toISOString();
      const next = setWishArchivedState(wish, !wish.archived, nowIso);
      await repositories.saveWishItem(next, wish.revision);
      await onDataChanged(
        next.archived
          ? `Бажання «${wish.title}» переміщено в архів.`
          : `Бажання «${wish.title}» відновлено з архіву.`
      );
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Не вдалося оновити архівний стан бажання.'
      );
    }
  };

  const handleConfirmDeleteWish = async () => {
    if (!deletingWish) return;
    setLocalError(null);
    try {
      await repositories.deleteWishItemTransactionally(
        deletingWish.id,
        new Date().toISOString()
      );
      const deletedTitle = deletingWish.title;
      setDeletingWish(null);
      await onDataChanged(`Бажання «${deletedTitle}» видалено.`);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Не вдалося видалити бажання.'
      );
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    try {
      const nowIso = new Date().toISOString();
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `wcat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      await repositories.saveWishlistCategory({
        id,
        name: newCategoryName,
        order: sortedCategories.length,
        createdAt: nowIso,
        updatedAt: nowIso,
        revision: 1,
      });
      setNewCategoryName('');
      await onDataChanged('Категорію бажань створено.');
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Не вдалося створити категорію.'
      );
    }
  };

  const handleRenameCategory = async (cat: WishlistCategory) => {
    setLocalError(null);
    try {
      const nowIso = new Date().toISOString();
      await repositories.saveWishlistCategory(
        {
          ...cat,
          name: renamingCategoryText,
          updatedAt: nowIso,
          revision: cat.revision + 1,
        },
        cat.revision
      );
      setRenamingCategoryId(null);
      setRenamingCategoryText('');
      await onDataChanged('Назву категорії оновлено.');
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Не вдалося перейменувати категорію.'
      );
    }
  };

  const handleMoveCategoryOrder = async (
    index: number,
    direction: -1 | 1
  ) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sortedCategories.length) return;
    const ids = sortedCategories.map((c) => c.id);
    const temp = ids[index];
    ids[index] = ids[targetIndex];
    ids[targetIndex] = temp;
    try {
      await repositories.reorderWishlistCategoriesTransactionally(
        ids,
        new Date().toISOString()
      );
      await onDataChanged();
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Не вдалося змінити порядок категорій.'
      );
    }
  };

  const handleConfirmDeleteCategory = async () => {
    if (!deletingCategory) return;
    setLocalError(null);
    try {
      const res = await repositories.deleteWishlistCategoryTransactionally(
        deletingCategory.id,
        new Date().toISOString()
      );
      if (wishlistCategoryFilter === deletingCategory.id) {
        setWishlistCategoryFilter('all');
      }
      setDeletingCategory(null);
      await onDataChanged(
        `Категорію видалено. Бажань переведено в «Без категорії»: ${res.reassignedWishesCount}.`
      );
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Не вдалося видалити категорію.'
      );
    }
  };

  // Scale options for 1-5 state inputs
  const moodScaleOptions = [
    { value: '', label: UK_STRINGS.creation.recordForm.notSelectedOption },
    { value: '1', label: MOOD_SCALE_LABELS_UK[1] },
    { value: '2', label: MOOD_SCALE_LABELS_UK[2] },
    { value: '3', label: MOOD_SCALE_LABELS_UK[3] },
    { value: '4', label: MOOD_SCALE_LABELS_UK[4] },
    { value: '5', label: MOOD_SCALE_LABELS_UK[5] },
  ];

  const energyScaleOptions = [
    { value: '', label: UK_STRINGS.creation.recordForm.notSelectedOption },
    { value: '1', label: ENERGY_SCALE_LABELS_UK[1] },
    { value: '2', label: ENERGY_SCALE_LABELS_UK[2] },
    { value: '3', label: ENERGY_SCALE_LABELS_UK[3] },
    { value: '4', label: ENERGY_SCALE_LABELS_UK[4] },
    { value: '5', label: ENERGY_SCALE_LABELS_UK[5] },
  ];

  const stressScaleOptions = [
    { value: '', label: UK_STRINGS.creation.recordForm.notSelectedOption },
    { value: '1', label: STRESS_SCALE_LABELS_UK[1] },
    { value: '2', label: STRESS_SCALE_LABELS_UK[2] },
    { value: '3', label: STRESS_SCALE_LABELS_UK[3] },
    { value: '4', label: STRESS_SCALE_LABELS_UK[4] },
    { value: '5', label: STRESS_SCALE_LABELS_UK[5] },
  ];

  return (
    <div className="space-y-5" data-testid="destination-view-me">
      {/* Header with drill-down back button when inside a subsection */}
      <header className="space-y-2">
        {subView !== 'overview' && (
          <button
            type="button"
            onClick={() => {
              setLocalError(null);
              onChangeSubView('overview', null);
            }}
            data-testid="me-back-to-overview-button"
            className="inline-flex items-center gap-1.5 text-[14px] font-medium px-2.5 py-1.5 rounded-xl cursor-pointer planui-transition-micro"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Усі розділи «Я»</span>
          </button>
        )}

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-[32px] font-bold tracking-tight leading-tight m-0">
              {subView === 'overview'
                ? UK_STRINGS.destinations.me.title
                : subView === 'records'
                ? 'Особисті записи та стан'
                : subView === 'life_areas'
                ? 'Сфери життя'
                : subView === 'inspiration'
                ? 'Натхнення та медіа'
                : subView === 'wishlist'
                ? 'Список бажань'
                : 'Налаштування'}
            </h1>
            <p
              className="text-[15px] m-0 mt-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              {subView === 'overview'
                ? UK_STRINGS.destinations.me.subtitle
                : subView === 'records'
                ? 'Єдина хронологія швидких відміток стану та щоденникових записів без примусових ритуалів.'
                : subView === 'life_areas'
                ? 'Редаговані сфери життя, часткові огляди 0–10 та незмінна історія попередніх шкал.'
                : subView === 'inspiration'
                ? 'Нотатки, цитати, безпечні посилання та локальні растрові зображення без зовнішніх стрічок.'
                : subView === 'wishlist'
                ? 'Бажані речі та враження з групами наміру «Зараз», «Пізніше», «Колись» без фінансового обліку.'
                : 'Тема, часовий пояс, доступність, резервне копіювання ZIP та локальне сховище.'}
            </p>
          </div>
        </div>
      </header>

      {localError && (
        <FeedbackBanner
          tone="error"
          message={localError}
          onDismiss={() => setLocalError(null)}
        />
      )}

      {/* =====================================================================
          10.1 ME OVERVIEW: Quiet drill-down rows/cards
         ===================================================================== */}
      {subView === 'overview' && (
        <div
          className="space-y-3"
          data-testid="me-overview-drilldown-list"
          role="list"
          aria-label="Підрозділи особистого простору Я"
        >
          {/* 1. Personal records (State check-ins module) */}
          {(settings.modules?.stateCheckInsEnabled ?? true) && (
            <button
              type="button"
              role="listitem"
              onClick={() => onChangeSubView('records')}
              data-testid="me-drilldown-records"
              className="w-full p-4 rounded-2xl flex items-center justify-between gap-3 text-left cursor-pointer planui-transition-micro"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'var(--bg-elevated)' }}
                >
                  <HeartHandshake
                    className="w-5 h-5"
                    style={{ color: 'var(--color-brand-text)' }}
                    aria-hidden="true"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-[16px] font-semibold">
                    Особисті записи та стан
                  </div>
                  <div
                    className="text-[13px] mt-0.5 leading-snug"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {personalRecords.length === 0
                      ? 'Швидка оцінка самопочуття, енергії, напруги та щоденник'
                      : `Записів у хронології: ${personalRecords.length}`}
                  </div>
                </div>
              </div>
              <ChevronRight
                className="w-5 h-5 shrink-0"
                style={{ color: 'var(--text-secondary)' }}
                aria-hidden="true"
              />
            </button>
          )}

          {/* 2. Life areas (Core - always present) */}
          <button
            type="button"
            role="listitem"
            onClick={() => onChangeSubView('life_areas')}
            data-testid="me-drilldown-life-areas"
            className="w-full p-4 rounded-2xl flex items-center justify-between gap-3 text-left cursor-pointer planui-transition-micro"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <div className="flex items-start gap-3.5 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <Compass
                  className="w-5 h-5"
                  style={{ color: 'var(--color-personal)' }}
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0">
                <div className="text-[16px] font-semibold">Сфери життя</div>
                <div
                  className="text-[13px] mt-0.5 leading-snug"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {lifeAreaAssessments.length === 0
                    ? `${sortedLifeQuestions.filter(q => !q.archived && !q.mergedIntoId).length} сфер для огляду (нові відповіді: 0–10)`
                    : `Збережених оглядів: ${lifeAreaAssessments.length} • Сфер: ${sortedLifeQuestions.length}`}
                </div>
              </div>
            </div>
            <ChevronRight
              className="w-5 h-5 shrink-0"
              style={{ color: 'var(--text-secondary)' }}
              aria-hidden="true"
            />
          </button>

          <Button onClick={() => { setInitialPlanningReview(true); onChangeSubView('life_areas'); }}>Короткий огляд планування</Button>
          {/* 3. Inspiration (Desired Life module) */}
          {(settings.modules?.desiredLifeEnabled ?? true) && (
            <button
              type="button"
              role="listitem"
              onClick={() => onChangeSubView('inspiration')}
              data-testid="me-drilldown-inspiration"
              className="w-full p-4 rounded-2xl flex items-center justify-between gap-3 text-left cursor-pointer planui-transition-micro"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'var(--bg-elevated)' }}
                >
                  <Sparkles
                    className="w-5 h-5"
                    style={{ color: 'var(--color-work)' }}
                    aria-hidden="true"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-[16px] font-semibold">
                    Моє бажане життя та натхнення
                  </div>
                  <div
                    className="text-[13px] mt-0.5 leading-snug"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {inspirationItems.length === 0
                      ? 'Ідеї, цитати, орієнтири та растрові зображення'
                      : `Елементів: ${inspirationItems.length} • Вибраних: ${
                          inspirationItems.filter((i) => i.isFavorite).length
                        }`}
                  </div>
                </div>
              </div>
              <ChevronRight
                className="w-5 h-5 shrink-0"
                style={{ color: 'var(--text-secondary)' }}
                aria-hidden="true"
              />
            </button>
          )}

          {/* 4. Wishlist (Wishlist module) */}
          {(settings.modules?.wishlistEnabled ?? true) && (
            <button
              type="button"
              role="listitem"
              onClick={() => onChangeSubView('wishlist')}
              data-testid="me-drilldown-wishlist"
              className="w-full p-4 rounded-2xl flex items-center justify-between gap-3 text-left cursor-pointer planui-transition-micro"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'var(--bg-elevated)' }}
                >
                  <Gift
                    className="w-5 h-5"
                    style={{ color: 'var(--color-reservation)' }}
                    aria-hidden="true"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-[16px] font-semibold">Список бажань</div>
                  <div
                    className="text-[13px] mt-0.5 leading-snug"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {wishes.length === 0
                      ? 'Бажання за групами «Зараз», «Пізніше», «Колись» та категоріями'
                      : `Активних бажань: ${activeWishCount} • Категорій: ${wishlistCategories.length}`}
                  </div>
                </div>
              </div>
              <ChevronRight
                className="w-5 h-5 shrink-0"
                style={{ color: 'var(--text-secondary)' }}
                aria-hidden="true"
              />
            </button>
          )}

          {/* Lightweight Setup Card if all optional modules disabled */}
          {settings.modules &&
            !settings.modules.habitsEnabled &&
            !settings.modules.stateCheckInsEnabled &&
            !settings.modules.desiredLifeEnabled &&
            !settings.modules.wishlistEnabled && (
              <div
                className="p-4 rounded-2xl border border-dashed space-y-2"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
                data-testid="me-optional-modules-hint"
              >
                <div className="text-[15px] font-medium">
                  Додаткові можливості планувальника
                </div>
                <p
                  className="text-[13px] leading-relaxed m-0"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  За замовчуванням увімкнено лише базове планування дня, календаря та напрямів. У будь-який момент ви можете увімкнути звички, відмітки стану, моє бажане життя або список бажань у налаштуваннях.
                </p>
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => onChangeSubView('settings')}
                >
                  Переглянути додаткові модулі в Налаштуваннях →
                </Button>
              </div>
            )}

          {/* 5. Settings (Secondary destination) */}
          <button
            type="button"
            role="listitem"
            onClick={() => onChangeSubView('settings')}
            data-testid="me-drilldown-settings"
            className="w-full p-4 rounded-2xl flex items-center justify-between gap-3 text-left cursor-pointer planui-transition-micro"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <div className="flex items-start gap-3.5 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <Settings
                  className="w-5 h-5"
                  style={{ color: 'var(--text-secondary)' }}
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0">
                <div className="text-[16px] font-semibold">Налаштування</div>
                <div
                  className="text-[13px] mt-0.5 leading-snug"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Тема (
                  {settings.theme === 'light'
                    ? 'Світла'
                    : settings.theme === 'dark'
                    ? 'Темна'
                    : 'Системна'}
                  ), часовий пояс ({activeZone}), повний бекап ZIP та сховище
                </div>
              </div>
            </div>
            <ChevronRight
              className="w-5 h-5 shrink-0"
              style={{ color: 'var(--text-secondary)' }}
              aria-hidden="true"
            />
          </button>
        </div>
      )}

      {/* =====================================================================
          10.2 PERSONAL RECORDS SUBVIEW
         ===================================================================== */}
      {subView === 'records' && (
        <div className="space-y-4" data-testid="me-records-subview">
          <Card
            title="Новий запис стану або щоденника"
            subtitle="Заповніть лише потрібні шкали або додайте вільний текст — обидва варіанти зберігаються в єдину історію."
          >
            <form
              onSubmit={handleSaveQuickRecord}
              className="space-y-3.5"
              data-testid="personal-record-quick-form"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SelectField
                  label={PERSONAL_STATE_QUESTIONS_UK.mood}
                  options={moodScaleOptions}
                  value={quickRecordMood}
                  onChange={(e) => setQuickRecordMood(e.target.value)}
                  data-testid="quick-record-mood-select"
                />
                <SelectField
                  label={PERSONAL_STATE_QUESTIONS_UK.energy}
                  options={energyScaleOptions}
                  value={quickRecordEnergy}
                  onChange={(e) => setQuickRecordEnergy(e.target.value)}
                  data-testid="quick-record-energy-select"
                />
                <SelectField
                  label={PERSONAL_STATE_QUESTIONS_UK.stress}
                  options={stressScaleOptions}
                  value={quickRecordStress}
                  onChange={(e) => setQuickRecordStress(e.target.value)}
                  data-testid="quick-record-stress-select"
                />
              </div>

              <p
                className="text-[12px] m-0"
                style={{ color: 'var(--text-secondary)' }}
              >
                {PERSONAL_STATE_QUESTIONS_UK.stressDirectionNotice}
              </p>

              <TextAreaField
                label="Нотатка або запис у щоденник (необов’язково)"
                placeholder="Що зараз важливо зафіксувати..."
                value={quickRecordText}
                onChange={(e) => setQuickRecordText(e.target.value)}
                data-testid="quick-record-text-input"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <InputField
                  label="Прості теги (через кому, необов’язково)"
                  placeholder="Наприклад: зміна, відпочинок, ідеї"
                  value={quickRecordTags}
                  onChange={(e) => setQuickRecordTags(e.target.value)}
                  data-testid="quick-record-tags-input"
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    data-testid="save-quick-record-button"
                  >
                    Зберегти запис
                  </Button>
                </div>
              </div>
            </form>
          </Card>

          {/* Past browsing filters */}
          {personalRecords.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="flex-1">
                <InputField
                  label="Пошук за текстом, датою або тегом"
                  placeholder="Введіть слово або дату (РРРР-ММ-ДД)..."
                  value={recordSearchQuery}
                  onChange={(e) => setRecordSearchQuery(e.target.value)}
                  data-testid="personal-records-search-input"
                />
              </div>
              {allRecordTags.length > 0 && (
                <div className="sm:w-56">
                  <SelectField
                    label="Фільтр за тегом"
                    value={recordFilterTag}
                    onChange={(e) => setRecordFilterTag(e.target.value)}
                    options={[
                      { value: '', label: 'Усі теги' },
                      ...allRecordTags.map((t) => ({ value: t, label: `#${t}` })),
                    ]}
                    data-testid="personal-records-tag-filter"
                  />
                </div>
              )}
            </div>
          )}

          {filteredPersonalRecords.length === 0 ? (
            <EmptyStateCard
              icon={<HeartHandshake className="w-5 h-5" />}
              title={UK_STRINGS.destinations.me.recordsEmptyTitle}
              description={UK_STRINGS.destinations.me.recordsEmptyDescription}
              actionLabel={UK_STRINGS.creation.actions.personal_record.label}
              onAction={() => onOpenGlobalCreation('personal_record')}
            />
          ) : (
            <Card title={`Хронологія записів (${filteredPersonalRecords.length})`}>
              <ul
                className="space-y-3 m-0 p-0 list-none"
                data-testid="personal-records-history-list"
              >
                {filteredPersonalRecords.map((rec) => (
                  <li
                    key={rec.id}
                    data-testid={`personal-record-item-${rec.id}`}
                    className="p-3.5 rounded-2xl space-y-2"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                      <span
                        className="font-medium"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {rec.localDate} •{' '}
                        {rec.recordedAt.slice(11, 16)} ({rec.zoneId})
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="subtle"
                          size="sm"
                          onClick={() => {
                            setEditingRecord(rec);
                            setEditRecordText(rec.text ?? '');
                            setEditRecordMood(rec.mood ? String(rec.mood) : '');
                            setEditRecordEnergy(
                              rec.energy ? String(rec.energy) : ''
                            );
                            setEditRecordStress(
                              rec.stress ? String(rec.stress) : ''
                            );
                            setEditRecordTags(rec.tags.join(', '));
                          }}
                          data-testid={`edit-personal-record-${rec.id}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>
                            {rec.text ? 'Редагувати' : 'Додати текст / змінити'}
                          </span>
                        </Button>
                        <Button
                          variant="subtle"
                          size="sm"
                          onClick={() => handleDeleteRecord(rec)}
                          data-testid={`delete-personal-record-${rec.id}`}
                          aria-label="Видалити особистий запис"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>

                    {(rec.mood !== null ||
                      rec.energy !== null ||
                      rec.stress !== null) && (
                      <div className="flex flex-wrap gap-2 text-[13px]">
                        {rec.mood !== null && (
                          <span
                            className="px-2.5 py-1 rounded-lg"
                            style={{ backgroundColor: 'var(--bg-surface)' }}
                          >
                            Самопочуття:{' '}
                            <strong>{MOOD_SCALE_LABELS_UK[rec.mood]}</strong>
                          </span>
                        )}
                        {rec.energy !== null && (
                          <span
                            className="px-2.5 py-1 rounded-lg"
                            style={{ backgroundColor: 'var(--bg-surface)' }}
                          >
                            Енергія:{' '}
                            <strong>{ENERGY_SCALE_LABELS_UK[rec.energy]}</strong>
                          </span>
                        )}
                        {rec.stress !== null && (
                          <span
                            className="px-2.5 py-1 rounded-lg"
                            style={{ backgroundColor: 'var(--bg-surface)' }}
                          >
                            Напруга:{' '}
                            <strong>{STRESS_SCALE_LABELS_UK[rec.stress]}</strong>
                          </span>
                        )}
                      </div>
                    )}

                    {rec.text && (
                      <p className="text-[15px] m-0 leading-relaxed whitespace-pre-wrap">
                        {rec.text}
                      </p>
                    )}

                    {rec.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {rec.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-md text-[12px]"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {/* =====================================================================
          10.3 LIFE AREAS SUBVIEW
         ===================================================================== */}
      {subView === 'life_areas' && <LifeAreasReviewView snapshot={snapshot} zone={activeZone} today={actualTodayDate} repositories={repositories} onChanged={() => onDataChanged()} onOpenPlan={onOpenPlan} onInspectEvent={onInspectCalendarEvent} onModalStateChange={onModalStateChange} initialPlanningReview={initialPlanningReview} />}

      {/* =====================================================================
          10.4 INSPIRATION & LOCAL MEDIA SUBVIEW
         ===================================================================== */}
      {subView === 'inspiration' && (
        <div className="space-y-4" data-testid="me-inspiration-subview">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <SegmentedControl<'all' | InspirationItemKind | 'favorites'>
              ariaLabel="Фільтр елементів натхнення"
              value={inspFilterKind}
              onChange={setInspFilterKind}
              options={[
                { value: 'all', label: 'Усі' },
                { value: 'favorites', label: 'Вибрані' },
                { value: 'text', label: 'Нотатки' },
                { value: 'quote', label: 'Цитати' },
                { value: 'link', label: 'Посилання' },
                { value: 'image', label: 'Зображення' },
              ]}
            />

            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setLocalError(null);
                setIsInspModalOpen(true);
              }}
              data-testid="open-inspiration-modal-button"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Додати натхнення</span>
            </Button>
          </div>

          {projects.length > 0 && (
            <div className="sm:w-72">
              <SelectField
                label="Фільтр за пов’язаним проєктом"
                value={inspFilterProjectId}
                onChange={(e) => setInspFilterProjectId(e.target.value)}
                options={[
                  { value: '', label: 'Усі проєкти та без прив’язки' },
                  ...projects.map((p) => ({ value: p.id, label: p.title })),
                ]}
                data-testid="inspiration-project-filter-select"
              />
            </div>
          )}

          {filteredInspirationItems.length === 0 ? (
            <EmptyStateCard
              icon={<Sparkles className="w-5 h-5" />}
              title="Ще немає збережених елементів натхнення"
              description="Зберігайте думки, цитати, безпечні HTTP/HTTPS посилання або локальні зображення (JPEG, PNG, WebP) без автоматичних прев’ю."
              actionLabel="Додати натхнення"
              onAction={() => setIsInspModalOpen(true)}
            />
          ) : (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-3.5"
              data-testid="inspiration-items-grid"
            >
              {filteredInspirationItems.map((item) => {
                const linkedProject = item.projectId
                  ? projects.find((p) => p.id === item.projectId)
                  : null;
                const meta = item.mediaId
                  ? mediaMetaById.get(item.mediaId)
                  : undefined;
                const rawBytes = item.mediaId
                  ? mediaBlobs.get(item.mediaId)
                  : undefined;
                const objectUrl =
                  meta && rawBytes && objectUrlRegistryRef.current
                    ? objectUrlRegistryRef.current.getOrCreateUrl(
                        meta.id,
                        rawBytes,
                        meta.mimeType
                      )
                    : null;

                return (
                  <div
                    key={item.id}
                    data-testid={`inspiration-card-${item.id}`}
                    className="p-4 rounded-2xl space-y-2.5 flex flex-col justify-between"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[12px] font-medium">
                          {item.kind === 'quote' ? (
                            <Quote className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : item.kind === 'link' ? (
                            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : item.kind === 'image' ? (
                            <ImageIcon
                              className="w-3.5 h-3.5"
                              aria-hidden="true"
                            />
                          ) : (
                            <Sparkles
                              className="w-3.5 h-3.5"
                              aria-hidden="true"
                            />
                          )}
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {item.kind === 'quote'
                              ? 'Цитата'
                              : item.kind === 'link'
                              ? 'Безпечне посилання'
                              : item.kind === 'image'
                              ? 'Локальне зображення'
                              : 'Нотатка'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleInspirationFavorite(item)
                            }
                            aria-label={
                              item.isFavorite
                                ? 'Прибрати з вибраного'
                                : 'Додати до вибраного'
                            }
                            data-testid={`toggle-favorite-inspiration-${item.id}`}
                            className="p-1.5 rounded-lg cursor-pointer"
                            style={{
                              color: item.isFavorite
                                ? 'var(--color-brand-text)'
                                : 'var(--text-secondary)',
                            }}
                          >
                            <Star
                              className="w-4 h-4"
                              fill={item.isFavorite ? 'currentColor' : 'none'}
                              aria-hidden="true"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteInspiration(item)}
                            aria-label="Видалити елемент натхнення"
                            data-testid={`delete-inspiration-${item.id}`}
                            className="p-1.5 rounded-lg cursor-pointer"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      {item.title && (
                        <h3 className="text-[16px] font-semibold m-0">
                          {item.title}
                        </h3>
                      )}

                      {item.kind === 'image' && (
                        <div className="space-y-1.5">
                          {objectUrl ? (
                            <img
                              src={objectUrl}
                              alt={item.title ?? 'Зображення натхнення'}
                              className="w-full max-h-60 object-contain rounded-xl"
                              style={{ backgroundColor: 'var(--bg-elevated)' }}
                            />
                          ) : (
                            <div
                              className="p-3 rounded-xl text-[13px]"
                              style={{
                                backgroundColor: 'var(--bg-elevated)',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              Локальне растрове медіа ({meta?.mimeType ?? 'image'})
                            </div>
                          )}
                          {meta && (
                            <div
                              className="text-[11px]"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {meta.mimeType} • {meta.width}×{meta.height} px •{' '}
                              {Math.ceil(meta.byteSize / 1024)} КБ
                              {meta.wasOptimized ? ' • Оптимізовано' : ''}
                            </div>
                          )}
                        </div>
                      )}

                      {item.contentText && (
                        <p
                          className={`text-[14px] m-0 leading-relaxed whitespace-pre-wrap ${
                            item.kind === 'quote' ? 'italic pl-3 border-l-2' : ''
                          }`}
                          style={{
                            borderColor:
                              item.kind === 'quote'
                                ? 'var(--color-work)'
                                : undefined,
                          }}
                        >
                          {item.contentText}
                        </p>
                      )}

                      {item.linkUrl && (
                        <a
                          href={item.linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[13px] font-medium underline break-all"
                          style={{ color: 'var(--color-personal)' }}
                        >
                          <ExternalLink
                            className="w-3.5 h-3.5 shrink-0"
                            aria-hidden="true"
                          />
                          <span>{item.linkUrl}</span>
                        </a>
                      )}
                    </div>

                    {linkedProject && (
                      <div className="pt-2">
                        <span
                          className="inline-block px-2.5 py-0.5 rounded-md text-[12px]"
                          style={{
                            backgroundColor: 'var(--bg-elevated)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          Проєкт: {linkedProject.title}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          10.5 - 10.7 WISHLIST, FLAT CATEGORIES, AND EXACT PRICE SUBVIEW
         ===================================================================== */}
      {subView === 'wishlist' && (
        <div className="space-y-4" data-testid="me-wishlist-subview">
          {/* Fast Title-Only Creation with Progressive Disclosure (10.6) */}
          <Card
            title="Додати бажання"
            subtitle="Для створення потрібна лише назва. Бажання не займають час у календарі та не стають справами автоматично."
          >
            <form
              onSubmit={handleQuickCreateWish}
              className="space-y-3"
              data-testid="wishlist-quick-create-form"
            >
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="flex-1">
                  <InputField
                    label="Назва бажання"
                    placeholder="Наприклад: Навушники для студії або Поїздка в Карпати"
                    value={quickWishTitle}
                    onChange={(e) => setQuickWishTitle(e.target.value)}
                    data-testid="wishlist-quick-title-input"
                    required
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowQuickWishDetails((prev) => !prev)}
                    data-testid="wishlist-toggle-progressive-disclosure"
                  >
                    {showQuickWishDetails ? 'Згорнути деталі' : 'Деталі та ціна'}
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    data-testid="wishlist-quick-submit-button"
                  >
                    Додати
                  </Button>
                </div>
              </div>

              {/* Visibly editable default timing ("Пізніше") and category */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Часовий намір:
                  </span>
                  <SegmentedControl<WishlistTimingGroup>
                    ariaLabel="Часова група нового бажання"
                    value={quickWishTiming}
                    onChange={setQuickWishTiming}
                    options={[
                      { value: 'now', label: WISHLIST_TIMING_LABELS_UK.now },
                      {
                        value: 'later',
                        label: WISHLIST_TIMING_LABELS_UK.later,
                      },
                      {
                        value: 'someday',
                        label: WISHLIST_TIMING_LABELS_UK.someday,
                      },
                    ]}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label
                    htmlFor="quick-wish-category-select"
                    className="text-[13px]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Категорія:
                  </label>
                  <select
                    id="quick-wish-category-select"
                    data-testid="wishlist-quick-category-select"
                    value={quickWishCategoryId}
                    onChange={(e) => setQuickWishCategoryId(e.target.value)}
                    className="min-h-[38px] px-2.5 py-1 rounded-xl text-[14px]"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <option value="">Без категорії</option>
                    {sortedCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {showQuickWishDetails && (
                <div
                  className="pt-3 border-t space-y-3"
                  style={{ borderColor: 'var(--border-subtle)' }}
                  data-testid="wishlist-quick-progressive-fields"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InputField
                      label="Орієнтовна вартість (необов’язково)"
                      placeholder="Наприклад: 1 250,50 або 0"
                      inputMode="decimal"
                      value={quickWishPriceInput}
                      onChange={(e) => setQuickWishPriceInput(e.target.value)}
                      data-testid="wishlist-quick-price-input"
                    />
                    <SelectField
                      label={
                        settings.preferredWishlistCurrency
                          ? `Валюта (за замовчуванням ${settings.preferredWishlistCurrency})`
                          : 'Валюта (обов’язково для першої ціни)'
                      }
                      value={quickWishCurrency}
                      onChange={(e) =>
                        setQuickWishCurrency(
                          e.target.value as SupportedCurrencyCode | ''
                        )
                      }
                      options={[
                        {
                          value: '',
                          label: settings.preferredWishlistCurrency
                            ? `Використати ${settings.preferredWishlistCurrency}`
                            : '— Оберіть валюту —',
                        },
                        ...currencySelectOptions,
                      ]}
                      data-testid="wishlist-quick-currency-select"
                    />
                  </div>
                  <TextAreaField
                    label="Нотатка (необов’язково)"
                    placeholder="Посилання, характеристики або нотатки..."
                    value={quickWishNote}
                    onChange={(e) => setQuickWishNote(e.target.value)}
                    data-testid="wishlist-quick-note-input"
                  />
                </div>
              )}
            </form>
          </Card>

          {/* Compact Category Selector, Timing Filter, and Scope Selector (10.5 / 10.6) */}
          <div
            className="p-3.5 rounded-2xl space-y-3"
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="wishlist-category-filter-select"
                  className="text-[13px] font-medium"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Категорія:
                </label>
                <select
                  id="wishlist-category-filter-select"
                  data-testid="wishlist-category-filter-select"
                  value={wishlistCategoryFilter}
                  onChange={(e) =>
                    setWishlistCategoryFilter(
                      e.target.value as WishlistCategoryFilter
                    )
                  }
                  className="min-h-[40px] px-3 py-1.5 rounded-xl text-[14px] font-medium"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <option value="all">Усі категорії</option>
                  <option value="uncategorized">Без категорії</option>
                  {sortedCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setLocalError(null);
                    setIsCategoryManagerOpen(true);
                  }}
                  data-testid="open-wishlist-category-manager-button"
                >
                  <Tag className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Керувати категоріями ({sortedCategories.length})</span>
                </Button>
              </div>

              <SegmentedControl<WishlistViewScope>
                ariaLabel="Статус бажань"
                value={wishlistScope}
                onChange={setWishlistScope}
                options={[
                  {
                    value: 'active',
                    label: `Активні (${activeWishCount})`,
                  },
                  {
                    value: 'fulfilled',
                    label: `Виконані (${fulfilledWishCount})`,
                  },
                  {
                    value: 'archived',
                    label: `Архів (${archivedWishCount})`,
                  },
                ]}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className="text-[13px] font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                Група наміру:
              </span>
              <SegmentedControl<WishlistTimingFilter>
                ariaLabel="Фільтр часових груп бажань"
                value={wishlistTimingFilter}
                onChange={setWishlistTimingFilter}
                options={[
                  { value: 'all', label: 'Усі групи' },
                  { value: 'now', label: WISHLIST_TIMING_LABELS_UK.now },
                  { value: 'later', label: WISHLIST_TIMING_LABELS_UK.later },
                  {
                    value: 'someday',
                    label: WISHLIST_TIMING_LABELS_UK.someday,
                  },
                ]}
              />
            </div>
          </div>

          {/* Grouped Wishes Rendering */}
          {groupedWishes.totalMatchingCount === 0 ? (
            <EmptyStateCard
              icon={<Gift className="w-5 h-5" />}
              title={
                wishlistScope === 'active'
                  ? UK_STRINGS.destinations.me.wishlistEmptyTitle
                  : wishlistScope === 'fulfilled'
                  ? 'Немає виконаних бажань у вибраному фільтрі'
                  : 'Архів бажань порожній'
              }
              description={UK_STRINGS.destinations.me.wishlistEmptyDescription}
            />
          ) : (
            <div className="space-y-4" data-testid="wishlist-groups-container">
              {WISHLIST_TIMING_ORDER.map((timingKey) => {
                const groupItems = groupedWishes.byTiming[timingKey];
                if (groupItems.length === 0) return null;

                return (
                  <Card
                    key={timingKey}
                    title={`${WISHLIST_TIMING_LABELS_UK[timingKey]} (${groupItems.length})`}
                  >
                    <ul
                      className="space-y-2.5 m-0 p-0 list-none"
                      data-testid={`wishlist-group-${timingKey}`}
                    >
                      {groupItems.map((wish) => {
                        const catName = wish.categoryId
                          ? categoryNameById.get(wish.categoryId) ??
                            'Без категорії'
                          : 'Без категорії';
                        const formattedPrice = formatExactPriceUk(
                          wish.estimatedPrice
                        );

                        return (
                          <li
                            key={wish.id}
                            data-testid={`wish-item-card-${wish.id}`}
                            className="p-3.5 rounded-2xl space-y-2"
                            style={{
                              backgroundColor: 'var(--bg-elevated)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[16px] font-semibold">
                                    {wish.title}
                                  </span>
                                  <span
                                    className="px-2 py-0.5 rounded-md text-[12px]"
                                    style={{
                                      backgroundColor: 'var(--bg-surface)',
                                      color: 'var(--text-secondary)',
                                    }}
                                  >
                                    {catName}
                                  </span>
                                  <span
                                    className="px-2 py-0.5 rounded-md text-[12px]"
                                    style={{
                                      backgroundColor: 'var(--bg-surface)',
                                      color: 'var(--text-secondary)',
                                    }}
                                  >
                                    {WISHLIST_TIMING_LABELS_UK[wish.timing]}
                                  </span>
                                </div>

                                {formattedPrice !== null && (
                                  <div
                                    className="text-[14px] font-medium"
                                    data-testid={`wish-item-price-${wish.id}`}
                                  >
                                    Орієнтовна вартість:{' '}
                                    <strong>{formattedPrice}</strong>
                                  </div>
                                )}

                                {wish.note && (
                                  <p
                                    className="text-[14px] m-0 leading-relaxed whitespace-pre-wrap"
                                    style={{ color: 'var(--text-secondary)' }}
                                  >
                                    {wish.note}
                                  </p>
                                )}

                                {wish.state === 'fulfilled' &&
                                  wish.fulfilledAt && (
                                    <div
                                      className="text-[12px]"
                                      style={{ color: 'var(--color-day-off)' }}
                                    >
                                      Здійснено: {wish.fulfilledAt.slice(0, 10)}{' '}
                                      (орієнтовна ціна збережена як довідкова)
                                    </div>
                                  )}
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleToggleWishFulfilled(wish)}
                                  data-testid={`toggle-fulfill-wish-${wish.id}`}
                                >
                                  {wish.state === 'active' ? (
                                    <>
                                      <CheckCircle2
                                        className="w-3.5 h-3.5"
                                        aria-hidden="true"
                                      />
                                      <span>Здійснено</span>
                                    </>
                                  ) : (
                                    <>
                                      <RotateCcw
                                        className="w-3.5 h-3.5"
                                        aria-hidden="true"
                                      />
                                      <span>Повернути в активні</span>
                                    </>
                                  )}
                                </Button>

                                <Button
                                  variant="subtle"
                                  size="sm"
                                  onClick={() => openEditWishModal(wish)}
                                  data-testid={`edit-wish-button-${wish.id}`}
                                >
                                  <Edit3
                                    className="w-3.5 h-3.5"
                                    aria-hidden="true"
                                  />
                                  <span>Змінити</span>
                                </Button>

                                <Button
                                  variant="subtle"
                                  size="sm"
                                  onClick={() => handleToggleWishArchived(wish)}
                                  data-testid={`archive-wish-button-${wish.id}`}
                                  aria-label={
                                    wish.archived
                                      ? 'Розархівувати бажання'
                                      : 'Архівувати бажання'
                                  }
                                >
                                  <Archive
                                    className="w-3.5 h-3.5"
                                    aria-hidden="true"
                                  />
                                  <span>
                                    {wish.archived ? 'З архіву' : 'В архів'}
                                  </span>
                                </Button>

                                <Button
                                  variant="subtle"
                                  size="sm"
                                  onClick={() => setDeletingWish(wish)}
                                  data-testid={`delete-wish-button-${wish.id}`}
                                  aria-label="Видалити бажання"
                                >
                                  <Trash2
                                    className="w-3.5 h-3.5"
                                    aria-hidden="true"
                                  />
                                </Button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          10.1 / C15 SETTINGS SUBVIEW
         ===================================================================== */}
      {subView === 'settings' && (
        <BasicSettingsView
          settings={settings}
          snapshot={snapshot}
          recoverySnapshots={recoverySnapshots}
          repositories={repositories}
          onSettingsPatch={onSettingsPatch}
          onDataReplaced={() => onDataChanged()}
          onOpenWorkRoster={onNavigateToWorkRoster}
          onOpenHabits={onNavigateToHabits}
          onOpenWishlistCategories={() => {
            onChangeSubView('wishlist');
            setIsCategoryManagerOpen(true);
          }}
          onLocalModalOpenChange={setIsSettingsModalOpen}
        />
      )}

      {/* =====================================================================
          MODALS & SHEETS FOR STAGE 10
         ===================================================================== */}

      {/* 1. Edit Personal Record Sheet (10.2 in-place update without duplication) */}
      <ModalSheet
        isOpen={Boolean(editingRecord)}
        title="Редагування особистого запису"
        subtitle="Додавання або зміна тексту оновлює цей самий запис без створення дубліката."
        onClose={() => setEditingRecord(null)}
      >
        <form
          onSubmit={handleSaveEditedRecord}
          className="space-y-3.5"
          data-testid="edit-personal-record-form"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SelectField
              label={PERSONAL_STATE_QUESTIONS_UK.mood}
              options={moodScaleOptions}
              value={editRecordMood}
              onChange={(e) => setEditRecordMood(e.target.value)}
            />
            <SelectField
              label={PERSONAL_STATE_QUESTIONS_UK.energy}
              options={energyScaleOptions}
              value={editRecordEnergy}
              onChange={(e) => setEditRecordEnergy(e.target.value)}
            />
            <SelectField
              label={PERSONAL_STATE_QUESTIONS_UK.stress}
              options={stressScaleOptions}
              value={editRecordStress}
              onChange={(e) => setEditRecordStress(e.target.value)}
            />
          </div>

          <TextAreaField
            label="Текст запису"
            value={editRecordText}
            onChange={(e) => setEditRecordText(e.target.value)}
            data-testid="edit-personal-record-text-input"
          />

          <InputField
            label="Прості теги (через кому)"
            value={editRecordTags}
            onChange={(e) => setEditRecordTags(e.target.value)}
            data-testid="edit-personal-record-tags-input"
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditingRecord(null)}
            >
              Скасувати
            </Button>
            <Button
              type="submit"
              variant="primary"
              data-testid="confirm-edit-personal-record-button"
            >
              Зберегти зміни
            </Button>
          </div>
        </form>
      </ModalSheet>

      {/* 2. Edit Life Area Question Wording Sheet (10.3) */}
      <ModalSheet
        isOpen={Boolean(editingQuestion)}
        title="Редагування запитання сфери життя"
        subtitle="Зміна тексту підвищує версію запитання для майбутніх оцінок. Минулі оцінки зберігають формулювання, яке діяло під час їх запису."
        onClose={() => setEditingQuestion(null)}
      >
        <form
          onSubmit={handleSaveEditedQuestion}
          className="space-y-3.5"
          data-testid="edit-life-question-form"
        >
          <TextAreaField
            label="Формулювання запитання українською"
            value={editingQuestionText}
            onChange={(e) => setEditingQuestionText(e.target.value)}
            data-testid="edit-life-question-textarea"
            required
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditingQuestion(null)}
            >
              Скасувати
            </Button>
            <Button
              type="submit"
              variant="primary"
              data-testid="confirm-save-life-question-button"
            >
              Оновити формулювання
            </Button>
          </div>
        </form>
      </ModalSheet>

      {/* 3. Create Inspiration Item Sheet (10.4) */}
      <ModalSheet
        isOpen={isInspModalOpen}
        title="Додати елемент натхнення"
        subtitle="Підтримуються нотатки, цитати, безпечні HTTP/HTTPS посилання та локальні растрові зображення (JPEG, PNG, WebP)."
        onClose={() => setIsInspModalOpen(false)}
      >
        <form
          onSubmit={handleSaveInspiration}
          className="space-y-3.5"
          data-testid="inspiration-modal-form"
        >
          <SegmentedControl<InspirationItemKind>
            ariaLabel="Тип натхнення"
            value={inspKind}
            onChange={setInspKind}
            options={[
              { value: 'text', label: 'Нотатка' },
              { value: 'quote', label: 'Цитата' },
              { value: 'link', label: 'Посилання' },
              { value: 'image', label: 'Зображення' },
            ]}
          />

          <InputField
            label="Заголовок або автор (необов’язково)"
            value={inspTitle}
            onChange={(e) => setInspTitle(e.target.value)}
            data-testid="insp-modal-title-input"
          />

          {(inspKind === 'text' || inspKind === 'quote') && (
            <TextAreaField
              label={inspKind === 'quote' ? 'Текст цитати' : 'Текст нотатки'}
              value={inspText}
              onChange={(e) => setInspText(e.target.value)}
              data-testid="insp-modal-text-input"
              required
            />
          )}

          {inspKind === 'link' && (
            <div className="space-y-2.5">
              <InputField
                label="Безпечна адреса (HTTP або HTTPS)"
                placeholder="https://example.com"
                value={inspUrl}
                onChange={(e) => setInspUrl(e.target.value)}
                data-testid="insp-modal-url-input"
                required
              />
              <TextAreaField
                label="Коментар (необов’язково)"
                value={inspText}
                onChange={(e) => setInspText(e.target.value)}
              />
            </div>
          )}

          {inspKind === 'image' && (
            <div className="space-y-2.5">
              <label className="block space-y-1.5">
                <span className="text-[14px] font-medium block">
                  Оберіть растровий файл (JPEG, PNG або WebP)
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleSelectInspirationImage}
                  data-testid="insp-modal-file-input"
                  className="w-full text-[14px]"
                />
              </label>
              {inspImageCandidate?.wasOptimized && (
                <p
                  className="text-[12px] m-0"
                  style={{ color: 'var(--color-day-off)' }}
                >
                  Зображення буде оптимізовано локально для економії сховища.
                </p>
              )}
              <TextAreaField
                label="Підпис до зображення (необов’язково)"
                value={inspText}
                onChange={(e) => setInspText(e.target.value)}
              />
            </div>
          )}

          <SelectField
            label="Пов’язаний проєкт (необов’язково)"
            value={inspProjectId}
            onChange={(e) => setInspProjectId(e.target.value)}
            options={[
              { value: '', label: 'Без прив’язки до проєкту' },
              ...projects.map((p) => ({ value: p.id, label: p.title })),
            ]}
          />

          <label className="flex items-center gap-2 text-[14px] cursor-pointer">
            <input
              type="checkbox"
              checked={inspFavorite}
              onChange={(e) => setInspFavorite(e.target.checked)}
              className="w-4 h-4 accent-[#B93E4B]"
            />
            <span>Позначити як вибране</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsInspModalOpen(false)}
            >
              Скасувати
            </Button>
            <Button
              type="submit"
              variant="primary"
              data-testid="insp-modal-submit-button"
            >
              Зберегти
            </Button>
          </div>
        </form>
      </ModalSheet>

      {/* 4. Edit Wish Sheet (10.5 - 10.7) */}
      <ModalSheet
        isOpen={Boolean(editingWish)}
        title="Редагування бажання"
        subtitle="Зміна часової групи, категорії або орієнтовної вартості."
        onClose={() => setEditingWish(null)}
      >
        <form
          onSubmit={handleSaveEditedWish}
          className="space-y-3.5"
          data-testid="edit-wish-modal-form"
        >
          <InputField
            label="Назва бажання"
            value={editWishTitle}
            onChange={(e) => setEditWishTitle(e.target.value)}
            data-testid="edit-wish-title-input"
            required
          />

          <div className="space-y-1.5">
            <span className="text-[14px] font-medium block">
              Група наміру
            </span>
            <SegmentedControl<WishlistTimingGroup>
              ariaLabel="Група наміру бажання"
              value={editWishTiming}
              onChange={setEditWishTiming}
              options={[
                { value: 'now', label: WISHLIST_TIMING_LABELS_UK.now },
                { value: 'later', label: WISHLIST_TIMING_LABELS_UK.later },
                { value: 'someday', label: WISHLIST_TIMING_LABELS_UK.someday },
              ]}
            />
          </div>

          <SelectField
            label="Категорія"
            value={editWishCategoryId}
            onChange={(e) => setEditWishCategoryId(e.target.value)}
            options={[
              { value: '', label: 'Без категорії' },
              ...sortedCategories.map((c) => ({ value: c.id, label: c.name })),
            ]}
            data-testid="edit-wish-category-select"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InputField
              label="Орієнтовна вартість (залиште порожнім, якщо без ціни)"
              placeholder="Наприклад: 1250,50 або 0"
              inputMode="decimal"
              value={editWishPriceInput}
              onChange={(e) => setEditWishPriceInput(e.target.value)}
              data-testid="edit-wish-price-input"
            />
            <SelectField
              label="Валюта"
              value={editWishCurrency}
              onChange={(e) =>
                setEditWishCurrency(
                  e.target.value as SupportedCurrencyCode | ''
                )
              }
              options={[
                {
                  value: '',
                  label: settings.preferredWishlistCurrency
                    ? `Використати ${settings.preferredWishlistCurrency}`
                    : '— Оберіть валюту —',
                },
                ...currencySelectOptions,
              ]}
              data-testid="edit-wish-currency-select"
            />
          </div>

          <TextAreaField
            label="Нотатка"
            value={editWishNote}
            onChange={(e) => setEditWishNote(e.target.value)}
            data-testid="edit-wish-note-input"
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditingWish(null)}
            >
              Скасувати
            </Button>
            <Button
              type="submit"
              variant="primary"
              data-testid="confirm-save-wish-button"
            >
              Зберегти
            </Button>
          </div>
        </form>
      </ModalSheet>

      {/* 5. Confirmed Wish Deletion Sheet (10.5) */}
      <ModalSheet
        isOpen={Boolean(deletingWish)}
        title="Видалити бажання?"
        subtitle={
          deletingWish
            ? `Ви дійсно хочете остаточно видалити бажання «${deletingWish.title}»?`
            : ''
        }
        onClose={() => setDeletingWish(null)}
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setDeletingWish(null)}
          >
            Скасувати
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleConfirmDeleteWish}
            data-testid="confirm-delete-wish-button"
          >
            Видалити остаточно
          </Button>
        </div>
      </ModalSheet>

      {/* 6. Flat Wishlist Category Manager Sheet (10.6) */}
      <ModalSheet
        isOpen={isCategoryManagerOpen}
        title="Категорії списку бажань"
        subtitle="Один плоский рівень категорій. Видалення категорії залишає її бажання в розділі «Без категорії» і ніколи не видаляє самі бажання."
        onClose={() => {
          setIsCategoryManagerOpen(false);
          setDeletingCategory(null);
          setRenamingCategoryId(null);
        }}
      >
        <div className="space-y-4" data-testid="wishlist-category-manager">
          <form
            onSubmit={handleCreateCategory}
            className="flex items-end gap-2"
          >
            <div className="flex-1">
              <InputField
                label="Нова категорія"
                placeholder="Наприклад: Книги, Музика, Подорожі"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                data-testid="new-wishlist-category-input"
                required
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              data-testid="add-wishlist-category-button"
            >
              Створити
            </Button>
          </form>

          {sortedCategories.length === 0 ? (
            <p
              className="text-[14px] m-0"
              style={{ color: 'var(--text-secondary)' }}
            >
              Ще немає користувацьких категорій. Доступні віртуальні подання
              «Усі категорії» та «Без категорії».
            </p>
          ) : (
            <ul
              className="space-y-2 m-0 p-0 list-none"
              data-testid="wishlist-categories-list"
            >
              {sortedCategories.map((cat, idx) => {
                const impact = computeWishlistCategoryDeleteImpact(
                  cat.id,
                  wishes
                );
                const isRenaming = renamingCategoryId === cat.id;

                return (
                  <li
                    key={cat.id}
                    data-testid={`wishlist-category-row-${cat.id}`}
                    className="p-3 rounded-xl space-y-2"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {isRenaming ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={renamingCategoryText}
                          onChange={(e) =>
                            setRenamingCategoryText(e.target.value)
                          }
                          data-testid={`rename-wishlist-category-input-${cat.id}`}
                          className="flex-1 min-h-[38px] px-3 py-1 rounded-xl text-[15px]"
                          style={{
                            backgroundColor: 'var(--bg-surface)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        />
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleRenameCategory(cat)}
                          data-testid={`save-rename-wishlist-category-${cat.id}`}
                        >
                          Зберегти
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setRenamingCategoryId(null)}
                        >
                          Скасувати
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-[15px] font-semibold">
                            {cat.name}
                          </span>
                          <span
                            className="text-[12px] ml-2"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            Бажань: {impact.affectedWishesCount}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="subtle"
                            size="sm"
                            disabled={idx === 0}
                            onClick={() => handleMoveCategoryOrder(idx, -1)}
                            aria-label="Перемістити категорію вище"
                            data-testid={`move-cat-up-${cat.id}`}
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="subtle"
                            size="sm"
                            disabled={idx === sortedCategories.length - 1}
                            onClick={() => handleMoveCategoryOrder(idx, 1)}
                            aria-label="Перемістити категорію нижче"
                            data-testid={`move-cat-down-${cat.id}`}
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="subtle"
                            size="sm"
                            onClick={() => {
                              setRenamingCategoryId(cat.id);
                              setRenamingCategoryText(cat.name);
                            }}
                            data-testid={`start-rename-cat-${cat.id}`}
                          >
                            Перейменувати
                          </Button>
                          <Button
                            variant="subtle"
                            size="sm"
                            onClick={() => setDeletingCategory(cat)}
                            data-testid={`delete-cat-button-${cat.id}`}
                          >
                            Видалити
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {deletingCategory && (
            <div
              className="p-3.5 rounded-xl space-y-2.5 border"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--color-brand)',
              }}
              data-testid="confirm-delete-wishlist-category-box"
            >
              <div className="text-[14px] font-semibold">
                Видалити категорію «{deletingCategory.name}»?
              </div>
              <p
                className="text-[13px] m-0"
                style={{ color: 'var(--text-secondary)' }}
              >
                Пов’язані бажання (
                {
                  computeWishlistCategoryDeleteImpact(
                    deletingCategory.id,
                    wishes
                  ).affectedWishesCount
                }
                ) не будуть видалені — вони автоматично перейдуть у «Без
                категорії».
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setDeletingCategory(null)}
                >
                  Скасувати
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={handleConfirmDeleteCategory}
                  data-testid="confirm-delete-wishlist-category-button"
                >
                  Підтвердити видалення категорії
                </Button>
              </div>
            </div>
          )}
        </div>
      </ModalSheet>
    </div>
  );
};
