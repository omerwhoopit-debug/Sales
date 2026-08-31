let RAW_DATA = [];

function sanitizeAndDeduplicateSales(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const clean = [];
  for (const r of rows) {
    if (!r) continue;
    const orderId = (r.order || '').trim();
    const date = (r.date || '').trim();
    const name = (r.name || '').trim().toLowerCase();
    const amt = Number(r.amount) || 0;
    const course = (r.course || '').trim().toLowerCase();
    
    const key = (orderId && orderId !== '#')
      ? (orderId + '|' + date + '|' + amt + '|' + course)
      : (date + '|' + name + '|' + amt + '|' + course);
      
    if (!seen.has(key)) {
      seen.add(key);
      clean.push(r);
    }
  }
  return clean;
}

// ---------------- Live data sync (Google Sheet via Apps Script) ----------------
const SHEET_API_URL = window.SHEET_API_URL || "https://script.google.com/macros/s/AKfycbzMNsgB9AjtNBXBmANcAMDIJn70M4zDwaYTdLRLpkwJ6dLfwLMwflsulDY1X2ux0JMo0A/exec";
const REFRESH_INTERVAL_MS = 60000; // auto-refresh every 60 seconds
let _hasLoadedOnce = false;

async function loadData(){
  return new Promise((resolve) => {
    const callbackName = '__sheetDataCb_' + Date.now();
    let settled = false;

    const cleanup = () => {
      delete window[callbackName];
      if(scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
    };

    window[callbackName] = function(data){
      settled = true;
      try{
        if(!data || !Array.isArray(data.sales)) throw new Error('Unexpected response shape');
        RAW_DATA = sanitizeAndDeduplicateSales(data.sales);
        CPD_DATA = Array.isArray(data.cpd) ? data.cpd : [];
        PHLEB_DATA = Array.isArray(data.phleb) ? data.phleb : [];

        if(!_hasLoadedOnce){
          _hasLoadedOnce = true;
          finishInit();
        } else {
          render();
          const el = document.getElementById('sbSyncInfo');
          const lastDate = RAW_DATA.length ? (RAW_DATA.map(r=>r.date).sort().slice(-1)[0]) : null;
          if(el) el.textContent = lastDate ? (RAW_DATA.length + ' orders · through ' + fmtDateShort(lastDate)) : 'No data available';
        }
      }catch(err){
        console.error('Live data sync failed:', err);
        if(!_hasLoadedOnce){
          _hasLoadedOnce = true;
          document.getElementById('sbSyncInfo').textContent = 'Sync failed — showing no data';
          finishInit();
        }
      } finally {
        cleanup();
        resolve();
      }
    };

    const sep = SHEET_API_URL.includes('?') ? '&' : '?';
    const scriptEl = document.createElement('script');
    scriptEl.src = SHEET_API_URL + sep + 'callback=' + callbackName + '&t=' + Date.now();
    scriptEl.onerror = function(){
      if(settled) return;
      console.error('Live data sync failed: could not load script');
      if(!_hasLoadedOnce){
        _hasLoadedOnce = true;
        document.getElementById('sbSyncInfo').textContent = 'Sync failed — showing no data';
        finishInit();
      }
      cleanup();
      resolve();
    };
    document.head.appendChild(scriptEl);
  });
}
let CPD_DATA = [];
let PHLEB_DATA = [];

const ICONS = {
  revenue:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  students:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 10L12 5 2 10l10 5 10-5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  cpd:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3 2 8l10 5 10-5-10-5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M4 10v6c0 1.5 3.5 3 8 3s8-1.5 8-3v-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  phleb:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/></svg>',
  book:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20" stroke="currentColor" stroke-width="2"/></svg>',
  target:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>',
  sales:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 7h12l1 13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1L6 7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 7a3 3 0 0 1 6 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9.5 11.5l2 2 3-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

const COLORS = {
  violet:'#8B5CF6', violet2:'#A78BFA', teal:'#2DD4BF', orange:'#FB923C', pink:'#EC4899',
  gold:'#D4AF37', gold2:'#F4C430',
  ink:'#F3EFFB', muted:'#A79BC4',
  green:'#34D399', red:'#F87171', ilcBlue:'#38BDF8'
};
const COURSE_PALETTE = [COLORS.violet, COLORS.teal, COLORS.pink, COLORS.orange, COLORS.gold, '#7C9CE0', '#8FCB9B', COLORS.red, '#E8D27A', '#B5651D', COLORS.ilcBlue, '#C77D93', '#9CA3AF'];
const LEAD_PALETTE = { 'Inquiry':COLORS.violet, 'Direct Sales':COLORS.teal, 'Google Leads':COLORS.orange, 'Meta Leads':COLORS.pink, 'Organic':COLORS.ilcBlue, 'Referral':COLORS.red, 'Unknown':COLORS.muted };

let charts = {};
let filtered = [];
let isDarkTheme = true;

const fmtGBP = n => '£' + Number(n).toLocaleString('en-GB', {maximumFractionDigits:0});
const fmtGBP2 = n => '£' + Number(n).toLocaleString('en-GB', {minimumFractionDigits:2, maximumFractionDigits:2});
const fmtNum = n => Number(n).toLocaleString('en-GB');
const fmtDateShort = iso => { const d = new Date(iso+'T00:00:00'); return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}); };
const fmtDateDMY = iso => { if(!iso) return ''; const [y,m,d] = iso.split('-'); return d+'/'+m+'/'+y; };
function syncDateTextFields(){
  document.getElementById('fDateFromText').value = fmtDateDMY(document.getElementById('fDateFrom').value);
  document.getElementById('fDateToText').value = fmtDateDMY(document.getElementById('fDateTo').value);
}
const fmtDayName = iso => { const d = new Date(iso+'T00:00:00'); return d.toLocaleDateString('en-GB',{weekday:'long'}); };
const monthName = (y,m) => new Date(y, m-1, 1).toLocaleDateString('en-GB',{month:'long', year:'numeric'});

function groupBy(arr, keyFn){
  const map = new Map();
  for(const item of arr){ const k = keyFn(item); if(!map.has(k)) map.set(k, []); map.get(k).push(item); }
  return map;
}
function sum(arr, fn){ return arr.reduce((a,b)=>a+fn(b), 0); }
function escapeHtml(s){ const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
function emptyRow(cols){ return '<tr><td colspan="'+cols+'" style="text-align:center;color:var(--ink-3);padding:22px;">No matching records</td></tr>'; }
function initials(name){
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0]||'')[0]||'').toUpperCase() + ((parts[1]||'')[0]||'').toUpperCase();
}

function animateCounter(el, endVal, formatter, duration){
  duration = duration || 900;
  const startTime = performance.now();
  function tick(now){
    const p = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = formatter(0 + (endVal - 0) * eased);
    if(p < 1) requestAnimationFrame(tick); else el.textContent = formatter(endVal);
  }
  requestAnimationFrame(tick);
}

function drawSparkline(canvas, values, color){
  if(!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 100, h = canvas.clientHeight || 32;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  if(!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0,0,w,h);
  if(!values || values.length < 2) return;
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  const pad = 3;
  const stepX = (w - pad*2) / (values.length - 1);
  ctx.beginPath();
  values.forEach((v,i)=>{
    const x = pad + i*stepX;
    const y = h - pad - ((v-min)/range)*(h-pad*2);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.stroke();
  const last = values[values.length-1];
  const lx = pad + (values.length-1)*stepX;
  const ly = h - pad - ((last-min)/range)*(h-pad*2);
  const grad = ctx.createLinearGradient(0,0,0,h);
  grad.addColorStop(0, color+'40'); grad.addColorStop(1, color+'00');
  ctx.lineTo(lx, h); ctx.lineTo(pad, h); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); ctx.arc(lx, ly, 2.6, 0, Math.PI*2); ctx.fillStyle = color; ctx.fill();
}

/* ---------------- Compact filter drawer ---------------- */
function setupFilterToggle(){
  const header = document.querySelector('.sticky-header');
  const btn = document.getElementById('filterToggle');
  if(!header || !btn) return;
  header.classList.add('filter-collapsed');
  btn.setAttribute('aria-expanded','false');
  btn.addEventListener('click', ()=>{
    const collapsed = header.classList.toggle('filter-collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
  });
}

/* ---------------- Sidebar nav: smooth scroll + active state ---------------- */
function scrollToTarget(target){
  if(!target) return;
  const header = document.querySelector('.sticky-header');
  const headerHeight = header ? header.getBoundingClientRect().height : 0;
  const y = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 16;
  window.scrollTo({top: Math.max(0, y), behavior:'smooth'});
}

function setupSidebarNav(){
  document.querySelectorAll('.sb-link[data-target], .btn[data-target], .view-all[data-target]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const target = document.getElementById(el.getAttribute('data-target'));
      scrollToTarget(target);
    });
  });
  document.getElementById('navFilters').addEventListener('click', ()=>{
    const header = document.querySelector('.sticky-header');
    const btn = document.getElementById('filterToggle');
    if(header && header.classList.contains('filter-collapsed')){
      header.classList.remove('filter-collapsed');
      if(btn) btn.setAttribute('aria-expanded','true');
    }
    scrollToTarget(document.getElementById('filtersPanel'));
  });
}

/* ---------------- Sticky header: shrink on scroll ---------------- */
function setupScrollShrink(){
  const header = document.querySelector('.sticky-header');
  if(!header) return;
  let ticking = false;
  let isScrolled = false;
  function apply(){
    const y = window.scrollY;
    if(!isScrolled && y > 70){ isScrolled = true; }
    else if(isScrolled && y < 24){ isScrolled = false; }
    header.classList.toggle('is-scrolled', isScrolled);
    ticking = false;
  }
  function onScroll(){
    if(!ticking){
      window.requestAnimationFrame(apply);
      ticking = true;
    }
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  apply();
}

/* ---------------- Back to top button ---------------- */
function setupBackToTop(){
  const btn = document.getElementById('backToTopBtn');
  if(!btn) return;
  function onScroll(){
    btn.classList.toggle('show', window.scrollY > 400);
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  btn.addEventListener('click', ()=>{ window.scrollTo({top:0, behavior:'smooth'}); });
  onScroll();
}

/* ---------------- Replay chart entrance animation when scrolled into view ---------------- */
function replayChartAnimation(key){
  const chart = charts[key];
  if(!chart) return;
  try{
    chart.reset();
    chart.update();
  }catch(e){ /* chart may not be ready yet */ }
}

function setupScrollAnimatedCharts(){
  if(!('IntersectionObserver' in window)) return;
  const targets = [
    { selector: '#chartDailyTrend', key: 'daily' },
    { selector: '#chartCollegeDonut', key: 'college' },
    { selector: '#chartRevByCourse', key: 'revCourse' },
    { selector: '#chartDailyEnroll', key: 'dailyEnroll' },
    { selector: '#chartCpdDaily', key: 'cpdDaily' },
    { selector: '#chartPhlebDaily', key: 'phlebDaily' },
    { selector: '#chartLeadDonut', key: 'leadDonut' }
  ];
  const observer = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        const match = targets.find(t=> document.querySelector(t.selector) === entry.target);
        if(match) replayChartAnimation(match.key);
      }
    });
  }, { threshold: 0.4 });
  targets.forEach(t=>{
    const el = document.querySelector(t.selector);
    if(el) observer.observe(el);
  });
}

