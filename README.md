# Student Scholarship Monitoring & Academic Compliance System

A web-based system that tracks scholarship holders' academic performance, verifies the evidence they
submit, evaluates their compliance against the conditions of their scholarship policy, and records
renewal decisions made by scholarship staff.

The app is a dependency-free static front end (HTML + CSS + vanilla JS). It runs entirely in the
browser, works offline, and can optionally sync everything to a Supabase project so multiple staff
members share the same records.

---

## 1. Features

### Scholar view
- Submit academic evidence for an academic year and semester: cumulative GWA, total units, failed /
  INC / dropped subjects, and a link to the supporting proof document.
- Real-time validation with inline error messages (GWA range, unit counts, academic-year format,
  proof URL must be a valid `http(s)` link).
- Duplicate protection: one active submission per academic year and semester per scholar. A
  submission that staff returned with feedback may be resubmitted.
- Submission history table with GWA, units, failed/INC/dropped, proof link, verification status,
  compliance status, renewal status, submission date, and any deficiency reason or staff feedback.
- The policy rules that apply to the selected scholar are shown above the form.

### Scholarship staff view
- Dashboard metrics: total assigned scholars, pending verification, compliant, with deficiency,
  renewals approved, and returned.
- Search by name, student ID, or program; filter by policy and by any status (verification,
  compliance, or renewal).
- Review evidence in a modal showing every recorded value next to the limit it was checked against,
  plus a link to the proof document.
- **Verify** — marks the evidence as verified and immediately runs the compliance evaluation.
- **Return with feedback** — returns the submission to the scholar with a mandatory written reason;
  the scholar sees the feedback and can resubmit.
- **Evaluate** — re-runs the compliance evaluation and reports every deficiency found.
- **Renewal** — records an **Approved** or **Held** decision with an optional note. Approval is
  blocked for submissions that are not verified or that carry deficiencies.
- Backend connection panel: connect/disconnect a Supabase project, upload the scholar roster, refresh
  from the server, and reset the demo data.

### Cross-cutting
- Works with no backend (browser storage) and with a Supabase backend; the active mode is always
  shown in the header.
- Live submission deadline countdown in the header.
- Toasts instead of browser alerts, accessible modals (Escape, backdrop click, focus handling), and
  all rendered data is HTML-escaped.

---

## 2. Running the application

### Option A — open the files directly
Double-click `index.html`. Everything works; the app stores records in the browser's local storage.

### Option B — serve it locally (recommended)
Local storage behaves most predictably over HTTP, so a tiny static server is preferable:

```bash
# Python (already installed on most machines)
python -m http.server 8080

# or Node
npx serve .
```

Then open <http://localhost:8080>.

No build step, package manager, or framework is required. The only network requests are the
Google Fonts stylesheet and the Supabase JS library from a CDN; both fail gracefully, and the app
still works offline.

---

## 3. Connecting a Supabase backend

The system ships with a complete SQL schema so the backend can be created in a few minutes.

1. Create a project at <https://supabase.com>.
2. Open **SQL Editor**, paste the contents of `supabase/schema.sql`, and run it. This creates the
   `scholars` and `submissions` tables, indexes, and row-level-security policies.
3. Copy the **Project URL** and the **anon public key** from **Project Settings → API**.
4. In the app, switch to **Scholarship Staff View → Backend Connection**, paste both values, and
   press **Connect**. The header chip switches from `Local storage` to `Supabase connected`.

After connecting, the app loads the existing records from the server and writes every new
submission, verification, evaluation, and renewal decision back to it.

### Connecting by editing a file instead
Set the credentials once in `config.js` and they are used automatically on the next page load:

```js
window.SAD_CONFIG = {
  supabaseUrl: 'https://your-project.supabase.co',
  supabaseAnonKey: 'your-anon-key',
  deadline: '2026-10-30T17:00:00+08:00',
  tables: { scholars: 'scholars', submissions: 'submissions' }
};
```

Credentials entered through the connection panel are stored in the browser and take precedence over
the file.

### Notes for production use
The policies in `schema.sql` allow the anonymous key to read and write directly, which is convenient
for a demonstration. Before deploying, replace them with authenticated, role-scoped policies and
serve the app over HTTPS.

---

## 4. Compliance rules

Each scholar belongs to one of two scholarship policies. A submission is **Compliant** only when it
satisfies every requirement below; otherwise it is marked **With Deficiency** and the failing
requirements are listed as the deficiency reason.

| Requirement | Merit Scholar | Community Scholar |
| --- | --- | --- |
| Cumulative GWA | ≤ 1.75 | ≤ 2.25 |
| Total enrolled units | ≥ 18 | ≥ 15 |
| Failed subjects | 0 | 0 |
| INC subjects | 0 | 0 |
| Dropped subjects | 0 | ≤ 1 |
| Submitted on time | Required (before the deadline) | Required (before the deadline) |

