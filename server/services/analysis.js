function sma(values, period) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

function ema(values, period) {
  const out = [];
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    if (prev === null) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += values[j];
      prev = sum / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgG = gains / period, avgL = losses / period;
  const out = new Array(period).fill(null);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    out.push(avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL));
  }
  return { series: out, last: out[out.length - 1] };
}

function macd(closes, fast = 12, slow = 26, signalP = 9) {
  const emaFast = ema(closes, fast), emaSlow = ema(closes, slow);
  const line = closes.map((_, i) => (emaFast[i] !== null && emaSlow[i] !== null) ? emaFast[i] - emaSlow[i] : null);
  const valid = line.map(v => v === null ? 0 : v);
  const sigRaw = ema(valid, signalP);
  const signal = line.map((v, i) => v === null ? null : sigRaw[i]);
  const hist = line.map((v, i) => (v !== null && signal[i] !== null) ? v - signal[i] : null);
  return { line, signal, hist };
}

function analyzeCandles(candles) {
  const closes = candles.map(c => c.close);
  const last = closes[closes.length - 1];
  const sma20 = sma(closes, 20), sma50 = sma(closes, 50), sma200 = sma(closes, 200);
  const r = rsi(closes, 14);
  const m = macd(closes);
  const lastIdx = closes.length - 1;
  const s20 = sma20[lastIdx], s50 = sma50[lastIdx], s200 = sma200[lastIdx];
  const macdLast = m.line[lastIdx], macdSig = m.signal[lastIdx], macdHist = m.hist[lastIdx];
  const macdPrevHist = m.hist[lastIdx - 1];

  const signals = [];
  if (s20 !== null && s50 !== null) {
    signals.push(s20 > s50
      ? { name: 'Moyennes mobiles', value: 'SMA20 > SMA50', tone: 'bullish', text: 'La moyenne mobile courte est au-dessus de la longue : dynamique haussière à court terme.' }
      : { name: 'Moyennes mobiles', value: 'SMA20 < SMA50', tone: 'bearish', text: 'La moyenne mobile courte est sous la longue : pression baissière à court terme.' });
  }
  if (r.last !== null) {
    const rv = r.last;
    if (rv >= 70) signals.push({ name: 'RSI (14)', value: rv.toFixed(1), tone: 'bearish', text: 'RSI en zone de surachat (≥ 70) : risque de correction à court terme.' });
    else if (rv <= 30) signals.push({ name: 'RSI (14)', value: rv.toFixed(1), tone: 'bullish', text: 'RSI en zone de survente (≤ 30) : possible rebond à court terme.' });
    else signals.push({ name: 'RSI (14)', value: rv.toFixed(1), tone: 'neutral', text: 'RSI en zone neutre : pas de signal extrême.' });
  }
  if (macdHist !== null && macdPrevHist !== null) {
    if (macdPrevHist <= 0 && macdHist > 0) signals.push({ name: 'MACD', value: 'Croisement haussier', tone: 'bullish', text: 'Le MACD vient de croiser sa ligne de signal vers le haut : signal d\'achat potentiel.' });
    else if (macdPrevHist >= 0 && macdHist < 0) signals.push({ name: 'MACD', value: 'Croisement baissier', tone: 'bearish', text: 'Le MACD vient de croiser sa ligne de signal vers le bas : signal de vente potentiel.' });
    else signals.push({ name: 'MACD', value: macdHist > 0 ? 'Momentum positif' : 'Momentum négatif', tone: macdHist > 0 ? 'bullish' : 'bearish', text: macdHist > 0 ? 'Le MACD reste au-dessus de son signal : momentum haussier.' : 'Le MACD reste sous son signal : momentum baissier.' });
  }
  const rets = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const window = rets.slice(-30);
  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length;
  const dailyVol = Math.sqrt(variance);
  const annualVol = dailyVol * Math.sqrt(365) * 100;
  const change7 = closes.length > 7 ? (last / closes[closes.length - 8] - 1) * 100 : null;
  const change30 = closes.length > 30 ? (last / closes[closes.length - 31] - 1) * 100 : null;

  let bull = 0, bear = 0;
  for (const s of signals) { if (s.tone === 'bullish') bull++; if (s.tone === 'bearish') bear++; }
  let trend = 'neutre';
  if (bull > bear) trend = 'haussière'; else if (bear > bull) trend = 'baissière';
  if (s50 !== null && s200 !== null && s200 !== undefined) {
    if (s50 > s200 && trend === 'haussière') trend = 'haussière (tendance de fond positive)';
    if (s50 < s200 && trend === 'baissière') trend = 'baissière (tendance de fond négative)';
  }
  const riskScore = Math.min(100, Math.round(annualVol * 1.6 + (r.last !== null ? Math.abs(r.last - 50) * 0.3 : 0)));
  const riskLevel = riskScore < 30 ? 'faible' : riskScore < 60 ? 'modéré' : 'élevé';

  let advice;
  if (trend.startsWith('haussière') && riskLevel !== 'élevé') {
    advice = `La tendance est haussière avec un risque ${riskLevel}. Une stratégie prudente consiste à acheter par petites quantités (DCA) et à placer un stop-loss sous les supports récents.`;
  } else if (trend.startsWith('baissière')) {
    advice = `La tendance est baissière avec un risque ${riskLevel}. Mieux vaut attendre un retournement confirmé (croisement haussier du MACD, RSI qui remonte) avant d'acheter. Les vendeurs peuvent sécuriser leurs gains.`;
  } else {
    advice = `Le marché est neutre avec un risque ${riskLevel}. Attendre une cassure claire de range avant de prendre position. Rappel : argent 100% fictif, à but pédagogique.`;
  }

  return {
    price: last,
    indicators: {
      sma20: s20, sma50: s50, sma200: s200,
      rsi: r.last, rsi_series: r.series,
      macd: { line: macdLast, signal: macdSig, hist: macdHist, series: m },
      volatility_annual_percent: annualVol
    },
    changes: { d7: change7, d30: change30 },
    signals,
    trend,
    risk: { score: riskScore, level: riskLevel },
    advice,
    generated_at: Date.now()
  };
}

module.exports = { sma, ema, rsi, macd, analyzeCandles };
