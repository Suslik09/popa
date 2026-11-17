(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const body = document.body;

  const esc = s => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  let cssOff = false;

  function toast(msg) {
    if (cssOff) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    body.append(t);
    setTimeout(() => t.remove(), 3300);
  }

  function say(el, html) {
    if (!el) return;
    el.innerHTML = html;
    el.classList.remove('is-flash');
    void el.offsetWidth;
    el.classList.add('is-flash');
  }

  function highlightCss(src) {
    return src.split('\n').map(line => {
      if (/^\s*\/\*/.test(line) || /^\s*\*/.test(line)) return `<span class="t-com">${esc(line)}</span>`;
      const decl = line.match(/^(\s*)(-{0,2}[A-Za-z][\w-]*)(\s*:\s*)(.*?)(;?)(\s*)$/);
      if (decl && !line.includes('{')) {
        return `${esc(decl[1])}<span class="t-attr">${esc(decl[2])}</span><span class="t-p">${esc(decl[3])}</span><span class="t-val">${esc(decl[4])}</span><span class="t-p">${esc(decl[5])}</span>`;
      }
      return esc(line)
        .replace(/\$[\w-]+|@[\w-]+/g, m => `<span class="t-tag">${m}</span>`)
        .replace(/&amp;|[{}(),]/g, m => `<span class="t-p">${m}</span>`)
        .replace(/([.#][\w-]+)/g, '<span class="t-tag">$1</span>');
    }).join('\n');
  }

  function highlightHtml(src) {
    const re = /<!--[\s\S]*?-->|<\/?[A-Za-z][\w-]*(?:\s+[^<>]*?)?\s*\/?>/g;
    let out = '';
    let last = 0;
    for (const m of src.matchAll(re)) {
      out += esc(src.slice(last, m.index));
      const t = m[0];
      if (t.startsWith('<!--')) out += `<span class="t-com">${esc(t)}</span>`;
      else {
        const p = t.match(/^<(\/?)([\w-]+)([\s\S]*?)(\/?)>$/);
        const attrs = p[3].replace(/([^\s=]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+))?/g, (a, n, eq, v) =>
          `<span class="t-attr">${esc(n)}</span>` + (eq ? `<span class="t-p">=</span><span class="t-val">${esc(v)}</span>` : ''));
        out += `<span class="t-p">&lt;${p[1]}</span><span class="t-tag">${p[2]}</span>${attrs}<span class="t-p">${p[4]}&gt;</span>`;
      }
      last = m.index + t.length;
    }
    return out + esc(src.slice(last));
  }

  function paint(pre, text) {
    if (!pre) return;
    const raw = String(text).replace(/\s+$/, '');
    const prev = (pre.dataset.raw || '').split('\n');
    pre.dataset.raw = raw;
    const lines = raw.split('\n');
    const body = (pre.dataset.lang === 'html' ? highlightHtml(raw) : highlightCss(raw)).split('\n');
    pre.innerHTML = body.map((h, i) => {
      const changed = prev.length > 1 && prev[i] !== lines[i];
      return `<span class="ln${changed ? ' is-changed' : ''}">${h || ' '}</span>`;
    }).join('\n');
  }


  const slides = $$('.slide');
  const deck = $('#main');
  const progress = $('#deck-progress');
  const counter = $('#deck-count');
  const tocBtn = $('[data-action="toc"]');
  const enter = {};
  let cur = -1;

  const DESIGN_W = 1600;
  const DESIGN_H = 1000;
  const fitSheet = new CSSStyleSheet();
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, fitSheet];
  const fitRule = {};
  const fitHeight = {};
  let ui = 1;

  function fitRules() {
    fitSheet.replaceSync(`:root { --ui: ${ui}; --bar: ${56 * ui}px; }\n` + Object.values(fitRule).join('\n'));
  }

  function setUi() {
    ui = innerWidth <= 720 ? 1 : Math.round(Math.min(2.6, Math.max(1, Math.min(innerWidth / DESIGN_W, innerHeight / DESIGN_H))) * 100) / 100;
    fitRules();
  }

  function fit(slide) {
    if (!slide) return;
    const inner = slide.firstElementChild;
    const id = slide.id;
    delete fitRule[id];
    fitRules();
    const W = slide.clientWidth;
    const H = slide.clientHeight;
    if (innerWidth <= 720 || !W || !H) return;
    const apply = k => {
      fitRule[id] = `#${CSS.escape(id)} > .slide__inner { width: ${W / k}px; min-height: ${H / k}px; max-width: none; margin: 0; position: relative; left: 50%; top: 0; transform: translateX(-50%) scale(${k}); transform-origin: top center; }`;
      fitRules();
    };
    const fits = k => {
      apply(k);
      return inner.offsetHeight * k <= H + 1;
    };
    const kMax = Math.max(1, Math.min(W / DESIGN_W * 1.04, 3));
    let best = kMax;
    if (!fits(kMax)) {
      let lo = 0.4;
      let hi = kMax;
      best = lo;
      for (let n = 0; n < 8; n++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) { best = mid; lo = mid; } else hi = mid;
      }
    }
    apply(Math.floor(best * 1000) / 1000);
    fitHeight[id] = inner.offsetHeight;
  }

  const fitObserver = new ResizeObserver(entries => {
    for (const e of entries) {
      const slide = e.target.parentElement;
      if (slide !== slides[cur]) continue;
      if (Math.abs(e.target.offsetHeight - (fitHeight[slide.id] || 0)) > 2) fit(slide);
    }
  });

  let fitTimer;
  addEventListener('resize', () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => {
      setUi();
      fit(slides[cur]);
      if (slides[cur] && enter[slides[cur].id]) enter[slides[cur].id]();
      drawXray();
    }, 120);
  });
  setUi();

  function show(i) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    if (i === cur) return false;
    slides.forEach((s, k) => {
      s.classList.toggle('is-active', k === i);
      s.classList.toggle('is-before', k < i);
    });
    cur = i;
    const s = slides[i];
    fit(s);
    const inner = s.firstElementChild;
    if (inner && !inner.dataset.observed) {
      fitObserver.observe(inner);
      inner.dataset.observed = '1';
    }
    const kicker = $('.kicker', s);
    $('#crumbs').textContent = kicker ? kicker.textContent : '';
    progress.max = slides.length;
    progress.value = i + 1;
    counter.value = `${i + 1} / ${slides.length}`;
    $$('#toc a').forEach(a => {
      if (a.getAttribute('href') === '#' + s.id) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
    if (enter[s.id]) enter[s.id]();
    drawXray();
    return true;
  }

  function route() {
    const id = decodeURIComponent(location.hash.slice(1));
    const el = id ? document.getElementById(id) : null;
    deck.scrollTop = 0;
    if (!el) {
      if (cur < 0) show(0);
      return;
    }
    const slide = el.classList.contains('slide') ? el : el.closest('.slide');
    if (slide) show(slides.indexOf(slide));
    else if (cur < 0) show(0);
  }

  function navigate(hash) {
    if (hash !== location.hash) history.pushState(null, '', hash);
    route();
  }

  const go = i => navigate('#' + slides[Math.max(0, Math.min(slides.length - 1, i))].id);


  const xrayLayer = $('#xray-layer');
  const xrayBtn = $('.tool--xray');
  const cssBtn = $('.tool--css');
  const themeBtn = $('[data-action="theme"]');
  let xrayOn = false;

  function typeNote(el) {
    const cs = getComputedStyle(el);
    const bits = [cs.display];
    if (cs.position !== 'static') bits.push(cs.position);
    return ' · ' + bits.join(' ');
  }

  function drawXray() {
    xrayLayer.replaceChildren();
    if (!xrayOn || cssOff || cur < 0) return;
    const slide = slides[cur];
    const frag = document.createDocumentFragment();
    let n = 0;
    for (const el of [slide, ...slide.querySelectorAll('*')]) {
      if (el.closest('.code, .seg, .toggles, .quiz, .snippet')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const box = document.createElement('div');
      box.className = 'xbox xbox--box';
      box.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
      if (r.width >= 48 && r.height >= 16) {
        const lab = document.createElement('span');
        lab.textContent = el.localName + typeNote(el);
        box.append(lab);
      }
      frag.append(box);
      if (++n > 400) break;
    }
    xrayLayer.append(frag);
  }

  function setXray(on, quiet) {
    xrayOn = on;
    body.classList.toggle('is-xray', on);
    xrayBtn.setAttribute('aria-pressed', String(on));
    drawXray();
    if (on && !quiet) toast('Инспектор: рамка — элемент, подпись — тег и display');
  }

  function setCss(off) {
    cssOff = off;
    $$('link[rel="stylesheet"], style').forEach(s => { s.disabled = off; });
    fitSheet.disabled = off;
    cssBtn.setAttribute('aria-pressed', String(off));
    cssBtn.textContent = off ? 'Вернуть CSS' : 'Без CSS';
    xrayLayer.replaceChildren();
    if (off) {
      if (xrayOn) setXray(false, true);
      window.scrollTo(0, 0);
    } else {
      route();
      toast('CSS вернулся. Разметка та же — изменилось только оформление');
    }
  }

  function setTheme(t, save) {
    root.dataset.theme = t;
    themeBtn.setAttribute('aria-pressed', String(t === 'dark'));
    themeBtn.setAttribute('aria-label', t === 'dark' ? 'Светлая тема' : 'Тёмная тема');
    $('meta[name="theme-color"]').content = t === 'dark' ? '#111317' : '#f4f2ec';
    if (save) {
      try { localStorage.setItem('css-live-theme', t); } catch (e) {}
    }
  }

  function setToc(open) {
    body.classList.toggle('is-toc', open);
    tocBtn.setAttribute('aria-expanded', String(open));
  }

  const fsBtn = $('[data-action="fullscreen"]');
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  const canFullscreen = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!canFullscreen) fsBtn.hidden = true;

  function toggleFullscreen() {
    if (fsElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
  }

  function onFullscreen() {
    const on = !!fsElement();
    fsBtn.setAttribute('aria-pressed', String(on));
    fsBtn.setAttribute('aria-label', on ? 'Выйти из полноэкранного режима' : 'На весь экран');
    fsBtn.firstElementChild.textContent = on ? '⤡' : '⤢';
  }
  document.addEventListener('fullscreenchange', onFullscreen);
  document.addEventListener('webkitfullscreenchange', onFullscreen);

  const actions = {
    prev: () => go(cur - 1),
    next: () => go(cur + 1),
    toc: () => setToc(!body.classList.contains('is-toc')),
    xray: () => setXray(!xrayOn),
    css: () => setCss(!cssOff),
    theme: () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true),
    fullscreen: () => { if (canFullscreen) toggleFullscreen(); },
  };

  document.addEventListener('click', e => {
    const act = e.target.closest('[data-action]');
    if (act && actions[act.dataset.action]) {
      actions[act.dataset.action]();
      return;
    }
    const quizBtn = e.target.closest('.quiz button');
    if (quizBtn) {
      grade(quizBtn);
      return;
    }
    if (body.classList.contains('is-toc') && !e.target.closest('#toc, [data-action="toc"]')) setToc(false);
    const a = e.target.closest('a[href^="#"]');
    if (!a || cssOff || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    setToc(false);
    navigate(a.getAttribute('href'));
  });

  addEventListener('popstate', route);
  addEventListener('hashchange', route);

  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t.closest && t.closest('input, textarea, select, [contenteditable]')) return;
    const map = {
      ArrowRight: actions.next, PageDown: actions.next, ArrowLeft: actions.prev, PageUp: actions.prev,
      Home: () => go(0), End: () => go(slides.length - 1),
      KeyX: actions.xray, KeyC: actions.css, KeyT: actions.theme, KeyO: actions.toc, KeyF: actions.fullscreen,
      Escape: () => setToc(false),
    };
    const fn = map[e.key] || map[e.code];
    if (!fn) return;
    e.preventDefault();
    fn();
  });

  let touch = null;
  deck.addEventListener('touchstart', e => {
    touch = e.target.closest('pre, input, .seg, .toggles') ? null : e.touches[0];
  }, { passive: true });
  deck.addEventListener('touchend', e => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.clientX;
    const dy = e.changedTouches[0].clientY - touch.clientY;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) go(cur + (dx < 0 ? 1 : -1));
    touch = null;
  });


  function segValue(name) {
    const b = $(`.seg[data-seg="${name}"] [aria-pressed="true"]`);
    return b ? b.value : '';
  }

  const segHandlers = {};
  document.addEventListener('click', e => {
    const btn = e.target.closest('.seg button');
    if (!btn) return;
    const seg = btn.closest('.seg');
    $$('button', seg).forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    const fn = segHandlers[seg.dataset.seg];
    if (fn) fn();
  });

  function bindToggles(id, fn) {
    const box = document.getElementById(id);
    box.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn || !box.contains(btn)) return;
      btn.setAttribute('aria-pressed', String(btn.getAttribute('aria-pressed') !== 'true'));
      fn();
    });
  }

  function pressed(id, value) {
    const btn = $(`#${id} [value="${value}"]`);
    return btn && btn.getAttribute('aria-pressed') === 'true';
  }

  function grade(btn) {
    const quiz = btn.closest('.quiz');
    if (btn.disabled) return;
    const ok = btn.dataset.value === quiz.dataset.answer;
    $$('button', quiz).forEach(x => {
      x.disabled = true;
      if (x.dataset.value === quiz.dataset.answer) x.classList.add('is-yes');
      if (x === btn && !ok) x.classList.add('is-no');
    });
    const out = $('#quiz-box-out');
    out.hidden = false;
    say(out, (ok ? 'Верно. ' : 'Пока нет. ') + 'При content-box ширина относится только к тексту: 200 + 20×2 + 5×2 = <b>250px</b>.');
  }


  function renderIdeas() {
    const prop = segValue('ideas');
    $('#ideas-stage').dataset.prop = prop;
    const css = {
      color: '.btn {\n    color: #18786f;\n    background: #e7f3f1;\n}',
      padding: '.btn {\n    padding: 22px 36px;\n    background: #18786f;\n    color: white;\n}',
      background: '.btn {\n    color: white;\n    background: #18786f;\n}',
    };
    const why = {
      color: 'Меняется только цвет текста. Кнопка в разметке та же.',
      padding: 'Padding растит кнопку изнутри. Соседи отодвигаются, потому что вырос сам блок.',
      background: 'Фон и цвет текста заданы свойствами. Без этого правила кнопка останется системной.',
    };
    paint($('#ideas-code'), css[prop]);
    say($('#ideas-effect'), why[prop]);
  }

  function renderConnect() {
    const mode = segValue('connect');
    const code = {
      file: '<link rel="stylesheet" href="style.css">\n\n/* style.css */\np {\n    color: #315fbd;\n}',
      style: '<style>\n  p { color: #315fbd; }\n</style>',
      inline: '<p style="color: #315fbd">\n  Пример текста\n</p>',
    };
    const why = {
      file: 'Внешний файл кешируется и подключается на многих страницах. Это основной способ.',
      style: 'Блок style годится для мелких или критичных правил одной страницы.',
      inline: 'Атрибут style плохо переиспользуется и перебивает обычные селекторы.',
    };
    paint($('#connect-code'), code[mode]);
    say($('#connect-effect'), why[mode] + ' Абзац справа синий при любом источнике.');
  }

  function renderSel() {
    const pick = segValue('sel');
    $('#sel-stage').dataset.pick = pick;
    paint($('#sel-code'), 'p {\n    color: #555;\n}\n.note {\n    color: #315fbd;\n}\n#menu {\n    background: #ffe6ce;\n}\n[type="text"] {\n    border: 2px solid #315fbd;\n}');
    const why = {
      all: 'Все четыре правила работают сразу: каждое нашло своих.',
      p: 'Селектор p красит оба абзаца, включая заметку. Меню и поле он не трогает.',
      class: 'Класс .note красит только заметку. Такой класс можно повесить ещё раз.',
      id: 'id выбирает ровно один элемент. Для оформления он слишком сильный.',
      attr: 'Атрибут type выбирает поле без отдельного класса.',
    };
    say($('#sel-effect'), why[pick]);
  }

  function renderCombo() {
    const stage = $('#combo-stage');
    stage.classList.toggle('is-desc', pressed('combo-toggles', 'desc'));
    stage.classList.toggle('is-child', pressed('combo-toggles', 'child'));
    stage.classList.toggle('is-both', pressed('combo-toggles', 'both'));
    stage.classList.toggle('is-list', pressed('combo-toggles', 'list'));
    const parts = [];
    if (stage.classList.contains('is-desc')) parts.push('.card p {\n    color: #315fbd;\n}');
    if (stage.classList.contains('is-child')) parts.push('.card > p {\n    font-weight: bold;\n}');
    if (stage.classList.contains('is-both')) parts.push('.card.dark {\n    background: #e8eef9;\n}');
    if (stage.classList.contains('is-list')) parts.push('.card, p {\n    margin: 0;\n}');
    paint($('#combo-code'), parts.join('\n') || '/* правила выключены */');
    say($('#combo-effect'), 'Прямой абзац — ребёнок карточки. Вложенный лежит в section, поэтому &gt; его не делает жирным. .card.dark — оба класса на одной карточке.');
  }

  function renderCas() {
    const mode = segValue('cas');
    const stage = $('#cas-stage');
    stage.dataset.mode = mode;
    stage.classList.toggle('is-later', mode === 'later');
    const p = $('p', stage);
    p.classList.toggle('note', mode !== 'tag');
    const rows = [
      ['tag', 'p', '0–0–1', 'серый'],
      ['class', '.note', '0–1–0', 'синий'],
      ['later', '.note ниже', '0–1–0', 'зелёный'],
    ];
    const rank = { tag: 0, class: 1, later: 2 };
    $('#cas-scores').innerHTML = rows.map(([key, name, score, color], i) => {
      const on = i <= rank[mode];
      const win = key === mode;
      return `<li class="${win ? 'is-win' : on ? '' : 'is-dim'}"><code>${name}</code><span>${score}</span><b>${color}${win ? ' ✓' : ''}</b></li>`;
    }).join('');
    const css = {
      tag: 'p {\n    color: gray;\n}',
      class: 'p {\n    color: gray;\n}\n.note {\n    color: #315fbd;\n}',
      later: 'p {\n    color: gray;\n}\n.note {\n    color: #315fbd;\n}\n.note {\n    color: #2c8656;\n}',
    };
    paint($('#cas-code'), css[mode]);
    const why = {
      tag: 'Работает только селектор тега. Специфичность 0–0–1.',
      class: 'Класс 0–1–0 сильнее тега. Синий побеждает серый.',
      later: 'Оба .note равны по силе. Побеждает тот, что ниже в файле.',
    };
    say($('#cas-effect'), why[mode]);
  }

  function renderSpec() {
    const mode = segValue('spec');
    const imp = pressed('spec-toggles', 'imp');
    const stage = $('#spec-stage');
    const el = $('p', stage);
    el.className = '';
    el.removeAttribute('id');
    el.style.color = '';
    if (mode !== 'tag') el.classList.add('note');
    if (mode === 'id' || mode === 'inline') el.id = 'spec-warn';
    if (mode === 'inline') el.style.color = 'purple';
    stage.classList.toggle('is-imp', imp);
    const win = imp && mode !== 'tag' ? 'imp' : mode;
    const rows = [
      ['tag', 'p', '0–0–1', 'серый'],
      ['class', '.note', '0–1–0', 'синий'],
      ['id', '#warning', '1–0–0', 'красный'],
      ['inline', 'style=""', 'inline', 'фиолетовый'],
      ['imp', '!important', 'отдельно', 'зелёный'],
    ];
    const active = new Set(['tag']);
    if (mode !== 'tag') active.add('class');
    if (mode === 'id' || mode === 'inline') active.add('id');
    if (mode === 'inline') active.add('inline');
    if (imp) active.add('imp');
    $('#spec-scores').innerHTML = rows.map(([key, name, score, color]) => {
      const on = active.has(key);
      return `<li class="${key === win ? 'is-win' : on ? '' : 'is-dim'}"><code>${name}</code><span>${score}</span><b>${color}${key === win ? ' ✓' : ''}</b></li>`;
    }).join('');
    const lines = ['p {\n    color: gray;\n}'];
    if (mode !== 'tag') lines.push('.note {\n    color: #315fbd;\n}');
    if (mode === 'id' || mode === 'inline') lines.push('#warning {\n    color: #c8372d;\n}');
    if (mode === 'inline') lines.push('/* style="color: purple" */');
    if (imp) lines.push('.note {\n    color: #2c8656 !important;\n}');
    paint($('#spec-code'), lines.join('\n'));
    const why = {
      tag: 'Пока есть только селектор тега.',
      class: 'Класс сильнее тега: 0–1–0 против 0–0–1.',
      id: 'Один id перебивает и тег, и класс.',
      inline: 'Атрибут style перебивает id. Это всё ещё обычный слой каскада.',
      imp: '!important у класса перебивает и id, и inline. Снять его можно только другим !important.',
    };
    say($('#spec-effect'), why[win]);
  }

  function renderInh() {
    const mode = segValue('inh');
    $('#inh-stage').dataset.mode = mode;
    const extra = {
      auto: '',
      inherit: '\np {\n    color: inherit;\n    font-family: inherit;\n}',
      initial: '\np {\n    color: initial;\n    font-family: initial;\n}',
    };
    paint($('#inh-code'), `.article {\n    color: #315fbd;\n    font-family: Georgia, serif;\n    padding: 16px;\n}${extra[mode]}`);
    const why = {
      auto: 'Цвет и шрифт пришли к абзацу сами. Оранжевая рамка своего padding не унаследовала.',
      inherit: 'inherit явно берёт цвет родителя. Для color это то же, что значение по умолчанию.',
      initial: 'initial возвращает начальный цвет и шрифт. Наследование оборвано, padding родителя по-прежнему не при чём.',
    };
    say($('#inh-effect'), why[mode]);
  }

  function measureBox() {
    const el = $('#box-el');
    if (!el) return;
    const cs = getComputedStyle(el);
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const border = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const total = el.offsetWidth;
    const content = Math.round(total - pad - border);
    $('#box-out').textContent = `${total}px всего · контент ${content}px · padding ${pad}px · рамка ${border}px`;
  }

  function renderBox() {
    const mode = segValue('box');
    $('#box-stage').dataset.box = mode;
    paint($('#box-code'), `.box {\n    box-sizing: ${mode === 'border' ? 'border-box' : 'content-box'};\n    width: 200px;\n    padding: 20px;\n    border: 5px solid #315fbd;\n}`);
    measureBox();
    say($('#box-effect'), mode === 'border'
      ? 'border-box: 200px уже включают padding и рамку. На текст осталось 150px. Сетку так считать проще.'
      : 'content-box: 200px — только текст. Снаружи ещё 40px padding и 10px рамки, итого 250px.');
  }

  function measureGap() {
    const a = $('#col-a');
    const b = $('#col-b');
    const gap = b.offsetTop - (a.offsetTop + a.offsetHeight);
    $('#space-out').textContent = `Зазор ${Math.round(gap)}px, а не 30 + 10 = 40px`;
    say($('#space-effect'), `Вертикальные margin схлопнулись в больший: ${Math.round(gap)}px. Оранжевое — это margin, синее внутри рамки — padding, белое — текст.`);
    paint($('#space-code'), '.box {\n    margin-bottom: 30px;\n    margin-top: 10px;\n    padding: 16px;\n    border: 2px solid #315fbd;\n}');
  }

  function renderPaint() {
    const mode = segValue('paint');
    const font = segValue('font');
    const stage = $('#color-stage');
    stage.dataset.mode = mode;
    stage.dataset.font = font;
    const bg = {
      solid: '    background: rgb(235 243 255 / .75);',
      alpha: '    background: rgb(37 78 141 / .25);',
      opacity: '    background: rgb(235 243 255 / .75);\n    opacity: .45;',
    };
    const family = {
      sans: 'Arial, sans-serif',
      serif: 'Georgia, serif',
      stack: '"No Such Font", sans-serif',
    };
    paint($('#paint-code'), `.notice {\n    color: #254e8d;\n${bg[mode]}\n    font-family: ${family[font]};\n    font-size: 20px;\n    line-height: 1.5;\n}`);
    const why = {
      solid: 'color красит текст, background-color — фон. Белая плашка — отдельный элемент.',
      alpha: 'Прозрачен только фон. Дочерний текст на белой плашке остаётся плотным.',
      opacity: 'opacity прозрачит весь элемент: и фон, и белую плашку, и буквы.',
    };
    const fontWhy = font === 'stack'
      ? ' Первого шрифта нет, браузер взял sans-serif из конца списка.'
      : ' Если первый шрифт недоступен, берётся следующий, в конце — семейство.';
    say($('#paint-effect'), why[mode] + fontWhy);
  }

  function measureUnits() {
    const size = el => Math.round(parseFloat(getComputedStyle(el).fontSize));
    const parent = size($('#unit-parent'));
    $('#unit-out').textContent = `родитель ${parent}px · em ${size($('#unit-em'))}px · rem ${size($('#unit-rem'))}px · px ${size($('#unit-px'))}px`;
    say($('#unit-effect'), `1.5em = ${size($('#unit-em'))}px, потому что считается от родителя. 1.5rem = ${size($('#unit-rem'))}px — от html этой страницы. 24px не зависят ни от кого.`);
  }

  function renderUnits() {
    const size = segValue('units');
    $('#unit-stage').dataset.size = size;
    paint($('#unit-code'), `html {\n    font-size: 16px;\n}\n.parent {\n    font-size: ${size}px;\n}\n.em {\n    font-size: 1.5em;\n}\n.rem {\n    font-size: 1.5rem;\n}\n.px {\n    font-size: 24px;\n}`);
    measureUnits();
  }

  function renderVars() {
    const theme = segValue('var-theme');
    const text = segValue('var-text');
    const stage = $('#var-stage');
    stage.dataset.theme = theme;
    stage.dataset.text = text;
    paint($('#var-code'), `:root {\n    --brand: #315fbd;\n}\n${theme === 'dark' ? '.dark {\n    --brand: #8eb0ef;\n}\n' : ''}${text === 'on' ? '.panel {\n    --text: #d85834;\n}\n' : ''}.btn {\n    background: var(--brand);\n    color: white;\n}\n.title {\n    color: var(--text, #333);\n}`);
    say($('#var-effect'), (theme === 'dark'
      ? 'Внутри тёмной карточки --brand другая. Кнопка читает переменную и перекрашивается без своего правила.'
      : 'Кнопка берёт --brand с корня. Одна правка переменной меняет все такие кнопки.')
      + (text === 'on' ? ' --text задана, запасной #333 не используется.' : ' --text нет, поэтому сработал запас #333.'));
  }

  function renderPseudo() {
    const stage = $('#pseudo-stage');
    ['hover', 'focus', 'before', 'disabled', 'nth'].forEach(name => {
      stage.classList.toggle('is-' + name, pressed('pseudo-toggles', name));
    });
    const parts = [];
    if (stage.classList.contains('is-hover')) parts.push('.btn:hover {\n    background: #d85834;\n}');
    if (stage.classList.contains('is-focus')) parts.push('.btn:focus-visible {\n    outline: 3px solid #315fbd;\n}');
    if (stage.classList.contains('is-before')) parts.push('.btn::before {\n    content: "★ ";\n}');
    if (stage.classList.contains('is-disabled')) parts.push('.btn:disabled {\n    opacity: .5;\n}');
    if (stage.classList.contains('is-nth')) parts.push('li:nth-child(2n) {\n    background: #ece7dc;\n}');
    paint($('#pseudo-code'), parts.join('\n') || '/* всё выключено */');
    say($('#pseudo-effect'), 'Наведите курсор и нажмите Tab до кнопки. Звезды нет в HTML: её рисует ::before. Чётные пункты выбирает :nth-child, классы в списке не нужны.');
  }

  function renderPos() {
    const mode = segValue('pos');
    $('#pos-stage').dataset.pos = mode;
    const css = {
      flow: '.box {\n    position: static;\n}',
      rel: '.box {\n    position: relative;\n    top: 10px;\n    left: 20px;\n}',
      abs: '.card {\n    position: relative;\n}\n.badge {\n    position: absolute;\n    top: 8px;\n    right: 8px;\n}',
      fixed: '.bar {\n    position: fixed;\n    right: 0;\n    bottom: 0;\n    left: 0;\n}',
    };
    const why = {
      flow: 'Обычный поток. Второй блок занимает своё место, бейдж стоит в строке.',
      rel: 'Блок визуально съехал, но дырка на старом месте осталась. Соседи не подтянулись.',
      abs: 'Бейдж вынут из потока и привязан к ближайшему предку с position не static. Прокрутка уносит его вместе с карточкой.',
      fixed: 'На странице fixed держится окна браузера. Здесь тёмная панель изображает такое окно: текст под ней прокручивается, панель нет.',
    };
    paint($('#pos-code'), css[mode]);
    say($('#pos-effect'), why[mode]);
  }

  function renderLayer() {
    const sticky = pressed('layer-toggles', 'sticky');
    const trap = pressed('layer-toggles', 'trap');
    $('#stick-view').dataset.sticky = sticky ? 'on' : 'off';
    $('#layer-stage').classList.toggle('is-trapped', trap);
    paint($('#layer-code'), `.nav {\n    position: sticky;\n${sticky ? '    top: 0;\n' : '    /* top не задан */\n'}}\n.card {\n    position: relative;\n${trap ? '    z-index: 1;\n    transform: translateZ(0);\n' : ''}}\n.popup {\n    position: absolute;\n    z-index: 9999;\n}\n.header {\n    position: relative;\n    z-index: 2;\n}`);
    say($('#layer-effect'), (sticky
      ? 'Прокрутите зелёное меню: top: 0 включает залипание внутри этого блока.'
      : 'Без top меню просто едет вместе с текстом.')
      + (trap
        ? ' У карточки свой контекст, поэтому 9999 сравнивается только внутри неё и проигрывает шапке.'
        : ' Пока у карточки нет своего слоя, 9999 попапа сравнивается с шапкой и перекрывает её.'));
  }

  function renderFlex() {
    const stage = $('#flex-stage');
    stage.dataset.dir = segValue('flex-dir');
    stage.dataset.just = segValue('flex-just');
    stage.dataset.align = segValue('flex-align');
    paint($('#flex-code'), `.header {\n    display: flex;\n    flex-direction: ${stage.dataset.dir};\n    justify-content: ${stage.dataset.just};\n    align-items: ${stage.dataset.align};\n}`);
    say($('#flex-effect'), stage.dataset.dir === 'row'
      ? 'Главная ось горизонтальная: justify-content разводит логотип и меню влево-вправо, align-items — по вертикали.'
      : 'Главная ось вертикальная. space-between теперь разводит блоки сверху вниз, а align-items — по горизонтали.');
  }

  function renderGrow() {
    const stage = $('#grow-stage');
    stage.dataset.wrap = pressed('grow-toggles', 'wrap') ? 'wrap' : 'nowrap';
    stage.dataset.grow = pressed('grow-toggles', 'grow') ? '1' : '0';
    stage.dataset.narrow = pressed('grow-toggles', 'narrow') ? '1' : '0';
    paint($('#grow-code'), `.row {\n    display: flex;\n    flex-wrap: ${stage.dataset.wrap};\n    gap: 8px;\n${stage.dataset.narrow === '1' ? '    max-width: 250px;\n' : ''}}\n.row > div {\n    ${stage.dataset.grow === '1' ? 'flex: 1;' : 'min-width: 72px;'}\n}`);
    say($('#grow-effect'), stage.dataset.wrap === 'wrap'
      ? 'Перенос включён: не влезший блок уходит на следующую строку, а не сжимается до нуля.'
      : 'Без переноса блоки остаются в одной строке и сжимаются до min-width.');
  }

  function renderGrid() {
    const stage = $('#grid-stage');
    stage.dataset.mode = segValue('grid');
    stage.classList.toggle('is-narrow', pressed('grid-toggles', 'narrow'));
    const narrow = stage.classList.contains('is-narrow');
    const auto = stage.dataset.mode === 'auto';
    paint($('#grid-code'), `.grid {\n    display: grid;\n    gap: 8px;\n    grid-template-columns: ${auto ? 'repeat(auto-fit, minmax(140px, 1fr))' : 'repeat(3, 1fr)'};\n${narrow ? '    max-width: 260px;\n' : ''}}`);
    say($('#grid-effect'), auto
      ? 'auto-fit собирает столько колонок, сколько влезает при минимуме 140px. Узкая панель переносит карточки.'
      : 'Три доли 1fr делят место уже после gap. Узкая ширина их сжимает, но колонок остаётся три.');
  }

  function renderArea() {
    const mode = segValue('areas');
    $('#area-stage').dataset.mode = mode;
    paint($('#area-code'), mode === 'desk'
      ? `.layout {\n    display: grid;\n    grid-template-columns: 2fr 1fr;\n    grid-template-areas:\n        "head head"\n        "main side";\n}\nheader { grid-area: head; }\naside  { grid-area: side; }\nmain   { grid-area: main; }`
      : `.layout {\n    display: grid;\n    grid-template-areas:\n        "head"\n        "side"\n        "main";\n}`);
    say($('#area-effect'), mode === 'desk'
      ? 'Шапка занимает обе колонки. Контент и меню стоят рядом, хотя в HTML меню идёт после контента.'
      : 'Одна колонка: области просто идут друг под другом. Для узкого экрана этого достаточно.');
  }

  let bemOut = false;
  function placeBemTitle() {
    const title = $('#bem-label');
    const card = $('#bem-card');
    const wrap = $('#bem-wrap');
    if (bemOut) wrap.insertBefore(title, card);
    else card.prepend(title);
    $('#bem-move').textContent = bemOut ? 'Вернуть заголовок' : 'Вынести заголовок';
  }

  function renderBem() {
    const mode = segValue('bem');
    $('#bem-stage').dataset.css = mode;
    placeBemTitle();
    paint($('#bem-code'), mode === 'bem'
      ? '.card {\n    padding: 16px;\n}\n.card__title {\n    color: #315fbd;\n}\n.card--sale {\n    border: 2px solid #c8372d;\n}'
      : 'article h3 {\n    color: #315fbd;\n}\n/* сломается, если заголовок\n   уедет из article */');
    say($('#bem-effect'), bemOut
      ? (mode === 'bem'
        ? 'Заголовок снаружи карточки, но класс .card__title по-прежнему его красит.'
        : 'Селектор article h2 больше не находит заголовок: тот вышел из article. Цвет пропал.')
      : (mode === 'bem'
        ? 'Класс называет роль, а не место в дереве. Модификатор --sale добавлен вместе с card.'
        : 'Пока заголовок внутри article, цепочка тегов работает. Вынесите его — и правило промахнётся.'));
  }

  function renderFlat() {
    const sale = segValue('flat') === 'sale';
    $('#flat-card').classList.toggle('card--sale', sale);
    paint($('#flat-code'), sale
      ? '.card {\n    padding: 16px;\n}\n.card--sale {\n    border: 2px solid #c8372d;\n}\n/* вместе: class="card card--sale" */'
      : '.card {\n    padding: 16px;\n}\n/* .card__body__title — так не называют */');
    say($('#flat-effect'), sale
      ? 'Модификатор не заменяет блок: на элементе оба класса. Рамка — только у варианта со скидкой.'
      : 'Базовый блок без варианта. Имя card__body__title лишнее: элемент не вкладывают в элемент.');
  }

  function renderScss() {
    const mode = segValue('scss');
    $('#scss-stage').dataset.mode = mode;
    const src = {
      var: '$brand: #d85834;\n.btn {\n    background: $brand;\n    &:hover {\n        opacity: .8;\n    }\n}',
      nest: '.card {\n    &__title {\n        color: #315fbd;\n    }\n    &:hover {\n        opacity: .75;\n    }\n}',
      mixin: '@mixin rounded($r) {\n    border-radius: $r;\n    padding: 12px 16px;\n}\n.btn {\n    @include rounded(8px);\n}',
    };
    const out = {
      var: '.btn {\n    background: #d85834;\n}\n.btn:hover {\n    opacity: .8;\n}',
      nest: '.card__title {\n    color: #315fbd;\n}\n.card:hover {\n    opacity: .75;\n}',
      mixin: '.btn {\n    border-radius: 8px;\n    padding: 12px 16px;\n}',
    };
    const why = {
      var: 'Доллар существует только до сборки. В браузер уходит уже готовый цвет, а & превращается в .btn:hover.',
      nest: '&__title собирается в .card__title. Глубже двух уровней такие цепочки лучше не растить.',
      mixin: 'Миксин подставил набор свойств. Это не переменная: переменная хранит одно значение.',
    };
    paint($('#scss-src'), src[mode]);
    paint($('#scss-out'), out[mode]);
    say($('#scss-effect'), why[mode]);
  }

  function renderAdapt() {
    const w = Number($('#adapt-range').value);
    const bp = w >= 700 ? 'desk' : w >= 460 ? 'tablet' : 'mobile';
    const frame = $('#adapt-frame');
    frame.style.width = w + 'px';
    frame.dataset.bp = bp;
    const label = { mobile: 'узко · 1 колонка', tablet: 'шире · 2 колонки', desk: 'широко · 3 колонки' };
    $('#adapt-out').textContent = `${w}px · ${label[bp]}`;
    const cols = { mobile: '1fr', tablet: 'repeat(2, 1fr)', desk: 'repeat(3, 1fr)' };
    paint($('#adapt-code'), `<meta name="viewport"\n  content="width=device-width, initial-scale=1">\n\n.cards {\n    display: grid;\n    grid-template-columns: 1fr;\n}\n@media (min-width: 768px) {\n    .cards { grid-template-columns: repeat(2, 1fr); }\n}\n@media (min-width: 1024px) {\n    .cards { grid-template-columns: repeat(3, 1fr); }\n}\nimg {\n    max-width: 100%;\n    height: auto;\n}\n\n/* в этой рамке сейчас: ${cols[bp]} */`);
    say($('#adapt-effect'), 'На настоящей странице колонки переключает @media от ширины окна. Здесь ширину изображает рамка, чтобы пример помещался в слайд. Картинка не шире рамки и не теряет пропорции.');
  }

  function renderDev() {
    const win = segValue('dev');
    $('#dev-stage').dataset.win = win;
    $('#dev-rules').innerHTML = win === 'full'
      ? '<p class="is-off">.card { width: 300px; }</p><p>.card.wide { width: 100%; }</p>'
      : '<p>.card { width: 300px; }</p><p class="is-off">.card.wide { width: 100%; }</p>';
    const card = $('.d-card', $('#dev-stage'));
    $('#dev-out').textContent = `итоговая ширина ${card.offsetWidth}px`;
    paint($('#dev-code'), win === 'full'
      ? '.card {\n    width: 300px;\n}\n.card.wide {\n    width: 100%;\n}'
      : '.card {\n    width: 300px;\n    padding: 16px;\n    border: 1px solid #315fbd;\n}');
    say($('#dev-effect'), win === 'full'
      ? 'Правило ниже и с классом сильнее. В Styles верхнее будет перечёркнуто, в Computed останется 100%.'
      : 'Победило 300px. В DevTools смотрят перечёркнутое правило, потом Computed и схему блочной модели.');
  }

  function renderMotion() {
    const stage = $('#motion-stage');
    stage.classList.toggle('is-tr', pressed('motion-toggles', 'tr'));
    stage.classList.toggle('is-tf', pressed('motion-toggles', 'tf'));
    stage.classList.toggle('is-stop', pressed('motion-toggles', 'stop'));
    const view = segValue('motion');
    const css = {
      transition: `.btn {\n    background: #315fbd;\n${stage.classList.contains('is-tr') ? '    transition: background .3s ease;\n' : ''}}\n.btn:hover {\n    background: #d85834;\n}`,
      transform: `.square {\n${stage.classList.contains('is-tf') ? '    transition: transform .3s ease;\n' : ''}}\n.square:hover {\n    transform: translateX(30px);\n}`,
      keys: `@keyframes spin {\n    to { transform: rotate(360deg); }\n}\n.loader {\n    animation: spin 1s linear infinite;\n}\n@keyframes pulse {\n    0%, 100% { opacity: .3; }\n    50% { opacity: 1; }\n}`,
    };
    paint($('#motion-code'), css[view]);
    const why = {
      transition: stage.classList.contains('is-tr')
        ? 'Фон доезжает за 0.3 с. Выключите «плавный фон» — цвет прыгнет сразу.'
        : 'Свойство меняется мгновенно: transition не задан.',
      transform: 'Квадрат уезжает вправо и не толкает соседей: место в потоке на месте. transform дешевле, чем менять left или width.',
      keys: stage.classList.contains('is-stop')
        ? 'Кадры остановлены. Без наведения они сами не запустятся, пока animation снова не включат.'
        : 'Кольцо крутится, точка пульсирует. @keyframes не ждёт :hover и может повторяться бесконечно.',
    };
    say($('#motion-effect'), why[view]);
  }

  segHandlers.ideas = renderIdeas;
  segHandlers.connect = renderConnect;
  segHandlers.sel = renderSel;
  segHandlers.cas = renderCas;
  segHandlers.spec = renderSpec;
  segHandlers.inh = renderInh;
  segHandlers.box = renderBox;
  segHandlers.paint = renderPaint;
  segHandlers.font = renderPaint;
  segHandlers.units = renderUnits;
  segHandlers['var-theme'] = renderVars;
  segHandlers['var-text'] = renderVars;
  segHandlers.pos = renderPos;
  segHandlers['flex-dir'] = renderFlex;
  segHandlers['flex-just'] = renderFlex;
  segHandlers['flex-align'] = renderFlex;
  segHandlers.grid = renderGrid;
  segHandlers.areas = renderArea;
  segHandlers.bem = renderBem;
  segHandlers.flat = renderFlat;
  segHandlers.scss = renderScss;
  segHandlers.dev = renderDev;
  segHandlers.motion = renderMotion;

  bindToggles('combo-toggles', renderCombo);
  bindToggles('spec-toggles', renderSpec);
  bindToggles('pseudo-toggles', renderPseudo);
  bindToggles('layer-toggles', renderLayer);
  bindToggles('grow-toggles', renderGrow);
  bindToggles('grid-toggles', renderGrid);
  bindToggles('motion-toggles', renderMotion);

  $('#bem-move').addEventListener('click', () => {
    bemOut = !bemOut;
    renderBem();
  });
  $('#adapt-range').addEventListener('input', renderAdapt);

  enter.box = measureBox;
  enter.spacing = measureGap;
  enter.units = measureUnits;
  enter.browsers = () => {
    const card = $('.d-card', $('#dev-stage'));
    $('#dev-out').textContent = `итоговая ширина ${card.offsetWidth}px`;
  };

  $('#reset-frame').srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { margin: 0; background: #f4f2ec; color: #1b1b1f; }
    .cols { display: grid; grid-template-columns: 1fr 1fr; min-height: 100%; }
    .col { padding: 8px 12px 16px; }
    .col + .col { box-shadow: inset 1px 0 #e3dfd5; }
    small { font-family: sans-serif; color: #6d6a63; }
    .reset, .reset * { box-sizing: border-box; }
    .reset h2, .reset p, .reset ul { margin: 0; }
    .reset ul { padding-left: 1.1em; }
  </style></head><body><div class="cols">
    <div class="col"><small>Как в браузере</small><h2>Заголовок</h2><p>Абзац со своим отступом.</p><ul><li>пункт</li></ul></div>
    <div class="col reset"><small>После обнуления</small><h2>Заголовок</h2><p>Абзац со своим отступом.</p><ul><li>пункт</li></ul></div>
  </div></body></html>`;

  const supports = CSS.supports('display', 'grid');
  $('#support-out').innerHTML = supports
    ? 'Этот браузер понимает <code>display: grid</code>. Запасное <code>display: block</code> выше перекрыто, а <code>@supports</code> может добавить gap.'
    : 'Grid здесь нет: останется запасное <code>display: block</code>.';
  paint($('#reset-code'), `.card {\n    display: block;\n    display: grid;\n}\n@supports (display: grid) {\n    .card { gap: 16px; }\n}\n\n* { box-sizing: border-box; }\nbody { margin: 0; }`);

  renderIdeas();
  renderConnect();
  renderSel();
  renderCombo();
  renderCas();
  renderSpec();
  renderInh();
  renderBox();
  measureGap();
  renderPaint();
  renderUnits();
  renderVars();
  renderPseudo();
  renderPos();
  renderLayer();
  renderFlex();
  renderGrow();
  renderGrid();
  renderArea();
  renderBem();
  renderFlat();
  renderScss();
  renderAdapt();
  renderDev();
  renderMotion();

  let theme = null;
  try { theme = localStorage.getItem('css-live-theme'); } catch (e) {}
  setTheme(theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  route();
})();
