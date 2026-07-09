#!/usr/bin/env python3
"""Generate the XOS Déchet Dashboard HTML — dark theme, filters, sortable table."""
import json, html

with open("/tmp/xos-dechet/dashboard_data.json") as f:
    data = json.load(f)

opps = data["opps"]
total_dechet = data["total_dechet"]
total_open = data["total_open"]
pct_dechet = data["pct_dechet"]
ca_at_risk = data["ca_at_risk"]
owner_stats = data["owner_stats"]
stage_stats = data["stage_stats"]
overdue_buckets = data["overdue_buckets"]
reason_stats = data["reason_stats"]

def fmt_euro(v):
    if not v: return "—"
    return f"{v:,.0f}€".replace(",", " ")

def fmt_pct(v):
    return f"{v:.1f}%"

owners_sorted = sorted(owner_stats.items(), key=lambda x: x[1]["count"], reverse=True)
stages_sorted = sorted(stage_stats.items(), key=lambda x: x[1], reverse=True)
reasons_sorted = sorted(reason_stats.items(), key=lambda x: x[1], reverse=True)

owner_rows = ""
for name, stats in owners_sorted:
    active_label = "✅" if stats["active"] else "❌ Inactif"
    owner_rows += "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>\n".format(
        html.escape(name), active_label, stats["count"], fmt_euro(stats["amount"]))

stage_rows = ""
for stage, count in stages_sorted:
    pct = count / total_dechet * 100 if total_dechet else 0
    bar_width = min(pct, 100)
    stage_rows += '<tr><td>{}</td><td>{}</td><td>{}</td><td><div class="bar-container"><div class="bar-fill" style="width:{}%"></div></div></td></tr>\n'.format(
        html.escape(stage), count, fmt_pct(pct), bar_width)

reason_rows = ""
for reason, count in reasons_sorted:
    pct = count / total_dechet * 100 if total_dechet else 0
    reason_rows += "<tr><td>{}</td><td>{}</td><td>{}</td></tr>\n".format(
        html.escape(reason), count, fmt_pct(pct))

max_bucket = max(overdue_buckets.values()) if overdue_buckets else 1
overdue_bars = ""
labels_map = {"<30j": "Moins de 30j", "31-90j": "31-90j", "91-180j": "91-180j", "181-365j": "181-365j", ">365j": "Plus d'un an"}
for key in ["<30j", "31-90j", "91-180j", "181-365j", ">365j"]:
    count = overdue_buckets.get(key, 0)
    height = count / max_bucket * 100 if max_bucket else 0
    overdue_bars += '<div class="bucket"><div class="bucket-label">{}</div><div class="bucket-bar"><div class="bucket-fill" style="height:{}%"></div></div><div class="bucket-count">{}</div></div>'.format(
        labels_map[key], height, count)

no_activity_count = sum(1 for o in opps if o["days_since_activity"] == 9999)
inactive_owner_count = sum(1 for o in opps if not o["owner_active"])

owner_buttons = ""
for name, _ in owners_sorted[:6]:
    safe_name = html.escape(name)
    owner_buttons += '<button class="filter-btn" onclick="setOwnerFilter(\'{}\')">{}</button>'.format(name, safe_name)

generated_str = data["generated_at"][:19].replace("T", " ")

# Build HTML without f-strings for the JS part
html_content = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>XOS — Dashboard Opportunités Déchet</title>
<style>
:root {
  --bg: #0d1117;
  --panel: #161b22;
  --panel-hover: #1c2230;
  --border: #21262d;
  --border-hover: #30363d;
  --text: #c9d1d9;
  --text-muted: #8b949e;
  --text-dim: #484f58;
  --accent: #6366f1;
  --accent-dim: #4f46e5;
  --red: #ef4444;
  --red-dim: #dc2626;
  --green: #22c55e;
  --amber: #f59e0b;
  --orange: #f97316;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  padding: 24px;
  min-height: 100vh;
}
.header { margin-bottom: 24px; }
.header h1 { font-size: 22px; font-weight: 600; margin-bottom: 4px; }
.header .subtitle { color: var(--text-muted); font-size: 13px; }
.header .generated { color: var(--text-dim); font-size: 11px; margin-top: 4px; }

