# Shipment Cost Control & Analysis — DIAMOND DENT TRADING CO.

A web application for managing international shipments of medical and dental supplies. It records supplier invoices, freight, customs duty, import VAT, clearance and every other import cost. It calculates the **landed cost of each shipment and each product**, and shows every expense as a percentage of the total landed cost.

- **Frontend:** Vite + React 18 + TypeScript (strict), Tailwind CSS (class-based dark mode), Recharts, lucide-react, React Router (HashRouter), TanStack Query, react-hook-form + zod
- **Backend:** Supabase (PostgreSQL, Auth, Row Level Security). No Supabase Storage is used.
- **Documents:** saved in the company's **Google Drive** (Google Identity Services + Drive REST v3)
- **Exports:** Excel (SheetJS), CSV, PDF (jsPDF + autotable), ZIP (JSZip)
- **Hosting:** GitHub Pages (`https://diamonddent.github.io/shipment/`)

---

## 1. Modules

| Route | Module |
|---|---|
| `#/login` | Sign in, forgot password, reset password |
| `#/` | **Dashboard**: 11 KPIs and 4 charts from live data (expense distribution, monthly expenses and landed-cost trend, shipment comparison, country of origin). Filters by date, supplier and status, a cancelled-shipments toggle, and a data-warnings panel |
| `#/shipments` | **Shipment Register**: search, sort, filters (supplier, status, country, date, archived), duplicate, archive/restore, export |
| `#/shipments/new` | **New Shipment wizard**: the 9-step workflow (create → supplier invoice → products → expenses → documents → review → landed cost → complete → export) |
| `#/shipments/:id` | **Shipment Details**: workflow stepper, warnings, tabs for Overview (cost analysis table and chart), Expenses, Products, Landed Cost, Documents and History (audit) |
| `#/expenses` | **Expenses**: all fields; live *Amount SAR = Original × Rate*; partial payments; manager review; soft delete; duplicate detection with override |
| `#/products` | **Products**: catalogue CRUD and every shipment product line, with landed cost per unit |
| `#/landed-cost/:id` | **Landed Cost Calculator**: allocation method per category (value / quantity / net weight / gross weight / manual %), reconciled to the halala, then saved |
| `#/suppliers`, `#/forwarders` | **Suppliers** and **freight forwarders**, with cost statistics and a forwarder comparison |
| `#/reports` | **10 reports**, each in Excel, CSV and PDF, filtered by date, supplier and shipment. Also the **Shipment Cost Statement** PDF for management |
| `#/documents` | **Documents**: upload to Drive, view in Drive, download, delete (permission-checked and audited), ZIP per shipment/PO |
| `#/settings` | Profile and password; users and roles; expense categories (create, rename, deactivate); currencies and exchange-rate history; application settings; Google Drive folder; demo-data removal; audit log |

## 2. Financial rules (src/lib/calculations.ts)

All financial math lives in pure, unit-tested functions in `src/lib/calculations.ts`. Money is summed and allocated in integer halalas, so totals always reconcile to 2 decimals.

- **Amount in SAR** = Original Amount × Exchange Rate, rounded half away from zero (same as PostgreSQL `round`). The rate is **stored on each expense, product line and shipment at entry time**. Adding a new rate in Settings only changes the *suggested* rate for new entries; it never rewrites history.
- **Total Landed Cost** = Product Invoice + Freight + Insurance + Customs Duty + Import VAT + Clearance + Transportation + Other.
- **Expense %** = expense ÷ total landed cost × 100. This is shown separately from:
  - **Additional Expense Total** = landed cost − product invoice value
  - **Additional Expense %** = additional ÷ product invoice × 100
  - **Cost Increase %** = (landed − invoice) ÷ invoice × 100
- **VAT is never counted twice.**
  - *Import VAT* (paid at customs) is its own category. It is included in landed cost, as the formula requires, and flagged as recoverable. Every screen also shows **landed cost excluding recoverable VAT**.
  - The *VAT amount* field on a service invoice (freight, clearance) is informational. It is reported separately and **not** added to landed cost, unless an admin turns on *Settings → Application → Add service-invoice VAT to landed cost*.
