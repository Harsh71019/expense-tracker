import { requireSafeInteger } from "../statistics/index.js";

const SYNTHETIC_HISTORY_VERSION = 1;
const DEFAULT_SEED = 20_260_802;
const DEFAULT_START_MONTH = "2024-01";
const DEFAULT_MONTH_COUNT = 24;
const MINIMUM_MONTH_COUNT = 18;
const MAXIMUM_MONTH_COUNT = 60;

export type SyntheticEventDirection = "income" | "expense" | "transfer" | "informational";

export type SyntheticEventKind =
  | "salary"
  | "rent"
  | "groceries"
  | "biweekly_service"
  | "utility"
  | "annual_membership"
  | "travel_shock"
  | "medical_shock"
  | "ordinary_purchase"
  | "transfer"
  | "reversal"
  | "credit_card_purchase"
  | "credit_card_statement"
  | "credit_card_payment";

export interface SyntheticFinanceEvent {
  readonly id: string;
  readonly calendarDate: string;
  readonly amountMinor: number;
  readonly direction: SyntheticEventDirection;
  readonly kind: SyntheticEventKind;
  readonly accountKey: string;
  readonly counterpartyKey: string | null;
  readonly narration: string;
  readonly expectedCategoryKey: string | null;
  readonly recordedCategoryKey: string | null;
  readonly recurringStreamKey: string | null;
  readonly relatedEventId: string | null;
}

export type SyntheticTruthAnnotation =
  | Readonly<{
      kind: "category_correction";
      eventId: string;
      recordedCategoryKey: string;
      expectedCategoryKey: string;
    }>
  | Readonly<{
      kind: "missing_recurring_event";
      recurringStreamKey: string;
      expectedDate: string;
    }>
  | Readonly<{
      kind: "delayed_recurring_event";
      recurringStreamKey: string;
      expectedDate: string;
      actualDate: string;
      eventId: string;
    }>
  | Readonly<{
      kind: "gradual_regime_change" | "abrupt_regime_change";
      recurringStreamKey: string;
      startsOn: string;
    }>
  | Readonly<{
      kind: "repeated_equal_legitimate_purchase";
      eventIds: readonly [string, string];
    }>;

export interface SyntheticPersonalFinanceHistory {
  readonly datasetVersion: number;
  readonly seed: number;
  readonly startMonth: string;
  readonly monthCount: number;
  readonly events: readonly SyntheticFinanceEvent[];
  readonly truth: readonly SyntheticTruthAnnotation[];
}

export interface SyntheticHistoryOptions {
  readonly seed?: number;
  readonly startMonth?: string;
  readonly monthCount?: number;
}

interface CalendarMonth {
  readonly year: number;
  readonly month: number;
  readonly key: string;
}

interface SyntheticEventInput {
  readonly calendarDate: string;
  readonly amountMinor: number;
  readonly direction: SyntheticEventDirection;
  readonly kind: SyntheticEventKind;
  readonly accountKey: string;
  readonly counterpartyKey: string | null;
  readonly narration: string;
  readonly expectedCategoryKey: string | null;
  readonly recordedCategoryKey: string | null;
  readonly recurringStreamKey: string | null;
  readonly relatedEventId: string | null;
}

function twoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}

function parseMonth(value: string): CalendarMonth {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new RangeError("startMonth must be a YYYY-MM calendar month.");
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  if (month < 1 || month > 12) {
    throw new RangeError("startMonth must be a valid calendar month.");
  }
  return { year, month, key: value };
}

function offsetMonth(start: CalendarMonth, offset: number): CalendarMonth {
  const date = new Date(Date.UTC(start.year, start.month - 1 + offset, 1));
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return { year, month, key: `${year}-${twoDigits(month)}` };
}

function calendarDate(month: CalendarMonth, day: number): string {
  return `${month.key}-${twoDigits(day)}`;
}

function addCalendarDays(value: string, days: number): string {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function shiftForwardToWorkingDay(value: string): string {
  let shifted = value;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const year = Number(shifted.slice(0, 4));
    const month = Number(shifted.slice(5, 7));
    const day = Number(shifted.slice(8, 10));
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) return shifted;
    shifted = addCalendarDays(shifted, 1);
  }
  return shifted;
}

function firstWeekdayOfMonth(month: CalendarMonth, weekday: number): number {
  const firstWeekday = new Date(Date.UTC(month.year, month.month - 1, 1)).getUTCDay();
  return 1 + ((weekday - firstWeekday + 7) % 7);
}

