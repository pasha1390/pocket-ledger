# Pocket Ledger

**New to this? Open `START-HERE.md` for a step-by-step guide from zero.**

Track daily expenses and income, tag everything, and see where your money goes.

- **Frontend:** plain HTML, CSS and JavaScript in `public/` (no build step)
- **Backend:** Node.js, Express and SQLite (`server/`)
- **Accounts:** first and last name, email and password (bcrypt), **email verification** when you sign up, an **emailed 6-digit code on every sign-in**, plus optional **Continue with Google**
- **Daily and monthly views:** pick a month and a day (or tap a day in the spending calendar)
- **Currencies:** USD and TMN (Toman) with an editable exchange rate
- Guests can use the app without an account (saved in the browser). Signing in saves everything on the server.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
cp .env.example .env     # on Windows: copy .env.example .env
npm start
```

Open http://localhost:3000

In VS Code: open this folder, press **F5** (it uses `.vscode/launch.json`), or run `npm run dev` for auto-restart while you edit.

Before real use, open `.env` and set `JWT_SECRET` to a long random string:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Daily view

Next to the month picker there is a **day** picker and a **Today** button. Choose a day and every page shows only that day: totals, the donut, insights, transactions, reports (last 7 days) and exports ("Selected day"). While a day is open, arrows let you step to the previous or next day, and **Whole month** goes back. The **Spending calendar** on the dashboard shades each day by how much you spent, marks income days, and opens a day when you tap it. The balance on the bank card is your all-time balance.

## Pages (the three-line menu)

Tap the **three lines** at the top left to open the menu. Everything is grouped under headers:

| Header | Page | What it does |
| --- | --- | --- |
| Overview | Dashboard | Bank card with your balance, add a transaction (with quick tags), spending donut, spending calendar, insights (including no-spend streak and daily allowance), recent activity |
| Overview | Transactions | Search, filter by tag or type, sort, edit, delete, all months |
| Overview | Reports | Savings rate, daily average, 6-month income vs spending chart, top categories, print |
| Plan | Budgets | Monthly budget plus a budget for each tag, with alerts when you pass one |
| Plan | Recurring | Rent, salary, subscriptions: created for you every month |
| Plan | Goals | Savings goals with progress bars |
| Data | Import & Export | Previews for both (see below) |
| Account | Settings | Exchange rate, theme, Persian digits, account, sample data, delete all data |

The menu footer shows who is signed in, with **Sign in** or **Log out**.

## Import & Export (with previews)

**Export** shows a preview of exactly what the file will contain before you export it: choose CSV or JSON, and all time, the selected day or month, or custom dates. You see the row count, date range, totals and the first rows. Press **Export…** and you are asked how you want the file:

- **Download** saves it on this device.
- **Email it to me** sends it as an attachment to your account's email address (you must be signed in, and email must be set up, see below).

You can also copy it to the clipboard.

- **CSV** opens in Excel or Google Sheets (columns: `date, type, title, tag, amount, currency`).
- **JSON** is a full backup: transactions plus budgets, recurring items and goals.

**Import** accepts a CSV or JSON file (click, or drag and drop). Nothing is saved until you press the Import button. First you see a preview:

- Counts of **new**, **duplicate** and **invalid** rows.
- A table of the first 12 rows, each marked new, duplicate, or invalid with the reason.
- Options: skip duplicates (on by default), and which currency to use for rows that have none.
- For a JSON backup you can also restore budgets, recurring items and goals.

CSV needs a header row with at least `date` and `amount`. `type` (income or expense), `title`, `tag` and `currency` (USD or TMN) are optional. Dates look like `2026-10-08`. Semicolon-separated files work too. Old exports in `IRR` (Rials) are converted to Toman. Up to 5,000 rows and 2 MB per file. There is a template link on the page, and a `sample-import.csv` in this folder.

## Accounts, verification codes and email

- **Create account** asks for first name, last name, email and password. We email a 6-digit code; the account is only created and signed in after you enter it.
- **Sign in** checks your password and then emails a 6-digit code. You are only signed in after you enter the code.
- Codes expire after 10 minutes, are stored hashed, lock after 5 wrong tries, and can be re-sent every 30 seconds.
- **Google** sign-in skips the code, because Google has already verified the email.
- Sessions last 30 days, so you only get a code when you actually sign in.

### Setting up email (SMTP)

Emails need an SMTP account. Put its details in `.env`:

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
MAIL_FROM="Pocket Ledger <no-reply@yourdomain.com>"
```

Any provider works (Gmail with an app password, Brevo, Mailgun, SendGrid, Amazon SES, your own server). Restart the server after editing `.env`.

**While developing you can leave `SMTP_HOST` empty.** Nothing is sent. Instead every email (including the verification code) is printed in the terminal where the server runs, and saved as a text file in `data/outbox/`. So you can test sign-up and sign-in on your own computer with no email account.

