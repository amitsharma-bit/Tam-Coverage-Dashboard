const STATES = DATA.states, ACCOUNTS = DATA.accounts;
const REAL_TEAMS = DATA.realTeams, ACCT_TEAMS = DATA.acctTeams;
const UNASSIGNED_IDX = ACCT_TEAMS.indexOf('Unassigned');
const STAGES = DATA.stages; // account stageIdx order
const STAGE_META = {
  'All':            {ramp:[[223,233,229],[12,75,68]],  hex:'#0C4B44', bg:'#E4EEEB'},
  'Prospect':       {ramp:[[253,234,219],[193,88,20]], hex:'#C25814', bg:'#FBEAD9'},
  'In Pipeline':    {ramp:[[255,247,210],[181,140,12]],hex:'#9C7A0A', bg:'#F7EFCB'},
  'Contract Closed':{ramp:[[222,240,228],[30,110,60]], hex:'#1E6E3C', bg:'#E1F0E4'},
  'Drop Off':       {ramp:[[248,223,218],[168,45,30]], hex:'#A82D1E', bg:'#F6E2DD'},
};
const STAGE_ORDER = ['All','Prospect','In Pipeline','Contract Closed','Drop Off'];
const NOSTATE='__nostate__';
const fmt = n => (n==null?'—':n.toLocaleString('en-US'));
const fmtUsd = n => n==null?'—':('$'+n.toLocaleString('en-US'));
const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// Account row field indices (see build/build_data.py for the pipeline that produces these)
const F = { COMPANY:0, GROUP:1, OWNER:2, TEAM_IDX:3, STAGE_IDX:4, CITY:5, DMS:6,
            USED_CARS:7, NEW_CARS:8, OEM:9, LAT:10, LNG:11, RANK:12, ARR_SALES:13,
            CONTRACTED_ARR:14, CRM_PLATFORM:15, CRM_SCHEDULER:16, CONTACTS:17,
            DOMAIN:18, LAST_ACTIVITY:19 };

let mapMode = 'pen';  // All-view colouring: 'pen' (penetration heat) | 'opp' (opportunity bivariate)
let level = 'co';     // map basis: 'co' (companies / Org) | 'rf' (rooftops / Company ID)
let scope = 'tam';    // 'tam' (whole market) | 'spyne' (assigned only)
let teamSel_ = 'All'; // dropdown value: 'All' | <real team> | 'Not assigned'
let stage = 'All';    // stage key
let selected = null;
let team = 'All';     // resolved precomputed cell key (kept in sync via syncTeam)
let rankFilter = false; // "Top 150 only" chip

function syncTeam(){
  if(teamSel_==='Not assigned') team='Unassigned';
  else if(teamSel_!=='All') team=teamSel_;
  else team = (scope==='spyne') ? 'Spyne' : 'All';
}

// ---- cell accessor ----
const VIDX = {'All':0,'Prospect':1,'In Pipeline':2,'Contract Closed':3,'Drop Off':4};
const ZERO=[0,0,0,0,0];
function cellVecs(stateName, tk){
  const s = STATES[stateName]; if(!s) return {co:ZERO, rf:ZERO};
  return (s.cells[tk]) || {co:ZERO, rf:ZERO};
}
function coVal(stateName, tk, sk){ return cellVecs(stateName,tk).co[VIDX[sk]]; }
function rfVal(stateName, tk, sk){ return cellVecs(stateName,tk).rf[VIDX[sk]]; }
function cell(stateName, tk, sk){ return [coVal(stateName,tk,sk), rfVal(stateName,tk,sk)]; }
function levelVal(stateName, sk){ return level==='rf' ? rfVal(stateName,team,sk) : coVal(stateName,team,sk); }
function metricVal(stateName){ return levelVal(stateName, stage); }

// ---- color ----
function fillFor(v, maxV, sk){
  const m = STAGE_META[sk];
  if(!v || !maxV) return m.ramp[0];
  const t = Math.sqrt(v/maxV);
  return m.ramp[0].map((lo,i)=>Math.round(lo+(m.ramp[1][i]-lo)*t));
}
function rampCss(sk){
  const m = STAGE_META[sk];
  return `linear-gradient(to right, rgb(${m.ramp[0].join(',')}), rgb(${m.ramp[1].join(',')}))`;
}
const HEAT_RED=[192,57,43], HEAT_AMB=[232,163,61], HEAT_GRN=[30,132,73];
const lerpArr=(a,b,u)=>a.map((x,i)=>Math.round(x+(b[i]-x)*u));
function heatArr(t){ t=Math.max(0,Math.min(1,t)); return t<.5?lerpArr(HEAT_RED,HEAT_AMB,t/.5):lerpArr(HEAT_AMB,HEAT_GRN,(t-.5)/.5); }
function penOf(name){ const tot=levelVal(name,'All'); return tot?levelVal(name,'Contract Closed')/tot*100:null; }
function rgb(c){ return `rgb(${c[0]},${c[1]},${c[2]})`; }

// ---- build team select ----
const teamSel = document.getElementById('team-select');
const TEAM_OPTS = ['All', ...REAL_TEAMS, 'Not assigned'];
teamSel.innerHTML = TEAM_OPTS.map(t=>`<option value="${esc(t)}">${t==='All'?'All teams':esc(t)}</option>`).join('');
teamSel.addEventListener('change', ()=>{ teamSel_ = teamSel.value; refresh(); });

const scopeToggle = document.getElementById('scope-toggle');
scopeToggle.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ scope=b.dataset.scope; refresh(); }));

const mapModeEl = document.getElementById('map-mode');
mapModeEl.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
  mapMode=b.dataset.mode;
  mapModeEl.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x.dataset.mode===mapMode));
  refresh();
}));

const levelToggleEl = document.getElementById('level-toggle');
levelToggleEl.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
  level=b.dataset.level;
  levelToggleEl.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x.dataset.level===level));
  refresh();
}));

const stageChipsEl = document.getElementById('stage-chips');
stageChipsEl.innerHTML = STAGE_ORDER.map(sk=>{
  const m = STAGE_META[sk];
  const label = sk==='All'?'All (total)':(sk==='In Pipeline'?'In Pipeline':sk);
  return `<button class="stage-chip" type="button" data-stage="${sk}"><span class="dot" style="background:${m.hex}"></span>${label}</button>`;
}).join('');
stageChipsEl.querySelectorAll('.stage-chip').forEach(b=>b.addEventListener('click',()=>{ stage=b.dataset.stage; refresh(); }));