function createPseudoRandom(seed: number): (maximumExclusive: number) => number {
  let state = seed >>> 0;
  return (maximumExclusive: number): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % maximumExclusive;
  };
}

function validateOptions(options: SyntheticHistoryOptions): Required<SyntheticHistoryOptions> {
  const seed = options.seed ?? DEFAULT_SEED;
  const startMonth = options.startMonth ?? DEFAULT_START_MONTH;
  const monthCount = options.monthCount ?? DEFAULT_MONTH_COUNT;
  requireSafeInteger(seed, "seed");
  requireSafeInteger(monthCount, "monthCount");
  parseMonth(startMonth);
  if (monthCount < MINIMUM_MONTH_COUNT || monthCount > MAXIMUM_MONTH_COUNT) {
    throw new RangeError(
      `monthCount must be between ${MINIMUM_MONTH_COUNT} and ${MAXIMUM_MONTH_COUNT}.`
    );
  }
  return { seed, startMonth, monthCount };
}

/**
 * Builds deterministic, labeled personal-finance data without real narrations.
 * The fixture deliberately includes difficult history rather than idealized rows.
 */
export function buildSyntheticPersonalFinanceHistory(
  options: SyntheticHistoryOptions = {}
): SyntheticPersonalFinanceHistory {
  const resolved = validateOptions(options);
  const start = parseMonth(resolved.startMonth);
  const random = createPseudoRandom(resolved.seed);
  const events: SyntheticFinanceEvent[] = [];
  const truth: SyntheticTruthAnnotation[] = [];
  let sequence = 0;

  const addEvent = (input: SyntheticEventInput): string => {
    sequence += 1;
    const id = `synthetic-${sequence.toString().padStart(4, "0")}`;
    events.push({ id, ...input });
    return id;
  };

  for (let monthIndex = 0; monthIndex < resolved.monthCount; monthIndex += 1) {
    const month = offsetMonth(start, monthIndex);
    const firstDay = calendarDate(month, 1);
    const salaryDate = shiftForwardToWorkingDay(firstDay);
    addEvent({
      calendarDate: salaryDate,
      amountMinor: 12_500_000,
      direction: "income",
      kind: "salary",
      accountKey: "salary_account",
      counterpartyKey: "synthetic_employer",
      narration: `NEFT CREDIT SYNTHETIC EMPLOYER UTR${monthIndex.toString().padStart(4, "0")}`,
      expectedCategoryKey: "salary",
      recordedCategoryKey: "salary",
      recurringStreamKey: "monthly_salary",
      relatedEventId: null
    });

    const expectedRentDate = calendarDate(month, 3);
    const rentDate = monthIndex === 9 ? addCalendarDays(expectedRentDate, 4) : expectedRentDate;
    const rentId = addEvent({
      calendarDate: rentDate,
      amountMinor: 3_200_000,
      direction: "expense",
      kind: "rent",
      accountKey: "salary_account",
      counterpartyKey: "synthetic_landlord",
      narration: `UPI/P2P/${100_000_000_000 + random(899_999_999_999)}/HOME RENT`,
      expectedCategoryKey: "rent",
      recordedCategoryKey: "rent",
      recurringStreamKey: "monthly_rent",
      relatedEventId: null
    });
    if (monthIndex === 9) {
      truth.push({
        kind: "delayed_recurring_event",
        recurringStreamKey: "monthly_rent",
        expectedDate: expectedRentDate,
        actualDate: rentDate,
        eventId: rentId
      });
    }

    const utilityDate = calendarDate(month, 10);
    if (monthIndex === 7) {
      truth.push({
        kind: "missing_recurring_event",
        recurringStreamKey: "monthly_utility",
        expectedDate: utilityDate
      });
    } else {
      const utilityRegimeMinor = monthIndex < 12 ? 210_000 : 345_000;
      addEvent({
        calendarDate: utilityDate,
        amountMinor: utilityRegimeMinor + random(45_001),
        direction: "expense",
        kind: "utility",
        accountKey: "salary_account",
        counterpartyKey: "synthetic_power_utility",
        narration: `NACH SYNTHETIC POWER BILL ${month.key.replace("-", "")}`,
        expectedCategoryKey: "utilities",
        recordedCategoryKey: "utilities",
        recurringStreamKey: "monthly_utility",
        relatedEventId: null
      });
    }

    const groceryAliases = ["FRESH BASKET", "FRESHBASKET", "FB MARKET"];
    const firstSaturday = firstWeekdayOfMonth(month, 6);
    for (let day = firstSaturday; day <= 28; day += 7) {
      const aliasIndex = (monthIndex + day) % groceryAliases.length;
      const alias =
        aliasIndex === 0 ? "FRESH BASKET" : aliasIndex === 1 ? "FRESHBASKET" : "FB MARKET";
      const recordedCategoryKey =
        monthIndex === 2 && day === firstSaturday ? "shopping" : "groceries";
      const groceryId = addEvent({
        calendarDate: calendarDate(month, day),
        amountMinor: 118_000 + monthIndex * 3_500 + random(32_001),
        direction: "expense",
        kind: "groceries",
        accountKey: monthIndex % 4 === 0 ? "credit_card" : "salary_account",
        counterpartyKey: "fresh_basket",
        narration: `UPI/P2M/${100_000_000_000 + random(899_999_999_999)}/${alias}/ORDER${random(10_000)}`,
        expectedCategoryKey: "groceries",
        recordedCategoryKey,
        recurringStreamKey: "weekly_groceries",
        relatedEventId: null
      });
      if (recordedCategoryKey !== "groceries") {
        truth.push({
          kind: "category_correction",
          eventId: groceryId,
          recordedCategoryKey,
          expectedCategoryKey: "groceries"
        });
      }
    }

    for (const day of [8, 22]) {
      addEvent({
        calendarDate: calendarDate(month, day),
        amountMinor: 85_000,
        direction: "expense",
        kind: "biweekly_service",
        accountKey: "salary_account",
        counterpartyKey: "synthetic_home_service",
        narration: `IMPS SYNTHETIC HOME SERVICE REF${monthIndex}${day}`,
        expectedCategoryKey: "household_services",
        recordedCategoryKey: "household_services",
        recurringStreamKey: "biweekly_home_service",
        relatedEventId: null
      });
    }

    if (monthIndex % 12 === 0) {
      addEvent({
        calendarDate: calendarDate(month, 15),
        amountMinor: 499_900,
        direction: "expense",
        kind: "annual_membership",
        accountKey: "credit_card",
        counterpartyKey: "synthetic_membership",
        narration: `CARD SYNTHETIC MEMBERSHIP ${month.year}`,
        expectedCategoryKey: "subscriptions",
        recordedCategoryKey: "subscriptions",
        recurringStreamKey: "annual_membership",
        relatedEventId: null
      });
    }

    addEvent({
      calendarDate: calendarDate(month, 6),
      amountMinor: 1_000_000,
      direction: "transfer",
      kind: "transfer",
      accountKey: "salary_account",
      counterpartyKey: "own_savings_account",
      narration: `TRANSFER TO OWN SAVINGS ${month.key}`,
      expectedCategoryKey: null,
      recordedCategoryKey: null,
      recurringStreamKey: "monthly_savings_transfer",
      relatedEventId: null
    });

    const cardPurchaseOneAmount = 175_000 + random(75_001);
    const cardPurchaseOne = addEvent({
      calendarDate: calendarDate(month, 12),
      amountMinor: cardPurchaseOneAmount,
      direction: "expense",
      kind: "credit_card_purchase",
      accountKey: "credit_card",
      counterpartyKey: "synthetic_online_shop",
      narration: `CARD PURCHASE SYNTHETIC ONLINE SHOP ${random(100_000)}`,
      expectedCategoryKey: "shopping",
      recordedCategoryKey: "shopping",
      recurringStreamKey: null,
      relatedEventId: null
    });
    const cardPurchaseTwoAmount = 90_000 + random(50_001);
    addEvent({
      calendarDate: calendarDate(month, 18),
      amountMinor: cardPurchaseTwoAmount,
      direction: "expense",
      kind: "credit_card_purchase",
      accountKey: "credit_card",
      counterpartyKey: "synthetic_cafe",
      narration: `CARD PURCHASE SYNTHETIC CAFE ${random(100_000)}`,
      expectedCategoryKey: "dining",
      recordedCategoryKey: "dining",
      recurringStreamKey: null,
      relatedEventId: null
    });
    const statementAmount = cardPurchaseOneAmount + cardPurchaseTwoAmount;
    const statementId = addEvent({
      calendarDate: calendarDate(month, 20),
      amountMinor: statementAmount,
      direction: "informational",
      kind: "credit_card_statement",
      accountKey: "credit_card",
      counterpartyKey: "synthetic_card_issuer",
      narration: `SYNTHETIC CARD STATEMENT ${month.key}`,
      expectedCategoryKey: null,
      recordedCategoryKey: null,
      recurringStreamKey: "monthly_card_statement",
      relatedEventId: cardPurchaseOne
    });
    addEvent({
      calendarDate: calendarDate(month, 27),
      amountMinor: statementAmount,
      direction: "transfer",
      kind: "credit_card_payment",
      accountKey: "salary_account",
      counterpartyKey: "synthetic_card_issuer",
      narration: `CARD PAYMENT ${month.key}`,
      expectedCategoryKey: null,
      recordedCategoryKey: null,
      recurringStreamKey: "monthly_card_payment",
      relatedEventId: statementId
    });

    if (monthIndex === 5) {
      addEvent({
        calendarDate: calendarDate(month, 17),
        amountMinor: 4_750_000,
        direction: "expense",
        kind: "travel_shock",
        accountKey: "credit_card",
        counterpartyKey: "synthetic_travel_agency",
        narration: "CARD SYNTHETIC TRAVEL AGENCY HOLIDAY",
        expectedCategoryKey: "travel",
        recordedCategoryKey: "travel",
        recurringStreamKey: null,
        relatedEventId: null
      });
    }

    if (monthIndex === 13) {
      addEvent({
        calendarDate: calendarDate(month, 11),
        amountMinor: 2_250_000,
        direction: "expense",
        kind: "medical_shock",
        accountKey: "salary_account",
        counterpartyKey: "synthetic_hospital",
        narration: "UPI SYNTHETIC HOSPITAL MEDICAL",
        expectedCategoryKey: "medical",
        recordedCategoryKey: "medical",
        recurringStreamKey: null,
        relatedEventId: null
      });
    }

    if (monthIndex === 6) {
      const repeatedDate = calendarDate(month, 16);
      const firstId = addEvent({
        calendarDate: repeatedDate,
        amountMinor: 64_900,
        direction: "expense",
        kind: "ordinary_purchase",
        accountKey: "salary_account",
        counterpartyKey: "synthetic_bookshop",
        narration: "UPI SYNTHETIC BOOKSHOP ORDER 101",
        expectedCategoryKey: "shopping",
        recordedCategoryKey: "shopping",
        recurringStreamKey: null,
        relatedEventId: null
      });
      const secondId = addEvent({
        calendarDate: repeatedDate,
        amountMinor: 64_900,
        direction: "expense",
        kind: "ordinary_purchase",
        accountKey: "salary_account",
        counterpartyKey: "synthetic_bookshop",
        narration: "UPI SYNTHETIC BOOKSHOP ORDER 102",
        expectedCategoryKey: "shopping",
        recordedCategoryKey: "shopping",
        recurringStreamKey: null,
        relatedEventId: null
      });
      truth.push({
        kind: "repeated_equal_legitimate_purchase",
        eventIds: [firstId, secondId]
      });
    }

    if (monthIndex === 10) {
      const purchaseId = addEvent({
        calendarDate: calendarDate(month, 14),
        amountMinor: 189_900,
        direction: "expense",
        kind: "ordinary_purchase",
        accountKey: "credit_card",
        counterpartyKey: "synthetic_electronics",
        narration: "CARD SYNTHETIC ELECTRONICS PURCHASE",
        expectedCategoryKey: "shopping",
        recordedCategoryKey: "shopping",
        recurringStreamKey: null,
        relatedEventId: null
      });
      addEvent({
        calendarDate: calendarDate(month, 16),
        amountMinor: 189_900,
        direction: "income",
        kind: "reversal",
        accountKey: "credit_card",
        counterpartyKey: "synthetic_electronics",
        narration: "CARD REVERSAL SYNTHETIC ELECTRONICS",
        expectedCategoryKey: "shopping",
        recordedCategoryKey: "shopping",
        recurringStreamKey: null,
        relatedEventId: purchaseId
      });
    }
  }

  truth.push({
    kind: "gradual_regime_change",
    recurringStreamKey: "weekly_groceries",
    startsOn: calendarDate(offsetMonth(start, 4), 1)
  });
  truth.push({
    kind: "abrupt_regime_change",
    recurringStreamKey: "monthly_utility",
    startsOn: calendarDate(offsetMonth(start, 12), 1)
  });

  events.sort((left, right) => {
    const dateOrder = left.calendarDate.localeCompare(right.calendarDate);
    return dateOrder === 0 ? left.id.localeCompare(right.id) : dateOrder;
  });

  return {
    datasetVersion: SYNTHETIC_HISTORY_VERSION,
    seed: resolved.seed,
    startMonth: resolved.startMonth,
    monthCount: resolved.monthCount,
    events,
    truth
  };
}
