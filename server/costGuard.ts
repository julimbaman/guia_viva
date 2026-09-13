// Root-level cost safety guard shared by every route that calls a paid API
// (Google Places, OpenAI/Gemini). This is intentionally the ONLY place that
// decides whether a paid call is allowed to happen today: if the estimated
// spend for the current day reaches DAILY_BUDGET_USD, every route refuses to
// call the external API at all, no matter how many users or screens are
// asking for it. Usage is also persisted to disk, keyed by day, so it
// survives restarts and can be read back later for stats (see /api/usage).
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), '.data', 'api-usage.json');

// `Number(x) || fallback` would silently discard an intentional 0 (e.g. someone
// setting DAILY_API_BUDGET_USD=0 to disable paid calls entirely), since 0 is
// falsy in JS. Use this instead so only a genuinely missing/invalid value falls
// back to the default.
function envNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// --- Configurable cost model -----------------------------------------------
// Google Places API (New) is billed per request, not per token. Adjust this
// to match your actual Google Cloud billing tier (Basic/Advanced/Enterprise).
const GOOGLE_PLACES_COST_PER_CALL_USD = envNumber(process.env.COST_PER_GOOGLE_PLACES_CALL_USD, 0.035);
// OpenAI/Gemini are billed per token. Defaults approximate gpt-4o pricing;
// override via env if you switch models.
const OPENAI_INPUT_COST_PER_TOKEN_USD = envNumber(process.env.COST_PER_OPENAI_INPUT_TOKEN_USD, 0.0000025);
const OPENAI_OUTPUT_COST_PER_TOKEN_USD = envNumber(process.env.COST_PER_OPENAI_OUTPUT_TOKEN_USD, 0.00001);

// Hard daily ceiling on estimated spend across ALL users combined.
// Default ~US$3/day (~COP $10.000) — once crossed, the backend stops calling
// paid APIs entirely until the next UTC day and only serves cached data.
export const DAILY_BUDGET_USD = envNumber(process.env.DAILY_API_BUDGET_USD, 3.0);

export interface DayUsage {
  date: string; // YYYY-MM-DD (UTC)
  googlePlacesCalls: number;
  openAICalls: number;
  openAIPromptTokens: number;
  openAICompletionTokens: number;
  estimatedCostUSD: number;
}

interface UsageStore {
  history: Record<string, DayUsage>;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDay(date: string): DayUsage {
  return { date, googlePlacesCalls: 0, openAICalls: 0, openAIPromptTokens: 0, openAICompletionTokens: 0, estimatedCostUSD: 0 };
}

function loadStore(): UsageStore {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.history) return parsed;
  } catch (error) {
    // Missing/corrupt file on first run or a fresh container is expected — start clean.
  }
  return { history: {} };
}

const store = loadStore();

function persist() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch (error) {
    // Persistence is best-effort: a disk error here must never crash a request
    // or block the in-memory budget check that guards this exact call.
    console.error('Failed to persist API usage store', error);
  }
}

function getDay(date: string): DayUsage {
  if (!store.history[date]) {
    store.history[date] = emptyDay(date);
  }
  return store.history[date];
}

export function getTodayUsage(): DayUsage {
  return { ...getDay(todayKey()) };
}

export function isBudgetExceeded(): boolean {
  return getDay(todayKey()).estimatedCostUSD >= DAILY_BUDGET_USD;
}

export function recordGooglePlacesCall() {
  const day = getDay(todayKey());
  day.googlePlacesCalls += 1;
  day.estimatedCostUSD += GOOGLE_PLACES_COST_PER_CALL_USD;
  persist();
}

export function recordOpenAICall(usage?: { prompt_tokens?: number; completion_tokens?: number }) {
  const day = getDay(todayKey());
  day.openAICalls += 1;
  const promptTokens = usage?.prompt_tokens || 0;
  const completionTokens = usage?.completion_tokens || 0;
  day.openAIPromptTokens += promptTokens;
  day.openAICompletionTokens += completionTokens;
  day.estimatedCostUSD += promptTokens * OPENAI_INPUT_COST_PER_TOKEN_USD + completionTokens * OPENAI_OUTPUT_COST_PER_TOKEN_USD;
  persist();
}

export function getUsageHistory(maxDays: number = 30): DayUsage[] {
  return Object.values(store.history)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, maxDays);
}
