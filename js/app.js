/* ============================================================
 * 千秋图 · 应用逻辑
 * 依赖（普通 script 全局变量）：LAND_OUTER / LAND_HOLES / land.js
 *                              EVENTS / DYNASTIES / WORLD_ERAS / data.js
 * ============================================================ */
(function () {
'use strict';

/* ---------- 投影与常量 ---------- */
var NS = 'http://www.w3.org/2000/svg';
var LAT_TOP = 78, LAT_BOTTOM = -55;
var WORLD_W = 3600;                       // 经度 -180 ~ 180
var WORLD_H = (LAT_TOP - LAT_BOTTOM) * 10; // 1330
var YEAR_MIN = window.YEAR_MIN, YEAR_MAX = window.YEAR_MAX;

function px(lng) { return (lng + 180) * 10; }
function py(lat) { return (LAT_TOP - lat) * 10; }

var CAT_CHAR = { politics: '政', war: '战', culture: '文', tech: '技', economy: '商', figure: '人' };
var LINGER = { 3: 35, 2: 25, 1: 15 };     // 单次事件在时间轴上的存续年数
var DOT_COLOR = { china: '#9e2b25', other: '#3d566e' };
var ERA_COLORS = ['#6e7b62', '#54626b', '#7a6a4f', '#8c5b3f', '#7c4a42'];
var DYN_COLORS = ['#7a6a4f', '#54626b', '#6b705c', '#8c5b3f', '#75684e', '#7c4a42',
                  '#66755f', '#946b4a', '#6f7b62', '#8a5a44', '#5f6b5a', '#7d6d54',
                  '#9c6f45', '#6d7260', '#54626b', '#836248', '#6a5b48', '#4f5850'];

/* ---------- 状态 ---------- */
var state = {
  year: -221,
  vb: { x: 0, y: 0, w: WORLD_W, h: WORLD_H },
  view: 'world',
  scope: 'world',  // 'world' 世界全览 | 'china' 只看中国史
  regionSel: {},   // {} -> 全部；否则按 name->true
  catSel: {},
  majorOnly: false,
  selectedId: null,
  playing: false,
  lastVisKey: null
};

/* ---------- DOM ---------- */
function $(id) { return document.getElementById(id); }
var mapSvg = $('map'), mapWrap = $('mapWrap'), tooltip = $('tooltip');
var bannerYear = $('bannerYear'), bannerMeta = $('bannerMeta');
var cardsEl = $('cards'), countInfo = $('countInfo'), majorOnlyEl = $('majorOnly');
var timelineSvg = $('timeline'), playBtn = $('playBtn');

/* ---------- 基础绘制 ---------- */
function el(tag, attrs, parent) {
  var e = document.createElementNS(NS, tag);
  for (var k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function ringPath(ring) {
  var d = '';
  for (var i = 0; i < ring.length; i++) {
    d += (i ? 'L' : 'M') + px(ring[i][0]).toFixed(1) + ' ' + py(ring[i][1]).toFixed(1);
  }
  return d + 'Z';
}

function buildLand() {
  var land = $('landLayer'), holes = $('holeLayer');
  var dLand = '', dHole = '';
  for (var i = 0; i < LAND_OUTER.length; i++) dLand += ringPath(LAND_OUTER[i]);
  for (var j = 0; j < LAND_HOLES.length; j++) dHole += ringPath(LAND_HOLES[j]);
  el('path', { d: dLand, fill: '#d9c9a3', stroke: '#55483a', 'stroke-width': 1.1,
               'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' }, land);
  if (dHole) el('path', { d: dHole, fill: '#ece1c5', stroke: '#55483a',
                          'stroke-width': 0.9, 'vector-effect': 'non-scaling-stroke' }, holes);
}

function buildGraticule() {
  var g = $('graticule');
  for (var lng = -150; lng <= 180; lng += 30) {
    el('line', { x1: px(lng), y1: py(LAT_TOP), x2: px(lng), y2: py(LAT_BOTTOM),
                 stroke: '#8b7c5e', 'stroke-width': 1, opacity: 0.16,
                 'stroke-dasharray': '2 7', 'vector-effect': 'non-scaling-stroke' }, g);
  }
  for (var lat = 60; lat >= -40; lat -= 20) {
    el('line', { x1: px(-180), y1: py(lat), x2: px(180), y2: py(lat),
                 stroke: '#8b7c5e', 'stroke-width': 1, opacity: 0.16,
                 'stroke-dasharray': '2 7', 'vector-effect': 'non-scaling-stroke' }, g);
  }
}

/* ---------- 事件标记 ---------- */
var markers = [];   // { ev, el, x, y }

function buildMarkers() {
  var layer = $('markerLayer');
  EVENTS.forEach(function (ev) {
    var x = px(ev.lng), y = py(ev.lat);
    var g = el('g', { class: 'marker hidden', 'data-id': ev.id });
    var inner = el('g', { class: 'marker-inner' }, g);
    var color = ev.region === 'china' ? DOT_COLOR.china : DOT_COLOR.other;

    el('circle', { class: 'halo', r: 13 }, inner);

    if (ev.imp === 3) {
      el('rect', { class: 'sealbox', x: -10, y: -10, width: 20, height: 20, rx: 3, fill: color }, inner);
      var t = el('text', { x: 0, y: 0.5, 'font-size': 11.5, 'font-weight': 'bold' }, inner);
      t.textContent = CAT_CHAR[ev.cat] || '史';
    } else {
      el('circle', { class: 'dot', r: ev.imp === 2 ? 6 : 4.6, fill: color }, inner);
    }

    layer.appendChild(g);
    markers.push({ ev: ev, el: g, x: x, y: y });
  });

  // 同一地点多个事件：围成小圈散开，避免完全重叠
  var groups = {};
  markers.forEach(function (m) {
    var k = Math.round(m.x) + ',' + Math.round(m.y);
    (groups[k] = groups[k] || []).push(m);
  });
  Object.keys(groups).forEach(function (k) {
    var g = groups[k];
    if (g.length < 2) return;
    g.forEach(function (m, i) {
      var ang = (i / g.length) * Math.PI * 2 - Math.PI / 2;
      m.x += Math.cos(ang) * 13;
      m.y += Math.sin(ang) * 13;
    });
  });
}

function updateMarkerScale() {
  var k = state.vb.w / Math.max(mapWrap.clientWidth, 1);
  for (var i = 0; i < markers.length; i++) {
    var m = markers[i];
    m.el.setAttribute('transform', 'translate(' + m.x + ',' + m.y + ') scale(' + k.toFixed(3) + ')');
  }
}

/* ---------- 视图（viewBox） ---------- */
var tweenId = null;

function aspect() { return mapWrap.clientWidth / Math.max(mapWrap.clientHeight, 1); }

function setVB(vb) {
  var a = aspect();
  var w = Math.min(Math.max(vb.w, 420), WORLD_W);
  var h = w / a;
  var x = vb.x + vb.w / 2 - w / 2;   // 保持中心
  var y = vb.y + vb.h / 2 - h / 2;
  // 视野比世界高时垂直居中画心，否则钳制在容许范围内
  var ny;
  if (h >= WORLD_H) ny = (WORLD_H - h) / 2;
  else ny = Math.min(Math.max(y, -220), WORLD_H - h + 220);
  state.vb = {
    x: Math.min(Math.max(x, -160), WORLD_W - w + 160),
    y: ny,
    w: w, h: h
  };
  mapSvg.setAttribute('viewBox', state.vb.x + ' ' + state.vb.y + ' ' + w + ' ' + h);
  updateMarkerScale();
}

function viewPreset(name) {
  if (name === 'china') return { cx: px(105), cy: py(35), w: 1150 };
  return { cx: WORLD_W / 2 + 150, cy: py(20), w: WORLD_W };   // 世界视角中心约在东经 15°
}

function applyView(name, instant) {
  var scope = name === 'china' ? 'china' : 'world';
  var scopeChanged = scope !== state.scope;
  state.view = name;
  state.scope = scope;

  // 切换视角范围时，重置区域筛选并同步书签状态
  if (scopeChanged) {
    state.regionSel = scope === 'china' ? { china: true } : {};
    syncChips();
  }
  updateRegionChipDim();

  var p = viewPreset(name);
  flyTo(p.cx, p.cy, p.w, instant);
  var btns = $('viewSwitch').querySelectorAll('button');
  for (var i = 0; i < btns.length; i++)
    btns[i].classList.toggle('active', btns[i].getAttribute('data-view') === name);

  if (scopeChanged) setYear(state.year, { silentAnim: true });
}

function syncChips() {
  var rows = [['regionFilters', state.regionSel], ['catFilters', state.catSel]];
  for (var r = 0; r < rows.length; r++) {
    var chips = $(rows[r][0]).querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) {
      var k = chips[i].getAttribute('data-k');
      chips[i].classList.toggle('on', !!rows[r][1][k]);
    }
  }
}

function updateRegionChipDim() {
  var chips = $('regionFilters').querySelectorAll('.chip');
  for (var i = 0; i < chips.length; i++) {
    var k = chips[i].getAttribute('data-k');
    chips[i].classList.toggle('dim', state.scope === 'china' && k !== 'china');
  }
}

function flyTo(cx, cy, w, instant) {
  if (tweenId) { cancelAnimationFrame(tweenId); tweenId = null; }
  var target = { x: cx - w / 2, y: 0, w: w, h: 0 };
  var a = aspect();
  var from = { x: state.vb.x, y: state.vb.y, w: state.vb.w, h: state.vb.h };
  var to = { w: w, h: w / a, x: cx - w / 2, y: cy - (w / a) / 2 };

  var clampY = Math.min(Math.max(to.y, -220), WORLD_H - to.h + 220);
  to.y = clampY;

  if (instant) { setVB(to); return; }

  var t0 = performance.now(), dur = 620;
  function step(now) {
    var t = Math.min((now - t0) / dur, 1);
    var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    setVB({
      x: from.x + (to.x - from.x) * e,
      y: from.y + (to.y - from.y) * e,
      w: from.w + (to.w - from.w) * e,
      h: from.h + (to.h - from.h) * e
    });
    if (t < 1) tweenId = requestAnimationFrame(step);
    else tweenId = null;
  }
  tweenId = requestAnimationFrame(step);
}

/* ---------- 年份与可见性 ---------- */
function formatYear(y) {
  if (y < 0) return '公元前 ' + (-y) + ' 年';
  if (y === 0) return '公元元年';
  return '公元 ' + y + ' 年';
}
function shortYear(y) { return y < 0 ? '前' + (-y) : '' + y; }

function evEnd(ev) { return ev.y2 !== undefined ? ev.y2 : ev.y + (LINGER[ev.imp] || 20); }

function passFilter(ev) {
  // 「中国」视角：硬性只显示中国史事件，不受区域筛选影响
  if (state.scope === 'china' && ev.region !== 'china') return false;
  if (state.majorOnly && ev.imp !== 3) return false;
  var hasRegion = false, hitRegion = false;
  for (var r in state.regionSel) { hasRegion = true; if (state.regionSel[r]) hitRegion = true; }
  if (hasRegion && !hitRegion) return false;
  if (hasRegion && !state.regionSel[ev.region]) return false;
  var hasCat = false, hitCat = false;
  for (var c in state.catSel) { hasCat = true; if (state.catSel[c]) hitCat = true; }
  if (hasCat && !hitCat) return false;
  if (hasCat && !state.catSel[ev.cat]) return false;
  return true;
}

function visibleEvents(y) {
  var out = [];
  for (var i = 0; i < EVENTS.length; i++) {
    var ev = EVENTS[i];
    if (ev.y <= y && y <= evEnd(ev) && passFilter(ev)) out.push(ev);
  }
  return out;
}

function findDyn(y) {
  for (var i = DYNASTIES.length - 1; i >= 0; i--) {
    var d = DYNASTIES[i];
    if (y >= d.y1 && y <= d.y2) return d.n;
  }
  return null;
}
function findEra(y) {
  for (var i = WORLD_ERAS.length - 1; i >= 0; i--) {
    var e = WORLD_ERAS[i];
    if (y >= e.y1 && y <= e.y2) return e.n;
  }
  return null;
}

/* ---------- 主更新 ---------- */
function setYear(y, opts) {
  opts = opts || {};
  state.year = Math.min(Math.max(y, YEAR_MIN), YEAR_MAX);
  var vis = visibleEvents(state.year);
  updateMarkers(vis, !opts.silentAnim);   // 卡片由 updateMarkers 在可见集变化时重绘
  updateBanner();
  updateTimelineCursor(vis);
}

function updateMarkers(vis, animate) {
  var visIds = {};
  for (var i = 0; i < vis.length; i++) visIds[vis[i].id] = true;

  for (var j = 0; j < markers.length; j++) {
    var m = markers[j];
    var show = !!visIds[m.ev.id];
    var was = !m.el.classList.contains('hidden');
    if (show === was) continue;
    if (show) {
      m.el.classList.remove('hidden');
      if (animate) {
        m.el.classList.remove('pop');
        void m.el.getBoundingClientRect();
        m.el.classList.add('pop');
      }
    } else {
      m.el.classList.add('hidden');
    }
  }

  if (state.selectedId && !visIds[state.selectedId]) clearSelection();

  // 可见集合变化时才重绘卡片（拖动时间轴时避免频繁 innerHTML）
  var key = vis.map(function (e) { return e.id; }).join(',');
  if (key !== state.lastVisKey) {
    state.lastVisKey = key;
    renderCards(vis);
  }
}

function updateBanner() {
  var y = Math.round(state.year);
  bannerYear.textContent = formatYear(y);
  var dyn = findDyn(state.year), era = findEra(state.year);
  var html = '';
  if (dyn) html += '<span class="dyn-tag">' + dyn + '</span>';
  if (era) html += '<span class="era-name">' + era + '</span>';
  bannerMeta.innerHTML = html || '<span class="era-name">群雄逐鹿</span>';
}

/* ---------- 册页卡片 ---------- */
function srcHTML(ev) {
  var items = (typeof SOURCES !== 'undefined' && SOURCES[ev.id]) || [['tb', '']];
  var parts = [];
  for (var i = 0; i < items.length; i++) {
    var book = SRC_BOOKS[items[i][0]] || '课外拓展';
    var theme = items[i][1];
    parts.push(theme ? book + ' · ' + theme : book);
  }
  var body = '';
  for (var j = 0; j < parts.length; j++) body += '<span class="src-item">' + parts[j] + '</span>';
  return '<div class="card-src"><span class="src-label">出处</span>' + body + '</div>';
}

function cardHTML(ev) {
  var isCN = ev.region === 'china';
  var span = ev.y2 !== undefined ? evDate(ev) + ' — ' + endYear(ev) : evDate(ev);
  return '<div class="card' + (isCN ? '' : ' world') + (ev.id === state.selectedId ? ' selected' : '') + '" data-id="' + ev.id + '">' +
    '<div class="card-title">' + ev.title + '</div>' +
    '<div class="card-meta">' +
      '<span class="m-tag' + (isCN ? '' : ' w') + '">' + ev.tag + '</span>' +
      '<span>' + span + '</span>' +
      '<span class="m-tag' + (isCN ? '' : ' w') + '">' + REGION_NAMES[ev.region] + '</span>' +
      '<span class="m-tag' + (isCN ? '' : ' w') + '">' + CAT_NAMES[ev.cat] + '</span>' +
    '</div>' +
    '<div class="card-desc">' + ev.desc + '</div>' +
    '<div class="card-tip">' + ev.tip + '</div>' +
    srcHTML(ev) +
  '</div>';
}

function renderCards(vis) {
  var sorted = vis.slice().sort(function (a, b) {
    return (b.imp - a.imp) || (a.y - b.y);
  });
  countInfo.textContent = '共 ' + sorted.length + ' 事';
  if (!sorted.length) {
    cardsEl.innerHTML = '<div class="empty-cards">此处岁月静好<br><div class="sub">换个年份或筛选，再看看天下大事</div></div>';
    return;
  }
  cardsEl.innerHTML = sorted.map(cardHTML).join('');
  if (state.selectedId) {
    var sel = cardsEl.querySelector('.card.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

/* ---------- 选中 ---------- */
function markerById(id) {
  for (var i = 0; i < markers.length; i++) if (markers[i].ev.id === id) return markers[i];
  return null;
}

function selectEvent(id) {
  clearSelection();
  state.selectedId = id;
  var m = markerById(id);
  if (!m) return;
  m.el.classList.add('selected');
  var sel = cardsEl.querySelector('.card[data-id="' + id + '"]');
  if (sel) sel.classList.add('selected');
  renderCards(visibleEvents(state.year));
  var sel2 = cardsEl.querySelector('.card.selected');
  if (sel2) sel2.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  // 显式选中（卡片/搜索/圆点）总是飞行聚焦到事件处
  flyTo(m.x, m.y, Math.min(state.vb.w, 1100), false);
}

function clearSelection() {
  state.selectedId = null;
  var s = document.querySelectorAll('.marker.selected, .card.selected');
  for (var i = 0; i < s.length; i++) s[i].classList.remove('selected');
}

/* ---------- 地图交互 ---------- */
function screenToWorld(mx, my) {
  var r = mapSvg.getBoundingClientRect();
  return {
    x: state.vb.x + (mx - r.left) / r.width * state.vb.w,
    y: state.vb.y + (my - r.top) / r.height * state.vb.h
  };
}

(function bindMap() {
  var dragging = false, moved = 0, sx = 0, sy = 0, startVB = null;

  mapWrap.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    dragging = true; moved = 0; sx = e.clientX; sy = e.clientY;
    startVB = { x: state.vb.x, y: state.vb.y };
    mapWrap.classList.add('dragging');
  });

  // 挂在 window 上：不用 setPointerCapture，保留 pointerup 的真实 target 以识别标记点击
  window.addEventListener('pointermove', function (e) {
    if (dragging) {
      var r = mapSvg.getBoundingClientRect();
      var dx = (e.clientX - sx) / r.width * state.vb.w;
      var dy = (e.clientY - sy) / r.height * state.vb.h;
      moved = Math.max(moved, Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy));
      if (tweenId) { cancelAnimationFrame(tweenId); tweenId = null; }
      setVB({ x: startVB.x - dx, y: startVB.y - dy, w: state.vb.w, h: state.vb.h });
    } else if (mapWrap.contains(e.target)) {
      hoverMove(e);
    } else {
      hideTip();
    }
  });

  window.addEventListener('pointerup', function (e) {
    if (!dragging) return;
    dragging = false;
    mapWrap.classList.remove('dragging');
    if (moved < 5 && mapWrap.contains(e.target)) {
      var mk = e.target.closest ? e.target.closest('.marker') : null;
      if (mk) selectEvent(mk.getAttribute('data-id'));
      else clearSelection(), hideTip();
    }
  });

  mapWrap.addEventListener('pointerleave', hideTip);
  mapWrap.addEventListener('wheel', onWheel, { passive: false });

  $('zoomIn').addEventListener('click', function () { zoomBy(1 / 1.55); });
  $('zoomOut').addEventListener('click', function () { zoomBy(1.55); });
  $('resetView').addEventListener('click', function () { applyView(state.view, false); });

  $('viewSwitch').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) applyView(b.getAttribute('data-view'), false);
  });

  cardsEl.addEventListener('click', function (e) {
    var c = e.target.closest('.card');
    if (c) selectEvent(c.getAttribute('data-id'));
  });
})();

