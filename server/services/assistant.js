const { analyzeCandles } = require('./analysis');
const { db } = require('../db');

const HELP_TEXT = `Je suis l'assistant pédagogique Buxcoin 🤖 (argent 100% fictif). Je peux :
• « analyse BTC » ou « analyse Apple » — analyse technique complète d'un actif
• « mon portefeuille » — résumé de vos positions
• « qu'est-ce que le RSI ? » / « le MACD ? » / « un ordre limit ? » / « un stop-loss ? »
• « comment acheter ? » / « comment vendre ? »
• « risque » — explication de la gestion du risque
• « aide » — revoir cette liste`;

const GLOSSARY = {
  rsi: `Le RSI (Relative Strength Index, 14 périodes) mesure la force d'un mouvement entre 0 et 100. Au-dessus de 70 : surachat (risque de correction). En dessous de 30 : survente (rebond possible). Entre 30 et 70 : zone neutre.`,
  macd: `Le MACD compare deux moyennes mobiles exponentielles (12 et 26 périodes). Quand la ligne MACD croise sa ligne de signal vers le haut, c'est un signal d'achat potentiel ; vers le bas, un signal de vente. L'histogramme visualise ce momentum.`,
  sma: `Une moyenne mobile (SMA/EMA) lisse le cours sur N périodes. SMA20 > SMA50 indique une dynamique haussière court terme. Le croisement SMA50/SMA200 (« golden cross / death cross ») marque les grandes tendances.`,
  'ordre limit': `Un ordre Limit s'exécute uniquement si le prix atteint le niveau choisi : achat au prix indiqué ou moins cher, vente au prix indiqué ou plus cher. Il permet d'attendre le bon prix sans surveiller le marché.`,
  'stop-loss': `Un Stop-Loss est un ordre de vente automatique déclenché quand le prix descend sous un seuil. Il limite les pertes d'une position. Exemple : achat à 100 $, stop-loss à 90 $ = perte maximale acceptée de ~10%.`,
  'ordre market': `Un ordre Market (au marché) s'exécute immédiatement au prix actuel. Simple et rapide, mais vous ne contrôlez pas le prix exact d'exécution.`,
  risque: `Gestion du risque : 1) ne jamais tout investir sur un seul actif (diversification) ; 2) utiliser des stop-loss ; 3) n'investir que ce que l'on peut perdre — ici c'est fictif, profitez-en pour tester ; 4) le DCA (achats réguliers) réduit le risque de mauvais timing.`,
  dca: `Le DCA (Dollar Cost Averaging) consiste à acheter régulièrement le même montant, quel que soit le prix. Cela lisse le prix d'entrée moyen et réduit le risque de tout acheter au plus haut.`,
  diversification: `La diversification consiste à répartir son portefeuille entre plusieurs actifs (crypto, actions, or) pour réduire l'impact d'une chute isolée. Buxcoin permet de simuler cela gratuitement.`,
  frais: `Buxcoin applique des frais de simulation (0,2% par défaut, modifiables par l'administration). Ils reproduisent les frais réels des plateformes de trading.`,
  buxcoin: `Buxcoin est un simulateur de trading pédagogique. Tous les prix peuvent s'appuyer sur des cours réels, mais l'argent est 100% fictif : aucun argent bancaire n'est engagé, aucun retrait n'est possible.`
};

function findAsset(text) {
  const lower = text.toLowerCase();
  const aliases = {
    bitcoin: 'BTC', btc: 'BTC', eth: 'ETH', ethereum: 'ETH', sol: 'SOL', solana: 'SOL',
    bnb: 'BNB', aapl: 'AAPL', apple: 'AAPL', msft: 'MSFT', microsoft: 'MSFT',
    nvda: 'NVDA', nvidia: 'NVDA', tsla: 'TSLA', tesla: 'TSLA', amzn: 'AMZN', amazon: 'AMZN',
    or: 'XAU', gold: 'XAU', xau: 'XAU'
  };
  for (const [k, sym] of Object.entries(aliases)) {
    if (lower.includes(k)) return db.prepare('SELECT * FROM assets WHERE symbol = ?').get(sym);
  }
  return null;
}

