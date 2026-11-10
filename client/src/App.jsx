import { useMemo, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, BriefcaseBusiness, CalendarDays,
  ChevronDown, CircleHelp, Download, FileText, Filter, LayoutDashboard, Menu,
  MoreHorizontal, Plus, Search, Settings, ShieldCheck, Sparkles, Users, X
} from 'lucide-react';

const candidates = [
  { name: 'Maya Ben Salem', role: 'Product Designer', stage: 'Interview', score: 92, initials: 'MB', color: 'violet', date: 'Today' },
  { name: 'Youssef Trabelsi', role: 'Frontend Engineer', stage: 'Screening', score: 88, initials: 'YT', color: 'blue', date: 'Today' },
  { name: 'Inès Gharbi', role: 'Data Analyst', stage: 'Review', score: 84, initials: 'IG', color: 'peach', date: 'Yesterday' },
  { name: 'Omar Khelifi', role: 'Product Designer', stage: 'Shortlisted', score: 81, initials: 'OK', color: 'green', date: 'Yesterday' },
  { name: 'Sarra Mansour', role: 'Frontend Engineer', stage: 'Review', score: 76, initials: 'SM', color: 'pink', date: 'Oct 28' }
];

const jobs = [
  { title: 'Senior Product Designer', team: 'Design', location: 'Tunis · Hybrid', count: 24, status: 'Active', tone: 'purple' },
  { title: 'Frontend Engineer', team: 'Engineering', location: 'Remote · Tunisia', count: 38, status: 'Active', tone: 'blue' },
  { title: 'Data Analyst', team: 'Data', location: 'Tunis · On-site', count: 16, status: 'Active', tone: 'orange' }
];

function Metric({ label, value, change, icon: Icon, color }) {
  return <article className="metric-card">
    <div className="metric-top"><span>{label}</span><span className={`metric-icon ${color}`}><Icon size={18}/></span></div>
    <div className="metric-value">{value}</div>
    <div className="metric-foot"><span className="trend"><ArrowUpRight size={14}/>{change}</span><span>vs. last month</span></div>
  </article>;
}

