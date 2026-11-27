import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowUpRight, Bell, BriefcaseBusiness, CalendarDays, ChevronDown,
  CircleHelp, Download, FileText, Filter, LayoutDashboard, Menu, MoreHorizontal,
  Plus, Search, Settings, ShieldCheck, Sparkles, Users, X, Trash2, Pencil,
  RefreshCw, UserRoundPlus, LogOut
} from 'lucide-react';
import { apiRequest } from './api.js';

const STAGES = ['Applied', 'Screening', 'Review', 'Interview', 'Shortlisted', 'Offer', 'Hired', 'Rejected'];
const emptyCandidate = { name: '', email: '', role: '', stage: 'Applied', score: 0, job_id: '' };
const emptyJob = { title: '', team: '', location: 'Tunis · Hybrid' };

function Metric({ label, value, icon: Icon, color, note }) {
  return <article className="metric-card">
    <div className="metric-top"><span>{label}</span><span className={`metric-icon ${color}`}><Icon size={18}/></span></div>
    <div className="metric-value">{value}</div>
    <div className="metric-foot"><span>{note}</span></div>
  </article>;
}

function Modal({ title, onClose, children }) {
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <section className="modal-card">
      <div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button></div>
      {children}
    </section>
  </div>;
}


function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      onLogin(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-shell">
    <section className="auth-card">
      <div className="auth-brand"><div className="brand-mark"><Sparkles size={19}/></div><span>talentflow<span className="brand-ai">.ai</span></span></div>
      <span className="auth-eyebrow">SECURE RECRUITMENT WORKSPACE</span>
      <h1>Welcome back</h1>
      <p>Sign in to manage your hiring workspace.</p>
      <form className="auth-form" onSubmit={submit}>
        <label>Work email<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com"/></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="Your password"/></label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="button primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}</button>
      </form>
      <div className="auth-note"><ShieldCheck size={15}/> Only authorized workspace members can access candidate records.</div>
    </section>
  </main>;
}


