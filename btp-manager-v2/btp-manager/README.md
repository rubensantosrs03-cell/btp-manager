# BTP Manager

Plateforme interne de gestion de chantiers de construction.

## Structure du projet

```
btp-manager/
├── index.html          ← Point d'entrée unique
├── css/
│   └── style.css       ← Tous les styles
├── js/
│   ├── supabase.js     ← Client Supabase + helpers Storage
│   └── app.js          ← Toute la logique applicative
├── assets/             ← Icônes, images statiques
├── vercel.json         ← Configuration Vercel
└── README.md
```

## ⚠️ Cause du problème CSS (page blanche/non stylée)

Le problème constaté (page sans style) venait de **deux causes** :

1. **`vercel.json` avait un bloc `"builds"` incorrect** qui empêchait Vercel de servir les fichiers CSS et JS.
2. **Le SDK Supabase n'était pas chargé** avant `supabase.js`, causant une erreur JS silencieuse.

Ces deux problèmes sont maintenant corrigés.

---

## Déploiement sur Vercel (étapes exactes)

### 1. Préparer le dépôt GitHub

```bash
# Dans votre dossier btp-manager-v2
git init
git add .
git commit -m "BTP Manager v2 - production ready"
git remote add origin https://github.com/VOTRE-USER/btp-manager.git
git push -u origin main
```

### 2. Connecter à Vercel

1. Aller sur [vercel.com](https://vercel.com)
2. **New Project** → Import depuis GitHub → sélectionner `btp-manager`
3. **Framework Preset** : choisir **"Other"** (pas Next.js, pas Vite)
4. **Root Directory** : laisser vide (ou `.`)
5. **Build & Output Settings** :
   - Build Command : **(laisser vide)**
   - Output Directory : **(laisser vide)**
   - Install Command : **(laisser vide)**
6. Cliquer **Deploy**

> ✅ Le `vercel.json` contient uniquement les headers — Vercel sert automatiquement les fichiers statiques sans configuration build.

### 3. Vérifier le déploiement

Après déploiement, tester ces URLs pour confirmer que les fichiers sont accessibles :
- `https://votre-app.vercel.app/` → page de login
- `https://votre-app.vercel.app/css/style.css` → doit retourner du CSS
- `https://votre-app.vercel.app/js/app.js` → doit retourner du JS

Si l'une de ces URLs retourne 404, vérifiez que les dossiers `css/` et `js/` sont bien **committés dans Git** (pas dans `.gitignore`).

---

## Configuration Supabase

Les credentials sont dans `js/supabase.js` (lignes 8-9) :

```js
const SUPABASE_URL  = 'https://kleefoouttyzzsjgopxm.supabase.co';
const SUPABASE_ANON = 'sb_publishable_wllDkNp2LbmWsEdXLX9y3g_YXMdAuY1';
```

> ⚠️ N'utilisez **jamais** la clé `service_role` ici. Seule la clé `anon/publishable` est sécurisée côté client.

---

## Vérification rapide après déploiement

Ouvrir la console navigateur (F12) et vérifier :
- Pas d'erreur `supabase is not defined` → SDK chargé ✅
- Pas d'erreur `404` sur `style.css` ou `app.js` → fichiers servis ✅
- `DB` disponible dans la console → Supabase connecté ✅

---

## Technologies

- HTML5 / CSS3 / JavaScript vanilla (pas de framework)
- [Supabase](https://supabase.com) — Auth, DB, Storage, Realtime
- [Tabler Icons](https://tabler.io/icons) — Icônes
- [Google Fonts](https://fonts.google.com) — Syne, Inter, JetBrains Mono
- [Vercel](https://vercel.com) — Hébergement statique
