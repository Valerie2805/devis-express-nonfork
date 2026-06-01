# Machine à Devis — Contenus V1 (FR)

Ce dossier contient les textes V1 prêts à être injectés dans un générateur “Machine à Devis” (site + formulaire + auto-messages + scoring).

## Arborescence

- content/fr/site_copy.yml : textes du site (Hero, Services, FAQ) pour 10 métiers
- content/fr/messages.yml : templates SMS/WhatsApp (communs + par métier)
- content/fr/scoring.yml : grille de qualification (commune + par métier)
- content/fr/tarifs_transparents.yml : templates de page “Tarifs transparents” (communs + par métier)
- product/form_schema.yml : schéma des formulaires (champs + request_type + extra questions)
- product/field_mapping.yml : conventions et mapping form → lead → scoring
- product/pages_blueprints.yml : blueprints d’assemblage des pages (sections, ordre, variantes)
- product/event_tracking_spec.yml : spec tracking (events, UTM, attribution, règles PII)
- product/kpis_dashboard.yml : spec dashboard (métriques, calculs, vues)
- product/backoffice_ui_spec.yml : spec backoffice (écrans, statuts, actions, templates)
- product/data_model.yml : modèle de données (Business, Lead, Messages, Assets, Events) + règles PII
- product/api_contract.yml : contrat API minimal (site public + backoffice + analytics)
- sales/prospection_script.md : script prospection (email/appel/SMS)
- sales/demo_wahou.md : script de démo “wahou” (10 minutes)
- sales/objections_handling.md : réponses courtes aux objections fréquentes
- sales/offer_packaging.md : packs, périmètre, conditions (anti-dérive)
- ops/onboarding_form.md : formulaire d’onboarding à envoyer au client
- ops/operations_sop.md : SOP d’exploitation (SLA, tri, relances)
- client/guide_1_page.md : guide d’usage pour l’artisan
- checklist.md : checklist de livraison opérationnelle
- implementation_plan.md : plan d’implémentation MVP (ordre de dev, modules, critères d’acceptation)
- test_cases.md : cas de test end-to-end (form → scoring → backoffice → messages → dashboard)
- launch_playbook.md : playbook de lancement (go live + 7 jours)

## Placeholders

Les placeholders suivants sont utilisés dans les textes :

- [Entreprise]
- [Ville]
- [Zone]
- [Téléphone]
- [Option 1]
- [Option 2]
- [Date]
- [Heure]
- [Adresse]
- [Service]
- [Prénom]

## Usage recommandé

1) Choisir un trade_id
2) Remplacer les placeholders à l’injection (runtime)
3) Générer les pages (Accueil, Services, Zones) avec les blocs standard
4) Configurer les auto-messages (ack, hors zone, demande photo, proposition créneau, confirmation)
5) Appliquer scoring.yml pour tagger/qualifier/prioriser les leads
