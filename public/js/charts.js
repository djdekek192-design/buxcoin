const Charts = {
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

  candles(canvas, candles, opts = {}) {
    if (!canvas || candles.length === 0) return;
    const { ctx, w, h } = Charts.setupCanvas(canvas);
    const padL = 8, padR = 62, padT = 10, padB = 22;
    const cw = w - padL - padR, ch = h - padT - padB;
    const text = Charts.css('--muted') || '#8b96b5';
    const border = Charts.css('--border') || '#26304f';
    const greens = Charts.css('--green') || '#2ecc71';
    const reds = Charts.css('--red') || '#ff5c5c';
    const accent = Charts.css('--accent') || '#ff9e1b';

    let min = Infinity, max = -Infinity;
    for (const c of candles) { min = Math.min(min, c.low); max = Math.max(max, c.high); }
    const pad = (max - min) * 0.05 || max * 0.01;
    min -= pad; max += pad;
    const y = p => padT + ch - ((p - min) / (max - min)) * ch;
    const step = cw / candles.length;
    const bw = Math.max(1.5, Math.min(step * 0.65, 14));

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = border; ctx.fillStyle = text; ctx.font = '10px sans-serif'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const p = min + ((max - min) / 4) * i;
      const yy = y(p);
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + cw, yy); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(p >= 1000 ? (p / 1000).toFixed(1) + 'k' : p.toFixed(p < 10 ? 3 : 1), padL + cw + 6, yy + 3);
    }

    if (opts.sma) {
      for (const [period, color] of opts.sma) {
        const closes = candles.map(c => c.close);
        const vals = SMA(closes, period);
        ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.beginPath();
        let started = false;
        for (let i = 0; i < vals.length; i++) {
          if (vals[i] === null) continue;
          const xx = padL + i * step + step / 2;
          if (!started) { ctx.moveTo(xx, y(vals[i])); started = true; }
          else ctx.lineTo(xx, y(vals[i]));
        }
        ctx.stroke();
      }
    }

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const xx = padL + i * step + step / 2;
      const up = c.close >= c.open;
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

    if (opts.crosshair !== undefined && opts.crosshair >= 0 && opts.crosshair < candles.length) {
      const xx = padL + opts.crosshair * step + step / 2;
      ctx.strokeStyle = accent; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(xx, padT); ctx.lineTo(xx, padT + ch); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (opts.onHover) {
      canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const i = Math.floor((e.clientX - rect.left - padL) / step);
        opts.onHover(i >= 0 && i < candles.length ? i : -1);
      };
      canvas.onmouseleave = () => opts.onHover(-1);
    }
  },

  line(canvas, values, opts = {}) {
    if (!canvas || values.length < 2) return;
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
    if (!canvas || values.length < 2) return;
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
    ctx.strokeStyle = opts.color || Charts.css('--blue');
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < values.length; i++) {
      if (values[i] === null || values[i] === undefined) continue;
      if (!started) { ctx.moveTo(x(i), y(values[i])); started = true; }
      else ctx.lineTo(x(i), y(values[i]));
    }
    ctx.stroke();
  },

  donut(canvas, items) {
    if (!canvas || items.length === 0) return;
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