// ---- satellite basemap layers (shared style for both maps) ----
const ESRI_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const US_BOUNDS = [[15,-135],[55,-58]]; // continental US + AK/HI margin, keeps panning from wandering into Canada/Mexico/oceans
function addSatelliteLayers(map){
  L.tileLayer(ESRI_IMAGERY, { maxZoom: 17, attribution: 'Imagery &copy; Esri' }).addTo(map);
  if(!map.getPane('labelsPane')){
    const pane = map.createPane('labelsPane');
    pane.style.zIndex = 450; // above tile pane (200), below markers (600)
    pane.style.pointerEvents = 'none';
  }
  L.tileLayer(ESRI_LABELS, { maxZoom: 17, opacity: 1, pane: 'labelsPane', className: 'labels-tile' }).addTo(map);
}

// ---- national US map (Leaflet + real state GeoJSON) ----
const stateFeatureByName = {};
(DATA.usStates.features||[]).forEach(f=>{ stateFeatureByName[f.properties.name]=f; });

const usMap = L.map('usmap', { scrollWheelZoom:true, minZoom:4, maxZoom:10, worldCopyJump:false,
  maxBounds:US_BOUNDS, maxBoundsViscosity:1.0 })
  .setView([39.6,-98.5], 4);
addSatelliteLayers(usMap);
const pathEls = {}; // state name -> Leaflet GeoJSON layer

function styleForState(){ return { color:'#fff', weight:1, fillOpacity:0.62, fillColor:'#ececec' }; }
const usGeoLayer = L.geoJSON(DATA.usStates, {
  style: styleForState,
  onEachFeature: (feature, layer) => {
    const name = feature.properties.name;
    if(!STATES[name]){ layer.setStyle({fillOpacity:0.12, fillColor:'#888', weight:0.5, color:'#fff8'}); layer.options.interactive=false; return; }
    pathEls[name] = layer;
    layer.on('click', ()=>select(name));
    layer.on('mousemove', e=>showTip(e.originalEvent,name));
    layer.on('mouseout', hideTip);
  }
}).addTo(usMap);

// ---- tooltip (national map) ----
const tip = document.getElementById('tooltip');
function showTip(e,name){
  const c = cell(name, team, stage);
  const stg = stage==='All'?'total':stage;
  const penLine = stage==='All' ? (()=>{ const p=penOf(name); return p==null?'':`<div class="tt-row"><b>${p.toFixed(1)}%</b> penetration (Closed)</div>`; })() : '';
  tip.innerHTML = `<div class="tt-name">${name}</div>
    <div class="tt-row">${fmt(c[0])} companies &middot; ${fmt(c[1])} rooftops</div>
    ${penLine}
    <div class="tt-row" style="opacity:.62">${scopeLabel()} &middot; ${stg}</div>`;
  tip.style.display='block';
  const pad=14; let x=e.clientX+pad,y=e.clientY+pad; const r=tip.getBoundingClientRect();
  if(x+r.width>window.innerWidth-8) x=e.clientX-r.width-pad;
  if(y+r.height>window.innerHeight-8) y=e.clientY-r.height-pad;
  tip.style.left=x+'px'; tip.style.top=y+'px';
}
function hideTip(){ tip.style.display='none'; }

// ---- recolor + legend + kpis ----
function recolor(){
  const legRamp=document.getElementById('legend-ramp');
  const legMin=document.getElementById('legend-min'), legMax=document.getElementById('legend-max');
  const legMet=document.getElementById('legend-metric');
  document.getElementById('map-mode').hidden = (stage!=='All');
  if(stage==='All'){
    let pmin=Infinity,pmax=-Infinity,maxTot=0;
    for(const name in pathEls){ const p=penOf(name); if(p!=null){ if(p<pmin)pmin=p; if(p>pmax)pmax=p; } const t=levelVal(name,'All'); if(t>maxTot)maxTot=t; }
    if(!isFinite(pmin)){ pmin=0; pmax=1; }
    const span=(pmax-pmin)||1;
    for(const name in pathEls){
      const p=penOf(name);
      if(p==null){ pathEls[name].setStyle({fillColor:'rgb(236,238,236)'}); continue; }
      const t=(p-pmin)/span; const base=heatArr(t);
      let c=base;
      if(mapMode==='opp'){ const depth=0.22+0.78*Math.sqrt(levelVal(name,'All')/(maxTot||1)); c=lerpArr([245,246,244],base,depth); }
      pathEls[name].setStyle({fillColor:rgb(c)});
    }
    const lvl = level==='rf'?'rooftop':'company';
    legRamp.style.background=`linear-gradient(to right,rgb(${HEAT_RED.join(',')}),rgb(${HEAT_AMB.join(',')}),rgb(${HEAT_GRN.join(',')}))`;
    legMin.textContent=pmin.toFixed(1)+'%'; legMax.textContent=pmax.toFixed(1)+'%';
    legMet.textContent = (mapMode==='opp'?`opportunity · ${lvl} penetration × size`:`${lvl} penetration (Closed ÷ total)`);
  } else {
    let maxV=0;
    for(const name in pathEls){ const v=metricVal(name); if(v>maxV) maxV=v; }
    for(const name in pathEls){ pathEls[name].setStyle({fillColor:rgb(fillFor(metricVal(name), maxV, stage))}); }
    legRamp.style.background = rampCss(stage);
    legMin.textContent='0'; legMax.textContent=fmt(maxV);
    legMet.textContent = stage+(level==='rf'?' rooftops':' companies')+' per state';
  }
  for(const name in pathEls){
    pathEls[name].setStyle({ weight: name===selected?3:1, color: name===selected?'#18231F':'#fff' });
    if(name===selected) pathEls[name].bringToFront();
  }
  let cSum=0,rSum=0,stWith=0;
  for(const name in STATES){ const c=cell(name,team,stage); cSum+=c[0]; rSum+=c[1]; if(c[0]>0 && name!=='Ontario') stWith++; }
  document.getElementById('kpi-companies').textContent = fmt(cSum);
  document.getElementById('kpi-rooftops').textContent = fmt(rSum);
  document.getElementById('kpi-states').textContent = stWith;
  const lvlw = level==='rf'?'rooftop':'company';
  document.getElementById('map-hint').textContent = stage==='All'
    ? (mapMode==='opp'
        ? `Colour = ${lvlw} penetration, depth = size · ${scopeLabel()}. Deep red = big & untapped. Click a state.`
        : `Colour = ${lvlw} penetration (green = won, red = whitespace) · ${scopeLabel()}. Click a state.`)
    : `Darker = more "${stage}" ${level==='rf'?'rooftops':'companies'} · ${scopeLabel()}. Click a state.`;
}

