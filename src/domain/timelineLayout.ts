import { LocalTimeString } from "./types";

import { ProjectedTimelineItem } from "./scheduling";

// ============================================================================

// ============================================================================

type TimelineItemVisualState =
  | "past"
  | "current"
  | "future"
  | "completed"
  | "canceled"
  | "released";

export interface PositionedTimelineItem {
  item: ProjectedTimelineItem;
  laneIndex: number;
  totalLanes: number;
  clusterId: string;
  clusterSize: number;
  hasConflict: boolean;
  elapsedStartOffsetMinutes: number;
  elapsedEndOffsetMinutes: number;
  topPercent: number;
  heightPercent: number;
  visualState: TimelineItemVisualState;
  statusBadgeUk: string;
}

export interface TimelineOverlapCluster {
  clusterId: string;
  startOffsetMinutes: number;
  endOffsetMinutes: number;
  displayStartLocalTime: LocalTimeString;
  displayEndLocalTime: LocalTimeString;
  totalLanes: number;
  hasConflict: boolean;
  items: PositionedTimelineItem[];
}

/**
 * 6.5 Classify the visual state of a projected timeline item without confusing past with completed.
 */
function classifyTimelineItemVisualState(
  item: ProjectedTimelineItem,
  nowMs: number,
): { visualState: TimelineItemVisualState; statusBadgeUk: string } {
  if (item.state === "released") {
    return {
      visualState: "released",
      statusBadgeUk: "Вивільнено • історія плану (не займає час)",
    };
  }
  if (item.state === "canceled" || item.taskState === "canceled") {
    return {
      visualState: "canceled",
      statusBadgeUk: "Скасовано",
    };
  }
  if (item.sourceKind === "reservation" && item.taskState === "completed") {
    return {
      visualState: "completed",
      statusBadgeUk: "Справу виконано",
    };
  }

  const startMs = Date.parse(item.segment.clippedStartInstant);
  const endMs = Date.parse(item.segment.clippedEndInstant);

  if (Number.isFinite(endMs) && endMs <= nowMs) {
    return {
      visualState: "past",
      statusBadgeUk:
        item.sourceKind === "reservation"
          ? "Минулий резерв (не означає виконання)"
          : "Минулий інтервал",
    };
  }
  if (
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    startMs <= nowMs &&
    nowMs < endMs
  ) {
    return {
      visualState: "current",
      statusBadgeUk: "Триває зараз",
    };
  }
  return {
    visualState: "future",
    statusBadgeUk: "Заплановано",
  };
}

/**
 * 6.1 / 6.5 Compute proportional positions, connected overlap clusters, and distinguishable lanes.
 * Shared by Today and Calendar Day so overlap and lane math is never duplicated.
 */
