// Workbench surfaces around the chat: starters, command palette, Changes and
// Project knowledge panels, Stats and Archive pages. Data comes from the
// controller; these views never decide approvals or run anything by themselves.
export function createWorkbench({ S, h, fill, api, toast, guard, t, icon, md, diffPre, ago, fmtTime, actions }) {
  const W = { diffs: new Map(), expanded: new Set(), notes: null, notesProject: null, notesTimer: null, knowledgeTab: 'notes', plans: null, todo: '', stats: null, statsLoading: false, statsTicket: 0, statsDays: 7, statsScope: 'all', archiveQuery: '' };
  const n = v => Number(v || 0).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'it-IT');

  // ---- starters: prompts that fill the composer; Bitcoin ones open the real views ----
  const STARTERS = [
    ['wb_stExplore', () => actions.draft(t('wb_stExplorePrompt'))],
    ['wb_stCatchUp', () => actions.draft(t('wb_stCatchUpPrompt'))],
    ['wb_stPlan', () => actions.draft('/plan ')],
    ['wb_stDebug', () => actions.draft(t('wb_stDebugPrompt'))],
    ['wb_stReview', () => actions.draft(t('wb_stReviewPrompt'))],
    ['wb_stWallet', () => actions.view('bitcoin')],
    ['wb_stRgb', () => actions.draft('/profile rgb')]
  ];
  const starters = () => h('div', { class: 'starters' }, STARTERS.map(([key, run]) => h('button', { class: 'starter', type: 'button', onClick: run }, t(key))));

  // ---- command palette (Ctrl+P): actions, projects, chats and slash commands ----
  function paletteItems() {
    const views = [['wb_newChat', 'compose', actions.newChat], ['openFolder', 'folderPlus', actions.openFolder], ['bitcoin', 'bitcoin', () => actions.view('bitcoin')],
      ['activity', 'activity', () => actions.view('activity')], ['wb_stats', 'chart', () => actions.view('stats')], ['wb_archive', 'archive', () => actions.view('archive')],
      ['wb_issues', 'activity', () => actions.view('issues')], ['wb_remote', 'remote', () => actions.view('remote')], ['wb_miniChat', 'compose', () => api('window.miniChat', { projectId: S.projectId || undefined })], ['wb_schedules', 'clock', () => actions.view('schedules')], ['wb_integrations', 'plug', () => actions.view('integrations')], ['wb_multirun', 'chart', () => openMultirun().catch(e => toast(e.message, true))],
      ['settings', 'settings', () => actions.view('settings')], ['scTitle', 'more', actions.shortcuts]];
    const panels = S.projectId ? ['files', 'git', 'changes', 'knowledge', 'terminal', 'agent'].map(k => ({ group: t('wb_panels'), label: actions.panelLabel(k), ic: 'sidebar', run: () => actions.panel(k) })) : [];
    return [
      ...views.map(([key, ic, run]) => ({ group: t('wb_actions'), label: t(key), ic, run })),
      ...panels,
      ...S.projects.map(p => ({ group: t('projects'), label: p.name, hint: p.root, ic: 'folder', run: () => actions.project(p.projectId) })),
      ...S.sessions.map(s => ({ group: s.archived ? t('wb_archive') : t('wb_chats'), label: s.name, hint: `${S.projects.find(p => p.projectId === s.projectId)?.name || ''} · ${ago(s.updatedAt)}`, ic: s.archived ? 'archive' : 'compose', run: () => actions.session(s.sessionId) })),
      ...(S.projectId ? S.commands.filter(c => c.scope !== 'cli').map(c => ({ group: t('wb_commands'), label: `/${c.name}`, hint: c.hint, ic: 'more', run: () => actions.draft(c.args ? `/${c.name} ` : `/${c.name}`) })) : [])
    ];
  }
  const matches = (item, q) => q.split(/\s+/).every(w => `${item.label} ${item.hint || ''} ${item.group}`.toLowerCase().includes(w));
  async function openPalette() {
    if (document.querySelector('dialog.palette')) return;
    const files = S.projectId ? await api('fs.files', { projectId: S.projectId }).catch(() => []) : [];
    const all = [...paletteItems(), ...files.map(f => ({ group: t('files'), label: f.split('/').pop(), hint: f, ic: 'folder', run: () => actions.openFile(f) }))];
    let shown = all.slice(0, 60), index = 0;
    const list = h('div', { class: 'plist', role: 'listbox' });
    const draw = () => {
      let group = null;
      fill(list, shown.length ? shown.map((it, i) => [it.group !== group ? h('div', { class: 'pgroup-l' }, (group = it.group)) : null,
        h('div', { class: `pitem${i === index ? ' on' : ''}`, role: 'option', 'aria-selected': i === index ? 'true' : 'false', onMousedown: e => { e.preventDefault(); choose(i); } },
          icon(it.ic, { size: 15 }), h('span', { class: 'plabel' }, it.label), it.hint ? h('span', { class: 'phint' }, it.hint) : null)]) : h('div', { class: 'status' }, t('none')));
      list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
    };
    const input = h('input', { type: 'text', class: 'pinput', placeholder: t('wb_palettePh'), 'aria-label': t('wb_palettePh'),
      onInput: e => { const q = e.target.value.trim().toLowerCase(); shown = (q ? all.filter(it => matches(it, q)) : all).slice(0, 60); index = 0; draw(); },
      onKeydown: e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (shown.length) index = (index + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; draw(); }
        if (e.key === 'Enter') { e.preventDefault(); choose(index); }
      } });
    const dialog = h('dialog', { class: 'palette', 'aria-label': t('wb_palette') }, input, list, h('div', { class: 'pfoot' }, t('wb_paletteFoot')));
    const choose = i => { const it = shown[i]; if (!it) return; dialog.close(); guard(async () => it.run())(); };
    dialog.addEventListener('close', () => dialog.remove()); document.body.append(dialog); dialog.showModal(); draw(); input.focus();
  }

  // ---- Changes panel: every uncommitted file with its diff, expandable in place ----
  const diffStat = text => { let add = 0, del = 0; for (const l of String(text || '').split('\n')) { if (l.startsWith('+') && !l.startsWith('+++')) add++; else if (l.startsWith('-') && !l.startsWith('---')) del++; } return { add, del }; };
  const isStaged = f => f.index !== ' ' && f.index !== '?';
  async function loadDiff(f) {
    const key = `${S.projectId}:${f.path}`;
    if (!W.diffs.has(key)) W.diffs.set(key, (await api('git.diff', { projectId: S.projectId, path: f.path, staged: isStaged(f) })) || '');
    return W.diffs.get(key);
  }
  function changesPane(rerender) {
    const g = S.git;
    if (!g) return h('div', { class: 'status' }, '…');
    if (!g.repo) return h('div', { class: 'status' }, t('notRepo'));
    const files = g.files.slice(0, 300);
    const toggle = guard(async f => { const key = `${S.projectId}:${f.path}`; if (W.expanded.has(key)) W.expanded.delete(key); else { W.expanded.add(key); await loadDiff(f); } rerender(); });
    return h('div', { class: 'changes' },
      h('div', { class: 'row', style: 'margin-bottom:10px' }, h('span', { class: 'chip' }, `${t('wb_changed')}: ${files.length}`), h('span', { style: 'flex:1' }),
        files.length ? h('button', { class: 'btn sm ghost', onClick: guard(async () => { const all = files.every(f => W.expanded.has(`${S.projectId}:${f.path}`)); for (const f of files) { const k = `${S.projectId}:${f.path}`; if (all) W.expanded.delete(k); else { W.expanded.add(k); await loadDiff(f); } } rerender(); }) }, t('wb_expandAll')) : null,
        files.length ? h('button', { class: 'btn sm', onClick: () => actions.draft(t('wb_stReviewPrompt')) }, t('wb_stReview')) : null,
        files.length ? h('button', { class: 'btn sm', title: t('wb_walkHint'), onClick: () => walkthrough() }, t('wb_walkthrough')) : null,
        h('button', { class: 'btn sm ghost', title: '↻', onClick: guard(async () => { W.diffs.clear(); await actions.refreshGit(); rerender(); }) }, '↻')),
      files.length ? files.map(f => {
        const key = `${S.projectId}:${f.path}`, open = W.expanded.has(key), text = W.diffs.get(key), st = text != null ? diffStat(text) : null;
        return h('div', { class: `chg${open ? ' open' : ''}` },
          h('button', { class: 'chghead', onClick: () => toggle(f) }, icon(open ? 'chevronDown' : 'chevronRight', { size: 12 }),
            h('span', { class: 'st mono' }, `${f.index}${f.worktree}`.trim()), h('span', { class: 'p mono' }, f.path),
            st ? h('span', { class: 'num delta' }, h('span', { class: 'add' }, `+${st.add}`), ' ', h('span', { class: 'del' }, `−${st.del}`)) : null),
          open ? h('div', { class: 'chgbody' }, text ? diffPre(text) : h('div', { class: 'status' }, t('wb_noTextDiff'))) : null);
      }) : h('p', { class: 'status' }, t('wb_clean')));
  }

  // ---- Project knowledge: notes and to-dos kept per project, plans saved by /plan ----
  async function ensureKnowledge(rerender) {
    if (W.notesProject === S.projectId) return;
    const projectId = W.notesProject = S.projectId; W.notes = null; W.plans = null;
    try {
      const [notes, plans] = await Promise.all([api('notes.get', { projectId }), api('plans.list', { projectId })]);
      if (W.notesProject === projectId) { W.notes = notes; W.plans = plans; rerender(); }
    } catch (e) { if (W.notesProject === projectId) W.notesProject = null; throw e; }
  }
  const saveNotes = () => { clearTimeout(W.notesTimer); const projectId = W.notesProject, notes = W.notes; W.notesTimer = setTimeout(() => api('notes.set', { projectId, ...notes }).catch(e => toast(e.message, true)), 500); };
  function showPlan(plan) {
    const dialog = h('dialog', { class: 'sat-info plan', 'aria-label': plan.title },
      h('div', { class: 'row' }, h('h2', {}, plan.title), h('span', { class: 'spacer' }), h('button', { class: 'btn sm', onClick: () => { dialog.close(); actions.draft('/build'); } }, '/build'),
        h('button', { class: 'iconbtn', autofocus: true, onClick: () => dialog.close(), 'aria-label': t('close') }, '×')),
      h('div', { class: 'planbody' }, md(plan.text)));
    dialog.addEventListener('close', () => dialog.remove()); document.body.append(dialog); dialog.showModal();
  }
  function knowledgePane(rerender) {
    ensureKnowledge(rerender).catch(e => toast(e.message, true));
    const tabs = [['notes', `${t('wb_notes')}`], ['todo', `${t('wb_todo')} ${W.notes ? W.notes.todos.filter(x => !x.done).length : ''}`], ['plans', `${t('wb_plans')} ${W.plans ? W.plans.length : ''}`]];
    const head = h('div', { class: 'ktabs' }, tabs.map(([k, label]) => h('button', { class: `ptab${W.knowledgeTab === k ? ' on' : ''}`, onClick: () => { W.knowledgeTab = k; rerender(); } }, label)));
    if (!W.notes) return h('div', { class: 'knowledge' }, head, h('div', { class: 'status' }, '…'));
    let body;
    if (W.knowledgeTab === 'notes') body = h('textarea', { class: 'knotes', placeholder: t('wb_notesPh'), 'aria-label': t('wb_notes'), onInput: e => { W.notes.text = e.target.value; saveNotes(); } }, W.notes.text);
    else if (W.knowledgeTab === 'todo') {
      const add = () => { const text = W.todo.trim(); if (!text) return; W.notes.todos.push({ id: crypto.randomUUID(), text, done: false }); W.todo = ''; saveNotes(); rerender(); };
      body = h('div', { class: 'ktodo' },
        h('div', { class: 'row' }, h('input', { type: 'text', placeholder: t('wb_todoPh'), value: W.todo, onInput: e => { W.todo = e.target.value; }, onKeydown: e => { if (e.key === 'Enter') add(); } }), h('button', { class: 'btn sm', onClick: add }, t('wb_add'))),
        W.notes.todos.length ? W.notes.todos.map(x => h('div', { class: `todo${x.done ? ' done' : ''}` },
          h('input', { type: 'checkbox', checked: x.done, 'aria-label': x.text, onChange: e => { x.done = e.target.checked; saveNotes(); rerender(); } }), h('span', { class: 'ttext' }, x.text),
          h('button', { class: 'ibtn sm', title: t('wb_sendToChat'), 'aria-label': t('wb_sendToChat'), onClick: () => actions.draft(x.text) }, icon('compose', { size: 14 })),
          h('button', { class: 'ibtn sm', title: t('delete'), 'aria-label': t('delete'), onClick: () => { W.notes.todos = W.notes.todos.filter(y => y !== x); saveNotes(); rerender(); } }, icon('trash', { size: 14 })))) : h('p', { class: 'status' }, t('wb_todoEmpty')));
    } else body = W.plans.length ? h('div', { class: 'kplans' }, W.plans.map(p => h('button', { class: 'kplan', onClick: () => showPlan(p) }, h('span', { class: 'plabel' }, p.title), h('span', { class: 'phint num' }, ago(p.at)))))
      : h('p', { class: 'status' }, t('wb_plansEmpty'));
    return h('div', { class: 'knowledge' }, head, body);
  }

  // ---- Git extras: branches, sync with the remote, history and stashes ----
  const G = { project: null, branches: null, log: null, stashes: null, tab: 'changes', busy: null, newBranch: '', stashMsg: '' };
  async function loadGit(rerender, force = false) {
    if (!force && G.project === S.projectId && G.branches) return;
    const projectId = G.project = S.projectId;
    const [branches, log, stashes] = await Promise.all([api('git.branches', { projectId }), api('git.log', { projectId, limit: 100 }), api('git.stashes', { projectId })]);
    if (G.project === projectId) { Object.assign(G, { branches, log, stashes }); rerender(); }
  }
  const gitAction = (rerender, label, fn) => guard(async () => {
    G.busy = label; rerender();
    try { const r = await fn(); if (r?.output) toast(r.output.trim().split('\n').slice(-1)[0] || label); await actions.refreshGit(); await loadGit(rerender, true); }
    finally { G.busy = null; rerender(); }
  });
  function gitTools(rerender) {
    if (!S.git?.repo) return null;
    loadGit(rerender).catch(e => toast(e.message, true));
    const b = G.branches, projectId = S.projectId;
    const sync = b?.upstream ? `${b.upstream} · ↑${b.ahead} ↓${b.behind}` : t('wb_noUpstream');
    const branchSel = h('select', { 'aria-label': t('wb_branch'), disabled: !!G.busy, onChange: e => gitAction(rerender, t('wb_switch'), () => api('git.checkout', { projectId, branch: e.target.value }))() },
      (b?.branches || []).map(x => h('option', { value: x.name, selected: x.name === b.current }, x.name)), b && !b.current ? h('option', { selected: true, disabled: true }, 'HEAD') : null);
    const head = h('div', { class: 'gittools' },
      h('div', { class: 'row' }, branchSel, h('span', { class: 'status num' }, sync), h('span', { style: 'flex:1' }),
        ['fetch', 'pull', 'push'].map(a => h('button', { class: 'btn sm', disabled: !!G.busy, title: t(`wb_${a}Hint`), onClick: gitAction(rerender, a, async () => { if (a === 'push' && !confirm(t('wb_pushConfirm'))) return null; return api('git.remote', { projectId, action: a }); }) }, G.busy === a ? '…' : t(`wb_${a}`)))),
      h('div', { class: 'row' }, h('input', { type: 'text', placeholder: t('wb_newBranchPh'), value: G.newBranch, onInput: e => { G.newBranch = e.target.value; } }),
        h('button', { class: 'btn sm', disabled: !!G.busy, onClick: gitAction(rerender, t('wb_create'), async () => { const name = G.newBranch.trim(); if (!name) return null; await api('git.checkout', { projectId, branch: name, create: true }); G.newBranch = ''; return null; }) }, t('wb_createBranch'))),
      h('div', { class: 'ktabs' }, [['changes', t('wb_changesTab')], ['history', t('wb_history')], ['stash', `${t('wb_stash')} ${G.stashes?.length || ''}`]].map(([k, label]) => h('button', { class: `ptab${G.tab === k ? ' on' : ''}`, onClick: () => { G.tab = k; rerender(); } }, label))));
    let body = null;
    if (G.tab === 'history') body = G.log ? (G.log.length ? h('div', { class: 'glog' }, G.log.map(c => h('button', { class: 'gcommit', title: c.hash, onClick: guard(async () => actions.showText(`${c.short} · ${c.subject}`, await api('git.show', { projectId, hash: c.hash }))) },
      h('span', { class: 'mono h' }, c.short), h('span', { class: 'sub' }, c.subject), c.refs ? h('span', { class: 'chip' }, c.refs.split(',')[0]) : null, h('span', { class: 'phint num' }, `${c.author} · ${ago(c.at)}`)))) : h('p', { class: 'status' }, t('none'))) : h('div', { class: 'status' }, '…');
    else if (G.tab === 'stash') body = h('div', { class: 'ktodo' },
      h('div', { class: 'row' }, h('input', { type: 'text', placeholder: t('wb_stashPh'), value: G.stashMsg, onInput: e => { G.stashMsg = e.target.value; } }),
        h('button', { class: 'btn sm', disabled: !!G.busy || !S.git.files.length, onClick: gitAction(rerender, t('wb_stash'), async () => { await api('git.stash', { projectId, action: 'push', message: G.stashMsg.trim() || undefined }); G.stashMsg = ''; return null; }) }, t('wb_stashSave'))),
      (G.stashes || []).length ? G.stashes.map(x => h('div', { class: 'todo' }, h('span', { class: 'mono' }, x.ref), h('span', { class: 'ttext' }, x.message), h('span', { class: 'phint num' }, ago(x.at)),
        h('button', { class: 'btn sm', onClick: gitAction(rerender, 'pop', () => api('git.stash', { projectId, action: 'pop', ref: x.ref })) }, t('wb_stashPop')),
        h('button', { class: 'btn sm danger', onClick: gitAction(rerender, 'drop', async () => { if (!confirm(`${t('wb_stashDrop')} ${x.ref}?`)) return null; return api('git.stash', { projectId, action: 'drop', ref: x.ref }); }) }, t('wb_stashDrop')))) : h('p', { class: 'status' }, t('wb_stashEmpty')));
    return { head, body, tab: G.tab };
  }

  // ---- Stats page: totals per period from the persistent run ledger ----
  async function loadStats(rerender) {
    const ticket = ++W.statsTicket; W.stats = null; W.statsLoading = true;
    try { const stats = await api('usage.stats', { days: W.statsDays, projectId: W.statsScope === 'project' ? S.projectId || undefined : undefined }); if (ticket === W.statsTicket) W.stats = stats; }
    finally { if (ticket === W.statsTicket) { W.statsLoading = false; rerender(); } }
  }
  const reloadStats = rerender => { loadStats(rerender).catch(e => toast(e.message, true)); rerender(); };
  function statsPage(rerender) {
    if (!W.stats && !W.statsLoading) loadStats(rerender).catch(e => toast(e.message, true));
    const st = W.stats, projectName = id => S.projects.find(p => p.projectId === id)?.name || id;
    const periods = [[1, 'wb_d1'], [7, 'wb_d7'], [30, 'wb_d30'], [90, 'wb_d90'], [0, 'wb_dAll']];
    const seg = h('div', { class: 'seg' }, periods.map(([d, key]) => h('button', { class: W.statsDays === d ? 'on' : '', onClick: () => { W.statsDays = d; reloadStats(rerender); } }, t(key))));
    const scope = h('select', { 'aria-label': t('project'), onChange: e => { W.statsScope = e.target.value; reloadStats(rerender); } },
      h('option', { value: 'all', selected: W.statsScope === 'all' }, t('wb_allProjects')), S.projectId ? h('option', { value: 'project', selected: W.statsScope === 'project' }, S.projects.find(p => p.projectId === S.projectId)?.name) : null);
    if (!st) return h('div', { class: 'page' }, h('h1', {}, t('wb_stats')), h('div', { class: 'row' }, seg, scope), h('p', { class: 'status' }, '…'));
    const max = Math.max(1, ...st.byDay.map(d => d.inputTokens + d.outputTokens));
    const table = (rows, label) => h('table', { class: 'list' }, h('tr', {}, h('th', {}, label), h('th', {}, t('runs')), h('th', {}, t('wb_tokIn')), h('th', {}, t('wb_tokOut')), h('th', {}, t('wb_errors'))),
      rows.map(r => h('tr', {}, h('td', { class: 'num' }, r.label), h('td', { class: 'num' }, n(r.runs)), h('td', { class: 'num' }, n(r.inputTokens)), h('td', { class: 'num' }, n(r.outputTokens)), h('td', { class: 'num' }, n(r.errors)))));
    return h('div', { class: 'page' }, h('h1', {}, t('wb_stats')), h('p', { class: 'lead' }, t('wb_statsLead')), h('div', { class: 'row' }, seg, scope),
      st.total.runs ? [
        h('div', { class: 'stats', style: 'margin-top:20px' },
          [[n(st.total.runs), t('runs')], [n(st.total.inputTokens + st.total.outputTokens), t('tokens')], [n(st.total.errors), t('wb_errors')], [`${Math.round(st.durationMs / 60000)} min`, t('wb_duration')]]
            .map(([v, l]) => h('div', { class: 'card stat' }, h('div', { class: 'n num' }, v), h('div', { class: 'l' }, l)))),
        h('div', { class: 'section' }, t('wb_perDay')),
        h('div', { class: 'bars' }, st.byDay.map(d => h('div', { class: 'sbar', title: `${d.key} · ${n(d.inputTokens + d.outputTokens)} ${t('tokens')} · ${d.runs} ${t('runs')}` },
          h('div', { class: 'fill', style: `height:${Math.max(4, Math.round((d.inputTokens + d.outputTokens) / max * 100))}%` }), h('span', { class: 'num' }, d.key.slice(5))))),
        h('div', { class: 'section' }, t('wb_perModel')), table(st.byModel.map(r => ({ ...r, label: r.key })), t('model')),
        W.statsScope === 'all' ? [h('div', { class: 'section' }, t('wb_perProject')), table(st.byProject.map(r => ({ ...r, label: projectName(r.key) })), t('project'))] : null
      ] : h('div', { class: 'empty-state' }, h('p', {}, t('wb_statsEmpty'))));
  }

  // ---- Archive page: archived chats stay out of the sidebar until restored ----
  function archivePage(rerender) {
    const q = W.archiveQuery.trim().toLowerCase();
    const rows = S.sessions.filter(s => s.archived && (!q || s.name.toLowerCase().includes(q)));
    const restore = guard(async s => { await api('session.update', { sessionId: s.sessionId, archived: false }); await actions.reloadSessions(); rerender(); });
    return h('div', { class: 'page' }, h('h1', {}, t('wb_archive')), h('p', { class: 'lead' }, t('wb_archiveLead')),
      h('input', { type: 'text', class: 'asearch', placeholder: t('searchChats'), value: W.archiveQuery, onInput: e => { W.archiveQuery = e.target.value; const pos = e.target.selectionStart; rerender(); const i = document.querySelector('.asearch'); i?.focus(); i?.setSelectionRange(pos, pos); } }),
      rows.length ? h('table', { class: 'list', style: 'margin-top:16px' }, rows.map(s => h('tr', {},
        h('td', {}, s.name), h('td', {}, S.projects.find(p => p.projectId === s.projectId)?.name || ''), h('td', { class: 'num' }, ago(s.updatedAt)),
        h('td', { class: 'num' }, s.keep ? `★ ${t('kept')}` : `${t('expiresIn')} ${fmtTime(s.expiresAt)}`),
        h('td', {}, h('div', { class: 'row' }, h('button', { class: 'btn sm', onClick: () => actions.session(s.sessionId) }, t('open')), h('button', { class: 'btn sm primary', onClick: () => restore(s) }, t('wb_restore')))))))
        : h('p', { class: 'status', style: 'margin-top:16px' }, t('wb_archiveEmpty')));
  }

  // ---- dialogs shared by the pages below ----
  const dialogOf = (title, ...body) => {
    const dialog = h('dialog', { class: 'sat-info plan', 'aria-label': title },
      h('div', { class: 'row' }, h('h2', {}, title), h('span', { class: 'spacer' }), h('button', { class: 'iconbtn', autofocus: true, onClick: () => dialog.close(), 'aria-label': t('close') }, '×')), ...body);
    dialog.addEventListener('close', () => dialog.remove()); document.body.append(dialog); dialog.showModal(); return dialog;
  };

  // ---- Walkthrough: an on-demand guided reading of the uncommitted changes (one model call) ----
  const walkthrough = guard(async () => {
    if (!confirm(t('wb_walkConfirm'))) return;
    toast(t('wb_walkRunning'));
    const r = await api('review.walkthrough', { projectId: S.projectId, lang: document.documentElement.lang });
    if (!r.text) return toast(t('wb_clean'));
    dialogOf(`${t('wb_walkthrough')} · ${r.files} file`, h('div', { class: 'planbody' }, md(r.text)));
  });

  // ---- Session goal: kept on the chat and added to every run's instructions ----
  function editGoal(session, done) {
    const area = h('textarea', { class: 'knotes', rows: 5, placeholder: t('wb_goalPh') }, session.goal || '');
    const d = dialogOf(t('wb_goal'), h('p', { class: 'status' }, t('wb_goalHint')), area,
      h('div', { class: 'row', style: 'margin-top:10px' }, session.goal ? h('button', { class: 'btn sm ghost', onClick: guard(async () => { done(await api('session.update', { sessionId: session.sessionId, goal: '' })); d.close(); }) }, t('wb_goalClear')) : null,
        h('span', { style: 'flex:1' }), h('button', { class: 'btn primary', onClick: guard(async () => { done(await api('session.update', { sessionId: session.sessionId, goal: area.value })); d.close(); }) }, t('save'))));
    area.focus();
  }

  // ---- Multirun: the same prompt in parallel chats, one per model, compared side by side ----
  const MR = { groups: [], current: null };
  async function openMultirun() {
    if (!S.projectId) return toast(t('wb_openProjectFirst'), true);
    const data = await api('models.available').catch(() => null);
    const specs = [...new Set([...(data?.local || []).flatMap(p => (p.models || []).map(m => m.spec)), ...(data?.cloud || []).filter(c => c.hasKey && c.spec).map(c => c.spec)])].filter(Boolean);
    const prompt = h('textarea', { class: 'knotes', rows: 4, placeholder: t('wb_mrPromptPh') }, S.draft || '');
    const picks = specs.slice(0, 40).map(spec => h('label', { class: 'mrpick' }, h('input', { type: 'checkbox', value: spec }), h('span', { class: 'mono' }, spec)));
    const d = dialogOf(t('wb_multirun'), h('p', { class: 'status' }, t('wb_mrHint')), prompt, h('div', { class: 'mrpicks' }, picks.length ? picks : h('p', { class: 'status' }, t('none'))),
      h('div', { class: 'row', style: 'margin-top:10px' }, h('span', { style: 'flex:1' }), h('button', { class: 'btn primary', onClick: guard(async () => {
        const chosen = picks.map(l => l.querySelector('input')).filter(i => i.checked).map(i => i.value).slice(0, 4), text = prompt.value.trim();
        if (!text || chosen.length < 2) return toast(t('wb_mrPickTwo'), true);
        const group = { id: crypto.randomUUID(), prompt: text, sessions: [] };
        for (const spec of chosen) {
          const meta = await api('session.create', { projectId: S.projectId, name: `⚖ ${spec.split('/').pop()} · ${text.slice(0, 40)}`, model: spec, mode: 'manual' });
          await api('chat.submit', { sessionId: meta.sessionId, text });
          group.sessions.push({ sessionId: meta.sessionId, model: spec });
        }
        MR.groups.unshift(group); MR.current = group.id; d.close(); await actions.reloadSessions(); actions.view('multirun');
      }) }, t('wb_mrStart'))));
    prompt.focus();
  }
  function multirunPage(rerender) {
    const g = MR.groups.find(x => x.id === MR.current) || MR.groups[0];
    if (!g) return h('div', { class: 'page' }, h('h1', {}, t('wb_multirun')), h('p', { class: 'lead' }, t('wb_mrHint')), h('button', { class: 'btn primary', onClick: () => openMultirun().catch(e => toast(e.message, true)) }, t('wb_mrNew')));
    if (!g.loaded) { g.loaded = true; Promise.all(g.sessions.map(async x => { x.open = await api('session.open', { sessionId: x.sessionId }).catch(() => null); })).then(rerender); }
    const run = sid => [...S.runs.values()].find(r => r.sessionId === sid && !r.endedAt);
    return h('div', { class: 'page' }, h('div', { class: 'row' }, h('h1', {}, t('wb_multirun')), h('span', { class: 'spacer' }),
        MR.groups.length > 1 ? h('select', { onChange: e => { MR.current = e.target.value; rerender(); } }, MR.groups.map(x => h('option', { value: x.id, selected: x === g }, x.prompt.slice(0, 50)))) : null,
        h('button', { class: 'btn sm', onClick: () => { g.loaded = false; rerender(); } }, '↻'), h('button', { class: 'btn sm primary', onClick: () => openMultirun().catch(e => toast(e.message, true)) }, t('wb_mrNew'))),
      h('p', { class: 'lead' }, g.prompt),
      h('div', { class: 'mrgrid' }, g.sessions.map(x => {
        const answer = [...(x.open?.messages || [])].reverse().find(m => m.role === 'assistant' && m.content);
        const r = run(x.sessionId), done = [...S.runs.values()].filter(y => y.sessionId === x.sessionId && y.endedAt).pop();
        return h('div', { class: 'card mrcol' }, h('div', { class: 'row' }, h('span', { class: 'mono' }, x.model), h('span', { class: 'spacer' }),
            r ? h('span', { class: 'chip warn' }, t(`run_${r.state}`)) : done ? h('span', { class: `chip ${done.state === 'success' ? 'ok' : 'err'}` }, `${t(`run_${done.state}`)} · ${(done.usage.inputTokens + done.usage.outputTokens).toLocaleString()} tok`) : null),
          h('div', { class: 'mrbody' }, answer ? md(answer.content) : h('p', { class: 'status' }, r ? '…' : t('none'))),
          h('button', { class: 'btn sm', onClick: () => actions.session(x.sessionId) }, t('open')));
      })));
  }
  const multirunChanged = sessionId => MR.groups.some(g => g.sessions.some(x => x.sessionId === sessionId) && (g.loaded = false, true));

  // ---- Scheduled tasks ----
  const SC = { list: null, form: null };
  const loadSchedules = async rerender => { SC.list = await api('schedule.list'); rerender(); };
  function schedulesPage(rerender) {
    if (!SC.list) { SC.list = []; loadSchedules(rerender).catch(e => toast(e.message, true)); }
    const days = t('wb_weekdays').split(',');
    const f = SC.form;
    const save = guard(async () => { await api('schedule.save', f); SC.form = null; await loadSchedules(rerender); toast(t('wb_saved')); });
    const form = f ? h('div', { class: 'card form', style: 'margin-top:16px' },
      h('label', {}, t('wb_name')), h('input', { type: 'text', value: f.name || '', onInput: e => { f.name = e.target.value; } }),
      h('label', {}, t('project')), h('select', { onChange: e => { f.projectId = e.target.value; } }, S.projects.map(p => h('option', { value: p.projectId, selected: p.projectId === f.projectId }, p.name))),
      h('label', {}, t('prompt')), h('textarea', { class: 'knotes', rows: 4, onInput: e => { f.prompt = e.target.value; } }, f.prompt || ''),
      h('label', {}, t('wb_every')), h('select', { onChange: e => { f.every = e.target.value; rerender(); } }, ['hourly', 'daily', 'weekly'].map(v => h('option', { value: v, selected: f.every === v }, t(`wb_${v}`)))),
      f.every === 'weekly' ? [h('label', {}, t('wb_weekday')), h('select', { onChange: e => { f.weekday = Number(e.target.value); } }, days.map((d, i) => h('option', { value: i, selected: f.weekday === i }, d)))] : null,
      h('label', {}, f.every === 'hourly' ? t('wb_minute') : t('wb_time')), h('input', { type: 'text', value: f.at || '09:00', placeholder: 'HH:MM', onInput: e => { f.at = e.target.value; } }),
      h('label', {}), h('div', { class: 'row' }, h('button', { class: 'btn primary', onClick: save }, t('save')), h('button', { class: 'btn ghost', onClick: () => { SC.form = null; rerender(); } }, t('cancel')))) : null;
    return h('div', { class: 'page' }, h('div', { class: 'row' }, h('h1', {}, t('wb_schedules')), h('span', { class: 'spacer' }),
        S.projects.length ? h('button', { class: 'btn primary', onClick: () => { SC.form = { projectId: S.projectId || S.projects[0].projectId, every: 'daily', at: '09:00', weekday: 1, enabled: true }; rerender(); } }, t('wb_newTask')) : null),
      h('p', { class: 'lead' }, t('wb_schedulesLead')), form,
      SC.list.length ? h('table', { class: 'list', style: 'margin-top:16px' }, SC.list.map(x => h('tr', {},
        h('td', {}, h('input', { type: 'checkbox', checked: x.enabled, 'aria-label': t('wb_enabled'), onChange: guard(async e => { await api('schedule.save', { ...x, enabled: e.target.checked }); await loadSchedules(rerender); }) })),
        h('td', {}, x.name), h('td', {}, S.projects.find(p => p.projectId === x.projectId)?.name || '—'),
        h('td', { class: 'num' }, `${t(`wb_${x.every}`)}${x.every === 'weekly' ? ` · ${days[x.weekday]}` : ''} · ${x.at}`),
        h('td', { class: 'num' }, x.nextRunAt ? fmtTime(x.nextRunAt) : '—'),
        h('td', {}, h('div', { class: 'row' },
          h('button', { class: 'btn sm', onClick: guard(async () => { const r = await api('schedule.runNow', { id: x.id }); await actions.reloadSessions(); await loadSchedules(rerender); actions.session(r.sessionId); }) }, t('wb_runNow')),
          h('button', { class: 'btn sm ghost', onClick: () => { SC.form = { ...x }; rerender(); } }, t('rename')),
          h('button', { class: 'btn sm danger', onClick: guard(async () => { if (!confirm(`${t('delete')} «${x.name}»?`)) return; await api('schedule.delete', { id: x.id }); await loadSchedules(rerender); }) }, t('delete'))))))) : h('p', { class: 'status', style: 'margin-top:16px' }, t('wb_schedulesEmpty')));
  }

  // ---- Integrations: curated MCP servers written into the shared config ----
  const IN = { list: null };
  function integrationsPage(rerender) {
    if (!IN.list) { IN.list = []; api('mcp.catalog').then(l => { IN.list = l; rerender(); }).catch(e => toast(e.message, true)); }
    const toggle = item => guard(async () => { await api(item.installed ? 'mcp.remove' : 'mcp.add', { id: item.id }); IN.list = await api('mcp.catalog'); rerender(); toast(item.installed ? t('wb_removed') : t('wb_added')); });
    return h('div', { class: 'page' }, h('h1', {}, t('wb_integrations')), h('p', { class: 'lead' }, t('wb_integrationsLead')),
      h('div', { class: 'intgrid' }, IN.list.map(x => h('div', { class: 'card intcard' },
        h('h3', {}, x.name, x.category === 'bitcoin' ? h('span', { class: 'chip warn' }, 'Bitcoin') : h('span', { class: 'chip' }, x.category)),
        h('p', {}, x.description), h('p', { class: 'mono status' }, x.config.command ? [x.config.command, ...(x.config.args || [])].join(' ') : x.config.url),
        h('p', { class: 'status' }, x.setup),
        h('div', { class: 'row' }, h('button', { class: `btn sm${x.installed ? ' danger' : ' primary'}`, onClick: toggle(x) }, x.installed ? t('wb_remove') : t('wb_add')),
          x.installed ? h('span', { class: 'chip ok' }, t('wb_inConfig')) : null)))));
  }

  // ---- Timeline: the turns of this chat that wrote files, each revertible while those files are unchanged ----
  async function openTimeline(session) {
    const turns = await api('session.timeline', { sessionId: session.sessionId });
    const body = h('div', { class: 'planbody' });
    const draw = list => fill(body, h('p', { class: 'status' }, t('wb_timelineHint')), list.length ? list.map(x => h('div', { class: 'card tlturn' },
      h('div', { class: 'row' }, h('b', {}, x.prompt), h('span', { class: 'spacer' }), h('span', { class: 'phint num' }, fmtTime(x.at))),
      h('div', { class: 'tlfiles mono' }, x.files.map(f => h('div', {}, `${f.op === 'create' ? '+' : '~'} ${f.path}`, f.changedSince && !x.reverted ? h('span', { class: 'chip warn' }, t('wb_changedSince')) : null))),
      x.reverted ? h('span', { class: 'chip' }, t('wb_reverted')) : h('button', { class: 'btn sm danger', disabled: x.files.some(f => f.changedSince || !f.revertible), onClick: guard(async () => {
        if (!confirm(t('wb_revertConfirm'))) return;
        await api('run.revert', { runId: x.runId }); toast(t('wb_reverted')); await actions.refreshGit(); draw(await api('session.timeline', { sessionId: session.sessionId }));
      }) }, t('wb_revert')))) : h('p', { class: 'status' }, t('wb_timelineEmpty')));
    draw(turns); dialogOf(t('wb_timeline'), body);
  }

  // ---- Preview: local dev servers, opened in the system browser (no embedded remote content) ----
  const PV = { list: null, loading: false };
  function previewPane(rerender) {
    const scan = () => { PV.loading = true; rerender(); api('preview.servers').then(l => { PV.list = l; }).catch(e => toast(e.message, true)).finally(() => { PV.loading = false; rerender(); }); };
    if (!PV.list && !PV.loading) scan();
    return h('div', { class: 'changes' },
      h('div', { class: 'row', style: 'margin-bottom:10px' }, h('span', { class: 'status' }, t('wb_previewLead')), h('span', { style: 'flex:1' }), h('button', { class: 'btn sm ghost', onClick: scan }, PV.loading ? '…' : '↻')),
      PV.list?.length ? PV.list.map(x => h('div', { class: 'todo' }, h('span', { class: 'mono' }, `127.0.0.1:${x.port}`), h('span', { class: 'ttext' }, x.title || (x.html ? 'HTML' : `HTTP ${x.status}`)),
        h('button', { class: 'btn sm', onClick: guard(() => api('app.openExternal', { url: x.url })) }, t('wb_openBrowser')))) : h('p', { class: 'status' }, PV.loading ? '…' : t('wb_noServers')));
  }

  // ---- skills: $name adds the skill's instructions to the message ----
  const LIB = { project: null, skills: [] };
  const skillItems = q => {
    if (LIB.project !== S.projectId) { LIB.project = S.projectId; LIB.skills = []; api('library.list', { projectId: S.projectId }).then(l => { LIB.skills = l.skills; }).catch(() => {}); }
    return LIB.skills.filter(x => x.name.toLowerCase().includes(q.toLowerCase())).slice(0, 20);
  };
  async function expandSkills(text) {
    const names = [...new Set([...text.matchAll(/(^|\s)\$([\w-]+)/g)].map(m => m[2]))].filter(n => LIB.skills.some(x => x.name === n));
    if (!names.length) return text;
    const parts = await Promise.all(names.map(name => api('skill.read', { projectId: S.projectId, name })));
    return `${text}\n\n${parts.map(p => `Skill «${p.name}» (instructions to follow for this request):\n${p.text}`).join('\n\n')}`;
  }

  // ---- Issues and PRs of the project's GitHub remote ----
  const GH = { kind: 'issues', state: 'open', data: null, project: null, loading: false };
  function issuesPage(rerender) {
    const load = () => { if (!S.projectId) return; GH.loading = true; GH.project = S.projectId; rerender();
      api('github.items', { projectId: S.projectId, kind: GH.kind, state: GH.state }).then(d => { GH.data = d; }).catch(e => { GH.data = { error: e.message, items: [] }; }).finally(() => { GH.loading = false; rerender(); }); };
    if (S.projectId && (GH.project !== S.projectId || !GH.data) && !GH.loading) load();
    const seg = (key, options) => h('div', { class: 'seg' }, options.map(([v, label]) => h('button', { class: GH[key] === v ? 'on' : '', onClick: () => { GH[key] = v; load(); } }, label)));
    const tokenInput = h('input', { type: 'password', autocomplete: 'off', placeholder: t('wb_ghTokenPh') });
    const d = GH.data;
    return h('div', { class: 'page' }, h('h1', {}, t('wb_issues')), h('p', { class: 'lead' }, d?.repo ? `${d.host === 'gitlab' ? 'gitlab.com' : 'github.com'}/${d.repo}` : t('wb_issuesLead')),
      !S.projectId ? h('p', { class: 'status' }, t('wb_openProjectFirst')) : [
        h('div', { class: 'row' }, seg('kind', [['issues', 'Issue'], ['pulls', d?.host === 'gitlab' ? 'Merge request' : 'Pull request']]), seg('state', [['open', t('wb_open')], ['closed', t('wb_closed')]]), h('span', { class: 'spacer' }),
          h('button', { class: 'btn sm ghost', onClick: load }, GH.loading ? '…' : '↻')),
        d?.error ? h('p', { class: 'chip err', style: 'margin-top:12px' }, d.error) : null,
        d && !d.repo && !d.error ? h('p', { class: 'status', style: 'margin-top:12px' }, t('wb_noGithubRemote')) : null,
        d?.items?.length ? h('table', { class: 'list', style: 'margin-top:16px' }, d.items.map(x => h('tr', {},
          h('td', { class: 'num' }, `#${x.number}`), h('td', {}, x.title, x.draft ? h('span', { class: 'chip' }, 'draft') : null, ...x.labels.map(l => h('span', { class: 'chip' }, l))),
          h('td', { class: 'num' }, x.user), h('td', { class: 'num' }, x.updatedAt ? ago(x.updatedAt) : ''),
          h('td', {}, h('div', { class: 'row' },
            h('button', { class: 'btn sm', onClick: () => actions.draft(`${t('wb_workOn')} ${GH.kind === 'pulls' ? (d.host === 'gitlab' ? 'MR' : 'PR') : 'issue'} #${x.number}: ${x.title}${x.url ? ` (${x.url})` : ''}`) }, t('wb_workOnBtn')),
            x.url ? h('button', { class: 'btn sm ghost', onClick: guard(() => api('app.openExternal', { url: x.url })) }, t('wb_openBrowser')) : null))))) : d?.repo && !GH.loading ? h('p', { class: 'status', style: 'margin-top:16px' }, t('none')) : null,
        h('div', { class: 'section' }, t('wb_ghToken')), h('p', { class: 'status' }, t('wb_ghTokenHint')),
        h('div', { class: 'row' }, tokenInput, h('button', { class: 'btn sm', onClick: guard(async () => { if (!tokenInput.value) return; const r = await api('secrets.put', { name: d?.host === 'gitlab' ? 'gitlab' : 'github', value: tokenInput.value }); tokenInput.value = ''; toast(r.persisted ? t('secretSecure') : t('secretInsecure')); load(); }) }, t('saveKey')))]);
  }

  // ---- snippets: #name in the composer expands to saved text ----
  const snippetItems = q => (S.settings?.snippets || []).filter(x => x.name.toLowerCase().startsWith(q.toLowerCase())).slice(0, 20);

  return { issuesPage, previewPane, skillItems, expandSkills, openTimeline, walkthrough, editGoal, openMultirun, multirunPage, multirunChanged, schedulesPage, integrationsPage, snippetItems, gitTools, invalidateGit: () => { G.branches = null; }, starters, openPalette, changesPane, knowledgePane, statsPage, archivePage, invalidateDiffs: () => W.diffs.clear(), invalidateStats: () => { W.stats = null; W.statsLoading = false; W.statsTicket++; } };
}

// Prompt history for the composer: newest first, consecutive duplicates removed.
export function promptHistory(messages) {
  const out = [];
  for (const m of [...(messages || [])].reverse()) if (m.role === 'user' && typeof m.content === 'string' && m.content.trim() && out[out.length - 1] !== m.content) out.push(m.content);
  return out;
}