function zoomBy(f) {
  var cx = state.vb.x + state.vb.w / 2, cy = state.vb.y + state.vb.h / 2;
  flyTo(cx, cy, state.vb.w * f, false);
}

function onWheel(e) {
  e.preventDefault();
  if (tweenId) { cancelAnimationFrame(tweenId); tweenId = null; }
  var p = screenToWorld(e.clientX, e.clientY);
  var f = Math.exp(e.deltaY * 0.0011);
  var w = Math.min(Math.max(state.vb.w * f, 420), WORLD_W);
  var r = mapSvg.getBoundingClientRect();
  var mx = (e.clientX - r.left) / r.width, my = (e.clientY - r.top) / r.height;
  setVB({ x: p.x - mx * w, y: p.y - my * (w / aspect()), w: w, h: w / aspect() });
}

/* ---- 悬浮提示 ---- */
function hoverMove(e) {
  var mk = e.target.closest ? e.target.closest('.marker') : null;
  if (!mk || mk.classList.contains('hidden')) { hideTip(); return; }
  var m = markerById(mk.getAttribute('data-id'));
  if (!m) return;
  var ev = m.ev;
  var r = mapSvg.getBoundingClientRect();
  var sx = (m.x - state.vb.x) / state.vb.w * r.width;
  var sy = (m.y - state.vb.y) / state.vb.h * r.height;
  tooltip.textContent = ev.tag + ' · ' + ev.title;
  tooltip.style.left = sx + 'px';
  tooltip.style.top = sy + 'px';
  tooltip.classList.add('show');
}
function hideTip() { tooltip.classList.remove('show'); }