// ---- panel ----
const panel = document.getElementById('panel');
const pctS = (a,b)=> b ? (a/b*100) : 0;
function penBaseLabel(){
  if(teamSel_==='Not assigned') return 'Unassigned';
  if(teamSel_!=='All') return 'Team';
  return scope==='spyne' ? 'Spyne' : 'TAM';
}
function scopeLabel(){
  if(teamSel_==='Not assigned') return 'TAM · not assigned';
  if(teamSel_!=='All') return teamSel_;
  return scope==='spyne' ? 'Spyne · all assigned' : 'TAM · whole market';
}
function penCard(kind, vec){
  const [tot,,ip,cc] = vec;
  const tam = pctS(cc, tot);
  const spineBase = ip + cc;
  const spInDisc = pctS(ip, spineBase);
  const spClosed = pctS(cc, spineBase);
  const head = kind==='gd' ? 'Company level' : 'Rooftop level';
  const unit = kind==='gd' ? 'companies' : 'rooftops';
  return `<div class="pen-card ${kind}">
    <div class="pen-head">${head}</div>
    <div class="pen-top"><div class="pen-pct">${tam.toFixed(1)}%</div>
      <div class="pen-lbl2">${penBaseLabel()}<br>penetration</div></div>
    <div class="pen-bar"><div class="pen-fill" style="width:${Math.min(tam,100).toFixed(1)}%"></div></div>
    <div class="pen-frac2">${fmt(cc)} of ${fmt(tot)} ${unit} closed</div>
    <div class="pen-spine">
      <div class="spine-row"><span>Spine · In Discussion</span><b>${spInDisc.toFixed(1)}%</b></div>
      <div class="spine-row"><span>Spine · Contract Closed</span><b>${spClosed.toFixed(1)}%</b></div>
    </div>
  </div>`;
}
function penetrationBlock(co, rf){
  return `<div class="pen-wrap">${penCard('gd',co)}${penCard('rf',rf)}</div>
    <div class="pen-note">TAM penetration = Contract&nbsp;Closed &divide; total. Spine = active pipeline only (In&nbsp;Discussion + Contract&nbsp;Closed; Prospect &amp; Drop&#8209;off excluded).</div>`;
}
function stageRows(co, rf){
  return STAGES.map((sk,i)=>{
    const m = STAGE_META[sk];
    const activeCls = (sk===stage)?' class="active-stage"':'';
    return `<tr${activeCls}>
      <td class="name"><span class="swatch" style="background:${m.hex}"></span>${sk}</td>
      <td>${fmt(co[i+1])}</td><td>${fmt(rf[i+1])}</td></tr>`;
  }).join('');
}
function renderDetail(name){
  const v = cellVecs(name, team);
  panel.innerHTML = `
    <span class="region-chip">${name==='Ontario'?'Canada':'USA'}</span>
    <h2>${name}</h2>
    <div class="totals">
      <div><div class="num">${fmt(v.co[0])}</div><div class="lbl">Companies</div></div>
      <div><div class="num">${fmt(v.rf[0])}</div><div class="lbl">Rooftops</div></div>
    </div>
    ${penetrationBlock(v.co, v.rf)}
    <table class="statuses">
      <thead><tr><th>Lifecycle stage</th><th>Companies</th><th>Rooftops</th></tr></thead>
      <tbody>${stageRows(v.co, v.rf)}</tbody>
    </table>
    <button class="reset" type="button" id="reset-btn">&larr; Back to overview</button>`;
  document.getElementById('reset-btn').addEventListener('click', ()=>select(null));
}
function renderOverview(){
  const co=[0,0,0,0,0], rf=[0,0,0,0,0];
  for(const name in STATES){ if(name==='Ontario')continue; const v=cellVecs(name,team); for(let i=0;i<5;i++){co[i]+=v.co[i]; rf[i]+=v.rf[i];} }
  const top=Object.keys(STATES).filter(n=>n!=='Ontario').map(n=>[n,cellVecs(n,team)]).sort((a,b)=>coValV(b[1])-coValV(a[1])).slice(0,6);
  panel.innerHTML=`
    <span class="region-chip">${scopeLabel()}</span>
    <h2>Overview</h2>
    <div class="totals">
      <div><div class="num">${fmt(co[0])}</div><div class="lbl">Companies</div></div>
      <div><div class="num">${fmt(rf[0])}</div><div class="lbl">Rooftops</div></div>
    </div>
    ${penetrationBlock(co, rf)}
    <table class="statuses">
      <thead><tr><th>Lifecycle stage</th><th>Companies</th><th>Rooftops</th></tr></thead>
      <tbody>${stageRows(co, rf)}</tbody>
    </table>
    <table class="statuses" style="margin-top:16px">
      <thead><tr><th>Top states${stage==='All'?'':' ('+stage+')'}</th><th>Cos.</th><th>Roofs</th></tr></thead>
      <tbody>${top.map(([n,v])=>`<tr><td class="name">${n}</td><td>${fmt(v.co[VIDX[stage]])}</td><td>${fmt(v.rf[VIDX[stage]])}</td></tr>`).join('')}</tbody>
    </table>`;
}
function coValV(v){ return v.co[VIDX[stage]]; }

// ---- column visibility + sort helper (shared by both account tables) ----
function initColsMenu(menuEl, btnEl, columns, visibleSet, onChange){
  menuEl.innerHTML = columns.filter(c=>!c.always).map(c=>
    `<label><input type="checkbox" data-key="${c.key}" ${visibleSet.has(c.key)?'checked':''}> ${c.label}</label>`
  ).join('');
  menuEl.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.addEventListener('change',()=>{
    if(cb.checked) visibleSet.add(cb.dataset.key); else visibleSet.delete(cb.dataset.key);
    onChange();
  }));
  btnEl.addEventListener('click', e=>{ e.stopPropagation(); menuEl.hidden = !menuEl.hidden; });
  document.addEventListener('click', e=>{ if(!menuEl.hidden && !menuEl.contains(e.target) && e.target!==btnEl) menuEl.hidden=true; });
}
function buildSortableHead(theadRow, columns, visibleSet, sortState, onSort){
  theadRow.innerHTML = '<th></th>' + columns.filter(c=>c.always||visibleSet.has(c.key)).map(c=>{
    const active = sortState.key===c.key;
    const arrow = active ? (sortState.dir===1?'&#9650;':'&#9660;') : '&#9650;';
    return `<th class="sortable${active?' sort-active':''}" data-key="${c.key}">${c.label}<span class="sort-arrow">${arrow}</span></th>`;
  }).join('');
  theadRow.querySelectorAll('th.sortable').forEach(th=>th.addEventListener('click',()=>{
    const key=th.dataset.key;
    if(sortState.key===key) sortState.dir*=-1; else { sortState.key=key; sortState.dir=1; }
    onSort();
  }));
}
function sortByColumn(rows, columns, sortState){
  if(!sortState.key) return rows;
  const col = columns.find(c=>c.key===sortState.key);
  if(!col) return rows;
  return rows.slice().sort((a,b)=>{
    const va=col.sortVal(a), vb=col.sortVal(b);
    if(va<vb) return -1*sortState.dir;
    if(va>vb) return 1*sortState.dir;
    return 0;
  });
}

