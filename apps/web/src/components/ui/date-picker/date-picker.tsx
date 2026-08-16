"use client";

import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

export type DatePickerProps = Readonly<{
  value?: string; // YYYY-MM-DD or YYYY-MM-DDTHH:mm
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  name?: string;
  id?: string;
  disabled?: boolean;
  clearable?: boolean;
  includeTime?: boolean;
  minDate?: string;
  maxDate?: string;
  className?: string;
}>;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const WEEKDAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseDateValue(
  value: string | undefined,
  includeTime: boolean
): {
  year: number;
  month: number; // 0-11
  day: number;
  hours: number;
  minutes: number;
} {
  const now = new Date();
  if (!value) {
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
      hours: now.getHours(),
      minutes: now.getMinutes()
    };
  }

  const [datePart, timePart] = value.split("T");
  const [yStr, mStr, dStr] = (datePart ?? "").split("-");
  const year = Number(yStr) || now.getFullYear();
  const month = (Number(mStr) || 1) - 1;
  const day = Number(dStr) || now.getDate();

  let hours = 0;
  let minutes = 0;

  if (includeTime && timePart) {
    const [hStr, minStr] = timePart.split(":");
    hours = Number(hStr) || 0;
    minutes = Number(minStr) || 0;
  }

  return { year, month, day, hours, minutes };
}

