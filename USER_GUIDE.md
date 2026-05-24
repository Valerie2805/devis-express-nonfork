# Guide d’utilisation — DevisExpress

Ce document décrit le fonctionnement du produit (site public + backoffice), et comment l’utiliser au quotidien.

## Vue d’ensemble

L’app sert à :
- publier un mini-site “métier” (copy + preuve sociale + formulaire)
- collecter des demandes de devis (“leads”)
- traiter ces demandes dans un backoffice (inbox, statut, messages, export)
- piloter des réglages (zones couvertes, tarifs, preuves, équipe, RGPD)

## Rôles

- **Visiteur** : remplit le formulaire sur le site public.
- **Staff** : traite les leads (lecture + actions autorisées par permissions).
- **Owner** : admin du business (réglages, équipe, permissions staff, exports, anonymisation, 2FA).
- **Admin plateforme** : opérations globales (création business, purge, crons) via routes admin protégées par clé.

## Concepts clés

- **Business** : une entreprise (un métier, une zone, un branding, des réglages).
- **Lead** : une demande de devis (coordonnées, description, photos, réponses au formulaire, statut).
- **Proof** : preuve sociale (avis + galerie photo).
- **Templates** : messages (SMS/WhatsApp) envoyables depuis le backoffice.
- **Rétention RGPD** : anonymisation/suppression des leads au-delà d’un délai.

## Démarrage (démo)

Par défaut, une instance démo est disponible :
- Business : `demo-business`
- Backoffice :
  - identifiants owner `owner / demo`
  - identifiants staff `emilie / demo`

Désactivation (recommandé en prod) :
- `SEED_DEMO=false` pour désactiver l’initialisation des données démo
- `VITE_DEMO_MODE=false` pour désactiver le texte/pré-remplissage “démo” côté UI

## Site public

### Objectif

Le site public affiche :
- une page “métier” (titre, promesse, sections)
- une preuve sociale (avis, photos)
- un formulaire de demande de devis

### Parcours visiteur

1) Le visiteur choisit le service / décrit son problème
2) Il renseigne ses coordonnées
3) Il envoie le formulaire
4) Un lead est créé, visible dans le backoffice

### Données collectées

Selon le métier/config :
- prénom
- téléphone (E.164)
- email (optionnel)
- ville + code postal (utilisés pour le “in zone”)
- adresse (optionnel)
- description (optionnel)
- photos (optionnel)
- réponses structurées (selon schéma de formulaire)

## Backoffice

### Connexion

Accès via `/backoffice/<businessId>/login`.

- En cas de 2FA activé : un code SMS est demandé.
- “Renvoyer le code” est disponible, avec un cooldown et une limite de renvois.

### Inbox (liste des leads)

L’inbox permet :
- filtrer par statut / tag
- ouvrir le détail d’un lead
- exporter CSV (si autorisé)

### Détail d’un lead

Sur un lead, tu peux :
- consulter toutes les infos (contacts, description, photos, tags, score/décision, historique)
- changer le statut (ex: new / qualified / needs_followup / lost / deleted)
- changer l’étape “pipeline” (si configurée)
- envoyer des messages (templates SMS/WhatsApp)
- anonymiser le lead (si autorisé, typiquement owner)

### Rendez-vous

Dans la fiche lead, renseigner `date` + `heure` + `adresse` puis enregistrer :
- crée un rendez-vous (stocké en base, visible dans l’onglet RDV)
- permet de télécharger un fichier `.ics` (ajout au calendrier)

### Envoi de messages

L’envoi s’appuie sur des templates (par métier et communs).

Selon la configuration :
- Provider “noop” en dev : n’envoie rien et peut afficher les messages dans les logs (utile pour tests)
- Provider Twilio en prod : envoie réellement SMS/WhatsApp et reçoit des webhooks (status/inbound)

