# BTP Manager V2

Version modulaire prête pour GitHub + Vercel.

## Fichiers
- index.html
- css/style.css
- js/config.js
- js/supabase.js
- js/auth.js
- js/ui.js
- js/app.js
- manifest.webmanifest
- service-worker.js
- vercel.json

## Déploiement Vercel
1. Créer un repository GitHub `btp-manager-v2`.
2. Envoyer tous les fichiers dans le repo.
3. Vercel → Add New Project → Import GitHub repo.
4. Framework: Other / Static.
5. Deploy.

## Supabase
Le projet utilise déjà:
- URL: https://kleefoouttyzzsjgopxm.supabase.co
- anon publishable key intégrée dans `js/config.js`

Ne jamais mettre la secret key dans le frontend.

## Important
Cette V2 utilise les tables existantes: projects, profiles, project_members, phases, phase_tasks, photos, documents, events, chat_rooms, chat_messages.
Si RLS bloque une action, corriger les policies Supabase, pas la clé.