// ---- account list ----
const accCard=document.getElementById('accounts-card');
const accTitle=document.getElementById('accounts-title');
const accCount=document.getElementById('accounts-count');
const accBody=document.getElementById('accounts-body');
const accSearch=document.getElementById('accounts-search');
let listRows=[];
let curState=null;
let cityFilter=null;
function accountsFor(name){ return ACCOUNTS[name===NOSTATE?'':name] || []; }
function teamName(idx){ const t=ACCT_TEAMS[idx]; return t==='Unassigned'?'Not assigned':(t||'—'); }
function acctTeamMatch(a){
  const isUn = a[F.TEAM_IDX]===UNASSIGNED_IDX;
  if(team==='All') return true;
  if(team==='Spyne') return !isUn;
  if(team==='Unassigned') return isUn;
  return ACCT_TEAMS[a[F.TEAM_IDX]]===team;
}
function passRank(a){ return !rankFilter || a[F.RANK]===1; }
function stageTag(idx){ if(idx==null||idx<0) return '<span style="color:var(--ink-soft)">&mdash;</span>'; const s=STAGES[idx], m=STAGE_META[s]; return `<span class="stage-tag" style="color:${m.hex};background:${m.bg}"><span class="sw" style="background:${m.hex}"></span>${s}</span>`; }

const ACC_COLUMNS = [
  { key:'company', label:'Company', always:true,
    sortVal:a=>(a[F.COMPANY]||'').toLowerCase(),
    td:a=>`<td class="co">${esc(a[F.COMPANY])||'&mdash;'}${a[F.RANK]===1?' <span class="stage-tag" style="color:#9C7A0A;background:#F7EFCB;margin-left:4px">Top 150</span>':''}</td>` },
  { key:'group', label:'Group', sortVal:a=>(a[F.GROUP]||'').toLowerCase(), td:a=>`<td class="muted">${esc(a[F.GROUP])||'&mdash;'}</td>` },
  { key:'owner', label:'Owner', sortVal:a=>(a[F.OWNER]||'').toLowerCase(), td:a=>`<td>${esc(a[F.OWNER])||'&mdash;'}</td>` },
  { key:'team', label:'Team', sortVal:a=>teamName(a[F.TEAM_IDX]).toLowerCase(), td:a=>`<td class="muted">${esc(teamName(a[F.TEAM_IDX]))}</td>` },
  { key:'stage', label:'Stage', sortVal:a=>STAGES[a[F.STAGE_IDX]]||'', td:a=>`<td>${stageTag(a[F.STAGE_IDX])}</td>` },
  { key:'oem', label:'OEM', sortVal:a=>(a[F.OEM]||'').toLowerCase(), td:a=>`<td class="muted">${esc(a[F.OEM])||'&mdash;'}</td>` },
];
const accVisibleCols = new Set(ACC_COLUMNS.filter(c=>!c.always).map(c=>c.key));
const accSortState = { key:null, dir:1 };
initColsMenu(document.getElementById('accounts-cols-menu'), document.getElementById('accounts-cols-btn'), ACC_COLUMNS, accVisibleCols, renderRows);

function renderRows(){
  const q=accSearch.value.trim().toLowerCase();
  let rows=listRows.filter(a=>{
    if(!acctTeamMatch(a)) return false;
    if(!passRank(a)) return false;
    if(stage!=='All' && STAGES[a[F.STAGE_IDX]]!==stage) return false;
    if(cityFilter && (a[F.CITY]||'')!==cityFilter) return false;
    if(q && !((a[F.COMPANY]||'').toLowerCase().includes(q)||(a[F.GROUP]||'').toLowerCase().includes(q)
              ||(a[F.OWNER]||'').toLowerCase().includes(q)||(a[F.CITY]||'').toLowerCase().includes(q)
              ||(a[F.OEM]||'').toLowerCase().includes(q))) return false;
    return true;
  });
  rows = sortByColumn(rows, ACC_COLUMNS, accSortState);
  const visCols = ACC_COLUMNS.filter(c=>c.always||accVisibleCols.has(c.key));
  buildSortableHead(document.getElementById('accounts-thead-row'), ACC_COLUMNS, accVisibleCols, accSortState, renderRows);
  if(curState && curState!==NOSTATE){
    accTitle.innerHTML = cityFilter
      ? `${curState} &middot; <b>${esc(cityFilter)}</b> <button id="city-clear" style="border:1px solid var(--line);background:none;border-radius:12px;padding:2px 10px;font-size:11px;cursor:pointer;color:var(--ink-soft);margin-left:6px">&times; clear city</button>`
      : `${curState} — account list`;
    const cc=document.getElementById('city-clear'); if(cc) cc.addEventListener('click',()=>{cityFilter=null; renderRows(); if(typeof renderStateMap==='function') renderStateMap();});
  }
  accCount.textContent=`${fmt(rows.length)} of ${fmt(listRows.length)} rooftops`;
  const colspan = visCols.length+1;
  if(!rows.length){ accBody.innerHTML=`<tr><td colspan="${colspan}"><div class="accounts-empty">No accounts match the current filters.</div></td></tr>`; return; }
  accBody.innerHTML=rows.map((a,i)=>{
    return `<tr class="acc-row" data-i="${i}">
        <td><span class="acc-caret">&#9656;</span></td>
        ${visCols.map(c=>c.td(a)).join('')}
      </tr>
      <tr class="detail-row" data-di="${i}" hidden><td colspan="${colspan}"><div class="detail-inner">
        <div class="dfield"><div class="dlbl">Company owner</div><div class="dval">${esc(a[F.OWNER])||'&mdash;'}</div></div>
        <div class="dfield"><div class="dlbl">Dealership group</div><div class="dval">${esc(a[F.GROUP])||'&mdash;'}</div></div>
        <div class="dfield"><div class="dlbl">Lifecycle stage</div><div class="dval">${STAGES[a[F.STAGE_IDX]]||'&mdash;'}</div></div>
        <div class="dfield"><div class="dlbl">City</div><div class="dval">${esc(a[F.CITY])||'&mdash;'}</div></div>
        <div class="dfield"><div class="dlbl">DMS</div><div class="dval">${esc(a[F.DMS])||'&mdash;'}</div></div>
        <div class="dfield"><div class="dlbl">Used cars</div><div class="dval">${fmt(a[F.USED_CARS])}</div></div>
        <div class="dfield"><div class="dlbl">New cars</div><div class="dval">${fmt(a[F.NEW_CARS])}</div></div>
        <div class="dfield"><div class="dlbl">OEM</div><div class="dval">${esc(a[F.OEM])||'&mdash;'}</div></div>
        <div class="dfield"><div class="dlbl">HubSpot team</div><div class="dval">${esc(teamName(a[F.TEAM_IDX]))}</div></div>
        <div class="dfield"><div class="dlbl">Dealership rank</div><div class="dval">${a[F.RANK]===1?'Top 150':'&mdash;'}</div></div>
        <div class="dfield"><div class="dlbl">ARR (Sales)</div><div class="dval">${fmtUsd(a[F.ARR_SALES])}</div></div>
        <div class="dfield"><div class="dlbl">Contracted ARR</div><div class="dval">${fmtUsd(a[F.CONTRACTED_ARR])}</div></div>
        <div class="dfield"><div class="dlbl">CRM platform</div><div class="dval">${esc(a[F.CRM_PLATFORM])||'&mdash;'}</div></div>
        <div class="dfield"><div class="dlbl">CRM service scheduler</div><div class="dval">${esc(a[F.CRM_SCHEDULER])||'&mdash;'}</div></div>
        <div class="dfield"><div class="dlbl">Associated contacts</div><div class="dval">${fmt(a[F.CONTACTS])}</div></div>
        <div class="dfield"><div class="dlbl">Domain</div><div class="dval">${esc(a[F.DOMAIN])||'&mdash;'}</div></div>
        <div class="dfield"><div class="dlbl">Last activity</div><div class="dval">${esc(a[F.LAST_ACTIVITY])||'&mdash;'}</div></div>
      </div></td></tr>`;
  }).join('');
  accBody.querySelectorAll('.acc-row').forEach(tr=>tr.addEventListener('click',()=>{
    const i=tr.dataset.i; const open=tr.classList.toggle('open');
    const d=accBody.querySelector(`.detail-row[data-di="${i}"]`); if(d) d.hidden=!open;
  }));
}
function showAccounts(name){
  listRows=accountsFor(name);
  curState=name; cityFilter=null;
  accSearch.value='';
  accTitle.textContent = name===NOSTATE?'Accounts with no state assigned':`${name} — account list`;
  accCard.hidden=false;
  renderRows();
}
accSearch.addEventListener('input', renderRows);

