import { LifeAreaEditorSheet } from "../components/me/LifeAreaEditorSheet";
import { LifeAreaLinkSheet } from "../components/me/LifeAreaLinkSheet";
import { LifeReviewSheet } from "../components/me/LifeReviewSheet";
import { WishActionSheet } from "../components/me/WishActionSheet";
import { WishEditorSheet } from "../components/me/WishEditorSheet";
import { Wishlist } from "../components/me/Wishlist";
import { WishlistCategorySheet } from "../components/me/WishlistCategorySheet";
import { WishlistFilterSheet } from "../components/me/WishlistFilterSheet";
import {
  createCategory,
  deleteCategory,
  moveCategory,
  renameCategory,
} from "../components/me/categoryActions";
import { saveWish } from "../components/me/saveWish";
import { useMotionEntrance } from "../ui/motion";

import { SphereDetail } from "../components/create/SphereDetail";

import { SphereStatistics } from "../components/create/SphereStatistics";

import { sphereActivity } from "../domain/sphereInsights";

import {
  BalanceWheel,
  ScoreBar,
  scoreText,
  SphereTile,
  trendText,
} from "../ui/spheres";

import { sphereBalance, sphereStates } from "../domain/sphereInsights";

import { Icon } from "../ui/icons";

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useSubScreenTransition } from "../ui/motion";

import {
  EntityId,
  InspirationItem,
  LifeAreaAssessment,
  LifeAreaQuestion,
  MediaAssetMeta,
  PersonalRecord,
  PlanuiDomainSnapshot,
  PlanuiSettings,
  Project,
  RecoverySnapshotRecord,
  WishItem,
  WishlistCategory,
  WishlistTimingGroup,
  WishPurchaseStatus,
} from "../domain/types";

import {
  filterAndGroupWishes,
  getWishPurchaseStatus,
  setWishArchivedState,
  setWishPurchaseStatus,
  sortWishlistCategories,
  WishlistCategoryFilter,
  WishlistTimingFilter,
  WishlistViewScope,
} from "../domain/wishlist";

import { UK_STRINGS } from "../i18n/uk";

import { PwaLifecycleState } from "../pwa/pwaController";

import {
  ImplementedCreationActionKind,
  MeSubViewMode,
} from "../state/shellStore";

import { PlanuiRepositories } from "../storage/repositories";

import { AlertSheet } from "../ui/sheets";

import { RoundButton } from "../ui/buttons";

import { PageHeader } from "../ui/headers";

import {
  buildLifeReview,
  projectLifeAreaLinks,
  ReviewAnswerDraft,
} from "../domain/lifeAreas";

import { addDaysToLocalDate } from "../domain/temporal";

import { getErrorMessageUk } from "../components/me/mePresentation";

import { formatPriceNumber } from "../components/me/mePresentation";

const BasicSettingsView = React.lazy(() =>
  import("./BasicSettingsView").then((m) => ({ default: m.BasicSettingsView })),
);

export interface MeWorkspaceViewProps {
  onSphereIntentHandled?: () => void;
  sphereIntent?: { areaId?: string; review?: boolean; nonce: number };
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
    activeWishlistCategoryId?: string | null,
  ) => void;
  onOpenPlan: (kind: "goal" | "project", id: string) => void;
  onInspectCalendarEvent: (id: string) => void;
  onOpenGlobalCreation: (
    initialKind?: ImplementedCreationActionKind,
    prefill?: { areaId?: string },
  ) => void;
  onSettingsPatch: (patch: Partial<PlanuiSettings>) => void;
  onDataChanged: (toastMessageUk?: string) => Promise<void>;
  onNavigateToWorkRoster: () => void;
  onNavigateToHabits: () => void;
  onSettingsConfirmationChange?: (open: boolean) => void;
  onModalStateChange?: (open: boolean) => void;
  onCreationAreaChange?: (areaId: string | null) => void;
  pwaState?: PwaLifecycleState;
}