- **Payable amount** of an expense = original amount + its VAT amount. Payment status (Unpaid / Partially Paid / Paid) is derived by the database from `expense_payments`. Overpayment is rejected.
- **Allocation:** each category has its own method. Rounding uses the largest-remainder method, so each category allocates exactly its total. A category whose basis is zero (for example, no weights entered) is reported as an issue and is never silently mis-allocated. Save is disabled until everything reconciles, and the database checks the reconciliation again (`save_allocations`).
- **Cancelled shipments** are excluded from summaries unless *Include cancelled* is ticked. Archived shipments are hidden from the register and dashboard.

## 3. Local setup

```bash
npm install
cp .env.example .env      # fill in the values (see below)
npm run dev               # http://localhost:5173/shipment/
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check (`tsc -b`) + production build to `dist/` |
| `npm run lint` | `tsc --noEmit` for app and config |
| `npm test` | Vitest unit tests (calculations + Drive naming helpers) |
| `npm run preview` | Serve the built `dist/` |

`.env`:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_GOOGLE_CLIENT_ID=1234567890-xxxx.apps.googleusercontent.com
VITE_BASE_PATH=/shipment/
```

Without the Supabase variables, the app shows a *Configuration required* screen instead of crashing.

## 4. Supabase configuration

1. Create a Supabase project (PostgreSQL 15+).
2. **Run the migrations in order.** Use either:
   - **SQL Editor:** paste and run `supabase/migrations/0001_schema.sql`, `0002_functions_triggers.sql`, `0003_rls.sql`, `0004_views.sql`, `0005_defaults.sql`; or
   - **Supabase CLI:** `supabase link --project-ref <ref>` then `supabase db push`.

   All migration files can be run again safely.
3. **Optional demo data:** run `supabase/seed.sql`. It adds 3 suppliers, 3 forwarders, 5 shipments, 12 catalogue products, 13 shipment lines and 23 expenses in SAR/EUR/USD/CNY, mixed paid, partial and unpaid. Every demo row has `is_demo = true` and shows a **DEMO** badge.
   - The seed also sets the company Drive folder `drive_root_folder_id = 1VlzAkc8j6FcqJpwho0RV37aRbltNYx1o`. This is company configuration, not demo data, and it is only written while the setting is empty.
   - If you skip the seed, paste the folder link in *Settings → Google Drive* instead.
4. **Auth settings** (Authentication → URL Configuration):
   - Site URL: `https://diamonddent.github.io/shipment/`
   - Redirect URLs: `https://diamonddent.github.io/shipment/**` and `http://localhost:5173/shipment/**`
   - For an internal tool, disable public sign-ups after creating your users. Admins can still create users from *Settings → Users & roles*: the app uses an isolated client, so the admin stays signed in. If *Confirm email* is on, new users must confirm first.
5. **Create the first administrator.** Create a user (Authentication → Users → *Add user*). Every new user automatically gets a profile and the **employee** role. Promote the first admin in the SQL Editor:

   ```sql
   update public.users_roles set role = 'admin'
   where user_id = (select id from auth.users where email = 'you@diamonddent.com');
   ```

   After that, manage roles in *Settings → Users & roles*. The database refuses to demote the last admin and refuses self-escalation.
6. **Remove demo data** later from *Settings → Demo data* (type `REMOVE` to confirm), or run `select public.remove_demo_data();` as an admin. Only `is_demo` rows are deleted. Real shipments that reference a demo supplier or forwarder are detached first.

### Database overview

- **Tables:** `profiles`, `users_roles`, `shipments`, `suppliers`, `freight_forwarders`, `products`, `shipment_products`, `expense_categories`, `shipment_expenses`, `expense_payments`, `currencies`, `exchange_rates`, `expense_allocations`, `shipment_documents`, `audit_logs`, `application_settings` (plus the `code_counters` helper).
- **Structure:** UUID primary keys, foreign keys, `created_at` and `updated_at` triggers, indexes, and CHECK constraints. For example, a SAR line must have rate 1, and `amount_sar = round(original × rate, 2)` is enforced by a constraint.
- **Auto numbers:** **Shipment ID `SHP-YYYY-NNNN`**, expense numbers `EXP-YYYY-NNNNN`, and document numbers `DOC-<PO without dash>-<NNN>`, which use a per-shipment counter (`reserve_document_no`).
- **RLS helpers:** `current_app_role()` (note: `current_role` is a reserved SQL keyword, hence the name), `is_admin()`, `is_manager_or_admin()`, `can_view_shipment()`, `can_edit_shipment()`.
  - **Admin:** everything.
  - **Manager:** sees and edits all shipments, reviews (approves or rejects) expenses, deletes payments, reads the audit log.
  - **Employee:** creates shipments and edits the ones they created or were assigned. Adds expenses, products and documents to those shipments. Sees all shipments, or only their own if *Employees can view all shipments* is turned off. Only managers and admins can change `review_status`; this is enforced by a trigger.