function formatDateString(
  year: number,
  month: number,
  day: number,
  includeTime: boolean,
  hours = 0,
  minutes = 0
): string {
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;

  if (!includeTime) {
    return dateStr;
  }

  const hh = String(hours).padStart(2, "0");
  const min = String(minutes).padStart(2, "0");
  return `${dateStr}T${hh}:${min}`;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  "aria-label": ariaLabel,
  name,
  id,
  disabled = false,
  clearable = false,
  includeTime = false,
  className
}: DatePickerProps): ReactNode {
  const generatedId = useId();
  const datePickerId = id ?? generatedId;
  const popoverId = `${datePickerId}-popover`;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const parsed = parseDateValue(value, includeTime);

  const [viewYear, setViewYear] = useState(parsed.year);
  const [viewMonth, setViewMonth] = useState(parsed.month);
  const [timeHours, setTimeHours] = useState(parsed.hours);
  const [timeMinutes, setTimeMinutes] = useState(parsed.minutes);

  useEffect(() => {
    if (value) {
      const p = parseDateValue(value, includeTime);
      setViewYear(p.year);
      setViewMonth(p.month);
      setTimeHours(p.hours);
      setTimeMinutes(p.minutes);
    }
  }, [value, includeTime]);

  useEffect(() => {
    if (!isOpen) return;

    function handleOutsideClick(event: MouseEvent): void {
      const target = event.target;
      if (
        target instanceof Node &&
        containerRef.current !== null &&
        !containerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function toggleOpen(): void {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  }

  function handlePrevMonth(): void {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function handleNextMonth(): void {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function handleSelectDay(day: number): void {
    const formatted = formatDateString(
      viewYear,
      viewMonth,
      day,
      includeTime,
      timeHours,
      timeMinutes
    );
    onChange(formatted);
    if (!includeTime) {
      setIsOpen(false);
    }
  }

  function handleTimeChange(h: number, m: number): void {
    const clampedH = Math.min(23, Math.max(0, h));
    const clampedM = Math.min(59, Math.max(0, m));
    setTimeHours(clampedH);
    setTimeMinutes(clampedM);

    if (value) {
      const p = parseDateValue(value, includeTime);
      const formatted = formatDateString(p.year, p.month, p.day, true, clampedH, clampedM);
      onChange(formatted);
    }
  }

  function handleSetToday(): void {
    const today = new Date();
    const formatted = formatDateString(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      includeTime,
      includeTime ? today.getHours() : 0,
      includeTime ? today.getMinutes() : 0
    );
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    onChange(formatted);
    if (!includeTime) {
      setIsOpen(false);
    }
  }

  function handleClear(): void {
    onChange("");
    setIsOpen(false);
  }

  // Days calculations
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const prevMonthDays = Array.from({ length: firstDayOfWeek }, (_, i) => ({
    day: daysInPrevMonth - firstDayOfWeek + i + 1,
    isCurrentMonth: false
  }));

  const currentMonthDays = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    isCurrentMonth: true
  }));

  const totalCells = prevMonthDays.length + currentMonthDays.length;
  const nextMonthPaddingCount = (7 - (totalCells % 7)) % 7;
  const nextMonthDays = Array.from({ length: nextMonthPaddingCount }, (_, i) => ({
    day: i + 1,
    isCurrentMonth: false
  }));

  const allCalendarDays = [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];

  const today = new Date();
  const isTodayMonth = today.getFullYear() === viewYear && today.getMonth() === viewMonth;
  const todayDay = today.getDate();

  const selectedParsed = value ? parseDateValue(value, includeTime) : null;
  const isSelectedMonth =
    selectedParsed !== null &&
    selectedParsed.year === viewYear &&
    selectedParsed.month === viewMonth;

  const inputClasses = [
    "flex min-h-11 w-full items-center justify-between rounded-lg border border-border bg-surface-muted pl-3.5 pr-9 py-2.5 font-mono text-base text-foreground outline-none transition-colors duration-150 sm:text-sm",
    "hover:border-accent/50 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={containerRef} className="relative w-full min-w-[160px] sm:w-auto">
      <div className="relative flex items-center w-full">
        <input
          id={datePickerId}
          name={name}
          aria-label={ariaLabel}
          aria-controls={isOpen ? popoverId : undefined}
          placeholder={placeholder}
          disabled={disabled}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          onClick={toggleOpen}
          className={inputClasses}
        />

        <div className="absolute right-2.5 flex items-center gap-1">
          {clearable && value ? (
            <button
              type="button"
              aria-label="Clear date"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="rounded p-0.5 text-foreground-muted hover:bg-surface hover:text-foreground"
            >
              <X size={14} />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Toggle calendar"
            disabled={disabled}
            onClick={toggleOpen}
            className="rounded p-0.5 text-foreground-muted hover:text-accent focus:outline-none"
          >
            <CalendarIcon size={16} />
          </button>
        </div>
      </div>

      {isOpen ? (
        <div
          id={popoverId}
          role="dialog"
          aria-label={ariaLabel ?? "Calendar picker"}
          className="animate-fade-in absolute z-50 mt-1.5 w-[280px] sm:w-[300px] rounded-2xl border border-border bg-surface-elevated p-4 shadow-xl backdrop-blur-md"
        >
          {/* Header navigation */}
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/60">
            <button
              type="button"
              aria-label="Previous month"
              onClick={handlePrevMonth}
              className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted hover:border-accent/40 hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="font-mono text-sm font-bold tracking-tight text-foreground">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </div>
            <button
              type="button"
              aria-label="Next month"
              onClick={handleNextMonth}
              className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface-muted text-foreground-muted hover:border-accent/40 hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 pt-3 text-center">
            {WEEKDAY_NAMES.map((dayName) => (
              <div
                key={dayName}
                className="font-mono text-2xs font-bold text-foreground-muted uppercase tracking-wider"
              >
                {dayName}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 pt-1.5">
            {allCalendarDays.map((item, idx) => {
              if (!item.isCurrentMonth) {
                return (
                  <div
                    key={`pad-${idx}`}
                    className="grid h-9 w-9 place-items-center text-xs font-mono text-foreground-muted/30 select-none"
                  >
                    {item.day}
                  </div>
                );
              }

              const isSelected = isSelectedMonth && selectedParsed?.day === item.day;
              const isToday = isTodayMonth && todayDay === item.day;

              return (
                <button
                  key={`day-${item.day}`}
                  type="button"
                  onClick={() => handleSelectDay(item.day)}
                  className={`grid h-9 w-9 place-items-center rounded-lg font-mono text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    isSelected
                      ? "bg-accent font-bold text-accent-foreground shadow-sm"
                      : isToday
                        ? "border border-accent/60 bg-accent/10 font-bold text-accent"
                        : "hover:bg-surface-muted text-foreground hover:text-foreground"
                  }`}
                >
                  {item.day}
                </button>
              );
            })}
          </div>

          {/* Optional Time Selector for datetime-local mode */}
          {includeTime ? (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-surface-muted/60 p-2 text-xs">
              <span className="flex items-center gap-1.5 font-mono text-2xs font-bold text-foreground-muted uppercase tracking-wider">
                <Clock size={14} className="text-foreground-muted" /> Time
              </span>
              <div className="flex items-center gap-1 font-mono">
                <input
                  type="number"
                  min={0}
                  max={23}
                  aria-label="Hours"
                  value={String(timeHours).padStart(2, "0")}
                  onChange={(e) => handleTimeChange(Number(e.target.value), timeMinutes)}
                  className="w-10 rounded-md border border-border bg-surface px-1.5 py-1 text-center font-bold text-foreground outline-none focus:border-accent"
                />
                <span className="text-foreground-muted font-bold">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  aria-label="Minutes"
                  value={String(timeMinutes).padStart(2, "0")}
                  onChange={(e) => handleTimeChange(timeHours, Number(e.target.value))}
                  className="w-10 rounded-md border border-border bg-surface px-1.5 py-1 text-center font-bold text-foreground outline-none focus:border-accent"
                />
              </div>
            </div>
          ) : null}

          {/* Footer Shortcuts */}
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-xs">
            <button
              type="button"
              onClick={handleSetToday}
              className="rounded-md px-2 py-1 font-mono text-2xs font-semibold text-accent hover:bg-accent/10 transition-colors"
            >
              Today
            </button>
            {clearable ? (
              <button
                type="button"
                onClick={handleClear}
                className="rounded-md px-2 py-1 font-mono text-2xs font-semibold text-foreground-muted hover:text-expense hover:bg-expense/10 transition-colors"
              >
                Clear
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="ml-auto rounded-md bg-surface-muted px-2.5 py-1 font-mono text-2xs font-semibold text-foreground hover:bg-surface transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