.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}
.kpi-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 16px;
}
.kpi-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}
.kpi-value {
  font-size: 28px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.kpi-value.red { color: var(--red); }
.kpi-value.amber { color: var(--amber); }
.kpi-sub { font-size: 11px; color: var(--text-dim); margin-top: 4px; }

.section {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 16px;
}
.section-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-body { padding: 16px; overflow-x: auto; }

.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.filter-group { display: flex; align-items: center; gap: 6px; }
.filter-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.filter-btn {
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}
.filter-btn:hover { border-color: var(--border-hover); color: var(--text); }
.filter-btn.active { background: var(--accent); border-color: var(--accent); color: white; }

table { width: 100%; border-collapse: collapse; font-size: 12px; }
th {
  text-align: left;
  padding: 8px 12px;
  color: var(--text-muted);
  font-weight: 500;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}
th:hover { color: var(--text); }
th.sorted-asc::after { content: ' \\2191'; }
th.sorted-desc::after { content: ' \\2193'; }
td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  font-variant-numeric: tabular-nums;
  vertical-align: top;
}
tr:hover td { background: var(--panel-hover); }
.table-link { color: var(--accent); text-decoration: none; font-size: 11px; }
.table-link:hover { text-decoration: underline; }
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
}
.badge-red { background: rgba(239,68,68,0.15); color: var(--red); }
.badge-amber { background: rgba(245,158,11,0.15); color: var(--amber); }
.badge-green { background: rgba(34,197,94,0.15); color: var(--green); }
.badge-gray { background: rgba(139,148,158,0.15); color: var(--text-muted); }
.badge-orange { background: rgba(249,115,22,0.15); color: var(--orange); }

.bar-container {
  width: 100%;
  min-width: 80px;
  height: 8px;
  background: var(--bg);
  border-radius: 4px;
  overflow: hidden;
}
.bar-fill { height: 100%; background: var(--accent); border-radius: 4px; }

.buckets {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  height: 160px;
  padding: 16px 0 0;
}
.bucket {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: 1;
  max-width: 140px;
}
.bucket-label { font-size: 10px; color: var(--text-muted); text-align: center; white-space: nowrap; }
.bucket-bar {
  width: 100%;
  flex: 1;
  background: var(--bg);
  border-radius: 4px;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}
.bucket-fill {
  width: 100%;
  background: linear-gradient(180deg, var(--red), var(--red-dim));
  border-radius: 4px 4px 0 0;
}
.bucket-count { font-size: 14px; font-weight: 600; }

.score-cell { font-weight: 600; font-size: 13px; }
.score-high { color: var(--red); }
.score-med { color: var(--orange); }
.score-low { color: var(--amber); }

.reason-list { display: flex; flex-wrap: wrap; gap: 4px; max-width: 200px; }
.reason-tag {
  font-size: 10px;
  color: var(--text-muted);
  background: var(--bg);
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
}