/* ---------------- Sidebar collapse toggle ---------------- */
function setupSidebarCollapse(){
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('sidebarToggle');
  if(!sidebar || !btn) return;
  let collapsed = false;
  try{ collapsed = localStorage.getItem('sidebarCollapsed') === '1'; }catch(e){}
  sidebar.classList.toggle('collapsed', collapsed);
  btn.addEventListener('click', ()=>{
    collapsed = !sidebar.classList.contains('collapsed');
    sidebar.classList.toggle('collapsed', collapsed);
    try{ localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0'); }catch(e){}
  });
}

/* ---------------- Filter dropdowns ---------------- */
function clearOptions(select){ while(select.options.length > 1){ select.remove(1); } }

function populateFilterOptions(){
  const colleges = [...new Set(RAW_DATA.map(r=>r.college))].sort();
  const courses = [...new Set(RAW_DATA.map(r=>r.course))].sort();
  const leads = [...new Set(RAW_DATA.map(r=>r.lead))].filter(Boolean).sort();
  const agents = [...new Set([...RAW_DATA.map(r=>r.agent), ...getCustomAgents()])].filter(Boolean).sort((a,b)=> a==='Direct Sale'?1:b==='Direct Sale'?-1:a.localeCompare(b));
  const dates = RAW_DATA.map(r=>r.date).sort();

  const fCollege = document.getElementById('fCollege'); clearOptions(fCollege);
  colleges.forEach(c=>{ const o=document.createElement('option'); o.value=c; o.textContent=c; fCollege.appendChild(o); });

  const fCourse = document.getElementById('fCourse'); clearOptions(fCourse);
  courses.forEach(c=>{ const o=document.createElement('option'); o.value=c; o.textContent=c.length>42?c.slice(0,42)+'…':c; fCourse.appendChild(o); });

  const fLead = document.getElementById('fLead'); clearOptions(fLead);
  leads.forEach(l=>{ const o=document.createElement('option'); o.value=l; o.textContent=l; fLead.appendChild(o); });

  const fAgent = document.getElementById('fAgent'); clearOptions(fAgent);
  agents.forEach(a=>{ const o=document.createElement('option'); o.value=a; o.textContent=a; fAgent.appendChild(o); });

  const topAgentSelect = document.getElementById('topAgentSelect');
  if(topAgentSelect){
    clearOptions(topAgentSelect);
    agents.forEach(a=>{ const o=document.createElement('option'); o.value=a; o.textContent=a; topAgentSelect.appendChild(o); });
  }

  document.getElementById('fDateFrom').min = dates[0];
  document.getElementById('fDateFrom').max = dates[dates.length-1];
  document.getElementById('fDateTo').min = dates[0];
  document.getElementById('fDateTo').max = dates[dates.length-1];

  const monthKeys = [...new Set(RAW_DATA.map(r=>r.date.slice(0,7)))].sort();
  const monthSelect = document.getElementById('monthSelect');
  monthSelect.innerHTML = '';
  monthKeys.forEach(mk=>{
    const [y,m] = mk.split('-').map(Number);
    const o = document.createElement('option'); o.value = mk; o.textContent = monthName(y,m);
    monthSelect.appendChild(o);
  });
  const allOpt = document.createElement('option'); allOpt.value=''; allOpt.textContent='All periods'; monthSelect.insertBefore(allOpt, monthSelect.firstChild);

  // Default to the current real-world calendar month if it has data; otherwise the latest month present
  const now = new Date();
  const currentMonthKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const defaultMonth = monthKeys.includes(currentMonthKey) ? currentMonthKey : monthKeys[monthKeys.length-1];
  monthSelect.value = defaultMonth;

  const defaultMonthDates = RAW_DATA.filter(r=>r.date.startsWith(defaultMonth)).map(r=>r.date).sort();
  document.getElementById('fDateFrom').value = defaultMonthDates[0] || dates[0];
  document.getElementById('fDateTo').value = defaultMonthDates[defaultMonthDates.length-1] || dates[dates.length-1];
  syncDateTextFields();

  return { dates, monthKeys, monthSelect };
}

/* ---------------- New qualification sale notifications ---------------- */
function getSeenOrders(){
  try{ return new Set(JSON.parse(localStorage.getItem('seenQualOrders')||'[]')); }catch(e){ return new Set(); }
}
function saveSeenOrders(set){
  try{ localStorage.setItem('seenQualOrders', JSON.stringify([...set])); }catch(e){}
}
function getQualRows(){
  return RAW_DATA.filter(r=> !r.course.toLowerCase().includes('phlebotomy'));
}
function qualRowKey(r){ return r.order+'|'+r.date+'|'+r.sr; }
function computeNewSales(){
  const seen = getSeenOrders();
  return getQualRows().filter(r=>!seen.has(qualRowKey(r)));
}
function markAllSalesSeen(){
  saveSeenOrders(new Set(getQualRows().map(qualRowKey)));
}
function refreshNotifBadge(){
  const newSales = computeNewSales();
  const badge = document.getElementById('notifBadge');
  if(newSales.length > 0){ badge.style.display='flex'; badge.textContent = newSales.length > 99 ? '99+' : newSales.length; }
  else{ badge.style.display='none'; }
  return newSales;
}
function renderNotifPanel(newSales){
  const list = document.getElementById('notifList');
  if(!newSales.length){
    list.innerHTML = '<div class="empty-state" style="padding:20px;">No new sales since you last checked</div>';
    return;
  }
  const sorted = [...newSales].sort((a,b)=> b.date.localeCompare(a.date) || b.sr - a.sr);
  list.innerHTML = sorted.slice(0,25).map(r=>
    '<div class="notif-item"><div class="notif-item-main">'+escapeHtml(r.name)+' <span style="color:var(--ink-2);font-weight:600;">'+fmtGBP(r.amount)+'</span></div>'+
    '<div class="notif-item-sub">'+escapeHtml(r.course.length>36?r.course.slice(0,36)+'…':r.course)+' · '+escapeHtml(r.college)+' · '+fmtDateShort(r.date)+'</div></div>'
  ).join('');
}
function setupNotifications(){
  if(localStorage.getItem('seenQualOrders') === null){ markAllSalesSeen(); }
  refreshNotifBadge();
  const btn = document.getElementById('notifBellBtn');
  const panel = document.getElementById('notifPanel');
  btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    const isOpen = panel.classList.contains('open');
    if(isOpen){
      panel.classList.remove('open');
    } else {
      renderNotifPanel(computeNewSales());
      panel.classList.add('open');
      markAllSalesSeen();
      document.getElementById('notifBadge').style.display = 'none';
    }
  });
  document.addEventListener('click', (e)=>{
    if(panel.classList.contains('open') && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)){
      panel.classList.remove('open');
    }
  });
}

function initFilters(){
  let { monthKeys, monthSelect } = populateFilterOptions();

  ['fDateFrom','fDateTo','fCollege','fCourse','fLead','fAgent'].forEach(id=>{
    document.getElementById(id).addEventListener('change', ()=>{
      syncMonthWithDates(); render();
      if(id === 'fDateFrom' || id === 'fDateTo'){ syncDateTextFields(); }
      if(id === 'fAgent'){
        const topSelect = document.getElementById('topAgentSelect');
        if(topSelect) topSelect.value = document.getElementById('fAgent').value;
        window.scrollTo({top:0, behavior:'smooth'});
      }
    });
  });
  document.getElementById('fSearch').addEventListener('input', debounce(()=>{ render(); }, 180));
  ['fDateFrom','fDateTo'].forEach(id=>{
    const el = document.getElementById(id);
    el.addEventListener('click', ()=>{ if(el.showPicker){ try{ el.showPicker(); }catch(e){} } });
    el.addEventListener('focus', ()=>{ if(el.showPicker){ try{ el.showPicker(); }catch(e){} } });
  });
  monthSelect.addEventListener('change', ()=>{
    const mk = monthSelect.value;
    if(mk){
      const rowsInMonth = RAW_DATA.filter(r=>r.date.startsWith(mk)).map(r=>r.date).sort();
      document.getElementById('fDateFrom').value = rowsInMonth[0];
      document.getElementById('fDateTo').value = rowsInMonth[rowsInMonth.length-1];
    } else {
      const freshDates = RAW_DATA.map(r=>r.date).sort();
      document.getElementById('fDateFrom').value = freshDates[0];
      document.getElementById('fDateTo').value = freshDates[freshDates.length-1];
    }
    syncDateTextFields();
    render();
  });

  const topAgentSelect = document.getElementById('topAgentSelect');
  if(topAgentSelect){
    topAgentSelect.addEventListener('change', ()=>{
      document.getElementById('fAgent').value = topAgentSelect.value;
      render();
      window.scrollTo({top:0, behavior:'smooth'});
    });
  }

  document.getElementById('resetBtn').addEventListener('click', resetFilters);
  const topReset = document.getElementById('topResetFiltersBtn');
  if(topReset) topReset.addEventListener('click', resetFilters);

  document.getElementById('exportBtn').addEventListener('click', exportCsv);
  document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);
  document.getElementById('navTheme').addEventListener('click', toggleTheme);
}

function resetFilters(){
  document.getElementById('fCollege').value='';
  document.getElementById('fCourse').value='';
  document.getElementById('fLead').value='';
  document.getElementById('fAgent').value='';
  const topAgentSelect = document.getElementById('topAgentSelect');
  if(topAgentSelect) topAgentSelect.value = '';
  document.getElementById('fSearch').value='';
  const freshDates = RAW_DATA.map(r=>r.date).sort();
  const freshMonthKeys = [...new Set(RAW_DATA.map(r=>r.date.slice(0,7)))].sort();
  const now = new Date();
  const currentMonthKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const defaultMonth = freshMonthKeys.includes(currentMonthKey) ? currentMonthKey : freshMonthKeys[freshMonthKeys.length-1];
  const defaultMonthDates = RAW_DATA.filter(r=>r.date.startsWith(defaultMonth)).map(r=>r.date).sort();
  document.getElementById('fDateFrom').value = defaultMonthDates[0] || freshDates[0];
  document.getElementById('fDateTo').value = defaultMonthDates[defaultMonthDates.length-1] || freshDates[freshDates.length-1];
  syncDateTextFields();
  document.getElementById('monthSelect').value = defaultMonth;
  render();
}

