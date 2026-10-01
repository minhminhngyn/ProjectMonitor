// ---------- state ----------
const STORE_KEY = 'pm_projects_v1';
let projects = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
let activeProjectId = projects[0] ? projects[0].id : null;
let editingProjectId = null;
let editingTaskId = null;
let teamDraft = [];

function save() { localStorage.setItem(STORE_KEY, JSON.stringify(projects)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function getProject(id) { return projects.find(p => p.id === id); }

// ---------- status/priority pill helpers ----------
function statusSlug(s) { return (s || '').toLowerCase().replace(/\s+/g, '-'); }
function pillHtml(status) { return `<span class="pill pill-${statusSlug(status)}">${status}</span>`; }

// ---------- WBS / level calculation ----------
// Level = number of segments in WBS minus 1 (1.0 -> 0, 1.1 -> 1, 1.1.1 -> 2)
function calcLevel(wbs) {
  if (!wbs) return 0;
  return wbs.split('.').filter(Boolean).length - 1;
}
// sort key: pad each segment so "1.10" sorts after "1.9"
function wbsSortKey(wbs) {
  return wbs.split('.').map(n => n.padStart(4, '0')).join('.');
}
function sortTasks(tasks) {
  return [...tasks].sort((a, b) => wbsSortKey(a.wbs).localeCompare(wbsSortKey(b.wbs)));
}

// ---------- rendering: sidebar ----------
function renderSidebar() {
  const list = document.getElementById('projectList');
  const filterVal = document.getElementById('filterStatus').value;
  const sortVal = document.getElementById('sortProjects').value;
  const prioRank = { High: 0, Medium: 1, Low: 2 };

  let items = [...projects];
  if (filterVal) items = items.filter(p => p.status === filterVal);
  if (sortVal === 'priority') items.sort((a, b) => (prioRank[a.priority] ?? 9) - (prioRank[b.priority] ?? 9));

  if (!items.length) {
    list.innerHTML = `<div style="padding:16px;font-size:.76rem;color:var(--text-3);">No projects found.</div>`;
    return;
  }

  list.innerHTML = items.map(p => `
    <div class="project-item ${p.id === activeProjectId ? 'active' : ''}" data-id="${p.id}">
      <div class="project-item-body">
        <div class="project-item-name">${escapeHtml(p.title)}</div>
        <div class="project-item-meta">${escapeHtml(p.customer)} · ${p.priority}</div>
        <div style="margin-top:4px;">${pillHtml(p.status)}</div>
      </div>
      <div class="project-item-actions">
        <button class="btn-ghost-sm" data-action="edit" title="Edit">✎</button>
        <button class="btn-ghost-sm" data-action="delete" title="Delete">🗑</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.project-item').forEach(el => {
    const id = el.dataset.id;
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      activeProjectId = id;
      renderSidebar();
      renderDetail();
    });
    el.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
      e.stopPropagation();
      openProjectModal(id);
    });
    el.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Delete this project and all its tasks? This cannot be undone.')) {
        projects = projects.filter(p => p.id !== id);
        if (activeProjectId === id) activeProjectId = projects[0] ? projects[0].id : null;
        save();
        renderSidebar();
        renderDetail();
      }
    });
  });
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- rendering: detail ----------
function renderDetail() {
  const panel = document.getElementById('rightPanel');
  const p = getProject(activeProjectId);
  if (!p) {
    panel.innerHTML = `
      <div class="empty">
        <p>No project selected. Create your first project to get started.</p>
        <button class="btn btn-dark" id="btnEmptyNewProject2">+ New Project</button>
      </div>`;
    document.getElementById('btnEmptyNewProject2').addEventListener('click', () => openProjectModal(null));
    return;
  }

  const tasks = sortTasks(p.tasks || []);
  const total = tasks.length;
  const counts = { 'Completed': 0, 'In Progress': 0, 'Not Started': 0, 'On Hold': 0, 'Overdue': 0 };
  tasks.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
  const progress = total ? Math.round((counts['Completed'] / total) * 100) : 0;

  panel.innerHTML = `
    <div class="detail-view">
      <div class="detail-header">
        <div class="detail-header-top">
          <div>
            <div class="detail-name">${escapeHtml(p.title)}</div>
            <div class="detail-customer">${escapeHtml(p.customer)}</div>
            ${p.reference ? `<div class="detail-ref">Ref: ${escapeHtml(p.reference)}</div>` : ''}
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            ${pillHtml(p.status)}
            <button class="btn btn-outline btn-sm" style="color:var(--text-2);border-color:var(--border);" id="btnEditProject">Edit</button>
          </div>
        </div>
        <div class="detail-meta-row">
          <span>Priority: <strong>${p.priority}</strong></span>
          <span>Start: ${p.start || '—'}</span>
          <span>End: ${p.end || '—'}</span>
          <span>Team: ${(p.team || []).join(', ') || '—'}</span>
        </div>
      </div>

      <div class="overview-card">
        <div class="pc-progress-wrap">
          <div class="pc-progress-label"><span>Progress</span><span>${progress}%</span></div>
          <div class="pc-progress-track"><div class="pc-progress-fill" style="width:${progress}%;"></div></div>
        </div>
      </div>

      <div class="detail-stats">
        <div class="detail-stat"><div class="ds-val">${total}</div><div class="ds-lbl">Total Tasks</div></div>
        <div class="detail-stat"><div class="ds-val">${counts['Completed']}</div><div class="ds-lbl">Completed</div></div>
        <div class="detail-stat"><div class="ds-val">${counts['In Progress']}</div><div class="ds-lbl">In Progress</div></div>
        <div class="detail-stat"><div class="ds-val">${counts['Not Started']}</div><div class="ds-lbl">Not Started</div></div>
        <div class="detail-stat"><div class="ds-val">${counts['Overdue']}</div><div class="ds-lbl">Overdue</div></div>
      </div>

      <div class="overview-card">
        <div class="overview-card-header"><h3>Project Overview</h3></div>
        <div class="overview-text ${p.overview ? '' : 'empty'}">${p.overview ? escapeHtml(p.overview) : 'No overview provided.'}</div>
      </div>

      <div class="wbs-card">
        <div class="wbs-toolbar">
          <div class="wbs-toolbar-left">
            <h3>WBS &amp; Gantt</h3>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-outline btn-sm" style="color:var(--text-2);border-color:var(--border);" id="btnImportTasks">Import CSV/Excel</button>
            <button class="btn btn-dark btn-sm" id="btnNewTask">+ New Task</button>
          </div>
        </div>
        <div class="wbs-table-wrap" id="wbsTableWrap"></div>
      </div>
    </div>
  `;

  renderWbsGantt(p);

  document.getElementById('btnEditProject').addEventListener('click', () => openProjectModal(p.id));
  document.getElementById('btnNewTask').addEventListener('click', () => openTaskPanel(null));
  document.getElementById('btnImportTasks').addEventListener('click', () => document.getElementById('importFileInput').click());
}

// ---------- WBS table + Gantt ----------
function dateRangeForProject(p) {
  const dates = [];
  (p.tasks || []).forEach(t => { if (t.start) dates.push(new Date(t.start)); if (t.end) dates.push(new Date(t.end)); });
  if (p.start) dates.push(new Date(p.start));
  if (p.end) dates.push(new Date(p.end));
  if (!dates.length) { const now = new Date(); return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 2, 0)]; }
  let min = new Date(Math.min(...dates)), max = new Date(Math.max(...dates));
  min = new Date(min.getFullYear(), min.getMonth(), 1);
  max = new Date(max.getFullYear(), max.getMonth() + 1, 0);
  return [min, max];
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function fmtDate(d) { return d.toISOString().slice(0, 10); }
function isSameDay(a, b) { return a.toDateString() === b.toDateString(); }

function renderWbsGantt(p) {
  const wrap = document.getElementById('wbsTableWrap');
  const tasks = sortTasks(p.tasks || []);
  if (!tasks.length) {
    wrap.innerHTML = `<div class="empty"><p>No tasks yet. Add a task or import from CSV/Excel.</p></div>`;
    return;
  }

  const [rangeStart, rangeEnd] = dateRangeForProject(p);
  const days = [];
  for (let d = new Date(rangeStart); d <= rangeEnd; d = addDays(d, 1)) days.push(new Date(d));
  const today = new Date();

  // month header grouping
  const monthGroups = [];
  days.forEach((d, i) => {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const last = monthGroups[monthGroups.length - 1];
    if (last && last.key === key) last.span++;
    else monthGroups.push({ key, label: d.toLocaleString(undefined, { month: 'short', year: 'numeric' }), span: 1 });
  });

  const theadMonths = monthGroups.map(g => `<th class="gh-month" colspan="${g.span}">${g.label}</th>`).join('');
  const theadDays = days.map(d => `<th class="gh-week ${isSameDay(d, today) ? 'gh-week-today' : ''}">${d.getDate()}</th>`).join('');

  let rows = '';
  tasks.forEach(t => {
    const level = Number(t.level) || 0;
    const rowClass = level === 0 ? 'tr-group' : (level === 1 ? 'tr-sub' : '');
    const indent = level * 14;
    const depLabel = t.dependency || '';

    let cells = '';
    days.forEach(d => {
      let fill = '';
      if (t.start && t.end) {
        const s = new Date(t.start), e = new Date(t.end);
        if (d >= s && d <= e) fill = `<div class="gantt-bar" style="background:${ganttColor(t.status)};"></div>`;
      }
      cells += `<td class="gc ${isSameDay(d, today) ? 'gc-today' : ''}">${fill}</td>`;
    });

    rows += `
      <tr class="${rowClass}" data-task-id="${t.id}">
        <td>${t.sow}</td>
        <td style="padding-left:${8 + indent}px;">${t.wbs}</td>
        <td>${level}</td>
        <td style="white-space:normal;max-width:220px;">${escapeHtml(t.name)}</td>
        <td>${pillHtml(t.status)}</td>
        <td>${t.start || '—'}</td>
        <td>${t.end || '—'}</td>
        <td>${escapeHtml(t.members) || '—'}</td>
        <td>${escapeHtml(depLabel) || '—'}</td>
        <td style="white-space:normal;max-width:160px;">${escapeHtml(t.note || '')}</td>
        <td>
          <button class="btn-ghost-sm" data-action="edit-task" title="Edit">✎</button>
          <button class="btn-ghost-sm" data-action="delete-task" title="Delete">🗑</button>
        </td>
        ${cells}
      </tr>`;
  });

  wrap.innerHTML = `
    <table class="wbs-table">
      <thead>
        <tr>
          <th rowspan="2">SOW</th>
          <th rowspan="2">WBS</th>
          <th rowspan="2">Level</th>
          <th rowspan="2">Task</th>
          <th rowspan="2">Status</th>
          <th rowspan="2">Start</th>
          <th rowspan="2">End</th>
          <th rowspan="2">Members</th>
          <th rowspan="2">Depends On</th>
          <th rowspan="2">Note</th>
          <th rowspan="2"></th>
          ${theadMonths}
        </tr>
        <tr>${theadDays}</tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-action="edit-task"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('tr').dataset.taskId;
      openTaskPanel(id);
    });
  });
  wrap.querySelectorAll('[data-action="delete-task"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('tr').dataset.taskId;
      if (confirm('Delete this task?')) {
        const proj = getProject(activeProjectId);
        proj.tasks = proj.tasks.filter(t => t.id !== id);
        save();
        renderDetail();
      }
    });
  });
}

