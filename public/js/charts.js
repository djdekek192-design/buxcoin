const Charts = {
  _reg: new Set(),

  setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(rect.width, 100);
    const h = parseInt(canvas.getAttribute('data-h') || '260', 10);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  },

  css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  },

  redrawAll() {
    for (const canvas of Charts._reg) {
      if (canvas.isConnected && canvas._redraw) {
        try { canvas._redraw(); } catch (_) {}
      } else if (!canvas.isConnected) {
        Charts._reg.delete(canvas);
      }
    }
  },

  createGroup() {
    const g = { v0: 0, v1: 1, listeners: [] };
    g.set = (a, b) => { g.v0 = a; g.v1 = b; g.listeners.forEach(fn => fn()); };
    g.redraw = () => g.listeners.forEach(fn => fn());
    return g;
  },

  _clampView(view, n, minCount = 15) {
    let span = view.v1 - view.v0;
    const minSpan = Math.min(minCount / n, 1);
    if (span < minSpan) {
      const center = (view.v0 + view.v1) / 2;
      span = minSpan;
      view.v0 = center - span / 2;
      view.v1 = center + span / 2;
    }
    if (view.v0 < 0) { view.v1 -= view.v0; view.v0 = 0; }
    if (view.v1 > 1) { view.v0 -= view.v1 - 1; view.v1 = 1; }
    if (view.v0 < 0) view.v0 = 0;
    if (view.v1 - view.v0 > 1) { view.v0 = 0; view.v1 = 1; }
  },

  candles(canvas, candles, opts = {}) {
    if (!canvas) return;
    canvas._cdata = { candles, opts };
    canvas._redraw = () => Charts.candles(canvas, canvas._cdata.candles, canvas._cdata.opts);
    Charts._reg.add(canvas);
    if (!candles || candles.length === 0) {
      const { ctx, w, h } = Charts.setupCanvas(canvas);
      ctx.clearRect(0, 0, w, h);
      return;
    }
    const view = opts.group || (canvas._cview = canvas._cview || { v0: 0, v1: 1 });
    Charts._clampView(view, candles.length);
    const n = candles.length;
    const i0 = Math.floor(view.v0 * n);
    const i1 = Math.min(n, Math.ceil(view.v1 * n));
    const vis = candles.slice(i0, i1);

    const { ctx, w, h } = Charts.setupCanvas(canvas);
    const padL = 8, padR = 62, padT = 10, padB = 22;
    const cw = w - padL - padR, ch = h - padT - padB;
    const volH = Math.min(46, ch * 0.18);
    const priceH = ch - volH - 6;
    const text = Charts.css('--muted') || '#8b96b5';
    const border = Charts.css('--border') || '#26304f';
    const greens = Charts.css('--green') || '#2ecc71';
    const reds = Charts.css('--red') || '#ff5c5c';
    const accent = Charts.css('--accent') || '#ff9e1b';
    const fmt = p => p >= 1000 ? (p / 1000).toFixed(2) + 'k' : p.toFixed(p < 10 ? 3 : 1);

    let min = Infinity, max = -Infinity, vmax = 0;
    for (const c of vis) {
      min = Math.min(min, c.low); max = Math.max(max, c.high);
      vmax = Math.max(vmax, c.volume || 0);
    }
    const pad = (max - min) * 0.06 || max * 0.01;
    min -= pad; max += pad;
    const y = p => padT + priceH - ((p - min) / (max - min)) * priceH;
    const vy = v => padT + ch - (vmax > 0 ? (v / vmax) * volH : 0);
    const step = cw / vis.length;
    const bw = Math.max(1.5, Math.min(step * 0.65, 14));

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = border; ctx.fillStyle = text; ctx.font = '10px sans-serif'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const p = min + ((max - min) / 4) * i;
      const yy = y(p);
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + cw, yy); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(fmt(p), padL + cw + 6, yy + 3);
    }

    if (opts.sma) {
      for (const [period, color] of opts.sma) {
        const closes = candles.map(c => c.close);
        const vals = SMA(closes, period);
        ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.beginPath();
        let started = false;
        for (let i = i0; i < i1; i++) {
          if (vals[i] === null) continue;
          const xx = padL + (i - i0) * step + step / 2;
          if (!started) { ctx.moveTo(xx, y(vals[i])); started = true; }
          else ctx.lineTo(xx, y(vals[i]));
        }
        ctx.stroke();
      }
    }

    for (let i = i0; i < i1; i++) {
      const c = candles[i];
      const xx = padL + (i - i0) * step + step / 2;
      const up = c.close >= c.open;
      if (c.volume) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = up ? greens : reds;
        ctx.fillRect(xx - bw / 2, vy(c.volume), bw, padT + ch - vy(c.volume));
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = up ? greens : reds;
      ctx.fillStyle = up ? greens : reds;
      ctx.beginPath();
      ctx.moveTo(xx, y(c.high)); ctx.lineTo(xx, y(c.low));
      ctx.stroke();
      const yo = y(c.open), yc = y(c.close);
      const top = Math.min(yo, yc);
      const bh = Math.max(Math.abs(yc - yo), 1);
      ctx.fillRect(xx - bw / 2, top, bw, bh);
    }

    if (canvas._cross >= i0 && canvas._cross < i1) {
      const xx = padL + (canvas._cross - i0) * step + step / 2;
      ctx.strokeStyle = accent; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(xx, padT); ctx.lineTo(xx, padT + ch); ctx.stroke();
      ctx.setLineDash([]);
    }

    if (!canvas._bound) {
      canvas._bound = true;
      canvas.classList.add('candles-canvas');
      const tip = Charts._tooltip(canvas);
      const pointers = new Map();
      let panStart = null, pinchStart = null;

      const currentView = () => opts.group || canvas._cview;
      const commit = () => {
        if (opts.group) opts.group.set(opts.group.v0, opts.group.v1);
        else Charts.candles(canvas, canvas._cdata.candles, canvas._cdata.opts);
      };
      const hideTip = () => {
        tip.style.display = 'none';
        if (canvas._cross !== -1 && canvas._cross !== undefined) {
          canvas._cross = -1;
          Charts.candles(canvas, canvas._cdata.candles, canvas._cdata.opts);
        }
      };
      const showAt = (clientX) => {
        const rect = canvas.getBoundingClientRect();
        const px = clientX - rect.left;
        const idx = i0 + Math.floor((px - padL) / step);
        if (idx < i0 || idx >= i1) { hideTip(); return; }
        canvas._cross = idx;
        Charts.candles(canvas, canvas._cdata.candles, canvas._cdata.opts);
        const c = candles[idx];
        const d = new Date(c.ts);
        const when = opts.interval === '1d'
          ? d.toLocaleDateString('fr-FR')
          : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const dec = c.close < 10 ? 4 : 2;
        tip.innerHTML = `<b>${Views.money(c.close, dec)}</b> · ${when}<br>` +
          `O ${Views.money(c.open, dec)} · H ${Views.money(c.high, dec)}<br>` +
          `B ${Views.money(c.low, dec)} · C ${Views.money(c.close, dec)}` +
          (c.volume ? `<br>Vol ${c.volume >= 1000 ? (c.volume / 1000).toFixed(1) + 'k' : Math.round(c.volume)}` : '');
        tip.style.display = 'block';
        const tw = tip.offsetWidth || 150;
        const xx = Math.min(Math.max(px - tw / 2, 4), rect.width - tw - 4);
        tip.style.left = xx + 'px';
        tip.style.top = '6px';
      };

      canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const v = currentView();
        if (pointers.size === 1) {
          panStart = { x: e.clientX, v0: v.v0, v1: v.v1, span: v.v1 - v.v0 };
        } else if (pointers.size === 2) {
          const pts = [...pointers.values()];
          pinchStart = { dist: Math.abs(pts[0].x - pts[1].x) || 1, span: v.v1 - v.v0 };
          panStart = null;
        }
      });
      canvas.addEventListener('pointermove', (e) => {
        if (pointers.has(e.pointerId)) {
          const rect = canvas.getBoundingClientRect();
          const cwLocal = Math.max(rect.width - padL - padR, 1);
          if (pointers.size === 1 && panStart) {
            const v = currentView();
            const df = ((e.clientX - panStart.x) / cwLocal) * panStart.span;
            v.v0 = panStart.v0 - df;
            v.v1 = panStart.v1 - df;
            Charts._clampView(v, n);
            commit();
          } else if (pointers.size === 2 && pinchStart) {
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const pts = [...pointers.values()];
            const dist = Math.abs(pts[0].x - pts[1].x) || 1;
            const v = currentView();
            const center = (v.v0 + v.v1) / 2;
            const span = Math.min(Math.max(pinchStart.span * (pinchStart.dist / dist), 15 / n), 1);
            v.v0 = center - span / 2;
            v.v1 = center + span / 2;
            Charts._clampView(v, n);
            commit();
          }
        } else {
          showAt(e.clientX);
        }
      });
      const endPointer = (e) => {
        pointers.delete(e.pointerId);
        if (pointers.size === 0) { panStart = null; pinchStart = null; }
        else if (pointers.size === 1) {
          const p = [...pointers.values()][0];
          const v = currentView();
          panStart = { x: p.x, v0: v.v0, v1: v.v1, span: v.v1 - v.v0 };
          pinchStart = null;
        }
      };
      canvas.addEventListener('pointerup', endPointer);
      canvas.addEventListener('pointercancel', endPointer);
      canvas.addEventListener('pointerleave', () => { if (pointers.size === 0) hideTip(); });
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const cwLocal = Math.max(rect.width - padL - padR, 1);
        const fx = Math.min(Math.max((e.clientX - rect.left - padL) / cwLocal, 0), 1);
        const v = currentView();
        const factor = e.deltaY > 0 ? 1.15 : 0.87;
        const center = v.v0 + fx * (v.v1 - v.v0);
        const span = Math.min(Math.max((v.v1 - v.v0) * factor, 15 / n), 1);
        v.v0 = center - fx * span;
        v.v1 = v.v0 + span;
        Charts._clampView(v, n);
        commit();
      }, { passive: false });
    }
  },

  _tooltip(canvas) {
    const wrap = canvas.parentElement;
    let tip = wrap.querySelector('.chart-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'chart-tip';
      wrap.appendChild(tip);
    }
    return tip;
  },

  line(canvas, values, opts = {}) {
    if (!canvas) return;
    canvas._redraw = () => Charts.line(canvas, values, opts);
    Charts._reg.add(canvas);
    if (!values || values.length < 2) return;
    const { ctx, w, h } = Charts.setupCanvas(canvas);
    const padL = 6, padR = 6, padT = 8, padB = 8;
    const cw = w - padL - padR, ch = h - padT - padB;
    let min = Math.min(...values), max = Math.max(...values);
    if (min === max) { min -= 1; max += 1; }
    const x = i => padL + (i / (values.length - 1)) * cw;
    const y = p => padT + ch - ((p - min) / (max - min)) * ch;
    ctx.clearRect(0, 0, w, h);
    const color = opts.color || Charts.css('--accent') || '#ff9e1b';
    const grad = ctx.createLinearGradient(0, padT, 0, padT + ch);
    grad.addColorStop(0, color + '55');
    grad.addColorStop(1, color + '00');
    ctx.beginPath();
    ctx.moveTo(x(0), y(values[0]));
    for (let i = 1; i < values.length; i++) ctx.lineTo(x(i), y(values[i]));
    ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.lineTo(x(values.length - 1), padT + ch); ctx.lineTo(x(0), padT + ch); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
  },

  panel(canvas, values, opts = {}) {
    if (!canvas) return;
    canvas._redraw = () => Charts.panel(canvas, values, opts);
    Charts._reg.add(canvas);
    if (!values || values.length < 2) return;
    const { ctx, w, h } = Charts.setupCanvas(canvas);
    const padL = 8, padR = 62, padT = 8, padB = 16;
    const cw = w - padL - padR, ch = h - padT - padB;
    const text = Charts.css('--muted') || '#8b96b5';
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = text; ctx.font = '10px sans-serif';
    ctx.fillText(opts.title || '', padL, 9);
    let min = Math.min(...values.filter(v => v !== null)), max = Math.max(...values.filter(v => v !== null));
    if (min === max) { min -= 1; max += 1; }
    const y = p => padT + 8 + ch - 8 - ((p - min) / (max - min)) * (ch - 8);
    const x = i => padL + (i / (values.length - 1)) * cw;
    ctx.strokeStyle = Charts.css('--border');
    if (opts.midline !== undefined) {
      const my = y(opts.midline);
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(padL, my); ctx.lineTo(padL + cw, my); ctx.stroke();
      ctx.setLineDash([]);
    }
    const group = opts.group;
    const i0 = group ? Math.floor(group.v0 * values.length) : 0;
    const i1 = group ? Math.ceil(group.v1 * values.length) : values.length;
    const xs = i => padL + ((i - i0) / Math.max(i1 - i0 - 1, 1)) * cw;
    ctx.strokeStyle = opts.color || Charts.css('--blue');
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (let i = Math.max(0, i0); i < Math.min(values.length, i1); i++) {
      if (values[i] === null || values[i] === undefined) continue;
      if (!started) { ctx.moveTo(xs(i), y(values[i])); started = true; }
      else ctx.lineTo(xs(i), y(values[i]));
    }
    ctx.stroke();
  },

  donut(canvas, items) {
    if (!canvas) return;
    canvas._redraw = () => Charts.donut(canvas, items);
    Charts._reg.add(canvas);
    if (!items || items.length === 0) return;
    const { ctx, w, h } = Charts.setupCanvas(canvas);
    const size = Math.min(w, h);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, r = size / 2 - 8;
    const total = items.reduce((a, b) => a + b.value, 0);
    if (total <= 0) return;
    let angle = -Math.PI / 2;
    const colors = ['#ff9e1b', '#4da3ff', '#2ecc71', '#ff5c5c', '#a78bfa', '#f472b6', '#34d399', '#fbbf24'];
    items.forEach((it, i) => {
      const slice = (it.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      angle += slice;
    });
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
    ctx.fillStyle = Charts.css('--card') || '#171f36';
    ctx.fill();
  }
};

function SMA(values, period) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}
