import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as util from 'node:util';

// The public site is static. Keep a dated snapshot for builds without FMP access.
const snapshot = { fetchedOn: '2026-11-20', oneMonth: -6.89942, oneYear: 9.72522 };

async function getFmpApiKey() {
  const key = process.env.FMP_API_KEY?.trim();
  if (key || !util.parseEnv) return key;

  try {
    const settings = await readFile(join(homedir(), 'stocks', '.env'), 'utf8');
    return util.parseEnv(settings).FMP_API_KEY?.trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function getSpyReturns() {
  try {
    const key = await getFmpApiKey();
    if (!key) return snapshot;

    const url = new URL('https://financialmodelingprep.com/stable/stock-price-change');
    url.search = new URLSearchParams({ symbol: 'SPY', apikey: key }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error('FMP request failed');

    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (row?.symbol !== 'SPY' || !Number.isFinite(row['1M']) || !Number.isFinite(row['1Y'])) {
      throw new Error('FMP response is missing SPY returns');
    }

    const fetchedOn = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    return { fetchedOn, oneMonth: row['1M'], oneYear: row['1Y'] };
  } catch {
    console.warn('[SPY] Could not refresh from FMP. Using the dated snapshot.');
    return snapshot;
  }
}
