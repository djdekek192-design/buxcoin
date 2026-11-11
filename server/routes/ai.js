const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getAssetBySymbol } = require('../services/prices');
const { reply } = require('../services/assistant');

const router = express.Router();

router.post('/chat', requireAuth, (req, res) => {
  const message = req.body && req.body.message;
  if (typeof message !== 'string' || message.length > 2000) {
    return res.status(400).json({ error: 'Message invalide.' });
  }
  const answer = reply(message, req.user.id);
  res.json({ reply: answer.text });
});

router.get('/market-overview', requireAuth, (req, res) => {
  const assets = db.prepare('SELECT * FROM assets WHERE active = 1').all();
  const overview = assets.map(a => {
    const candles = db.prepare("SELECT close FROM candles WHERE asset_id = ? AND interval = '1h' ORDER BY ts DESC LIMIT 50").all(a.id).reverse();
    const closes = candles.length >= 30 ? candles.map(c => c.close) : [a.price, a.price];
    const analysis = require('../services/analysis').analyzeCandles(
      db.prepare("SELECT ts, open, high, low, close FROM candles WHERE asset_id = ? AND interval = '1h' ORDER BY ts DESC LIMIT 120").all(a.id).reverse()
    );
    return {
      symbol: a.symbol, name: a.name, kind: a.kind, price: a.price,
      trend: analysis.trend, risk_level: analysis.risk.level, risk_score: analysis.risk.score,
      rsi: analysis.indicators.rsi
    };
  });
  const bullish = overview.filter(a => String(a.trend).startsWith('haussière')).length;
  const bearish = overview.filter(a => String(a.trend).startsWith('baissière')).length;
  res.json({
    sentiment: { bullish, bearish, neutral: overview.length - bullish - bearish },
    assets: overview
  });
});

module.exports = router;