The thresholds live in the `POLICY_RULES` object at the top of `app.js` and can be adjusted there.

---

## 5. Status model

| Field | Values | Meaning |
| --- | --- | --- |
| `verification` | Pending, Verified, Returned | Where the submission sits in the staff review queue |
| `compliance` | Pending, Compliant, With Deficiency | Result of the policy evaluation |
| `renewal` | Pending, Approved, Held | Outcome of the renewal decision |

A submission moves through the states as follows:

```
Submit ──> Pending ──Verify──> Verified ──Evaluate──> Compliant / With Deficiency
              │                     │
              │                     └──Renewal──> Approved / Held
              └──Return (feedback required)──> Returned ──resubmit──> Pending
```

Evaluation runs automatically when staff mark a submission as verified, and can be re-run at any
time with the **Evaluate** action.

---

## 6. Data model

**scholars**

| Column | Type | Notes |
| --- | --- | --- |
| `student_id` | text | Primary key |
| `name` | text | Scholar name |
| `program` | text | Degree programme |
| `policy` | text | `Merit Scholar` or `Community Scholar` |

**submissions**

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint | Primary key |
| `student_id` | text | References `scholars.student_id` |
| `ay` / `sem` | text | Academic year and semester |
| `gwa` | numeric | Cumulative GWA, 1.00–5.00 |
| `units` | integer | Total enrolled units |
| `failed` / `inc` / `dropped` | integer | Subject counts |
| `proof` | text | URL of the supporting evidence |
| `verification` | text | Review status |
| `compliance` | text | Evaluation result |
| `reason` | text | Deficiency reasons |
| `feedback` | text | Feedback returned to the scholar |
| `renewal` | text | Renewal decision |
| `renewal_at` | timestamptz | When the decision was recorded |
| `renewal_note` | text | Conditions or justification |
| `submitted_at` | timestamptz | When the scholar submitted |

---

## 7. Project structure

```
SAD_EXAM/
├── index.html            # Markup for both role views, modals, and toast container
├── styles.css            # All styling, including badges, metrics, modals, and responsive rules
├── app.js                # Application logic: data layer, evaluation engine, rendering, events
├── config.js             # Supabase credentials, deadline, and table names
└── supabase/
    └── schema.sql        # Table definitions, indexes, and RLS policies
```

### How `app.js` is organised

| Section | Responsibility |
| --- | --- |
| Configuration | `CFG` reads `config.js`; `POLICY_RULES` holds the compliance thresholds |
| State | `state` holds scholars, submissions, active role, filters, and backend mode |
| Storage | `loadLocal` / `saveLocal` read and write the browser store; `loadSettings` / `saveSettings` hold credentials |
| Normalisation | `normalizeScholar` / `normalizeSubmission` map database rows into safe, validated objects |
| Rules | `evaluate` applies the policy thresholds and produces the deficiency reasons |
| Rendering | `renderScholar`, `renderStaff`, `renderScholarList`, and the header chips rebuild the DOM from state |
| Backend | `connectSupabase`, `pullRemote`, `persistSubmission`, and `pushScholars` handle the Supabase sync |
| Events | `bindEvents` wires every control; `boot` starts the application |

Two browser keys are used: `sad_exam_store_v1` for the records and `sad_exam_settings_v1` for the
backend credentials.

---

## 8. Manual test checklist

1. Open the app — the header shows the deadline countdown and `Local storage`; the scholar list is
   populated and the history table shows the seeded records.
2. Switch the scholar selector and confirm the history table and the policy note update.
3. Submit a valid evidence record — the success message appears and the record is added to the
   history.
4. Submit the same academic year and semester again — the duplicate is rejected.
5. Submit an out-of-range GWA and an invalid proof URL — each is rejected with a specific message.
6. Switch to **Scholarship Staff View** — the metrics, filters, and staff table render; a search for
   a student ID narrows the table.
7. Open **Review** on a pending submission — the modal lists the values against the policy limits.
8. Press **Return with Feedback** without a comment — the action is blocked; enter a comment and it
   succeeds, and the scholar sees the feedback in the history.
9. Verify a compliant submission — it is marked `Verified` and `Compliant` automatically.
10. Verify a submission with deficiencies — the reasons are listed and the status becomes
    `With Deficiency`.
11. Try to approve a renewal for a deficient scholar — the action is blocked; set the decision to
    `Held` and it succeeds with the note recorded.
12. Reload the page — all records and decisions are still present.
13. Connect Supabase using the steps in section 3, then create a record and confirm it appears in
    the Supabase table editor.