- **Audit triggers** cover shipments, expenses, payments, products, documents, categories, currencies, rates, roles, settings, suppliers, forwarders and profiles. They record before/after JSON, the user and the time. Deletes are soft (`is_deleted`, `is_archived`), and hard deletes of financial rows are admin-only at RLS level.
- **Views:** `v_shipment_cost_summary` (per-shipment landed cost, using the same formula as `calculations.ts`) and `v_product_landed_cost`. Both use `security_invoker`, so RLS applies.
- **Functions:** `remove_demo_data()`, `save_allocations()` (atomic, reconciliation-checked) and `log_audit_event()`.

## 5. Google Drive document storage

**No attachment content is stored in Supabase.** There are no Storage buckets, no storage policies, and no bytea or base64 columns. Every attachment (shipment documents and expense attachments) is uploaded **only to Google Drive**. `shipment_documents` keeps metadata only: document number, type, `drive_file_id`, `drive_web_link`, file name, original name, size, MIME type, linked shipment/expense, uploader and timestamps.

How an upload works:

1. The database reserves `DOC-PO4501-001`, `DOC-PO4501-002`, … for each shipment. Without a PO number, the shipment code is used.
2. The file is renamed `<docno>_<Doc-Type>.<ext>`, for example `DOC-PO4501-001_Supplier-Invoice.pdf`.
3. It is uploaded into `<company folder>/<PO number> – <shipment code>`. That subfolder is created if missing.
4. **Download ZIP** builds `<PO>_<shipment code>_Documents.zip`, with one folder per document type.
5. **Delete** moves the Drive file to the trash (recoverable for 30 days), soft-deletes the record and writes an audit entry. Only admins and managers, or the uploader on a shipment they can edit, may delete.

### Company folder and OAuth scope

The company folder is set in **Settings → Google Drive**. Paste a link such as `https://drive.google.com/drive/folders/<id>` and the folder ID is extracted and stored as `drive_root_folder_id`. The seed pre-fills `1VlzAkc8j6FcqJpwho0RV37aRbltNYx1o`.

> **Scope note:** the company folder was **not created by this app**, and the restricted `drive.file` scope cannot write into folders the app did not create. So when a company folder is configured, the app requests the full scope **`https://www.googleapis.com/auth/drive`**.
> - Every employee who uploads must have *Editor* access to that folder.
> - If no folder is configured, the app falls back to its own folder (default name "Diamond Dent Shipments") with the narrower `drive.file` scope.

The Drive code is wrapped in `src/services/googleDrive.ts` behind a `DocumentStorage` interface, so the provider can be swapped (SharePoint, S3, Odoo attachments) without touching the UI.

### Google Cloud OAuth client setup

1. In <https://console.cloud.google.com/>, create or select a project, then go to **APIs & Services → Library → enable "Google Drive API"**.
2. **OAuth consent screen:**
   - User type *Internal* (if you use Google Workspace) or *External*.
   - App name "Shipment Cost Control", with support e-mail.
   - Add the scope `https://www.googleapis.com/auth/drive` (and `.../auth/drive.file`).
   - For *External* apps in testing, add the users as test users. The `drive` scope is a *restricted* scope: use an *Internal* (Workspace) app or keep the app in testing with listed users. Public external publishing requires Google verification.
3. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Authorised JavaScript origins: `https://diamonddent.github.io` and `http://localhost:5173`.
   - No redirect URI is needed: the GIS token client uses a popup.
4. Put the client ID in `VITE_GOOGLE_CLIENT_ID`: in `.env` locally, and as a GitHub secret for deployment.
5. In the app, open *Settings → Google Drive → Test folder access*.