const rankChip=document.getElementById('rank-chip');
rankChip.addEventListener('click',()=>{
  rankFilter=!rankFilter;
  rankChip.classList.toggle('selected', rankFilter);
  renderRows();
  if(curState && curState!==NOSTATE) renderStateMap();
});

// ---- state rooftop map (drill-down, Leaflet satellite + real lat/lng dots) ----
const smCard=document.getElementById('statemap-card');
const smLegend=document.getElementById('sm-legend');
let smLabMode='major', smHidden=new Set();
document.querySelectorAll('#sm-labseg button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('#sm-labseg button').forEach(x=>x.classList.toggle('active',x===b));
  smLabMode=b.dataset.lab; renderStateMap();
}));
function dotStage(a){ return a[F.STAGE_IDX]; }

let stateMap=null, smOutlineLayer=null, smMarkersLayer=null, smLabelsLayer=null, smFitBounds=null;

function renderStateMap(){
  const feature = stateFeatureByName[curState];
  if(!curState || curState===NOSTATE || !feature){ smCard.hidden=true; return; }
  smCard.hidden=false;
  const targetState = curState;
  const bounds = L.geoJSON(feature).getBounds(); // pure geometry, no map needed
  smFitBounds = bounds;

  // Defer to next frame: the container may have just been unhidden/resized, and on first
  // creation Leaflet needs a valid view (via fitBounds, called BEFORE any layer is added)
  // or vector-layer rendering crashes / silently mis-sizes.
  requestAnimationFrame(()=>{
    if(curState !== targetState) return; // a newer selection has already superseded this one
    if(!stateMap){
      stateMap = L.map('statemap', { scrollWheelZoom:true, minZoom:3, maxZoom:16 });
      stateMap.fitBounds(bounds, {padding:[24,24]});
      addSatelliteLayers(stateMap);
      smOutlineLayer = L.layerGroup().addTo(stateMap);
      smMarkersLayer = L.layerGroup().addTo(stateMap);
      smLabelsLayer = L.layerGroup().addTo(stateMap);
    } else {
      stateMap.fitBounds(bounds, {padding:[24,24]});
    }
    // keep pan/zoom confined to roughly this state, so it reads as a city/state map, not a
    // scrollable window onto the whole country
    stateMap.setMaxBounds(bounds.pad(0.4));

    smOutlineLayer.clearLayers(); smMarkersLayer.clearLayers(); smLabelsLayer.clearLayers();
    L.geoJSON(feature, { style:{ color:'#fff', weight:2.5, fillColor:'#fff', fillOpacity:0.06 } }).addTo(smOutlineLayer);

    const rowsAll=accountsFor(curState).filter(a=>acctTeamMatch(a) && passRank(a) && (stage==='All'||STAGES[a[F.STAGE_IDX]]===stage));
    const plot=rowsAll.filter(a=>a[F.LAT]!=null && a[F.LNG]!=null && !smHidden.has(dotStage(a)));

    for(const a of plot){
      const s=dotStage(a); if(s==null||s<0) continue; const m=STAGE_META[STAGES[s]];
      const marker = L.circleMarker([a[F.LAT],a[F.LNG]], { radius:5, color:'#fff', weight:1, fillColor:m.hex, fillOpacity:0.85 });
      marker.bindTooltip(`<b>${esc(a[F.COMPANY])||'—'}</b><br>${esc(a[F.CITY])||'—'} · <span style="color:${m.hex}">${STAGES[s]}</span>`, {direction:'top', offset:[0,-4]});
      marker.on('click', ()=>pickCity(a[F.CITY]));
      marker.addTo(smMarkersLayer);
    }

    const cityAgg={};
    for(const a of rowsAll){ if(a[F.LAT]==null) continue; const c=a[F.CITY]; if(!c||c.toLowerCase()===curState.toLowerCase()) continue; (cityAgg[c]=cityAgg[c]||[0,0,0]); cityAgg[c][0]+=a[F.LAT]; cityAgg[c][1]+=a[F.LNG]; cityAgg[c][2]++; }
    let labs=Object.entries(cityAgg).map(([c,v])=>[c,v[0]/v[2],v[1]/v[2],v[2]]).sort((p,q)=>q[3]-p[3]);
    if(smLabMode!=='off'){
      const list = smLabMode==='all'? labs : labs.slice(0,26);
      for(const [c,lat,lng,n] of list){
        const sizeCls = n>150?'lg':n>40?'md':'sm';
        L.marker([lat,lng], { icon: L.divIcon({ className:'sm-city-label '+sizeCls, html: esc(c), iconSize:null }), interactive:true })
          .on('click', ()=>pickCity(c))
          .addTo(smLabelsLayer);
      }
    }

    document.getElementById('sm-title').textContent = `${curState} — rooftop map`;
    document.getElementById('sm-sub').textContent = `${fmt(plot.length)} rooftops plotted by postal code · ${labs.length} cities · coloured by lifecycle stage. Click a city to filter the list.`;
    const counts=[0,0,0,0]; for(const a of rowsAll){ const s=dotStage(a); if(s!=null&&s>=0) counts[s]++; }
    smLegend.innerHTML = STAGES.map((s,i)=>`<span class="item ${smHidden.has(i)?'off':''}" data-i="${i}"><span class="dot" style="background:${STAGE_META[s].hex}"></span>${s} <span class="n">${fmt(counts[i])}</span></span>`).join('');
    smLegend.querySelectorAll('.item').forEach(el=>el.addEventListener('click',()=>{const i=+el.dataset.i; if(smHidden.has(i))smHidden.delete(i);else smHidden.add(i); renderStateMap();}));

    stateMap.invalidateSize();
    stateMap.fitBounds(bounds, {padding:[24,24]});
  });
}
function pickCity(c){ if(!c) return; cityFilter=(cityFilter===c?null:c); renderRows(); accCard.scrollIntoView({behavior:'smooth',block:'nearest'}); }

