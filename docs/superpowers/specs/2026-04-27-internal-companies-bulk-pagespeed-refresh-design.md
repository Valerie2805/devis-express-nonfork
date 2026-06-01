# Bulk refresh PageSpeed (liste filtrée) — Design

**Date :** 2026-04-27  
**Contexte :** `/internal/companies` permet déjà de lancer un refresh PSI par entreprise via `POST /api/v1/internal/companies/:companyKey/pagespeed/run`.

## Objectif

Ajouter un bouton “Refresh PSI (filtrés)” sur `/internal/companies` qui relance PSI en masse pour les entreprises correspondant aux filtres actifs (type / q / accessibility_lt), sans ajouter de nouvel endpoint backend.

## Portée

- Page concernée : `/internal/companies`
- Données visées : les entreprises présentes dans la liste déjà chargée (réponse de `GET /api/v1/internal/companies...`)
- Exécution : appels séquentiels à l’endpoint existant `POST /api/v1/internal/companies/:companyKey/pagespeed/run`

## UX

- Bouton : “Refresh PSI (filtrés)” placé à côté de “Export CSV”.
- État pendant exécution :
  - bouton désactivé + libellé “Refresh PSI (x/y)” (progression)
  - une erreur sur une entreprise n’interrompt pas les suivantes, mais le message d’erreur est conservé (première erreur) pour affichage.
- Fin : rechargement de la liste (refresh du `GET /internal/companies`) pour refléter les nouveaux scores.

## Comportement

- La liste “cible” est `items` (state React) au moment du clic :
  - donc respecte naturellement `type`, `q`, `accessibility_lt`
- Stratégie d’appel : séquentielle (évite des bursts et limite le risque de quota PSI).
- Gestion d’erreurs :
  - si l’API PSI renvoie 429/502 (déjà géré côté serveur) : continuer la boucle, stocker un message d’erreur pour feedback.

## Tests

- Test UI : vérifie qu’un clic sur “Refresh PSI (filtrés)” déclenche des appels `POST /pagespeed/run` pour la liste mockée, et qu’un compteur de progression apparaît.