/* ---------- 卷轴时间轴 ---------- */
var TL = { pad: 10, innerW: 0, cursor: null, cursorBox: null, cursorText: null,
           y1: YEAR_MIN, y2: YEAR_MAX };   // y1/y2 = 当前缩放窗口

function tlSpan() { return TL.y2 - TL.y1; }
function tlX(year) { return TL.pad + (year - TL.y1) / tlSpan() * TL.innerW; }
function tlYearAt(x) { return TL.y1 + (x - TL.pad) / TL.innerW * tlSpan(); }
/* 有月份的事件在年内按月偏移定位 */
function fracYear(ev) { return ev.m ? ev.y + (ev.m - 0.5) / 12 : ev.y; }

function evById(id) {
  for (var i = 0; i < EVENTS.length; i++) if (EVENTS[i].id === id) return EVENTS[i];
  return null;
}

function evDate(ev) {
  var about = ev.ab1 ? '约' : '';
  if (!ev.m) return about + formatYear(ev.y);
  return about + formatYear(ev.y).replace(' 年', ' 年 ' + ev.m + ' 月');
}

function endYear(ev) {
  return (ev.ab2 ? '约' : '') + formatYear(ev.y2);
}

function lifeSpan(ev) {
  return (ev.ab1 ? '约' : '') + shortYear(ev.y) + ' — ' + (ev.ab2 ? '约' : '') + shortYear(ev.y2);
}

