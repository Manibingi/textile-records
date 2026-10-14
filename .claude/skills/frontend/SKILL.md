---
name: frontend
description: Conventions for the Textile Records React UI as actually built (React 18, React Router 6, Vite 5, plain CSS, shared components in src/ui.jsx). Use when building or changing screens, forms, tabs, the CalcBox, Choice toggles, toasts, Indian number/date formatting, phone layout, CSV export, print layouts for bills and payment slips, or when rebuilding frontend/dist.
---

# Textile Records — Frontend

The users are a shop owner and his father, who rarely uses computers. Choose bigger, plainer and more explicit every time. Before building a screen, open the closest existing page in `src/pages/` and copy its structure.

## Layout

```
frontend/
  vite.config.js     dev proxy /api → 127.0.0.1:8000, host: true (phones on Wi-Fi)
  src/
    main.jsx         BrowserRouter + ToastProvider
    App.jsx          shell: NAV array (icon, label, step number), slide-in menu on small screens, routes
    api.js           api.get/post/put/del + qs(); 400 detail shown as is; 422 mapped via FIELD_NAMES
    format.js        rs() ₹, num() en-IN, kg(), mtr(), dt() DD-MM-YYYY, iso(), today(), PRODUCTS, PAY_MODES, ROD_STATUS
    ui.jsx           ToastProvider/useToast, useData, useAction, useTab, PageHeader, Tabs, Card, Field, Input,
                     NumInput, DateInput, Select, Choice, CalcBox, Btn, Badge, Loading, ErrorBox, Empty, Stat,
                     Table, ExportBar, DateRange/rangeFor, confirmDelete
    Ledger.jsx       running-account table
    styles.css       CSS variables (--primary, --green, --amber, --red …), 18px root font, print and mobile rules
    pages/           Home, Thread, Rods, ExtraThread, Weavers(+WeaverDetail), Lots, Payments(+PaymentSlip),
                     Cutting, Sales(+Invoice, CustomerDetail), Reports, Settings
  dist/              BUILT OUTPUT, COMMITTED TO GIT
```

## The dist rule

`START-Windows.bat` and the Render deployment serve `frontend/dist` as committed, with no npm step. **Every UI change must end with `npm run build`**, and the regenerated `frontend/dist` (old hashed assets removed, new ones added) is committed in the same branch. A branch with UI changes but a stale `dist` is incomplete.

## Building blocks (use these; don't add UI libraries)

- **Loading data:** `const { data, error, loading, reload } = useData("/thread-stock" + qs({ from, to }))`.
- **Saving:** `const [run, busy] = useAction();` then `await run(() => api.post("/rods", body), (r) => \`Saved rod ${r.code}\`)`. Errors become a red toast automatically, with the server's 400 sentence shown as is. After saving, `reload()` the affected lists.
- **Warnings:** if the response has `warning`, show it in amber (a `warning` toast or the `warn-text` class). The record is already saved.
- **Tabs in the URL:** `const [tab, setTab] = useTab("stock")`, so Home tiles can deep-link with `?tab=`.
- **Toggles, not typing:** use `<Choice options={PRODUCTS} …/>` for Towel/Lungi, `PAY_MODES` for Cash/UPI/Bank/Cheque, and Given/Taken back. Offer existing thread and colour values as chips or selects rather than free text.
- **Show the sum:** every computing form has `<CalcBox label formula result />` with the user's real numbers, e.g. `14.6 kg − (12 combs × 0.105 kg) = 13.34 kg`. Use the same rounding as the server (`r2` half-up for money, 3 dp for kg).
- **Remember what repeats:** steel rod weight and comb weight persist in `localStorage` (see `Rods.jsx` and `ExtraThread.jsx`, wrapped in try/catch). Date, weaver and product carry over to the next entry.
- **Lists:** `<Table columns rows />`, plus `<ExportBar rows columns filename />` for CSV and Print, and `<DateRange>` for any date-filtered list.
- **Deletes:** `if (confirmDelete("rod R-0004")) run(() => api.del(...), "Deleted")`.
- **Page header:** `<PageHeader icon step title help>`. Pages in the work flow show their step number.

## UX rules (non-negotiable)

1. **The flow is the menu.** The `NAV` array in `App.jsx` and the Home tiles follow the numbered steps. New screens slot into that order or go under Reports or Settings. No hidden menus.
2. **Large and plain.** 18 px root font and big inputs and buttons (follow existing classes, don't shrink them). Use plain labels like "To pay now" and "Pieces waiting to cut".
3. **Indian formats** from `format.js` only: `rs()` for ₹1,23,456.00 and `dt()` for 12-10-2026. Show negative weaver dues as "Advance".
4. **Confirm, then point onward.** The success message names the new code (R-0008, L-0011, INV-0004). Where useful, offer a button to the next step.
5. **Phone:** below 900 px the sidebar becomes the slide-in menu and tables stack. Check new layouts at 390 px width.
6. **Print:** elements marked `no-print` are hidden. Bills (`Invoice`) and slips (`PaymentSlip`) have their own print layouts with signature lines. Match them for any new printable.
7. **New 422 fields:** add friendly names to `FIELD_NAMES` in `api.js`.

## Verify

- `npm run build` must succeed with no errors, and `dist` must be committed.
- Smoke test in dev (`npm run dev` with the backend running): open the changed screen, save once, check that the CalcBox equals the saved value, and check there are no console errors.
- There is no Playwright suite yet. If a feature spec asks for browser tests, add `@playwright/test` as a devDependency with a `playwright.config.js` that tests at 1366 px and 390 px.

## Checklist

- [ ] Uses `ui.jsx` components, `api.js` and `format.js`; no new libraries
- [ ] Placed in the numbered flow (NAV + Home) or under Reports or Settings
- [ ] CalcBox with real numbers matches the saved value
- [ ] Choice toggles or selects instead of typing repeated values
- [ ] Warning shown amber, errors shown as the server's sentence
- [ ] Works at 390 px; ExportBar and print are fine
- [ ] `npm run build` run and `frontend/dist` committed