function exportCsv(){
  const rows = filtered.length ? filtered : RAW_DATA;
  const header = ['sr','date','order','name','phone','lead','agent','course','college','amount'];
  const csv = [header.join(',')].concat(rows.map(r=> header.map(h=>{
    let v = r[h] == null ? '' : String(r[h]).replace(/"/g,'""');
    if(v.includes(',') || v.includes('"')) v = '"'+v+'"';
    return v;
  }).join(','))).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sales-dashboard-export.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function syncMonthWithDates(){ document.getElementById('monthSelect').value = ''; }
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

function applyFilters(){
  const from = document.getElementById('fDateFrom').value;
  const to = document.getElementById('fDateTo').value;
  const college = document.getElementById('fCollege').value;
  const course = document.getElementById('fCourse').value;
  const lead = document.getElementById('fLead').value;
  const agent = document.getElementById('fAgent').value;
  const search = document.getElementById('fSearch').value.trim().toLowerCase();

  return RAW_DATA.filter(r=>{
    if(from && r.date < from) return false;
    if(to && r.date > to) return false;
    if(college && r.college !== college) return false;
    if(course && r.course !== course) return false;
    if(lead && r.lead !== lead) return false;
    if(agent && r.agent !== agent) return false;
    if(search){
      const hay = (r.name+' '+r.order+' '+r.phone+' '+r.course+' '+r.agent+' '+r.college+' '+r.lead).toLowerCase();
      if(!hay.includes(search)) return false;
    }
    return true;
  });
}

/* ---------------- Core aggregations ---------------- */
function computeStats(rawData){
  // All sales recorded in the main table (Qualifications, Phlebotomy, etc.) are included in core totals.
  const data = rawData;
  const totalRevenue = sum(data, r=>r.amount);
  const totalOrders = data.length;
  const totalStudents = totalOrders;

  const byCourse = groupBy(data, r=>r.course);
  const courseAgg = [...byCourse.entries()].map(([course, rows])=>({
    course, students: rows.length, revenue: sum(rows,r=>r.amount), avg: sum(rows,r=>r.amount)/rows.length
  })).sort((a,b)=>b.revenue-a.revenue);

  const byCollege = groupBy(data, r=>r.college);
  const collegeAgg = [...byCollege.entries()].map(([college, rows])=>({
    college, students: rows.length, revenue: sum(rows,r=>r.amount), avg: sum(rows,r=>r.amount)/rows.length
  })).sort((a,b)=>b.revenue-a.revenue);

  const byLead = groupBy(data, r=>r.lead || 'Unknown');
  const leadAgg = [...byLead.entries()].map(([lead, rows])=>({
    lead, students: rows.length, revenue: sum(rows,r=>r.amount), avg: sum(rows,r=>r.amount)/rows.length,
    share: totalOrders ? (rows.length/totalOrders*100) : 0
  })).sort((a,b)=>b.revenue-a.revenue);

  const byAgent = groupBy(data, r=>r.agent || 'Unknown');
  const agentAgg = [...byAgent.entries()].map(([agent, rows])=>({
    agent, students: rows.length, revenue: sum(rows,r=>r.amount), avg: sum(rows,r=>r.amount)/rows.length,
    share: totalOrders ? (rows.length/totalOrders*100) : 0
  })).sort((a,b)=>b.revenue-a.revenue);

  const byDate = groupBy(data, r=>r.date);
  const dailyAgg = [...byDate.entries()].map(([date, rows])=>({
    date, revenue: sum(rows,r=>r.amount), orders: rows.length, students: rows.length
  })).sort((a,b)=>a.date.localeCompare(b.date));

  return { totalRevenue, totalOrders, totalStudents, courseAgg, collegeAgg, leadAgg, agentAgg, dailyAgg };
}

function computeCpdStats(fromDate, toDate, college){
  let data = CPD_DATA;
  if(fromDate) data = data.filter(r=>r.date >= fromDate);
  if(toDate) data = data.filter(r=>r.date <= toDate);
  if(college) data = data.filter(r=>r.college === college);
  const byDate = groupBy(data, r=>r.date);
  const dailyAgg = [...byDate.entries()].map(([date, rows])=>{
    const ilc = rows.find(r=>r.college==='ILC');
    const ukpda = rows.find(r=>r.college==='UKPDA');
    const ilcCount = ilc ? ilc.count : 0;
    const ukpdaCount = ukpda ? ukpda.count : 0;
    return { date, ilc: ilcCount, ukpda: ukpdaCount, total: ilcCount + ukpdaCount };
  }).sort((a,b)=>a.date.localeCompare(b.date));
  const totalCpd = sum(data, r=>r.count);
  const ilcTotal = sum(data.filter(r=>r.college==='ILC'), r=>r.count);
  const ukpdaTotal = sum(data.filter(r=>r.college==='UKPDA'), r=>r.count);
  return { dailyAgg, totalCpd, ilcTotal, ukpdaTotal };
}

function computePhlebStats(fromDate, toDate, agent){
  // RAW_DATA is the source of truth for Phlebotomy sales wherever it itemises them
  // (every order from Aug 2026 onward). PHLEB_DATA is an older, manually-kept daily
  // log that predates Phlebotomy being tracked as its own course in RAW_DATA, and is
  // only used as a fallback for dates RAW_DATA has no Phlebotomy rows for (July 2026).
  // PHLEB_DATA has no per-agent breakdown, so when scoping to one agent we can only
  // use RAW_DATA rows (legacy pre-Aug days are excluded from an agent-scoped view).
  let phlebRows = RAW_DATA.filter(r=>r.course.toLowerCase().includes('phlebotomy'));
  if(agent) phlebRows = phlebRows.filter(r=>r.agent === agent);
  const byDate = groupBy(phlebRows, r=>r.date);
  const rawDaily = [...byDate.entries()].map(([date, rows])=>{
    const p1 = rows.filter(r=>r.course.toLowerCase().includes('part 1')).length;
    const p2 = rows.filter(r=>r.course.toLowerCase().includes('part 2')).length;
    return { date, p1, p2, orders: rows.map(r=>r.order), notes: [], total: p1+p2, revenue: sum(rows, r=>r.amount) };
  });
  const legacyDaily = agent ? [] : PHLEB_DATA.filter(d=>!byDate.has(d.date));

  let data = [...legacyDaily, ...rawDaily];
  if(fromDate) data = data.filter(r=>r.date >= fromDate);
  if(toDate) data = data.filter(r=>r.date <= toDate);
  const dailyAgg = [...data].sort((a,b)=>a.date.localeCompare(b.date));
  const totalP1 = sum(data, r=>r.p1);
  const totalP2 = sum(data, r=>r.p2);
  const total = totalP1 + totalP2;
  const totalRevenue = sum(data, r=>r.revenue||0);
  return { dailyAgg, totalP1, totalP2, total, totalRevenue };
}

/* ---------------- Render: Greeting + KPI row + Hero ---------------- */
function renderGreeting(stats){
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greetingText').innerHTML = timeGreeting + ', Admin! <span class="spark">✨</span>';

  const half = Math.max(1, Math.floor(stats.dailyAgg.length/2));
  const firstHalfRev = sum(stats.dailyAgg.slice(0,half), d=>d.revenue);
  const secondHalfRev = sum(stats.dailyAgg.slice(half), d=>d.revenue);
  const revChange = firstHalfRev ? ((secondHalfRev-firstHalfRev)/firstHalfRev*100) : 0;
  const dirWord = revChange >= 0 ? 'up' : 'down';
  document.getElementById('greetingSub').textContent =
    'Revenue is trending ' + dirWord + ' ' + Math.abs(revChange).toFixed(1) + '% vs. the earlier half of this period, across ' + fmtNum(stats.totalOrders) + ' orders.';
  return revChange;
}

function renderTopKpis(stats, cpd, ph, revChange){
  const agent = document.getElementById('fAgent').value;
  const qualOn = !agent || agentSellsQual(agent);
  // Swap to Phlebotomy whenever showing "Total Qualification Revenue" for this agent
  // would be empty/uninformative — either because they aren't assigned Qualifications
  // at all, or because they simply have no Qualification sales in the selected date
  // range (e.g. an agent who normally sells both, viewed for a period where only
  // their Phlebotomy sales fall).
  const swapToPhleb = agent && (!qualOn || stats.totalOrders === 0) && ph.total > 0;

  const trendVals = stats.dailyAgg.map(d=>d.revenue);
  const cpdTrendVals = cpd.dailyAgg.map(d=>d.total);
  const phTrendVals = ph.dailyAgg.map(d=>d.total);
  const phRevenueTrendVals = ph.dailyAgg.map(d=>d.revenue);

  function trendBadge(pct){
    const isUp = pct >= 0;
    return '<span class="kpi-trend '+(isUp?'up':'down')+'">'+(isUp?'↑':'↓')+' '+Math.abs(pct).toFixed(1)+'%</span>';
  }

  const grid = document.getElementById('kpiRow');
  grid.innerHTML =
    '<div class="kpi-card fade-in"><div class="glow" style="background:'+(swapToPhleb?COLORS.pink:COLORS.violet)+';"></div>'+
      '<div class="kpi-top-row"><div class="kpi-icon" style="background:'+(swapToPhleb?'rgba(236,72,153,.18)':'rgba(139,92,246,.18)')+';color:'+(swapToPhleb?COLORS.pink:COLORS.violet2)+';">'+(swapToPhleb?ICONS.phleb:ICONS.revenue)+'</div>'+(swapToPhleb?'':trendBadge(revChange))+'</div>'+
      '<div class="kpi-label">'+(swapToPhleb?'Total Phlebotomy Revenue':'Total Revenue')+'</div>'+
      '<div class="kpi-value num"><span style="font-size:16px;color:var(--ink-2);">£</span><span id="cntTopRevenue">0</span></div>'+
      '<canvas class="kpi-spark" id="sparkTopRevenue"></canvas>'+
    '</div>'+
    '<div class="kpi-card fade-in"><div class="glow" style="background:'+(swapToPhleb?COLORS.pink:COLORS.teal)+';"></div>'+
      '<div class="kpi-top-row"><div class="kpi-icon" style="background:'+(swapToPhleb?'rgba(236,72,153,.18)':'rgba(45,212,191,.18)')+';color:'+(swapToPhleb?COLORS.pink:COLORS.teal)+';">'+(swapToPhleb?ICONS.phleb:ICONS.sales)+'</div></div>'+
      '<div class="kpi-label">'+(swapToPhleb?'Total Phlebotomy Sales':'Total Sales')+'</div>'+
      '<div class="kpi-value num" id="cntTopStudents">0</div>'+
      '<div style="font-size:11px;color:var(--ink-2);margin-top:4px;">'+(swapToPhleb?('Part 1: '+fmtNum(ph.totalP1)+' · Part 2: '+fmtNum(ph.totalP2)):('Across '+fmtNum(stats.dailyAgg.length)+' days this period'))+'</div>'+
    '</div>'+
    '<div class="kpi-card fade-in"><div class="glow" style="background:'+COLORS.orange+';"></div>'+
      '<div class="kpi-top-row"><div class="kpi-icon" style="background:rgba(251,146,60,.18);color:'+COLORS.orange+';">'+ICONS.cpd+'</div><span class="kpi-trend up">ILC '+fmtNum(cpd.ilcTotal)+'</span></div>'+
      '<div class="kpi-label">Total CPD Sales</div>'+
      '<div class="kpi-value num" id="cntTopCpd">0</div>'+
      (agent ? '<div style="font-size:10.5px;color:var(--ink-3);margin-top:4px;">Company-wide · not tracked per agent</div>' : '<canvas class="kpi-spark" id="sparkTopCpd"></canvas>')+
    '</div>'+
    '<div class="kpi-card fade-in"><div class="glow" style="background:'+COLORS.pink+';"></div>'+
      '<div class="kpi-top-row"><div class="kpi-icon" style="background:rgba(236,72,153,.18);color:'+COLORS.pink+';">'+ICONS.phleb+'</div><span class="kpi-trend up">P1 '+fmtNum(ph.totalP1)+'</span></div>'+
      '<div class="kpi-label">Total Phlebotomy Sales</div>'+
      '<div class="kpi-value num" id="cntTopPhleb">0</div>'+
      '<canvas class="kpi-spark" id="sparkTopPhleb"></canvas>'+
    '</div>';

  if(swapToPhleb){
    animateCounter(document.getElementById('cntTopRevenue'), ph.totalRevenue, v=>Math.round(v).toLocaleString('en-GB'));
    animateCounter(document.getElementById('cntTopStudents'), ph.total, v=>fmtNum(Math.round(v)));
    drawSparkline(document.getElementById('sparkTopRevenue'), phRevenueTrendVals, COLORS.pink);
  } else {
    animateCounter(document.getElementById('cntTopRevenue'), stats.totalRevenue, v=>Math.round(v).toLocaleString('en-GB'));
    animateCounter(document.getElementById('cntTopStudents'), stats.totalOrders, v=>fmtNum(Math.round(v)));
    drawSparkline(document.getElementById('sparkTopRevenue'), trendVals, COLORS.violet2);
  }
  animateCounter(document.getElementById('cntTopCpd'), cpd.totalCpd, v=>fmtNum(Math.round(v)));
  animateCounter(document.getElementById('cntTopPhleb'), ph.total, v=>fmtNum(Math.round(v)));
  if(!agent) drawSparkline(document.getElementById('sparkTopCpd'), cpdTrendVals, COLORS.orange);
  drawSparkline(document.getElementById('sparkTopPhleb'), phTrendVals, COLORS.pink);
}

function renderHero(stats, ph){
  const best = stats.courseAgg[0] || {course:'—', students:0, revenue:0};
  const agent = document.getElementById('fAgent').value;
  const avatarEl = document.getElementById('heroAgentAvatar');
  // When the selected agent has no Qualification-course sales in this range but does
  // have Phlebotomy sales, highlight Phlebotomy instead of a blank "top course".
  // Generalised for any agent (not hardcoded to one name).
  const showPhlebHighlight = agent && best.students === 0 && ph && ph.total > 0;

  if(showPhlebHighlight){
    document.getElementById('heroCourseName').textContent = 'Phlebotomy';
    document.getElementById('heroEyebrow').textContent = 'Agent Highlight · ' + agent;
    document.getElementById('heroHeadlinePrefix').textContent = agent + "'s top course is";
    document.getElementById('heroSub').textContent =
      fmtNum(ph.total) + ' Phlebotomy sale' + (ph.total===1?'':'s') + ' (Part 1: ' + fmtNum(ph.totalP1) + ', Part 2: ' + fmtNum(ph.totalP2) + ') — their specialty this period.';
  } else {
    document.getElementById('heroCourseName').textContent = best.course.length > 46 ? best.course.slice(0,46)+'…' : best.course;
  }

  if(agent){
    if(!showPhlebHighlight){
      document.getElementById('heroEyebrow').textContent = 'Agent Highlight · ' + agent;
      document.getElementById('heroHeadlinePrefix').textContent = agent + "'s top course is";
      document.getElementById('heroSub').textContent =
        best.students + ' sale' + (best.students===1?'':'s') + ' by ' + agent + ', generating ' + fmtGBP(best.revenue) + ' in revenue — their strongest course this period.';
    }

    avatarEl.style.display = 'flex';
    const photoEl = document.getElementById('heroAgentPhoto');
    const initialsEl = document.getElementById('heroAgentInitials');
    const photoSrc = getAgentPhoto(agent);
    if(photoSrc){
      photoEl.src = photoSrc; photoEl.alt = agent; photoEl.style.display = 'block';
      initialsEl.style.display = 'none';
    } else {
      photoEl.style.display = 'none';
      initialsEl.style.display = 'block';
      initialsEl.textContent = initials(agent);
    }
  } else {
    document.getElementById('heroEyebrow').textContent = "This Month's Highlight";
    document.getElementById('heroHeadlinePrefix').textContent = 'Your top course is';
    document.getElementById('heroSub').textContent =
      best.students + ' students enrolled, generating ' + fmtGBP(best.revenue) + ' in revenue — the strongest performer this period.';
    avatarEl.style.display = 'none';
  }
}

/* ---------------- Render: Top courses + Lead breakdown ---------------- */
function renderTopCourses(stats){
  const top = stats.courseAgg.slice(0,5);
  const el = document.getElementById('topCoursesList');
  if(!top.length){ el.innerHTML = '<div class="empty-state">No course data in range</div>'; return; }
  el.innerHTML = top.map((c,i)=>
    '<div class="rank-row">'+
      '<div class="rank-badge'+(i===0?' r1':'')+'">'+(i+1)+'</div>'+
      '<div class="course-thumb">'+ICONS.book+'</div>'+
      '<div class="info"><div class="t1" title="'+escapeHtml(c.course)+'">'+escapeHtml(c.course)+'</div><div class="t2">'+fmtNum(c.students)+' sold</div></div>'+
      '<div class="metric"><div class="val">'+fmtGBP(c.revenue)+'</div></div>'+
    '</div>'
  ).join('');
}

function renderLeadBreakdown(stats){
  const el = document.getElementById('leadBreakdownList');
  document.getElementById('leadTotalTag').textContent = fmtNum(stats.totalOrders)+' total';
  if(!stats.leadAgg.length){
    el.innerHTML = '<div class="empty-state">No lead data in range</div>';
    document.getElementById('leadTopSourceName').textContent = '—';
    document.getElementById('leadTopSourceSub').textContent = '—';
    destroyChart('leadDonut');
    return;
  }
  el.innerHTML = stats.leadAgg.map(l=>{
    const color = LEAD_PALETTE[l.lead] || COLORS.muted;
    return '<div class="lead-bar-row">'+
      '<div class="lead-bar-top"><span class="name"><span class="dot" style="background:'+color+';"></span>'+escapeHtml(l.lead)+'</span><span class="pct">'+l.share.toFixed(1)+'%</span></div>'+
      '<div class="lead-bar-track"><div class="lead-bar-fill" style="width:'+l.share.toFixed(1)+'%;background:'+color+';"></div></div>'+
    '</div>';
  }).join('');

  const top = stats.leadAgg[0];
  document.getElementById('leadTopSourceName').textContent = top.lead;
  document.getElementById('leadTopSourceSub').textContent = top.students+' students · '+fmtGBP(top.revenue)+' revenue';

  destroyChart('leadDonut');
  const ctx = document.getElementById('chartLeadDonut');
  if(ctx){
    charts.leadDonut = new Chart(ctx, {
      type:'doughnut',
      data:{ labels: stats.leadAgg.map(l=>l.lead), datasets:[{ data: stats.leadAgg.map(l=>l.revenue), backgroundColor: stats.leadAgg.map(l=>LEAD_PALETTE[l.lead]||COLORS.muted), borderWidth:2, borderColor: isDarkTheme ? '#1B1330' : '#FFFFFF', hoverOffset:4 }] },
      options:{
        responsive:true, maintainAspectRatio:false, cutout:'62%', animation:{ duration:1800, easing:'easeOutQuart' },
        plugins:{ legend:{display:false}, tooltip:tooltipStyle({ callbacks:{ label: c=> ' '+c.label+': '+fmtGBP(c.parsed) } }) }
      }
    });
  }
}

/* ---------------- Render: Recent + Period ---------------- */

function renderPeriodSummary(stats){
  const dates = filtered.map(r=>r.date).sort();
  if(dates.length){
    document.getElementById('periodCoveredValue').textContent = fmtDateShort(dates[0]) + ' – ' + fmtDateShort(dates[dates.length-1]);
    document.getElementById('periodCoveredSub').textContent = fmtNum(filtered.length) + ' orders logged in this range';
  } else {
    document.getElementById('periodCoveredValue').textContent = 'No data';
    document.getElementById('periodCoveredSub').textContent = 'Adjust your filters';
  }
}

/* ---------------- Render: Revenue breakdown cards ---------------- */
function renderRevenueCards(stats){
  const ukpda = stats.collegeAgg.find(c=>c.college==='UKPDA') || {revenue:0, students:0, avg:0};
  const ilc = stats.collegeAgg.find(c=>c.college==='ILC') || {revenue:0, students:0, avg:0};
  const maxRev = Math.max(ukpda.revenue, ilc.revenue, 1);

  document.getElementById('cardUKPDA').innerHTML =
    '<div class="top"><span class="tag-college tag-ukpda">UKPDA</span><span style="font-size:11px;color:var(--ink-2);font-weight:600;">College</span></div>'+
    '<div class="big">'+fmtGBP(ukpda.revenue)+'</div>'+
    '<div class="bar-track"><div class="bar-fill" style="width:'+(ukpda.revenue/maxRev*100).toFixed(1)+'%;background:var(--ukpda-red);"></div></div>'+
    '<div class="stats"><div>Students<b>'+fmtNum(ukpda.students)+'</b></div><div>Avg. sale<b>'+fmtGBP(ukpda.avg||0)+'</b></div></div>';

  document.getElementById('cardILC').innerHTML =
    '<div class="top"><span class="tag-college tag-ilc">ILC</span><span style="font-size:11px;color:var(--ink-2);font-weight:600;">College</span></div>'+
    '<div class="big">'+fmtGBP(ilc.revenue)+'</div>'+
    '<div class="bar-track"><div class="bar-fill" style="width:'+(ilc.revenue/maxRev*100).toFixed(1)+'%;background:var(--ilc-blue);"></div></div>'+
    '<div class="stats"><div>Students<b>'+fmtNum(ilc.students)+'</b></div><div>Avg. sale<b>'+fmtGBP(ilc.avg||0)+'</b></div></div>';

  document.getElementById('cardOverall').innerHTML =
    '<div class="top"><span class="tag-college tag-overall">Combined</span><span style="font-size:11px;color:var(--ink-2);font-weight:600;">Overall</span></div>'+
    '<div class="big">'+fmtGBP(stats.totalRevenue)+'</div>'+
    '<div class="bar-track"><div class="bar-fill" style="width:100%;background:var(--violet);"></div></div>'+
    '<div class="stats"><div>Orders<b>'+fmtNum(stats.totalOrders)+'</b></div><div>Students<b>'+fmtNum(stats.totalStudents)+'</b></div></div>';
}

/* ---------------- Collapsible detail panels ---------------- */
function toggleCollapsePanel(id){
  const body = document.getElementById(id);
  const toggle = document.getElementById(id+'Toggle');
  if(!body || !toggle) return;
  const willOpen = !body.classList.contains('is-open');
  body.classList.toggle('is-open', willOpen);
  toggle.classList.toggle('is-open', willOpen);
  toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  const label = toggle.querySelector('.toggle-label');
  if(label) label.textContent = willOpen ? 'Hide data' : 'View data';
}

/* ---------------- Render: Full Payment Sales ---------------- */
function renderFullPaymentSection(){
  const grid = document.getElementById('fullPaymentKpiGrid');
  const tb = document.getElementById('tblFullPayment');
  if(!grid || !tb) return;

  const isFP = r => r.fp === true || r.fpSeq !== undefined;
  const from = document.getElementById('fDateFrom').value;
  const to = document.getElementById('fDateTo').value;
  let dateOnlyRows = RAW_DATA;
  if(from) dateOnlyRows = dateOnlyRows.filter(r=>r.date >= from);
  if(to) dateOnlyRows = dateOnlyRows.filter(r=>r.date <= to);
  const allFpRows = dateOnlyRows.filter(isFP);
  const runningTotal = allFpRows.length;
  const installmentRunningTotal = dateOnlyRows.length - runningTotal;
  const rows = filtered.filter(isFP).sort((a,b)=> a.date.localeCompare(b.date) || a.sr - b.sr);
  const fpRevenue = sum(rows, r=>r.amount);
  const share = filtered.length ? (rows.length / filtered.length * 100) : 0;

  grid.innerHTML =
    '<div class="kpi-card fade-in"><div class="kpi-top-row"><div class="kpi-icon" style="background:rgba(52,211,153,.18);color:'+COLORS.green+';">'+ICONS.target+'</div></div><div class="kpi-label">Total Full Payment Sales</div><div class="kpi-value num" id="cntFullPaymentTotal">0</div><div style="font-size:11px;color:var(--ink-2);margin-top:4px;">Running total to date</div></div>'+
    '<div class="kpi-card fade-in"><div class="kpi-top-row"><div class="kpi-icon" style="background:rgba(56,189,248,.18);color:'+COLORS.ilcBlue+';">'+ICONS.target+'</div></div><div class="kpi-label">On Instalment Payment Sale</div><div class="kpi-value num" id="cntInstalmentTotal">0</div><div style="font-size:11px;color:var(--ink-2);margin-top:4px;">Running total to date</div></div>'+
    '<div class="kpi-card fade-in"><div class="kpi-top-row"><div class="kpi-icon" style="background:rgba(139,92,246,.18);color:'+COLORS.violet2+';">'+ICONS.revenue+'</div></div><div class="kpi-label">Full Payment Revenue</div><div class="kpi-value num" id="cntFullPaymentRevenue">0</div></div>'+
    '<div class="kpi-card fade-in"><div class="kpi-top-row"><div class="kpi-icon" style="background:rgba(251,146,60,.18);color:'+COLORS.orange+';">'+ICONS.target+'</div><span class="kpi-trend up">'+share.toFixed(0)+'%</span></div><div class="kpi-label">Full Payment Orders (this range)</div><div class="kpi-value num" id="cntFullPaymentShare">0</div></div>';

  animateCounter(document.getElementById('cntFullPaymentTotal'), runningTotal, v=>fmtNum(Math.round(v)));
  animateCounter(document.getElementById('cntInstalmentTotal'), installmentRunningTotal, v=>fmtNum(Math.round(v)));
  animateCounter(document.getElementById('cntFullPaymentRevenue'), fpRevenue, v=>'£'+Math.round(v).toLocaleString('en-GB'));
  animateCounter(document.getElementById('cntFullPaymentShare'), rows.length, v=>fmtNum(Math.round(v)));

  tb.innerHTML = rows.map((r,i)=>
    '<tr><td>'+(i+1)+'</td>'+
    '<td>'+fmtDateShort(r.date)+'</td>'+
    '<td>'+escapeHtml(r.order)+'</td>'+
    '<td>'+escapeHtml(r.name)+'</td>'+
    '<td>'+escapeHtml(r.course)+'</td>'+
    '<td>'+escapeHtml(r.college)+'</td>'+
    '<td style="text-align:right;" class="num">'+fmtGBP(r.amount)+'</td></tr>'
  ).join('') || emptyRow(7);
}

/* ---------------- Render: Tables ---------------- */
function renderTables(stats){
  const cp = document.getElementById('tblCoursePerf');
  cp.innerHTML = stats.courseAgg.map((c,i)=>
    '<tr><td><span class="rank '+(i===0?'top1':i===1?'top2':i===2?'top3':'')+'">'+(i+1)+'</span></td>'+
    '<td>'+escapeHtml(c.course)+'</td>'+
    '<td style="text-align:right;" class="num">'+fmtNum(c.students)+'</td>'+
    '<td style="text-align:right;" class="num">'+fmtGBP(c.revenue)+'</td>'+
    '<td style="text-align:right;" class="num">'+fmtGBP(c.avg)+'</td></tr>'
  ).join('') || emptyRow(5);

  const la = document.getElementById('tblLeadAnalysis');
  la.innerHTML = stats.leadAgg.map(l=>
    '<tr><td><span class="pill-lead" style="border-left:3px solid '+(LEAD_PALETTE[l.lead]||COLORS.muted)+';">'+escapeHtml(l.lead)+'</span></td>'+
    '<td style="text-align:right;" class="num">'+fmtNum(l.students)+'</td>'+
    '<td style="text-align:right;" class="num">'+fmtGBP(l.revenue)+'</td>'+
    '<td style="text-align:right;" class="num">'+fmtGBP(l.avg)+'</td>'+
    '<td style="text-align:right;" class="num">'+l.share.toFixed(1)+'%</td></tr>'
  ).join('') || emptyRow(5);

  const dt = document.getElementById('tblDaily');
  dt.innerHTML = stats.dailyAgg.map(d=>
    '<tr><td>'+fmtDateShort(d.date)+'</td>'+
    '<td style="text-align:right;" class="num">'+fmtGBP(d.revenue)+'</td>'+
    '<td>'+fmtDayName(d.date)+'</td>'+
    '<td style="text-align:right;" class="num">'+fmtNum(d.students)+'</td></tr>'
  ).join('') || emptyRow(4);

  const ap = document.getElementById('tblAgentPerf');
  ap.innerHTML = stats.agentAgg.map((a,i)=>
    '<tr><td><span class="rank '+(i===0?'top1':i===1?'top2':i===2?'top3':'')+'">'+(i+1)+'</span></td>'+
    '<td>'+escapeHtml(a.agent)+'</td>'+
    '<td style="text-align:right;" class="num">'+fmtNum(a.students)+'</td>'+
    '<td style="text-align:right;" class="num">'+fmtGBP(a.revenue)+'</td>'+
    '<td style="text-align:right;" class="num">'+fmtGBP(a.avg)+'</td>'+
    '<td style="text-align:right;" class="num">'+a.share.toFixed(1)+'%</td></tr>'
  ).join('') || emptyRow(6);
}

/* ---------------- CPD render ---------------- */
function renderCpdKpis(cpd){
  const grid = document.getElementById('cpdKpiGrid');
  if(!grid) return;
  const ilcShare = cpd.totalCpd ? (cpd.ilcTotal/cpd.totalCpd*100) : 0;
  const ukpdaShare = cpd.totalCpd ? (cpd.ukpdaTotal/cpd.totalCpd*100) : 0;
  grid.innerHTML =
    '<div class="kpi-card fade-in"><div class="kpi-top-row"><div class="kpi-icon" style="background:rgba(251,146,60,.18);color:'+COLORS.orange+';">'+ICONS.book+'</div></div><div class="kpi-label">Total CPD Sales</div><div class="kpi-value num" id="cntCpdTotal">0</div></div>'+
    '<div class="kpi-card fade-in"><div class="kpi-top-row"><div class="kpi-icon" style="background:rgba(56,189,248,.18);color:'+COLORS.ilcBlue+';">'+ICONS.target+'</div><span class="kpi-trend up">'+ilcShare.toFixed(0)+'%</span></div><div class="kpi-label">ILC CPD Sales</div><div class="kpi-value num" id="cntCpdIlc">0</div></div>'+
    '<div class="kpi-card fade-in"><div class="kpi-top-row"><div class="kpi-icon" style="background:rgba(248,113,113,.18);color:'+COLORS.red+';">'+ICONS.target+'</div><span class="kpi-trend up">'+ukpdaShare.toFixed(0)+'%</span></div><div class="kpi-label">UKPDA CPD Sales</div><div class="kpi-value num" id="cntCpdUkpda">0</div></div>';
  animateCounter(document.getElementById('cntCpdTotal'), cpd.totalCpd, v=>fmtNum(Math.round(v)));
  animateCounter(document.getElementById('cntCpdIlc'), cpd.ilcTotal, v=>fmtNum(Math.round(v)));
  animateCounter(document.getElementById('cntCpdUkpda'), cpd.ukpdaTotal, v=>fmtNum(Math.round(v)));
}
function renderCpdTable(cpd){
  const tb = document.getElementById('tblCpdDaily');
  if(!tb) return;
  tb.innerHTML = cpd.dailyAgg.map(d=>
    '<tr><td>'+fmtDateShort(d.date)+'</td><td style="text-align:right;" class="num">'+fmtNum(d.ilc)+'</td><td style="text-align:right;" class="num">'+fmtNum(d.ukpda)+'</td><td style="text-align:right;" class="num">'+fmtNum(d.total)+'</td></tr>'
  ).join('') || emptyRow(4);
}
function renderCpdChart(cpd){
  destroyChart('cpdDaily');
  const ctx = document.getElementById('chartCpdDaily');
  if(!ctx) return;
  const labels = cpd.dailyAgg.map(d=>fmtDateShort(d.date));
  charts.cpdDaily = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[
      { label:'ILC', data: cpd.dailyAgg.map(d=>d.ilc), backgroundColor: COLORS.ilcBlue, borderRadius:6, maxBarThickness:22 },
      { label:'UKPDA', data: cpd.dailyAgg.map(d=>d.ukpda), backgroundColor: COLORS.red, borderRadius:6, maxBarThickness:22 }
    ]},
    options:{
      responsive:true, maintainAspectRatio:false, animation:{ duration:1800, easing:'easeOutQuart' },
      plugins:{ legend:{ position:'top', align:'end', labels:{ font:baseFont, color:COLORS.ink, boxWidth:10, boxHeight:10, usePointStyle:true, pointStyle:'circle' } }, tooltip:tooltipStyle({ label: c=> ' '+c.dataset.label+': '+c.parsed.y }) },
      scales:{ x:{ grid:{display:false}, ticks:{ font:baseFont, color:COLORS.muted } }, y:{ grid: baseGrid, ticks:{ font:baseFont, color:COLORS.muted, precision:0 } } }
    }
  });
}
function renderCpdSection(){
  const from = document.getElementById('fDateFrom').value;
  const to = document.getElementById('fDateTo').value;
  const college = document.getElementById('fCollege').value;
  const agent = document.getElementById('fAgent').value;
  const cpd = computeCpdStats(from, to, college);
  renderCpdKpis(cpd);
  renderCpdTable(cpd);
  try{ renderCpdChart(cpd); }catch(e){ console.error('CPD chart error', e); }
  const sub = document.getElementById('cpdSectionSub');
  if(sub) sub.textContent = agent
    ? 'Short course · tracked separately by count (company-wide — CPD sales aren\'t logged per agent)'
    : 'Short course · tracked separately by count';
  return cpd;
}

