# Cas de test (E2E) — Machine à Devis (V1)

Objectif : valider rapidement le flux complet : site → formulaire → lead → scoring/tags → backoffice → messages → analytics → dashboard.

## Conventions

- Les cas ci-dessous utilisent les champs du [form_schema.yml](file:///workspace/machine-a-devis/product/form_schema.yml) et les règles de [scoring.yml](file:///workspace/machine-a-devis/content/fr/scoring.yml).
- Les messages attendus se basent sur [messages.yml](file:///workspace/machine-a-devis/content/fr/messages.yml).
- Les events attendus se basent sur [event_tracking_spec.yml](file:///workspace/machine-a-devis/product/event_tracking_spec.yml).
- Aucune PII ne doit être envoyée via `/analytics` (cf. rules PII dans la spec tracking).

## Dataset Business (commun)

Créer un business de test par métier avec :
- zone.mode = list
- zone_list = ["75001","75002","75003"] (ou communes/CP équivalents)
- excluded_zones = []
- phone valid + WhatsApp
- services.top_services = 3 valeurs
- pricing.travel_fee et pricing.diagnostic_fee renseignés si page Tarifs active

## Assertions communes (tous tests)

Après un submit formulaire :
- Lead créé avec lead_id, created_at, trade_id, request_type, urgency, channel_preference, city/postal_code
- `phone_valid = true` si numéro OK, sinon reject
- `in_zone = true` si postal_code dans zone_list, sinon reject
- Calcul `score`, `decision`, `tags` cohérent
- Backoffice Inbox affiche le lead avec statut initial
- Event `submit_quote_form` émis sans PII

Après un envoi message depuis backoffice :
- message_log créé (channel, template_id, status)
- lead.first_human_response_at rempli si premier message humain
- Event `lead_response_sent` émis sans PII

Après changement statut :
- Lead.status mis à jour
- Event `lead_status_changed` émis sans PII

## Tests site & tracking (smoke)

### T-SMOKE-01 — Page view + UTM persistence
Préconditions :
- Ouvrir le site avec URL contenant `utm_source=google&utm_medium=organic&utm_campaign=gbp`
Étapes :
1) Charger la page Accueil
2) Aller sur Services puis revenir Accueil
Attendus :
- Event `view_page` sur chaque page
- UTM persistés 30 jours (cookie/localStorage)

### T-SMOKE-02 — CTA call / WhatsApp
Étapes :
1) Cliquer CTA “Appeler” depuis hero puis sticky mobile
2) Cliquer CTA “WhatsApp” depuis header
Attendus :
- Events `click_call` et `click_whatsapp` avec `cta_id` correct

## Tests scoring & tri (10 métiers)

### T-PLOM-01 — Plombier, fuite active, dans zone, photo fournie (qualifié + urgent)
Input :
- trade_id = plombier_chauffagiste
- request_type = fuite_eau
- urgency = now
- postal_code = 75001
- photos_count = 1
- answers.fuite_active = true
- answers.eau_coupee_possible = true
Attendus :
- tags contient urgent
- tags contient safety_water
- decision = qualified
- status initial = qualified (ou new puis qualified selon implémentation)
- Backoffice : lead en haut (priorité)
Actions backoffice :
- Envoyer template `plombier_chauffagiste.safety` puis `common.propose_slot`
Attendus :
- timeline contient 2 messages

### T-PLOM-02 — Plombier, chauffe-eau panne, photo manquante (à relancer + missing_photos)
Input :
- trade_id = plombier_chauffagiste
- request_type = chauffe_eau_panne
- urgency = today
- postal_code = 75002
- photos_count = 0
- answers.fuite_active = false (ou non applicable)
- answers.eau_coupee_possible = true
Attendus :
- tags contient missing_photos
- decision = needs_followup
Action :
- Envoyer template `plombier_chauffagiste.need_photo`

### T-SERR-01 — Serrurier, porte claquée, photo fournie (qualifié)
Input :
- trade_id = serrurier
- request_type = porte_claquee
- urgency = now
- postal_code = 75001
- photos_count = 1
- answers.mode_porte = claquee
Attendus :
- tags contient urgent
- decision = qualified
Action :
- Envoyer template `serrurier.pricing_reassurance`