document.getElementById('sm-zin').addEventListener('click',()=>{ if(stateMap) stateMap.zoomIn(); });
document.getElementById('sm-zout').addEventListener('click',()=>{ if(stateMap) stateMap.zoomOut(); });
document.getElementById('sm-zreset').addEventListener('click',()=>{ if(stateMap && smFitBounds) stateMap.fitBounds(smFitBounds, {padding:[24,24]}); });

// ---- select / refresh ----
function select(name){
  selected=name;
  if(name && name!==NOSTATE && name!=='Ontario') renderDetail(name);
  else if(name==='Ontario') renderDetail('Ontario');
  else if(name===NOSTATE) renderNoState();
  else renderOverview();
  if(name){ showAccounts(name); smHidden=new Set(); renderStateMap(); } else { accCard.hidden=true; smCard.hidden=true; curState=null; }
  ontarioChip.classList.toggle('selected', name==='Ontario');
  nostateChip.classList.toggle('selected', name===NOSTATE);
  for(const n in pathEls){
    pathEls[n].setStyle({ weight: n===name?3:1, color: n===name?'#18231F':'#fff' });
    if(n===name) pathEls[n].bringToFront();
  }
}
function refresh(){
  syncTeam();
  scopeToggle.querySelectorAll('button').forEach(b=>b.classList.toggle('active', b.dataset.scope===scope));
  if(scope==='spyne' && teamSel_==='Not assigned'){ teamSel_='All'; teamSel.value='All'; syncTeam(); }
  recolor();
  stageChipsEl.querySelectorAll('.stage-chip').forEach(b=>{
    const on=b.dataset.stage===stage; b.classList.toggle('active',on);
    b.style.background = on?STAGE_META[stage].hex:'';
  });
  if(selected && selected!==NOSTATE) renderDetail(selected==='Ontario'?'Ontario':selected);
  else if(selected===NOSTATE) renderNoState(); else renderOverview();
  if(selected) renderRows();
  if(selected && selected!==NOSTATE) renderStateMap();
  refreshChipLabels();
}

const ontarioChip=document.getElementById('ontario-chip');
const nostateChip=document.getElementById('nostate-chip');
function refreshChipLabels(){
  const o=cell('Ontario',team,stage);
  document.getElementById('ontario-label').textContent=`Ontario, Canada — ${fmt(o[0])} cos / ${fmt(o[1])} roofs`;
  const ns=(ACCOUNTS['']||[]).filter(a=>acctTeamMatch(a)&&(stage==='All'||STAGES[a[F.STAGE_IDX]]===stage)).length;
  document.getElementById('nostate-label').textContent=`No state assigned — ${fmt(ns)} rooftops`;
}
function renderNoState(){
  const rowsAll=(ACCOUNTS['']||[]).filter(a=>acctTeamMatch(a));
  const n=rowsAll.length;
  panel.innerHTML=`<span class="region-chip">No state</span><h2>No state assigned</h2>
    <p style="font-size:13px;color:var(--ink-soft);margin:0 0 8px">${fmt(n)} rooftops in this segment have no state mapped, so they don't appear on the map. See the full list below.</p>
    <button class="reset" type="button" id="reset-btn">&larr; Back to overview</button>`;
  document.getElementById('reset-btn').addEventListener('click', ()=>select(null));
}
ontarioChip.addEventListener('click',()=>select(selected==='Ontario'?null:'Ontario'));
nostateChip.addEventListener('click',()=>select(selected===NOSTATE?null:NOSTATE));

// init
teamSel.value='All';
refresh();

// ============================================================
// ---- CS Live section (separate sheet: rooftop-level, live/onboarding accounts) ----
// ============================================================
const CS = DATA_CSLIVE;
const FC = { ROOFTOP:0, GROUP:1, DOMAIN:2, CITY:3, STATE:4, PRODUCT:5, STAGE:6, ACCT_TYPE:7, CSM:8, LAT:9, LNG:10, ENT_ID:11, ROOFTOP_ID:12 };
const CS_STAGE_COLOR = { Live:'#1E6E3C', Onboarding:'#C25814' };
const CS_RAMP = STAGE_META.All.ramp; // reuse the same light->dark green ramp

let csProduct='All', csStage='All', csSelectedState=null, csCityFilter=null, csSearchQ='';
let csInited=false, csUsMap=null, csPathEls={}, csStateMap=null, csMiniOutline=null, csMiniMarkers=null, csMiniLabels=null, csMiniFit=null;

function csFilteredRows(){
  return CS.accounts.filter(a=>{
    if(csProduct!=='All' && a[FC.PRODUCT]!==csProduct) return false;
    if(csStage!=='All' && a[FC.STAGE]!==csStage) return false;
    return true;
  });
}
function csColorFor(v,maxV){
  if(!v||!maxV) return rgb(CS_RAMP[0]);
  const t=Math.sqrt(v/maxV);
  return rgb(CS_RAMP[0].map((lo,i)=>Math.round(lo+(CS_RAMP[1][i]-lo)*t)));
}
function csStateCounts(rows){
  const m={};
  for(const a of rows){ const s=a[FC.STATE]; if(!s) continue; m[s]=(m[s]||0)+1; }
  return m;
}

function csInit(){
  const chipsHtml = (opts, active) => opts.map(o=>`<button class="stage-chip" type="button" data-v="${o}">${o}</button>`).join('');
  const prodEl = document.getElementById('cs-product-chips');
  prodEl.innerHTML = chipsHtml(['All','Studio','Vini']);
  prodEl.querySelectorAll('.stage-chip').forEach(b=>b.addEventListener('click',()=>{ csProduct=b.dataset.v; csRefresh(); }));
  const stgEl = document.getElementById('cs-stage-chips');
  stgEl.innerHTML = chipsHtml(['All','Live','Onboarding']);
  stgEl.querySelectorAll('.stage-chip').forEach(b=>b.addEventListener('click',()=>{ csStage=b.dataset.v; csRefresh(); }));

  csUsMap = L.map('cs-usmap', { scrollWheelZoom:true, minZoom:4, maxZoom:10, worldCopyJump:false,
    maxBounds:US_BOUNDS, maxBoundsViscosity:1.0 }).setView([39.6,-98.5], 4);
  addSatelliteLayers(csUsMap);
  L.geoJSON(DATA.usStates, {
    style: ()=>({ color:'#fff', weight:1, fillOpacity:0.6, fillColor:'#ececec' }),
    onEachFeature: (feature, layer) => {
      const name = feature.properties.name;
      csPathEls[name] = layer;
      layer.on('click', ()=>{ csSelectedState = (csSelectedState===name?null:name); csCityFilter=null; csRefresh(); });
      layer.on('mousemove', e=>csShowTip(e.originalEvent,name));
      layer.on('mouseout', hideTip);
    }
  }).addTo(csUsMap);

  document.getElementById('cs-accounts-search').addEventListener('input', e=>{ csSearchQ=e.target.value.trim().toLowerCase(); csRenderTable(); });

  csRefresh();
}