export function layoutTimelineOverlapLanes(params: {
  items: readonly ProjectedTimelineItem[];
  dayDurationMinutes: number;
  nowMs: number;
  minVisualDurationMinutes?: number;
}): {
  positionedItems: PositionedTimelineItem[];
  clusters: TimelineOverlapCluster[];
} {
  const totalDayMinutes = Math.max(60, params.dayDurationMinutes);
  const minVisualMinutes = params.minVisualDurationMinutes ?? (28 / 64) * 60;
  if (params.items.length === 0) {
    return { positionedItems: [], clusters: [] };
  }

  const getVisualEnd = (item: ProjectedTimelineItem): number => {
    const startOff = item.segment.elapsedStartOffsetMinutes;
    const rawEndOff = Math.max(
      startOff + 1,
      item.segment.elapsedEndOffsetMinutes,
    );
    return Math.min(
      totalDayMinutes,
      Math.max(rawEndOff, startOff + minVisualMinutes),
    );
  };

  const sorted = [...params.items].sort(
    (a, b) =>
      a.segment.elapsedStartOffsetMinutes -
        b.segment.elapsedStartOffsetMinutes ||
      a.segment.elapsedEndOffsetMinutes - b.segment.elapsedEndOffsetMinutes ||
      a.itemKey.localeCompare(b.itemKey),
  );

  // Partition into connected overlap clusters reserving visual height (max(end, start + 28px))
  const rawClusters: ProjectedTimelineItem[][] = [];
  let currentCluster: ProjectedTimelineItem[] = [];
  let clusterMaxEnd = -1;

  for (const item of sorted) {
    const startOff = item.segment.elapsedStartOffsetMinutes;
    const visualEndOff = getVisualEnd(item);

    if (currentCluster.length === 0) {
      currentCluster.push(item);
      clusterMaxEnd = visualEndOff;
    } else if (startOff < clusterMaxEnd) {
      currentCluster.push(item);
      clusterMaxEnd = Math.max(clusterMaxEnd, visualEndOff);
    } else {
      rawClusters.push(currentCluster);
      currentCluster = [item];
      clusterMaxEnd = visualEndOff;
    }
  }
  if (currentCluster.length > 0) {
    rawClusters.push(currentCluster);
  }

  const positionedItems: PositionedTimelineItem[] = [];
  const clusters: TimelineOverlapCluster[] = [];

  rawClusters.forEach((clusterItems, clusterIdx) => {
    const clusterId = `cluster-${clusterIdx}`;
    const laneEndOffsets: number[] = [];
    const assignedLanes: number[] = [];

    for (const item of clusterItems) {
      const startOff = item.segment.elapsedStartOffsetMinutes;
      const visualEndOff = getVisualEnd(item);
      let placedLane = -1;
      for (let lane = 0; lane < laneEndOffsets.length; lane++) {
        if (laneEndOffsets[lane] <= startOff) {
          placedLane = lane;
          laneEndOffsets[lane] = visualEndOff;
          break;
        }
      }
      if (placedLane === -1) {
        placedLane = laneEndOffsets.length;
        laneEndOffsets.push(visualEndOff);
      }
      assignedLanes.push(placedLane);
    }

    const totalLanes = Math.max(1, laneEndOffsets.length);
    const activeBlockingItems = clusterItems.filter(
      (it) => it.state === "active" && it.isBlocking,
    );

    // Check if at least two active blocking items actually overlap in time
    let hasConflict = false;
    for (let i = 0; i < activeBlockingItems.length && !hasConflict; i++) {
      for (let j = i + 1; j < activeBlockingItems.length; j++) {
        const aStart = activeBlockingItems[i].segment.elapsedStartOffsetMinutes;
        const aEnd = activeBlockingItems[i].segment.elapsedEndOffsetMinutes;
        const bStart = activeBlockingItems[j].segment.elapsedStartOffsetMinutes;
        const bEnd = activeBlockingItems[j].segment.elapsedEndOffsetMinutes;
        if (Math.max(aStart, bStart) < Math.min(aEnd, bEnd)) {
          hasConflict = true;
          break;
        }
      }
    }

    const clusterPositioned: PositionedTimelineItem[] = clusterItems.map(
      (item, i) => {
        const startOff = Math.max(
          0,
          Math.min(totalDayMinutes, item.segment.elapsedStartOffsetMinutes),
        );
        const endOff = Math.max(
          startOff + 1,
          Math.min(totalDayMinutes, item.segment.elapsedEndOffsetMinutes),
        );
        const topPercent = (startOff / totalDayMinutes) * 100;
        const heightPercent = ((endOff - startOff) / totalDayMinutes) * 100;
        const { visualState, statusBadgeUk } = classifyTimelineItemVisualState(
          item,
          params.nowMs,
        );

        return {
          item,
          laneIndex: assignedLanes[i],
          totalLanes,
          clusterId,
          clusterSize: clusterItems.length,
          hasConflict:
            hasConflict && item.state === "active" && item.isBlocking,
          elapsedStartOffsetMinutes: startOff,
          elapsedEndOffsetMinutes: endOff,
          topPercent,
          heightPercent,
          visualState,
          statusBadgeUk,
        };
      },
    );

    positionedItems.push(...clusterPositioned);

    const minStart = Math.min(
      ...clusterPositioned.map((p) => p.elapsedStartOffsetMinutes),
    );
    const maxEnd = Math.max(
      ...clusterPositioned.map((p) => p.elapsedEndOffsetMinutes),
    );
    const firstSeg = clusterItems[0].segment;
    const lastSeg = clusterItems.reduce((acc, cur) =>
      cur.segment.elapsedEndOffsetMinutes >= acc.segment.elapsedEndOffsetMinutes
        ? cur
        : acc,
    ).segment;

    clusters.push({
      clusterId,
      startOffsetMinutes: minStart,
      endOffsetMinutes: maxEnd,
      displayStartLocalTime: firstSeg.displayStartLocalTime,
      displayEndLocalTime: lastSeg.displayEndLocalTime,
      totalLanes,
      hasConflict,
      items: clusterPositioned,
    });
  });

  return { positionedItems, clusters };
}
