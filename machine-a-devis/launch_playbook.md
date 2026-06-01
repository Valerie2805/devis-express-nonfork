# Playbook de lancement (V1) — Go live + 7 jours

Objectif : mettre en ligne vite, démarrer le flux de demandes, et prouver la valeur en 7 jours avec des chiffres simples.

## Pré-lancement (J-2 à J0)

### 1) Check assets (client)
- Logo (ou nom écrit proprement)
- 6–12 photos réelles
- Lien Google Business Profile
- Téléphone (et WhatsApp si utilisé)
- 3 services principaux + zone d’intervention
- Tarifs transparents (si client accepte) : déplacement/diagnostic + “tarif annoncé avant”

### 2) Check technique (toi)
- Site généré (Accueil/Services/Zones/Tarifs si activée)
- Formulaire “devis 30s” + photos requises selon métier
- Tri/scoring actif + tags visibles
- Templates messages activés
- Tracking events actif + UTM persistance
- Dashboard accessible (même minimal)

### 3) Go live checklist
- Domaine configuré + HTTPS
- Boutons CTA testés (tel + WhatsApp)
- 1 lead de test complet :
  - submit → lead inbox → message template → status change → dashboard
- Backoffice accès client : 1 utilisateur owner + 1 staff (option)

## Jour 1 — Installation “dans la vraie vie”

### 1) Setup Google Business Profile
- Mettre à jour l’URL du site
- Ajouter lien “Prendre contact” (si possible)
- Ajouter 3 photos récentes
- Ajouter 1 post (simple) :
  - “Intervention à [Ville] / [Zone] — Devis en 30 secondes”

### 2) Script d’activation client (10 minutes)
- “Quand une demande arrive : répondez en <10 min.”
- Montrer l’inbox + boutons 1 clic (Appeler, WhatsApp, Proposer créneau)
- Définir les 2 créneaux standards (ex : demain 14h / demain 18h)
- Définir la réponse type :
  - “Bien reçu, je vous rappelle sous X minutes”

### 3) Mise en place SLA réel
- Paramétrer `response_sla_minutes` (ex : 10)
- Activer auto-ack systématique

## Jour 2–3 — Optimisation conversion (sans toucher au design)

### 1) Vérifier les 3 points qui font la différence
- CTA visible sur mobile (sticky) : oui/non
- Photos réelles : oui/non (sinon demander 3 photos en plus)
- “Tarif annoncé avant” visible : oui/non

### 2) Ajuster le formulaire (1 seule optimisation)
- Si trop de demandes inutiles : rendre photo obligatoire sur 1–2 request_types
- Si trop peu de demandes : réduire 1 question non essentielle

### 3) Ajuster les messages (1 seule optimisation)
- Ajouter une phrase “répondez 1 ou 2” sur la proposition de créneau

## Jour 4–5 — Collecte de preuves (ce qui solidifie la vente)

### 1) Avis Google (process simple)
- À chaque intervention réussie : SMS “Merci, pouvez-vous laisser un avis ?”
- Objectif : 2 nouveaux avis sur la semaine (même ambitieux, viser 1)

### 2) Photos “avant/après”
- Demander 3 photos de réalisations supplémentaires
- Mettre à jour la bande photos du site

## Jour 6–7 — Preuve par les chiffres (mini rapport)

### 1) Regarder 5 chiffres
- demandes totales (7 jours)
- qualifiées
- délai moyen de réponse
- sources (Google/Direct/etc.)
- à relancer (si backlog)

### 2) Interprétation (messages client)
- Si demandes faibles :
  - vérifier GBP, CTA, contenu zone, photos
- Si demandes bonnes mais conversion faible :
  - délai de réponse trop long → corriger process
  - formulaire pas assez qualifiant → ajouter photo/infos

### 3) Mini-report à envoyer au client (copier-coller)
Semaine 1 :
- Demandes : X (qualifiées : Y)
- Délai moyen de réponse : Z min
- Source principale : [Google/Direct/etc.]

Action semaine 2 :
- 1 optimisation formulaire (ex : photo obligatoire sur X)
- 1 optimisation réponse (créneaux + confirmation)

## Signaux “ça marche”
- Délai réponse < 10 min sur > 50% des demandes
- Au moins 1 RDV fixé / devis envoyé
- Au moins 1 demande qualifiée issue de Google