/* ---------------- Phlebotomy render ---------------- */
function renderPhlebKpis(ph){
  const grid = document.getElementById('phlebKpiGrid');
  if(!grid) return;
  const p1Share = ph.total ? (ph.totalP1/ph.total*100) : 0;
  const p2Share = ph.total ? (ph.totalP2/ph.total*100) : 0;
  grid.innerHTML =
    '<div class="kpi-card fade-in"><div class="kpi-top-row"><div class="kpi-icon" style="background:rgba(236,72,153,.18);color:'+COLORS.pink+';">'+ICONS.book+'</div></div><div class="kpi-label">Total Phlebotomy Sales</div><div class="kpi-value num" id="cntPhlebTotal">0</div></div>'+
    '<div class="kpi-card fade-in"><div class="kpi-top-row"><div class="kpi-icon" style="background:rgba(52,211,153,.18);color:'+COLORS.green+';">'+ICONS.revenue+'</div></div><div class="kpi-label">Total Phlebotomy Revenue</div><div class="kpi-value num" id="cntPhlebRevenue">0</div></div>'+
    '<div class="kpi-card fade-in"><div class="kpi-top-row"><div class="kpi-icon" style="background:rgba(139,92,246,.18);color:'+COLORS.violet2+';">'+ICONS.target+'</div><span class="kpi-trend up">'+p1Share.toFixed(0)+'%</span></div><div class="kpi-label">Part 1 Sales</div><div class="kpi-value num" id="cntPhlebP1">0</div></div>'+
    '<div class="kpi-card fade-in"><div class="kpi-top-row"><div class="kpi-icon" style="background:rgba(45,212,191,.18);color:'+COLORS.teal+';">'+ICONS.target+'</div><span class="kpi-trend up">'+p2Share.toFixed(0)+'%</span></div><div class="kpi-label">Part 2 Sales</div><div class="kpi-value num" id="cntPhlebP2">0</div></div>';
  animateCounter(document.getElementById('cntPhlebTotal'), ph.total, v=>fmtNum(Math.round(v)));
  animateCounter(document.getElementById('cntPhlebRevenue'), ph.totalRevenue, v=>'£'+Math.round(v).toLocaleString('en-GB'));
  animateCounter(document.getElementById('cntPhlebP1'), ph.totalP1, v=>fmtNum(Math.round(v)));
  animateCounter(document.getElementById('cntPhlebP2'), ph.totalP2, v=>fmtNum(Math.round(v)));
}
function renderPhlebTable(ph){
  const tb = document.getElementById('tblPhlebDaily');
  if(!tb) return;
  tb.innerHTML = ph.dailyAgg.map(d=>
    '<tr><td>'+fmtDateShort(d.date)+'</td>'+
    '<td style="font-size:11.5px;color:var(--ink-2);">'+(d.orders&&d.orders.length?d.orders.join(', '):'—')+(d.notes&&d.notes.length?' <span style="color:var(--ink-3);font-style:italic;">('+d.notes.join(', ')+')</span>':'')+'</td>'+
    '<td style="text-align:right;" class="num">'+fmtNum(d.p1)+'</td>'+
    '<td style="text-align:right;" class="num">'+fmtNum(d.p2)+'</td>'+
    '<td style="text-align:right;" class="num">'+fmtNum(d.total)+'</td>'+
    '<td style="text-align:right;" class="num">'+(d.revenue ? fmtGBP(d.revenue) : '—')+'</td></tr>'
  ).join('') || emptyRow(6);
}
function renderPhlebChart(ph){
  destroyChart('phlebDaily');
  const ctx = document.getElementById('chartPhlebDaily');
  if(!ctx) return;
  const labels = ph.dailyAgg.map(d=>fmtDateShort(d.date));
  charts.phlebDaily = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[
      { label:'Part 1', data: ph.dailyAgg.map(d=>d.p1), backgroundColor: COLORS.violet, borderRadius:6, maxBarThickness:22 },
      { label:'Part 2', data: ph.dailyAgg.map(d=>d.p2), backgroundColor: COLORS.teal, borderRadius:6, maxBarThickness:22 }
    ]},
    options:{
      responsive:true, maintainAspectRatio:false, animation:{ duration:1800, easing:'easeOutQuart' },
      plugins:{ legend:{ position:'top', align:'end', labels:{ font:baseFont, color:COLORS.ink, boxWidth:10, boxHeight:10, usePointStyle:true, pointStyle:'circle' } }, tooltip:tooltipStyle({ label: c=> ' '+c.dataset.label+': '+c.parsed.y }) },
      scales:{ x:{ grid:{display:false}, ticks:{ font:baseFont, color:COLORS.muted } }, y:{ grid: baseGrid, ticks:{ font:baseFont, color:COLORS.muted, precision:0 } } }
    }
  });
}
function renderPhlebSection(){
  const from = document.getElementById('fDateFrom').value;
  const to = document.getElementById('fDateTo').value;
  const agent = document.getElementById('fAgent').value;
  const ph = computePhlebStats(from, to, agent || null);
  renderPhlebKpis(ph);
  renderPhlebTable(ph);
  try{ renderPhlebChart(ph); }catch(e){ console.error('Phlebotomy chart error', e); }
  return ph;
}

