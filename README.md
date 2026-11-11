# Bizora Digital

Plateforme de gestion pour commerces et restaurants : produits et stock, ventes, commandes, rapports, comptes employés et suivi des caméras. Interface en arabe (RTL) avec 5 autres langues.

## Architecture

| Partie | Fichiers | Rôle |
| --- | --- | --- |
| Front statique (PWA) | `index.html`, `app.js`, `locale.js`, `style.css`, `sw.js` | Application, hébergée sur GitHub Pages |
| Pages publiques | `about.html`, `privacy.html`, `terms.html` | Informations légales |
| Backend | Supabase (Auth, PostgreSQL + RLS) | Données et authentification |
| Edge Function `bizora-access` | `supabase/functions/bizora-access` | Connexion par code propriétaire, gestion des employés |
| Edge Function `camera-gateway` | `supabase/functions/camera-gateway` | Inscription et heartbeat des passerelles caméras |
| Passerelle locale | `camera-gateway/` | Agent Python qui vérifie les flux RTSP (voir son README) |
| Application Android | `capacitor.config.json`, `.github/workflows/build-android.yml` | APK de debug construit par GitHub Actions |

## Lancer le front en local

Ouvrir `index.html` via un serveur local (par exemple `python3 -m http.server`). L'URL du projet Supabase et la clé publishable sont dans `app.js` : cette clé est faite pour le navigateur et ne protège rien sans les règles RLS.

## Déployer le backend

```bash
supabase link --project-ref <ref>
supabase db push                                  # applique supabase/migrations
supabase functions deploy bizora-access
supabase functions deploy camera-gateway
supabase secrets set BIZORA_HASH_PEPPER=<longue valeur aléatoire>
```

Notes :

- Les migrations de ce dépôt supposent que le schéma de base existe déjà (`organizations`, `memberships`, `products`, `orders`, `sales`, `cameras`, `bizora_private.has_role`, etc.). Ce schéma n'est pas encore versionné ici : exportez-le avec `supabase db dump` avant de pouvoir recréer la base.
- `BIZORA_HASH_PEPPER` sert à hacher les codes propriétaire et les adresses IP. Sans ce secret, la clé de service est utilisée. **Changer ce secret invalide tous les codes propriétaire existants** ; chaque propriétaire devra utiliser « Code oublié » pour en obtenir un nouveau.
- La fonction `send-sales-test-report` est appelée par l'interface mais n'est pas encore dans ce dépôt.
- Dans Supabase Authentication, configurez l'URL du site de production.

## Construire l'application Android

Le workflow `Build BIZORA AI Android APK` se lance à chaque modification des fichiers de l'application, ou manuellement (`workflow_dispatch`). Il produit un APK de debug téléchargeable pendant 14 jours. Pour une publication, il faudra une signature de release.

En local : `npm install && npm run build && npx cap add android && npx cap sync android`.

## Sécurité

- Ne jamais mettre de clé `service_role` ni de mot de passe de caméra dans le code du navigateur ou dans Git.
- Vérifier les politiques RLS et tester chaque parcours avant d'utiliser des données réelles.
- Le streaming vidéo n'existe pas : la passerelle vérifie seulement que les caméras répondent. Le comptage de personnes et la détection ne sont pas implémentés.
