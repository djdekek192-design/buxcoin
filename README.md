# Buxcoin — Simulateur de trading (argent 100 % fictif)

Buxcoin est une plateforme web **professionnelle et installable** (PWA) de **simulation de trading**.
Règle fondamentale : **Buxcoin reste un simulateur avec de l'argent fictif.** Les cours réels peuvent
alimenter les simulations, mais **aucun argent bancaire n'est engagé**, aucun dépôt ni retrait n'est possible.

## Fonctionnalités

### Comptes & sécurité
- Inscription simplifiée, connexion fiable, déconnexion, récupération de mot de passe.
- Mots de passe hachés avec **scrypt** (sel unique), jetons de session signés **HMAC-SHA256** (type JWT) avec expiration.
- Comptes accessibles sur plusieurs appareils (sessions par appareil, révocation globale possible).
- Permissions **réellement contrôlées par le serveur** sur chaque route (rôles `user` / `admin` / `owner`).
- En-têtes de sécurité (CSP stricte, anti-clickjacking, anti-sniffing), limitation de débit, validation stricte des entrées, requêtes SQL paramétrées.
- Sauvegardes automatiques de la base toutes les 6 h (`data/backups/`, 14 conservées).

### Statut propriétaire — attribution sécurisée
**Le premier compte créé ne devient JAMAIS propriétaire.** Le statut `owner` est attribué uniquement :
1. au premier démarrage sans propriétaire, le serveur génère un **jeton de configuration** (stocké haché en base,
   fichier `data/OWNER_SETUP_TOKEN.txt` en permissions 0600) ;
2. vous créez le compte propriétaire via l'écran « Configuration du propriétaire » du site, **ou** en ligne de commande :
   ```bash
   npm run setup-owner
   ```
3. le jeton est consumé et le fichier supprimé après usage. Il expire au bout de 24 h.

### Marchés (temps réel)
- Cryptomonnaies : **Bitcoin, Ethereum, Solana, BNB** — Actions : **Apple, Microsoft, NVIDIA, Tesla, Amazon** — **Or**.
- Prix actualisés automatiquement (tick toutes les 15 s). Si l'API de cours réels (CoinGecko / Stooq) est joignable,
  les prix simulés s'ancrent sur les cours réels ; sinon la simulation locale prend le relais (aucune interruption).
- Historique de cours complet (bougies 5 min / 1 h / 1 jour, 500 bougies par intervalle).
- Calendrier des marchés (taux directeurs, résultats trimestriels, événements crypto) — éditable par l'administration.

### Trading & portefeuille
- Achats/ventes **fictifs**, frais de simulation paramétrables (0,2 % par défaut).
- Ordres **Market** (immédiat), **Limit** (à un prix cible) et **Stop-Loss** (vente automatique sous un seuil),
  exécutés par le moteur à chaque tick de prix.
- Portefeuille : positions, prix moyen (PRU), P&L latent, allocation graphique, statistiques de performance (taux de réussite, volume…).
- Historique complet des transactions et des ordres, liste de suivi (watchlist), notifications.

### Analyse technique & IA
- Graphiques en **chandeliers japonais** (canvas, sans dépendance) avec moyennes mobiles SMA 20/50.
- **RSI (14)**, **MACD (12, 26, 9)**, volatilité annualisée, variations 7 j / 30 j.
- Signaux techniques simulés avec explications, tendance détectée, score de risque 0-100 et conseils pédagogiques.
- **Assistant conversationnel** pédagogique (réponses prédéfinies + analyses à la demande : « analyse BTC », « mon portefeuille »…).

### Application installable (V7)
- **PWA** : installable sur **iPhone, Android et ordinateur** (écran d'accueil / icône d'installation).
- Notifications (ordres exécutés, mouvements administrateur) même onglet fermé, via Service Worker.
- Thème sombre/clair, interface responsive (barre de navigation mobile), mode hors-ligne partiel (coquille en cache).
- Sauvegardes et sécurité renforcées (voir ci-dessus).

### Administration privée
| Action | Admin | Propriétaire |
|---|---|---|
| Ajouter / retirer de l'argent fictif | ✅ | ✅ |
| Consulter les utilisateurs (+ détail, portefeuille, transactions) | ✅ | ✅ |
| Bloquer / débloquer un utilisateur | ✅ | ✅ |
| Créer des administrateurs | ❌ | ✅ |
| Révoquer les permissions (retrograder un admin) | ❌ | ✅ |
| Supprimer un compte | ❌ | ✅ |
| Modifier les paramètres globaux (frais, solde de départ, inscriptions, message…) | ❌ | ✅ |
| Gérer le calendrier des marchés | ✅ | ✅ |

Le propriétaire ne peut pas être bloqué ni supprimé via l'interface d'administration.

## Démarrage

Prérequis : **Node.js ≥ 22.5** (SQLite intégré, aucune base externe à installer).

```bash
npm install
npm start          # http://localhost:3000
```

Au premier démarrage sans propriétaire, le serveur affiche le chemin du jeton de configuration
(`data/OWNER_SETUP_TOKEN.txt`) : ouvrez le site et suivez l'écran de configuration, ou lancez `npm run setup-owner`.

### Variables d'environnement (optionnelles)

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port d'écoute |
| `BUX_DATA_DIR` | `./data` | Répertoire des données (base, clés, sauvegardes) |
| `START_BALANCE` | `10000` | Solde virtuel de départ |
| `PRICE_TICK_MS` | `15000` | Intervalle d'actualisation des prix |
| `REAL_PRICES` | `1` | `0` pour désactiver la récupération de cours réels |
| `TOKEN_TTL` | `1209600` | Durée de vie des sessions (secondes) |
| `RESET_DELIVERY` | `display` | `smtp` en production (jetons alors journalisés côté serveur) |
| `CORS_ORIGIN` | *(vide)* | Origine autorisée si l'API est exposée séparément |

Derrière un reverse-proxy HTTPS (recommandé en production), activez la compression et terminez TLS côté proxy.

## Structure

```
server/          API Express, base SQLite intégrée (node:sqlite), moteur de prix, moteur d'ordres, IA d'analyse
  routes/        auth, setup (propriétaire), markets, trading, ai, admin
  services/      prices (temps réel + simulation), engine (ordres), analysis (RSI/MACD/SMA), assistant
  middleware/    authentification & rôles
public/          PWA (HTML/CSS/JS sans framework, graphiques canvas, manifest, service worker)
scripts/         setup-owner (CLI), gen-icons, smoke-test
data/            base SQLite, clés, jeton de configuration, sauvegardes (créé au démarrage)
```

## Avertissement

Buxcoin est un **outil pédagogique de simulation**. Les cours peuvent s'appuyer sur des données réelles mais
toutes les transactions utilisent de l'argent **fictif**. Rien ne constitue un conseil en investissement.
