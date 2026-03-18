# Finance Analyzer

A local-first personal finance dashboard that reads your bank statement exports, tags transactions with AI, and gives you spending insights — all running on your machine with no data sent to third-party services except the LLM API.

## Features

- **Upload & parse** CIBC CSV/PDF statement exports
- **AI tagging** — Claude categorizes every transaction (Groceries, Dining, Investments, etc.)
- **Clean merchant names** — raw bank strings turned into readable names
- **Monthly analysis** — spending breakdown, income vs spending, category trends
- **Insights** — AI-generated observations, recommendations, and savings opportunities
- **Recurring detection** — automatically detects subscriptions, payroll, rent, and predicts upcoming payments
- **Running balance** graph from exported bank data
- **Transaction rules** — force-categorize specific merchants (e.g. always mark "Wealthsimple" as Investments)
- **Date-range filter** on the home dashboard
- **Investments split** — investments shown separately from day-to-day spending

## Tech stack

- **Next.js 15** (App Router, server components)
- **TypeScript**
- **SQLite** via `better-sqlite3`
- **Tailwind CSS** (dark theme)
- **Recharts** for all charts
- **Anthropic Claude** (`claude-sonnet-4-6`) for tagging + insights
- **OpenAI** (optional fallback)

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd finance-analyzer
npm install
```

### 2. Add your API key

```bash
cp .env.example .env
```

Edit `.env` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

An OpenAI key is optional — it's only used as a fallback if the Claude call fails.

Get an Anthropic key at [console.anthropic.com](https://console.anthropic.com/).

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. **Upload** — Go to `/upload` and drop your bank statement CSV or PDF
2. **Analyse** — Select months and click Analyse. Claude tags every transaction
3. **Dashboard** — Home page shows income vs spending, category breakdown, top merchants, and upcoming recurring payments
4. **Settings** — Add transaction rules to force-categorize specific merchants

## Data & privacy

All your financial data stays on your machine:

| Location | Contents |
|---|---|
| `data/statements/` | Uploaded bank exports |
| `data/analyses/` | Tagged transaction JSON per month |
| `data/transactions.db` | SQLite with all transactions |
| `data/recurring.json` | Detected recurring patterns |

Transaction descriptions are sent to the Anthropic API for categorization. No data is stored by Anthropic beyond the API call lifetime (per their [privacy policy](https://www.anthropic.com/privacy)).

None of the `data/` directory is committed to git.

## Supported banks

Currently tested with **CIBC** CSV exports. The parser expects columns:
`Date, Description, Debit, Credit, Balance`

Other banks with similar CSV formats may work with minor adjustments to `src/lib/storage.ts`.

## Configuration

Transaction rules live in `data/rules.json` (created automatically). Add rules via the Settings page to force specific categories/necessity for recurring merchants like rent or investments.