function App() {
  const [active, setActive] = useState('Overview');
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const filtered = useMemo(() => candidates.filter(c => `${c.name} ${c.role} ${c.stage}`.toLowerCase().includes(query.toLowerCase())), [query]);

  const nav = [
    { label: 'Overview', icon: LayoutDashboard },
    { label: 'Candidates', icon: Users, count: '128' },
    { label: 'Job openings', icon: BriefcaseBusiness, count: '8' },
    { label: 'CV analysis', icon: FileText },
    { label: 'Activity', icon: Activity }
  ];

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Sparkles size={19}/></div><span>talentflow<span className="brand-ai">.ai</span></span><button className="mobile-close" onClick={() => setMenuOpen(false)}><X size={18}/></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <button className="workspace-switch"><div className="workspace-avatar">N</div><span><strong>Northstar Studio</strong><small>Free workspace</small></span><ChevronDown size={15}/></button>
      <nav className="main-nav">{nav.map(({label, icon: Icon, count}) => <button key={label} onClick={() => {setActive(label);setMenuOpen(false)}} className={active === label ? 'nav-item selected' : 'nav-item'}><Icon size={18}/><span>{label}</span>{count && <small>{count}</small>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="help-card"><div className="help-icon"><CircleHelp size={17}/></div><strong>Need a hand?</strong><p>Explore tips to get the most out of TalentFlow.</p><button>Visit help center <ArrowUpRight size={13}/></button></div>
        <button className="nav-item"><Settings size={18}/><span>Settings</span></button>
        <div className="profile"><div className="profile-avatar">AM</div><span><strong>Alex Morgan</strong><small>HR Administrator</small></span><MoreHorizontal size={19}/></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(true)}><Menu/></button><div className="breadcrumb">Workspace <span>/</span> <strong>{active}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Notifications"><Bell size={18}/><i/></button><div className="top-divider"/><div className="top-user">AM</div></div></header>
      <div className="content">
        <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> MONDAY, NOVEMBER 10, 2026</div><h1>{active === 'Overview' ? 'Good morning, Alex' : active}</h1><p>Here’s what’s happening with your hiring pipeline today.</p></div><div className="welcome-actions"><button className="button secondary"><Download size={16}/> Export report</button><button className="button primary"><Plus size={17}/> Add candidate</button></div></section>
        <section className="metrics-grid">
          <Metric label="Total candidates" value="1,284" change="+12.8%" icon={Users} color="purple"/>
          <Metric label="Open positions" value="08" change="+2 this month" icon={BriefcaseBusiness} color="blue"/>
          <Metric label="Interviews scheduled" value="24" change="+8.2%" icon={CalendarDays} color="orange"/>
          <Metric label="Avg. time to hire" value="18 days" change="-3 days" icon={Activity} color="green"/>
        </section>
        <section className="middle-grid">
          <article className="panel pipeline-panel"><div className="panel-heading"><div><h2>Hiring pipeline</h2><p>Candidate progression across all open roles</p></div><button className="select-button">Last 30 days <ChevronDown size={14}/></button></div><div className="pipeline-total"><strong>248</strong><span>active candidates</span><span className="pipeline-change"><ArrowUpRight size={14}/> 14.6%</span></div><div className="pipeline-bars">{[{label:'Applied',value:100,width:100},{label:'Screening',value:72,width:72},{label:'Interview',value:48,width:48},{label:'Offer',value:26,width:26},{label:'Hired',value:18,width:18}].map((x,i)=><div className="pipeline-row" key={x.label}><span>{x.label}</span><div className="bar-track"><div className={`bar-fill bar-${i}`} style={{width:x.width+'%'}}/></div><strong>{x.value}</strong></div>)}</div></article>
          <article className="panel source-panel"><div className="panel-heading"><div><h2>Candidate sources</h2><p>Where your applicants come from</p></div><button className="more-button"><MoreHorizontal/></button></div><div className="source-chart"><div className="donut"><div><strong>1,284</strong><span>Total</span></div></div><div className="source-legend">{[['LinkedIn','48%','purple'],['Company site','28%','blue'],['Referrals','16%','orange'],['Other','8%','gray']].map(x=><div key={x[0]}><i className={x[2]}/><span>{x[0]}</span><strong>{x[1]}</strong></div>)}</div></div></article>
        </section>
        <section className="bottom-grid">
          <article className="panel candidates-panel"><div className="panel-heading"><div><h2>Recent candidates</h2><p>Keep track of your latest applicants</p></div><button className="text-button">View all <ArrowUpRight size={14}/></button></div><div className="table-toolbar"><div className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search candidates..."/></div><button className="filter-button"><Filter size={15}/> Filters</button></div><div className="candidate-table"><div className="table-head"><span>Candidate</span><span>Applied for</span><span>Stage</span><span>Fit indicator</span><span/></div>{filtered.map(c=><div className="candidate-row" key={c.name}><div className="candidate-person"><div className={`candidate-avatar ${c.color}`}>{c.initials}</div><div><strong>{c.name}</strong><small>{c.date}</small></div></div><span className="candidate-role">{c.role}</span><span><i className={`stage-dot stage-${c.stage.toLowerCase()}`}/>{c.stage}</span><div className="fit-cell"><div className="fit-track"><i style={{width:c.score+'%'}}/></div><strong>{c.score}%</strong></div><button className="row-more"><MoreHorizontal size={17}/></button></div>)}</div><div className="table-note"><ShieldCheck size={14}/> Fit indicators are decision-support signals, not hiring decisions.</div></article>
          <article className="panel openings-panel"><div className="panel-heading"><div><h2>Active openings</h2><p>Your current job listings</p></div><button className="more-button"><MoreHorizontal/></button></div><div className="opening-list">{jobs.map(j=><div className="opening-item" key={j.title}><div className={`opening-icon ${j.tone}`}><BriefcaseBusiness size={17}/></div><div className="opening-info"><strong>{j.title}</strong><small>{j.team} · {j.location}</small><div className="opening-meta"><span><Users size={13}/>{j.count} applicants</span><i/></div></div></div>)}</div><button className="button create-job"><Plus size={15}/> Create job opening</button></article>
        </section>
        <footer className="footer"><span>© 2026 TalentFlow AI</span><span>Built for thoughtful hiring <Sparkles size={13}/></span></footer>
      </div>
    </main>
  </div>;
}

export default App;
