const CFG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  deadline: '2026-10-30T17:00:00+08:00',
  ...(window.SAD_CONFIG || {})
};
CFG.tables = { scholars: 'scholars', submissions: 'submissions', ...(window.SAD_CONFIG?.tables || {}) };

const STORAGE_KEY = 'sad_exam_store_v1';
const SETTINGS_KEY = 'sad_exam_settings_v1';

const POLICY_RULES = {
  'Merit Scholar': { maxGwa: 1.75, minUnits: 18, maxDropped: 0 },
  'Community Scholar': { maxGwa: 2.25, minUnits: 15, maxDropped: 1 }
};

const VERIFICATIONS = ['Pending', 'Verified', 'Returned'];
const COMPLIANCES = ['Pending', 'Compliant', 'With Deficiency'];
const RENEWALS = ['Pending', 'Approved', 'Held'];

const state = {
  scholars: [],
  submissions: [],
  activeId: null,
  role: 'scholar',
  scholarId: '',
  filters: { q: '', policy: '', status: '' },
  backend: 'local'
};

let supabaseClient = null;

const $ = id => document.getElementById(id);

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtDay(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function toast(message, kind = 'info', ms = 4200) {
  const wrap = $('toastWrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

function seedData() {
  const scholars = [
    { student_id: 'A01', name: 'Scholar A01', program: 'BS IT', policy: 'Merit Scholar' },
    { student_id: 'A02', name: 'Scholar A02', program: 'BS CS', policy: 'Merit Scholar' },
    { student_id: 'A03', name: 'Scholar A03', program: 'BS IS', policy: 'Community Scholar' },
    { student_id: 'A04', name: 'Scholar A04', program: 'BS IT', policy: 'Community Scholar' },
    { student_id: 'A05', name: 'Scholar A05', program: 'BS CS', policy: 'Merit Scholar' },
    { student_id: 'A06', name: 'Scholar A06', program: 'BS IS', policy: 'Community Scholar' },
    { student_id: 'A07', name: 'Scholar A07', program: 'BS IT', policy: 'Merit Scholar' },
    { student_id: 'A08', name: 'Scholar A08', program: 'BS CS', policy: 'Community Scholar' }
  ];
  const submissions = [
    {
      id: 1, student_id: 'A01', ay: '2026-2027', sem: '1st Semester',
      gwa: 1.5, units: 21, failed: 0, inc: 0, dropped: 0,
      proof: 'https://example.com/a01', verification: 'Verified', compliance: 'Compliant',
      reason: '', feedback: '', renewal: 'Approved', renewal_at: '2026-10-12T09:00:00+08:00',
      renewal_note: 'Ranked in top 5 of program.', submitted_at: '2026-10-05T10:00:00+08:00'
    },
    {
      id: 2, student_id: 'A03', ay: '2026-2027', sem: '1st Semester',
      gwa: 2.1, units: 18, failed: 0, inc: 1, dropped: 0,
      proof: 'https://example.com/a03', verification: 'Pending', compliance: 'Pending',
      reason: '', feedback: '', renewal: 'Pending', renewal_at: null, renewal_note: '',
      submitted_at: '2026-10-19T09:00:00+08:00'
    },
    {
      id: 3, student_id: 'A02', ay: '2026-2027', sem: '1st Semester',
      gwa: 2.4, units: 16, failed: 1, inc: 0, dropped: 1,
      proof: 'https://example.com/a02', verification: 'Verified', compliance: 'With Deficiency',
      reason: 'GWA exceeds 1.75; Units below 18; Failed subjects present; Dropped subjects present',
      feedback: '', renewal: 'Held', renewal_at: '2026-10-18T14:30:00+08:00',
      renewal_note: 'Remedial load scheduled.', submitted_at: '2026-10-10T11:15:00+08:00'
    },
    {
      id: 4, student_id: 'A04', ay: '2026-2027', sem: '1st Semester',
      gwa: 1.95, units: 20, failed: 0, inc: 0, dropped: 0,
      proof: 'https://example.com/a04', verification: 'Returned', compliance: 'Pending',
      reason: '', feedback: 'Proof of GWA is unreadable. Please re-upload a clear copy.',
      renewal: 'Pending', renewal_at: null, renewal_note: '', submitted_at: '2026-10-08T16:40:00+08:00'
    },
    {
      id: 5, student_id: 'A05', ay: '2026-2027', sem: '1st Semester',
      gwa: 1.62, units: 19, failed: 0, inc: 0, dropped: 0,
      proof: 'https://example.com/a05', verification: 'Verified', compliance: 'Compliant',
      reason: '', feedback: '', renewal: 'Pending', renewal_at: null, renewal_note: '',
      submitted_at: '2026-11-02T08:05:00+08:00'
    }
  ];
  return { scholars, submissions };
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.scholars) && Array.isArray(parsed.submissions)) {
        return {
          scholars: parsed.scholars.map(normalizeScholar),
          submissions: parsed.submissions.map(normalizeSubmission)
        };
      }
    }
  } catch (err) {
    console.warn('Local store unreadable, reseeding.', err);
  }
  const seed = seedData();
  saveLocal(seed);
  return seed;
}