function CVAnalysisPanel({ canUpload }) {
  const [candidateInput, setCandidateInput] = useState('');
  const [requiredInput, setRequiredInput] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cvFile, setCvFile] = useState(null);
  const [cvPreview, setCvPreview] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [selectedSuggestedSkills, setSelectedSuggestedSkills] = useState([]);
  const [skillSuggestionMessage, setSkillSuggestionMessage] = useState('');

  const chooseCv = file => {
    setCvPreview(null);
    setSelectedSuggestedSkills([]);
    setSkillSuggestionMessage('');
    setUploadError('');
    if (!file) {
      setCvFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type !== 'application/pdf')) {
      setCvFile(null);
      setUploadError('Choose a PDF file only.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setCvFile(null);
      setUploadError('The PDF must be 5 MB or smaller.');
      return;
    }
    setCvFile(file);
  };

  const uploadCv = async event => {
    event.preventDefault();
    if (!cvFile) {
      setUploadError('Choose a PDF file first.');
      return;
    }
    setUploadBusy(true);
    setUploadError('');
    setCvPreview(null);
    try {
      const form = new FormData();
      form.append('file', cvFile);
      const response = await apiRequest('/cv/preview', { method: 'POST', body: form });
      setCvPreview(response.preview);
      setSelectedSuggestedSkills([]);
      setSkillSuggestionMessage('');
    } catch (err) {
      setUploadError(err.message || 'Unable to preview this PDF.');
    } finally {
      setUploadBusy(false);
    }
  };

  const clearCv = () => {
    setCvFile(null);
    setCvPreview(null);
    setSelectedSuggestedSkills([]);
    setSkillSuggestionMessage('');
    setUploadError('');
    setFileInputKey(value => value + 1);
  };

  const splitSkills = value => value.split(String.fromCharCode(10)).flatMap(line => line.split(',')).map(skill => skill.trim()).filter(Boolean);

  const toggleSuggestedSkill = skill => setSelectedSuggestedSkills(current =>
    current.includes(skill) ? current.filter(item => item !== skill) : [...current, skill]
  );

  const addSelectedSkills = () => {
    const selected = cvPreview?.skillSuggestions?.skills?.filter(skill => selectedSuggestedSkills.includes(skill)) || [];
    const merged = splitSkills(candidateInput);
    const known = new Set(merged.map(skill => skill.normalize('NFKC').trim().toLowerCase()));
    const additions = selected.filter(skill => {
      const key = skill.normalize('NFKC').trim().toLowerCase();
      if (known.has(key)) return false;
      known.add(key);
      return true;
    });
    setCandidateInput([...merged, ...additions].join('\n'));
    setSkillSuggestionMessage(additions.length ? additions.length + ' skill(s) added to the candidate list. Review the list before matching.' : 'The selected skills were already in the candidate list.');
    setSelectedSuggestedSkills([]);
  };

  const analyze = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await apiRequest('/matching/preview', {
        method: 'POST',
        body: JSON.stringify({
          candidateSkills: splitSkills(candidateInput),
          requiredSkills: splitSkills(requiredInput)
        })
      });
      setResult(response.match);
    } catch (err) {
      setError(err.message || 'Unable to calculate skill coverage.');
    } finally {
      setBusy(false);
    }
  };

  const groups = result ? [
    { title: 'Matched skills', items: result.matchedSkills, tone: 'matched', empty: 'No exact matches.' },
    { title: 'Missing required skills', items: result.missingSkills, tone: 'missing', empty: 'No missing required skills.' },
    { title: 'Additional skills', items: result.additionalSkills, tone: 'additional', empty: 'No additional skills listed.' }
  ] : [];

  return <div className="analysis-layout">
    {canUpload && <section className="panel full-panel cv-upload-panel">
      <div className="panel-heading">
        <div><h2>Temporary CV PDF preview</h2><p>Extract selectable text for a human review</p></div>
        <span className="analysis-tag">Memory only</span>
      </div>
      <form className="cv-upload-form" onSubmit={uploadCv}>
        <label className="cv-file-control">Choose a PDF CV
          <input key={fileInputKey} type="file" accept=".pdf,application/pdf" onChange={event => chooseCv(event.target.files?.[0] || null)} />
        </label>
        <button className="button primary" type="submit" disabled={!cvFile || uploadBusy}>
          <FileText size={15}/>{uploadBusy ? 'Extracting text…' : 'Preview PDF text'}
        </button>
        <p className="cv-upload-note">PDF only · 5 MB maximum · 5 pages maximum. The file is processed in server memory and is not saved. Use synthetic test files only.</p>
        {uploadError && <div className="auth-error" role="alert">{uploadError}</div>}
      </form>
      {cvPreview && <div className="cv-preview-result" aria-live="polite">
        <div className="cv-preview-meta">
          <strong>{cvPreview.pageCount} page{cvPreview.pageCount === 1 ? '' : 's'} processed</strong>
          <span>{cvPreview.characterCount.toLocaleString('en-US')} characters · not saved</span>
        </div>
        {cvPreview.requiresOcr && <p className="cv-ocr-notice">No selectable text was found. This may be a scanned PDF; OCR is not available yet.</p>}
        <label className="cv-text-label">Extracted text — review before using
          <textarea rows="10" value={cvPreview.text} readOnly placeholder="No selectable text was extracted." />
        </label>
        <div className="cv-preview-actions"><button className="button secondary" type="button" onClick={clearCv}>Clear preview</button></div>
        {cvPreview.skillSuggestions?.skills?.length > 0 ? <section className="cv-skill-suggestions">
          <div className="cv-skill-suggestions-heading"><strong>Keyword skill suggestions</strong><span>{cvPreview.skillSuggestions.skills.length} detected · review required</span></div>
          <p>{cvPreview.skillSuggestions.method}. {cvPreview.skillSuggestions.disclaimer}</p>
          <div className="cv-suggestion-list">
            {cvPreview.skillSuggestions.skills.map(skill => <label className="cv-suggestion-item" key={skill}>
              <input type="checkbox" checked={selectedSuggestedSkills.includes(skill)} onChange={() => toggleSuggestedSkill(skill)}/>
              <span>{skill}</span>
            </label>)}
          </div>
          <button className="button secondary" type="button" disabled={!selectedSuggestedSkills.length} onClick={addSelectedSkills}>Add selected to candidate skills</button>
          {skillSuggestionMessage && <small className="cv-suggestion-feedback" role="status">{skillSuggestionMessage}</small>}
        </section> : <p className="cv-upload-note">No supported skill keywords were found in the extracted text. This does not mean the CV has no skills.</p>}
        <p className="cv-upload-note">This preview does not create a candidate record. Select and confirm any relevant suggestions above before using them in the manual comparison.</p>
      </div>}
    </section>}
    <section className="panel full-panel analysis-input-panel">
      <div className="panel-heading">
        <div><h2>Explainable skill coverage</h2><p>Compare a candidate skill list with a role's requirements</p></div>
        <span className="analysis-tag">Decision support</span>
      </div>
      <form className="analysis-form" onSubmit={analyze}>
        <label>Candidate skills
          <textarea rows="7" value={candidateInput} onChange={event => setCandidateInput(event.target.value)} placeholder={'React\nNode.js\nAccessibility'} />
        </label>
        <label>Required skills for the role
          <textarea rows="7" value={requiredInput} onChange={event => setRequiredInput(event.target.value)} placeholder={'React\nPostgreSQL\nNode.js'} required />
        </label>
        <p className="analysis-form-note">Enter one skill per line or separate skills with commas. Only the skill labels entered here are sent to the matching API. Extracted CV text is not automatically converted into skills or stored.</p>
        {error && <div className="auth-error analysis-form-message" role="alert">{error}</div>}
        <button className="button primary analysis-submit" disabled={busy}>
          <Sparkles size={15}/>{busy ? 'Calculating…' : 'Calculate skill coverage'}
        </button>
      </form>
    </section>

    {result && <section className="panel full-panel analysis-result" aria-live="polite">
      <div className="panel-heading"><div><h2>Matching breakdown</h2><p>Every item below comes from the two lists you entered</p></div></div>
      <div className="analysis-summary">
        <div className="coverage-score"><strong>{result.skillCoveragePercent}%</strong><span>required skill coverage</span></div>
        <div className="coverage-count"><strong>{result.matchedCount} / {result.requiredCount}</strong><span>required skills matched exactly</span></div>
      </div>
      <div className="analysis-skill-groups">
        {groups.map(group => <div className="analysis-skill-group" key={group.title}>
          <h3>{group.title}</h3>
          <div className="skill-pill-list">
            {group.items.length ? group.items.map(skill => <span className={'skill-pill ' + group.tone} key={skill}>{skill}</span>) : <span className="skill-empty">{group.empty}</span>}
          </div>
        </div>)}
      </div>
      <div className="analysis-explanation"><strong>How the score is calculated</strong><p>{result.explanation}</p><small>{result.method}. {result.limitation}</small></div>
      <p className="analysis-disclaimer">This is a deterministic comparison of skill names, not a hiring recommendation. Review experience, proficiency and evidence manually before making any decision.</p>
    </section>}
  </div>;
}

