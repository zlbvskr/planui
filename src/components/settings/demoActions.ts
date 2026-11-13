import React from "react";
import { loadDemoData } from "../../demo/index";
import { PlanuiRepositories } from "../../storage/repositories";
import { getErrorMessageUk } from "./settingsPresentation";

interface loadDemoContext {
  handleRemoveDemo: (closeSheet?: boolean) => Promise<void>;
  setIsBusyDemo: React.Dispatch<React.SetStateAction<boolean>>;
  repositories: PlanuiRepositories;
  activeZone: string;
  onDataReplacedOrReset: (toastMessageUk?: string) => Promise<void>;
  setDemoToast: React.Dispatch<
    React.SetStateAction<{ message: string; undo?: () => void } | null>
  >;
  setDemoSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSettingsToastUk: React.Dispatch<React.SetStateAction<string | null>>;
}

export async function loadDemo({
  handleRemoveDemo,
  setIsBusyDemo,
  repositories,
  activeZone,
  onDataReplacedOrReset,
  setDemoToast,
  setDemoSheetOpen,
  setSettingsToastUk,
}: loadDemoContext) {
  setIsBusyDemo(true);
  try {
    await loadDemoData(repositories, activeZone);
    await onDataReplacedOrReset();
    setDemoToast({
      message: "Демо-дані додано",
      undo: () => void handleRemoveDemo(false),
    });
    setDemoSheetOpen(false);
  } catch (err) {
    setSettingsToastUk(getErrorMessageUk(err));
  } finally {
    setIsBusyDemo(false);
  }
}

interface refreshDemoDatesContext {
  setIsBusyDemo: React.Dispatch<React.SetStateAction<boolean>>;
  repositories: PlanuiRepositories;
  activeZone: string;
  onDataReplacedOrReset: (toastMessageUk?: string) => Promise<void>;
  setDemoToast: React.Dispatch<
    React.SetStateAction<{ message: string; undo?: () => void } | null>
  >;
  setDemoSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSettingsToastUk: React.Dispatch<React.SetStateAction<string | null>>;
}

export async function refreshDemoDates({
  setIsBusyDemo,
  repositories,
  activeZone,
  onDataReplacedOrReset,
  setDemoToast,
  setDemoSheetOpen,
  setSettingsToastUk,
}: refreshDemoDatesContext) {
  setIsBusyDemo(true);
  try {
    await loadDemoData(repositories, activeZone);
    await onDataReplacedOrReset();
    setDemoToast({ message: "Демо-дані оновлено" });
    setDemoSheetOpen(false);
  } catch (err) {
    setSettingsToastUk(getErrorMessageUk(err));
  } finally {
    setIsBusyDemo(false);
  }
}

import { removeDemoData } from "../../demo/index";

interface removeDemoContext {
  setIsBusyDemo: React.Dispatch<React.SetStateAction<boolean>>;
  repositories: PlanuiRepositories;
  onDataReplacedOrReset: (toastMessageUk?: string) => Promise<void>;
  setDemoToast: React.Dispatch<
    React.SetStateAction<{ message: string; undo?: () => void } | null>
  >;
  setShowRemoveDemoConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  setDemoSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSettingsToastUk: React.Dispatch<React.SetStateAction<string | null>>;
}

export async function removeDemo(
  {
    setIsBusyDemo,
    repositories,
    onDataReplacedOrReset,
    setDemoToast,
    setShowRemoveDemoConfirm,
    setDemoSheetOpen,
    setSettingsToastUk,
  }: removeDemoContext,
  closeSheet = true,
) {
  setIsBusyDemo(true);
  try {
    await removeDemoData(repositories);
    await onDataReplacedOrReset();
    setDemoToast({ message: "Демо-дані прибрано" });
    setShowRemoveDemoConfirm(false);
    if (closeSheet) {
      setDemoSheetOpen(false);
    }
  } catch (err) {
    setSettingsToastUk(getErrorMessageUk(err));
  } finally {
    setIsBusyDemo(false);
  }
}