function drawTimeline() {
  var w = timelineSvg.clientWidth || 800, h = timelineSvg.clientHeight || 170;
  timelineSvg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  timelineSvg.innerHTML = '';
  TL.innerW = w - TL.pad * 2;

  var root = el('g', {}, timelineSvg);

  // 纸底
  el('rect', { x: 0, y: 0, width: w, height: h, rx: 3, fill: '#ece1c5', stroke: '#8b7c5e', 'stroke-width': 1 }, root);

  // 世界时代带（按当前窗口裁剪）
  var gEra = el('g', {}, root);
  WORLD_ERAS.forEach(function (e, i) {
    drawBand(gEra, e.y1, e.y2, 12, 24, ERA_COLORS[i % ERA_COLORS.length], e.n, 62);
  });

  // 中国朝代带
  var gDyn = el('g', {}, root);
  DYNASTIES.forEach(function (d, i) {
    drawBand(gDyn, d.y1, d.y2, 42, 26, DYN_COLORS[i % DYN_COLORS.length], d.n, 26);
  });

  // 事件圆点与人物寿命条（cat='figure' 且有卒年的画寿命条，其余画圆点）
  var gDots = el('g', {}, root);
  EVENTS.forEach(function (ev) {
    var fy = fracYear(ev);
    var fy2 = ev.y2 !== undefined ? ev.y2 : fy;
    if (fy2 < TL.y1 || fy > TL.y2) return;
    var color = ev.region === 'china' ? DOT_COLOR.china : DOT_COLOR.other;
    if (ev.cat === 'figure' && ev.y2 !== undefined) {
      var bx1 = Math.max(tlX(fy), TL.pad), bx2 = Math.min(tlX(ev.y2), TL.pad + TL.innerW);
      if (bx2 - bx1 < 1) return;
      el('rect', { x: bx1, y: 78, width: bx2 - bx1, height: 4, rx: 2, fill: color,
                   opacity: 0.5, class: 'tl-figbar', 'data-id': ev.id }, gDots);
      el('rect', { x: bx1 - 2, y: 74, width: Math.max(bx2 - bx1 + 4, 6), height: 12,
                   fill: 'transparent', class: 'tl-hitf', 'data-id': ev.id }, gDots);
      return;
    }
    var x = tlX(fy);
    if (x < TL.pad - 4 || x > TL.pad + TL.innerW + 4) return;
    el('circle', { cx: x, cy: 80, r: ev.imp === 3 ? 3 : 2.2,
                   fill: color,
                   opacity: 0.45, class: 'tl-dot', 'data-id': ev.id }, gDots);
    el('circle', { cx: x, cy: 80, r: 7, fill: 'transparent', class: 'tl-hit', 'data-id': ev.id }, gDots);
  });

  // 主轴线与自适应刻度
  el('line', { x1: TL.pad, y1: 98, x2: w - TL.pad, y2: 98, stroke: '#5c5240', 'stroke-width': 1.5 }, root);
  var span = tlSpan();
  // 从细到粗，取第一个间距 ≥ 90px 的步长
  var steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
  var step = 1000;
  for (var s = 0; s < steps.length; s++) {
    if (TL.innerW * steps[s] / span >= 90) { step = steps[s]; break; }
  }
  var minor = Math.max(step / 5, 1);
  var y0 = Math.ceil(TL.y1 / minor) * minor;
  for (var y = y0; y <= TL.y2 + 0.001; y += minor) {
    var isMajor = Math.abs(y / step - Math.round(y / step)) < 1e-9;
    el('line', { x1: tlX(y), y1: 98, x2: tlX(y), y2: isMajor ? 106 : 102,
                 stroke: '#5c5240', 'stroke-width': isMajor ? 1.4 : 0.8, opacity: isMajor ? 0.9 : 0.5 }, root);
    if (isMajor) {
      var t = el('text', { x: tlX(y), y: 120, 'font-size': 11, fill: '#5c5240', 'text-anchor': 'middle',
                           'letter-spacing': 1 }, root);
      t.textContent = shortYear(Math.round(y));
    }
  }

  // 月份刻度（足够放大时显示；1/4/7/10 月标注数字）
  var pxPerYear = TL.innerW / span;
  if (pxPerYear >= 110) {
    var yA = Math.floor(TL.y1), yB = Math.ceil(TL.y2);
    for (var yy = yA; yy <= yB; yy++) {
      for (var mm = 1; mm <= 12; mm++) {
        var fy = yy + (mm - 0.5) / 12;
        if (fy < TL.y1 || fy > TL.y2) continue;
        el('line', { x1: tlX(fy), y1: 98, x2: tlX(fy), y2: 101.5,
                     stroke: '#8b7c5e', 'stroke-width': 0.7 }, root);
        if (pxPerYear >= 260 && (mm === 1 || mm === 4 || mm === 7 || mm === 10)) {
          var mt = el('text', { x: tlX(fy), y: 111, 'font-size': 9, fill: '#8b7c5e',
                                'text-anchor': 'middle' }, root);
          mt.textContent = mm;
        }
      }
    }
  }

  // 游标（最后绘制，保证置顶；红框可拖动选年）
  var gCur = el('g', { class: 'tl-cursor' }, root);
  TL.cursor = el('line', { y1: 8, y2: 134, stroke: '#9e2b25', 'stroke-width': 2 }, gCur);
  TL.cursorBox = el('rect', { y: 122, width: 66, height: 27, rx: 3, fill: '#9e2b25',
                              stroke: '#f3e6cf', 'stroke-width': 1.6 }, gCur);
  TL.cursorBox.style.cursor = 'grab';
  TL.cursorText = el('text', { y: 140, 'font-size': 14, 'font-weight': 'bold', fill: '#f6ecd6',
                               'text-anchor': 'middle', 'letter-spacing': 1 }, gCur);

  updateTimelineCursor(visibleEvents(state.year));
}