.search-box {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  width: 220px;
}
.search-box:focus { outline: none; border-color: var(--accent); }

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
}
.pagination button {
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.pagination button:hover { border-color: var(--border-hover); }
.pagination button:disabled { opacity: 0.4; cursor: default; }
.pagination .page-info { color: var(--text-muted); font-size: 12px; }

.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
@media (max-width: 900px) {
  .two-col { grid-template-columns: 1fr; }
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
}
</style>
</head>
<body>

<div class="header">
  <h1>🗑️ XOS — Dashboard Opportunités Déchet</h1>
  <div class="subtitle">Opportunités ouvertes avec CloseDate dépassée — audit hygiène CRM</div>
  <div class="generated">Généré le __GENERATED__</div>
</div>

<div class="kpi-row">
  <div class="kpi-card">
    <div class="kpi-label">Opps Déchet</div>
    <div class="kpi-value red">__TOTAL_DECHET__</div>
    <div class="kpi-sub">sur __TOTAL_OPEN__ ouvertes (__PCT_DECHET__)</div>
  </div>
  <div class="kpi-card">
    <div class="kpi-label">CA à Risque</div>
    <div class="kpi-value amber">__CA_AT_RISK__</div>
    <div class="kpi-sub">montant cumulé des opps déchet</div>
  </div>
  <div class="kpi-card">
    <div class="kpi-label">Sans Activité</div>
    <div class="kpi-value red">__NO_ACTIVITY__</div>
    <div class="kpi-sub">aucune activité jamais enregistrée</div>
  </div>
  <div class="kpi-card">
    <div class="kpi-label">Owners Inactifs</div>
    <div class="kpi-value amber">__INACTIVE_OWNERS__</div>
    <div class="kpi-sub">opps sur anciens commerciaux</div>
  </div>
</div>

<div class="two-col">
  <div class="section">
    <div class="section-header">👥 Répartition par propriétaire</div>
    <div class="section-body">
      <table>
        <thead><tr><th>Propriétaire</th><th>Statut</th><th>Opps</th><th>CA à risque</th></tr></thead>
        <tbody>__OWNER_ROWS__</tbody>
      </table>
    </div>
  </div>
  <div class="section">
    <div class="section-header">📊 Répartition par étape</div>
    <div class="section-body">
      <table>
        <thead><tr><th>Étape</th><th>Opps</th><th>%</th><th></th></tr></thead>
        <tbody>__STAGE_ROWS__</tbody>
      </table>
    </div>
  </div>
</div>

<div class="two-col">
  <div class="section">
    <div class="section-header">⏰ Distribution par ancienneté de retard</div>
    <div class="section-body">
      <div class="buckets">__OVERDUE_BARS__</div>
    </div>
  </div>
  <div class="section">
    <div class="section-header">🏷️ Raisons de classification déchet</div>
    <div class="section-body">
      <table>
        <thead><tr><th>Raison</th><th>Opps</th><th>%</th></tr></thead>
        <tbody>__REASON_ROWS__</tbody>
      </table>
    </div>
  </div>
</div>

<div class="filter-bar">
  <div class="filter-group">
    <span class="filter-label">Owner:</span>
    <button class="filter-btn active" onclick="setOwnerFilter('all')">Tous</button>
    __OWNER_BUTTONS__
  </div>
  <div class="filter-group">
    <span class="filter-label">Recherche:</span>
    <input class="search-box" type="text" placeholder="Nom, compte, étape..." oninput="setSearch(this.value)">
  </div>
</div>

<div class="section">
  <div class="section-header">📋 Liste des opportunités déchet — tri par score de pertinence</div>
  <div class="section-body">
    <table id="main-table">
      <thead>
        <tr>
          <th onclick="sortBy('score')" id="th-score">Score</th>
          <th onclick="sortBy('name')" id="th-name">Opportunité</th>
          <th onclick="sortBy('account')" id="th-account">Compte</th>
          <th onclick="sortBy('owner')" id="th-owner">Propriétaire</th>
          <th onclick="sortBy('stage')" id="th-stage">Étape</th>
          <th onclick="sortBy('close_date')" id="th-close">CloseDate</th>
          <th onclick="sortBy('days_overdue')" id="th-overdue">Retard</th>
          <th onclick="sortBy('amount')" id="th-amount">Montant</th>
          <th onclick="sortBy('probability')" id="th-proba">Proba</th>
          <th onclick="sortBy('days_since_activity')" id="th-activity">Dern. activité</th>
          <th>Raisons</th>
          <th>Lien</th>
        </tr>
      </thead>
      <tbody id="table-body"></tbody>
    </table>
    <div class="pagination">
      <button onclick="prevPage()" id="btn-prev">← Précédent</button>
      <span class="page-info" id="page-info"></span>
      <button onclick="nextPage()" id="btn-next">Suivant →</button>
    </div>
  </div>
</div>

<script>
let ALL_OPPS = [];
let filtered = [];
let currentPage = 1;
const PER_PAGE = 25;
let sortKey = 'score';
let sortDir = 'desc';
let ownerFilter = 'all';
let searchText = '';

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtEuro(v) { return v ? v.toLocaleString('fr-FR') + '€' : '—'; }

function scoreClass(s) {
  if (s >= 30) return 'score-high';
  if (s >= 15) return 'score-med';
  return 'score-low';
}

function activityLabel(days) {
  if (days === 9999) return '<span class="badge badge-red">Jamais</span>';
  if (days > 365) return '<span class="badge badge-red">' + days + 'j</span>';
  if (days > 90) return '<span class="badge badge-orange">' + days + 'j</span>';
  if (days > 30) return '<span class="badge badge-amber">' + days + 'j</span>';
  return '<span class="badge badge-green">' + days + 'j</span>';
}

function overdueLabel(days) {
  if (days > 365) return '<span class="badge badge-red">' + Math.floor(days/365) + 'an</span>';
  if (days > 180) return '<span class="badge badge-red">' + days + 'j</span>';
  if (days > 90) return '<span class="badge badge-orange">' + days + 'j</span>';
  if (days > 30) return '<span class="badge badge-amber">' + days + 'j</span>';
  return '<span class="badge badge-green">' + days + 'j</span>';
}

function activeBadge(active) {
  return active ? '' : ' <span class="badge badge-red">Inactif</span>';
}

function renderTable() {
  const tbody = document.getElementById('table-body');
  const start = (currentPage - 1) * PER_PAGE;
  const end = start + PER_PAGE;
  const pageData = filtered.slice(start, end);

  tbody.innerHTML = pageData.map(function(o) {
    var reasons = o.reasons.map(function(r) {
      return '<span class="reason-tag">' + escapeHtml(r.split('(')[0].trim()) + '</span>';
    }).join('');
    return '<tr>' +
      '<td class="score-cell ' + scoreClass(o.score) + '">' + o.score + '</td>' +
      '<td>' + escapeHtml(o.name) + '</td>' +
      '<td>' + escapeHtml(o.account) + '</td>' +
      '<td>' + escapeHtml(o.owner) + activeBadge(o.owner_active) + '</td>' +
      '<td><span class="badge badge-gray">' + escapeHtml(o.stage) + '</span></td>' +
      '<td>' + (o.close_date || '—') + '</td>' +
      '<td>' + overdueLabel(o.days_overdue) + '</td>' +
      '<td>' + fmtEuro(o.amount) + '</td>' +
      '<td>' + o.probability + '%</td>' +
      '<td>' + activityLabel(o.days_since_activity) + '</td>' +
      '<td><div class="reason-list">' + reasons + '</div></td>' +
      '<td><a href="' + o.sf_link + '" target="_blank" class="table-link">Ouvrir →</a></td>' +
    '</tr>';
  }).join('');

  var totalPages = Math.ceil(filtered.length / PER_PAGE);
  document.getElementById('page-info').textContent = currentPage + ' / ' + (totalPages || 1) + ' (' + filtered.length + ' opps)';
  document.getElementById('btn-prev').disabled = currentPage <= 1;
  document.getElementById('btn-next').disabled = currentPage >= totalPages;

  document.querySelectorAll('th').forEach(function(th) { th.classList.remove('sorted-asc', 'sorted-desc'); });
  var th = document.getElementById('th-' + sortKey);
  if (th) th.classList.add(sortDir === 'desc' ? 'sorted-desc' : 'sorted-asc');
}

function sortBy(key) {
  if (sortKey === key) { sortDir = sortDir === 'desc' ? 'asc' : 'desc'; }
  else { sortKey = key; sortDir = 'desc'; }
  applyFilters();
}

function setOwnerFilter(name) {
  ownerFilter = name;
  document.querySelectorAll('.filter-btn').forEach(function(btn) {
    btn.classList.toggle('active', (name === 'all' && btn.textContent === 'Tous') || btn.textContent === name);
  });
  applyFilters();
}

function setSearch(text) { searchText = text.toLowerCase(); applyFilters(); }

function applyFilters() {
  filtered = ALL_OPPS.filter(function(o) {
    if (ownerFilter !== 'all' && o.owner !== ownerFilter) return false;
    if (searchText) {
      var haystack = (o.name + ' ' + o.account + ' ' + o.owner + ' ' + o.stage + ' ' + (o.type_vente || '')).toLowerCase();
      if (haystack.indexOf(searchText) === -1) return false;
    }
    return true;
  });
  filtered.sort(function(a, b) {
    var va = a[sortKey], vb = b[sortKey];
    if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); return sortDir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb); }
    va = va || 0; vb = vb || 0;
    return sortDir === 'desc' ? vb - va : va - vb;
  });
  currentPage = 1;
  renderTable();
}