## 6. Testing

```bash
npm test
```

`src/lib/calculations.test.ts` covers:

- The spec example: invoice 90,000 of a 120,000 total → 75 / 6.67 / 4.17 / 10 / 1.67 / 2.5 %, additional 30,000 = 33.33 % over invoice (not 25 %)
- 15,000 allocated by value 10k / 20k / 30k → 2,500 / 5,000 / 7,500
- Largest-remainder reconciliation on awkward splits (100 ÷ 3, tiny amounts, 200 random cases)
- Zero-weight edge cases (all-zero basis → issue; partial zeros receive nothing)
- Manual shares that must total 100 %
- Per-category methods and per-unit cost
- VAT never double counted, and landed cost excluding VAT
- Payment status and outstanding amounts at the historical rate
- Cancelled shipments excluded unless requested

`src/services/googleDrive.test.ts` covers Drive link parsing and the document, folder and ZIP naming rules.

**Manual checklist after deployment:**

- Sign in as each role and confirm what each can edit.
- Create a shipment through the wizard.
- Add an EUR invoice and SAR expenses, then try a duplicate expense.
- Record a partial payment.
- Save the landed cost.
- Export the cost statement and reports.
- Upload a document, download the ZIP, delete a document.
- Check the dashboard on mobile, tablet and desktop.

## 7. Production deployment (GitHub Pages)

Repository: `Diamonddent/shipment`, default branch `main`.

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. **Settings → Secrets and variables → Actions → New repository secret:** add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_GOOGLE_CLIENT_ID`.
   - The anon key is public by design; RLS protects the data.
   - Optional repository *variable* `VITE_BASE_PATH`: the default is `/shipment/`. Use `/` for a custom domain.
3. Push to `main`. `.github/workflows/deploy.yml` installs, type-checks, runs the unit tests, builds, and deploys with `actions/deploy-pages`.
4. The app is served at **https://diamonddent.github.io/shipment/**. HashRouter (`#/route`) means deep links work on Pages without server rewrites. Supabase auth links use PKCE (`?code=`), which works with hash routing.

## 8. Project structure

```
src/
  components/ui/        Button, Card/KPI, Form controls, Badge/status pills, Modal/ConfirmDialog,
                        Toast, DataTable (sort + pagination), Tabs, Dropdown, loading/empty/error states
  components/layout/    AppLayout, Sidebar (collapsible, mobile drawer), Topbar (search, warnings, theme, user menu)
  features/<module>/    auth, dashboard, shipments, expenses, products, landed-cost, suppliers,
                        forwarders, reports, documents, settings, shared
  services/             Supabase data access per entity, googleDrive.ts (DocumentStorage), documents.ts
  hooks/                useAuth (session, role, permissions), queries (React Query), useTheme
  lib/                  calculations.ts (+ tests), warnings.ts, export.ts, format.ts, constants.ts, errors.ts
  types/database.ts     Row types mirroring the SQL schema
supabase/migrations/    0001–0005 SQL
supabase/seed.sql       demo data (is_demo) + defaults
```

## 9. Odoo ERP integration notes

The schema is ready for a later sync with Odoo:

- **Reserved columns:** `suppliers.odoo_partner_id`, `freight_forwarders.odoo_partner_id`, `products.odoo_product_id` and `shipments.odoo_picking_ref`. They are reserved for mapping to `res.partner`, `product.product` and `stock.picking`.
- **Landed cost mapping:** `v_shipment_cost_summary` and `v_product_landed_cost` give per-shipment and per-product landed cost in SAR. They map directly onto Odoo **Landed Costs** (`stock.landed.cost`), with one cost line per expense category and the split method taken from `expense_allocations.method` (value → *By Current Cost*, quantity → *By Quantity*, gross weight → *By Weight*, manual → *Equal* or adjusted lines).
- **Audit trail:** expense numbers, document numbers and Drive links are stable identifiers to attach to Odoo vendor bills (`account.move`). `audit_logs` gives the change history for reconciliation.
- **Connecting:** use a Supabase Edge Function or a small server with the service-role key calling Odoo's JSON-RPC (`/jsonrpc`) or the REST API. Never call Odoo from the browser with credentials.
