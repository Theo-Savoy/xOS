# Démarchage téléphonique B2B en France — cadre réglementaire (Combo/XOS)

> Statut : recherche documentaire du 2026-08-03. Sources principales : ARCEP (décision n° 2022-1583 du 1er septembre 2022, fiches pratiques "plan de numérotation pour les professionnels"), CNIL (prospection par automate d'appel, prospection téléphonique), presse spécialisée (Nomination, HUHU, Kavkom). À relire par un conseil juridique avant usage intensif.
>
> **Périmètre : démarchage B2B pour Combo — prospection de professionnels, PAS de particuliers.**

## 1. Deux régimes distincts : le type d'appel compte plus que la cible

Le droit français croise deux axes indépendants :

| | Appel humain (non automatisé) | Système automatisé d'appels |
|---|---|---|
| **Cible B2B (professionnels)** | Intérêt légitime RGPD, pas de consentement préalable, droit d'opposition, Bloctel inapplicable | NPV obligatoire (préfixes dédiés ARCEP) — opt-out CNIL toujours applicable |
| **Cible B2C (particuliers)** | Consentement préalable dès le 11/08/2026 (loi 30 juin 2025), Bloctel | Consentement préalable + NPV |

**Combo est dans la case en haut à gauche ou en haut à droite selon son architecture produit. C'est LA décision structurante.**

## 2. Définition ARCEP d'un "système automatisé" (décision 2022-1583, §7.1.3)

Sont des systèmes automatisés : les systèmes conçus pour appeler plusieurs utilisateurs finals automatiquement, généralement de manière simultanée et massive.

**Sont explicitement EXCLUS de la définition :**
> « les appels émis individuellement, sans parallélisation possible et sur la commande explicite d'un humain pour chaque appel »

**Y tombent explicitement :**
- les systèmes **prédictifs** (plusieurs appels déclenchés automatiquement de façon simultanée) ;
- les systèmes **progressifs** (un appel déclenché automatiquement dès qu'un appelant redevient disponible).

Le Conseil d'État a validé cette interdiction (rejet du recours Syntec Conseil, juin 2024) : pas de dérogation pour les sondages/études, et aucune dérogation B2B — l'interdiction porte sur la technique d'appel, pas sur la cible.

### Conséquence directe pour Combo

- **Power dialer click-to-call** (l'agent humain clique "appeler" pour chaque contact, un appel à la fois, aucune mise en file automatique) → **pas un système automatisé** au sens ARCEP → un **numéro fixe standard (01–05) suffit**.
- **Dialer progressif/prédictif** (enchaînement automatique du contact suivant, parallélisation) → **système automatisé** → seul un **NPV** est légal comme numéro appelant.

## 3. Les NPV (Numéros Polyvalents Vérifiés)

Préfixes réservés aux systèmes automatisés (métropole) :
`0162, 0163, 0270, 0271, 0377, 0378, 0424, 0425, 0568, 0569, 0948, 0949` (+ `09475`–`09479` outre-mer).

Conditions :
- l'opérateur qui exploite le numéro doit vérifier et garantir que son affichage a été autorisé par l'affectataire (procédure de vérification/KYC opérateur) ;
- authentification du numéro appelant obligatoire depuis le 25/07/2023 (loi Naegelen) : l'opérateur de départ vérifie la légitimité du client à afficher le numéro, et les opérateurs d'acheminement coupent la communication si l'authentification est absente ou incorrecte ;
- délégation possible (un centre d'appels peut appeler pour le compte d'un donneur d'ordre avec son numéro), mais matérialisée contractuellement ; L. 221-17 code de la consommation impose que le numéro affiché soit celui du professionnel pour le compte duquel l'appel est passé.

**Disponibilité Telnyx : aucune preuve publique que Telnyx propose des NPV pour la France.** La doc publique Telnyx France ne mentionne que local, national et toll-free. À vérifier dans Number Search après déblocage KYC — si les NPV sont absents du catalogue Telnyx, le mode prédictif/progressif est de facto impossible via Telnyx en France.

## 4. Régime CNIL du démarchage B2B (applicable quel que soit le type d'appel)

- **Pas de consentement préalable** pour prospecter des professionnels : base légale = **intérêt légitime** (RGPD), à condition que l'offre soit en lien avec la fonction/activité du contact.
- **Droit d'opposition** : chaque sollicitation doit permettre au contact de s'opposer simplement à de nouvelles sollicitations → prévoir un mécanisme de prise en compte (liste d'opposition interne Combo).
- **Information** : identité de l'organisation appelante clairement annoncée.
- **Traçabilité RGPD** : origine des données documentée par contact (source de la liste), base légale justifiée.
- **Bloctel : inapplicable** aux numéros professionnels. Attention aux cas limites : dirigeant joignable sur son mobile perso (inscrit Bloctel), TPE/auto-entrepreneurs sur mobile perso → si un numéro visé est un numéro personnel, le régime B2C s'applique. Règle produit : ne cibler que des coordonnées professionnelles.
- **Automates d'appel en B2B** (CNIL) : régime de la prospection par voie électronique → opt-out (pas de consentement préalable) pour les professionnels, information obligatoire. Donc un mode automatisé B2B reste légal sur le fond CNIL, mais bute sur l'exigence NPV côté numéro.

### Réforme du 11 août 2026 (loi du 30 juin 2025)

Le B2C bascule en **opt-in strict** au 11/08/2026. **Le B2B ne bascule pas** : pas de réforme structurelle équivalente pour la prospection entre professionnels, le cadre reste intérêt légitime + droit d'opposition.

## 5. Horaires et fréquence

- Décret 2022-1313 (lun–ven 10h–13h/14h–20h, max 4 appels/30 jours, délai de 60 jours après refus) : vise le démarchage des **consommateurs** (B2C).
- **B2B pur : pas d'obligation légale** sur les horaires et la fréquence. Recommandation : s'aligner quand même sur les heures ouvrées (9h–18h) et une fréquence raisonnable — c'est une bonne pratique commerciale et une protection en cas de contentieux.

## 6. Recommandations pour Combo

### Décision produit (état 2026-08-03)

1. **Mode cible : power dialer click-to-call** — chaque appel déclenché par une action humaine explicite, un seul appel à la fois, aucune parallélisation.
2. **Numéro : fixe FR standard (géographique 01–05)** via Telnyx — légal pour ce mode, disponible au catalogue Telnyx (contrairement au NPV dont la disponibilité est incertaine).
3. **Garde-fou technique à implémenter** : interdire côté backend tout enchaînement automatique (pas de "dial next" automatique après raccrochage, pas de file parallèle). Tant que ce garde-fou existe, Combo reste hors définition "système automatisé".
4. **Si un jour Combo passe en progressif/prédictif** : bascule NPV obligatoire — vérifier d'abord que Telnyx fournit des NPV FR ; sinon changer d'opérateur pour ce mode. C'est une décision produit majeure, pas une simple config.

### Conformité minimale côté produit (B2B)

- [ ] Liste d'opposition interne : tout contact ayant refusé est exclu des campagnes (mécanisme simple d'opposition pendant l'appel + enregistrement).
- [ ] Identification : le script d'appel annonce l'identité de l'organisation dès le début.
- [ ] Registre RGPD : source des données par contact + base légale (intérêt légitime).
- [ ] Coordonnées professionnelles uniquement (pas de mobiles perso de dirigeants/TPE sans vérification).
- [ ] Horaires : appels restreints aux heures ouvrées (recommandé).
- [ ] Fréquence : cap raisonnable par contact (recommandé, ex. pas plus de 2–3 tentatives/semaine).

### Risques résiduels

- Le critère "commande explicite d'un humain pour chaque appel" est une question de fait : si le produit rend l'enchaînement trop automatique (un clic qui lance 20 appels), la qualification de système automatisé pourrait être retenue. Garder le déclenchement unitaire et traçable (audit log des actions humaines).
- La frontière B2B/B2C des TPE/auto-entrepreneurs sur mobile perso reste une zone grise : filtrage par type de numéro si possible.
- Cette note est une recherche documentaire, pas un avis juridique. Validation par un conseil recommandée avant montée en volume.

## Sources

- ARCEP — Décision n° 2022-1583 (plan national de numérotation, §7.1.3 systèmes automatisés) : arcep.fr/uploads/tx_gsavis/22-1583.pdf
- ARCEP — Plan de numérotation pour les professionnels (fiche pratique) : arcep.fr/mes-demarches-et-services/entreprises/fiches-pratiques/plan-numerotation-professionnels.html
- ARCEP — Communiqué "Systèmes automatisés d'appels" + décision Conseil d'État (recours Syntec rejeté) : arcep.fr/actualites/...numerotation-plan-numerotation-130624.html
- CNIL — La prospection commerciale par automates d'appel : cnil.fr/fr/la-prospection-commerciale-par-automates-dappel
- CNIL — Prospection commerciale par téléphone (hors automate) : cnil.fr/fr/prospection-commerciale-par-telephone-hors-automate-dappel-quelles-sont-les-regles
- Nomination — Prospection téléphonique B2B 2026 : nomination.fr/blog/prospection-telephonique-b2b-reglementation
- HUHU — Démarchage téléphonique B2B : num.huhu.fr/fr/a-savoir/reglementation/demarchage-telephonique-b2b-regles-differentes
- Telnyx — France DID Requirements : support.telnyx.com/en/articles/1311445-france-did-requirements