export const MeWorkspaceView: React.FC<MeWorkspaceViewProps> = ({
  subView,
  sphereIntent,
  onSphereIntentHandled,
  activeWishlistCategoryId,
  activeZone,
  actualTodayDate,
  lifeAreaQuestions,
  wishlistCategories,
  wishes,
  projects,
  settings,
  snapshot,
  recoverySnapshots,
  repositories,
  onChangeSubView,
  onOpenPlan,
  onOpenGlobalCreation,
  onSettingsPatch,
  onDataChanged,
  onNavigateToWorkRoster,
  onNavigateToHabits,
  onSettingsConfirmationChange,
  onModalStateChange,
  onCreationAreaChange,
  pwaState,
}) => {
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  useEffect(() => {
    onCreationAreaChange?.(selectedAreaId);
    return () => onCreationAreaChange?.(null);
  }, [selectedAreaId, onCreationAreaChange]);
  const [scoreDraft, setScoreDraft] = useState<number | null>(null);
  const [definitionDraft, setDefinitionDraft] = useState("");
  const [focusDraft, setFocusDraft] = useState(false);
  const [areaEditorOpen, setAreaEditorOpen] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [isLinkPickerOpen, setIsLinkPickerOpen] = useState(false);
  const [lifeReviewOpen, setLifeReviewOpen] = useState(false);
  const [reviewStep, setReviewStep] = useState(0);
  const reviewMotionRef = useMotionEntrance<HTMLDivElement>(reviewStep);
  const [reviewDrafts, setReviewDrafts] = useState<
    Record<string, ReviewAnswerDraft>
  >({});

  const effectiveSubView: MeSubViewMode = useMemo(() => {
    if (subView === "inspiration" || subView === "life_areas") {
      return "overview";
    }
    return subView;
  }, [subView]);

  const modelContext = useMemo(
    () => ({
      folders: snapshot.folders,
      projects,
      goals: snapshot.goals,
      areas: lifeAreaQuestions,
    }),
    [snapshot.folders, projects, snapshot.goals, lifeAreaQuestions],
  );

  const activeLifeAreas = useMemo(() => {
    return [...snapshot.lifeAreaQuestions]
      .filter((a) => !a.archived && !a.mergedIntoId)
      .sort((a, b) => a.order - b.order);
  }, [snapshot.lifeAreaQuestions]);

  const sphereData = useMemo(
    () =>
      sphereStates(
        snapshot.lifeAreaQuestions,
        snapshot.lifeAreaAssessments,
        new Date().toISOString(),
      ),
    [snapshot.lifeAreaQuestions, snapshot.lifeAreaAssessments],
  );
  const openSphere = useCallback(
    (id: string) => {
      const area = sphereData.find((a) => a.id === id);
      if (!area) return;
      setSelectedAreaId(id);
      setScoreDraft(area.score);
      setDefinitionDraft(area.goodEnoughUk ?? "");
      setFocusDraft(!!area.focus);
    },
    [sphereData],
  );
  useEffect(() => {
    if (!sphereIntent) return;
    if (sphereIntent.review) {
      setReviewStep(0);
      setReviewDrafts({});
      setLifeReviewOpen(true);
    } else if (sphereIntent.areaId) openSphere(sphereIntent.areaId);
    onSphereIntentHandled?.();
  }, [sphereIntent, openSphere, onSphereIntentHandled]);
  const ratedSpheres = sphereData
    .filter((a) => a.score != null)
    .sort((a, b) => a.score! - b.score!);
  const balance = sphereBalance(sphereData);
  const selectedArea = useMemo(
    () => activeLifeAreas.find((a) => a.id === selectedAreaId) ?? null,
    [activeLifeAreas, selectedAreaId],
  );

  const links = useMemo(() => projectLifeAreaLinks(snapshot), [snapshot]);

  const relatedLinks = useMemo(() => {
    if (!selectedArea) return [];
    return links.filter(
      (l) => l.effectiveId === selectedArea.id && l.kind !== "reservation",
    );
  }, [links, selectedArea]);

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
      await repositories.saveLifeAreaQuestion(
        updatedArea,
        selectedArea.revision,
      );

      await repositories.saveLifeAreaAssessment(
        buildLifeReview(
          crypto.randomUUID(),
          [updatedArea],
          {
            [updatedArea.id]: {
              score: scoreDraft as ReviewAnswerDraft["score"],
              attentionNow: focusDraft,
              usefulChangeUk: null,
            },
          },
          actualTodayDate,
          actualTodayDate,
          nowIso,
        ),
      );

      await onDataChanged("Сферу оновлено");
      setAreaEditorOpen(false);
      setSelectedAreaId(null);
    } catch (err) {
      console.error("Failed to save life area", err);
    }
  };

  const reviewAnswers: Record<string, ReviewAnswerDraft> = Object.fromEntries(
    sphereData.map((area) => [
      area.id,
      reviewDrafts[area.id] ?? {
        score: area.score as ReviewAnswerDraft["score"],
        attentionNow: !!area.focus,
        usefulChangeUk: null,
      },
    ]),
  );
  const currentReviewArea = sphereData[reviewStep] ?? null;
  const currentReviewAnswer = currentReviewArea
    ? reviewAnswers[currentReviewArea.id]
    : { score: null, attentionNow: false, usefulChangeUk: null };
  const updateReviewDraft = (id: string, patch: Partial<ReviewAnswerDraft>) =>
    setReviewDrafts((prev) => ({
      ...prev,
      [id]: { ...reviewAnswers[id], ...patch },
    }));
  const reviewPreview = sphereData.map((area) => ({
    ...area,
    score: reviewAnswers[area.id].score,
    focus: reviewAnswers[area.id].attentionNow ?? false,
    stale: false,
  }));
  const reviewFocusCount = reviewPreview.filter((a) => a.focus).length;
  const reviewPreviousAt = currentReviewArea
    ? [
        currentReviewArea.ratedAt,
        ...snapshot.lifeAreaAssessments
          .filter((r) =>
            r.answers.some(
              (a) => a.questionId === currentReviewArea.id && a.score != null,
            ),
          )
          .map((r) => r.recordedAt),
      ]
        .filter((v): v is string => !!v && Date.parse(v) <= Date.now())
        .sort()
        .at(-1)
    : undefined;
  const reviewActivity = sphereActivity(
    snapshot,
    reviewPreviousAt ?? new Date(Date.now() - 14 * 86400000).toISOString(),
    new Date().toISOString(),
  );
  const changedTasks = reviewActivity.completions.filter(
    (e) => e.areaId === currentReviewArea?.id && e.kind === "task",
  ).length;
  const changedHabits = reviewActivity.habitStats.filter(
    (e) => e.areaId === currentReviewArea?.id,
  );
  const changedMeasures = reviewActivity.measures.filter(
    (e) => e.areaId === currentReviewArea?.id && e.delta !== 0,
  );

  const handleSavePeriodicReview = async () => {
    if (reviewBusy || reviewFocusCount < 1 || reviewFocusCount > 3) return;
    setReviewBusy(true);
    setReviewError("");
    try {
      const nowIso = new Date().toISOString();
      const twoWeeksAgo = addDaysToLocalDate(actualTodayDate, -13);

      await repositories.saveLifeAreaAssessment(
        buildLifeReview(
          crypto.randomUUID(),
          activeLifeAreas,
          reviewAnswers,
          twoWeeksAgo,
          actualTodayDate,
          nowIso,
        ),
      );

      for (const area of activeLifeAreas) {
        const draft = reviewAnswers[area.id];
        if (
          draft &&
          (draft.score !== undefined || draft.attentionNow !== undefined)
        ) {
          const updated: LifeAreaQuestion = {
            ...area,
            rating: draft.score !== undefined ? draft.score : area.rating,
            ratedAt:
              draft.score !== undefined && draft.score !== null
                ? nowIso
                : area.ratedAt,
            focus:
              draft.attentionNow !== undefined
                ? draft.attentionNow
                : area.focus,
            updatedAt: nowIso,
            revision: area.revision + 1,
          };
          await repositories.saveLifeAreaQuestion(updated, area.revision);
        }
      }

      await onDataChanged("Огляд сфер збережено");
      setLifeReviewOpen(false);
      setReviewDrafts({});
    } catch (err) {
      setReviewError(getErrorMessageUk(err));
    } finally {
      setReviewBusy(false);
    }
  };

  const { containerRef: meStageRef, captureOutgoingScreen } =
    useSubScreenTransition(effectiveSubView, (v) => v !== "overview");

  const handleSubViewChange = (
    next: MeSubViewMode,
    categoryId?: string | null,
  ) => {
    captureOutgoingScreen();
    onChangeSubView(next, categoryId);
  };
  const [wishlistViewScope, setWishlistViewScope] =
    useState<WishlistViewScope>("active");
  const [wishlistCategoryFilter, setWishlistCategoryFilter] =
    useState<WishlistCategoryFilter>(activeWishlistCategoryId ?? "all");
  const [wishlistTimingFilter, setWishlistTimingFilter] =
    useState<WishlistTimingFilter>("all");

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
    [wishlistCategories],
  );

  const effectiveCategoryFilter: WishlistCategoryFilter = useMemo(() => {
    if (
      wishlistCategoryFilter === "all" ||
      wishlistCategoryFilter === "uncategorized"
    ) {
      return wishlistCategoryFilter;
    }
    const exists = sortedCategories.some(
      (c) => c.id === wishlistCategoryFilter,
    );
    return exists ? wishlistCategoryFilter : "all";
  }, [wishlistCategoryFilter, sortedCategories]);

  const groupedWishes = useMemo(
    () =>
      filterAndGroupWishes({
        wishes,
        viewScope: wishlistViewScope,
        categoryFilter: effectiveCategoryFilter,
        timingFilter: wishlistTimingFilter,
      }),
    [wishes, wishlistViewScope, effectiveCategoryFilter, wishlistTimingFilter],
  );

  const groupedWishesByFolder = useMemo(() => {
    const list = groupedWishes.wishes;
    const map = new Map<string, WishItem[]>();

    for (const wish of list) {
      const cat = sortedCategories.find((c) => c.id === wish.categoryId)?.name;
      const fld = snapshot.folders.find((f) => f.id === wish.folderId)?.name;
      const groupName = cat || fld || "Без категорії";
      const existing = map.get(groupName);
      if (existing) {
        existing.push(wish);
      } else {
        map.set(groupName, [wish]);
      }
    }

    return Array.from(map.entries())
      .filter(([, items]) => items.length > 0)
      .map(([name, items]) => ({
        name,
        items,
      }));
  }, [groupedWishes.wishes, sortedCategories, snapshot.folders]);
  const [isWishSheetOpen, setIsWishSheetOpen] = useState(false);
  const [showDeleteWishConfirm, setShowDeleteWishConfirm] = useState(false);
  const [editingWishId, setEditingWishId] = useState<EntityId | null>(null);
  const [wishTitleInput, setWishTitleInput] = useState("");
  const [wishNoteInput, setWishNoteInput] = useState("");
  const [wishTimingInput, setWishTimingInput] =
    useState<WishlistTimingGroup>("later");
  const [wishCategoryInput, setWishCategoryInput] = useState<string>("");
  const [wishPriceInput, setWishPriceInput] = useState<string>("");
  const [wishCurrencyInput, setWishCurrencyInput] = useState<string>(
    settings.preferredWishlistCurrency ?? "UAH",
  );
  const [wishLinkInput, setWishLinkInput] = useState<string>("");
  const [wishProjectInput, setWishProjectInput] = useState<string>("");
  const [wishMediaIdInput, setWishMediaIdInput] = useState<string | null>(null);
  const [wishStatusInput, setWishStatusInput] =
    useState<WishPurchaseStatus>("want");
  const [confirmWishCurrency, setConfirmWishCurrency] = useState(false);
  const [inlineCategoryName, setInlineCategoryName] = useState("");
  const [wishFormError, setWishFormError] = useState<string | null>(null);
  const [isSavingWish, setIsSavingWish] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<EntityId | null>(
    null,
  );
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [confirmDeleteCategoryId, setConfirmDeleteCategoryId] =
    useState<EntityId | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [isWishFilterSheetOpen, setIsWishFilterSheetOpen] = useState(false);
  const [wishActionItem, setWishActionItem] = useState<WishItem | null>(null);
  const [isCreatingCategoryInline, setIsCreatingCategoryInline] =
    useState(false);

  useEffect(() => {
    const anyModal = Boolean(
      areaEditorOpen ||
        lifeReviewOpen ||
        isLinkPickerOpen ||
        isWishSheetOpen ||
        showDeleteWishConfirm ||
        isCategoryManagerOpen ||
        isWishFilterSheetOpen ||
        wishActionItem ||
        confirmDeleteCategoryId,
    );
    onModalStateChange?.(anyModal);
    return () => onModalStateChange?.(false);
  }, [
    areaEditorOpen,
    lifeReviewOpen,
    isLinkPickerOpen,
    isWishSheetOpen,
    showDeleteWishConfirm,
    isCategoryManagerOpen,
    isWishFilterSheetOpen,
    wishActionItem,
    confirmDeleteCategoryId,
    onModalStateChange,
  ]);

  const handleSelectCategoryFilter = (next: WishlistCategoryFilter) => {
    setWishlistCategoryFilter(next);
    onChangeSubView(
      "wishlist",
      next === "all" || next === "uncategorized" ? null : next,
    );
  };

  const openWishCreationModal = () => {
    onOpenGlobalCreation("wish");
  };

  const openEditWishModal = (wish: WishItem) => {
    setEditingWishId(wish.id);
    setWishTitleInput(wish.title);
    setWishNoteInput(wish.note ?? "");
    setWishTimingInput(wish.timing);
    setWishCategoryInput(wish.categoryId ?? "");
    const rawPrice = wish.estimatedPrice
      ? Math.round(wish.estimatedPrice.amountMinor / 100)
      : "";
    setWishPriceInput(rawPrice ? formatPriceNumber(rawPrice) : "");
    setIsCreatingCategoryInline(false);
    setWishCurrencyInput(
      wish.estimatedPrice?.currency ??
        settings.preferredWishlistCurrency ??
        "UAH",
    );
    setWishLinkInput(wish.linkUrl ?? "");
    setWishProjectInput(wish.projectId ?? "");
    setWishMediaIdInput(wish.mediaId ?? null);
    const currentStatus = getWishPurchaseStatus(wish);
    setWishStatusInput(
      currentStatus === "legacy_fulfilled" ? "purchased" : currentStatus,
    );
    setConfirmWishCurrency(false);
    setInlineCategoryName("");
    setWishFormError(null);
    setIsWishSheetOpen(true);
  };

  const handleSaveWishSheet = (e: React.FormEvent) =>
    saveWish(
      {
        setWishFormError,
        setIsSavingWish,
        wishCategoryInput,
        inlineCategoryName,
        sortedCategories,
        repositories,
        editingWishId,
        wishes,
        wishTitleInput,
        wishNoteInput,
        wishTimingInput,
        wishPriceInput,
        wishCurrencyInput,
        settings,
        wishLinkInput,
        wishMediaIdInput,
        wishProjectInput,
        confirmWishCurrency,
        wishStatusInput,
        onSettingsPatch,
        setIsWishSheetOpen,
        onDataChanged,
      },
      e,
    );

  const handleSetWishStatus = async (
    wish: WishItem,
    status: WishPurchaseStatus,
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
        updated.archived ? "Перенесено в архів" : "Повернено з архіву",
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
      await onDataChanged("Бажання видалено");
    } catch (err) {
      setWishFormError(getErrorMessageUk(err));
    }
  };
  const handleCreateCategory = (e: React.FormEvent) =>
    createCategory(
      {
        setCategoryError,
        categoryName,
        sortedCategories,
        repositories,
        setCategoryName,
        onDataChanged,
      },
      e,
    );

  const handleSaveRenameCategory = (cat: WishlistCategory) =>
    renameCategory(
      {
        setCategoryError,
        editingCategoryName,
        repositories,
        setEditingCategoryId,
        setEditingCategoryName,
        onDataChanged,
      },
      cat,
    );

  const handleMoveCategoryOrder = (index: number, direction: -1 | 1) =>
    moveCategory(
      { sortedCategories, repositories, onDataChanged, setCategoryError },
      index,
      direction,
    );

  const handleConfirmDeleteCategory = (categoryId: EntityId) =>
    deleteCategory(
      {
        setCategoryError,
        repositories,
        setConfirmDeleteCategoryId,
        wishlistCategoryFilter,
        handleSelectCategoryFilter,
        onDataChanged,
      },
      categoryId,
    );
  const editingWishItem = editingWishId
    ? (wishes.find((w) => w.id === editingWishId) ?? null)
    : null;

  return (
    <div
      ref={meStageRef}
      data-motion="idle"
      className="personal-surface space-y-4 pb-8"
      data-testid="destination-view-me"
    >
      <div hidden={!!selectedArea}>
        {effectiveSubView === "overview" ? (
          <PageHeader
            title={UK_STRINGS.nav.me}
            badgeShape="me"
            actions={
              <button
                type="button"
                className="ui-pill h-[28px] min-h-[28px] px-3 text-[12px] font-bold cursor-pointer"
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
          <PageHeader
            title={
              effectiveSubView === "records"
                ? "Статистика"
                : effectiveSubView === "wishlist"
                  ? "Список бажань"
                  : "Налаштування"
            }
            badgeShape={
              effectiveSubView === "records"
                ? "stats"
                : effectiveSubView === "wishlist"
                  ? "wishlist"
                  : "settings"
            }
            actions={
              effectiveSubView === "wishlist" ? (
                <RoundButton
                  label="Фільтри"
                  size={40}
                  variant="frosted"
                  onClick={() => setIsWishFilterSheetOpen(true)}
                  className="relative flex items-center justify-center"
                  data-testid="wishlist-filter-button"
                >
                  <Icon name="more-horizontal" size={20} />
                  {(wishlistTimingFilter !== "all" ||
                    wishlistViewScope !== "active" ||
                    wishlistCategoryFilter !== "all") && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--accent-primary)] text-white text-[11px] font-extrabold flex items-center justify-center shadow-sm pointer-events-none">
                      {(wishlistTimingFilter !== "all" ? 1 : 0) +
                        (wishlistViewScope !== "active" ? 1 : 0) +
                        (wishlistCategoryFilter !== "all" ? 1 : 0)}
                    </span>
                  )}
                </RoundButton>
              ) : undefined
            }
          />
        )}
      </div>
      {selectedArea && (
        <SphereDetail
          area={sphereData.find((a) => a.id === selectedArea.id)!}
          snapshot={snapshot}
          today={actualTodayDate}
          zone={activeZone}
          repositories={repositories}
          onBack={() => setSelectedAreaId(null)}
          onEdit={() => setAreaEditorOpen(true)}
          onCreate={() => {
            const id = selectedArea.id;
            setSelectedAreaId(null);
            onOpenGlobalCreation("task", { areaId: id });
          }}
          onPlan={onOpenPlan}
          onChanged={() => onDataChanged()}
        />
      )}

      {effectiveSubView === "overview" && !selectedArea && (
        <div
          className="space-y-4 pb-[calc(var(--dock-h,116px)+32px)]"
          data-testid="me-subview-overview"
          data-ui="content-start"
        >
          <BalanceWheel areas={sphereData} onSelect={openSphere} />
          <dl className="sphere-summary">
            <div>
              <dt>Баланс</dt>
              <dd>
                {balance == null
                  ? "Оцінити сфери"
                  : `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 1 }).format(balance)}/10`}
              </dd>
              <small>Рівномірність оцінок</small>
            </div>
            <div>
              <dt>Найслабша</dt>
              <dd>{ratedSpheres[0]?.questionTextUk ?? "Ще без оцінок"}</dd>
              <small>
                {ratedSpheres[0]
                  ? scoreText(ratedSpheres[0].score)
                  : "Пройди Огляд"}
              </small>
            </div>
            <div>
              <dt>Найсильніша</dt>
              <dd>{ratedSpheres.at(-1)?.questionTextUk ?? "Ще без оцінок"}</dd>
              <small>
                {ratedSpheres.at(-1)
                  ? scoreText(ratedSpheres.at(-1)!.score)
                  : "Пройди Огляд"}
              </small>
            </div>
          </dl>
          <div className="sphere-list">
            {sphereData.map((area) => (
              <button
                type="button"
                key={area.id}
                className="sphere-area-row"
                onClick={() => openSphere(area.id)}
                data-testid={`sphere-row-${area.id}`}
              >
                <SphereTile area={area} size={40} />
                <span className="sphere-area-copy">
                  <strong>{area.questionTextUk}</strong>
                  <ScoreBar area={area} />
                  <span className="sphere-row-meta">
                    <span>{trendText(area.trend)}</span>
                    {area.focus && (
                      <span className="sphere-focus-label">✦ У фокусі</span>
                    )}
                  </span>
                </span>
                <Icon name="chevron-right" size={16} />
              </button>
            ))}
          </div>
        </div>
      )}

      {effectiveSubView === "records" && !selectedArea && (
        <div data-testid="me-subview-records" data-ui="content-start">
          <SphereStatistics
            snapshot={snapshot}
            areas={sphereData}
            today={actualTodayDate}
            zone={activeZone}
            onSelect={openSphere}
          />
        </div>
      )}

      {effectiveSubView === "wishlist" && (
        <Wishlist
          groupedWishesByFolder={groupedWishesByFolder}
          openWishCreationModal={openWishCreationModal}
          modelContext={modelContext}
          setWishActionItem={setWishActionItem}
          openEditWishModal={openEditWishModal}
        />
      )}

      {effectiveSubView === "settings" && (
        <React.Suspense fallback={null}>
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
              handleSubViewChange("wishlist");
              setIsCategoryManagerOpen(true);
            }}
            pwaState={pwaState}
          />
        </React.Suspense>
      )}

      <WishEditorSheet
        isWishSheetOpen={isWishSheetOpen}
        setIsWishSheetOpen={setIsWishSheetOpen}
        setShowDeleteWishConfirm={setShowDeleteWishConfirm}
        editingWishItem={editingWishItem}
        modelContext={modelContext}
        isSavingWish={isSavingWish}
        handleSaveWishSheet={handleSaveWishSheet}
        wishFormError={wishFormError}
        repositories={repositories}
        onDataChanged={onDataChanged}
        wishTitleInput={wishTitleInput}
        setWishTitleInput={setWishTitleInput}
        wishPriceInput={wishPriceInput}
        setWishPriceInput={setWishPriceInput}
        wishCurrencyInput={wishCurrencyInput}
        setWishCurrencyInput={setWishCurrencyInput}
        isCreatingCategoryInline={isCreatingCategoryInline}
        wishCategoryInput={wishCategoryInput}
        setIsCreatingCategoryInline={setIsCreatingCategoryInline}
        setWishCategoryInput={setWishCategoryInput}
        setInlineCategoryName={setInlineCategoryName}
        sortedCategories={sortedCategories}
        inlineCategoryName={inlineCategoryName}
        wishTimingInput={wishTimingInput}
        setWishTimingInput={setWishTimingInput}
        wishStatusInput={wishStatusInput}
        setWishStatusInput={setWishStatusInput}
        wishNoteInput={wishNoteInput}
        setWishNoteInput={setWishNoteInput}
        wishLinkInput={wishLinkInput}
        setWishLinkInput={setWishLinkInput}
      />

      <AlertSheet
        isOpen={showDeleteWishConfirm}
        onClose={() => setShowDeleteWishConfirm(false)}
        title="Видалити бажання?"
        description="Цю дію неможливо скасувати. Бажання буде видалено зі списку."
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        destructive
        onConfirm={() => {
          if (editingWishItem) {
            void handleDeleteWish(editingWishItem.id);
            setShowDeleteWishConfirm(false);
          }
        }}
      />

      <WishlistCategorySheet
        isCategoryManagerOpen={isCategoryManagerOpen}
        setIsCategoryManagerOpen={setIsCategoryManagerOpen}
        setEditingCategoryId={setEditingCategoryId}
        setConfirmDeleteCategoryId={setConfirmDeleteCategoryId}
        setCategoryError={setCategoryError}
        categoryError={categoryError}
        handleCreateCategory={handleCreateCategory}
        categoryName={categoryName}
        setCategoryName={setCategoryName}
        sortedCategories={sortedCategories}
        editingCategoryId={editingCategoryId}
        confirmDeleteCategoryId={confirmDeleteCategoryId}
        wishes={wishes}
        editingCategoryName={editingCategoryName}
        setEditingCategoryName={setEditingCategoryName}
        handleSaveRenameCategory={handleSaveRenameCategory}
        handleMoveCategoryOrder={handleMoveCategoryOrder}
        handleConfirmDeleteCategory={handleConfirmDeleteCategory}
      />

      <WishlistFilterSheet
        isWishFilterSheetOpen={isWishFilterSheetOpen}
        setIsWishFilterSheetOpen={setIsWishFilterSheetOpen}
        setWishlistTimingFilter={setWishlistTimingFilter}
        setWishlistViewScope={setWishlistViewScope}
        setWishlistCategoryFilter={setWishlistCategoryFilter}
        wishlistTimingFilter={wishlistTimingFilter}
        wishlistViewScope={wishlistViewScope}
        setIsCategoryManagerOpen={setIsCategoryManagerOpen}
        wishlistCategoryFilter={wishlistCategoryFilter}
        handleSelectCategoryFilter={handleSelectCategoryFilter}
        sortedCategories={sortedCategories}
      />

      <WishActionSheet
        wishActionItem={wishActionItem}
        setWishActionItem={setWishActionItem}
        handleSetWishStatus={handleSetWishStatus}
        handleToggleArchiveWish={handleToggleArchiveWish}
        openEditWishModal={openEditWishModal}
        handleDeleteWish={handleDeleteWish}
      />

      <LifeAreaEditorSheet
        selectedArea={selectedArea}
        areaEditorOpen={areaEditorOpen}
        setAreaEditorOpen={setAreaEditorOpen}
        sphereData={sphereData}
        handleSaveSelectedArea={handleSaveSelectedArea}
        scoreDraft={scoreDraft}
        setScoreDraft={setScoreDraft}
        definitionDraft={definitionDraft}
        setDefinitionDraft={setDefinitionDraft}
        focusDraft={focusDraft}
        setFocusDraft={setFocusDraft}
        relatedLinks={relatedLinks}
        setSelectedAreaId={setSelectedAreaId}
        onOpenGlobalCreation={onOpenGlobalCreation}
        setIsLinkPickerOpen={setIsLinkPickerOpen}
      />

      <LifeAreaLinkSheet
        isLinkPickerOpen={isLinkPickerOpen}
        setIsLinkPickerOpen={setIsLinkPickerOpen}
        selectedArea={selectedArea}
        projects={projects}
        repositories={repositories}
        onDataChanged={onDataChanged}
        snapshot={snapshot}
        wishes={wishes}
      />

      <LifeReviewSheet
        lifeReviewOpen={lifeReviewOpen}
        reviewBusy={reviewBusy}
        setLifeReviewOpen={setLifeReviewOpen}
        setReviewDrafts={setReviewDrafts}
        setReviewError={setReviewError}
        currentReviewArea={currentReviewArea}
        reviewStep={reviewStep}
        setReviewStep={setReviewStep}
        reviewFocusCount={reviewFocusCount}
        handleSavePeriodicReview={handleSavePeriodicReview}
        reviewError={reviewError}
        reviewMotionRef={reviewMotionRef}
        sphereData={sphereData}
        snapshot={snapshot}
        activeZone={activeZone}
        reviewPreviousAt={reviewPreviousAt}
        changedTasks={changedTasks}
        changedHabits={changedHabits}
        changedMeasures={changedMeasures}
        currentReviewAnswer={currentReviewAnswer}
        updateReviewDraft={updateReviewDraft}
        reviewPreview={reviewPreview}
      />
    </div>
  );
};