function ganttColor(status) {
  const map = {
    'Completed': 'var(--c-completed)',
    'In Progress': 'var(--c-in-progress)',
    'On Hold': 'var(--c-pending)',
    'Overdue': 'var(--c-overdue)',
    'Not Started': 'var(--text-3)',
  };
  return map[status] || 'var(--text-3)';
}

// ---------- project modal ----------
function openProjectModal(id) {
  editingProjectId = id;
  const backdrop = document.getElementById('projectModalBackdrop');
  const p = id ? getProject(id) : null;
  document.getElementById('projectModalTitle').textContent = p ? 'Edit Project' : 'New Project';
  document.getElementById('f-customer').value = p?.customer || '';
  document.getElementById('f-title').value = p?.title || '';
  document.getElementById('f-reference').value = p?.reference || '';
  document.getElementById('f-priority').value = p?.priority || 'Medium';
  document.getElementById('f-status').value = p?.status || 'Planning';
  document.getElementById('f-start').value = p?.start || '';
  document.getElementById('f-end').value = p?.end || '';
  document.getElementById('f-overview').value = p?.overview || '';
  teamDraft = p ? [...(p.team || [])] : [];
  renderTeamChips();
  backdrop.classList.add('open');
}
function closeProjectModal() {
  document.getElementById('projectModalBackdrop').classList.remove('open');
  editingProjectId = null;
}
function renderTeamChips() {
  const wrap = document.getElementById('teamChips');
  wrap.innerHTML = teamDraft.map((m, i) => `<span class="chip">${escapeHtml(m)}<span class="chip-x" data-i="${i}">&times;</span></span>`).join('');
  wrap.querySelectorAll('.chip-x').forEach(x => x.addEventListener('click', () => {
    teamDraft.splice(Number(x.dataset.i), 1);
    renderTeamChips();
  }));
}
function addMemberFromInput() {
  const input = document.getElementById('f-member-input');
  const v = input.value.trim();
  if (v) { teamDraft.push(v); input.value = ''; renderTeamChips(); }
}
function saveProjectForm() {
  const customer = document.getElementById('f-customer').value.trim();
  const title = document.getElementById('f-title').value.trim();
  if (!customer || !title) { alert('Customer and Project Title are required.'); return; }

  const data = {
    customer,
    title,
    reference: document.getElementById('f-reference').value.trim(),
    priority: document.getElementById('f-priority').value,
    status: document.getElementById('f-status').value,
    start: document.getElementById('f-start').value,
    end: document.getElementById('f-end').value,
    team: [...teamDraft],
    overview: document.getElementById('f-overview').value.trim(),
  };

  if (editingProjectId) {
    Object.assign(getProject(editingProjectId), data);
  } else {
    const p = { id: uid(), tasks: [], ...data };
    projects.push(p);
    activeProjectId = p.id;
  }
  save();
  closeProjectModal();
  renderSidebar();
  renderDetail();
}