### T-SERR-02 — Serrurier, hors zone (reject)
Input :
- trade_id = serrurier
- request_type = porte_fermee_a_cle
- urgency = now
- postal_code = 69001 (hors zone)
- photos_count = 1
- answers.mode_porte = fermee_a_cle
Attendus :
- decision = reject
- tags contient out_of_zone
- auto-message “hors zone” possible (si vous l’activez)

### T-ELEC-01 — Électricien, danger = true (qualifié + danger)
Input :
- trade_id = electricien
- request_type = disjoncteur_saute
- urgency = now
- postal_code = 75003
- photos_count = 1
- answers.danger_brule_etincelle = true
Attendus :
- tags contient danger
- decision = qualified
Action :
- Envoyer template `electricien.safety`

### T-COUV-01 — Couvreur, infiltration active + photo (qualifié)
Input :
- trade_id = couvreur_zingueur
- request_type = fuite_infiltration
- urgency = today
- postal_code = 75001
- photos_count = 1
- answers.infiltration_active = true
Attendus :
- tags contient weather_risk
- decision = qualified

### T-PAC-01 — PAC, installation, infos complètes (qualifié)
Input :
- trade_id = pac_clim_chauffage
- request_type = installation
- urgency = week
- postal_code = 75002
- photos_count = 0
- answers.objectif = installer
- answers.surface_m2 = 85
- answers.type_logement = maison
Attendus :
- decision = qualified

### T-PAC-02 — PAC, installation, surface manquante (à relancer)
Input :
- trade_id = pac_clim_chauffage
- request_type = installation
- urgency = week
- postal_code = 75002
- photos_count = 0
- answers.objectif = installer
- answers.type_logement = maison
Attendus :
- decision = needs_followup
- tags contient prequal_needed
Action :
- Envoyer template `pac_clim_chauffage.quick_questions`

### T-VITR-01 — Vitrier, vitre cassée + sécurisation immédiate (qualifié + urgent)
Input :
- trade_id = vitrier
- request_type = vitre_cassee
- urgency = now
- postal_code = 75001
- photos_count = 1
- answers.besoin_securisation_immediate = true
Attendus :
- tags contient glass_hazard
- decision = qualified
Action :
- Envoyer template `vitrier.safety`

### T-DEBO-01 — Débouchage, refoulement (qualifié + urgent)
Input :
- trade_id = debouchage_assainissement
- request_type = refoulement
- urgency = now
- postal_code = 75003
- photos_count = 1
- answers.maison_ou_appartement = appartement
- answers.refoulement_oui_non = true
Attendus :
- tags contient sanitary_urgent
- decision = qualified

### T-VOLE-01 — Volet bloqué ouvert, photo (qualifié)
Input :
- trade_id = volets_portes_garage
- request_type = volet_bloque_ouvert
- urgency = today
- postal_code = 75001
- photos_count = 1
- answers.bloque_ouvert_ou_ferme = ouvert
- answers.manuel_ou_electrique = electrique
Attendus :
- tags contient security_open
- decision = qualified

### T-NUIS-01 — Anti-nuisibles, punaises sans nb pièces (à relancer)
Input :
- trade_id = anti_nuisibles
- request_type = punaises
- urgency = today
- postal_code = 75002
- photos_count = 0
- answers.type_nuisible = punaises
- answers.piece = chambre
Attendus :
- decision = needs_followup
Action :
- Envoyer template `anti_nuisibles.need_photo` (ou quick_questions)

### T-RAMO-01 — Ramonage, attestation requise (qualifié)
Input :
- trade_id = ramonage_poeles_cheminees
- request_type = ramonage
- urgency = week
- postal_code = 75003
- photos_count = 0
- answers.type_appareil = poele
- answers.attestation_necessaire = true
Attendus :
- decision = qualified

## Tests dashboard (agrégation)

### T-DASH-01 — Sources
Préparer :
- 3 leads avec UTM google
- 2 leads avec UTM facebook
- 1 lead direct (sans referrer + sans UTM)
Attendus :
- Dashboard “Sources” : Google=3, Facebook=2, Direct=1

### T-DASH-02 — Délai réponse
Préparer :
- Lead A : réponse en 3 min
- Lead B : réponse en 25 min
Attendus :
- response_time_avg_minutes ≈ 14
- response_under_10min_rate = 50%