function saveLocal(data) {
  const payload = data || { scholars: state.scholars, submissions: state.submissions };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Local store write failed.', err);
  }
}

function loadSettings() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
  } catch {
    stored = {};
  }
  return {
    supabaseUrl: stored.supabaseUrl || CFG.supabaseUrl || '',
    supabaseAnonKey: stored.supabaseAnonKey || CFG.supabaseAnonKey || ''
  };
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('Settings could not be persisted.', err);
  }
}

function normalizeScholar(row) {
  return {
    student_id: String(row.student_id ?? ''),
    name: String(row.name ?? ''),
    program: String(row.program ?? ''),
    policy: POLICY_RULES[row.policy] ? row.policy : 'Community Scholar'
  };
}

function normalizeSubmission(row) {
  return {
    id: num(row.id),
    student_id: String(row.student_id ?? ''),
    ay: String(row.ay ?? ''),
    sem: String(row.sem ?? ''),
    gwa: num(row.gwa),
    units: num(row.units),
    failed: num(row.failed),
    inc: num(row.inc),
    dropped: num(row.dropped),
    proof: String(row.proof ?? ''),
    verification: VERIFICATIONS.includes(row.verification) ? row.verification : 'Pending',
    compliance: COMPLIANCES.includes(row.compliance) ? row.compliance : 'Pending',
    reason: String(row.reason ?? ''),
    feedback: String(row.feedback ?? ''),
    renewal: RENEWALS.includes(row.renewal) ? row.renewal : 'Pending',
    renewal_at: row.renewal_at || null,
    renewal_note: String(row.renewal_note ?? ''),
    submitted_at: row.submitted_at || new Date().toISOString()
  };
}

function nextId() {
  return state.submissions.reduce((max, s) => Math.max(max, num(s.id)), 0) + 1;
}

function scholarOf(sid) {
  return state.scholars.find(s => s.student_id === sid) || null;
}

function policyOf(sid) {
  const scholar = scholarOf(sid);
  return scholar ? scholar.policy : 'Community Scholar';
}

function badge(text, kind) {
  const cls = String(text).toLowerCase().replace(/[^a-z]+/g, '-');
  return `<span class="badge ${cls}">${esc(text)}</span>`;
}

function isLate(submission) {
  const submitted = new Date(submission.submitted_at).getTime();
  const deadline = new Date(CFG.deadline).getTime();
  if (Number.isNaN(submitted) || Number.isNaN(deadline)) return false;
  return submitted > deadline;
}

function evaluate(submission) {
  const rules = POLICY_RULES[policyOf(submission.student_id)] || POLICY_RULES['Community Scholar'];
  const reasons = [];
  if (isLate(submission)) reasons.push('Late submission (past deadline)');
  if (num(submission.gwa) > rules.maxGwa) reasons.push(`GWA exceeds ${rules.maxGwa.toFixed(2)}`);
  if (num(submission.units) < rules.minUnits) reasons.push(`Units below ${rules.minUnits}`);
  if (num(submission.failed) !== 0) reasons.push('Failed subjects present');
  if (num(submission.inc) !== 0) reasons.push('INC subjects present');
  if (num(submission.dropped) > rules.maxDropped) reasons.push('Dropped subjects exceed 1');
  submission.compliance = reasons.length ? 'With Deficiency' : 'Compliant';
  submission.reason = reasons.join('; ');
  return submission;
}