// ---------- task panel ----------
function openTaskPanel(id) {
  editingTaskId = id;
  const p = getProject(activeProjectId);
  if (!p) return;
  const t = id ? p.tasks.find(x => x.id === id) : null;

  document.getElementById('taskPanelTitle').textContent = t ? 'Edit Task' : 'New Task';
  document.getElementById('t-sow').value = t?.sow || '';
  document.getElementById('t-wbs').value = t?.wbs || '';
  document.getElementById('t-level').value = t?.level ?? '';
  document.getElementById('t-name').value = t?.name || '';
  document.getElementById('t-status').value = t?.status || 'Not Started';
  document.getElementById('t-start').value = t?.start || '';
  document.getElementById('t-end').value = t?.end || '';
  document.getElementById('t-dependency').value = t?.dependency || '';
  document.getElementById('t-note').value = t?.note || '';

  const memSel = document.getElementById('t-members');
  memSel.innerHTML = `<option value="">Unassigned</option>` + (p.team || []).map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
  memSel.value = t?.members || '';

  document.getElementById('taskPanel').classList.add('open');
}
function closeTaskPanel() {
  document.getElementById('taskPanel').classList.remove('open');
  editingTaskId = null;
}
function saveTaskForm() {
  const p = getProject(activeProjectId);
  if (!p) return;
  const sow = document.getElementById('t-sow').value.trim();
  const wbs = document.getElementById('t-wbs').value.trim();
  const levelRaw = document.getElementById('t-level').value.trim();
  const name = document.getElementById('t-name').value.trim();
  if (!sow || !wbs || !name) { alert('SOW Item, WBS and Task Name are required.'); return; }
  if (levelRaw !== '' && !/^\d+$/.test(levelRaw)) { alert('Level must be a whole number (0, 1, 2...).'); return; }

  const data = {
    sow, wbs,
    level: levelRaw === '' ? 0 : Number(levelRaw),
    name,
    status: document.getElementById('t-status').value,
    start: document.getElementById('t-start').value,
    end: document.getElementById('t-end').value,
    members: document.getElementById('t-members').value,
    dependency: document.getElementById('t-dependency').value.trim(),
    note: document.getElementById('t-note').value.trim(),
  };

  if (editingTaskId) {
    Object.assign(p.tasks.find(t => t.id === editingTaskId), data);
  } else {
    p.tasks = p.tasks || [];
    p.tasks.push({ id: uid(), ...data });
  }
  save();
  closeTaskPanel();
  renderDetail();
}