/* 在当前窗口内绘制一条时代/朝代色带（带点击跳转） */
function drawBand(g, by1, by2, y, hh, color, label, minLabelW) {
  var x1 = Math.max(tlX(by1), TL.pad), x2 = Math.min(tlX(by2), TL.pad + TL.innerW);
  if (x2 - x1 < 1.5) return;
  var r = el('rect', { x: x1, y: y, width: x2 - x1, height: hh, fill: color,
                       stroke: '#ece1c5', 'stroke-width': 1 }, g);
  r.style.cursor = 'pointer';
  var mid = (Math.max(by1, TL.y1) + Math.min(by2, TL.y2)) / 2;
  r.addEventListener('click', function () { jumpToYear(mid); });
  addBandLabel(g, (x1 + x2) / 2, y + hh / 2, label, x2 - x1, '#f3ead4', minLabelW);
}

function addBandLabel(g, x, y, text, width, color, min) {
  if (width < (min || 30)) return;
  var t = el('text', { x: x, y: y, 'font-size': 11.5, fill: color, 'text-anchor': 'middle',
                       'dominant-baseline': 'central', 'letter-spacing': 2 }, g);
  t.textContent = text;
}

function updateTimelineCursor(vis) {
  if (!TL.cursor) return;
  if (!vis) vis = [];
  var x = tlX(state.year);
  // 年份在缩放窗口外时，游标线钳制在可视范围内（手柄仍贴边显示年份）
  var cx = Math.min(Math.max(x, TL.pad), TL.pad + TL.innerW);
  TL.cursor.setAttribute('x1', cx); TL.cursor.setAttribute('x2', cx);
  var bx = Math.min(Math.max(x - 33, TL.pad - 6), TL.pad + TL.innerW - 60);
  TL.cursorBox.setAttribute('x', bx);
  TL.cursorText.setAttribute('x', bx + 33);
  TL.cursorText.textContent = shortYear(Math.round(state.year));
  // 点亮当前可见的事件点与人物寿命条
  var visIds = {};
  for (var v = 0; v < vis.length; v++) visIds[vis[v].id] = true;
  var dots = timelineSvg.querySelectorAll('.tl-dot');
  for (var i = 0; i < dots.length; i++) {
    var on = !!visIds[dots[i].getAttribute('data-id')];
    dots[i].setAttribute('opacity', on ? 1 : 0.3);
    dots[i].setAttribute('r', on ? 3.4 : 2.2);
  }
  var bars = timelineSvg.querySelectorAll('.tl-figbar');
  for (var b = 0; b < bars.length; b++) {
    var onb = !!visIds[bars[b].getAttribute('data-id')];
    bars[b].setAttribute('opacity', onb ? 0.95 : 0.3);
    bars[b].setAttribute('height', onb ? 6 : 4);
    bars[b].setAttribute('y', onb ? 77 : 78);
  }
}

function jumpToYear(y) { setYear(y); ensureVisible(y); }

