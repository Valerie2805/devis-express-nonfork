# Plan d’implémentation (MVP) — Machine à Devis

Objectif : sortir une V1 vendable qui délivre la promesse “capturer → qualifier → répondre → mesurer”, sans se disperser.

## 0) Décisions de cadrage (non négociables)

- V1 = 10 métiers, mais 1 seul moteur (packs métier = data).
- Le générateur ne propose pas 1000 options : il assemble via les blueprints.
- Le backoffice est un “inbox + actions 1 clic” (pas un ERP).
- Le tracking ne collecte aucune PII (cf. spec).

## 1) MVP strict (ce qui doit exister pour vendre)

### Site
- Génération des pages :
  - Accueil
  - Services
  - Zones
  - Tarifs (optionnel mais recommandé)
- CTA sticky mobile (Appeler / WhatsApp / Devis).
- Formulaire “Devis en 30 secondes” par métier (questions + photos requises selon cas).

### Leads
- Création de lead au submit.
- Qualification automatique :
  - in_zone
  - required_photos (selon request_type)
  - score + decision + tags (cf. scoring)

### Backoffice
- Inbox :
  - liste des leads + tri + filtres (urgent / aujourd’hui / à relancer)
  - actions : appeler / sms / whatsapp / fixer RDV / gagné / perdu
- Fiche lead (détails + photos + timeline + notes).

### Messages
- Envoi SMS/WhatsApp via templates :
  - ack (accusé réception)
  - demande photo
  - proposition créneaux
  - confirmation RDV
  - hors zone

### Mesure
- Events (tel/WhatsApp/form) + attribution UTM + dashboard minimal :
  - demandes
  - qualifiées
  - délai moyen de réponse
  - sources

## 2) Hors MVP (à refuser en V1)

- Réservation complexe avec calendrier complet (V1 = “prochaine dispo” simple).
- IA conversationnelle complète (V1 = règles + templates).
- Multi-utilisateurs avancé / permissions fines (V1 = owner/staff simple).
- Import automatique d’avis si ça bloque la sortie (V1 = manuel possible).
- SEO avancé (V1 = pages + contenu + vitesse + NAP).

## 3) Architecture minimale recommandée (agnostique)

### Données (entités)
- Business (entreprise) : trade_id, zone, services, téléphone, WhatsApp, frais, settings.
- Site (config générée) : blueprint_id, pages, assets.
- Lead : champs du schéma + score/decision/tags + status + timeline.
- Event : events analytics (sans PII) + session_id + UTM persistés.

### Services (modules)
- Generator : assemble pages via `product/pages_blueprints.yml` + contenu via `content/fr/*.yml`.
- Forms : rend le formulaire via `product/form_schema.yml`, stocke lead.
- Scoring : applique `content/fr/scoring.yml`.
- Messaging : rend les templates `content/fr/messages.yml` + envoie via provider.
- Analytics : collecte events `product/event_tracking_spec.yml` + calcule KPI `product/kpis_dashboard.yml`.
- Backoffice : UI selon `product/backoffice_ui_spec.yml`.

## 4) Ordre de développement (séquence)

### Phase 1 — Modèle de données + ingestion lead
1) Implémenter les entités Business + Lead.
2) Implémenter le rendu du formulaire (schéma commun + champs métier).
3) Implémenter stockage lead + upload photos.
4) Implémenter calcul `in_zone` (règle simple : code postal/communes autorisées).

Critères d’acceptation :
- Un lead créé contient trade_id, request_type, urgency, city, phone, photos_count.
- `in_zone` est calculé (true/false) et stocké.

### Phase 2 — Scoring + tags + statuts
1) Parser `scoring.yml`.
2) Calculer score + decision + tags.
3) Initialiser status selon decision :
   - qualified → qualified
   - needs_followup → needs_followup
   - reject → lost (ou “non qualifié” si vous ajoutez un status)

Critères d’acceptation :
- Un lead hors zone est rejeté automatiquement.
- Un lead “photos requises” sans photo obtient tag missing_photos.
- Un lead urgent obtient tag urgent.

### Phase 3 — Backoffice Inbox + fiche lead
1) Liste inbox (tri par date, filtres).
2) Fiche lead (photos + notes + timeline).
3) Changement de statut + events CRM (lead_status_changed).

Critères d’acceptation :
- L’inbox charge en <2s avec 100 leads.
- Un statut peut être changé et apparaît dans timeline.

### Phase 4 — Messaging templates
1) Message modal (SMS/WhatsApp) avec templates communs + métier.
2) Envoi via provider (MVP : un provider unique).
3) Log message dans timeline + event lead_response_sent.

Critères d’acceptation :
- Envoi d’un message template sans PII dans analytics.
- Timeline enregistre : message envoyé + template_id.

### Phase 5 — Site generator
1) Générer Accueil/Services/Zones/Tarifs depuis blueprints.
2) Injecter copy + placeholders + services + zones + frais.
3) CTA sticky mobile + open_quote_form event.

Critères d’acceptation :
- Une entreprise peut publier un site complet en < 1 minute.
- Le formulaire est accessible depuis toutes les pages.

### Phase 6 — Tracking + dashboard
1) Persister UTM/referrer (30 jours).
2) Émettre events view_page, click_call, click_whatsapp, open_quote_form, submit_quote_form.
3) Construire dashboard selon kpis_dashboard.yml.

Critères d’acceptation :
- Dashboard montre demandes + sources sur 7/30 jours.
- Aucune PII n’est envoyée dans les events.

## 5) Critères “prêt à vendre” (go-to-market)

- Vous pouvez générer un site pour 1 métier en 10 minutes, avec :
  - page Accueil + formulaire + messages + inbox
- Vous pouvez faire une démo “wahou” :
  - soumettre une demande → la voir dans inbox → envoyer un message → montrer dashboard.
- Le périmètre est verrouillé par `sales/offer_packaging.md`.