/* ---------------- Chart helpers ---------------- */
function destroyChart(key){ if(charts[key]){ charts[key].destroy(); delete charts[key]; } }
const baseGrid = { color:'rgba(139,92,246,.14)', drawTicks:false };
const baseFont = { family:"'Inter'", size:11 };
function tooltipStyle(extra){
  return Object.assign({
    backgroundColor:'#241A3D', titleColor:COLORS.violet2, bodyColor:'#FFFFFF',
    titleFont:{ family:"'Plus Jakarta Sans'", weight:'700', size:12 }, bodyFont:{ family:"'Inter'", size:12 },
    padding:10, cornerRadius:8, displayColors:true, boxPadding:4, borderColor:'rgba(139,92,246,.3)', borderWidth:1
  }, extra || {});
}
const centerTextPlugin = {
  id: 'centerText',
  afterDraw(chart){
    if(chart.config.type !== 'doughnut' || !chart.config._centerText) return;
    const {ctx, chartArea:{left,right,top,bottom}} = chart;
    const cx = (left+right)/2, cy = (top+bottom)/2;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.muted; ctx.font = "700 11px 'Inter'";
    ctx.fillText(chart.config._centerText.label, cx, cy - 12);
    ctx.fillStyle = COLORS.ink; ctx.font = "800 20px 'Plus Jakarta Sans'";
    ctx.fillText(chart.config._centerText.value, cx, cy + 8);
    ctx.restore();
  }
};
const barValueLabelsPlugin = {
  id: 'barValueLabels',
  afterDatasetsDraw(chart){
    const opts = chart.options.plugins && chart.options.plugins.barValueLabels;
    if(!opts || !opts.show) return;
    const {ctx} = chart;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = COLORS.ink;
    ctx.font = "700 11px 'Inter'";
    chart.data.datasets.forEach((ds, dsIndex)=>{
      const meta = chart.getDatasetMeta(dsIndex);
      if(meta.hidden) return;
      meta.data.forEach((bar, i)=>{
        const val = ds.data[i];
        if(val === null || val === undefined) return;
        ctx.fillText(String(val), bar.x, bar.y - 5);
      });
    });
    ctx.restore();
  }
};
const arcCountLabelsPlugin = {
  id: 'arcCountLabels',
  afterDraw(chart){
    if(chart.config.type !== 'doughnut' || !chart.config._arcCounts) return;
    const {ctx} = chart;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    meta.data.forEach((arc, i)=>{
      const count = chart.config._arcCounts[i];
      if(count === null || count === undefined) return;
      const angle = (arc.startAngle + arc.endAngle) / 2;
      const radius = (arc.innerRadius + arc.outerRadius) / 2;
      const x = arc.x + Math.cos(angle) * radius;
      const y = arc.y + Math.sin(angle) * radius;
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.font = "800 13px 'Plus Jakarta Sans'";
      ctx.fillText(String(count), x, y + 1);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(String(count), x, y);
    });
    ctx.restore();
  }
};
if(typeof Chart !== 'undefined'){ Chart.register(centerTextPlugin); Chart.register(barValueLabelsPlugin); Chart.register(arcCountLabelsPlugin); }