/* 若年份不在当前缩放窗口内或贴边，则平移窗口使其可见 */
function ensureVisible(y) {
  var span = tlSpan();
  if (y < TL.y1 || y > TL.y2) {
    var ny1 = Math.min(Math.max(y - span / 2, YEAR_MIN), YEAR_MAX - span);
    TL.y1 = ny1; TL.y2 = ny1 + span;
    drawTimeline();
    return;
  }
  if (state.playing) {
    var m = span * 0.1;
    if (y > TL.y2 - m) {
      TL.y1 = Math.min(Math.max(y - span * 0.9, YEAR_MIN), YEAR_MAX - span);
      TL.y2 = TL.y1 + span;
      drawTimeline();
    } else if (y < TL.y1 + m) {
      TL.y1 = Math.max(y - span * 0.1, YEAR_MIN);
      TL.y2 = TL.y1 + span;
      drawTimeline();
    }
  }
}

function tlPanBy(dy) {
  var span = tlSpan();
  var ny1 = Math.min(Math.max(TL.y1 + dy, YEAR_MIN), YEAR_MAX - span);
  if (ny1 === TL.y1) return;
  TL.y1 = ny1; TL.y2 = ny1 + span;
  drawTimeline();
}

/* 时间轴悬停冒泡 */
var tlTip = null;
function ensureTlTip() {
  if (tlTip) return tlTip;
  tlTip = document.createElement('div');
  tlTip.className = 'tl-tip';
  timelineSvg.parentNode.appendChild(tlTip);
  return tlTip;
}
function hideTlTip() { if (tlTip) tlTip.classList.remove('show'); }
function tlHover(e) {
  var hit = e.target.closest ? (e.target.closest('.tl-hit') || e.target.closest('.tl-hitf')) : null;
  if (!hit) { hideTlTip(); return; }
  var ev = evById(hit.getAttribute('data-id'));
  if (!ev) return;
  var tip = ensureTlTip();
  var sr = timelineSvg.getBoundingClientRect();
  var mr = timelineSvg.parentNode.getBoundingClientRect();
  var x = sr.left - mr.left + parseFloat(hit.getAttribute('cx') || hit.getAttribute('x')) + (hit.classList.contains('tl-hitf') ? parseFloat(hit.getAttribute('width')) / 2 : 0);
  var y = sr.top - mr.top + 80;
  var life = (ev.cat === 'figure' && ev.y2 !== undefined) ? lifeSpan(ev) : evDate(ev);
  tip.innerHTML = '<b>' + ev.title + '</b><span>' + life + ' · ' + ev.tag + '</span>';
  tip.style.left = x + 'px';
  tip.style.top = (y - 9) + 'px';
  tip.classList.add('show');
}

function tlReset() { TL.y1 = YEAR_MIN; TL.y2 = YEAR_MAX; drawTimeline(); hideTlTip(); }

(function bindTimeline() {
  var mode = null, moved = 0, sx = 0, lastX = 0, downHit = null;

  function inHandle(x, y) {
    if (!TL.cursorBox) return false;
    var bx = parseFloat(TL.cursorBox.getAttribute('x'));
    return y >= 116 && y <= 152 && x >= bx - 8 && x <= bx + 74;
  }

  timelineSvg.addEventListener('pointerdown', function (e) {
    var r = timelineSvg.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    downHit = e.target.closest ? (e.target.closest('.tl-hit') || e.target.closest('.tl-hitf')) : null;
    mode = inHandle(x, y) ? 'scrub' : 'pan';
    moved = 0; sx = e.clientX; lastX = x;
    try { timelineSvg.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件等无活动指针时忽略 */ }
    timelineSvg.classList.add('dragging');
    if (mode === 'scrub') setYear(tlYearAt(x));
    hideTlTip();
  });

  timelineSvg.addEventListener('pointermove', function (e) {
    if (!mode) { tlHover(e); return; }
    var r = timelineSvg.getBoundingClientRect();
    var x = e.clientX - r.left;
    moved = Math.max(moved, Math.abs(e.clientX - sx));
    if (mode === 'scrub') {
      setYear(tlYearAt(x));
    } else if (moved > 3) {
      tlPanBy((lastX - x) / TL.innerW * tlSpan());
      hideTlTip();
    }
    lastX = x;
  });

  timelineSvg.addEventListener('pointerup', function (e) {
    if (!mode) return;
    var wasMode = mode, wasHit = downHit;
    mode = null; downHit = null;
    timelineSvg.classList.remove('dragging');
    if (moved >= 4) return;
    if (wasMode === 'scrub') return;
    // 单击：点到圆点 → 跳到该事件并选中；点到空白 → 选年
    if (wasHit) {
      var id = wasHit.getAttribute('data-id');
      var ev = evById(id);
      if (ev) { setYear(ev.y); selectEvent(id); }
      return;
    }
    var r = timelineSvg.getBoundingClientRect();
    var x = e.clientX - r.left;
    if (x >= TL.pad - 2 && x <= TL.pad + TL.innerW + 2) setYear(Math.round(tlYearAt(x)));
  });

  timelineSvg.addEventListener('pointerleave', function () { if (!mode) hideTlTip(); });

  timelineSvg.addEventListener('wheel', function (e) {
    e.preventDefault();
    hideTlTip();
    var r = timelineSvg.getBoundingClientRect();
    var yAt = tlYearAt(e.clientX - r.left);
    var f = Math.exp(e.deltaY * 0.0012);
    var span = Math.min(Math.max(tlSpan() * f, 2), YEAR_MAX - YEAR_MIN);
    var ratio = (yAt - TL.y1) / tlSpan();
    var ny1 = Math.min(Math.max(yAt - ratio * span, YEAR_MIN), YEAR_MAX - span);
    TL.y1 = ny1; TL.y2 = ny1 + span;
    drawTimeline();
  }, { passive: false });

  timelineSvg.addEventListener('dblclick', tlReset);
  $('tlReset').addEventListener('click', tlReset);

  $('prevEvent').addEventListener('click', stepEvent(-1));
  $('nextEvent').addEventListener('click', stepEvent(1));
})();

