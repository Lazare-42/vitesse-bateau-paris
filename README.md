# Vitesse Bateau Paris

Suivi en temps réel des excès de vitesse sur la Seine dans Paris à partir des données AIS publiques.

Site en ligne : [vitessebateauparis.com](https://vitessebateauparis.com)

## Pourquoi

La vitesse maximale autorisée sur la Seine dans la traversée de Paris est de **12 km/h (6,5 nœuds)**, fixée par l'[arrêté du 22 novembre 1993](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000363059/) (règlement particulier de police de la navigation sur le réseau fluvial de la ville de Paris, article 12). Cette limite protège les berges, les ouvrages d'art et les autres usagers de la voie d'eau — notamment les péniches-logements amarrées.

Ce site agrège les positions transmises par les transpondeurs AIS des bateaux circulant dans la zone et publie des statistiques factuelles : excès de vitesse récents, classement des records, page « habitués », carte interactive.

Ce n'est pas un constat au sens légal : seuls les services de la navigation fluviale (VNF) sont habilités à verbaliser.

## Méthodologie

- **Source des données** : flux WebSocket gratuit [aisstream.io](https://aisstream.io), filtré sur la zone Paris (de Issy-les-Moulineaux à La Villette environ).
- **Aucun filtrage par type de bâtiment** : commerce, bateaux-mouches, vedettes de service (douanes, police fluviale, pompiers, VNF), plaisance, péniches-logements en déplacement. La règle est la même pour tout le monde.
- **Filtre anti-bruit** : seuls les excès maintenus au moins **30 secondes consécutives** sont comptabilisés, pour écarter les sauts de signal GPS sous les ponts.
- **Définition d'un excès** : segment continu pendant lequel la vitesse dépasse la limite, du premier ping en excès jusqu'au retour sous la limite (ou jusqu'à une absence de signal supérieure à deux minutes).

Plus de détails sur la page [« À propos »](https://vitessebateauparis.com/a-propos) du site.

## Architecture

- **Backend** : Go. Reçoit le flux AIS via WebSocket, détecte les excès, persiste positions et excès dans PostgreSQL, expose une API JSON.
- **Frontend** : Next.js 15 (app router), rendu côté serveur, rafraîchi toutes les 30 secondes.
- **Base de données** : PostgreSQL 17.

```
cmd/vitesse/        # entrée du backend
internal/ais/       # client WebSocket aisstream.io
internal/api/       # serveur HTTP (chi)
internal/store/     # accès PostgreSQL + détection des excès
frontend/           # application Next.js
```

## Lancer en local

Prérequis : Go 1.22+, Node.js 20+, PostgreSQL 17, une clé API [aisstream.io](https://aisstream.io) (gratuite).

```bash
# 1. Base de données (via Docker pour faire simple)
docker compose up -d postgres

# 2. Configuration
cp config.example.toml config.toml
# Éditer config.toml : ajouter la clé AIS

# 3. Backend
make build
./vitesse -config config.toml

# 4. Frontend (autre terminal)
cd frontend
npm install
npm run dev
# → http://localhost:3100
```

L'API backend écoute sur le port 8092 par défaut (voir `config.toml`), le frontend sur 3100. Le frontend proxifie `/api/*` vers le backend via la réécriture de `next.config.ts`.

### Commandes utiles

```bash
make build          # compile le binaire ./vitesse
make test           # tests Go
make fmt            # go fmt ./...
make lint           # golangci-lint run
make docker-up      # postgres + backend en docker (dev local uniquement)
```

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/stats` | Statistiques globales (total, moyennes, excès par jour). |
| `GET /api/offenders?limit=N` | Classement des bateaux par excès cumulé. |
| `GET /api/offenders/{mmsi}` | Détail d'un bateau et ses excès. |
| `GET /api/infractions?limit=N&since_hours=H` | Liste des excès récents. |
| `GET /api/infractions/{id}` | Un excès précis (pour les liens depuis le classement). |
| `GET /api/fastest?limit=N` | Records de vitesse maximale, un par bateau. |

Tous les endpoints renvoient du JSON. Le filtre des 30 secondes est appliqué côté base de données à toutes les requêtes publiques.

## Déploiement

Le déploiement en production utilise des unités systemd utilisateur (pas Docker, malgré la présence de `docker-compose.yml` qui sert uniquement au développement local). Voir [`AGENTS.md`](./AGENTS.md) pour le détail de la procédure de mise à jour.

## Contribuer

Les contributions sont les bienvenues : corrections, ajouts, signalements de données aberrantes (avec captures, MMSI et horodatages, idéalement), idées d'analyses supplémentaires. Ouvrir une issue ou une pull request.

## Licence

[MIT](./LICENSE).
