const API_KEY = $vars.TREASURY_OPS_API_KEY;

const API_BASE_URL = requiredUrl(
  "TREASURY_OPS_API_BASE_URL",
  $vars.TREASURY_OPS_API_BASE_URL
).replace(/\/$/, "");

const NTFY_URL = requiredUrl("TREASURY_OPS_NTFY_URL", $vars.TREASURY_OPS_NTFY_URL);

const TRANSACTIONS_URL = `${API_BASE_URL}/api/v1/transactions`;

const PENDING_TRANSACTIONS_URL = `${API_BASE_URL}/api/v1/pending-transactions`;

function requiredUrl(name, value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is not configured`);
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }

  return value.trim();
}

/*
 * API_KEY must already be injected securely into this Code node.
 * Do not paste the real key into this script.
 */
if (typeof API_KEY !== "string" || API_KEY.trim().length === 0) {
  throw new Error("TreasuryOps API key is not configured");
}

const TEMPLATE_LABELS = new Map([
  ["hdfc_emandate_paid", "HDFC e-mandate charge"],
  ["hdfc_upi_debit", "HDFC UPI debit"],
  ["hdfc_upi_credit", "HDFC UPI credit"],
  ["hdfc_debit_card", "HDFC debit-card transaction"],
  ["hdfc_credit_card", "HDFC credit-card transaction"],
  ["icici_credit_card", "ICICI credit-card transaction"],
  ["sbi_credit_card", "SBI credit-card transaction"]
]);

function templateLabel(template) {
  return TEMPLATE_LABELS.get(template) ?? "Bank transaction";
}

/**
 * Formats integer paise without floating-point arithmetic.
 */
function formatMinor(amountMinor) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("API returned an invalid amountMinor");
  }

  const rupees = Math.floor(amountMinor / 100);

  const paise = String(amountMinor % 100).padStart(2, "0");

  return `${rupees}.${paise}`;
}

function foreignAmountLabel(item) {
  const currency =
    typeof item.originalCurrency === "string" ? item.originalCurrency.trim().toUpperCase() : "";

  const amount = typeof item.originalAmount === "string" ? item.originalAmount.trim() : "";

  if (!/^[A-Z]{3}$/.test(currency) || !/^[\d,]+\.\d{2}$/.test(amount)) {
    return null;
  }

  return `${currency} ${amount}`;
}

const sendNtfy = async ({ title, tags, priority, body }) => {
  await this.helpers.httpRequest({
    method: "POST",
    url: NTFY_URL,
    headers: {
      Title: title,
      Tags: tags,
      Priority: priority
    },
    body
  });
};

/**
 * Notification retries happen after the API call, inside the
 * current execution. They never repeat the transaction POST.
 */
const sendNtfyWithRetry = async (notification) => {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await sendNtfy(notification);
      return true;
    } catch {
      if (attempt === maxAttempts) {
        return false;
      }
    }
  }

  return false;
};

const results = [];
const inputItems = $input.all();

for (const [index, item] of inputItems.entries()) {
  /*
   * Node 1 emits skip rows for declined,
   * unmatched, bill-payment, and unmapped
   * account events. Never send these to the API.
   */
  if (item.json.skip === true) {
    results.push({
      json: {
        skipped: true,
        reason: typeof item.json.reason === "string" ? item.json.reason : "unspecified",
        notificationSent: false
      },
      pairedItem: {
        item: index
      }
    });

    continue;
  }

  const needsAmountConfirmation = item.json.needsAmountConfirmation === true;

  const label = templateLabel(item.json.template);

  const url = needsAmountConfirmation ? PENDING_TRANSACTIONS_URL : TRANSACTIONS_URL;

  const body = needsAmountConfirmation
    ? {
        accountId: item.json.accountId,
        type: item.json.type,
        occurredAt: item.json.occurredAt,
        description: item.json.description
      }
    : {
        accountId: item.json.accountId,
        type: item.json.type,
        amountMinor: item.json.amountMinor,
        occurredAt: item.json.occurredAt,
        description: item.json.description
      };

  let response;

  /*
   * Only API-posting errors reach this catch.
   * Notification failures are handled separately.
   */
  try {
    response = await this.helpers.httpRequest({
      method: "POST",
      url,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Idempotency-Key": item.json.idempotencyKey
      },
      body,
      json: true
    });
  } catch (error) {
    /*
     * Do not send description, account ID,
     * VPA, reference, raw API response, or
     * error.message to ntfy.
     */
    await sendNtfyWithRetry({
      title: needsAmountConfirmation ? "Pending transaction failed" : "Transaction failed",
      tags: "x,rotating_light",
      priority: "5",
      body: `${label} could not be posted. ` + "Check the failed n8n execution."
    });

    // Preserve the original error in private n8n execution logs.
    throw error;
  }

  let notification;

  if (needsAmountConfirmation) {
    const foreignAmount = foreignAmountLabel(item.json);

    notification = {
      title: "Needs your input",
      tags: "grey_question",
      priority: "4",
      body: foreignAmount
        ? `${label}: ${foreignAmount}. Open TreasuryOps and enter the actual INR amount.`
        : `${label} needs an INR amount. Open TreasuryOps to complete it.`
    };
  } else {
    const amount = formatMinor(response.amountMinor);

    const sign = response.type === "expense" ? "-" : "+";

    notification = {
      title: "Transaction posted",
      tags: "white_check_mark",
      priority: "3",
      body: `${sign}Rs ${amount} — ${label}`
    };
  }

  const notificationSent = await sendNtfyWithRetry(notification);

  results.push({
    json: {
      ...response,
      notificationSent
    },
    pairedItem: {
      item: index
    }
  });
}

return results;
