# WealthLog

Personal finance tracker with investment portfolio management.

## Features

- Income & expense tracking with categories
- Monthly budget goals
- Investment portfolio (TW/US stocks, crypto, ETF)
- Monthly summary & trends
- Dark/light mode

## Stack

- **Frontend**: Vanilla HTML/CSS/JS (single page, hash routing)
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Database**: Hosted on Supabase (`yskicvidxfqnkenvzmmy`)

## Database Schema

```
profiles          — user settings (currency, monthly budget)
categories        — user-defined income/expense/investment categories
transactions      — daily income & expense records
investments       — investment positions (symbol, qty, avg cost)
investment_transactions — buy/sell/dividend records
budgets           — monthly/yearly budget goals
```

## Setup

1. Clone the repo
2. Open `index.html` in a browser (or serve via any static server)
3. Register / login via Supabase Auth

## Environment

Supabase config is in `src/config.js`. Replace with your own project URL and anon key if self-hosting.
