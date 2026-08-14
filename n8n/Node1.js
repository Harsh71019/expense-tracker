const ACCOUNT_MAP = loadAccountMap($vars.TREASURY_OPS_ACCOUNT_MAP_JSON);

function loadAccountMap(raw) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("TREASURY_OPS_ACCOUNT_MAP_JSON is not configured");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("TREASURY_OPS_ACCOUNT_MAP_JSON must be valid JSON");
  }

  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("TREASURY_OPS_ACCOUNT_MAP_JSON must be a JSON object");
  }

  const entries = Object.entries(parsed);
  if (entries.length === 0) {
    throw new Error("TREASURY_OPS_ACCOUNT_MAP_JSON must contain at least one mapping");
  }

  for (const [last4, accountId] of entries) {
    if (!/^\d{4}$/.test(last4)) {
      throw new Error("Account-map keys must contain exactly four digits");
    }
    if (
      typeof accountId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)
    ) {
      throw new Error(`Account-map value for ${last4} must be a UUID`);
    }
  }

  return parsed;
}

const MONTHS = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12
};

const DESCRIPTION_MAX_LENGTH = 500;

const pad = (value) => String(value).padStart(2, "0");

function iso(year, month, day, hour = 0, minute = 0, second = 0) {
  return `${year}-${pad(month)}-${pad(day)}` + `T${pad(hour)}:${pad(minute)}:${pad(second)}+05:30`;
}

/**
 * Accepts:
 * - Gmail internalDate in epoch milliseconds
 * - Epoch seconds
 * - An ISO/RFC email Date header
 */
function parseEmailTimestamp(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const raw = String(value).trim();

  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);

    if (!Number.isFinite(numeric)) {
      return null;
    }

    const milliseconds = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;

    const date = new Date(milliseconds);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw);

  return Number.isNaN(date.getTime()) ? null : date;
}

function readDateHeader(headers) {
  if (Array.isArray(headers)) {
    const dateHeader = headers.find(
      (header) => String(header?.name ?? "").toLowerCase() === "date"
    );

    return dateHeader?.value ?? null;
  }

  if (headers && typeof headers === "object") {
    return headers.date ?? headers.Date ?? null;
  }

  return null;
}

function getEmailReceivedAt(json) {
  return (
    parseEmailTimestamp(json.internalDate) ??
    parseEmailTimestamp(json.internal_date) ??
    parseEmailTimestamp(json.receivedAt) ??
    parseEmailTimestamp(json.received_at) ??
    parseEmailTimestamp(json.receivedDateTime) ??
    parseEmailTimestamp(json.timestamp) ??
    parseEmailTimestamp(json.date) ??
    parseEmailTimestamp(json.metadata?.internalDate) ??
    parseEmailTimestamp(json.metadata?.date) ??
    parseEmailTimestamp(readDateHeader(json.headers)) ??
    parseEmailTimestamp(readDateHeader(json.payload?.headers)) ??
    parseEmailTimestamp(readDateHeader(json.metadata?.headers))
  );
}