function buildAnalysisReply(asset) {
  const candles = db.prepare("SELECT ts, open, high, low, close FROM candles WHERE asset_id = ? AND interval = '1h' ORDER BY ts DESC LIMIT 300").all(asset.id).reverse();
  const a = analyzeCandles(candles.length >= 30 ? candles : [{ ts: Date.now(), open: asset.price, high: asset.price, low: asset.price, close: asset.price }]);
  const fmt = (v) => v === null || v === undefined ? 'n/d' : (typeof v === 'number' ? v.toFixed(2) : v);
  const lines = [
    `📊 **Analyse ${asset.name} (${asset.symbol})** — prix actuel : ${asset.price.toFixed(2)} $ (fictif)`,
    `Tendance détectée : **${a.trend}** · Risque : **${a.risk.level}** (score ${a.risk.score}/100)`,
    `RSI(14) : ${fmt(a.indicators.rsi)} · SMA20 : ${fmt(a.indicators.sma20)} · SMA50 : ${fmt(a.indicators.sma50)} · MACD : ${fmt(a.indicators.macd.line)}`,
    `Variations : 7j ${a.changes.d7 !== null ? a.changes.d7.toFixed(1) + '%' : 'n/d'} · 30j ${a.changes.d30 !== null ? a.changes.d30.toFixed(1) + '%' : 'n/d'} · Volatilité annualisée ≈ ${a.indicators.volatility_annual_percent.toFixed(0)}%`,
    '',
    '**Signaux techniques :**',
    ...a.signals.map(s => `• [${s.tone === 'bullish' ? '🟢' : s.tone === 'bearish' ? '🔴' : '⚪'}] ${s.name} (${s.value}) — ${s.text}`),
    '',
    `💡 **Ce que vous pourriez faire :** ${a.advice}`
  ];
  return lines.join('\n');
}

function buildPortfolioReply(userId) {
  const rows = db.prepare(`
    SELECT h.qty, h.avg_price, a.symbol, a.name, a.price
    FROM holdings h JOIN assets a ON a.id = h.asset_id
    WHERE h.user_id = ? AND h.qty > 1e-9`).all(userId);
  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
  let invested = 0, cost = 0;
  for (const r of rows) { invested += r.qty * r.price; cost += r.qty * r.avg_price; }
  const pnl = invested - cost;
  const lines = [
    `💼 **Votre portefeuille (virtuel)**`,
    `Cash : ${user.balance.toFixed(2)} $ · Investi : ${invested.toFixed(2)} $ · Total : ${(user.balance + invested).toFixed(2)} $`,
    `P&L latente : ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} $`
  ];
  if (rows.length === 0) lines.push('Aucune position ouverte. Rendez-vous sur Marchés pour passer votre premier ordre simulé !');
  else for (const r of rows) {
    const p = ((r.price - r.avg_price) / r.avg_price) * 100;
    lines.push(`• ${r.symbol} : ${r.qty} @ ${r.avg_price.toFixed(2)}$ → ${r.price.toFixed(2)}$ (${p >= 0 ? '+' : ''}${p.toFixed(1)}%)`);
  }
  return lines.join('\n');
}

function reply(message, userId) {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  if (!text) return { text: HELP_TEXT };
  if (/^(aide|help|bonjour|salut|hello|coucou)\b/.test(lower)) return { text: HELP_TEXT };
  if (/(portefeuille|portfolio|mes positions|mon solde|balance)/.test(lower)) {
    return { text: buildPortfolioReply(userId) };
  }
  const asset = findAsset(text);
  if (asset && /(analys|tendanc|signal|rsi|macd|graph|conseil|avis|risque|acheter|vendre)/.test(lower)) {
    return { text: buildAnalysisReply(asset), analysis: true };
  }
  if (asset && lower.length < 30) return { text: buildAnalysisReply(asset), analysis: true };
  for (const [key, answer] of Object.entries(GLOSSARY)) {
    if (lower.includes(key)) return { text: answer };
  }
  if (/(acheter|achat|buy)/.test(lower)) {
    return { text: `Pour acheter : ouvrez un actif dans **Marchés**, choisissez « Achat », le type d'ordre (Market = immédiat, Limit = à un prix cible), la quantité, puis validez. Tout est fictif — vous pouvez tester sans risque. Astuce : commencez par de petites quantités et observez le RSI et le MACD.` };
  }
  if (/(vendre|vente|sell)/.test(lower)) {
    return { text: `Pour vendre : ouvrez un actif que vous détenez, choisissez « Vente » et la quantité. Un ordre **Stop-Loss** vend automatiquement si le prix tombe sous votre seuil — idéal pour limiter les pertes.` };
  }
  if (/(notif|alerte)/.test(lower)) {
    return { text: `Activez les notifications dans **Paramètres** : Buxcoin vous préviendra à l'exécution d'un ordre ou lors d'événements importants (installée comme application, la notification apparaît même onglet fermé).` };
  }
  if (/(réel|vrai argent|banque|déposer|retirer|withdraw|deposit)/.test(lower)) {
    return { text: `Buxcoin est et restera un **simulateur** : les cours peuvent suivre les marchés réels, mais l'argent est 100% fictif. Aucun dépôt bancaire, aucun paiement, aucun retrait n'est possible.` };
  }
  return {
    text: `Je n'ai pas bien compris 🤔.\n\n${HELP_TEXT}`
  };
}

module.exports = { reply, buildAnalysisReply, buildPortfolioReply, HELP_TEXT };