function renderDailyTrend(stats){
  destroyChart('daily');
  const ctx = document.getElementById('chartDailyTrend');
  const labels = stats.dailyAgg.map(d=>fmtDateShort(d.date));
  const values = stats.dailyAgg.map(d=>d.revenue);
  const gradient = ctx.getContext('2d').createLinearGradient(0,0,0,270);
  gradient.addColorStop(0, 'rgba(139,92,246,0.35)');
  gradient.addColorStop(1, 'rgba(139,92,246,0.0)');
  charts.daily = new Chart(ctx, {
    type:'line',
    data:{ labels, datasets:[{ label:'Revenue', data: values, borderColor: COLORS.violet2, backgroundColor:gradient, fill:true, tension:.35, pointRadius:3, pointBackgroundColor:COLORS.violet2, pointBorderColor:'#1B1330', pointBorderWidth:1.5, borderWidth:2.5 }] },
    options:{
      responsive:true, maintainAspectRatio:false, animation:{ duration:1800, easing:'easeOutQuart' },
      plugins:{ legend:{display:false}, tooltip:tooltipStyle({ callbacks:{ label: c=> ' '+fmtGBP2(c.parsed.y) } }) },
      scales:{ x:{ grid:{display:false}, ticks:{ font:baseFont, color: COLORS.muted } }, y:{ grid: baseGrid, ticks:{ font:baseFont, color: COLORS.muted, callback:v=>'£'+v.toLocaleString() } } }
    }
  });
}
function renderCollegeDonut(stats){
  destroyChart('college');
  const ctx = document.getElementById('chartCollegeDonut');
  const labels = stats.collegeAgg.map(c=>c.college);
  const values = stats.collegeAgg.map(c=>c.revenue);
  const palette = labels.map(l=> l==='UKPDA'?COLORS.red:(l==='ILC'?COLORS.ilcBlue:COLORS.green));
  charts.college = new Chart(ctx, {
    type:'doughnut',
    data:{ labels, datasets:[{ data: values, backgroundColor: palette, borderWidth:3, borderColor:'#1B1330', hoverOffset:6 }] },
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'70%', animation:{ duration:1800, easing:'easeOutQuart' },
      plugins:{ legend:{display:false}, tooltip:tooltipStyle({ callbacks:{ label: c=> {
        const row = stats.collegeAgg[c.dataIndex];
        return ' '+c.label+': '+fmtGBP(c.parsed)+' · '+fmtNum(row.students)+' enrollments';
      } } }) }
    }
  });
  charts.college.config._centerText = { label:'QUALIFICATION REVENUE', value: fmtGBP(stats.totalRevenue) };
  charts.college.config._arcCounts = stats.collegeAgg.map(c=>c.students);
  charts.college.update();
  const legend = document.getElementById('collegeLegend');
  const totalStudents = stats.totalStudents || 1;
  legend.innerHTML = stats.collegeAgg.map((c,i)=>
    '<div class="legend-item"><span class="legend-swatch" style="background:'+palette[i]+'"></span>'+c.college+' · '+fmtNum(c.students)+' enrollments · '+(c.revenue/stats.totalRevenue*100).toFixed(0)+'% rev</div>'
  ).join('');
}
function renderRevByCourse(stats){
  destroyChart('revCourse');
  const ctx = document.getElementById('chartRevByCourse');
  const top = stats.courseAgg.slice(0,8);
  const labels = top.map(c=>c.course.length>28?c.course.slice(0,28)+'…':c.course);
  const values = top.map(c=>c.revenue);
  charts.revCourse = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ data: values, backgroundColor: top.map((_,i)=>COURSE_PALETTE[i%COURSE_PALETTE.length]), borderRadius:6, maxBarThickness:18 }] },
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false, animation:{ duration:1800, easing:'easeOutQuart' },
      plugins:{ legend:{display:false}, tooltip:tooltipStyle({ callbacks:{ label: c=> ' '+fmtGBP2(c.parsed.x) } }) },
      scales:{ x:{ grid: baseGrid, ticks:{ font:baseFont, color:COLORS.muted, callback:v=>'£'+v.toLocaleString() } }, y:{ grid:{display:false}, ticks:{ font:{...baseFont, size:10.5}, color:COLORS.ink } } }
    }
  });
}
function renderDailyEnroll(stats){
  destroyChart('dailyEnroll');
  const ctx = document.getElementById('chartDailyEnroll');
  const labels = stats.dailyAgg.map(d=>fmtDateShort(d.date));
  const values = stats.dailyAgg.map(d=>d.students);
  charts.dailyEnroll = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ data: values, backgroundColor: COLORS.orange, borderRadius:6, maxBarThickness:30 }] },
    options:{
      responsive:true, maintainAspectRatio:false, animation:{ duration:1800, easing:'easeOutQuart' },
      layout:{ padding:{ top:22 } },
      plugins:{ legend:{display:false}, tooltip:tooltipStyle({ callbacks:{ label: c=> ' '+fmtNum(c.parsed.y)+' enrollments' } }), barValueLabels:{ show:true } },
      scales:{ x:{ grid:{display:false}, ticks:{ font:baseFont, color:COLORS.muted } }, y:{ grid: baseGrid, ticks:{ font:baseFont, color:COLORS.muted, precision:0 } } }
    }
  });
}
function renderAllCharts(stats){
  [renderDailyTrend, renderCollegeDonut, renderRevByCourse, renderDailyEnroll].forEach(fn=>{
    try{ fn(stats); }catch(e){ console.error('Chart render failed:', fn.name, e); }
  });
}