function getIstDateTimeParts(date) {
  const formattedParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const values = {};

  for (const part of formattedParts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

/**
 * Bank UPI emails provide the transaction date but sometimes omit
 * the time. Preserve the bank-provided calendar date and combine it
 * with Gmail's received time in IST. This also handles delayed emails
 * that arrive shortly after midnight without changing the bank date.
 */
function dateWithEmailTime(year, month, day, emailReceivedAt) {
  if (emailReceivedAt) {
    const received = getIstDateTimeParts(emailReceivedAt);

    return iso(year, month, day, received.hour, received.minute, received.second);
  }

  return iso(year, month, day);
}

function parseDDMMYY(value, emailReceivedAt) {
  const [day, month, year] = value.split("-").map(Number);

  return dateWithEmailTime(2000 + year, month, day, emailReceivedAt);
}

function parseDDMMYYYY(value, emailReceivedAt) {
  const [day, month, year] = value.split("/").map(Number);

  return dateWithEmailTime(year, month, day, emailReceivedAt);
}

function parseDMonYYYYTime(dateValue, timeValue) {
  const match = /^(\d{1,2}) (\w{3}), (\d{4})$/.exec(dateValue);

  if (!match) {
    throw new Error(`Invalid date format: ${dateValue}`);
  }

  const [, day, monthName, year] = match;
  const month = MONTHS[monthName];

  if (!month) {
    throw new Error(`Invalid month: ${monthName}`);
  }

  const [hour, minute, second] = timeValue.split(":").map(Number);

  return iso(Number(year), month, Number(day), hour, minute, second);
}

function parseMonDYYYYTime(dateValue, timeValue) {
  const match = /^(\w{3}) (\d{1,2}), (\d{4})$/.exec(dateValue);

  if (!match) {
    throw new Error(`Invalid date format: ${dateValue}`);
  }

  const [, monthName, day, year] = match;
  const month = MONTHS[monthName];

  if (!month) {
    throw new Error(`Invalid month: ${monthName}`);
  }

  const [hour, minute, second] = timeValue.split(":").map(Number);

  return iso(Number(year), month, Number(day), hour, minute, second);
}

function toMinor(value) {
  const normalized = String(value).replace(/,/g, "");

  const match = /^(\d+)\.(\d{2})$/.exec(normalized);

  if (!match) {
    throw new Error(`Invalid money format: ${value}`);
  }

  const amountMinor = Number(match[1]) * 100 + Number(match[2]);

  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error(`Invalid money amount: ${value}`);
  }

  return amountMinor;
}

function htmlToText(html) {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|td|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function cleanDescriptionPart(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDescription(rail, direction, counterparty, { context = [], evidence = [] } = {}) {
  const prefixParts = [rail, direction, ...context].map(cleanDescriptionPart).filter(Boolean);

  const evidenceParts = evidence.map(cleanDescriptionPart).filter(Boolean);

  const cleanCounterparty = cleanDescriptionPart(counterparty);

  if (!cleanCounterparty) {
    throw new Error("Description counterparty is empty");
  }

  const prefix = `${prefixParts.join("/")}/`;

  const suffix = evidenceParts.length > 0 ? `/${evidenceParts.join("/")}` : "";

  const availableLength = DESCRIPTION_MAX_LENGTH - prefix.length - suffix.length;

  if (availableLength < 1) {
    throw new Error("Description evidence exceeds the API limit");
  }

  const boundedCounterparty = cleanCounterparty.slice(0, availableLength).trim();

  if (!boundedCounterparty) {
    throw new Error("Description counterparty is empty after truncation");
  }

  return `${prefix}${boundedCounterparty}${suffix}`;
}

/**
 * Deterministic UUID-shaped idempotency key generated from Gmail's
 * hexadecimal message ID. No crypto module is needed.
 */
function idToUuid(rawId) {
  const messageId = String(rawId ?? "").trim();

  if (!messageId) {
    throw new Error("Missing Gmail message id");
  }

  const hex = (messageId + messageId + messageId)
    .replace(/[^a-f0-9]/gi, "0")
    .padEnd(32, "0")
    .slice(0, 32)
    .toLowerCase();

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32)
  ].join("-");
}

function extractUpiReference(text) {
  const patterns = [
    /\bRRN\s*[:#-]?\s*([A-Za-z0-9-]{4,40})\b/i,
    /\bUPI\s+(?:Ref|Reference)(?:\s*(?:No\.?|Number))?\s*[:#-]?\s*([A-Za-z0-9-]{4,40})\b/i,
    /\bUPI\s+(?:Txn|Transaction)\s+(?:ID|No\.?|Number)\s*[:#-]?\s*([A-Za-z0-9-]{4,40})\b/i
  ];

  for (const pattern of patterns) {
    const value = pattern.exec(text)?.[1];

    if (!value) {
      continue;
    }

    return /^\d{12}$/.test(value) ? `RRN:${value}` : `REF:${value}`;
  }

  return null;
}

function formatReference(value) {
  const reference = String(value ?? "").trim();

  if (!reference) {
    return null;
  }

  return /^\d{12}$/.test(reference) ? `RRN:${reference}` : `REF:${reference}`;
}

function classify(text, emailReceivedAt) {
  if (/could not be completed/i.test(text)) {
    return {
      skip: true,
      reason: "declined"
    };
  }

  if (/upcoming E-mandate/i.test(text)) {
    return {
      skip: true,
      reason: "upcoming_emandate"
    };
  }

  if (/credit card payment was successful/i.test(text)) {
    return {
      skip: true,
      reason: "cred_bill_payment"
    };
  }

  if (/We have received payment of INR/i.test(text)) {
    return {
      skip: true,
      reason: "icici_bill_payment"
    };
  }

  let match;

  match = text.match(
    /Your (.+?) bill,[\s\S]*?has been successfully paid using your HDFC Bank Credit Card ending (\d{4})[\s\S]*?Amount:\s?([A-Z]{3})\s?([\d,]+\.\d{2})[\s\S]*?Date:\s?(\d{2}\/\d{2}\/\d{4})[\s\S]*?(?:SI Hub|Mandate) ID:\s?(\S+)/i
  );

  if (match) {
    const [, merchant, last4, currency, amount, date, mandateId] = match;

    const description = buildDescription("CARD", "DR", merchant, {
      context: ["EMANDATE"],
      evidence: [`mandate:${mandateId}`]
    });

    const occurredAt = parseDDMMYYYY(date, emailReceivedAt);

    if (currency.toUpperCase() === "INR") {
      return {
        skip: false,
        template: "hdfc_emandate_paid",
        type: "expense",
        last4,
        amountMinor: toMinor(amount),
        occurredAt,
        description
      };
    }

    return {
      skip: false,
      template: "hdfc_emandate_paid",
      needsAmountConfirmation: true,
      type: "expense",
      last4,
      occurredAt,
      description,
      originalCurrency: currency,
      originalAmount: amount
    };
  }

  match = text.match(
    /Rs\.?\s?([\d,]+\.\d{2})\s+is debited from your account ending (\d{4}) towards VPA ([^\s(]+)\s*\(([^)]+)\) on (\d{2}-\d{2}-\d{2})/
  );

  if (match) {
    const [, amount, last4, vpa, merchant, date] = match;

    const reference = extractUpiReference(text);

    return {
      skip: false,
      template: "hdfc_upi_debit",
      type: "expense",
      last4,
      amountMinor: toMinor(amount),
      occurredAt: parseDDMMYY(date, emailReceivedAt),
      description: buildDescription("UPI", "DR", merchant, {
        evidence: [reference, vpa]
      })
    };
  }

  match = text.match(
    /Rs\.?\s?([\d,]+\.\d{2}) has been successfully credited to your HDFC Bank account ending in (\d{4})/
  );

  if (match) {
    const [, amount, last4] = match;

    const sender = /Sender:\s*([^\r\n(]+)/i.exec(text)?.[1]?.trim();

    const date = /Date:\s*(\d{2}-\d{2}-\d{2})/i.exec(text)?.[1];

    const reference = extractUpiReference(text);

    if (!date) {
      return {
        skip: true,
        reason: "missing_upi_credit_date"
      };
    }

    return {
      skip: false,
      template: "hdfc_upi_credit",
      type: "income",
      last4,
      amountMinor: toMinor(amount),
      occurredAt: parseDDMMYY(date, emailReceivedAt),
      description: buildDescription("UPI", "CR", sender || "UPI CREDIT", {
        evidence: [reference]
      })
    };
  }

  match = text.match(
    /Rs\.?\s?([\d,]+\.\d{2}) is debited from your HDFC Bank Debit Card ending (\d{4}) at (.+?) on (\d{1,2} \w{3}, \d{4}) at (\d{2}:\d{2}:\d{2})/
  );

  if (match) {
    const [, amount, last4, merchant, date, time] = match;

    return {
      skip: false,
      template: "hdfc_debit_card",
      type: "expense",
      last4,
      amountMinor: toMinor(amount),
      occurredAt: parseDMonYYYYTime(date, time),
      description: buildDescription("CARD", "DR", merchant, {
        context: ["POS"]
      })
    };
  }

  match = text.match(
    /Rs\.?\s?([\d,]+\.\d{2}) has been debited from your HDFC Bank Credit Card ending (\d{4}) towards (.+?) on (\d{1,2} \w{3}, \d{4}) at (\d{2}:\d{2}:\d{2})/
  );

  if (match) {
    const [, amount, last4, merchant, date, time] = match;

    return {
      skip: false,
      template: "hdfc_credit_card",
      type: "expense",
      last4,
      amountMinor: toMinor(amount),
      occurredAt: parseDMonYYYYTime(date, time),
      description: buildDescription("CARD", "DR", merchant)
    };
  }

  match = text.match(
    /Your ICICI Bank Credit Card XX(\d{4}) has been used for a transaction of INR ([\d,]+\.\d{2}) on (\w{3} \d{1,2}, \d{4}) at (\d{2}:\d{2}:\d{2})\. Info:\s*(.+?)\./
  );

  if (match) {
    const [, last4, amount, date, time, merchant] = match;

    return {
      skip: false,
      template: "icici_credit_card",
      type: "expense",
      last4,
      amountMinor: toMinor(amount),
      occurredAt: parseMonDYYYYTime(date, time),
      description: buildDescription("CARD", "DR", merchant)
    };
  }

  match = text.match(
    /Rs\.?\s*([\d,]+\.\d{2})\s+spent on your SBI Credit Card ending with\s+(\d{4})\s+at\s+([\s\S]+?)\s+on\s+(\d{2}-\d{2}-\d{2})\s+via\s+([A-Za-z][A-Za-z0-9 ]*?)\s*\(Ref No\.?\s*([A-Za-z0-9-]{4,40})\)/i
  );

  if (match) {
    const [, amount, last4, merchant, date, paymentMode, rawReference] = match;

    const normalizedPaymentMode = paymentMode.trim().toUpperCase();

    const rail = normalizedPaymentMode === "UPI" ? "UPI" : "CARD";

    const context = rail === "CARD" ? [normalizedPaymentMode] : [];

    return {
      skip: false,
      template: "sbi_credit_card",
      type: "expense",
      last4,
      amountMinor: toMinor(amount),
      occurredAt: parseDDMMYY(date, emailReceivedAt),
      description: buildDescription(rail, "DR", merchant, {
        context,
        evidence: [formatReference(rawReference)]
      })
    };
  }

  return {
    skip: true,
    reason: "unmatched"
  };
}

const results = [];
const inputItems = $input.all();

for (const [index, item] of inputItems.entries()) {
  const sourceBody =
    item.json.html ?? item.json.textHtml ?? item.json.textPlain ?? item.json.text ?? "";

  const text = htmlToText(sourceBody);

  const emailReceivedAt = getEmailReceivedAt(item.json);

  const classified = classify(text, emailReceivedAt);

  if (classified.skip) {
    results.push({
      json: {
        skip: true,
        reason: classified.reason,
        subject: item.json.subject
      },
      pairedItem: {
        item: index
      }
    });

    continue;
  }

  const accountId = ACCOUNT_MAP[classified.last4];

  if (!accountId) {
    results.push({
      json: {
        skip: true,
        reason: `no_account_mapping_for_${classified.last4}`,
        subject: item.json.subject,
        template: classified.template,
        last4: classified.last4
      },
      pairedItem: {
        item: index
      }
    });

    continue;
  }

  const output = {
    skip: false,
    needsAmountConfirmation: classified.needsAmountConfirmation ?? false,
    accountId,
    type: classified.type,
    occurredAt: classified.occurredAt,
    description: classified.description,
    idempotencyKey: idToUuid(item.json.id),
    template: classified.template,
    last4: classified.last4
  };

  if (classified.amountMinor !== undefined) {
    output.amountMinor = classified.amountMinor;
  }

  if (classified.originalCurrency !== undefined) {
    output.originalCurrency = classified.originalCurrency;
  }

  if (classified.originalAmount !== undefined) {
    output.originalAmount = classified.originalAmount;
  }

  results.push({
    json: output,
    pairedItem: {
      item: index
    }
  });
}

return results;

function dataIngest() {}
