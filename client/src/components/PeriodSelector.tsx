import { getPeriodIdFromTime, getTimeFromPeriodId, PeriodType } from "panther";
import { TimeIndexSelector } from "./TimeIndexSelector";
import { Show, createMemo } from "solid-js";

type PeriodSelectorProps = {
  periodType: PeriodType;
  minPeriodId: number;
  maxPeriodId: number;
  selectedStartPeriodId: number;
  selectedEndPeriodId: number;
  onChangeStart: (periodId: number) => void;
  onChangeEnd: (periodId: number) => void;
};

export function PeriodSelector(p: PeriodSelectorProps) {
  // Validate period IDs - using memo for reactive validation
  const isValid = createMemo(() => {
    if (p.minPeriodId > p.maxPeriodId) {
      console.error(
        "PeriodSelector: minPeriodId cannot be greater than maxPeriodId",
      );
      return false;
    }

    if (
      p.selectedStartPeriodId < p.minPeriodId ||
      p.selectedStartPeriodId > p.maxPeriodId
    ) {
      console.error("PeriodSelector: selectedStartPeriodId is out of bounds");
      return false;
    }

    if (
      p.selectedEndPeriodId < p.minPeriodId ||
      p.selectedEndPeriodId > p.maxPeriodId
    ) {
      console.error("PeriodSelector: selectedEndPeriodId is out of bounds");
      return false;
    }

    if (p.selectedStartPeriodId > p.selectedEndPeriodId) {
      console.error(
        "PeriodSelector: selectedStartPeriodId cannot be greater than selectedEndPeriodId",
      );
      return false;
    }

    return true;
  });

  // Convert period IDs to time values - using memos for reactivity and caching
  const minTime = createMemo(() => {
    try {
      return getTimeFromPeriodId(p.minPeriodId, p.periodType);
    } catch (error) {
      console.error(
        "PeriodSelector: Error converting minPeriodId to time",
        error,
      );
      return 0;
    }
  });

  const maxTime = createMemo(() => {
    try {
      return getTimeFromPeriodId(p.maxPeriodId, p.periodType);
    } catch (error) {
      console.error(
        "PeriodSelector: Error converting maxPeriodId to time",
        error,
      );
      return 0;
    }
  });

  const selectedStartTime = createMemo(() => {
    try {
      return getTimeFromPeriodId(p.selectedStartPeriodId, p.periodType);
    } catch (error) {
      console.error(
        "PeriodSelector: Error converting selectedStartPeriodId to time",
        error,
      );
      return minTime();
    }
  });

  const selectedEndTime = createMemo(() => {
    try {
      return getTimeFromPeriodId(p.selectedEndPeriodId, p.periodType);
    } catch (error) {
      console.error(
        "PeriodSelector: Error converting selectedEndPeriodId to time",
        error,
      );
      return maxTime();
    }
  });

  // Convert to time indices (0-based) - using getters for reactivity
  const minTimeIndex = () => 0;
  const maxTimeIndex = () => maxTime() - minTime();
  const selectedStartTimeIndex = () =>
    Math.max(0, Math.min(selectedStartTime() - minTime(), maxTimeIndex()));
  const selectedEndTimeIndex = () =>
    Math.max(0, Math.min(selectedEndTime() - minTime(), maxTimeIndex()));

  // Handle time index changes and convert back to period IDs
  const handleStartChange = (timeIndex: number) => {
    try {
      const clampedIndex = Math.max(0, Math.min(timeIndex, maxTimeIndex()));
      const periodId = getPeriodIdFromTime(
        minTime() + clampedIndex,
        p.periodType,
      );
      p.onChangeStart(periodId);
    } catch (error) {
      console.error(
        "PeriodSelector: Error converting time index to period ID",
        error,
      );
    }
  };

  const handleEndChange = (timeIndex: number) => {
    try {
      const clampedIndex = Math.max(0, Math.min(timeIndex, maxTimeIndex()));
      const periodId = getPeriodIdFromTime(
        minTime() + clampedIndex,
        p.periodType,
      );
      p.onChangeEnd(periodId);
    } catch (error) {
      console.error(
        "PeriodSelector: Error converting time index to period ID",
        error,
      );
    }
  };

  return (
    <Show
      when={isValid()}
      fallback={<div class="text-danger">Invalid period configuration</div>}
    >
      <TimeIndexSelector
        minTimeIndex={minTimeIndex()}
        maxTimeIndex={maxTimeIndex()}
        selectedStartTimeIndex={selectedStartTimeIndex()}
        selectedEndTimeIndex={selectedEndTimeIndex()}
        timeMin={minTime()}
        periodType={p.periodType}
        onChangeStart={handleStartChange}
        onChangeEnd={handleEndChange}
      />
    </Show>
  );
}