function App() {
  const [active, setActive] = useState('Overview');
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [activities, setActivities] = useState([]);
  const [activityResults, setActivityResults] = useState([]);
  const [activityActors, setActivityActors] = useState([]);
  const [activityFilters, setActivityFilters] = useState({ actorId: '', entityType: '', action: '', from: '', to: '' });
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [modal, setModal] = useState('');
  const [candidateForm, setCandidateForm] = useState(emptyCandidate);
  const [jobForm, setJobForm] = useState(emptyJob);
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const notify = message => { setNotice(message); window.setTimeout(() => setNotice(''), 3500); };

  useEffect(() => {
    let mounted = true;
    apiRequest('/auth/me')
      .then(data => { if (mounted) setUser(data.user); })
      .catch(() => { if (mounted) setUser(null); })
      .finally(() => { if (mounted) setAuthChecking(false); });
    return () => { mounted = false; };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const activityRequest = user?.role === 'hiring_manager'
        ? Promise.resolve({ activities: [] })
        : apiRequest('/activity');
      const [dash, candidateData, jobData, activityData] = await Promise.all([
        apiRequest('/dashboard'), apiRequest('/candidates'), apiRequest('/jobs'), activityRequest
      ]);
      setDashboard(dash);
      setCandidates(candidateData.candidates || []);
      setJobs(jobData.jobs || []);
      setActivities(activityData.activities || []);
      setActivityActors(activityData.actors || []);
    } catch (err) {
      setError(err.message + ' — vérifie que PostgreSQL et le serveur API sont démarrés.');
    } finally { setLoading(false); }
  }, [user?.role]);

  useEffect(() => { if (user) loadData(); }, [loadData, user]);

  const userRole = user?.role;
  const loadActivity = useCallback(async () => {
    if (!userRole || userRole === 'hiring_manager') {
      setActivityResults([]);
      return;
    }
    setActivityLoading(true);
    setActivityError('');
    try {
      const params = new URLSearchParams();
      Object.entries(activityFilters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const queryString = params.toString();
      const result = await apiRequest('/activity' + (queryString ? '?' + queryString : ''));
      setActivityResults(result.activities || []);
      setActivityActors(result.actors || []);
    } catch (err) {
      setActivityError(err.message || 'Unable to load activity.');
    } finally {
      setActivityLoading(false);
    }
  }, [userRole, activityFilters]);

  useEffect(() => {
    if (user && active === 'Activity') loadActivity();
  }, [user, active, loadActivity]);

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
      setUser(null);
      setActive('Overview');
      setCandidates([]);
      setJobs([]);
      setDashboard(null);
      setActivities([]);
      setActivityResults([]);
      setActivityActors([]);
      setActivityFilters({ actorId: '', entityType: '', action: '', from: '', to: '' });
      setActivityError('');
    } catch (err) {
      notify(err.message);
    }
  };

  const filtered = useMemo(() => candidates.filter(c => {
    const text = `${c.name} ${c.email} ${c.role} ${c.stage}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (!stageFilter || c.stage === stageFilter);
  }), [candidates, query, stageFilter]);

  const openCandidate = candidate => {
    setEditingId(candidate?.id ?? null);
    setCandidateForm(candidate ? {
      name: candidate.name, email: candidate.email, role: candidate.role,
      stage: candidate.stage, score: candidate.score, job_id: candidate.job_id || ''
    } : emptyCandidate);
    setModal('candidate');
  };

  const saveCandidate = async e => {
    e.preventDefault(); setBusy(true);
    try {
      const body = { ...candidateForm, score: Number(candidateForm.score), job_id: candidateForm.job_id || null };
      await apiRequest(editingId ? `/candidates/${editingId}` : '/candidates', {
        method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(body)
      });
      setModal(''); await loadData(); notify(editingId ? 'Candidate updated in database.' : 'Candidate saved in database.');
    } catch (err) { notify(err.message); }
    finally { setBusy(false); }
  };

  const deleteCandidate = async id => {
    if (!window.confirm('Delete this candidate permanently from the database?')) return;
    try { await apiRequest(`/candidates/${id}`, { method: 'DELETE' }); await loadData(); notify('Candidate deleted.'); }
    catch (err) { notify(err.message); }
  };

  const saveJob = async e => {
    e.preventDefault(); setBusy(true);
    try {
      await apiRequest('/jobs', { method: 'POST', body: JSON.stringify(jobForm) });
      setModal(''); setJobForm(emptyJob); await loadData(); notify('Job opening saved in database.');
    } catch (err) { notify(err.message); }
    finally { setBusy(false); }
  };

  const changeJobStatus = async job => {
    const status = job.status === 'Active' ? 'Paused' : 'Active';
    try { await apiRequest(`/jobs/${job.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await loadData(); notify(`Job ${status.toLowerCase()}.`); }
    catch (err) { notify(err.message); }
  };

  const exportCsv = () => {
    const rows = [
      ['Name', 'Email', 'Role', 'Stage', 'Fit score', 'Job'],
      ...filtered.map(c => [c.name, c.email, c.role, c.stage, c.score, c.job_title || ''])
    ];
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = 'talentflow-candidates.csv'; a.click(); URL.revokeObjectURL(url);
    notify('CSV report exported.');
  };

  const nav = [
    { label: 'Overview', icon: LayoutDashboard },
    { label: 'Candidates', icon: Users },
    { label: 'Job openings', icon: BriefcaseBusiness },
    { label: 'CV analysis', icon: FileText },
    { label: 'Activity', icon: Activity }
  ].filter(item => item.label !== 'Activity' || user?.role !== 'hiring_manager');

  const stageCounts = dashboard?.pipeline || [];
  const total = dashboard?.metrics?.totalCandidates ?? 0;
  const pipelineMax = Math.max(1, ...stageCounts.map(s => s.total));
  const canManage = user?.role === 'admin' || user?.role === 'recruiter';
  const canDelete = user?.role === 'admin';

  if (authChecking) return <div className="auth-loading">Checking secure session…</div>;
  if (!user) return <LoginScreen onLogin={setUser}/>;

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Sparkles size={19}/></div><span>talentflow<span className="brand-ai">.ai</span></span><button className="mobile-close" onClick={() => setMenuOpen(false)}><X size={18}/></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="workspace-switch"><div className="workspace-avatar">T</div><span><strong>TalentFlow AI</strong><small>Recruitment workspace</small></span><ChevronDown size={15}/></div>
      <nav className="main-nav">{nav.map(({label, icon: Icon}) => <button key={label} onClick={() => {setActive(label);setMenuOpen(false)}} className={active === label ? 'nav-item selected' : 'nav-item'}><Icon size={18}/><span>{label}</span>{label === 'Candidates' && <small>{total}</small>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="help-card"><div className="help-icon"><CircleHelp size={17}/></div><strong>Need a hand?</strong><p>Manage candidates and vacancies from one workspace.</p><button onClick={() => notify('Help center will be available soon.')}>Help center <ArrowUpRight size={13}/></button></div>
        <button className={active === 'Settings' ? 'nav-item selected' : 'nav-item'} onClick={() => setActive('Settings')}><Settings size={18}/><span>Settings</span></button>
        <div className="profile"><div className="profile-avatar">TF</div><span><strong>{user.email}</strong><small>{user.role.replaceAll("_", " ")}</small></span><MoreHorizontal size={19}/></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(true)}><Menu/></button><div className="breadcrumb">Workspace <span>/</span> <strong>{active}</strong></div><div className="top-actions">{user.role !== 'hiring_manager' && <><button className="icon-button" aria-label="Activity notifications" onClick={() => setActive('Activity')}><Bell size={18}/>{activities.length > 0 && <i/>}</button><div className="top-divider"/></>}<div className="top-user">TF</div><button className="logout-button" onClick={logout} title="Sign out"><LogOut size={16}/><span>Sign out</span></button></div></header>
      <div className="content">
        <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> LIVE DATABASE</div><h1>{active === 'Overview' ? 'Hiring overview' : active}</h1><p>{active === 'Overview' ? 'Your recruitment activity, updated from PostgreSQL.' : `Manage your ${active.toLowerCase()} workspace.`}</p></div><div className="welcome-actions"><button className="button secondary" onClick={exportCsv}><Download size={16}/> Export CSV</button>{canManage && ['Overview', 'Candidates'].includes(active) && <button className="button primary" onClick={() => openCandidate()}><Plus size={17}/>Add candidate</button>}{canManage && active === 'Job openings' && <button className="button primary" onClick={() => setModal('job')}><Plus size={17}/>Create job</button>}</div></section>

        {error && <div className="error-banner"><strong>Database connection unavailable</strong><span>{error}</span><button className="button secondary" onClick={loadData}><RefreshCw size={14}/> Retry</button></div>}
        {loading && <div className="loading-line"><RefreshCw size={16}/> Loading data from database…</div>}

        {active === 'Overview' && <>
          <section className="metrics-grid">
            <Metric label="Total candidates" value={total.toLocaleString('en-US')} note="Stored in PostgreSQL" icon={Users} color="purple"/>
            <Metric label="Open positions" value={(dashboard?.metrics?.openPositions ?? 0).toString().padStart(2,'0')} note="Currently active" icon={BriefcaseBusiness} color="blue"/>
            <Metric label="Interviews" value={dashboard?.metrics?.interviewsScheduled ?? 0} note="Candidates in interview stage" icon={CalendarDays} color="orange"/>
            <Metric label="Hiring stages" value={stageCounts.length} note="Stages with candidates" icon={Activity} color="green"/>
          </section>
          <section className="middle-grid">
            <article className="panel pipeline-panel"><div className="panel-heading"><div><h2>Hiring pipeline</h2><p>Real candidate count by stage</p></div><button className="select-button" onClick={() => setActive('Candidates')}>Manage candidates <ArrowUpRight size={14}/></button></div><div className="pipeline-total"><strong>{total}</strong><span>candidates in database</span></div><div className="pipeline-bars">{STAGES.map((label,i)=>{const value=stageCounts.find(s=>s.stage===label)?.total || 0;return <div className="pipeline-row" key={label}><span>{label}</span><div className="bar-track"><div className={`bar-fill bar-${i%5}`} style={{width:`${(value/pipelineMax)*100}%`}}/></div><strong>{value}</strong></div>})}</div></article>
            <article className="panel source-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Latest changes saved to the database</p></div><button className="text-button" onClick={() => setActive('Activity')}>View all <ArrowUpRight size={14}/></button></div><div className="activity-preview">{activities.slice(0,5).map(item=><div className="activity-item" key={item.id}><span className="activity-icon"><Activity size={15}/></span><div><strong>{item.description}</strong><small>{new Date(item.created_at).toLocaleString()} · {item.actor_email || 'Legacy / unknown actor'}</small></div></div>)}{!activities.length && <p className="empty-state">No activity recorded yet.</p>}</div></article>
          </section>
          <section className="bottom-grid">
            <article className="panel candidates-panel"><div className="panel-heading"><div><h2>Recent candidates</h2><p>Latest records from PostgreSQL</p></div><button className="text-button" onClick={() => setActive('Candidates')}>View all <ArrowUpRight size={14}/></button></div><CandidateTable rows={(dashboard?.recentCandidates || []).slice(0,5)} onEdit={openCandidate} onDelete={deleteCandidate} canEdit={canManage} canDelete={canDelete}/></article>
            <JobPanel jobs={jobs.slice(0,4)} onCreate={() => setModal('job')} onToggle={changeJobStatus} canManage={canManage}/>
          </section>
        </>}

        {active === 'Candidates' && <section className="panel candidates-panel full-panel"><div className="panel-heading"><div><h2>All candidates</h2><p>{candidates.length} records stored in your database</p></div>{canManage && <button className="button primary" onClick={() => openCandidate()}><UserRoundPlus size={15}/> Add candidate</button>}</div><div className="table-toolbar"><div className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, email or role..."/></div><select className="filter-button" value={stageFilter} onChange={e=>setStageFilter(e.target.value)}><option value="">All stages</option>{STAGES.map(s=><option key={s}>{s}</option>)}</select></div><CandidateTable rows={filtered} onEdit={openCandidate} onDelete={deleteCandidate} canEdit={canManage} canDelete={canDelete}/></section>}

        {active === 'Job openings' && <section className="panel full-panel"><div className="panel-heading"><div><h2>Job openings</h2><p>{jobs.length} vacancies saved in PostgreSQL</p></div>{canManage && <button className="button primary" onClick={() => setModal('job')}><Plus size={15}/> Create job</button>}</div><JobPanel jobs={jobs} onCreate={() => setModal('job')} onToggle={changeJobStatus} canManage={canManage}/></section>}

        {active === 'Activity' && <section className="panel full-panel"><div className="panel-heading"><div><h2>Activity log</h2><p>Audit trail with role-aware security events and filters</p></div><button className="button secondary" onClick={loadActivity} disabled={activityLoading}><RefreshCw size={14}/> Refresh</button></div><div className="activity-filters" role="group" aria-label="Activity filters">{user?.role === 'admin' && <select aria-label="Filter by user" value={activityFilters.actorId} onChange={e=>setActivityFilters(current=>({...current,actorId:e.target.value}))}><option value="">All users</option>{activityActors.map(actor=><option key={actor.id} value={actor.id}>{actor.email}</option>)}</select>}<select aria-label="Filter by event type" value={activityFilters.entityType} onChange={e=>setActivityFilters(current=>({...current,entityType:e.target.value}))}><option value="">All event types</option><option value="candidate">Candidates</option><option value="job">Jobs</option>{user?.role === 'admin' && <><option value="user">Workspace users</option><option value="auth">Authentication</option></>}</select><select aria-label="Filter by action" value={activityFilters.action} onChange={e=>setActivityFilters(current=>({...current,action:e.target.value}))}><option value="">All actions</option><option value="created">Created</option><option value="updated">Updated</option><option value="deleted">Deleted</option>{user?.role === 'admin' && <><option value="login">Signed in</option><option value="logout">Signed out</option></>}</select><label className="activity-date-filter">From<input type="date" value={activityFilters.from} onChange={e=>setActivityFilters(current=>({...current,from:e.target.value}))}/></label><label className="activity-date-filter">To<input type="date" value={activityFilters.to} onChange={e=>setActivityFilters(current=>({...current,to:e.target.value}))}/></label><button className="button secondary activity-clear" onClick={()=>setActivityFilters({actorId:'',entityType:'',action:'',from:'',to:''})}>Clear filters</button></div>{activityError && <div className="error-banner" role="alert">{activityError}</div>}{activityLoading && <div className="loading-line">Loading activity…</div>}<div className="activity-list">{activityResults.map(item=><div className="activity-item" key={item.id}><span className="activity-icon"><Activity size={15}/></span><div><strong>{item.description}</strong><small>{item.entity_type} · {new Date(item.created_at).toLocaleString()} · {item.actor_email || 'Legacy / unknown actor'}</small></div><span className="activity-action">{item.action}</span></div>)}{!activityLoading && !activityResults.length && <p className="empty-state">No activity matches these filters.</p>}</div></section>}

        {active === 'CV analysis' && <CVAnalysisPanel canUpload={canManage}/>}

        {active === 'Settings' && <section className="panel full-panel feature-panel"><div className="feature-symbol"><Settings size={25}/></div><h2>Workspace settings</h2><p>La configuration de la base de données se fait côté serveur dans <code>server/.env</code>. Ne partage jamais ce fichier ni son mot de passe.</p><button className="button secondary" onClick={loadData}><RefreshCw size={14}/> Test database connection</button></section>}

        <footer className="footer"><span>© 2026 TalentFlow AI</span><span><ShieldCheck size={13}/> Human-reviewed recruitment workspace</span></footer>
      </div>
    </main>

    {modal === 'candidate' && <Modal title={editingId ? 'Edit candidate' : 'Add candidate'} onClose={() => setModal('')}><form className="data-form" onSubmit={saveCandidate}><label>Full name<input required value={candidateForm.name} onChange={e=>setCandidateForm({...candidateForm,name:e.target.value})} placeholder="Candidate name"/></label><label>Email<input required type="email" value={candidateForm.email} onChange={e=>setCandidateForm({...candidateForm,email:e.target.value})} placeholder="name@example.com"/></label><label>Target role<input required value={candidateForm.role} onChange={e=>setCandidateForm({...candidateForm,role:e.target.value})} placeholder="Frontend Engineer"/></label><label>Job opening<select value={candidateForm.job_id} onChange={e=>setCandidateForm({...candidateForm,job_id:e.target.value})}><option value="">No linked job</option>{jobs.map(j=><option value={j.id} key={j.id}>{j.title}</option>)}</select></label><div className="form-two"><label>Stage<select value={candidateForm.stage} onChange={e=>setCandidateForm({...candidateForm,stage:e.target.value})}>{STAGES.map(s=><option key={s}>{s}</option>)}</select></label><label>Fit score (0–100)<input type="number" min="0" max="100" value={candidateForm.score} onChange={e=>setCandidateForm({...candidateForm,score:e.target.value})}/></label></div><div className="form-actions"><button type="button" className="button secondary" onClick={() => setModal('')}>Cancel</button><button disabled={busy} className="button primary">{busy ? 'Saving…' : 'Save to database'}</button></div></form></Modal>}

    {modal === 'job' && <Modal title="Create job opening" onClose={() => setModal('')}><form className="data-form" onSubmit={saveJob}><label>Job title<input required value={jobForm.title} onChange={e=>setJobForm({...jobForm,title:e.target.value})} placeholder="Frontend Engineer"/></label><label>Team<input required value={jobForm.team} onChange={e=>setJobForm({...jobForm,team:e.target.value})} placeholder="Engineering"/></label><label>Location<input required value={jobForm.location} onChange={e=>setJobForm({...jobForm,location:e.target.value})} placeholder="Tunis · Hybrid"/></label><div className="form-actions"><button type="button" className="button secondary" onClick={() => setModal('')}>Cancel</button><button disabled={busy} className="button primary">{busy ? 'Saving…' : 'Create job'}</button></div></form></Modal>}

    {notice && <div className="toast">{notice}</div>}
  </div>;
}

function CandidateTable({ rows, onEdit, onDelete, canEdit = true, canDelete = true }) {
  return <div className="candidate-table"><div className="table-head"><span>Candidate</span><span>Applied for</span><span>Stage</span><span>Fit indicator</span>{(canEdit || canDelete) && <span>Actions</span>}</div>{rows.map(c=><div className="candidate-row" key={c.id}><div className="candidate-person"><div className="candidate-avatar violet">{String(c.name || '?').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()}</div><div><strong>{c.name}</strong><small>{c.email || new Date(c.created_at).toLocaleDateString()}</small></div></div><span className="candidate-role">{c.role}</span><span><i className={`stage-dot stage-${String(c.stage).toLowerCase()}`}/>{c.stage}</span><div className="fit-cell"><div className="fit-track"><i style={{width:`${c.score}%`}}/></div><strong>{c.score}%</strong></div>{(canEdit || canDelete) && <div className="row-actions">{canEdit && <button className="row-more" aria-label="Edit candidate" onClick={()=>onEdit(c)}><Pencil size={15}/></button>}{canDelete && <button className="row-more danger-action" aria-label="Delete candidate" onClick={()=>onDelete(c.id)}><Trash2 size={15}/></button>}</div>}</div>)}{!rows.length && <p className="empty-state">No candidates found. Add your first candidate.</p>}<div className="table-note"><ShieldCheck size={14}/> Candidate records are stored in PostgreSQL. Fit scores are decision-support signals only.</div></div>;
}

function JobPanel({ jobs, onCreate, onToggle, canManage = true }) {
  return <article className="panel openings-panel"><div className="panel-heading"><div><h2>Job openings</h2><p>Vacancies saved in the database</p></div></div><div className="opening-list">{jobs.map(j=><div className="opening-item" key={j.id}><div className="opening-icon purple"><BriefcaseBusiness size={17}/></div><div className="opening-info"><strong>{j.title}</strong><small>{j.team} · {j.location}</small><div className="opening-meta"><span><Users size={13}/>{j.applicant_count || 0} applicants</span>{canManage && <button className="status-toggle" onClick={()=>onToggle(j)}>{j.status} · change</button>}</div></div></div>)}{!jobs.length && <p className="empty-state">No job openings yet.</p>}</div>{canManage && <button className="button create-job" onClick={onCreate}><Plus size={15}/> Create job opening</button>}</article>;
}

export default App;