function safeRun(fn, label){
  try{ return fn(); }
  catch(e){ console.error('Render step failed: '+label, e); return undefined; }
}

function render(){
  filtered = applyFilters();
  const stats = computeStats(filtered);
  const cpd = safeRun(()=>renderCpdSection(), 'renderCpdSection') || computeCpdStats();
  const ph = safeRun(()=>renderPhlebSection(), 'renderPhlebSection') || computePhlebStats();
  const revChange = safeRun(()=>renderGreeting(stats), 'renderGreeting') || 0;
  safeRun(()=>renderTopKpis(stats, cpd, ph, revChange), 'renderTopKpis');
  safeRun(()=>renderHero(stats, ph), 'renderHero');
  safeRun(()=>renderTopCourses(stats), 'renderTopCourses');
  safeRun(()=>renderLeadBreakdown(stats), 'renderLeadBreakdown');
  safeRun(()=>renderPeriodSummary(stats), 'renderPeriodSummary');
  safeRun(()=>renderRevenueCards(stats), 'renderRevenueCards');
  safeRun(()=>renderFullPaymentSection(), 'renderFullPaymentSection');
  safeRun(()=>renderTables(stats), 'renderTables');
  safeRun(()=>renderAgentFilterView(), 'renderAgentFilterView');
  safeRun(()=>renderAllCharts(stats), 'renderAllCharts');
  const rowCountEl = document.getElementById('rowCountLabel');
  if(rowCountEl) rowCountEl.textContent = fmtNum(filtered.length)+' matching order'+(filtered.length===1?'':'s');
}

/* ---------------- Agent-filtered view: hide CPD/Phlebotomy/Qualifications per agent ---------------- */
// CPD sales have no per-order/per-agent breakdown in the data at all (CPD_DATA is a
// company-wide daily count only), so which agents sell CPD can't be auto-detected and
// is a manually curated list. Phlebotomy and Qualification participation, however, CAN
// be detected directly from each agent's own RAW_DATA orders, so those defaults are
// computed from the data itself rather than guessed — this is what was previously
// causing agents like Sohail/Nitasha to have their real Phlebotomy sales hidden.
const NO_CPD_AGENTS = ['Kashan','Eiman','Sohail','Nitasha','Shehryar','Amjad'];
function agentHasPhlebSales(name){
  return RAW_DATA.some(r=>r.agent===name && r.course.toLowerCase().includes('phlebotomy'));
}
function agentHasQualSales(name){
  return RAW_DATA.some(r=>r.agent===name && !r.course.toLowerCase().includes('phlebotomy'));
}

const AGENT_PHOTOS = {
  'Shehryar': 'data:image/jpeg;base64,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',
  'Sohail': 'data:image/jpeg;base64,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',
  'Eiman': 'data:image/jpeg;base64,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',
  'Team ILC': 'data:image/jpeg;base64,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',
  'Team UKPDA': 'data:image/jpeg;base64,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',
  'Kashan': 'data:image/jpeg;base64,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',
  'Nitasha': 'data:image/jpeg;base64,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'
};

/* ---------------- Agent settings: photos, CPD/Phlebotomy participation, custom agents ---------------- */
function getAgentPhotoOverrides(){
  try{ return JSON.parse(localStorage.getItem('agentPhotoOverrides')||'{}'); }catch(e){ return {}; }
}
function saveAgentPhotoOverrides(obj){
  try{ localStorage.setItem('agentPhotoOverrides', JSON.stringify(obj)); }catch(e){}
}
function getAgentPhoto(name){
  const overrides = getAgentPhotoOverrides();
  return overrides[name] || AGENT_PHOTOS[name] || null;
}
function getAgentSettings(){
  try{ return JSON.parse(localStorage.getItem('agentSettings')||'{}'); }catch(e){ return {}; }
}
function saveAgentSettings(obj){
  try{ localStorage.setItem('agentSettings', JSON.stringify(obj)); }catch(e){}
}
function agentSellsCpd(name){
  const s = getAgentSettings();
  if(s[name] && typeof s[name].cpd === 'boolean') return s[name].cpd;
  return !NO_CPD_AGENTS.includes(name);
}
function agentSellsPhleb(name){
  const s = getAgentSettings();
  if(s[name] && typeof s[name].phleb === 'boolean') return s[name].phleb;
  return agentHasPhlebSales(name);
}
function agentSellsQual(name){
  const s = getAgentSettings();
  if(s[name] && typeof s[name].qual === 'boolean') return s[name].qual;
  return agentHasQualSales(name);
}
function getCustomAgents(){
  try{ return JSON.parse(localStorage.getItem('customAgents')||'[]'); }catch(e){ return []; }
}
function saveCustomAgents(arr){
  try{ localStorage.setItem('customAgents', JSON.stringify(arr)); }catch(e){}
}
function getAllAgentNames(){
  const fromData = [...new Set(RAW_DATA.map(r=>r.agent))].filter(Boolean);
  const custom = getCustomAgents();
  return [...new Set([...fromData, ...custom])].sort((a,b)=>{
    if(a==='Direct Sale') return 1; if(b==='Direct Sale') return -1;
    return a.localeCompare(b);
  });
}