function sortSubmissions(list) {
  return [...list].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
}

function renderScholarList() {
  const select = $('scholarSelector');
  const current = state.scholarId;
  select.innerHTML = state.scholars
    .map(s => `<option value="${esc(s.student_id)}">${esc(s.name)} · ${esc(s.policy)}</option>`)
    .join('');
  if (state.scholars.some(s => s.student_id === current)) {
    select.value = current;
  } else {
    state.scholarId = select.value || (state.scholars[0]?.student_id ?? '');
    select.value = state.scholarId;
  }
}

function renderScholar() {
  const sid = state.scholarId;
  const scholar = scholarOf(sid);
  const rows = sortSubmissions(state.submissions.filter(s => s.student_id === sid));
  const policyName = scholar ? scholar.policy : '—';
  const rules = POLICY_RULES[policyName] || POLICY_RULES['Community Scholar'];

  $('scholarMeta').innerHTML = scholar
    ? `<strong>${esc(scholar.name)}</strong> · ${esc(scholar.program)} · ${esc(scholar.policy)}
       <span class="muted">Compliant when GWA ≤ ${rules.maxGwa.toFixed(2)}, units ≥ ${rules.minUnits}, no failed/INC subjects, at most ${rules.maxDropped} dropped subject(s).</span>`
    : '<span class="muted">No scholars available.</span>';

  const body = $('historyBody');
  if (!rows.length) {
    body.innerHTML = `<tr class="empty"><td colspan="9">No submissions yet for this scholar.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(s => {
    const notes = [];
    if (s.reason) notes.push(`<div><b>Deficiency:</b> ${esc(s.reason)}</div>`);
    if (s.feedback) notes.push(`<div><b>Staff feedback:</b> ${esc(s.feedback)}</div>`);
    if (s.renewal_note) notes.push(`<div><b>Renewal note:</b> ${esc(s.renewal_note)}</div>`);
    const notesRow = notes.length
      ? `<tr class="notes-row"><td colspan="9">${notes.join('')}</td></tr>`
      : '';
    return `<tr>
      <td>${esc(s.ay)}<div class="muted">${esc(s.sem)}</div></td>
      <td>${num(s.gwa).toFixed(2)}</td>
      <td>${num(s.units)}</td>
      <td>${num(s.failed)}/${num(s.inc)}/${num(s.dropped)}</td>
      <td>${s.proof ? `<a class="proof" href="${esc(s.proof)}" target="_blank" rel="noopener noreferrer">Open</a>` : '—'}</td>
      <td>${badge(s.verification)}</td>
      <td>${badge(s.compliance)}</td>
      <td>${badge(s.renewal)}</td>
      <td>${esc(fmtDate(s.submitted_at))}${isLate(s) ? '<div class="muted late">Past deadline</div>' : ''}</td>
    </tr>${notesRow}`;
  }).join('');
}

function renderStaff() {
  const { q, policy, status } = state.filters;
  const data = state.submissions.filter(s => {
    const scholar = scholarOf(s.student_id);
    if (!scholar) return false;
    const haystack = `${scholar.name} ${scholar.student_id} ${scholar.program}`.toLowerCase();
    if (q && !haystack.includes(q)) return false;
    if (policy && scholar.policy !== policy) return false;
    if (status && s.verification !== status && s.compliance !== status && s.renewal !== status) return false;
    return true;
  });

  const body = $('staffBody');
  if (!data.length) {
    body.innerHTML = `<tr class="empty"><td colspan="10">No submissions match the current filters.</td></tr>`;
  } else {
    body.innerHTML = sortSubmissions(data).map(s => {
      const scholar = scholarOf(s.student_id);
      const canEvaluate = s.verification === 'Verified';
      const notes = [];
      if (s.reason) notes.push(`<div><b>Deficiency:</b> ${esc(s.reason)}</div>`);
      if (s.feedback) notes.push(`<div><b>Feedback given:</b> ${esc(s.feedback)}</div>`);
      if (s.renewal_note) notes.push(`<div><b>Renewal note:</b> ${esc(s.renewal_note)}</div>`);
      const notesRow = notes.length
        ? `<tr class="notes-row"><td colspan="10">${notes.join('')}</td></tr>`
        : '';
      return `<tr>
        <td>${esc(scholar.name)}<div class="muted">${esc(scholar.student_id)} · ${esc(scholar.program)}</div></td>
        <td>${badge(scholar.policy)}</td>
        <td>${esc(s.ay)}<div class="muted">${esc(s.sem)}</div></td>
        <td>${num(s.gwa).toFixed(2)}</td>
        <td>${num(s.units)}</td>
        <td>${num(s.failed)}/${num(s.inc)}/${num(s.dropped)}</td>
        <td>${badge(s.verification)}</td>
        <td>${badge(s.compliance)}</td>
        <td>${badge(s.renewal)}</td>
        <td class="actions">
          <button class="ghost" data-action="verify" data-id="${num(s.id)}">${s.verification === 'Pending' ? 'Review' : 'Open'}</button>
          <button class="ghost" data-action="evaluate" data-id="${num(s.id)}" ${canEvaluate ? '' : 'disabled'}>Evaluate</button>
          <button class="ghost" data-action="renewal" data-id="${num(s.id)}" ${s.verification === 'Verified' ? '' : 'disabled'}>Renewal</button>
        </td>
      </tr>${notesRow}`;
    }).join('');
  }

  $('mAssigned').textContent = state.scholars.length;
  $('mPending').textContent = state.submissions.filter(s => s.verification === 'Pending').length;
  $('mCompliant').textContent = state.submissions.filter(s => s.compliance === 'Compliant').length;
  $('mDef').textContent = state.submissions.filter(s => s.compliance === 'With Deficiency').length;
  $('mApproved').textContent = state.submissions.filter(s => s.renewal === 'Approved').length;
  $('mReturned').textContent = state.submissions.filter(s => s.verification === 'Returned').length;
}

function renderBackendChip() {
  const chip = $('backendChip');
  const map = {
    local: ['Local storage', 'chip local'],
    connecting: ['Connecting…', 'chip warn'],
    supabase: ['Supabase connected', 'chip ok']
  };
  const [label, cls] = map[state.backend] || map.local;
  chip.textContent = label;
  chip.className = cls;
}

function renderDeadlineChip() {
  const chip = $('deadlineChip');
  const deadline = new Date(CFG.deadline);
  if (Number.isNaN(deadline.getTime())) {
    chip.textContent = 'No deadline set';
    chip.className = 'chip';
    return;
  }
  const diff = deadline.getTime() - Date.now();
  const days = Math.ceil(diff / 86400000);
  const label = days >= 0 ? `${days} day(s) left` : `${Math.abs(days)} day(s) overdue`;
  chip.textContent = `Deadline ${fmtDay(deadline)} · ${label}`;
  chip.className = days >= 0 ? 'chip' : 'chip bad';
}

function renderAll() {
  renderScholarList();
  renderScholar();
  renderStaff();
  renderBackendChip();
  renderDeadlineChip();
}

async function persistSubmission(submission) {
  saveLocal();
  renderAll();
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from(CFG.tables.submissions)
        .upsert(toRow(submission), { onConflict: 'id' });
      if (error) throw new Error(error.message);
    } catch (err) {
      toast(`Saved locally, Supabase sync failed: ${err.message}`, 'warn');
    }
  }
}

function toRow(submission) {
  return {
    id: num(submission.id),
    student_id: submission.student_id,
    ay: submission.ay,
    sem: submission.sem,
    gwa: num(submission.gwa),
    units: num(submission.units),
    failed: num(submission.failed),
    inc: num(submission.inc),
    dropped: num(submission.dropped),
    proof: submission.proof,
    verification: submission.verification,
    compliance: submission.compliance,
    reason: submission.reason,
    feedback: submission.feedback,
    renewal: submission.renewal,
    renewal_at: submission.renewal_at || null,
    renewal_note: submission.renewal_note,
    submitted_at: submission.submitted_at
  };
}

async function connectSupabase(url, key) {
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw new Error('Supabase JS library is not loaded (check network access to the CDN).');
  }
  if (!url || !key) throw new Error('Project URL and anon key are required.');
  const client = window.supabase.createClient(url.trim(), key.trim());
  const { error } = await client.from(CFG.tables.scholars).select('student_id').limit(1);
  if (error) throw new Error(error.message);
  return client;
}

async function pullRemote(client) {
  const [scholarRes, submissionRes] = await Promise.all([
    client.from(CFG.tables.scholars).select('*').order('student_id'),
    client.from(CFG.tables.submissions).select('*').order('submitted_at')
  ]);
  if (scholarRes.error) throw new Error(scholarRes.error.message);
  if (submissionRes.error) throw new Error(submissionRes.error.message);
  return {
    scholars: (scholarRes.data || []).map(normalizeScholar),
    submissions: (submissionRes.data || []).map(normalizeSubmission)
  };
}

async function doConnect(settings, silent = false) {
  state.backend = 'connecting';
  renderBackendChip();
  try {
    const client = await connectSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
    const remote = await pullRemote(client);
    supabaseClient = client;
    state.backend = 'supabase';
    if (remote.scholars.length) state.scholars = remote.scholars;
    if (remote.submissions.length) state.submissions = remote.submissions;
    saveLocal();
    renderAll();
    if (!silent) toast('Connected to Supabase. Data is now shared across devices.', 'ok');
    return true;
  } catch (err) {
    supabaseClient = null;
    state.backend = 'local';
    renderBackendChip();
    if (!silent) toast(`Connection failed: ${err.message}`, 'error', 6000);
    else toast(`Supabase unavailable (${err.message}). Running on local storage.`, 'warn', 6000);
    return false;
  }
}

async function pushScholars() {
  if (!supabaseClient) return;
  try {
    const rows = state.scholars.map(s => ({
      student_id: s.student_id,
      name: s.name,
      program: s.program,
      policy: s.policy
    }));
    const { error } = await supabaseClient.from(CFG.tables.scholars).upsert(rows, { onConflict: 'student_id' });
    if (error) throw new Error(error.message);
    toast('Scholars uploaded to Supabase.', 'ok');
  } catch (err) {
    toast(`Upload failed: ${err.message}`, 'error');
  }
}

function openVerify(id) {
  const submission = state.submissions.find(s => num(s.id) === num(id));
  if (!submission) return;
  state.activeId = submission.id;
  const scholar = scholarOf(submission.student_id);
  const rules = POLICY_RULES[policyOf(submission.student_id)];
  $('verifyTitle').textContent = submission.verification === 'Pending' ? 'Review Evidence' : 'Submission Details';
  $('verifyInfo').innerHTML = `
    <div class="kv"><span>Scholar</span><strong>${esc(scholar?.name || submission.student_id)}</strong></div>
    <div class="kv"><span>Policy</span><strong>${esc(policyOf(submission.student_id))}</strong></div>
    <div class="kv"><span>Term</span><strong>${esc(submission.ay)} · ${esc(submission.sem)}</strong></div>
    <div class="kv"><span>GWA</span><strong>${num(submission.gwa).toFixed(2)} (max ${rules.maxGwa.toFixed(2)})</strong></div>
    <div class="kv"><span>Units</span><strong>${num(submission.units)} (min ${rules.minUnits})</strong></div>
    <div class="kv"><span>Failed / INC / Dropped</span><strong>${num(submission.failed)} / ${num(submission.inc)} / ${num(submission.dropped)} (max dropped ${rules.maxDropped})</strong></div>
    <div class="kv"><span>Submitted</span><strong>${esc(fmtDate(submission.submitted_at))}</strong></div>
    <div class="kv"><span>Status</span><strong>${badge(submission.verification)} ${badge(submission.compliance)} ${badge(submission.renewal)}</strong></div>
    <div class="kv"><span>Proof</span><strong>${submission.proof ? `<a class="proof" href="${esc(submission.proof)}" target="_blank" rel="noopener noreferrer">Open evidence</a>` : '—'}</strong></div>`;
  $('verifyStatus').innerHTML = submission.reason
    ? `<div class="callout warn"><b>Deficiencies:</b> ${esc(submission.reason)}</div>`
    : '';
  const pending = submission.verification === 'Pending';
  $('btnVerify').disabled = !pending;
  $('btnReturn').disabled = !pending;
  $('btnEvaluateFromModal').disabled = submission.verification !== 'Verified';
  $('returnFeedback').value = submission.feedback || '';
  $('verifyModal').classList.remove('hidden');
  $('verifyModal').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('btnVerify').focus(), 30);
}

function openRenewal(id) {
  const submission = state.submissions.find(s => num(s.id) === num(id));
  if (!submission) return;
  state.activeId = submission.id;
  const scholar = scholarOf(submission.student_id);
  $('renewalInfo').innerHTML = `
    <div class="kv"><span>Scholar</span><strong>${esc(scholar?.name || submission.student_id)}</strong></div>
    <div class="kv"><span>Policy</span><strong>${esc(policyOf(submission.student_id))}</strong></div>
    <div class="kv"><span>Term</span><strong>${esc(submission.ay)} · ${esc(submission.sem)}</strong></div>
    <div class="kv"><span>Verification</span><strong>${badge(submission.verification)}</strong></div>
    <div class="kv"><span>Compliance</span><strong>${badge(submission.compliance)}</strong></div>
    <div class="kv"><span>Current renewal</span><strong>${badge(submission.renewal)}</strong></div>`;
  $('renewalDecision').value = submission.renewal === 'Approved' ? 'Approved' : 'Held';
  $('renewalNote').value = submission.renewal_note || '';
  $('submitRenewal').disabled = false;
  $('renewalModal').classList.remove('hidden');
  $('renewalModal').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('renewalDecision').focus(), 30);
}

function closeModals() {
  ['verifyModal', 'renewalModal'].forEach(id => {
    $(id).classList.add('hidden');
    $(id).setAttribute('aria-hidden', 'true');
  });
  $('returnFeedback').value = '';
  state.activeId = null;
}

function activeSubmission() {
  return state.submissions.find(s => num(s.id) === num(state.activeId)) || null;
}

async function handleVerify() {
  const submission = activeSubmission();
  if (!submission) return;
  submission.verification = 'Verified';
  submission.feedback = '';
  evaluate(submission);
  await persistSubmission(submission);
  closeModals();
  toast(`Verified. ${submission.compliance}${submission.reason ? ' — ' + submission.reason : ''}.`, 'ok');
}

async function handleReturn() {
  const submission = activeSubmission();
  if (!submission) return;
  const feedback = $('returnFeedback').value.trim();
  if (!feedback) {
    toast('Feedback is required when returning a submission.', 'error');
    $('returnFeedback').focus();
    return;
  }
  submission.verification = 'Returned';
  submission.feedback = feedback;
  submission.compliance = 'Pending';
  submission.reason = '';
  await persistSubmission(submission);
  closeModals();
  toast('Submission returned to the scholar with feedback.', 'ok');
}

async function handleEvaluate(id) {
  const submission = state.submissions.find(s => num(s.id) === num(id));
  if (!submission) return;
  if (submission.verification !== 'Verified') {
    toast('Evaluate is blocked until the evidence is verified.', 'error');
    return;
  }
  evaluate(submission);
  await persistSubmission(submission);
  toast(`${submission.compliance}${submission.reason ? ' — ' + submission.reason : ''}.`, submission.compliance === 'Compliant' ? 'ok' : 'warn');
}

async function handleRenewalSubmit() {
  const submission = activeSubmission();
  if (!submission) return;
  const decision = $('renewalDecision').value;
  const note = $('renewalNote').value.trim();
  if (submission.verification !== 'Verified') {
    toast('Cannot record a renewal: evidence is not verified.', 'error');
    return;
  }
  if (decision === 'Approved' && submission.compliance !== 'Compliant') {
    toast('Cannot approve a scholar with deficiencies.', 'error');
    return;
  }
  submission.renewal = decision;
  submission.renewal_note = note;
  submission.renewal_at = new Date().toISOString();
  await persistSubmission(submission);
  closeModals();
  toast(`Renewal ${decision.toLowerCase()}.`, decision === 'Approved' ? 'ok' : 'warn');
}

function validateSubmission(values) {
  if (!/^\d{4}-\d{4}$/.test(values.ay)) return 'Academic Year must look like 2026-2027.';
  if (!values.sem) return 'Semester is required.';
  if (Number.isNaN(values.gwa) || values.gwa < 1 || values.gwa > 5) return 'GWA must be between 1.00 and 5.00.';
  if (!Number.isInteger(values.units) || values.units < 1) return 'Total units must be a whole number of at least 1.';
  for (const key of ['failed', 'inc', 'dropped']) {
    if (!Number.isInteger(values[key]) || values[key] < 0) return 'Failed, INC and dropped subjects must be zero or positive whole numbers.';
  }
  let url;
  try {
    url = new URL(values.proof);
  } catch {
    return 'Proof must be a valid URL (https://…).';
  }
  if (!/^https?:$/.test(url.protocol)) return 'Proof must be a valid URL (https://…).';
  return null;
}

function handleSubmit(event) {
  event.preventDefault();
  const msg = $('formMsg');
  msg.textContent = '';
  msg.className = 'msg';
  const values = {
    ay: $('ay').value.trim(),
    sem: $('sem').value.trim(),
    gwa: parseFloat($('gwa').value),
    units: parseInt($('units').value, 10),
    failed: parseInt($('failed').value || '0', 10),
    inc: parseInt($('inc').value || '0', 10),
    dropped: parseInt($('dropped').value || '0', 10),
    proof: $('proof').value.trim()
  };
  const error = validateSubmission(values);
  if (error) {
    msg.textContent = error;
    msg.className = 'msg error';
    return;
  }
  const sid = state.scholarId;
  const duplicate = state.submissions.find(s => s.student_id === sid && s.ay === values.ay && s.sem === values.sem && s.verification !== 'Returned');
  if (duplicate) {
    msg.textContent = 'A submission for this academic year and semester already exists.';
    msg.className = 'msg error';
    return;
  }
  const submission = normalizeSubmission({
    id: nextId(),
    student_id: sid,
    ...values,
    verification: 'Pending',
    compliance: 'Pending',
    reason: '',
    feedback: '',
    renewal: 'Pending',
    renewal_at: null,
    renewal_note: '',
    submitted_at: new Date().toISOString()
  });
  state.submissions.push(submission);
  $('proof').value = '';
  msg.textContent = 'Evidence submitted and queued for staff verification.';
  msg.className = 'msg success';
  toast('Evidence submitted successfully.', 'ok');
  persistSubmission(submission);
}

function applyRole() {
  const role = state.role;
  $('scholarView').classList.toggle('hidden', role !== 'scholar');
  $('staffView').classList.toggle('hidden', role !== 'staff');
  $('roleSwitcher').value = role;
  $('roleHint').textContent = role === 'scholar'
    ? 'Submit your academic evidence and track verification, compliance and renewal status.'
    : 'Verify evidence, run compliance evaluation against the scholar policy, and record renewal decisions.';
}

function bindEvents() {
  $('roleSwitcher').addEventListener('change', e => {
    state.role = e.target.value;
    applyRole();
  });

  $('scholarSelector').addEventListener('change', e => {
    state.scholarId = e.target.value;
    renderScholar();
  });

  $('submissionForm').addEventListener('submit', handleSubmit);
  $('resetForm').addEventListener('click', () => {
    $('submissionForm').reset();
    $('ay').value = '2026-2027';
    $('sem').value = '1st Semester';
    $('formMsg').textContent = '';
    $('formMsg').className = 'msg';
  });

  let searchTimer;
  $('search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    const value = e.target.value.trim().toLowerCase();
    searchTimer = setTimeout(() => {
      state.filters.q = value;
      renderStaff();
    }, 120);
  });
  $('policyFilter').addEventListener('change', e => {
    state.filters.policy = e.target.value;
    renderStaff();
  });
  $('statusFilter').addEventListener('change', e => {
    state.filters.status = e.target.value;
    renderStaff();
  });
  $('clearFilters').addEventListener('click', () => {
    state.filters = { q: '', policy: '', status: '' };
    $('search').value = '';
    $('policyFilter').value = '';
    $('statusFilter').value = '';
    renderStaff();
  });

  $('staffBody').addEventListener('click', e => {
    const button = e.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const id = button.dataset.id;
    if (button.dataset.action === 'verify') openVerify(id);
    if (button.dataset.action === 'evaluate') handleEvaluate(id);
    if (button.dataset.action === 'renewal') openRenewal(id);
  });

  $('btnVerify').addEventListener('click', handleVerify);
  $('btnReturn').addEventListener('click', handleReturn);
  $('btnEvaluateFromModal').addEventListener('click', async () => {
    const submission = activeSubmission();
    if (!submission) return;
    evaluate(submission);
    await persistSubmission(submission);
    closeModals();
    toast(`${submission.compliance}${submission.reason ? ' — ' + submission.reason : ''}.`, submission.compliance === 'Compliant' ? 'ok' : 'warn');
  });
  $('closeVerify').addEventListener('click', closeModals);
  $('submitRenewal').addEventListener('click', handleRenewalSubmit);
  $('closeRenewal').addEventListener('click', closeModals);

  ['verifyModal', 'renewalModal'].forEach(id => {
    const modal = $(id);
    modal.addEventListener('click', e => {
      if (e.target === modal) closeModals();
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModals();
  });

  $('connectBtn').addEventListener('click', async () => {
    const settings = {
      supabaseUrl: $('supabaseUrl').value.trim(),
      supabaseAnonKey: $('supabaseAnonKey').value.trim()
    };
    if (!settings.supabaseUrl || !settings.supabaseAnonKey) {
      toast('Enter both the project URL and the anon key.', 'error');
      return;
    }
    saveSettings(settings);
    $('connectBtn').disabled = true;
    const ok = await doConnect(settings);
    $('connectBtn').disabled = false;
    if (ok) $('disconnectBtn').disabled = false;
  });

  $('disconnectBtn').addEventListener('click', () => {
    supabaseClient = null;
    state.backend = 'local';
    renderBackendChip();
    $('disconnectBtn').disabled = true;
    toast('Disconnected. The system is running on local storage.', 'warn');
  });

  $('uploadScholarsBtn').addEventListener('click', pushScholars);

  $('refreshBtn').addEventListener('click', async () => {
    if (!supabaseClient) {
      renderAll();
      toast('Refreshed from local storage.', 'info');
      return;
    }
    await doConnect({ supabaseUrl: $('supabaseUrl').value.trim(), supabaseAnonKey: $('supabaseAnonKey').value.trim() }, true);
  });

  $('resetDataBtn').addEventListener('click', async () => {
    if (!window.confirm('Reset all records to the original demo data? This clears locally stored changes.')) return;
    const seed = seedData();
    state.scholars = seed.scholars;
    state.submissions = seed.submissions;
    saveLocal();
    renderAll();
    toast('Demo data restored.', 'ok');
  });
}

function hydrateSettingsUi() {
  const settings = loadSettings();
  $('supabaseUrl').value = settings.supabaseUrl;
  $('supabaseAnonKey').value = settings.supabaseAnonKey;
  $('disconnectBtn').disabled = true;
}

let booted = false;

async function boot() {
  if (booted) return;
  booted = true;
  const local = loadLocal();
  state.scholars = local.scholars;
  state.submissions = local.submissions;
  state.scholarId = local.scholars[0]?.student_id ?? '';
  state.role = 'scholar';

  hydrateSettingsUi();
  bindEvents();
  applyRole();
  renderAll();

  const settings = loadSettings();
  if (settings.supabaseUrl && settings.supabaseAnonKey) {
    await doConnect(settings, true);
  }
  setInterval(renderDeadlineChip, 60000);
}

document.addEventListener('DOMContentLoaded', boot);
if (document.readyState !== 'loading') boot();