function stepEvent(dir) {
  return function () {
    var years = [];
    var seen = {};
    EVENTS.forEach(function (ev) { if (!seen[ev.y]) { seen[ev.y] = 1; years.push(ev.y); } });
    years.sort(function (a, b) { return a - b; });
    var cur = state.year, target = null;
    if (dir > 0) { for (var i = 0; i < years.length; i++) if (years[i] > cur + 0.5) { target = years[i]; break; } }
    else { for (var j = years.length - 1; j >= 0; j--) if (years[j] < cur - 0.5) { target = years[j]; break; } }
    if (target !== null) jumpToYear(target);
    else if (dir > 0) togglePlay(false);
  };
}

/* ---------- 自动游览 ---------- */
function togglePlay(force) {
  var want = force !== undefined ? force : !state.playing;
  if (want === state.playing) return;
  state.playing = want;
  playBtn.classList.toggle('playing', state.playing);
  playBtn.textContent = state.playing ? '❚❚ 暂停游览' : '▶ 自动游览';
  if (state.playing) {
    if (state.year >= YEAR_MAX - 1) setYear(YEAR_MIN);
    requestAnimationFrame(playLoop);
  }
}

var lastTs = 0;
function playLoop(ts) {
  if (!state.playing) return;
  var dt = Math.min((ts - lastTs) / 1000, 0.1) || 0.016;
  lastTs = ts;
  var y = state.year + dt * 30;   // 每秒约 30 年
  if (y >= YEAR_MAX) { setYear(YEAR_MAX); togglePlay(false); return; }
  setYear(y, { silentAnim: false });
  ensureVisible(y);
  requestAnimationFrame(playLoop);
}

playBtn.addEventListener('click', function () { togglePlay(); });

/* ---------- 筛选 ---------- */
function buildFilters() {
  var gR = $('regionFilters'), gC = $('catFilters');
  Object.keys(REGION_NAMES).forEach(function (k) {
    var b = document.createElement('button');
    b.className = 'chip'; b.textContent = REGION_NAMES[k]; b.dataset.k = k;
    b.addEventListener('click', function () {
      if (state.regionSel[k]) delete state.regionSel[k]; else state.regionSel[k] = true;
      b.classList.toggle('on', !!state.regionSel[k]);
      setYear(state.year, { silentAnim: true });
    });
    gR.appendChild(b);
  });
  Object.keys(CAT_NAMES).forEach(function (k) {
    var b = document.createElement('button');
    b.className = 'chip'; b.textContent = CAT_NAMES[k]; b.dataset.k = k;
    b.addEventListener('click', function () {
      if (state.catSel[k]) delete state.catSel[k]; else state.catSel[k] = true;
      b.classList.toggle('on', !!state.catSel[k]);
      setYear(state.year, { silentAnim: true });
    });
    gC.appendChild(b);
  });
  majorOnlyEl.addEventListener('change', function () {
    state.majorOnly = majorOnlyEl.checked;
    setYear(state.year, { silentAnim: true });
  });
}

/* ---------- 模糊搜索 ---------- */
var searchInput = $('searchInput'), searchDrop = $('searchDrop');
var searchItems = [], searchActive = -1, searchTimer = null, SEARCH_HAY = null;

function searchHay() {
  if (!SEARCH_HAY) {
    SEARCH_HAY = EVENTS.map(function (ev) {
      return {
        ev: ev,
        dense: (ev.title + ev.desc + ev.tip + ev.tag + (REGION_NAMES[ev.region] || '') +
                formatYear(ev.y) + shortYear(ev.y) + (ev.y < 0 ? '前' + (-ev.y) : '') +
                (ev.y2 !== undefined ? shortYear(ev.y2) : '')).replace(/\s+/g, '')
      };
    });
  }
  return SEARCH_HAY;
}

function isSubseq(q, s) {
  var i = 0;
  for (var j = 0; j < s.length && i < q.length; j++) if (s[j] === q[i]) i++;
  return i === q.length;
}