function csShowTip(e,name){
  const rows = csFilteredRows().filter(a=>a[FC.STATE]===name);
  if(!rows.length){ hideTip(); return; }
  const companies = new Set(rows.map(a=>a[FC.ENT_ID])).size;
  tip.innerHTML = `<div class="tt-name">${name}</div><div class="tt-row">${fmt(companies)} companies &middot; ${fmt(rows.length)} rooftops</div>`;
  tip.style.display='block';
  const pad=14; let x=e.clientX+pad,y=e.clientY+pad; const r=tip.getBoundingClientRect();
  if(x+r.width>window.innerWidth-8) x=e.clientX-r.width-pad;
  if(y+r.height>window.innerHeight-8) y=e.clientY-r.height-pad;
  tip.style.left=x+'px'; tip.style.top=y+'px';
}

function csRecolor(){
  const rows = csFilteredRows();
  const counts = csStateCounts(rows);
  let maxV=0; for(const n in counts) if(counts[n]>maxV) maxV=counts[n];
  for(const name in csPathEls){
    const v = counts[name]||0;
    csPathEls[name].setStyle({ fillColor: v?csColorFor(v,maxV):'rgb(236,238,236)',
      weight: name===csSelectedState?3:1, color: name===csSelectedState?'#18231F':'#fff' });
    if(name===csSelectedState) csPathEls[name].bringToFront();
  }
  const legRamp=document.getElementById('cs-legend-ramp');
  legRamp.style.background=`linear-gradient(to right, ${rgb(CS_RAMP[0])}, ${rgb(CS_RAMP[1])})`;

  const companies = new Set(rows.map(a=>a[FC.ENT_ID])).size;
  const statesWith = Object.keys(counts).length;
  document.getElementById('cs-kpi-companies').textContent = fmt(companies);
  document.getElementById('cs-kpi-rooftops').textContent = fmt(rows.length);
  document.getElementById('cs-kpi-states').textContent = statesWith;
}

function csStageRow(stage, count, total){
  const c = CS_STAGE_COLOR[stage]||'#5A6663';
  const pct = total?Math.round(count/total*100):0;
  return `<div class="cs-stage-row"><span class="dot" style="background:${c}"></span>${stage}<b>${fmt(count)}</b></div>
    <div class="cs-stat-bar"><div style="width:${pct}%;background:${c}"></div></div>`;
}

function csRenderPanel(){
  const panelEl = document.getElementById('cs-panel');
  const rows = csFilteredRows();
  if(!csSelectedState){
    const companies = new Set(rows.map(a=>a[FC.ENT_ID])).size;
    const counts = csStateCounts(rows);
    const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
    panelEl.innerHTML = `<span class="region-chip">Overview</span><h2>All states</h2>
      <div class="totals">
        <div><div class="num">${fmt(companies)}</div><div class="lbl">Companies</div></div>
        <div><div class="num">${fmt(rows.length)}</div><div class="lbl">Rooftops</div></div>
      </div>
      <table class="statuses" style="margin-top:6px">
        <thead><tr><th>Top states</th><th>Roofs</th></tr></thead>
        <tbody>${top.map(([n,c])=>`<tr><td class="name">${n}</td><td>${fmt(c)}</td></tr>`).join('')}</tbody>
      </table>`;
    if(csStateMap){ csStateMap.remove(); csStateMap=null; }
    return;
  }
  const stateRows = rows.filter(a=>a[FC.STATE]===csSelectedState);
  const companies = new Set(stateRows.map(a=>a[FC.ENT_ID])).size;
  const stageCounts = {}; for(const a of stateRows){ stageCounts[a[FC.STAGE]]=(stageCounts[a[FC.STAGE]]||0)+1; }
  const cities = new Set(stateRows.map(a=>a[FC.CITY]).filter(Boolean)).size;
  panelEl.innerHTML = `<button class="reset" type="button" id="cs-reset-btn" style="margin-bottom:14px">&larr; Back to overview</button>
    <h2>${csSelectedState}</h2>
    <div class="totals">
      <div><div class="num">${fmt(companies)}</div><div class="lbl">Companies</div></div>
      <div><div class="num">${fmt(stateRows.length)}</div><div class="lbl">Rooftops</div></div>
    </div>
    ${Object.entries(stageCounts).map(([s,c])=>csStageRow(s,c,stateRows.length)).join('')}
    <div class="cs-mm-head">Rooftop map</div>
    <div class="cs-mm-sub">${fmt(stateRows.length)} rooftops &middot; ${fmt(cities)} cities</div>
    <div id="cs-statemap"></div>`;
  document.getElementById('cs-reset-btn').addEventListener('click', ()=>{ csSelectedState=null; csCityFilter=null; csRefresh(); });
  csRenderMiniMap(stateRows);
}

function csRenderMiniMap(stateRows){
  if(csStateMap){ csStateMap.remove(); csStateMap=null; }
  const feature = stateFeatureByName[csSelectedState];
  if(!feature) return;
  // defer creation one frame: the container was just inserted via innerHTML (possibly while
  // its ancestor was still reflowing), and Leaflet crashes if a vector layer is added before
  // the map has a measured (non-zero) size.
  requestAnimationFrame(()=>{
    if(!document.getElementById('cs-statemap')) return; // panel re-rendered again before this ran
    const bounds = L.geoJSON(feature).getBounds(); // pure geometry, computable with no map attached
    csStateMap = L.map('cs-statemap', { scrollWheelZoom:true, minZoom:3, maxZoom:16 });
    csStateMap.fitBounds(bounds, {padding:[16,16]}); // give the map a valid view BEFORE any layer is added
    csStateMap.setMaxBounds(bounds.pad(0.4));
    addSatelliteLayers(csStateMap);
    const outline = L.geoJSON(feature, { style:{ color:'#fff', weight:2.5, fillColor:'#fff', fillOpacity:0.06 } }).addTo(csStateMap);
    csMiniFit = bounds;
  for(const a of stateRows){
    if(a[FC.LAT]==null||a[FC.LNG]==null) continue;
    const color = CS_STAGE_COLOR[a[FC.STAGE]]||'#5A6663';
    const marker = L.circleMarker([a[FC.LAT],a[FC.LNG]], { radius:5, color:'#fff', weight:1, fillColor:color, fillOpacity:0.85 });
    marker.bindTooltip(`<b>${esc(a[FC.ROOFTOP])||'—'}</b><br>${esc(a[FC.CITY])||'—'} &middot; <span style="color:${color}">${a[FC.STAGE]}</span>`, {direction:'top', offset:[0,-4]});
    marker.on('click', ()=>{ csCityFilter = (csCityFilter===a[FC.CITY]?null:a[FC.CITY]); csRenderTable(); });
    marker.addTo(csStateMap);
    }
    csStateMap.invalidateSize();
    csStateMap.fitBounds(csMiniFit,{padding:[16,16]});
  });
}