// ---------- CSV / Excel import ----------
// expects columns matching the WBS table: SOW, WBS, Task/Name, Status, Start, End, Dependency, Note
function normalizeHeader(h) { return (h || '').toString().trim().toLowerCase(); }
function mapRowToTask(row) {
  const get = (...keys) => {
    for (const k of Object.keys(row)) {
      if (keys.includes(normalizeHeader(k))) return row[k];
    }
    return '';
  };
  const sow = String(get('sow', 'sow item') || '').trim();
  const wbs = String(get('wbs', 'wbs item') || '').trim();
  const name = String(get('task', 'task name', 'name') || '').trim();
  if (!sow || !wbs || !name) return null;
  const levelRaw = String(get('level') || '').trim();
  return {
    id: uid(),
    sow, wbs,
    level: /^\d+$/.test(levelRaw) ? Number(levelRaw) : calcLevel(wbs),
    name,
    status: String(get('status') || 'Not Started').trim() || 'Not Started',
    start: normalizeDate(get('start', 'planned start', 'planned start date')),
    end: normalizeDate(get('end', 'planned end', 'planned end date')),
    members: String(get('members', 'member', 'assignee') || '').trim(),
    dependency: String(get('dependency', 'depends on', 'task dependency') || '').trim(),
    note: String(get('note', 'action items', 'note/action items') || '').trim(),
  };
}
function normalizeDate(v) {
  if (!v) return '';
  if (v instanceof Date) return fmtDate(v);
  const s = String(v).trim();
  const d = new Date(s);
  return isNaN(d) ? '' : fmtDate(d);
}
function handleImportFile(file) {
  const p = getProject(activeProjectId);
  if (!p) return;
  const ext = file.name.split('.').pop().toLowerCase();

  const applyRows = (rows) => {
    const imported = rows.map(mapRowToTask).filter(Boolean);
    if (!imported.length) { alert('No valid rows found. Expect columns: SOW, WBS, Task, Status, Start, End, Note.'); return; }
    p.tasks = p.tasks || [];
    p.tasks.push(...imported);
    save();
    renderDetail();
  };

  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = (e) => applyRows(parseCsv(e.target.result));
    reader.readAsText(file);
  } else {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      applyRows(rows);
    };
    reader.readAsArrayBuffer(file);
  }
}
function parseCsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.length);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => row[h] = (cells[i] || '').trim());
    return row;
  });
}