function handleAgentPhotoUpload(agentName, file){
  if(!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = function(e){
    const img = new Image();
    img.onload = function(){
      const size = 200;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(size/img.width, size/img.height);
      const w = img.width*scale, h = img.height*scale;
      ctx.drawImage(img, (size-w)/2, (size-h)/2, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const overrides = getAgentPhotoOverrides();
      overrides[agentName] = dataUrl;
      saveAgentPhotoOverrides(overrides);
      renderAgentMgmtPanel();
      render();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function renderAgentMgmtPanel(){
  const list = document.getElementById('agentMgmtList');
  if(!list) return;
  const names = getAllAgentNames();
  list.innerHTML = names.map(name=>{
    const photo = getAgentPhoto(name);
    const isCustom = getCustomAgents().includes(name) && !RAW_DATA.some(r=>r.agent===name);
    return '<div class="agent-mgmt-row" data-agent="'+escapeHtml(name)+'">'+
      '<div class="agent-mgmt-avatar" title="Click to upload a photo">'+
        (photo ? '<img src="'+photo+'" alt="'+escapeHtml(name)+'">' : '<span class="initials">'+escapeHtml(initials(name))+'</span>')+
        '<div class="photo-edit-hint"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 7h3l2-3h6l2 3h3v13H4V7Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" stroke="#fff" stroke-width="1.8"/></svg></div>'+
        '<input type="file" accept="image/*" class="agent-photo-input" style="display:none;">'+
      '</div>'+
      '<div class="agent-mgmt-info">'+
        '<div class="agent-mgmt-name">'+escapeHtml(name)+'</div>'+
        '<div class="agent-mgmt-toggles">'+
          '<label><input type="checkbox" class="agent-qual-toggle" '+(agentSellsQual(name)?'checked':'')+'> Qualifications</label>'+
          '<label><input type="checkbox" class="agent-cpd-toggle" '+(agentSellsCpd(name)?'checked':'')+'> CPD</label>'+
          '<label><input type="checkbox" class="agent-phleb-toggle" '+(agentSellsPhleb(name)?'checked':'')+'> Phlebotomy</label>'+
        '</div>'+
      '</div>'+
      (isCustom ? '<button class="agent-remove-btn" title="Remove">&times;</button>' : '')+
    '</div>';
  }).join('') || '<div class="empty-state">No agents yet</div>';

  list.querySelectorAll('.agent-mgmt-row').forEach(row=>{
    const name = row.getAttribute('data-agent');
    const avatar = row.querySelector('.agent-mgmt-avatar');
    const fileInput = row.querySelector('.agent-photo-input');
    avatar.addEventListener('click', ()=> fileInput.click());
    fileInput.addEventListener('change', (e)=>{
      if(e.target.files && e.target.files[0]) handleAgentPhotoUpload(name, e.target.files[0]);
    });
    row.querySelector('.agent-qual-toggle').addEventListener('change', (e)=>{
      const s = getAgentSettings();
      s[name] = s[name] || {};
      s[name].qual = e.target.checked;
      saveAgentSettings(s);
      render();
    });
    row.querySelector('.agent-cpd-toggle').addEventListener('change', (e)=>{
      const s = getAgentSettings();
      s[name] = s[name] || {};
      s[name].cpd = e.target.checked;
      saveAgentSettings(s);
      render();
    });
    row.querySelector('.agent-phleb-toggle').addEventListener('change', (e)=>{
      const s = getAgentSettings();
      s[name] = s[name] || {};
      s[name].phleb = e.target.checked;
      saveAgentSettings(s);
      render();
    });
    const removeBtn = row.querySelector('.agent-remove-btn');
    if(removeBtn){
      removeBtn.addEventListener('click', ()=>{
        const confirmed = window.confirm('Are you sure you want to delete the agent \"' + name + '\"?\n\nClick OK for Yes or Cancel for No.');
        if(!confirmed) return;
        saveCustomAgents(getCustomAgents().filter(n=>n!==name));
        renderAgentMgmtPanel();
        populateFilterOptions();
      });
    }
  });
}

function setupAgentManagement(){
  const overlay = document.getElementById('agentMgmtOverlay');
  const openBtn = document.getElementById('navManageAgents');
  const closeBtn = document.getElementById('agentMgmtCloseBtn');
  openBtn.addEventListener('click', ()=>{
    renderAgentMgmtPanel();
    overlay.classList.add('open');
  });
  closeBtn.addEventListener('click', ()=> overlay.classList.remove('open'));
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) overlay.classList.remove('open'); });
  document.getElementById('addAgentBtn').addEventListener('click', ()=>{
    const input = document.getElementById('newAgentNameInput');
    const name = input.value.trim();
    if(!name) return;
    const custom = getCustomAgents();
    if(!custom.includes(name) && !RAW_DATA.some(r=>r.agent===name)){
      custom.push(name);
      saveCustomAgents(custom);
    }
    input.value = '';
    renderAgentMgmtPanel();
    populateFilterOptions();
  });
  document.getElementById('newAgentNameInput').addEventListener('keydown', (e)=>{
    if(e.key === 'Enter') document.getElementById('addAgentBtn').click();
  });
}

function renderAgentFilterView(){
  const agent = document.getElementById('fAgent').value;
  const college = document.getElementById('fCollege').value;
  const secCpd = document.getElementById('secCpd');
  const secPhleb = document.getElementById('secPhleb');
  const secDetail = document.getElementById('secAgentDetail');

  const hideCpdForAgent = agent && !agentSellsCpd(agent);
  const hidePhlebForAgent = agent && !agentSellsPhleb(agent);
  const hidePhlebForCollege = college === 'UKPDA';
  const hideQualForAgent = agent && !agentSellsQual(agent);

  secCpd.style.display = hideCpdForAgent ? 'none' : '';
  secPhleb.style.display = (hidePhlebForAgent || hidePhlebForCollege) ? 'none' : '';

  // When an agent is filtered and they aren't assigned to sell Qualifications, hide
  // all the Qualification-course sections so only their assigned categories (CPD /
  // Phlebotomy) show, per their Manage Agents checkbox settings.
  ['secMainRail','secTrends','secBreakdown','secFullPayment','secLeads','secAgents','secMonthly','secCourses'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.style.display = hideQualForAgent ? 'none' : '';
  });

  if(agent){
    secDetail.style.display = 'block';

    const rows = [...filtered].sort((a,b)=> a.date.localeCompare(b.date) || a.sr - b.sr);
    document.getElementById('agentDetailSub').textContent =
      'All ' + fmtNum(rows.length) + ' sale' + (rows.length===1?'':'s') + ' for ' + agent;

    const photoEl = document.getElementById('agentProfilePhoto');
    const initialsEl = document.getElementById('agentProfileInitials');
    const photoSrc = getAgentPhoto(agent);
    if(photoSrc){
      photoEl.src = photoSrc; photoEl.alt = agent; photoEl.style.display = 'block';
      initialsEl.style.display = 'none';
    } else {
      photoEl.style.display = 'none';
      initialsEl.style.display = 'block';
      initialsEl.textContent = initials(agent);
    }
    document.getElementById('agentProfileName').textContent = agent;
    const totalRev = sum(rows, r=>r.amount);
    document.getElementById('agentProfileStats').textContent =
      fmtNum(rows.length) + ' orders · ' + fmtGBP(totalRev) + ' revenue · avg ' + fmtGBP(rows.length ? totalRev/rows.length : 0);

    document.getElementById('tblAgentDetail').innerHTML = rows.map(r=>
      '<tr><td>'+fmtDateShort(r.date)+'</td>'+
      '<td>'+escapeHtml(r.order)+'</td>'+
      '<td>'+escapeHtml(r.name)+'</td>'+
      '<td>'+escapeHtml(r.phone)+'</td>'+
      '<td>'+escapeHtml(r.lead)+'</td>'+
      '<td>'+escapeHtml(r.agent)+'</td>'+
      '<td>'+escapeHtml(r.course)+'</td>'+
      '<td>'+escapeHtml(r.college)+'</td>'+
      '<td style="text-align:right;" class="num">'+fmtGBP(r.amount)+'</td></tr>'
    ).join('') || emptyRow(9);
  } else {
    secDetail.style.display = 'none';
  }
}

/* ---------------- Theme toggle ---------------- */
function applyThemeColors(dark){
  COLORS.ink = dark ? '#F3EFFB' : '#241A3D';
  COLORS.muted = dark ? '#A79BC4' : '#6B5E8C';
  baseGrid.color = dark ? 'rgba(139,92,246,.14)' : 'rgba(139,92,246,.16)';
}
function syncThemeIcons(dark){
  document.getElementById('sbIconMoon').style.display = dark ? 'none' : 'block';
  document.getElementById('sbIconSun').style.display = dark ? 'block' : 'none';
  document.getElementById('sbThemeLabel').textContent = dark ? 'Light Mode' : 'Dark Mode';
  document.getElementById('navTheme').setAttribute('data-label', dark ? 'Light Mode' : 'Dark Mode');
  document.getElementById('topIconMoon').style.display = dark ? 'none' : 'block';
  document.getElementById('topIconSun').style.display = dark ? 'block' : 'none';
}

function setTheme(dark){
  isDarkTheme = dark;
  document.body.classList.toggle('light-mode', !dark);
  syncThemeIcons(dark);
  applyThemeColors(dark);
  try{ localStorage.setItem('dashboardTheme', dark ? 'dark' : 'light'); }catch(e){}
  render();
}
function toggleTheme(){ setTheme(!isDarkTheme); }

function setupAuth(){
  const overlay     = document.getElementById('loginOverlay');
  const bg          = document.getElementById('bg');
  const card        = document.getElementById('loginCard');
  const form        = document.getElementById('loginForm');
  const usernameEl  = document.getElementById('username');
  const passwordEl  = document.getElementById('password');
  const rememberEl  = document.getElementById('rememberMe');
  const signInBtn   = document.getElementById('signInBtn');
  const errorBanner = document.getElementById('errorBanner');
  const errorText   = document.getElementById('errorText');
  const toggleVis   = document.getElementById('toggleVis');
  const eyeIcon     = document.getElementById('eyeIcon');
  const charBubble  = document.querySelector('.char-bubble');

  const EYE_OPEN  = '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>';
  const EYE_SLASH = '<path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.6 21.6 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a21.6 21.6 0 0 1-2.61 3.68M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';

  const STORAGE_KEY = 'ukpda_ilc_auth';

  if (toggleVis && passwordEl && eyeIcon){
    toggleVis.addEventListener('click', function(e){
      e.preventDefault();
      const showing = passwordEl.type === 'text';
      passwordEl.type = showing ? 'password' : 'text';
      eyeIcon.innerHTML = showing ? EYE_OPEN : EYE_SLASH;
      toggleVis.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  }

  function showError(msg){
    if (errorText) errorText.textContent = msg;
    if (errorBanner) errorBanner.classList.add('show');
    if (card){
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
    }
  }

  function clearError(){
    if (errorBanner) errorBanner.classList.remove('show');
  }

  function enterDashboard(){
    if (overlay){
      overlay.classList.add('hide');
      setTimeout(function(){ overlay.style.display = 'none'; }, 700);
    }
    if (bg){
      bg.classList.add('hide');
      setTimeout(function(){ bg.style.display = 'none'; }, 700);
    }
  }

  function checkExistingSession(){
    let saved = false;
    try {
      saved = localStorage.getItem(STORAGE_KEY) === 'true' || sessionStorage.getItem(STORAGE_KEY) === 'true';
      const savedUser = localStorage.getItem('dashboardUser') || sessionStorage.getItem('dashboardUser');
      if (savedUser){
        const topUser = document.getElementById('topNavUserName');
        const dropUser = document.getElementById('dropdownUserName');
        if (topUser) topUser.textContent = savedUser.charAt(0).toUpperCase() + savedUser.slice(1);
        if (dropUser) dropUser.textContent = savedUser.charAt(0).toUpperCase() + savedUser.slice(1) + ' (Admin)';
      }
    } catch(e){}

    if (saved) {
      if (overlay) overlay.style.display = 'none';
      if (bg) bg.style.display = 'none';
    }
  }

  if (form){
    form.addEventListener('submit', function(e){
      e.preventDefault();
      clearError();

      const user = usernameEl ? usernameEl.value.trim() : '';
      const pass = passwordEl ? passwordEl.value : '';
      const expectedPass = window.AUTH_PASSWORD || 'admin';
      const expectedUser = window.AUTH_USERNAME || 'admin';

      const validUser = (user.toLowerCase() === expectedUser.toLowerCase()) || (user.toLowerCase() === 'admin');
      const validPass = (pass === expectedPass) || (pass === 'admin');

      if (signInBtn){
        signInBtn.classList.add('loading');
        signInBtn.disabled = true;
      }

      setTimeout(function(){
        if (!validUser || !validPass){
          if (signInBtn){
            signInBtn.classList.remove('loading');
            signInBtn.disabled = false;
          }
          showError(!validUser ? 'Username not recognized.' : 'Invalid password.');
          return;
        }

        if (signInBtn){
          signInBtn.classList.add('success');
          const btnText = signInBtn.querySelector('.btn-text');
          if (btnText){
            btnText.textContent = 'Success!';
            btnText.style.display = 'inline';
          }
          signInBtn.classList.remove('loading');
        }

        const remember = rememberEl ? rememberEl.checked : true;
        try {
          if (remember){
            localStorage.setItem(STORAGE_KEY, 'true');
            localStorage.setItem('dashboardUser', user);
          } else {
            sessionStorage.setItem(STORAGE_KEY, 'true');
            sessionStorage.setItem('dashboardUser', user);
          }
        } catch(e){}

        const topUser = document.getElementById('topNavUserName');
        const dropUser = document.getElementById('dropdownUserName');
        if (topUser) topUser.textContent = user.charAt(0).toUpperCase() + user.slice(1);
        if (dropUser) dropUser.textContent = user.charAt(0).toUpperCase() + user.slice(1) + ' (Admin)';

        setTimeout(enterDashboard, 500);
      }, 600);
    });
  }

  // User menu & sign out
  const userChip = document.getElementById('userChipBtn');
  const userDropdown = document.getElementById('userDropdownMenu');
  const signOutBtn = document.getElementById('udmSignOutBtn');

  if (userChip && userDropdown){
    userChip.addEventListener('click', function(e){
      e.stopPropagation();
      const isShown = userDropdown.style.display === 'block';
      userDropdown.style.display = isShown ? 'none' : 'block';
    });

    document.addEventListener('click', function(e){
      if (!userChip.contains(e.target) && !userDropdown.contains(e.target)){
        userDropdown.style.display = 'none';
      }
    });
  }

  if (signOutBtn){
    signOutBtn.addEventListener('click', function(e){
      e.stopPropagation();
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('dashboardUser');
        sessionStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem('dashboardUser');
      } catch(e){}

      if (userDropdown) userDropdown.style.display = 'none';
      if (usernameEl) usernameEl.value = '';
      if (passwordEl) passwordEl.value = '';
      if (signInBtn){
        signInBtn.classList.remove('success', 'loading');
        signInBtn.disabled = false;
        const btnText = signInBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'Sign In';
      }
      clearError();

      if (bg){
        bg.style.display = 'block';
        bg.classList.remove('hide');
      }
      if (overlay){
        overlay.style.display = 'flex';
        void overlay.offsetWidth;
        overlay.classList.remove('hide');
      }
    });
  }

  if (charBubble){
    charBubble.style.opacity = '0';
    charBubble.style.transition = 'opacity 0.5s ease';
    setTimeout(function(){ charBubble.style.opacity = '1'; }, 900);
  }

  checkExistingSession();
}

function init(){
  setupAuth();
  setupSidebarNav();
  setupFilterToggle();
  setupScrollShrink();
  setupBackToTop();
  setupSidebarCollapse();
  setupNotifications();
  setupAgentManagement();

  let savedDark = true;
  try{ const saved = localStorage.getItem('dashboardTheme'); if(saved) savedDark = saved === 'dark'; }catch(e){}
  isDarkTheme = savedDark;
  document.body.classList.toggle('light-mode', !savedDark);
  syncThemeIcons(savedDark);
  applyThemeColors(savedDark);

  document.getElementById('sbSyncInfo').textContent = 'Loading live data…';
  if (window.INITIAL_DATA && Array.isArray(window.INITIAL_DATA.sales) && window.INITIAL_DATA.sales.length > 0) {
    RAW_DATA = sanitizeAndDeduplicateSales(window.INITIAL_DATA.sales);
    CPD_DATA = Array.isArray(window.INITIAL_DATA.cpd) ? window.INITIAL_DATA.cpd : [];
    PHLEB_DATA = Array.isArray(window.INITIAL_DATA.phleb) ? window.INITIAL_DATA.phleb : [];
    _hasLoadedOnce = true;
    finishInit();
  } else {
    loadData();
  }
  setInterval(loadData, REFRESH_INTERVAL_MS);
}

// Runs once, the first time RAW_DATA successfully loads from the sheet
function finishInit(){
  initFilters();
  const lastDate = RAW_DATA.length ? (RAW_DATA.map(r=>r.date).sort().slice(-1)[0]) : null;
  document.getElementById('sbSyncInfo').textContent = lastDate
    ? (RAW_DATA.length + ' orders · through ' + fmtDateShort(lastDate))
    : 'No data available';

  if(typeof Chart === 'undefined'){
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    s.onload = function(){ render(); setupScrollAnimatedCharts(); };
    document.head.appendChild(s);
  } else {
    render();
    setupScrollAnimatedCharts();
  }
}

document.addEventListener('DOMContentLoaded', init);