## Google sign-in (optional)

Email and password work with no setup. To add the Google button:

1. Go to https://console.cloud.google.com, open **APIs & Services -> Credentials**.
2. Click **Create credentials -> OAuth client ID**, choose **Web application**.
3. Under **Authorized JavaScript origins** add `http://localhost:3000` (and your real domain when you deploy). No redirect URI or client secret is needed.
4. Copy the **Client ID** into `.env` as `GOOGLE_CLIENT_ID=...` and restart the server.

If the button doesn't appear, the client ID is empty. If Google shows `origin_mismatch`, the address in your browser isn't in the authorized origins list.

## Project structure

```
pocket-ledger/
  package.json
  .env.example          copy to .env
  server/
    index.js            Express app, serves public/, mounts the API
    auth.js             register, login, email codes, Google, logout, session
    codes.js            one-time email codes (hashed, expiring, rate limited)
    mailer.js           sends email (SMTP) or saves it to data/outbox/ in development
    secret.js           the signing secret from JWT_SECRET
    api.js              transactions and settings (all require sign-in)
    db.js, schema.sql   SQLite database (created in data/ledger.db)
  public/
    index.html
    css/style.css
    js/core.js          state, formatting, API calls, menu, router
    js/dash.js          dashboard and transactions
    js/plan.js          reports, budgets, recurring, goals
    js/data.js          import and export with previews
    js/account.js       settings, sign-in, Google
    js/main.js          start-up
```

## API

All routes except `/api/config` and the auth routes need the session cookie.

| Method | Route | What it does |
| --- | --- | --- |
| GET | `/api/config` | Public settings (Google client ID) |
| POST | `/api/auth/register` | `{firstName, lastName, email, password}` creates an unverified account and emails a code |
| POST | `/api/auth/login` | `{email, password}` emails a sign-in code |
| POST | `/api/auth/verify` | `{email, purpose, code}` (`register` or `login`) finishes and signs in |
| POST | `/api/auth/resend` | `{email, purpose}` sends a new code |
| POST | `/api/auth/google` | `{credential}` Google ID token |
| POST | `/api/auth/logout` | Clears the session |
| GET | `/api/auth/me` | The signed-in user |
| GET | `/api/transactions` | All your transactions |
| POST | `/api/transactions` | `{kind, title, amount, currency, tag, date}` |
| POST | `/api/transactions/bulk` | `{items: [...]}` import many |
| PUT | `/api/transactions/:id` | Edit one |
| DELETE | `/api/transactions/:id` | Delete one |
| DELETE | `/api/transactions` | Delete all of yours |
| GET / PUT | `/api/settings` | `{cur, rate, budget, theme}` |
| GET | `/api/kv` | Budgets, recurring items, goals, preferences |
| POST | `/api/export/email` | `{format, filename, content}` emails the file to your own address |
| PUT | `/api/kv/:key` | `{value}` for `budgets`, `recur`, `goals` or `prefs` |

## Deploying

Any host that runs Node works (Render, Railway, Fly.io, a VPS).

- Set `NODE_ENV=production`, `JWT_SECRET`, and (if you use it) `GOOGLE_CLIENT_ID`.
- Serve over **HTTPS**. In production the session cookie is marked `secure`.
- Keep the `data/` folder on a persistent disk, or the database is lost on redeploy. You can point somewhere else with `DB_PATH`.
- Back up `data/ledger.db` now and then.

## Security notes

- Passwords are hashed with bcrypt and never stored in plain text.
- The session cookie is `httpOnly` and `sameSite=lax`.
- Sign-in and sign-up need a code from your email, and the session is only created after the code is correct. Login, register, code and Google routes are rate limited.
- Exports by email can only be sent to the signed-in user's own address.
- Every query is filtered by the signed-in user, so people only see their own data.
- All database queries use prepared statements.

## Troubleshooting

- **`npm install` shows an error:** run it from inside the folder that contains `package.json`. Use Node 22 LTS or newer (`node -v` shows your version). The native SQLite package (`better-sqlite3`) is optional now: if it can't be built, the app automatically uses the SQLite that is built into Node 22.5+ (you may see an "experimental" warning, which is harmless). Delete `node_modules` and `package-lock.json` and run `npm install` again after upgrading Node.
- **Google button missing or blank:** check `GOOGLE_CLIENT_ID` in `.env`, restart, and make sure you opened the app at an address listed under authorized origins.
- **No email arrives:** with `SMTP_HOST` empty nothing is sent. Look in the terminal or in `data/outbox/` for the code. With SMTP set, check the server log for the error and your provider settings.
- **Signed out on every restart:** `JWT_SECRET` is not set in `.env`.
- **Fonts look different offline:** the fonts load from Google Fonts and fall back to system fonts.