// ---------- wiring ----------
document.getElementById('btnNewProject').addEventListener('click', () => openProjectModal(null));
document.getElementById('btnCloseProjectModal').addEventListener('click', closeProjectModal);
document.getElementById('btnCancelProject').addEventListener('click', closeProjectModal);
document.getElementById('btnSaveProject').addEventListener('click', saveProjectForm);
document.getElementById('btnAddMember').addEventListener('click', addMemberFromInput);
document.getElementById('f-member-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addMemberFromInput(); }
});
document.getElementById('projectModalBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'projectModalBackdrop') closeProjectModal();
});

document.getElementById('btnCloseTaskPanel').addEventListener('click', closeTaskPanel);
document.getElementById('btnCancelTask').addEventListener('click', closeTaskPanel);
document.getElementById('btnSaveTask').addEventListener('click', saveTaskForm);

document.getElementById('filterStatus').addEventListener('change', renderSidebar);
document.getElementById('sortProjects').addEventListener('change', renderSidebar);

document.getElementById('importFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleImportFile(file);
  e.target.value = '';
});

document.getElementById('btnExportAll').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(projects, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'projects-export.json'; a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btnEmptyNewProject').addEventListener('click', () => openProjectModal(null));

// ---------- init ----------
renderSidebar();
renderDetail();