/* 词元解析：年份 / 朝代·时代区间 / 普通文本 */
function parseToken(tok) {
  var m = tok.match(/^(?:公元前|前)\s*(\d{1,4})\s*年?$/);
  if (m) {
    var yBc = -parseInt(m[1], 10);
    if (yBc >= YEAR_MIN && yBc <= YEAR_MAX) return { kind: 'year', y: yBc, label: tok };
  }
  m = tok.match(/^(\d{1,4})\s*年$/);
  if (m) {
    var yCe = parseInt(m[1], 10);
    if (yCe >= 1 && yCe <= YEAR_MAX) return { kind: 'year', y: yCe, label: tok };
  }
  if (/^\d{1,4}$/.test(tok)) {
    var n = parseInt(tok, 10);
    if (n >= 1 && n <= YEAR_MAX) return { kind: 'year', y: n, label: tok };
    if (n > YEAR_MAX && n <= 3000) return { kind: 'year', y: -n, label: tok };
  }
  var strip = tok.replace(/(朝|代|时期|时代)$/, '');
  if (strip) {
    for (var i = 0; i < DYNASTIES.length; i++) {
      if (DYNASTIES[i].n.indexOf(strip) === 0 || strip.indexOf(DYNASTIES[i].n) === 0)
        return { kind: 'range', y1: DYNASTIES[i].y1, y2: DYNASTIES[i].y2, label: DYNASTIES[i].n };
    }
    for (var j = 0; j < WORLD_ERAS.length; j++) {
      if (WORLD_ERAS[j].n.indexOf(strip) !== -1)
        return { kind: 'range', y1: WORLD_ERAS[j].y1, y2: WORLD_ERAS[j].y2, label: WORLD_ERAS[j].n };
    }
  }
  return { kind: 'text', q: tok };
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function hlTitle(title, tokens) {
  var out = escHtml(title);
  tokens.forEach(function (t) {
    if (t.length < 1) return;
    var i = title.indexOf(t);
    if (i !== -1) {
      var escT = escHtml(title.slice(i, i + t.length));
      out = out.replace(escT, '<mark>' + escT + '</mark>');
    }
  });
  return out;
}

function doSearch(raw) {
  var q = (raw || '').trim().toLowerCase();
  if (!q) { hideSearch(); return; }
  var tokens = q.split(/[\s,，、]+/).filter(Boolean);
  var jumps = [], jumpSeen = {};
  var events = searchHay().filter(function (h) {
    var ok = true;
    for (var i = 0; i < tokens.length && ok; i++) {
      var tk = parseToken(tokens[i]);
      if (tk.kind === 'year') {
        if (!jumpSeen[tk.label]) { jumpSeen[tk.label] = 1; jumps.push(tk); }
        ok = h.ev.y === tk.y || (h.ev.y <= tk.y && tk.y <= evEnd(h.ev));
      } else if (tk.kind === 'range') {
        if (!jumpSeen[tk.label]) { jumpSeen[tk.label] = 1; jumps.push(tk); }
        ok = h.ev.y >= tk.y1 && h.ev.y <= tk.y2;
      } else {
        var t = tk.q;
        ok = h.dense.indexOf(t) !== -1 || isSubseq(t, h.ev.title.toLowerCase());
      }
    }
    return ok;
  });
  events.sort(function (a, b) { return (b.ev.imp - a.ev.imp) || (a.ev.y - b.ev.y); });

  searchItems = [];
  var html = '';
  jumps.forEach(function (j) {
    var idx = searchItems.length;
    searchItems.push({ kind: 'jump', j: j });
    var sub = j.kind === 'year'
      ? '把时间轴跳到 ' + formatYear(j.y)
      : '缩放到 ' + j.label + '（' + shortYear(j.y1) + ' ~ ' + shortYear(j.y2) + '）';
    html += '<div class="search-jump" data-i="' + idx + '"><span class="sj-ico">➤</span>' + escHtml(sub) + '</div>';
  });
  if (events.length)
    html += '<div class="search-head">事件 · ' + events.length + (events.length > 15 ? '（显示前 15）' : '') + '</div>';
  events.slice(0, 15).forEach(function (h) {
    var idx = searchItems.length;
    searchItems.push({ kind: 'event', ev: h.ev });
    var meta = (h.ev.cat === 'figure' && h.ev.y2 !== undefined)
      ? lifeSpan(h.ev) + ' · ' + (CAT_NAMES[h.ev.cat] || '') + ' · ' + h.ev.tag
      : evDate(h.ev) + ' · ' + h.ev.tag + ' · ' + (REGION_NAMES[h.ev.region] || '');
    html += '<div class="search-item" data-i="' + idx + '">' +
      '<div class="si-title">' + hlTitle(h.ev.title, tokens) + '</div>' +
      '<div class="si-meta">' + meta + '</div>' +
      '<div class="si-desc">' + escHtml(h.ev.desc) + '</div></div>';
  });
  if (!searchItems.length) html = '<div class="search-none">未找到相关的事件、年份或朝代</div>';
  searchDrop.innerHTML = html;
  searchDrop.classList.add('show');
  searchActive = -1;
}

function hideSearch() {
  searchDrop.classList.remove('show');
  searchDrop.innerHTML = '';
  searchItems = [];
  searchActive = -1;
}

function pickSearch(i) {
  var it = searchItems[i];
  if (!it) return;
  hideSearch();
  searchInput.blur();
  if (it.kind === 'jump') {
    var j = it.j;
    if (j.kind === 'year') { jumpToYear(j.y); }
    else {
      var y1 = Math.max(YEAR_MIN, j.y1 - 10), y2 = Math.min(YEAR_MAX, j.y2 + 10);
      if (y2 - y1 < 2) y2 = Math.min(y1 + 2, YEAR_MAX);
      TL.y1 = y1; TL.y2 = y2;
      drawTimeline();
      setYear((j.y1 + j.y2) / 2);
    }
  } else {
    if (state.scope === 'china' && it.ev.region !== 'china') applyView('world', false);
    setYear(it.ev.y);
    ensureVisible(it.ev.y);
    selectEvent(it.ev.id);
  }
}

(function bindSearch() {
  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    var v = searchInput.value;
    searchTimer = setTimeout(function () { doSearch(v); }, 140);
  });

  searchInput.addEventListener('keydown', function (e) {
    var n = searchItems.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!n) return;
      searchActive = (searchActive + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      var els = searchDrop.querySelectorAll('.search-jump, .search-item');
      for (var i = 0; i < els.length; i++) els[i].classList.toggle('active', i === searchActive);
      if (els[searchActive]) els[searchActive].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pickSearch(searchActive >= 0 ? searchActive : 0);
    } else if (e.key === 'Escape') {
      hideSearch();
      searchInput.blur();
    }
  });

  searchDrop.addEventListener('pointerdown', function (e) {
    var el = e.target.closest ? e.target.closest('.search-jump, .search-item') : null;
    if (el) { e.preventDefault(); pickSearch(parseInt(el.getAttribute('data-i'), 10)); }
  });

  document.addEventListener('pointerdown', function (e) {
    if (!e.target.closest || !e.target.closest('.search-wrap')) hideSearch();
  });
})();

/* ---------- 罗盘装饰 ---------- */
function buildCompass() {
  var d = document.createElement('div');
  d.style.cssText = 'position:absolute;top:14px;right:14px;width:44px;height:44px;border-radius:50%;' +
    'background:radial-gradient(circle at 35% 30%, #f6efdb, #e3d5b4);border:1px solid #8b7c5e;' +
    'box-shadow:1px 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;' +
    'font-size:19px;color:#9e2b25;user-select:none;pointer-events:none;letter-spacing:0;';
  d.textContent = '北';
  mapWrap.appendChild(d);
}

/* ---------- 键盘 ---------- */
document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }
  if (document.activeElement === searchInput || document.activeElement.tagName === 'INPUT') return;
  if (e.key === 'ArrowLeft') stepEvent(-1)();
  else if (e.key === 'ArrowRight') stepEvent(1)();
  else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
});

/* ---------- resize ---------- */
var resizeTimer = null;
window.addEventListener('resize', function () {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function () {
    var cx = state.vb.x + state.vb.w / 2, cy = state.vb.y + state.vb.h / 2;
    setVB({ x: cx - state.vb.w / 2, y: cy - state.vb.h / 2, w: state.vb.w, h: state.vb.w / aspect() });
    drawTimeline();
  }, 120);
});

/* ---------- 启动 ---------- */
// 调试出口（不影响功能；便于控制台排查）
window.__qiu = { state: state, TL: TL, doSearch: doSearch, setYear: setYear, selectEvent: selectEvent, jumpToYear: jumpToYear };

buildLand();
buildGraticule();
buildMarkers();
buildFilters();
buildCompass();
applyView('world', true);
drawTimeline();
setYear(-221, { silentAnim: false });

})();