function csAcctTypeBadge(t){
  if(!t) return '&mdash;';
  return `<span class="stage-tag" style="color:var(--ink-soft);background:var(--paper)">${esc(t.toUpperCase())}</span>`;
}
const CS_COLUMNS = [
  { key:'rooftop', label:'Rooftop', always:true, sortVal:a=>(a[FC.ROOFTOP]||'').toLowerCase(), td:a=>`<td class="co">${esc(a[FC.ROOFTOP])||'&mdash;'}</td>` },
  { key:'group', label:'Group / Company', sortVal:a=>(a[FC.GROUP]||'').toLowerCase(), td:a=>`<td class="muted">${esc(a[FC.GROUP])||'&mdash;'}</td>` },
  { key:'domain', label:'Company Domain', sortVal:a=>(a[FC.DOMAIN]||'').toLowerCase(), td:a=>`<td>${a[FC.DOMAIN]?`<a href="https://${esc(a[FC.DOMAIN])}" target="_blank" rel="noopener">${esc(a[FC.DOMAIN])}</a>`:'&mdash;'}</td>` },
  { key:'city', label:'City', sortVal:a=>(a[FC.CITY]||'').toLowerCase(), td:a=>`<td>${esc(a[FC.CITY])||'&mdash;'}</td>` },
  { key:'state', label:'State', sortVal:a=>(a[FC.STATE]||'').toLowerCase(), td:a=>`<td class="muted">${esc(a[FC.STATE])||'&mdash;'}</td>` },
  { key:'stage', label:'Stage', sortVal:a=>(a[FC.PRODUCT]||'')+' '+(a[FC.STAGE]||''),
    td:a=>{ const color=CS_STAGE_COLOR[a[FC.STAGE]]||'#5A6663'; return `<td><span class="stage-tag" style="color:${color};background:${color}22"><span class="sw" style="background:${color}"></span>${esc(a[FC.PRODUCT])} ${esc(a[FC.STAGE])}</span></td>`; } },
  { key:'accttype', label:'Account Type', sortVal:a=>(a[FC.ACCT_TYPE]||'').toLowerCase(), td:a=>`<td class="muted">${csAcctTypeBadge(a[FC.ACCT_TYPE])}</td>` },
  { key:'csm', label:'CSM', sortVal:a=>(a[FC.CSM]||'').toLowerCase(), td:a=>`<td class="muted">${esc(a[FC.CSM])||'&mdash;'}</td>` },
];
const csVisibleCols = new Set(CS_COLUMNS.filter(c=>!c.always).map(c=>c.key));
const csSortState = { key:null, dir:1 };
initColsMenu(document.getElementById('cs-accounts-cols-menu'), document.getElementById('cs-accounts-cols-btn'), CS_COLUMNS, csVisibleCols, csRenderTable);

function csRenderTable(){
  const body = document.getElementById('cs-accounts-body');
  const titleEl = document.getElementById('cs-accounts-title');
  let rows = csFilteredRows();
  if(csSelectedState) rows = rows.filter(a=>a[FC.STATE]===csSelectedState);
  const base = rows;
  if(csCityFilter) rows = rows.filter(a=>a[FC.CITY]===csCityFilter);
  if(csSearchQ){
    rows = rows.filter(a=>(a[FC.ROOFTOP]||'').toLowerCase().includes(csSearchQ)
      ||(a[FC.GROUP]||'').toLowerCase().includes(csSearchQ)
      ||(a[FC.CITY]||'').toLowerCase().includes(csSearchQ));
  }
  rows = sortByColumn(rows, CS_COLUMNS, csSortState);
  const visCols = CS_COLUMNS.filter(c=>c.always||csVisibleCols.has(c.key));
  buildSortableHead(document.getElementById('cs-accounts-thead-row'), CS_COLUMNS, csVisibleCols, csSortState, csRenderTable);
  titleEl.innerHTML = csSelectedState
    ? `${csSelectedState} — account list` + (csCityFilter?` &middot; <b>${esc(csCityFilter)}</b> <button id="cs-city-clear" style="border:1px solid var(--line);background:none;border-radius:12px;padding:2px 10px;font-size:11px;cursor:pointer;color:var(--ink-soft);margin-left:6px">&times; clear city</button>`:'')
    : 'All states — account list';
  const cc=document.getElementById('cs-city-clear'); if(cc) cc.addEventListener('click',()=>{ csCityFilter=null; csRenderTable(); });
  document.getElementById('cs-accounts-count').textContent = `${fmt(rows.length)} of ${fmt(base.length)} shown`;
  const colspan = visCols.length;
  if(!rows.length){ body.innerHTML = `<tr><td colspan="${colspan}"><div class="accounts-empty">No accounts match the current filters.</div></td></tr>`; return; }
  body.innerHTML = rows.slice(0,500).map(a=>`<tr>${visCols.map(c=>c.td(a)).join('')}</tr>`).join('');
}

function csRefresh(){
  csRecolor();
  document.querySelectorAll('#cs-product-chips .stage-chip').forEach(b=>{
    const on=b.dataset.v===csProduct; b.classList.toggle('active', on); b.style.background = on?'var(--accent)':'';
  });
  document.querySelectorAll('#cs-stage-chips .stage-chip').forEach(b=>{
    const on=b.dataset.v===csStage; b.classList.toggle('active', on); b.style.background = on?'var(--accent)':'';
  });
  csRenderPanel();
  csRenderTable();
}

document.getElementById('cs-open-btn').addEventListener('click', ()=>{
  document.getElementById('tam-wrap').hidden = true;
  document.getElementById('cslive-wrap').hidden = false;
  requestAnimationFrame(()=>{
    if(!csInited){ csInited = true; csInit(); }
    csUsMap && csUsMap.invalidateSize();
  });
});
document.getElementById('cs-close-btn').addEventListener('click', ()=>{
  document.getElementById('cslive-wrap').hidden = true;
  document.getElementById('tam-wrap').hidden = false;
  setTimeout(()=>usMap.invalidateSize(), 50);
});