Consentements / opt-out :
- Les consentements sont collectés sur le formulaire (SMS/WhatsApp/Email).
- Si un lead répond “STOP”, les envois futurs sont bloqués.

### Automations

Dans Réglages → Automations :
- `pipeline_stages` : étapes du pipeline
- `automation_rules` : règles (assignation, tags, changement d’étape)
- `sequences` : messages différés (relances)

Les séquences sont exécutées par un cron (endpoint admin).

### Dashboard

Le tableau de bord permet de visualiser :
- nombre de leads
- distribution par décision
- temps de réponse moyen (si réponses envoyées)
- sources (si tracking activé)

## Réglages (Settings)

### Tarifs transparents

Permet de gérer des textes de prix (ex: frais de déplacement, diagnostic).

### Zone couverte

Liste de codes postaux “in-zone”.

Les leads hors zone peuvent être taggés / scorés différemment.

### Proof (avis + galerie)

Permet d’ajouter/supprimer :
- des avis (auteur, note, texte)
- des photos (par URL https ou upload)

Les assets uploadés peuvent être stockés en local (dev) ou S3 (prod).

### RGPD — Rétention

Le champ “Rétention (jours)” définit un délai par business :
- si défini : utilisé par le cron rétention pour ce business
- sinon : fallback sur la variable d’environnement `RETENTION_DAYS`

### Équipe

Owner uniquement :
- créer des comptes staff
- supprimer des comptes staff
- activer/désactiver le 2FA pour un user + renseigner le téléphone 2FA

### Permissions staff (RBAC)

Le RBAC se pilote via `settings.staff_permissions`.

Exemples :
- `export_leads` : autorise l’export CSV
- `settings_write` : autorise la modification des réglages
- `proof_write` : autorise l’édition avis/photos
- `lead_anonymize` : autorise l’anonymisation RGPD d’un lead

Owner est toujours autorisé, staff seulement si le flag est activé.

## Onglet RDV

L’onglet “RDV” liste les rendez-vous :
- téléchargement `.ics`
- annulation (statut `cancelled`)

## RGPD & suppression des données

### Anonymisation d’un lead

Remplace les données personnelles par des valeurs “neutres”, met le lead en `deleted`, et redige l’historique message.

Les photos associées (assets) sont supprimées du stockage (local/S3) si elles sont tracées via la table `asset`.

### Purge

Une purge admin peut supprimer des leads plus anciens qu’un seuil.

### Cron de rétention

Un job planifié appelle un endpoint cron qui :
- anonymise (recommandé) ou supprime les leads anciens
- applique un délai par business (`settings.retention_days`) sinon fallback global

### Nettoyage assets orphelins

Un autre cron peut supprimer :
- les assets non référencés par des leads ni la galerie

## Exports

### Export CSV

L’export CSV permet de récupérer jusqu’à 10k leads avec filtres simples.

Accès :
- owner : oui
- staff : seulement si `settings.staff_permissions.export_leads=true`

## Bonnes pratiques (opérations)

- Désactiver la démo en production (`SEED_DEMO=false`, `VITE_DEMO_MODE=false`).
- Utiliser Postgres en production (Supabase).
- Utiliser S3 en production pour les assets.
- Activer la rétention RGPD et les crons.
- Brancher Twilio + webhooks pour la messagerie.
- Activer Sentry (optionnel) pour la collecte d’erreurs.

## Aide / dépannage

- **Je ne peux pas exporter** : vérifier `settings.staff_permissions.export_leads`.
- **Je ne peux pas modifier les réglages** : vérifier `settings.staff_permissions.settings_write`.
- **Je ne peux pas éditer avis/photos** : vérifier `settings.staff_permissions.proof_write`.
- **Le renvoi de code 2FA est bloqué** : cooldown actif ou limite de renvois atteinte.
- **Les uploads ne s’affichent pas** : vérifier la config S3 (URL publique / CDN) ou l’accès `/api/uploads/*` en local.
