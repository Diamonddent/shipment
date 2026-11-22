import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FolderCheck, Pencil, Plus, Power, Trash2, UserPlus } from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, ConfirmDialog, DataTable, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Spinner, TableSkeleton, Tabs, useToast, type Column,
} from '@/components/ui';
import { qk, useCategories, useCurrencies, useRates, useSettings, useUsers } from '@/hooks/queries';
import { useAuth, usePermissions } from '@/hooks/useAuth';
import { auditService, categoriesService, currenciesService, settingsService } from '@/services/reference';
import { usersService, type UserRow } from '@/services/users';
import { googleDrive, parseDriveFolderId } from '@/services/googleDrive';
import { COST_GROUPS, COST_GROUP_LABELS, type CostGroup } from '@/lib/calculations';
import { ROLE_LABEL } from '@/lib/constants';
import { fmtDate, fmtDateTime, fmtRate } from '@/lib/format';
import { todayISO } from '@/lib/utils';
import { errorMessage } from '@/lib/errors';
import { isGoogleConfigured } from '@/lib/env';
import type { Currency, ExpenseCategory, Role } from '@/types/database';

type Tab = 'profile' | 'users' | 'categories' | 'currencies' | 'app' | 'drive' | 'demo' | 'audit';

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const perms = usePermissions();
  const tabs: { value: Tab; label: string }[] = [
    { value: 'profile', label: 'My profile' },
    ...(perms.isAdmin ? [{ value: 'users' as Tab, label: 'Users & roles' }, { value: 'categories' as Tab, label: 'Expense categories' }] : []),
    { value: 'currencies', label: 'Currencies & rates' },
    ...(perms.isAdmin ? [{ value: 'app' as Tab, label: 'Application' }, { value: 'drive' as Tab, label: 'Google Drive' }, { value: 'demo' as Tab, label: 'Demo data' }] : []),
    ...(perms.canViewAudit ? [{ value: 'audit' as Tab, label: 'Audit log' }] : []),
  ];
  const requested = params.get('tab') as Tab | null;
  const tab = tabs.some((t) => t.value === requested) ? (requested as Tab) : perms.isAdmin ? 'users' : 'profile';
  return (
    <div>
      <PageHeader title="Settings" subtitle={perms.isAdmin ? 'Users, categories, currencies, application and storage settings' : 'Your profile and reference data'} />
      <Tabs<Tab> value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} tabs={tabs} />
      {tab === 'profile' && <ProfileTab />}
      {tab === 'users' && perms.isAdmin && <UsersTab />}
      {tab === 'categories' && perms.isAdmin && <CategoriesTab />}
      {tab === 'currencies' && <CurrenciesTab />}
      {tab === 'app' && perms.isAdmin && <AppTab />}
      {tab === 'drive' && perms.isAdmin && <DriveTab />}
      {tab === 'demo' && perms.isAdmin && <DemoTab />}
      {tab === 'audit' && perms.canViewAudit && <AuditTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
function ProfileTab() {
  const { profile, session, role, refreshProfile, updatePassword } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [job, setJob] = useState(profile?.job_title ?? '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  useEffect(() => {
    setName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
    setJob(profile?.job_title ?? '');
  }, [profile]);
  const save = useMutation({
    mutationFn: () => usersService.updateProfile(session!.user.id, { full_name: name.trim(), phone: phone || null, job_title: job || null }),
    onSuccess: () => { void refreshProfile(); toast.success('Profile saved'); },
    onError: (e) => toast.error('Could not save profile', e),
  });
  const changePw = useMutation({
    mutationFn: () => updatePassword(pw),
    onSuccess: () => { setPw(''); setPw2(''); toast.success('Password changed'); },
    onError: (e) => toast.error('Could not change password', e),
  });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Profile" subtitle={`${session?.user.email} · ${role ? ROLE_LABEL[role] : ''}`} />
        <CardBody className="space-y-4">
          <Field label="Full name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Job title"><Input value={job} onChange={(e) => setJob(e.target.value)} /></Field>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim()}>Save profile</Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Change password" />
        <CardBody className="space-y-4">
          <Field label="New password" error={pw && pw.length < 8 ? 'At least 8 characters' : undefined}><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Confirm password" error={pw2 && pw2 !== pw ? 'Passwords do not match' : undefined}><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
          <Button onClick={() => changePw.mutate()} loading={changePw.isPending} disabled={pw.length < 8 || pw !== pw2}>Change password</Button>
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
function UsersTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { uid } = usePermissions();
  const users = useUsers();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'employee' as Role });
  const setRole = useMutation({
    mutationFn: ({ u, role }: { u: UserRow; role: Role }) => usersService.setRole(u.id, role),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.users }); toast.success('Role updated'); },
    onError: (e) => toast.error('Could not change role', e),
  });
  const setActive = useMutation({
    mutationFn: (u: UserRow) => usersService.setActive(u.id, !u.is_active),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.users }); toast.success('User updated'); },
    onError: (e) => toast.error('Could not update user', e),
  });
  const create = useMutation({
    mutationFn: () => usersService.createUser(form.email.trim(), form.password, form.name.trim(), form.role),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: qk.users });
      setAdding(false);
      setForm({ email: '', name: '', password: '', role: 'employee' });
      toast.success('User created', r.needsConfirmation ? 'They must confirm their e-mail before signing in.' : 'They can sign in now.');
    },
    onError: (e) => toast.error('Could not create user', e),
  });
  const valid = /\S+@\S+\.\S+/.test(form.email) && form.password.length >= 8 && form.name.trim().length > 1;
  const columns: Column<UserRow>[] = [
    { key: 'name', header: 'User', sortValue: (u) => u.full_name, cell: (u) => <div><p className="font-medium text-slate-900 dark:text-white">{u.full_name || '—'} {u.id === uid && <Badge tone="blue">You</Badge>}</p><p className="text-xs text-slate-500">{u.email}</p></div> },
    { key: 'job', header: 'Job title', hideBelow: 'md', cell: (u) => u.job_title ?? '—' },
    {
      key: 'role', header: 'Role',
      cell: (u) => (
        <Select className="h-8 w-40" value={u.role} disabled={u.id === uid} onChange={(e) => setRole.mutate({ u, role: e.target.value as Role })} aria-label="Role">
          {(['admin', 'manager', 'employee'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </Select>
      ),
    },
    { key: 'status', header: 'Status', cell: (u) => <Badge tone={u.is_active ? 'green' : 'slate'}>{u.is_active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'since', header: 'Since', hideBelow: 'lg', cell: (u) => fmtDate(u.created_at) },
    { key: 'a', header: '', align: 'right', cell: (u) => u.id !== uid && <Button size="sm" variant="ghost" icon={<Power className="h-4 w-4" />} onClick={() => setActive.mutate(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</Button> },
  ];
  return (
    <Card>
      <CardHeader title="Users & roles" subtitle="Administrator: full access · Manager: all shipments, reviews, reports · Employee: own/assigned shipments" actions={<Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => setAdding(true)}>Add user</Button>} />
      {users.isLoading ? <TableSkeleton /> : users.isError ? <ErrorState error={users.error} onRetry={() => users.refetch()} /> : <DataTable columns={columns} rows={users.data ?? []} rowKey={(u) => u.id} />}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add user" size="sm"
        footer={<><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={() => create.mutate()} disabled={!valid} loading={create.isPending}>Create user</Button></>}>
        <div className="space-y-4">
          <Field label="Full name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="E-mail" required><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Temporary password" required hint="At least 8 characters; ask the user to change it after first sign-in"><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {(['employee', 'manager', 'admin'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </Field>
          <p className="text-xs text-slate-500">Uses Supabase sign-up. If “Confirm email” is enabled in Supabase Auth, the user receives a confirmation e-mail first.</p>
        </div>
      </Modal>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function CategoriesTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const cats = useCategories();
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', code: '', cost_group: 'other' as CostGroup, is_recoverable_vat: false, sort_order: 200 });
  const openFor = (c: ExpenseCategory | null) => {
    setEditing(c);
    setF(c ? { name: c.name, code: c.code, cost_group: c.cost_group, is_recoverable_vat: c.is_recoverable_vat, sort_order: c.sort_order }
      : { name: '', code: '', cost_group: 'other', is_recoverable_vat: false, sort_order: 200 });
    setOpen(true);
  };
  const save = useMutation({
    mutationFn: () => {
      const payload = { ...f, name: f.name.trim(), code: (f.code || f.name).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') };
      if (editing) {
        const { code: _code, cost_group, ...rest } = payload;
        void _code;
        return categoriesService.update(editing.id, editing.is_system ? rest : { ...rest, cost_group });
      }
      return categoriesService.create(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.categories }); setOpen(false); toast.success(editing ? 'Category updated' : 'Category created'); },
    onError: (e) => toast.error('Could not save category', e),
  });
  const toggle = useMutation({
    mutationFn: (c: ExpenseCategory) => categoriesService.update(c.id, { is_active: !c.is_active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.categories }); toast.success('Category updated'); },
    onError: (e) => toast.error('Update failed', e),
  });
  const columns: Column<ExpenseCategory>[] = [
    { key: 'name', header: 'Category', sortValue: (c) => c.sort_order, cell: (c) => <div><p className="font-medium text-slate-900 dark:text-white">{c.name}</p><p className="text-xs text-slate-500">{c.code}{c.is_system ? ' · default' : ''}</p></div> },
    { key: 'group', header: 'Reporting group', cell: (c) => COST_GROUP_LABELS[c.cost_group] },
    { key: 'vat', header: 'Recoverable VAT', hideBelow: 'lg', cell: (c) => (c.is_recoverable_vat ? <Check className="h-4 w-4 text-emerald-500" /> : '—') },
    { key: 'st', header: 'Status', cell: (c) => <Badge tone={c.is_active ? 'green' : 'slate'}>{c.is_active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'a', header: '', align: 'right', cell: (c) => <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => openFor(c)}>Edit</Button><Button size="sm" variant="ghost" icon={<Power className="h-4 w-4" />} onClick={() => toggle.mutate(c)}>{c.is_active ? 'Deactivate' : 'Activate'}</Button></div> },
  ];
  return (
    <Card>
      <CardHeader title="Expense categories" subtitle="Deactivated categories stay on existing expenses but cannot be chosen for new ones. Default categories can be renamed or deactivated." actions={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => openFor(null)}>New category</Button>} />
      {cats.isLoading ? <TableSkeleton /> : cats.isError ? <ErrorState error={cats.error} /> : <DataTable columns={columns} rows={cats.data ?? []} rowKey={(c) => c.id} pageSize={50} initialSort={{ key: 'name', dir: 'asc' }} />}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${editing.name}` : 'New expense category'} size="md"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => save.mutate()} disabled={f.name.trim().length < 2} loading={save.isPending}>Save</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Code" hint={editing ? 'Codes cannot be changed' : 'Generated from the name if empty'}><Input value={f.code} disabled={!!editing} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
          <Field label="Reporting group" hint={editing?.is_system ? 'Fixed for default categories' : 'Used by the dashboard and the % of supplier invoice'}>
            <Select value={f.cost_group} disabled={!!editing?.is_system} onChange={(e) => setF({ ...f, cost_group: e.target.value as CostGroup })}>
              {COST_GROUPS.map((g) => <option key={g} value={g}>{COST_GROUP_LABELS[g]}</option>)}
            </Select>
          </Field>
          <Field label="Sort order"><Input type="number" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) || 0 })} /></Field>
          <div className="space-y-2 pt-5">
            <Checkbox label="Recoverable input VAT" checked={f.is_recoverable_vat} onChange={(e) => setF({ ...f, is_recoverable_vat: e.target.checked })} />
          </div>
        </div>
      </Modal>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function CurrenciesTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const perms = usePermissions();
  const currencies = useCurrencies();
  const rates = useRates();
  const [cur, setCur] = useState<{ open: boolean; c: Currency | null; code: string; name: string; symbol: string; rate: string }>({ open: false, c: null, code: '', name: '', symbol: '', rate: '' });
  const [rate, setRate] = useState({ code: 'USD', value: '', date: todayISO(), source: '' });
  const [delRate, setDelRate] = useState<string | null>(null);
  const saveCur = useMutation({
    mutationFn: async () => {
      if (cur.c) return currenciesService.update(cur.c.id, { name: cur.name, symbol: cur.symbol || null });
      const c = await currenciesService.create({ code: cur.code.toUpperCase(), name: cur.name, symbol: cur.symbol || null, current_rate: Number(cur.rate) });
      await currenciesService.addRate({ currency_code: c.code, rate_to_sar: Number(cur.rate), effective_date: todayISO(), source: 'Initial rate' });
      return c;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.currencies }); qc.invalidateQueries({ queryKey: qk.rates }); setCur((s) => ({ ...s, open: false })); toast.success('Currency saved'); },
    onError: (e) => toast.error('Could not save currency', e),
  });
  const toggleCur = useMutation({
    mutationFn: (c: Currency) => currenciesService.update(c.id, { is_active: !c.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.currencies }),
    onError: (e) => toast.error('Update failed', e),
  });
  const addRate = useMutation({
    mutationFn: () => currenciesService.addRate({ currency_code: rate.code, rate_to_sar: Number(rate.value), effective_date: rate.date, source: rate.source || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.rates }); qc.invalidateQueries({ queryKey: qk.currencies }); setRate((r) => ({ ...r, value: '', source: '' })); toast.success('Exchange rate added', 'New entries will suggest this rate. Existing records keep their stored rates.'); },
    onError: (e) => toast.error('Could not add rate', e),
  });
  const removeRate = useMutation({
    mutationFn: (id: string) => currenciesService.deleteRate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.rates }); setDelRate(null); toast.success('Rate history entry deleted'); },
    onError: (e) => toast.error('Could not delete', e),
  });
  const foreign = (currencies.data ?? []).filter((c) => c.code !== 'SAR' && c.is_active);
  return (
    <div className="space-y-5">
      <Alert tone="blue" title="Historical exchange rates are preserved">
        Each expense, product line and shipment stores the exchange rate used when it was entered. Adding or changing a rate here only changes the rate suggested for new entries — it never rewrites existing records.
      </Alert>
      <Card>
        <CardHeader title="Currencies" subtitle="Current suggested rate: 1 unit = X SAR" actions={perms.isAdmin && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCur({ open: true, c: null, code: '', name: '', symbol: '', rate: '' })}>Add currency</Button>} />
        {currencies.isLoading ? <TableSkeleton rows={4} /> : currencies.isError ? <ErrorState error={currencies.error} /> : (
          <DataTable
            rowKey={(c) => c.id}
            rows={currencies.data ?? []}
            pageSize={50}
            columns={[
              { key: 'code', header: 'Code', cell: (c) => <span className="font-semibold">{c.code}{c.is_base && <Badge tone="blue" className="ml-2">Base</Badge>}</span> },
              { key: 'name', header: 'Name', cell: (c) => `${c.name}${c.symbol ? ` (${c.symbol})` : ''}` },
              { key: 'rate', header: 'Current rate (SAR)', align: 'right', cell: (c) => fmtRate(c.current_rate) },
              { key: 'st', header: 'Status', cell: (c) => <Badge tone={c.is_active ? 'green' : 'slate'}>{c.is_active ? 'Active' : 'Inactive'}</Badge> },
              { key: 'a', header: '', align: 'right', cell: (c) => perms.isAdmin && !c.is_base && <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setCur({ open: true, c, code: c.code, name: c.name, symbol: c.symbol ?? '', rate: String(c.current_rate) })}>Edit</Button><Button size="sm" variant="ghost" icon={<Power className="h-4 w-4" />} onClick={() => toggleCur.mutate(c)}>{c.is_active ? 'Deactivate' : 'Activate'}</Button></div> },
            ]}
          />
        )}
      </Card>
      <Card>
        <CardHeader title="Exchange rate history" subtitle="The latest effective rate becomes the suggestion for new entries" />
        {perms.isManager && (
          <div className="grid gap-3 border-b border-line p-4 dark:border-navy-700 sm:grid-cols-5">
            <Field label="Currency"><Select value={rate.code} onChange={(e) => setRate({ ...rate, code: e.target.value })}>{foreign.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</Select></Field>
            <Field label="Rate (1 unit = SAR)"><Input type="number" step="0.000001" min="0" value={rate.value} onChange={(e) => setRate({ ...rate, value: e.target.value })} /></Field>
            <Field label="Effective date"><Input type="date" value={rate.date} onChange={(e) => setRate({ ...rate, date: e.target.value })} /></Field>
            <Field label="Source"><Input placeholder="SAMA / bank" value={rate.source} onChange={(e) => setRate({ ...rate, source: e.target.value })} /></Field>
            <div className="flex items-end"><Button className="w-full" onClick={() => addRate.mutate()} disabled={!(Number(rate.value) > 0) || !rate.date} loading={addRate.isPending}>Add rate</Button></div>
          </div>
        )}
        {rates.isLoading ? <TableSkeleton rows={4} /> : rates.isError ? <ErrorState error={rates.error} /> : (
          <DataTable
            rowKey={(r) => r.id}
            rows={rates.data ?? []}
            empty={<EmptyState title="No rate history yet" />}
            columns={[
              { key: 'date', header: 'Effective date', sortValue: (r) => r.effective_date, cell: (r) => fmtDate(r.effective_date) },
              { key: 'code', header: 'Currency', sortValue: (r) => r.currency_code, cell: (r) => r.currency_code },
              { key: 'rate', header: 'Rate (SAR)', align: 'right', cell: (r) => fmtRate(r.rate_to_sar) },
              { key: 'src', header: 'Source', cell: (r) => r.source ?? '—' },
              { key: 'created', header: 'Entered', hideBelow: 'md', cell: (r) => fmtDateTime(r.created_at) },
              { key: 'a', header: '', align: 'right', cell: (r) => perms.isAdmin && <button onClick={() => setDelRate(r.id)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete rate"><Trash2 className="h-4 w-4" /></button> },
            ]}
          />
        )}
      </Card>
      <Modal open={cur.open} onClose={() => setCur((s) => ({ ...s, open: false }))} title={cur.c ? `Edit ${cur.c.code}` : 'Add currency'} size="sm"
        footer={<><Button variant="outline" onClick={() => setCur((s) => ({ ...s, open: false }))}>Cancel</Button><Button onClick={() => saveCur.mutate()} loading={saveCur.isPending} disabled={!cur.name || (!cur.c && (!/^[A-Za-z]{3}$/.test(cur.code) || !(Number(cur.rate) > 0)))}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="ISO code" required><Input maxLength={3} value={cur.code} disabled={!!cur.c} onChange={(e) => setCur({ ...cur, code: e.target.value.toUpperCase() })} /></Field>
          <Field label="Name" required><Input value={cur.name} onChange={(e) => setCur({ ...cur, name: e.target.value })} /></Field>
          <Field label="Symbol"><Input value={cur.symbol} onChange={(e) => setCur({ ...cur, symbol: e.target.value })} /></Field>
          {!cur.c && <Field label="Initial rate (1 unit = SAR)" required><Input type="number" step="0.000001" value={cur.rate} onChange={(e) => setCur({ ...cur, rate: e.target.value })} /></Field>}
          {cur.c && <p className="text-xs text-slate-500">To change the rate, add a new entry in the exchange rate history.</p>}
        </div>
      </Modal>
      <ConfirmDialog open={!!delRate} onClose={() => setDelRate(null)} onConfirm={() => delRate && removeRate.mutate(delRate)} loading={removeRate.isPending} title="Delete rate history entry?" message="This removes the history entry only. No expense or product record is changed." confirmLabel="Delete" />
    </div>
  );
}

// ---------------------------------------------------------------------------
function AppTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { settings, isLoading } = useSettings();
  const [v, setV] = useState({ companyName: '', companyAddress: '', companyVatNumber: '', includeLineVat: false, employeesViewAll: true, maxUploadMb: 25 });
  useEffect(() => {
    setV({ companyName: settings.companyName, companyAddress: settings.companyAddress, companyVatNumber: settings.companyVatNumber, includeLineVat: settings.includeLineVat, employeesViewAll: settings.employeesViewAll, maxUploadMb: settings.maxUploadMb });
  }, [settings]);
  const save = useMutation({
    mutationFn: async () => {
      await settingsService.upsert('company_name', v.companyName.trim());
      await settingsService.upsert('company_address', v.companyAddress.trim());
      await settingsService.upsert('company_vat_number', v.companyVatNumber.trim());
      await settingsService.upsert('include_line_vat_in_expenses', v.includeLineVat);
      await settingsService.upsert('employees_view_all_shipments', v.employeesViewAll);
      await settingsService.upsert('max_upload_mb', Math.max(1, Math.min(100, Math.round(v.maxUploadMb))));
    },
    onSuccess: () => { qc.invalidateQueries(); toast.success('Settings saved'); },
    onError: (e) => toast.error('Could not save settings', e),
  });
  if (isLoading) return <Spinner />;
  return (
    <Card>
      <CardHeader title="Application settings" />
      <CardBody className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Company name (reports)"><Input value={v.companyName} onChange={(e) => setV({ ...v, companyName: e.target.value })} /></Field>
          <Field label="Company address (reports)"><Input value={v.companyAddress} onChange={(e) => setV({ ...v, companyAddress: e.target.value })} /></Field>
          <Field label="Company VAT number"><Input value={v.companyVatNumber} onChange={(e) => setV({ ...v, companyVatNumber: e.target.value })} /></Field>
          <Field label="Maximum upload size (MB)"><Input type="number" min={1} max={100} value={v.maxUploadMb} onChange={(e) => setV({ ...v, maxUploadMb: Number(e.target.value) })} /></Field>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-line p-4 dark:border-navy-700">
            <Checkbox label="Add service-invoice VAT to total expenses" checked={v.includeLineVat} onChange={(e) => setV({ ...v, includeLineVat: e.target.checked })} />
            <p className="mt-1 pl-6 text-xs text-slate-500">Off (recommended): the VAT amount typed on freight/clearance invoices is reported separately. Import VAT paid at customs is always its own category and always included. VAT is never counted twice.</p>
          </div>
          <div className="rounded-lg border border-line p-4 dark:border-navy-700">
            <Checkbox label="Employees can view all shipments" checked={v.employeesViewAll} onChange={(e) => setV({ ...v, employeesViewAll: e.target.checked })} />
            <p className="mt-1 pl-6 text-xs text-slate-500">When off, employees see only shipments they created or that are assigned to them (enforced by the database).</p>
          </div>
        </div>
        <div className="lg:col-span-2"><Button onClick={() => save.mutate()} loading={save.isPending}>Save settings</Button></div>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function DriveTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { settings } = useSettings();
  const [link, setLink] = useState('');
  const [folderName, setFolderName] = useState('');
  const [check, setCheck] = useState<string | null>(null);
  useEffect(() => {
    setLink(settings.driveRootFolderId ? `https://drive.google.com/drive/folders/${settings.driveRootFolderId}` : '');
    setFolderName(settings.driveRootFolderName);
  }, [settings.driveRootFolderId, settings.driveRootFolderName]);
  const parsed = parseDriveFolderId(link);
  const save = useMutation({
    mutationFn: async () => {
      await settingsService.upsert('drive_root_folder_id', link.trim() ? parsed ?? '' : '');
      await settingsService.upsert('google_drive_root_folder_name', folderName.trim() || 'Diamond Dent Shipments');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.settings }); toast.success('Google Drive settings saved'); },
    onError: (e) => toast.error('Could not save', e),
  });
  const test = async () => {
    setCheck('Checking…');
    try {
      googleDrive.configure({ rootFolderId: parsed });
      const f = await googleDrive.checkRootFolder();
      setCheck(`✓ Access confirmed: “${f.name}”`);
    } catch (e) {
      setCheck(`✗ ${errorMessage(e)}`);
    }
  };
  return (
    <div className="space-y-5">
      {!isGoogleConfigured && <Alert tone="amber" title="VITE_GOOGLE_CLIENT_ID is not set">Uploads are disabled until the Google OAuth client ID is added to the build (see README).</Alert>}
      <Card>
        <CardHeader title="Google Drive document storage" subtitle="All attachments are stored only in Google Drive. The database keeps metadata (document number, type, Drive file ID & link, name, size, uploader)." />
        <CardBody className="space-y-4">
          <Field label="Company Drive folder link" hint={link && !parsed ? 'Could not find a folder ID in this link' : parsed ? `Folder ID: ${parsed}` : 'Paste a link like https://drive.google.com/drive/folders/<id>'} error={link && !parsed ? 'Invalid Drive folder link' : undefined}>
            <Input value={link} onChange={(e) => { setLink(e.target.value); setCheck(null); }} placeholder="https://drive.google.com/drive/folders/…" />
          </Field>
          <Alert tone="blue">
            Per-PO folders “&lt;PO&gt; – &lt;Shipment ID&gt;” are created inside this folder. Because the folder was not created by this app, users are asked to grant the full Google Drive scope (<code>https://www.googleapis.com/auth/drive</code>). Share the folder with every employee who uploads documents. If no folder is set, the app creates its own folder (below) with the limited <code>drive.file</code> scope.
          </Alert>
          <Field label="Fallback folder name (used only when no folder link is set)"><Input value={folderName} onChange={(e) => setFolderName(e.target.value)} /></Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!!link && !parsed}>Save</Button>
            <Button variant="outline" icon={<FolderCheck className="h-4 w-4" />} onClick={() => void test()} disabled={!parsed || !isGoogleConfigured}>Test folder access</Button>
            {check && <span className={`text-sm ${check.startsWith('✓') ? 'text-emerald-600' : check.startsWith('✗') ? 'text-red-600' : 'text-slate-500'}`}>{check}</span>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
function DemoTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const counts = useQuery({ queryKey: ['demo-counts'], queryFn: settingsService.demoCounts });
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const remove = useMutation({
    mutationFn: settingsService.removeDemoData,
    onSuccess: (r) => {
      qc.invalidateQueries();
      setOpen(false);
      setTyped('');
      toast.success('Demo data removed', Object.entries(r).filter(([, n]) => n).map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(', ') || 'Nothing to remove');
    },
    onError: (e) => toast.error('Could not remove demo data', e),
  });
  const total = counts.data ? Object.values(counts.data).reduce((a, b) => a + b, 0) : 0;
  return (
    <Card>
      <CardHeader title="Demo data" subtitle="Records loaded from supabase/seed.sql are flagged is_demo = true and shown with a DEMO badge" />
      <CardBody className="space-y-4">
        {counts.isLoading ? <Spinner /> : counts.isError ? <ErrorState error={counts.error} /> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Object.entries(counts.data ?? {}).map(([k, n]) => (
              <div key={k} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-navy-800"><p className="text-[11px] capitalize text-slate-500">{k.replace(/_/g, ' ')}</p><p className="text-lg font-semibold">{n}</p></div>
            ))}
          </div>
        )}
        <Alert tone="amber">Removes only rows flagged as demo (shipments, their expenses, payments, document records, demo suppliers and forwarders). Real company records are never deleted; real shipments that reference a demo supplier are detached from it first.</Alert>
        <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} disabled={!total} onClick={() => setOpen(true)}>Remove all demo data</Button>
      </CardBody>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} onConfirm={() => typed === 'REMOVE' && remove.mutate()} loading={remove.isPending} title="Remove all demo data?" confirmLabel="Remove demo data"
        message={<>This cannot be undone. Type <b>REMOVE</b> to confirm.</>}>
        <Input className="mt-3" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="REMOVE" />
      </ConfirmDialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function AuditTab() {
  const [table, setTable] = useState('');
  const users = useUsers();
  const logs = useQuery({ queryKey: ['audit', 'all', table], queryFn: () => auditService.list(300, table || undefined) });
  const nameOf = (id: string | null) => (id ? users.data?.find((u) => u.id === id)?.full_name ?? id.slice(0, 8) : 'System');
  const tables = ['shipments', 'shipment_expenses', 'expense_payments', 'shipment_documents', 'expense_categories', 'currencies', 'exchange_rates', 'users_roles', 'application_settings', 'suppliers', 'freight_forwarders', 'profiles', 'demo_data'];
  return (
    <Card>
      <CardHeader title="Audit log" subtitle="Latest 300 changes to financial and configuration records" actions={<Select className="h-8 w-56" value={table} onChange={(e) => setTable(e.target.value)} aria-label="Table"><option value="">All tables</option>{tables.map((t) => <option key={t} value={t}>{t}</option>)}</Select>} />
      {logs.isLoading ? <TableSkeleton /> : logs.isError ? <ErrorState error={logs.error} /> : (
        <DataTable
          rowKey={(l) => String(l.id)}
          rows={logs.data ?? []}
          pageSize={50}
          empty={<EmptyState title="No audit entries" />}
          columns={[
            { key: 'at', header: 'When', cell: (l) => <span className="whitespace-nowrap text-xs">{fmtDateTime(l.changed_at)}</span> },
            { key: 'who', header: 'User', cell: (l) => nameOf(l.changed_by) },
            { key: 'action', header: 'Action', cell: (l) => <Badge tone={l.action === 'DELETE' || l.action === 'SOFT_DELETE' ? 'red' : l.action === 'INSERT' ? 'green' : 'slate'}>{l.action}</Badge> },
            { key: 'table', header: 'Record', cell: (l) => <div className="text-xs"><p>{l.table_name}</p><p className="text-slate-500">{String((l.new_data ?? l.old_data)?.shipment_code ?? (l.new_data ?? l.old_data)?.expense_no ?? (l.new_data ?? l.old_data)?.doc_no ?? (l.new_data ?? l.old_data)?.name ?? l.record_id ?? '')}</p></div> },
            {
              key: 'what', header: 'Details', cell: (l) => {
                if (l.summary) return <span className="text-xs">{l.summary}</span>;
                if (l.old_data && l.new_data) {
                  const keys = Object.keys(l.new_data).filter((k) => k !== 'updated_at' && JSON.stringify(l.new_data![k]) !== JSON.stringify(l.old_data![k]));
                  return <span className="text-xs text-slate-500">{keys.slice(0, 6).map((k) => `${k}: ${JSON.stringify(l.old_data![k])} → ${JSON.stringify(l.new_data![k])}`).join(' · ')}</span>;
                }
                return null;
              },
            },
          ]}
        />
      )}
    </Card>
  );
}
