(function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const STORAGE_KEY = 'maritime-law-hub:laws';
  const BOOKMARK_KEY = 'maritime-law-hub:bookmarks';
  const RECENT_KEY = 'maritime-law-hub:recent';
  const PROGRESS_KEY = 'maritime-law-hub:progress';
  const SEARCHES_KEY = 'maritime-law-hub:searches';
  const PREFS_KEY = 'maritime-law-hub:reading';
  const VERSION = window.MARITIME_LAWS_VERSION || 'unversioned';
  const bundled = normalizeLaws(window.MARITIME_LAWS || []);
  const categoryNames = {
    'Law of the Sea':'국제해양법','Carriage of Goods':'해상운송','Carriage of Passengers':'해상운송','규칙':'해상운송','상법':'상법·해상운송',
    'Container Safety':'선박·항해안전','Maritime Safety':'선박·항해안전','Navigation Safety':'선박·항해안전','Ship Measurement':'선박·항해안전','해사안전':'선박·항해안전',
    'Fishers and Labour':'선원·해사노동','Seafarers and Labour':'선원·해사노동','Seafarers and Training':'선원·해사노동','선원':'선원·해사노동',
    'Marine Environment':'해양환경','Pollution Preparedness and Response':'해양환경','Pollution Response and Intervention':'해양환경',
    'Pollution Liability':'손해배상·책임제한','Maritime Claims and Liability':'손해배상·책임제한','Salvage':'해난구조',
    'Maritime Facilitation':'항만·통관','항만':'항만·통관','Maritime Security':'해상보안'
  };
  const agencyNames = {
    'International Maritime Organization':'IMO','United Nations':'UN','International Labour Organization':'ILO',
    'United Nations Commission on International Trade Law':'UNCITRAL','International Convention / Brussels Protocol':'Brussels Convention / Protocol'
  };
  const defaults = {query:'',origin:'전체',type:'전체',category:'전체',agency:'전체',status:'전체',sort:'archive',target:'all',examples:false,saved:false};
  const state = {...defaults,laws:loadLaws(),bookmarks:new Set(readJSON(BOOKMARK_KEY,[])),recent:readJSON(RECENT_KEY,[]),progress:readJSON(PROGRESS_KEY,{}),searches:readJSON(SEARCHES_KEY,[]),law:null,view:'home',homeTarget:'all',
    readerQuery:'',hits:[],hitIndex:-1,activeArticle:null,catalogScroll:0,prefs:readJSON(PREFS_KEY,{})};
  let articleObserver, searchTimer;
  const articlesOf = law => law.sections.flatMap(s=>s.articles);
  const origin = law => ['Treaty','조약','국제규칙','표준계약서'].includes(law.type) ? '국제' : '국내';
  const typeName = type => type==='Treaty' ? '조약' : type;
  const category = law => categoryNames[law.category] || law.category;
  const title = law => law.shortTitle || law.title;
  const norm = text => String(text || '').normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g,' ').trim();
  const termsOf = value => norm(value).split(/\s+/).filter(Boolean);
  const hasTerms = (text,terms) => terms.every(t=>norm(text).includes(t));
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => '<i data-lucide="'+name+'" aria-hidden="true"></i>';
  const href = id => '#'+encodeURIComponent(id);
  const date = value => value ? esc(value.replaceAll('-','.')) : '미기재';
  const icons = () => window.lucide?.createIcons({attrs:{'aria-hidden':'true'}});
  const safeUrl = value => /^https?:\/\//i.test(value || '') ? value : '';
  const isSaved = law => state.bookmarks.has(law.id) || articlesOf(law).some(a=>state.bookmarks.has(a.id));
  const catalogLaws = () => state.laws.filter(l=>state.examples || !l.isExample);
  const lawText = law => [law.title,law.shortTitle,category(law),law.category,law.issuer,...law.aliases,...law.keywords].join(' ');
  const articleText = a => [a.number,a.title,...a.body].join(' ');

  function normalizeLaws(input) {
    return (Array.isArray(input) ? input : []).map((l,i)=>({
      ...l,id:String(l.id || 'law-'+i),title:String(l.title || '제목 없음'),shortTitle:String(l.shortTitle || l.title || '제목 없음'),
      type:l.type || '법령',category:l.category || '기타',issuer:l.issuer || '미기재',ministry:l.ministry || '',
      isExample:Boolean(l.isExample || String(l.id).startsWith('sample-') || l.id==='new-law'),
      status:l.isExample || String(l.id).startsWith('sample-') || l.id==='new-law' ? '예시' : (l.status || '미확인'),
      sourceUrl:l.sourceUrl || '',keywords:Array.isArray(l.keywords) ? l.keywords : [],aliases:Array.isArray(l.aliases) ? l.aliases : [],
      history:Array.isArray(l.history) ? l.history : [],
      sections:(Array.isArray(l.sections) ? l.sections : []).map((s,si)=>({
        ...s,id:String(s.id || l.id+'-section-'+si),title:String(s.title || '본문'),
        articles:(Array.isArray(s.articles) ? s.articles : []).map((a,ai)=>({
          ...a,id:String(a.id || l.id+'-article-'+si+'-'+ai),number:String(a.number || '조문 '+(ai+1)),title:String(a.title || ''),
          body:(Array.isArray(a.body) ? a.body : [a.body || '']).map(String),tags:Array.isArray(a.tags) ? a.tags : []
        }))
      }))
    }));
  }
  function readJSON(key,fallback) {
    try {
      const value=JSON.parse(localStorage.getItem(key)) ?? fallback;
      if(Array.isArray(fallback)) return Array.isArray(value) ? value : fallback;
      if(fallback && typeof fallback==='object') return value && typeof value==='object' && !Array.isArray(value) ? value : fallback;
      return value;
    } catch {return fallback;}
  }
  function writeJSON(key,value) { try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;} }
  function loadLaws() {
    const s=readJSON(STORAGE_KEY,null);
    return s && Array.isArray(s.laws) && s.laws.length && (s.version===VERSION || s.source==='user') ? normalizeLaws(s.laws) : bundled;
  }
  function statusInfo(law) {
    if(law.isExample) return ['예시','example'];
    if(law.type==='표준계약서') return ['서식',''];
    if(['Not in force','미발효'].includes(law.status)) return ['미발효','pending'];
    if(['No longer in force','폐지'].includes(law.status)) return [origin(law)==='국제' ? '효력 종료' : '폐지','ended'];
    if(['시행예정','개정예정'].includes(law.status)) return [law.status,'pending'];
    if(law.status.startsWith('In force') || law.status==='현행') return [origin(law)==='국제' ? '발효' : '현행',''];
    return [law.status,'pending'];
  }
  function statusMarkup(law) { const [label,kind]=statusInfo(law); return '<span class="status '+kind+'" title="'+esc(law.status)+'">'+esc(label)+'</span>'; }
  function matchesStatus(law) {
    const label=statusInfo(law)[0];
    if(state.status==='전체') return true;
    if(state.status==='현행') return ['발효','현행'].includes(label);
    if(state.status==='폐지') return ['효력 종료','폐지'].includes(label);
    return label===state.status;
  }
  function saveButton(id,label) {
    const saved=state.bookmarks.has(id);
    return '<button type="button" class="icon-button" data-save="'+esc(id)+'" aria-pressed="'+saved+'" aria-label="'+esc(label)+'" title="'+esc(label)+'">'+icon(saved ? 'bookmark-check' : 'bookmark')+'</button>';
  }
  function highlight(value,query) {
    const text=String(value || ''), terms=[...new Set(termsOf(query))].sort((a,b)=>b.length-a.length);
    if(!terms.length) return esc(text);
    const pattern=terms.map(t=>t.replace(/[.*+?^{}()|[\]\\$]/g,'\\$&')).join('|');
    return text.split(new RegExp('('+pattern+')','gi')).map((s,i)=>i%2 ? '<mark>'+esc(s)+'</mark>' : esc(s)).join('');
  }
  function excerpt(text,query) {
    const s=String(text).replace(/\s+/g,' '), start=Math.max(0,norm(s).indexOf(termsOf(query)[0] || '')-35);
    return (start ? '…' : '')+s.slice(start,start+155)+(s.length>start+155 ? '…' : '');
  }

  function catalogHref(values={}) {
    const params=new URLSearchParams();
    for(const [key,value] of Object.entries(values)) if(key in defaults && value!==defaults[key]) params.set(key,typeof value==='boolean' ? (value ? '1' : '0') : value);
    return (params.size ? '?'+params : '')+'#results';
  }
  function readingPoint(law) {
    const id=state.progress[law.id]?.articleId;
    return articlesOf(law).find(a=>a.id===id);
  }
  function recordVisit(law,target) {
    state.recent=[law.id,...state.recent.filter(id=>id!==law.id)].slice(0,8);
    const article=articlesOf(law).find(a=>a.id===target);
    state.progress[law.id]={...state.progress[law.id],...(article ? {articleId:article.id} : {}),seenAt:Date.now()};
    writeJSON(RECENT_KEY,state.recent);writeJSON(PROGRESS_KEY,state.progress);
  }
  function visitDate(timestamp) {
    if(!Number.isFinite(timestamp)) return '';
    const value=new Date(timestamp),today=new Date();
    return value.toDateString()===today.toDateString() ? '오늘' : new Intl.DateTimeFormat('ko',{month:'numeric',day:'numeric'}).format(value);
  }
  function renderHome() {
    const laws=state.laws.filter(l=>!l.isExample);
    $('#homeCollectionCount').innerHTML='<strong>'+laws.length+'</strong>개 자료 · <strong>'+laws.reduce((n,l)=>n+articlesOf(l).length,0).toLocaleString('ko')+'</strong>개 조문·부속 항목';
    const subjects=[
      ['해상운송',['상법·해상운송','해상운송','용선계약'],['commercial-code','hague-visby-rules','hamburg-rules-1978','rotterdam-rules-2008','gencon-1994-voyage-charter-party']],
      ['선박과 선원',['선박·항해안전','선원·해사노동'],['korean-ship-act','korean-seafarers-act','korean-ship-safety-act','solas-convention-1974','maritime-labour-convention-2006']],
      ['국제해양법',['국제해양법'],['unclos-1982','unclos-part-xi-agreement-1994','un-fish-stocks-agreement-1995','bbnj-agreement-2023']]
    ];
    $('#homeSubjects').innerHTML=subjects.map(([label,categories,preferred])=>{
      const available=laws.filter(l=>categories.includes(category(l)));
      const selected=[...preferred.map(id=>available.find(l=>l.id===id)).filter(Boolean),...available.filter(l=>!preferred.includes(l.id))].slice(0,5);
      return '<section class="home-subject"><h3>'+label+'</h3>'+(selected.length ? '<ul>'+selected.map(l=>'<li><a href="'+href(l.id)+'" data-law-link="'+esc(l.id)+'" title="'+esc(l.title)+'">'+esc(l.id==='commercial-code' ? '상법 제5편 해상' : title(l))+'</a></li>').join('')+'</ul>' : '<p class="subject-empty">수록된 자료가 없습니다.</p>')+'</section>';
    }).join('');
    const types=[
      ['국내 법령','landmark',{origin:'국내'},l=>origin(l)==='국내'],
      ['국제 조약','globe-2',{origin:'국제',type:'조약'},l=>typeName(l.type)==='조약'],
      ['국제 규칙','scale',{type:'국제규칙'},l=>l.type==='국제규칙'],
      ['표준계약서','file-text',{type:'표준계약서'},l=>l.type==='표준계약서']
    ];
    $('#homeTypes').innerHTML=types.map(([label,symbol,filters,match])=>'<a class="home-type" href="'+esc(catalogHref(filters))+'" data-browse data-browse-filters="'+esc(JSON.stringify(filters))+'">'+icon(symbol)+'<strong>'+label+'</strong><span><b>'+laws.filter(match).length+'</b>건</span>'+icon('chevron-right')+'</a>').join('');
    const fields=new Map();for(const law of laws) fields.set(category(law),(fields.get(category(law)) || 0)+1);
    $('#homeFieldCount').textContent=fields.size+'개 분야';
    $('#homeCategories').innerHTML=[...fields].sort((a,b)=>a[0].localeCompare(b[0],'ko')).map(([label,count])=>'<a class="home-category" href="'+esc(catalogHref({category:label}))+'" data-browse data-browse-filters="'+esc(JSON.stringify({category:label}))+'"><span>'+esc(label)+'</span><small>'+count+'</small></a>').join('');
    const quick=['commercial-code','unclos-1982','hamburg-rules-1978','hague-visby-rules','rotterdam-rules-2008'].map(id=>laws.find(l=>l.id===id)).filter(Boolean);
    $('#homeQuickLinks').innerHTML=quick.map(l=>'<a href="'+href(l.id)+'" data-law-link="'+esc(l.id)+'">'+esc(title(l))+icon('arrow-right')+'</a>').join('');
    $('.home-quick-section').hidden=!quick.length;
    const recent=state.recent.map(id=>state.laws.find(l=>l.id===id)).filter(Boolean).slice(0,4);
    $('#clearRecent').hidden=!recent.length;
    $('#homeRecent').innerHTML=recent.length ? recent.map(law=>{
      const point=readingPoint(law),storedTime=state.progress[law.id]?.seenAt;
      const seenAt=Number.isFinite(storedTime) && Number.isFinite(new Date(storedTime).getTime()) ? storedTime : null;
      return '<a class="home-recent-entry" href="'+href(point?.id || law.id)+'" data-law-link="'+esc(point?.id || law.id)+'"><div class="recent-topline"><strong>'+esc(title(law))+'</strong>'+(seenAt ? '<time datetime="'+esc(new Date(seenAt).toISOString())+'">'+visitDate(seenAt)+'</time>' : '')+'</div><p>'+esc(point ? point.number+(point.title ? ' · '+point.title : '') : category(law))+'</p><span class="resume-label">'+(point ? '이어서 읽기' : '다시 열기')+icon('arrow-right')+'</span></a>';
    }).join('') : '<div class="home-empty"><p>아직 열람한 자료가 없습니다.</p><a href="#results" data-browse>자료 찾아보기'+icon('arrow-right')+'</a></div>';
    const saved=[...state.bookmarks].reverse().map(id=>selectionFor(id)).filter(Boolean);
    $('#homeView').dataset.hasPersonal=String(Boolean(recent.length || saved.length));
    $('#homeSavedCount').textContent=saved.length;
    $('#homeSaved').innerHTML=saved.length ? saved.slice(0,3).map(({law,target})=>{
      const a=articlesOf(law).find(article=>article.id===target),id=a?.id || law.id;
      return '<div class="home-saved-entry"><a href="'+href(id)+'" data-law-link="'+esc(id)+'">'+esc(title(law))+(a ? ' · '+esc(a.number) : '')+'<small>'+esc(a ? a.title || category(law) : category(law))+'</small></a>'+saveButton(id,(a ? a.number : title(law))+' 저장 해제')+'</div>';
    }).join('') : '<div class="home-empty"><p>저장한 법령·조문이 없습니다.</p></div>';
    $$('[data-home-target]').forEach(input=>{input.checked=input.value===state.homeTarget;});
    renderSearchHistory();renderNavigation();icons();
  }
  function rememberSearch(query) {
    if(!query) return;
    state.searches=[query,...state.searches.filter(value=>norm(value)!==norm(query))].slice(0,5);
    writeJSON(SEARCHES_KEY,state.searches);
  }
  function renderSearchHistory() {
    $('#searchHistory').hidden=!state.searches.length;
    $('#searchHistory').innerHTML='<span>최근 검색</span>'+state.searches.map(query=>'<span class="search-history-item"><a href="'+esc(catalogHref({query,sort:'matched'}))+'" data-repeat-search="'+esc(query)+'">'+esc(query)+'</a><button type="button" class="icon-button" data-remove-search="'+esc(query)+'" aria-label="'+esc(query)+' 검색 기록 삭제" title="검색 기록 삭제">'+icon('x')+'</button></span>').join('');
  }
  function setView(view) {
    state.view=view;document.body.dataset.view=view;
    $('#homeView').hidden=view!=='home';$('#catalogView').hidden=view!=='catalog';$('#readerView').hidden=view!=='reader';$('#browseNav').hidden=view==='reader';
  }
  function showHome(push=false) {
    clearTimeout(searchTimer);articleObserver?.disconnect();state.law=null;
    Object.assign(state,defaults);$('#searchInput').value='';$('#homeSearchInput').value='';
    $('#readerView').innerHTML='';setView('home');
    document.title='해사법령 아카이브';
    if(push) {
      const url=new URL(location.href);for(const key of Object.keys(defaults)) url.searchParams.delete(key);
      url.hash='home';history.pushState(null,'',url);
    }
    renderHome();window.scrollTo({top:0,behavior:'instant'});
  }
  function openCatalog(values={}) {
    clearTimeout(searchTimer);Object.assign(state,defaults,values);$('#searchInput').value=state.query;
    showCatalog(true);syncFilters();window.scrollTo({top:0,behavior:'instant'});
  }
  function renderNavigation() {
    const base=state.laws.filter(l=>state.examples || !l.isExample);
    $('#countAll').textContent=base.length;
    $('#countDomestic').textContent=base.filter(l=>origin(l)==='국내').length;
    $('#countInternational').textContent=base.filter(l=>typeName(l.type)==='조약').length;
    $('#countRules').textContent=base.filter(l=>l.type==='국제규칙').length;
    $('#countContracts').textContent=base.filter(l=>l.type==='표준계약서').length;
    $$('.primary-nav button').forEach(b=>{
      const active=b.hasAttribute('data-home') ? state.view==='home' : state.view==='catalog' && (b.dataset.type ? state.type===b.dataset.type : state.type==='전체' && state.origin===b.dataset.origin);
      if(active) b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    });
  }

  function readFilters() {
    const params=new URLSearchParams(location.search);
    Object.assign(state,defaults);
    for(const key of Object.keys(defaults)) if(params.has(key)) state[key]=typeof defaults[key]==='boolean' ? params.get(key)==='1' : params.get(key);
    if(!['archive','title','updated','matched'].includes(state.sort)) state.sort='archive';
    if(!['all','title'].includes(state.target)) state.target='all';
    if(!['전체','국내','국제'].includes(state.origin)) state.origin='전체';
    $('#searchInput').value=state.query;
  }
  function syncFilters() {
    const url=new URL(location.href);
    for(const key of Object.keys(defaults)) {
      if(state[key]===defaults[key]) url.searchParams.delete(key);
      else url.searchParams.set(key,typeof state[key]==='boolean' ? (state[key] ? '1' : '0') : state[key]);
    }
    history.replaceState(null,'',url);
  }
  function changeFilters(values) {
    const entering=state.view!=='catalog';Object.assign(state,values);
    showCatalog(entering);syncFilters();if(entering) window.scrollTo({top:0,behavior:'instant'});
  }
  function resetFilters() { Object.assign(state,defaults); $('#searchInput').value=''; syncFilters(); showCatalog(false); }
  function getResults() {
    const terms=termsOf(state.query);
    return catalogLaws().filter(l=>(state.origin==='전체' || origin(l)===state.origin) &&
      (state.type==='전체' || typeName(l.type)===state.type) && (state.category==='전체' || category(l)===state.category) &&
      (state.agency==='전체' || l.issuer===state.agency) && (!state.saved || isSaved(l)) && matchesStatus(l))
      .map(law=>{
        const direct=hasTerms(lawText(law),terms);
        const matches=terms.length && state.target==='all' ? articlesOf(law).filter(a=>hasTerms(articleText(a),terms)) : [];
        const full=terms.length && state.target==='all' && hasTerms(lawText(law)+' '+articlesOf(law).map(articleText).join(' '),terms);
        return {law,matches,visible:!terms.length || direct || matches.length || full,score:(direct ? 30 : 0)+matches.length};
      }).filter(x=>x.visible).sort((a,b)=>{
        if(state.sort==='title') return title(a.law).localeCompare(title(b.law),'ko');
        if(state.sort==='updated') return String(b.law.lastUpdated || '').localeCompare(String(a.law.lastUpdated || ''));
        return state.sort==='matched' ? b.score-a.score : 0;
      });
  }
  function renderCatalog() {
    const base=catalogLaws();renderNavigation();
    $('#collectionCount').innerHTML='<strong>'+base.length+'</strong>개 자료 · <strong>'+base.reduce((n,l)=>n+articlesOf(l).length,0).toLocaleString('ko')+'</strong>개 조문·부속 항목';
    $('#exampleCount').textContent='('+state.laws.filter(l=>l.isExample).length+')';
    $('#includeExamples').checked=state.examples; $('#statusFilter').value=state.status; $('#sortSelect').value=state.sort;
    $$('[data-search-target]').forEach(b=>b.setAttribute('aria-pressed',String(state.target===b.dataset.searchTarget)));
    const scope=base.filter(l=>state.origin==='전체' || origin(l)===state.origin);
    renderFilterList('#typeFilters',scope,l=>typeName(l.type),'type');
    renderFilterList('#categoryFilters',scope,category,'category');
    const agencies=[...new Set(scope.map(l=>l.issuer))].sort((a,b)=>a.localeCompare(b,'ko'));
    $('#agencySelect').innerHTML='<option value="전체">전체 기관</option>'+agencies.map(a=>'<option value="'+esc(a)+'">'+esc(agencyNames[a] || a)+'</option>').join('');
    $('#agencySelect').value=state.agency;
    const labels={query:'검색',origin:'구분',type:'종류',category:'분야',agency:'기관',status:'상태',saved:'저장한 자료'};
    $('#activeFilters').innerHTML=Object.entries(labels).filter(([k])=>state[k]!==defaults[k]).map(([k,label])=>'<button type="button" data-clear-filter="'+k+'" aria-label="'+esc(label+' 조건 해제')+'">'+esc(k==='saved' ? label : k==='agency' ? agencyNames[state[k]] || state[k] : state[k])+icon('x')+'</button>').join('');
    const results=getResults();
    $('#activeScope').textContent=state.saved ? '저장한 자료' : state.query ? '검색 결과' : state.category!=='전체' ? state.category : state.type!=='전체' ? state.type : state.origin==='전체' ? '전체 자료' : state.origin+' 자료';
    $('#resultCount').textContent=results.length+'건';
    $('#lawList').innerHTML=results.length ? results.map(renderRow).join('') : '<div class="empty-state"><strong>'+(state.saved ? '저장한 자료가 없습니다.' : '검색 결과가 없습니다.')+'</strong><p>'+(state.saved ? '법령이나 조문의 책갈피를 선택하면 이곳에 모입니다.' : '검색어 또는 선택한 조건을 확인해 주세요.')+'</p><button type="button" class="primary-button" data-reset>전체 자료 보기</button></div>';
    $('#listFooter').textContent=results.length ? results.length+'개 자료 표시' : '';
    const recent=state.recent.map(id=>state.laws.find(l=>l.id===id)).filter(Boolean).slice(0,5);
    $('#recentSection').hidden=!recent.length;
    $('#recentList').innerHTML=recent.map(l=>{const id=readingPoint(l)?.id || l.id;return '<a href="'+href(id)+'" data-law-link="'+esc(id)+'">'+esc(title(l))+'</a>';}).join('');
    icons();
  }
  function renderFilterList(selector,laws,valueOf,key) {
    const counts=new Map(); for(const l of laws) counts.set(valueOf(l),(counts.get(valueOf(l)) || 0)+1);
    $(selector).innerHTML=[['전체',laws.length],...[...counts].sort((a,b)=>a[0].localeCompare(b[0],'ko'))].map(([label,count])=>
      '<button type="button" class="filter-button" data-filter="'+key+'" data-value="'+esc(label)+'" aria-pressed="'+(state[key]===label)+'"><span>'+esc(label)+'</span><span>'+count+'</span></button>').join('');
  }
  function renderRow({law,matches}) {
    const hits=state.query ? matches : state.saved ? articlesOf(law).filter(a=>state.bookmarks.has(a.id)) : [];
    const excerpts=hits.slice(0,2).map(a=>'<a href="'+href(a.id)+'" data-law-link="'+esc(a.id)+'"><strong>'+esc(a.number)+'</strong>'+highlight(state.query ? excerpt([a.title,...a.body].join(' '),state.query) : a.title,state.query)+'</a>').join('');
    return '<article class="law-row"><div class="law-row-name"><div class="law-row-labels"><span>'+origin(law)+'</span><span>'+esc(typeName(law.type))+'</span><span>'+esc(agencyNames[law.issuer] || law.issuer)+'</span></div>'+
      '<h3><a class="law-row-title" href="'+href(law.id)+'" data-law-link="'+esc(law.id)+'">'+highlight(title(law),state.query)+'</a></h3>'+
      (law.title!==title(law) ? '<p class="law-full-title">'+highlight(law.title,state.query)+'</p>' : '')+(excerpts ? '<div class="match-excerpts">'+excerpts+'</div>' : '')+'</div>'+
      '<div class="law-row-context"><strong>'+esc(category(law))+'</strong><span>'+articlesOf(law).length+'개 조문·항목'+(law.id==='commercial-code' ? ' · 발췌' : '')+'</span></div>'+statusMarkup(law)+saveButton(law.id,title(law)+' 저장')+'</article>';
  }
  function selectionFor(target) {
    for(const law of state.laws) {
      if(law.id===target) return {law,target:null};
      if(articlesOf(law).some(a=>a.id===target) || law.sections.some(s=>'section-'+s.id===target)) return {law,target};
    }
    return null;
  }
  function hashTarget() { try{return decodeURIComponent(location.hash.slice(1));}catch{return '';} }
  function route() {
    const target=hashTarget();
    if(target==='mainContent' || (target==='documentInfo' && state.law)) return;
    const s=selectionFor(target);
    if(s) openSelection(s,false);
    else if(target!=='home' && (target==='results' || Object.keys(defaults).some(key=>state[key]!==defaults[key]))) showCatalog(false);
    else showHome();
  }
  function navigate(target) {
    clearTimeout(searchTimer);
    const s=selectionFor(target); if(!s) return;
    if(!state.law) state.catalogScroll=scrollY;
    if(location.hash!==href(target)) history.pushState(null,'',href(target));
    openSelection(s,true);
  }
  function openSelection(selection,remember) {
    const changed=state.law?.id!==selection.law.id;
    state.law=selection.law;
    if(changed) {state.readerQuery='';state.hits=[];state.hitIndex=-1;state.activeArticle=null;}
    setView('reader');
    document.title=title(state.law)+' - 해사법령 아카이브';
    if(changed || !$('#readerView').children.length) renderReader();
    if(changed || remember) recordVisit(state.law,selection.target);
    $('#lawSwitcher').close();
    if(selection.target) scrollToTarget(selection.target); else window.scrollTo({top:0,behavior:'instant'});
  }
  function showCatalog(push=true) {
    articleObserver?.disconnect(); state.law=null;
    setView('catalog');$('#readerView').innerHTML='';
    document.title='해사법령 아카이브';
    if(push) history.pushState(null,'','#results');
    renderCatalog();
  }
  function backToCatalog() {showCatalog(true);requestAnimationFrame(()=>window.scrollTo({top:state.catalogScroll,behavior:'instant'}));}
  function sectionTitle(text) {return text.replace(/^직접 조항:\s*/,'').replace(/^준용·연결 조항 원문\s*·\s*/,'').replace(/제5편 해상,\s*제2장 운송과 용선\s*·\s*/,'').replace(/:\s*제\d+조.*$/,'');}
  function coverage(law) {
    if(law.isExample) return '예시 자료 · 실제 법령 원문이 아닙니다.';
    if(law.coverage) return law.coverage;
    if(law.type==='표준계약서') return '등록된 1994년 계약서 서식 · Part I 및 Part II';
    if(/Annex|부속/i.test(law.sections.map(s=>s.title).join(' '))) return '수록본: 협약 본문 및 등록된 부속 항목';
    if(law.type==='Treaty') return '수록본: 협약 본문 · 부속서·개정 의정서 전체가 포함된 통합본은 아닙니다.';
    return '수록본: 등록된 조문 원문';
  }

  function renderReader() {
    const law=state.law, short=title(law), articles=articlesOf(law);
    $('#readerView').innerHTML=
      '<div class="reader-bar"><div class="reader-bar-inner"><div class="reader-breadcrumb"><button type="button" data-back>'+icon('arrow-left')+'<span>자료 목록</span></button><span>/</span><strong>'+esc(short)+'</strong></div><div id="readerSearchResults" class="reader-search-results" hidden></div>'+
      '<div class="reader-bar-actions"><button type="button" class="mobile-toc-button" data-toggle-toc aria-expanded="false">'+icon('list')+'목차</button><button type="button" data-switch-law>'+icon('library')+'다른 법령</button>'+saveButton(law.id,'이 자료 저장')+
      '<button type="button" class="icon-button print-button" data-print title="인쇄" aria-label="인쇄">'+icon('printer')+'</button></div></div></div>'+
      '<div class="reader-layout"><aside class="reader-toc" aria-label="조문 목차"><div class="toc-heading"><h2>목차</h2><button type="button" class="quiet-button" data-fold-toc>모두 접기</button></div><a class="toc-top" href="'+href(law.id)+'" data-top>'+esc(short)+'</a>'+
      law.sections.map((s,i)=>'<details class="toc-section" data-section="'+esc(s.id)+'" '+(i===0 || law.sections.length<4 ? 'open' : '')+'><summary>'+icon('chevron-right')+'<span>'+esc(sectionTitle(s.title))+'</span></summary>'+
        s.articles.map(a=>'<a href="'+href(a.id)+'" data-law-link="'+esc(a.id)+'" data-toc-article="'+esc(a.id)+'"><span>'+esc(a.number)+'</span>'+esc(a.title || a.number)+'</a>').join('')+'</details>').join('')+
      '<a class="toc-top" href="#documentInfo" data-info>자료 정보·출처</a></aside>'+
      '<div class="document-column"><header class="document-header" id="documentTop"><div class="document-kicker"><span>'+origin(law)+'</span><span>'+esc(typeName(law.type))+'</span><span>'+esc(category(law))+'</span>'+statusMarkup(law)+'</div><h1>'+esc(short)+'</h1>'+
      (short!==law.title ? '<p class="document-subtitle">'+esc(law.title)+'</p>' : '')+'<p class="document-coverage">'+esc(coverage(law))+'</p><div class="document-meta"><span><b>수록</b>'+articles.length+'개 조문·항목</span>'+
      (law.promulgationDate ? '<span><b>'+(origin(law)==='국제' ? '채택' : '공포')+'</b>'+date(law.promulgationDate)+'</span>' : '')+
      (law.enforcementDate ? '<span><b>'+(origin(law)==='국제' ? '발효' : '시행')+'</b>'+date(law.enforcementDate)+'</span>' : '')+'</div></header>'+
      '<div class="reader-search"><form id="readerSearchForm" role="search" aria-label="현재 법령 본문 검색"><label class="reader-search-box">'+icon('search')+'<input id="readerSearchInput" type="search" aria-label="이 법령 본문 검색" placeholder="이 법령에서 검색" value="'+esc(state.readerQuery)+'" autocomplete="off"></label><button type="submit">본문 검색</button></form></div>'+
      '<div id="articleContent">'+renderArticles(law)+'</div>'+renderDocumentInfo(law)+
      '<div class="document-end"><button type="button" class="quiet-button" data-back>'+icon('arrow-left')+'자료 목록</button><button type="button" class="quiet-button" data-top>'+icon('arrow-up')+'맨 위로</button></div></div>'+
      '<aside class="reading-tools" aria-label="읽기 설정 및 자료 정보"><details class="reading-settings" '+(innerWidth>1180 ? 'open' : '')+'><summary>'+icon('settings-2')+'읽기 설정·자료 정보</summary><div class="tools-inner">'+renderReadingTools(law)+'</div></details></aside></div>';
    applyPreferences();renderSearchStatus();observeArticles();icons();
  }
  function renderReadingTools(law) {
    const related=state.laws.filter(l=>!l.isExample && l.id!==law.id && category(l)===category(law)).slice(0,4);
    return '<div class="tool-section"><h2>읽기 설정</h2><span class="tool-label">글자 크기</span><div class="font-size-control"><button type="button" data-font-step="-1" title="글자 작게" aria-label="글자 작게">'+icon('minus')+'</button><output id="fontSizeValue"></output><button type="button" data-font-step="1" title="글자 크게" aria-label="글자 크게">'+icon('plus')+'</button></div>'+
      '<span class="tool-label">글꼴</span><div class="option-segment" role="group" aria-label="본문 글꼴"><button type="button" data-font="sans">고딕</button><button type="button" data-font="serif">명조</button></div>'+
      '<span class="tool-label">줄 간격</span><div class="option-segment" role="group" aria-label="줄 간격"><button type="button" data-leading="1.7">보통</button><button type="button" data-leading="2">넓게</button></div>'+
      '<span class="tool-label">조문 바로가기</span><form class="article-jump" id="articleJumpForm"><input id="articleJump" type="search" aria-label="조문 번호" placeholder="'+(origin(law)==='국내' ? '예: 842' : '예: 5')+'"><button type="submit" aria-label="조문으로 이동" title="조문으로 이동">'+icon('arrow-right')+'</button></form></div>'+
      '<div class="tool-section"><h2>자료 정보</h2>'+(safeUrl(law.sourceUrl) ? '<a href="'+esc(law.sourceUrl)+'" target="_blank" rel="noreferrer">출처 원문'+icon('external-link')+'</a>' : '<p class="source-description">출처 링크 미등록</p>')+
      '<a href="#documentInfo" data-info>수록 범위·상세 정보'+icon('arrow-down')+'</a><p class="source-description">'+esc(agencyNames[law.issuer] || law.issuer)+'<br>자료 갱신 '+date(law.lastUpdated)+'</p></div>'+
      (related.length ? '<div class="tool-section related-tools"><h2>같은 분야의 자료</h2>'+related.map(l=>'<a class="related-link" href="'+href(l.id)+'" data-law-link="'+esc(l.id)+'">'+esc(title(l))+'</a>').join('')+'</div>' : '');
  }
  function paragraphs(article) {
    // Punctuation-delimited markers separate paragraphs without altering wording.
    return article.body.flatMap(text=>text.split(/(?<=[.;:])\s+(?=(?:\d{1,2}\.\s|\([a-z0-9]{1,3}\)\s))/)).filter(t=>t.trim());
  }
  function bodyMarkup(text,law) {
    if(origin(law)!=='국내') return highlight(text,state.readerQuery);
    const numbers=new Map(articlesOf(law).map(a=>[a.number,a.id]));
    return text.split(/(제\d+조(?:의\d+)?)/g).map(chunk=>numbers.has(chunk) ? '<a href="'+href(numbers.get(chunk))+'" data-law-link="'+esc(numbers.get(chunk))+'" title="수록된 '+esc(chunk)+'로 이동">'+highlight(chunk,state.readerQuery)+'</a>' : highlight(chunk,state.readerQuery)).join('');
  }
  function renderArticles(law) {
    return law.sections.map(s=>'<section class="article-section" id="section-'+esc(s.id)+'"><h2>'+esc(sectionTitle(s.title))+'</h2>'+
      s.articles.map(a=>(a.headingBefore ? '<h3 class="article-subheading">'+esc(a.headingBefore)+'</h3>' : '')+'<article class="reader-article" id="'+esc(a.id)+'" lang="'+(origin(law)==='국제' ? 'en' : 'ko')+'"><div class="article-heading"><h3><a class="article-number" href="'+href(a.id)+'" data-law-link="'+esc(a.id)+'">'+esc(a.number)+'</a> '+highlight(a.title,state.readerQuery)+'</h3>'+
      '<div class="article-actions">'+saveButton(a.id,a.number+' 저장')+'<button type="button" class="icon-button" data-copy="'+esc(a.id)+'" title="조문 복사" aria-label="'+esc(a.number)+' 복사">'+icon('copy')+'</button>'+
      '<button type="button" class="icon-button" data-copy-link="'+esc(a.id)+'" title="조문 링크 복사" aria-label="'+esc(a.number)+' 링크 복사">'+icon('link')+'</button></div></div>'+
      '<div class="article-body">'+paragraphs(a).map(p=>'<p'+(/^(?:\([a-z0-9]+\)|\d+\.)/.test(p) ? ' class="subparagraph"' : '')+'>'+bodyMarkup(p,law)+'</p>').join('')+'</div></article>').join('')+'</section>').join('');
  }
  function renderDocumentInfo(law) {
    return '<section class="document-info" id="documentInfo"><h2>자료 정보</h2><dl><dt>원문 제목</dt><dd>'+esc(law.title)+'</dd><dt>기관·기구</dt><dd>'+esc(law.issuer)+'</dd><dt>분야</dt><dd>'+esc(category(law))+(category(law)!==law.category ? ' ('+esc(law.category)+')' : '')+'</dd><dt>수록 범위</dt><dd>'+esc(coverage(law))+'</dd><dt>상태</dt><dd>'+statusMarkup(law)+' '+esc(law.status)+'</dd><dt>자료 갱신</dt><dd>'+date(law.lastUpdated)+'</dd><dt>출처</dt><dd>'+
      (safeUrl(law.sourceUrl) ? '<a href="'+esc(law.sourceUrl)+'" target="_blank" rel="noreferrer">'+esc(law.sourceUrl)+icon('external-link')+'</a>' : '출처 링크 미등록')+'</dd></dl>'+
      (law.history.length ? '<details><summary>등록된 연혁</summary>'+law.history.map(h=>'<div class="history-item"><time>'+date(h.date)+'</time><b>'+esc(h.type)+'</b><p>'+esc(h.summary)+'</p></div>').join('')+'</details>' : '')+
      '<details><summary>다른 이름·주제어</summary><p class="keyword-list">'+[...new Set([...law.aliases,...law.keywords])].map(esc).join(' · ')+'</p></details></section>';
  }
  function applyPreferences() {
    const p=state.prefs;
    p.size=Math.max(14,Math.min(23,Number(p.size) || 17));p.font=p.font==='serif' ? 'serif' : 'sans';p.leading=Number(p.leading)===1.7 ? 1.7 : 2;
    const style=document.documentElement.style;
    style.setProperty('--article-size',p.size+'px');style.setProperty('--article-leading',p.leading);
    style.setProperty('--article-font',p.font==='serif' ? 'Georgia,"AppleMyungjo","Batang",serif' : '-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif');
    if($('#fontSizeValue')) $('#fontSizeValue').textContent=p.size+' px';
    $$('[data-font-step]').forEach(b=>b.disabled=Number(b.dataset.fontStep)<0 ? p.size<=14 : p.size>=23);
    $$('[data-font]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.font===p.font)));
    $$('[data-leading]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.leading)===p.leading)));
  }
  function updatePreference(key,value) {
    const anchor=state.activeArticle;state.prefs[key]=value;applyPreferences();writeJSON(PREFS_KEY,state.prefs);
    if(anchor) scrollToTarget(anchor);
  }
  function searchWithin(query) {
    state.readerQuery=query.trim();
    state.hits=state.readerQuery ? articlesOf(state.law).filter(a=>hasTerms(articleText(a),termsOf(query))).map(a=>a.id) : [];
    state.hitIndex=state.hits.length ? 0 : -1;
    $('#articleContent').innerHTML=renderArticles(state.law);
    renderSearchStatus();observeArticles();icons();
    if(state.hits.length) goToHit(0); else $('#readerSearchInput').focus();
  }
  function renderSearchStatus() {
    const el=$('#readerSearchResults');if(!el) return;
    el.hidden=!state.readerQuery;
    el.innerHTML='<span role="status" aria-live="polite">'+(state.hits.length ? '일치 조문 '+(state.hitIndex+1)+' / '+state.hits.length+'개' : '일치하는 조문이 없습니다.')+'</span>'+
      '<button type="button" class="icon-button" data-hit-step="-1" aria-label="이전 검색 결과" title="이전 검색 결과" '+(!state.hits.length ? 'disabled' : '')+'>'+icon('chevron-up')+'</button>'+
      '<button type="button" class="icon-button" data-hit-step="1" aria-label="다음 검색 결과" title="다음 검색 결과" '+(!state.hits.length ? 'disabled' : '')+'>'+icon('chevron-down')+'</button>'+
      '<button type="button" class="quiet-button" data-clear-reader-search>검색 해제</button>';
    const headerHeight=innerWidth>800 ? $('.site-header').offsetHeight : 0;
    document.documentElement.style.setProperty('--reader-offset',(headerHeight+$('.reader-bar').offsetHeight+20)+'px');
  }
  function goToHit(step) {
    if(!state.hits.length) return;
    state.hitIndex=(state.hitIndex+step+state.hits.length)%state.hits.length;
    const id=state.hits[state.hitIndex];$$('.reader-article.search-hit').forEach(a=>a.classList.remove('search-hit'));
    document.getElementById(id)?.classList.add('search-hit');scrollToTarget(id);renderSearchStatus();icons();
  }
  function scrollToTarget(id) {
    requestAnimationFrame(()=>{
      document.getElementById(id)?.scrollIntoView({block:'start',behavior:'instant'});
      const toc=$$('[data-toc-article]').find(a=>a.dataset.tocArticle===id);
      if(toc) {toc.closest('details').open=true;setActiveArticle(id);}
      $('.reader-toc')?.classList.remove('mobile-open');$('[data-toggle-toc]')?.setAttribute('aria-expanded','false');
    });
  }
  function setActiveArticle(id) {
    if(state.activeArticle===id) return;
    state.activeArticle=id;$$('[data-toc-article][aria-current]').forEach(a=>a.removeAttribute('aria-current'));
    const link=$$('[data-toc-article]').find(a=>a.dataset.tocArticle===id);
    if(link) {
      if(state.law && state.progress[state.law.id]?.articleId!==id) {
        state.progress[state.law.id]={articleId:id,seenAt:Date.now()};
        writeJSON(PROGRESS_KEY,state.progress);
      }
      link.setAttribute('aria-current','location');
      link.closest('details').open=true;
      const toc=$('.reader-toc'), bounds=toc.getBoundingClientRect(), item=link.getBoundingClientRect();
      if(item.top<bounds.top || item.bottom>bounds.bottom) toc.scrollTop+=item.top-bounds.top-60;
    }
  }
  function observeArticles() {
    articleObserver?.disconnect();if(!('IntersectionObserver' in window)) return;
    const visible=new Set();
    articleObserver=new IntersectionObserver(entries=>{
      entries.forEach(e=>e.isIntersecting ? visible.add(e.target) : visible.delete(e.target));
      const first=[...visible].sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0];
      if(first) setActiveArticle(first.id);
    },{rootMargin:innerWidth>800 ? '-155px 0px -55% 0px' : '-65px 0px -55% 0px',threshold:0});
    $$('.reader-article').forEach(a=>articleObserver.observe(a));
  }
  function jumpToArticle(query) {
    const q=norm(query).replace(/\s+/g,'');
    const matches=articlesOf(state.law).filter(a=>norm(a.number).replace(/\s+/g,'')===q || norm(a.number).replace(/^(article|clause|rule|제)\s*/,'').replace(/조$/,'').replace(/\s+/g,'')===q);
    if(matches.length===1) navigate(matches[0].id);
    else if(matches.length>1) {
      state.readerQuery=matches[0].number;$('#readerSearchInput').value=state.readerQuery;
      state.hits=matches.map(a=>a.id);state.hitIndex=0;renderSearchStatus();goToHit(0);
      showToast('같은 번호의 조문 '+matches.length+'개를 찾았습니다.');
    } else showToast('수록된 조문 번호를 찾지 못했습니다.');
  }
  function openSwitcher() {$('#switcherInput').value='';renderSwitcher();$('#lawSwitcher').showModal();$('#switcherInput').focus();}
  function renderSwitcher() {
    const query=$('#switcherInput').value, terms=termsOf(query);
    const laws=state.laws.filter(l=>(!l.isExample || state.examples) && hasTerms(lawText(l),terms));
    $('#switcherList').innerHTML=laws.length ? laws.map(l=>'<a href="'+href(l.id)+'" data-law-link="'+esc(l.id)+'"><strong>'+highlight(title(l),query)+'</strong><small>'+esc(category(l))+' · '+esc(l.title)+'</small></a>').join('') : '<p class="empty-state">일치하는 자료가 없습니다.</p>';
  }
  function toggleSave(id) {
    if(state.bookmarks.has(id)) state.bookmarks.delete(id);else state.bookmarks.add(id);
    const saved=writeJSON(BOOKMARK_KEY,[...state.bookmarks]);
    $$('[data-save]').filter(b=>b.dataset.save===id).forEach(b=>{const active=state.bookmarks.has(id);b.setAttribute('aria-pressed',String(active));b.innerHTML=icon(active ? 'bookmark-check' : 'bookmark');});
    if(state.view==='home') renderHome();else if(!state.law && state.saved) renderCatalog();else icons();
    showToast(saved ? (state.bookmarks.has(id) ? '저장한 자료에 추가했습니다.' : '저장을 해제했습니다.') : '현재 화면에 반영했습니다. 브라우저 저장 공간을 사용할 수 없습니다.');
  }
  async function copyText(text,message) {
    try {await navigator.clipboard.writeText(text);}
    catch {
      const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();
      const success=document.execCommand('copy');area.remove();
      if(!success) {showToast('복사하지 못했습니다. 본문을 선택해 복사해 주세요.');return;}
    }
    showToast(message);
  }
  function copyArticle(id) {
    const a=articlesOf(state.law).find(a=>a.id===id);
    if(a) copyText(state.law.title+'\n'+a.number+(a.title ? ' '+a.title : '')+'\n\n'+paragraphs(a).join('\n\n'),'조문을 복사했습니다.');
  }
  function showToast(message) {
    $('#toast').textContent=message;$('#toast').classList.add('show');
    clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>$('#toast').classList.remove('show'),2500);
  }

  document.addEventListener('click',event=>{
    const link=event.target.closest('[data-law-link]');
    if(link && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button===0) {event.preventDefault();navigate(link.dataset.lawLink);return;}
    const b=event.target.closest('button, a');if(!b) return;
    if(b.hasAttribute('data-home')) {
      if(event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();showHome(true);return;
    }
    if(b.hasAttribute('data-home-index')) {
      if(event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();if(state.view!=='home') showHome(true);
      $('#homeFields').scrollIntoView({block:'start'});$('#homeFields').focus({preventScroll:true});return;
    }
    if(b.hasAttribute('data-browse') || b.hasAttribute('data-repeat-search') || b.hasAttribute('data-open-saved')) {
      if(event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      if(b.hasAttribute('data-repeat-search')) {
        const query=b.dataset.repeatSearch;rememberSearch(query);openCatalog({query,sort:'matched'});
      } else openCatalog(b.hasAttribute('data-open-saved') ? {saved:true} : JSON.parse(b.dataset.browseFilters || '{}'));
      return;
    }
    if(b.hasAttribute('data-remove-search')) {
      state.searches=state.searches.filter(q=>q!==b.dataset.removeSearch);writeJSON(SEARCHES_KEY,state.searches);renderSearchHistory();icons();return;
    }
    if(b.hasAttribute('data-save')) {toggleSave(b.dataset.save);return;}
    if(b.hasAttribute('data-back')) {backToCatalog();return;}
    if(b.hasAttribute('data-switch-law')) {openSwitcher();return;}
    if(b.hasAttribute('data-print')) {window.print();return;}
    if(b.hasAttribute('data-copy')) {copyArticle(b.dataset.copy);return;}
    if(b.hasAttribute('data-copy-link')) {const url=new URL(location.href);url.hash=encodeURIComponent(b.dataset.copyLink);copyText(url.href,'조문 링크를 복사했습니다.');return;}
    if(b.hasAttribute('data-top')) {event.preventDefault();window.scrollTo({top:0,behavior:'instant'});return;}
    if(b.hasAttribute('data-info')) {event.preventDefault();$('#documentInfo').scrollIntoView({block:'start'});return;}
    if(b.hasAttribute('data-toggle-toc')) {const open=$('.reader-toc').classList.toggle('mobile-open');b.setAttribute('aria-expanded',String(open));return;}
    if(b.hasAttribute('data-fold-toc')) {const open=!$$('.toc-section').some(d=>d.open);$$('.toc-section').forEach(d=>d.open=open);b.textContent=open ? '모두 접기' : '모두 펼치기';return;}
    if(b.hasAttribute('data-hit-step')) {goToHit(Number(b.dataset.hitStep));return;}
    if(b.hasAttribute('data-clear-reader-search')) {$('#readerSearchInput').value='';searchWithin('');return;}
    if(b.hasAttribute('data-font-step')) {updatePreference('size',state.prefs.size+Number(b.dataset.fontStep));return;}
    if(b.hasAttribute('data-font')) {updatePreference('font',b.dataset.font);return;}
    if(b.hasAttribute('data-leading')) {updatePreference('leading',Number(b.dataset.leading));return;}
    if(b.hasAttribute('data-close-dialog')) {document.getElementById(b.dataset.closeDialog).close();return;}
    if(b.hasAttribute('data-origin')) {changeFilters({origin:b.dataset.origin,type:'전체',category:'전체',agency:'전체',saved:false});return;}
    if(b.hasAttribute('data-type')) {changeFilters({origin:'국제',type:b.dataset.type,category:'전체',agency:'전체',saved:false});return;}
    if(b.hasAttribute('data-filter')) {changeFilters({[b.dataset.filter]:b.dataset.value});return;}
    if(b.hasAttribute('data-search-target')) {changeFilters({target:b.dataset.searchTarget});return;}
    if(b.hasAttribute('data-clear-filter')) {const key=b.dataset.clearFilter;if(key==='query') $('#searchInput').value='';changeFilters({[key]:defaults[key]});return;}
    if(b.hasAttribute('data-reset')) resetFilters();
  });
  $('#searchForm').addEventListener('submit',event=>{
    event.preventDefault();clearTimeout(searchTimer);
    const query=$('#searchInput').value.trim(),sort=query ? 'matched' : 'archive';rememberSearch(query);
    if(state.view!=='catalog') openCatalog({query,sort});else changeFilters({query,sort});
    $('#results').scrollIntoView({block:'start'});
  });
  $('#homeSearchForm').addEventListener('submit',event=>{
    event.preventDefault();const query=$('#homeSearchInput').value.trim(),scope=$('#homeSearchScope').value;
    const filters={query,sort:query ? 'matched' : 'archive',target:state.homeTarget};
    if(scope==='domestic') filters.origin='국내';
    if(scope==='international') filters.origin='국제';
    if(scope==='treaty') filters.type='조약';
    if(scope==='rules') filters.type='국제규칙';
    if(scope==='contract') filters.type='표준계약서';
    rememberSearch(query);openCatalog(filters);
  });
  $('#homeSearchForm').addEventListener('change',event=>{
    if(event.target.name==='homeTarget') state.homeTarget=event.target.value;
  });
  $('#searchInput').addEventListener('input',()=>{
    clearTimeout(searchTimer);if(state.view!=='catalog') return;
    searchTimer=setTimeout(()=>changeFilters({query:$('#searchInput').value.trim(),sort:$('#searchInput').value.trim() ? 'matched' : 'archive'}),180);
  });
  $('#clearFilters').addEventListener('click',resetFilters);
  $('#showSaved').addEventListener('click',()=>openCatalog({saved:true}));
  $('#clearRecent').addEventListener('click',()=>{
    state.recent=[];state.progress={};writeJSON(RECENT_KEY,[]);writeJSON(PROGRESS_KEY,{});renderHome();showToast('열람 기록을 지웠습니다.');
  });
  $('#agencySelect').addEventListener('change',e=>changeFilters({agency:e.target.value}));
  $('#statusFilter').addEventListener('change',e=>changeFilters({status:e.target.value,examples:e.target.value==='예시' || state.examples}));
  $('#sortSelect').addEventListener('change',e=>changeFilters({sort:e.target.value}));
  $('#includeExamples').addEventListener('change',e=>changeFilters({examples:e.target.checked,status:state.status==='예시' ? '전체' : state.status}));
  $('#switcherInput').addEventListener('input',renderSwitcher);
  $('#readerView').addEventListener('submit',event=>{
    if(event.target.id==='readerSearchForm') {event.preventDefault();searchWithin($('#readerSearchInput').value);}
    if(event.target.id==='articleJumpForm') {event.preventDefault();jumpToArticle($('#articleJump').value);}
  });
  $('#readerView').addEventListener('input',event=>{
    if(event.target.id==='readerSearchInput' && !event.target.value) searchWithin('');
  });
  $('#importFile').addEventListener('change',async event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file) return;
    try {
      const parsed=JSON.parse(await file.text()),input=Array.isArray(parsed) ? parsed : parsed.laws;
      if(!Array.isArray(input) || !input.length || input.some(l=>!l.title || !Array.isArray(l.sections))) throw new Error('invalid');
      const laws=normalizeLaws(input),ids=laws.flatMap(l=>[l.id,...articlesOf(l).map(a=>a.id)]);
      if(new Set(ids).size!==ids.length) throw new Error('duplicate');
      state.laws=laws;const saved=writeJSON(STORAGE_KEY,{version:VERSION,source:'user',laws});
      resetFilters();showToast(saved ? '자료를 가져왔습니다.' : '자료를 불러왔지만 브라우저에 저장하지 못했습니다.');
    } catch {showToast('법령 제목·조문 구조 또는 중복 ID를 확인해 주세요.');}
  });
  $('#exportData').addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify({laws:state.laws},null,2)],{type:'application/json;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='maritime-laws-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('#resetData').addEventListener('click',()=>$('#restoreDialog').showModal());
  $('#confirmRestore').addEventListener('click',()=>{
    state.laws=normalizeLaws(window.MARITIME_LAWS || []);
    try{localStorage.removeItem(STORAGE_KEY);}catch{}
    $('#restoreDialog').close();resetFilters();showToast('기본 자료로 복원했습니다.');
  });
  window.addEventListener('popstate',()=>{clearTimeout(searchTimer);readFilters();route();});
  window.addEventListener('hashchange',()=>{clearTimeout(searchTimer);readFilters();route();});
  const mobile=matchMedia('(max-width:800px)');
  function adaptFilters() { $('.filter-disclosure').open=!mobile.matches; }
  mobile.addEventListener('change',adaptFilters);
  matchMedia('(min-width:1181px)').addEventListener('change',event=>{
    if($('.reading-settings')) $('.reading-settings').open=event.matches;
  });
  window.addEventListener('resize',()=>{if(state.law) renderSearchStatus();});
  readFilters();adaptFilters();applyPreferences();route();
})();
