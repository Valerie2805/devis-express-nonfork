# Tutoriel — Parcours utilisateur (profils internes)

Ce guide est un **mode opératoire** pour les profils internes à ta société : admin, prospection, sales/qualification, ops (RDV/suivi) et pilotage.

Objectif : qu’une personne qui découvre l’app sache **où cliquer**, **quoi remplir**, et **comment vérifier** que l’étape est terminée.

## 1) Lexique (à lire une fois)

- **Prospect** : une entreprise ciblée avant contact (outbound). Gérée dans l’espace **Interne**.
- **Lead** : une demande entrante (inbound) créée via le site public. Gérée dans le **Backoffice**.
- **Business** : un client “instance” (une entreprise artisan/PME) : site public + backoffice + configuration.

## 2) Repères d’interface (où cliquer)

### Backoffice (menu de gauche)

Tu y trouves les entrées :
- **Demandes**
- **Stats**
- **Disponibilités**
- **RDV**
- **Réglages**
- (owner) **Audit IA**
- **A/B Tests**
- (owner) **Journal**

### Interne (barre du haut)

Tu y trouves les onglets :
- **Prospection**
- **Inbox**
- **Entreprises**
- **Commissions**

## 3) Parcours par rôle (avec étapes cliquables)

### Rôle A — Admin (setup initial)

**But :** rendre un nouveau business opérationnel (site public + backoffice + pipeline).

#### A.1 Créer une entreprise (business)

1. Ouvre l’écran “Création d’entreprise” (lien admin de ton organisation).
2. Renseigne les champs de l’entreprise (nom, ville, métier…).
3. Crée l’utilisateur owner (celui qui aura accès au backoffice).

**Vérification (résultat attendu) :**
- tu peux te connecter via l’écran **Login**
- une fois connecté, tu vois le menu Backoffice (Demandes, Réglages…)
- le site public s’affiche via le lien “site public” fourni pour ce business

#### A.2 Configurer les fondamentaux

1. Dans le Backoffice, clique **Réglages**.
2. Configure :
   - **Zones d’intervention** (liste de codes postaux ou rayon)
   - **Pipeline** (étapes + étape par défaut)
3. Sauvegarde.

**Vérification (résultat attendu) :**
- tu peux ouvrir le site public et voir les sections attendues
- une demande test (voir A.3) arrive bien dans **Demandes**

#### A.3 Faire un test “de bout en bout” (recommandé)

1. Ouvre le site public du business.
2. Clique le bouton **Devis** (ou fais défiler jusqu’au formulaire).
3. Remplis une demande “test” (avec ton numéro).
4. Valide.

**Vérification :**
- dans le Backoffice, menu **Demandes**, tu vois la demande apparaître

### Rôle B — Prospection (constituer un vivier + contacter)

**But :** construire une base de prospects et lancer des séquences de contact.

#### B.1 Importer des prospects (Google Places)

1. Va dans l’espace **Interne**.
2. Clique l’onglet **Prospection**.
3. Dans la zone de recherche, saisis : métier + ville (ex: “plombier paris”).
4. Lance la recherche.
5. Sélectionne les résultats pertinents.
6. Clique **Importer**.

**Vérification :**
- va dans l’onglet **Entreprises** et sélectionne le filtre “Prospects” (type)
- tu retrouves les entreprises importées

#### B.2 Enrichir un prospect (argumentaire)

1. Interne → onglet **Entreprises**.
2. Filtre “Prospects”.
3. Sur une entreprise, lance :
   - **PageSpeed** (mobile + desktop)
   - **Scrape email légal** (si nécessaire)

**Vérification :**
- les scores et/ou l’email légal apparaissent sur la ligne de l’entreprise

#### B.3 Gérer les échanges (Inbox prospects)

1. Interne → onglet **Inbox**.
2. Ouvre un prospect.
3. Écris un message et envoie.

**Vérification :**
- l’email sortant est visible dans l’historique du prospect

### Rôle C — Sales / Qualification (traiter les leads entrants)

**But :** rappeler vite, qualifier, convertir.

#### C.1 Prioriser les demandes

1. Backoffice → clique **Demandes**.
2. Utilise :
   - la barre **Rechercher…**
   - le filtre **Tous statuts**
   - le filtre **Toutes priorités**
   - le filtre **Tous tags**
3. Clique une demande prioritaire pour ouvrir sa fiche.

#### C.2 Qualifier et organiser

1. Dans la fiche demande :
   - lis urgence, description, photos
   - mets à jour le **statut** et/ou l’étape pipeline selon votre process
   - ajoute une **note** si nécessaire

#### C.3 Répondre (SMS / WhatsApp)

1. Dans la fiche demande, section **Messages** :
2. Choisis :
   - **Canal** : SMS ou WhatsApp
   - **Mode** : Templates (recommandé) ou Message libre
3. Clique **Envoyer**.

**Bon réflexe :**
- utilise **Proposer une réponse** pour générer un brouillon, puis adapte avant envoi.

### Rôle D — Ops (RDV, suivi, résultat)

**But :** planifier, confirmer, suivre l’issue.

#### D.1 Planifier un RDV

1. Backoffice → clique **RDV** pour voir l’agenda.
2. Sinon, depuis une fiche demande :
   - propose un créneau
   - envoie le message correspondant (template “proposition de créneau” ou message libre)
3. Mets à jour l’étape pipeline quand c’est confirmé.

#### D.2 Après intervention

1. Dans la fiche demande :
   - mets à jour le statut final (gagné/perdu)
   - ajoute une note “résultat” si besoin

### Rôle E — Manager (pilotage et contrôle)

**But :** sortir des fichiers, contrôler les actions, suivre les volumes.

#### E.1 Exporter un fichier de demandes (CSV)

1. Backoffice → **Demandes**.
2. Applique les filtres (statut, priorité, tags, recherche).
3. Clique **Exporter CSV** (en haut de la page).

#### E.2 Vérifier les actions (Journal)

1. Backoffice → clique **Journal**.
2. Ouvre les événements pour vérifier :
   - exports
   - envois de messages
   - actions sensibles

## 4) Cas d’usage transverse — Audit IA (owner)

**But :** produire un audit exportable (à envoyer à un prospect / à utiliser en interne).

1. Backoffice → clique **Audit IA**.
2. Clique “Nouvel audit” (ou équivalent).
3. Colle l’URL du site à auditer et valide.
4. Quand l’audit est terminé :
   - copie le lien public (si vous le partagez)
   - ou télécharge le DOCX

## 5) Dépannage rapide

- **Une demande test n’apparaît pas** : refaire une demande depuis le formulaire “Devis”, puis rafraîchir **Demandes**.
- **SMS/WhatsApp ne partent pas** : vérifier la configuration Twilio + numéro d’envoi.
- **Audit IA échoue** : vérifier Vercel Blob + logs, puis relancer un audit.
