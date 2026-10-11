# FINAL_AUDIT — état réel page par page

Audit du 11 oct 2026, mis à jour après le branchement du LLM et l'enregistrement de données
réelles. Chaque ligne a été vérifiée par lecture du code **et** appel réel au backend. Les points
marqués `[non vérifié]` n'ont pas pu être confirmés.

Vérification automatisée : `./scripts/audit-api.sh` → **17/17 endpoints PASS**.
Tests unitaires : **43/43**. `tsc --noEmit` et `npm run build` : propres.

## Ce qui a changé cette nuit

| Avant | Après |
|---|---|
| Aucun LLM : routage par regex, `MockLlmClient` codé en dur | LLM réel (`server/agent/llm.ts`) pour le routage + la formulation ; `OpenAiLlmClient` pour la partie B ; repli déterministe explicite |
| Chat inventait une réponse sans clé | Sans clé : dit « indisponible » et ne devine rien. Actions rapides déterministes toujours opérationnelles |
| `/api/agent/chat` ouvert sans limite | Rate limit 10/min/IP + plafond 120k tokens/jour |
| `proposeSettingsChange` **écrivait** les réglages puis annulait | `previewPreset()` : calcul pur, aucune écriture. Test de non-régression ajouté |
| Prix du fixture écrits à la main | `scripts/record-snapshot.ts` : 40 paires enregistrées depuis l'API Binance réelle, vraies adresses |
| Tests couplés au fixture de démo | Fixture de test séparé (`AGENT_SNAPSHOT_PATH`) |
| Audit token : payload brut ignoré | Règle `hasResult && isSupported` appliquée, trois issues distinctes (pass / fail / inconnu) |
| Fraîcheur du prix sautée si référence absente | Contrôle de fraîcheur désormais indépendant |
| Kill switch seulement dans Réglages | Présent dans l'en-tête de **toutes** les pages |

## Tableau page par page

| Page | Réel | Codé en dur / mock | Manque encore |
|---|---|---|---|
| **Dashboard** | Heatmap sur 40 tickers, prix et adresses réels enregistrés. Aucun chiffre littéral dans le front (vérifié par `grep`). | — | Horodatage par ligne, badge « périmé », prime **par émetteur**, tri/recherche, panneau latéral. |
| **Agent** | LLM réel pour router + formuler ; tous les chiffres calculés en code ; `checks[]` avec valeur, seuil et source ; actions rapides sans modèle ; provenance affichée par réponse. | — | Journalisation des décisions de chat dans un fichier dédié (T3). |
| **Portfolio** | Suggestions issues de `runAgentCycle` avec vrais garde-fous. | `/api/portfolio` renvoie `holdings: []` en dur. | Portefeuille simulé persistant alimenté par les confirmations. |
| **Alerts** | CRUD réel persisté, bouton Test fonctionnel. | — | **Aucun planificateur** : une alerte ne se déclenche jamais seule. |
| **Plans** | CRUD réel persisté, « Run now » exécute un cycle. | Contraintes du formulaire en dur. | **Aucun planificateur** : un plan actif ne tourne pas seul. |
| **Opportunities** | Dit honnêtement son indisponibilité, marquée *experimental* dans la navigation. | `newsEnabled: false` en dur. | Toute la fonctionnalité (P2). |
| **Settings** | Entièrement réel : disque, presets, historique, kill switch. L'agent ne peut plus écrire. | — | — |
| **Activity** | Journal réel persisté. | — | Filtres. |
| **Skills** | Vrais appels HTTP avec latences. 3/4 skills OK. | — | `query-token-info` → HTTP 404 (non corrigé). |

## Blocages restants, par gravité

1. **Clé OpenAI absente** (`OPENAI_API_KEY=` vide localement). Le code est branché et testé sur son
   chemin d'erreur (401 → message clair, aucune invention), mais **le chemin nominal n'a jamais été
   exécuté** faute de clé. `[non vérifié]` : qualité réelle du routage et de la formulation.
   Une clé valide côté Render suffit — c'est le backend déployé qui appelle.
2. **Référence indépendante inactive.** Double verrou toujours en place : clés Alpaca/Finnhub
   absentes **et** `config/universe.json` vide. Conséquence visible : les primes s'affichent
   « no reference source configured ». `/api/health` expose maintenant
   `sources.independentReferenceActive` pour que ce soit vérifiable sans lire le code.
3. **Pas de planificateur** pour alertes et plans : créés et persistés, jamais évalués en fond.
4. **`query-token-info` renvoie 404.**
5. **Pas de journaux DX structurés** (T3 non fait) : `logs/api-journal.jsonl`,
   `agent-decisions.jsonl`, `anomalies.jsonl` n'existent pas. Les faits bruts ont été consignés
   manuellement dans `docs/dx-report-notes.md`.

## Trouvailles vérifiées empiriquement

- **`query-token-audit` ne couvre pas les actions tokenisées** : `hasResult: false` sur de vraies
  adresses RWA, verdict complet sur USDT. Détail dans `docs/dx-report-notes.md`.
- **`statusInfo.openState` n'est pas l'état de séance** : samedi, 77/488 tokens échangeables alors
  que la séance US est fermée. `marketStatus` est `null` sur tout bStock.
- **Le filtre `platform` de `/rwa/tokens` est ignoré** : même payload de 488 tokens quelle que soit
  la valeur ; filtrage à faire sur `platformId`.
- **`tokenToShareRatio` diffère par émetteur** (SPYon 1.0095 vs SPYB 1.0017) : comparer les
  `tokenPrice` bruts fabrique un écart inexistant.