function prevPage() { if (currentPage > 1) { currentPage--; renderTable(); } }
function nextPage() { var tp = Math.ceil(filtered.length / PER_PAGE); if (currentPage < tp) { currentPage++; renderTable(); } }

// Load data and render
fetch('dashboard_data.json').then(function(r) { return r.json(); }).then(function(d) {
  ALL_OPPS = d.opps;
  applyFilters();
}).catch(function(e) {
  console.error('Failed to load dashboard_data.json:', e);
  document.getElementById('table-body').innerHTML = '<tr><td colspan="12">Erreur: impossible de charger les données. Servez ce dossier via python3 -m http.server</td></tr>';
});
</script>

</body>
</html>"""

# Replace placeholders
html_content = html_content.replace("__GENERATED__", generated_str)
html_content = html_content.replace("__TOTAL_DECHET__", str(total_dechet))
html_content = html_content.replace("__TOTAL_OPEN__", str(total_open))
html_content = html_content.replace("__PCT_DECHET__", fmt_pct(pct_dechet))
html_content = html_content.replace("__CA_AT_RISK__", fmt_euro(ca_at_risk))
html_content = html_content.replace("__NO_ACTIVITY__", str(no_activity_count))
html_content = html_content.replace("__INACTIVE_OWNERS__", str(inactive_owner_count))
html_content = html_content.replace("__OWNER_ROWS__", owner_rows)
html_content = html_content.replace("__STAGE_ROWS__", stage_rows)
html_content = html_content.replace("__OVERDUE_BARS__", overdue_bars)
html_content = html_content.replace("__REASON_ROWS__", reason_rows)
html_content = html_content.replace("__OWNER_BUTTONS__", owner_buttons)

output_path = "/tmp/xos-dechet/dashboard.html"
with open(output_path, "w") as f:
    f.write(html_content)

print("Dashboard written to " + output_path)
print("  Size: " + str(len(html_content)) + " bytes")
print("  " + str(total_dechet) + " opps embedded in JSON")