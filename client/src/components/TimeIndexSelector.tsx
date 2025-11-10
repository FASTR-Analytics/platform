import {
  DoubleSlider,
  formatPeriod,
  getPeriodIdFromTime,
  PeriodType,
} from "panther";
import { getCalendar } from "lib";
import { Show, createMemo } from "solid-js";

type TimeIndexSelectorProps = {
  minTimeIndex: number;
  maxTimeIndex: number;
  selectedStartTimeIndex: number;
  selectedEndTimeIndex: number;
  timeMin: number;
  periodType: PeriodType;
  onChangeStart: (timeIndex: number) => void;
  onChangeEnd: (timeIndex: number) => void;
};

export function TimeIndexSelector(p: TimeIndexSelectorProps) {
  // Validate props - using getter for reactive validation
  const isValid = () => {
    if (p.minTimeIndex > p.maxTimeIndex) {
      console.error(
        "TimeIndexSelector: minTimeIndex cannot be greater than maxTimeIndex",
      );
      return false;
    }

    if (
      p.selectedStartTimeIndex < p.minTimeIndex ||
      p.selectedStartTimeIndex > p.maxTimeIndex
    ) {
      console.error(
        "TimeIndexSelector: selectedStartTimeIndex is out of bounds",
      );
      return false;
    }

    if (
      p.selectedEndTimeIndex < p.minTimeIndex ||
      p.selectedEndTimeIndex > p.maxTimeIndex
    ) {
      console.error("TimeIndexSelector: selectedEndTimeIndex is out of bounds");
      return false;
    }

    if (p.selectedStartTimeIndex > p.selectedEndTimeIndex) {
      console.error(
        "TimeIndexSelector: selectedStartTimeIndex cannot be greater than selectedEndTimeIndex",
      );
      return false;
    }

    return true;
  };

  // Ensure callbacks receive valid values - accessing props directly in callbacks for reactivity
  const handleStartChange = (value: number) => {
    const clampedValue = Math.max(
      p.minTimeIndex,
      Math.min(value, p.maxTimeIndex),
    );
    p.onChangeStart(clampedValue);
  };

  const handleEndChange = (value: number) => {
    const clampedValue = Math.max(
      p.minTimeIndex,
      Math.min(value, p.maxTimeIndex),
    );
    p.onChangeEnd(clampedValue);
  };

  // Safe period formatting with error handling - using getter for reactivity
  const formatPeriodSafe = (timeIndex: number) => {
    try {
      const periodId = getPeriodIdFromTime(p.timeMin + timeIndex, p.periodType);
      return formatPeriod(periodId, p.periodType, getCalendar());
    } catch (error) {
      console.error("TimeIndexSelector: Error formatting period", error);
      return "Invalid period";
    }
  };

  // Create memos for the formatted periods to ensure reactivity and caching
  const formattedStartPeriod = createMemo(() =>
    formatPeriodSafe(p.selectedStartTimeIndex),
  );
  const formattedEndPeriod = createMemo(() =>
    formatPeriodSafe(p.selectedEndTimeIndex),
  );

  return (
    <Show
      when={isValid()}
      fallback={<div class="text-danger">Invalid time range configuration</div>}
    >
      <div class="w-full pt-3">
        <DoubleSlider
          min={p.minTimeIndex}
          max={p.maxTimeIndex}
          increment={1}
          valueLow={p.selectedStartTimeIndex}
          valueHigh={p.selectedEndTimeIndex}
          onChangeLow={handleStartChange}
          onChangeHigh={handleEndChange}
          // minDifference={2}
        />
        <div class="pt-2 text-center text-sm">
          <div class="flex-1 truncate">
            {formattedStartPeriod()}
            {" to "}
            {formattedEndPeriod()}
          </div>
        </div>
      </div>
    </Show>
  );
}
