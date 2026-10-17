/*
  Interface du simulateur.
  Les réponses restent en mémoire de la page : aucun cookie, aucun stockage, aucun envoi réseau.
  Le calcul vient de calcul.js, les hypothèses de config.js.
*/
(function () {
  'use strict';

  var C = window.Calcul;
  var CONFIG = window.CONFIG;
  var NBSP = C.ESPACE_INSECABLE;

  // Coordonnées à remplir
  var CONTACT = {
    nom: '[NOM]',
    secteur: '[SECTEUR]',
    telephone: '[TÉLÉPHONE]',
    email: '[EMAIL]'
  };

  var ORDINATEUR = window.matchMedia('(min-width: 1024px)');

  /* ------------------------------------------------------------------------
     État
     ------------------------------------------------------------------------ */

  var etat = nouvelEtat();

  function nouvelEtat() {
    return {
      ecran: 'residence',
      historique: [],
      calculOuvert: false,
      reponses: {
        residence: null,
        entreSejours: null,
        energie: null,
        inconnu: false,   // « Je ne sais pas » : estimation par la surface
        depense: '',      // saisies brutes, converties au moment du calcul
        surface: '',
        periode: null,
        regulation: null,
        pieces: '',
        peuUtilisees: '0',
        occupation: null,
        temperature: null
      }
    };
  }

  /* ------------------------------------------------------------------------
     Questions
     ------------------------------------------------------------------------ */

  var QUESTIONS = {
    residence: {
      numero: 1,
      champ: 'residence',
      question: 'Ce logement est :',
      options: [
        { valeur: 'principale', libelle: 'Votre résidence principale' },
        { valeur: 'secondaire', libelle: 'Une résidence secondaire' }
      ],
      suivant: function (r) { return r.residence === 'secondaire' ? 'entre-sejours' : 'energie'; }
    },
    'entre-sejours': {
      numero: 2,
      total: 2,
      champ: 'entreSejours',
      question: 'Entre deux séjours, le chauffage est :',
      options: [
        { valeur: 'coupe', libelle: 'Coupé' },
        { valeur: 'hors-gel', libelle: 'En hors-gel' },
        { valeur: 'maintenu', libelle: 'Maintenu en température' }
      ],
      suivant: function () { return 'residence-secondaire'; }
    },
    energie: {
      numero: 2,
      champ: 'energie',
      question: 'Comment vous chauffez-vous ?',
      options: [
        { valeur: 'gaz', libelle: 'Gaz (chaudière et radiateurs)' },
        { valeur: 'electricite', libelle: 'Électricité (radiateurs)' },
        { valeur: 'fioul', libelle: 'Fioul' },
        { valeur: 'pac', libelle: 'Pompe à chaleur ou plancher chauffant' },
        { valeur: 'bois', libelle: 'Bois ou granulés (poêle)' }
      ],
      suivant: function (r) {
        if (r.energie === 'bois') return 'poele';
        return r.inconnu ? 'depense-inconnue' : 'depense';
      }
    },
    depense: {
      numero: 3,
      suivant: function () { return 'regulation'; }
    },
    'depense-inconnue': {
      numero: 3,
      suivant: function () { return 'regulation'; }
    },
    regulation: {
      numero: 4,
      champ: 'regulation',
      question: 'Comment réglez-vous le chauffage aujourd\'hui ?',
      options: [
        { valeur: 'main', libelle: 'À la main, rien n\'est programmé', aide: 'Vous allumez, éteignez ou tournez les boutons vous-même.' },
        { valeur: 'thermostat', libelle: 'Un thermostat d\'ambiance non programmé', aide: 'Un boîtier au mur règle la même température pour tout le logement.' },
        { valeur: 'programmable', libelle: 'Un thermostat programmable ou connecté unique (Tado, Netatmo…)', aide: 'Un seul appareil, avec des horaires, pour tout le logement.' },
        { valeur: 'robinets', libelle: 'Des robinets thermostatiques classiques sur les radiateurs', aide: 'Une molette graduée sur chaque radiateur, sans horaires.' },
        { valeur: 'piece', libelle: 'Déjà pièce par pièce, avec programmation', aide: 'Chaque pièce a ses propres horaires et températures.' }
      ],
      suivant: function () { return 'pieces'; }
    },
    pieces: {
      numero: 5,
      suivant: function () { return 'occupation'; }
    },
    occupation: {
      numero: 6,
      champ: 'occupation',
      question: 'En semaine, en journée, le logement est :',
      options: [
        { valeur: 'vide', libelle: 'Vide' },
        { valeur: 'teletravail', libelle: 'Occupé une partie de la semaine (télétravail)' },
        { valeur: 'occupe', libelle: 'Occupé toute la journée' }
      ],
      suivant: function () { return 'temperature'; }
    },
    temperature: {
      numero: 7,
      champ: 'temperature',
      question: 'Température habituelle dans les pièces de vie :',
      options: [
        { valeur: '18', libelle: '18' + NBSP + '°C' },
        { valeur: '19', libelle: '19' + NBSP + '°C' },
        { valeur: '20', libelle: '20' + NBSP + '°C' },
        { valeur: '21', libelle: '21' + NBSP + '°C' },
        { valeur: '22', libelle: '22' + NBSP + '°C ou plus' }
      ],
      suivant: function () { return 'resultat'; }
    }
  };

  var NOMBRE_QUESTIONS = 7;

  var PERIODES = [
    { valeur: 'avant-1975', libelle: 'Avant 1975', recap: 'construit avant 1975' },
    { valeur: '1975-1989', libelle: '1975 – 1989', recap: 'construit entre 1975 et 1989' },
    { valeur: '1990-2005', libelle: '1990 – 2005', recap: 'construit entre 1990 et 2005' },
    { valeur: '2006-2012', libelle: '2006 – 2012', recap: 'construit entre 2006 et 2012' },
    { valeur: 'apres-2012', libelle: 'Après 2012', recap: 'construit après 2012' }
  ];

  var AIDE_DEPENSE = {
    gaz: 'Environ 70' + NBSP + '% de votre facture annuelle de gaz si vous chauffez aussi l\'eau au gaz.',
    fioul: 'Seulement le chauffage, sans l\'eau chaude si elle est aussi au fioul.',
    electricite: 'Seulement la part chauffage de votre facture d\'électricité. En cas de doute, choisissez « Je ne sais pas ».',
    pac: 'Seulement la part chauffage de votre facture d\'électricité. En cas de doute, choisissez « Je ne sais pas ».'
  };

  /* ------------------------------------------------------------------------
     Lecture et validation des réponses
     ------------------------------------------------------------------------ */

  function entier(texte) {
    var chiffres = String(texte).replace(/[^\d]/g, '');
    return chiffres === '' ? null : parseInt(chiffres, 10);
  }

  function dansLimites(valeur, limites) {
    return valeur !== null && valeur >= limites[0] && valeur <= limites[1];
  }

  function depenseValide(r) {
    return dansLimites(entier(r.depense), CONFIG.limites.depense);
  }

  function surfaceValide(r) {
    return dansLimites(entier(r.surface), CONFIG.limites.surface);
  }

  function nombrePieces(r) {
    return entier(r.pieces);
  }

  function nombrePeu(r) {
    var n = entier(r.peuUtilisees);
    return n === null ? 0 : n;
  }

  function piecesValides(r) {
    var n = nombrePieces(r);
    return dansLimites(n, CONFIG.limites.pieces) && nombrePeu(r) <= n;
  }

  function ecranComplet(ecran, r) {
    switch (ecran) {
      case 'depense': return depenseValide(r);
      case 'depense-inconnue': return surfaceValide(r) && r.periode !== null;
      case 'pieces': return piecesValides(r);
      default: return r[QUESTIONS[ecran].champ] !== null;
    }
  }

  // Réponses mises en forme pour calcul.js
  function donneesCalcul(r) {
    return {
      residence: r.residence,
      entreSejours: r.entreSejours,
      energie: r.energie,
      depense: r.inconnu ? null : entier(r.depense),
      surface: entier(r.surface),
      periode: r.periode,
      regulation: r.regulation,
      pieces: nombrePieces(r),
      peuUtilisees: nombrePeu(r),
      occupation: r.occupation,
      temperature: r.temperature === null ? null : parseInt(r.temperature, 10)
    };
  }

  /* ------------------------------------------------------------------------
     Mise en forme
     ------------------------------------------------------------------------ */

  function echapper(texte) {
    return String(texte)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Montant insécable : « 1 800 € »
  function montant(valeur, unite) {
    return '<span class="montant">' + C.avecUnite(valeur, unite || '€') + '</span>';
  }

  // Plage insécable : « 11 à 20 % », « 2 à 4 hivers »
  function plage(bas, haut, unite) {
    var texte = bas === haut
      ? C.avecUnite(bas, unite)
      : C.formaterNombre(bas) + ' à ' + C.avecUnite(haut, unite);
    return '<span class="nowrap">' + texte + '</span>';
  }

  // Pourcentages arrondis à l'unité : 3,33 → « 3 »
  function plagePourcent(bas, haut) {
    var b = C.formaterNombre(Math.round(bas));
    var h = C.formaterNombre(Math.round(haut));
    return '<span class="nowrap chiffre">' + (b === h ? b : b + ' à ' + h) + NBSP + '%</span>';
  }

  function hiversTexte(n) {
    return n + NBSP + (n > 1 ? 'hivers' : 'hiver');
  }

  function plageHivers(retour) {
    if (retour[1] === Infinity) return '<span class="nowrap">' + hiversTexte(retour[0]) + '</span> au mieux';
    if (retour[0] === retour[1]) return 'environ <span class="nowrap">' + hiversTexte(retour[0]) + '</span>';
    return '<span class="nowrap">' + retour[0] + ' à ' + hiversTexte(retour[1]) + '</span>';
  }

  function majuscule(texte) {
    return texte.charAt(0).toUpperCase() + texte.slice(1);
  }

  var NOMBRES = ['zéro', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
    'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf', 'vingt'];

  var ENERGIE_RECAP = {
    gaz: 'au gaz',
    electricite: 'à l\'électricité',
    fioul: 'au fioul',
    pac: 'avec une pompe à chaleur ou un plancher chauffant'
  };

  var ENERGIE_NOM = {
    gaz: 'du gaz',
    electricite: 'de l\'électricité',
    fioul: 'du fioul',
    pac: 'de l\'électricité'
  };

  var REGULATION_RECAP = {
    main: 'rien de programmé',
    thermostat: 'avec un thermostat d\'ambiance non programmé',
    programmable: 'avec un thermostat programmable',
    robinets: 'avec des robinets thermostatiques',
    piece: 'déjà réglé pièce par pièce'
  };

  var OCCUPATION_RECAP = {
    vide: 'vide en journée',
    teletravail: 'occupé une partie de la semaine',
    occupe: 'occupé toute la journée'
  };

  function temperatureTexte(t) {
    return C.avecUnite(t, '°C') + (t >= 22 ? ' ou plus' : '');
  }

  function piecesRecap(d) {
    var n = d.pieces;
    var texte = n + NBSP + (n > 1 ? 'pièces' : 'pièce');
    if (d.peuUtilisees === 0) return texte + (n > 1 ? ' toutes utilisées' : ' utilisée');
    if (d.peuUtilisees === n) return texte + (n > 1 ? ' toutes peu utilisées' : ' peu utilisée');
    return texte + ' dont ' + d.peuUtilisees + ' peu ' + (d.peuUtilisees > 1 ? 'utilisées' : 'utilisée');
  }

  function recapitulatif(d) {
    var morceaux = ['un logement ' + ENERGIE_RECAP[d.energie]];
    if (d.depense === null) {
      var periode = PERIODES.filter(function (p) { return p.valeur === d.periode; })[0];
      morceaux.push(C.avecUnite(d.surface, 'm²') + ' ' + periode.recap);
    } else {
      morceaux.push(C.avecUnite(d.depense, '€') + ' par an');
    }
    morceaux.push(REGULATION_RECAP[d.regulation]);
    morceaux.push(piecesRecap(d));
    morceaux.push(OCCUPATION_RECAP[d.occupation]);
    morceaux.push('chauffé à ' + temperatureTexte(d.temperature));
    return 'Calculé pour ' + morceaux.join(', ') + '.';
  }

  /* ------------------------------------------------------------------------
     Composants
     ------------------------------------------------------------------------ */

  function progression(numero, total) {
    var barres = '';
    for (var i = 1; i <= total; i++) {
      barres += '<div class="progression__barre' + (i <= numero ? ' est-faite' : '') + '"></div>';
    }
    return '<div class="progression">' +
      '<p class="progression__texte" tabindex="-1" data-focus>Question ' + numero + ' sur ' + total + '</p>' +
      '<div class="progression__barres" aria-hidden="true" style="--total: ' + total + '">' + barres + '</div>' +
      '</div>';
  }

  function option(nom, opt, choisie, compacte) {
    var classes = 'option' + (opt.aide ? ' option--detaillee' : '') + (compacte ? ' option--compacte' : '');
    return '<label class="' + classes + '">' +
      '<input class="option__rond" type="radio" name="' + nom + '" value="' + echapper(opt.valeur) + '"' +
      (choisie === opt.valeur ? ' checked' : '') + '>' +
      '<span class="option__texte">' +
      '<span class="option__libelle">' + echapper(opt.libelle) + '</span>' +
      (opt.aide ? '<span class="option__aide">' + echapper(opt.aide) + '</span>' : '') +
      '</span></label>';
  }

  function actions(avecRetour, complet, sansMarge) {
    var classes = 'actions' + (avecRetour ? '' : ' actions--seul') + (sansMarge ? ' actions--sans-marge' : '');
    return '<div class="' + classes + '">' +
      (avecRetour ? '<button type="button" class="bouton bouton--secondaire" data-action="retour">Retour</button>' : '') +
      '<button type="submit" class="bouton" data-continuer' + (complet ? '' : ' disabled') + '>Continuer</button>' +
      '</div>';
  }

  var SVG_MOINS = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14"/></svg>';
  var SVG_PLUS = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 5v14"/></svg>';
  var SVG_CHEVRON = '<svg class="repliable__chevron" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  function compteur(id, valeur, libelleMoins, libellePlus, decrit) {
    return '<div class="compteur">' +
      '<button type="button" class="compteur__bouton" data-compteur="' + id + '" data-pas="-1" aria-label="' + libelleMoins + '" aria-controls="' + id + '">' + SVG_MOINS + '</button>' +
      '<input id="' + id + '" class="compteur__valeur" type="text" inputmode="numeric" autocomplete="off" maxlength="2" value="' + echapper(valeur) + '"' +
      (decrit ? ' aria-describedby="' + decrit + '"' : '') + '>' +
      '<button type="button" class="compteur__bouton" data-compteur="' + id + '" data-pas="1" aria-label="' + libellePlus + '" aria-controls="' + id + '">' + SVG_PLUS + '</button>' +
      '</div>';
  }

  function intro() {
    return '<div class="intro">' +
      '<h1 class="intro__titre">Estimez en 1' + NBSP + 'minute ce que le pilotage pièce par pièce peut vous faire économiser.</h1>' +
      '<p class="intro__texte">Gratuit, sans inscription, rien n\'est enregistré.</p>' +
      pied() +
      '</div>';
  }

  function pied() {
    return '<p class="pied">Un outil proposé par ' + CONTACT.nom + ', installateur à ' + CONTACT.secteur + '. ' +
      '<a href="mentions-legales.html">Mentions légales</a></p>';
  }

  function boutonsContact() {
    return '<div class="pile pile--decalee">' +
      '<a class="bouton" href="tel:' + CONTACT.telephone + '">Appeler le ' + CONTACT.telephone + '</a>' +
      '<a class="bouton bouton--secondaire" href="mailto:' + CONTACT.email + '">Écrire à ' + CONTACT.email + '</a>' +
      '</div>';
  }

  function qui() {
    return '<section class="qui" aria-labelledby="titre-qui">' +
      '<h2 id="titre-qui" class="intertitre intertitre--3">Qui a fait cet outil</h2>' +
      '<p>' + CONTACT.nom + ', installateur indépendant à ' + CONTACT.secteur + '.</p>' +
      '<p>J\'installe le pilotage du chauffage pièce par pièce, sans travaux.</p>' +
      '<p><a href="mentions-legales.html">Mentions légales</a></p>' +
      '</section>';
  }

  function fin() {
    return '<div class="fin">' +
      '<button type="button" class="bouton bouton--secondaire" data-action="modifier">Modifier mes réponses</button>' +
      '<button type="button" class="lien-action" data-action="recommencer">Recommencer</button>' +
      '</div>';
  }

  function recap(d) {
    return '<div class="recap">' +
      '<p class="recap__texte">' + recapitulatif(d) + '</p>' +
      '<button type="button" class="lien-action lien-action--petit" data-action="modifier">Modifier mes réponses</button>' +
      '</div>';
  }

  /* ------------------------------------------------------------------------
     Écrans de question
     ------------------------------------------------------------------------ */

  function ecranQuestion(ecran, r) {
    var q = QUESTIONS[ecran];
    var premiere = ecran === 'residence';
    var total = q.total || NOMBRE_QUESTIONS;
    var complet = ecranComplet(ecran, r);
    var contenu;
    var large = false;
    var actionsSansMarge = false;

    if (ecran === 'depense') {
      contenu = contenuDepense(r);
    } else if (ecran === 'depense-inconnue') {
      contenu = contenuLogement(r);
      actionsSansMarge = true;
    } else if (ecran === 'pieces') {
      contenu = contenuPieces(r);
      large = true;
    } else {
      contenu = '<fieldset class="groupe">' +
        '<legend class="question' + (premiere ? ' question--serree' : '') + '">' + echapper(q.question) + '</legend>' +
        '<div class="options">' +
        q.options.map(function (opt) { return option(q.champ, opt, r[q.champ], false); }).join('') +
        '</div></fieldset>';
    }

    return '<div class="ecran ecran-question' + (premiere ? ' est-premiere' : '') + '">' +
      intro() +
      '<form class="formulaire' + (large ? ' formulaire--large' : '') + '" novalidate data-ecran="' + ecran + '">' +
      progression(q.numero, total) +
      contenu +
      actions(!premiere, complet, actionsSansMarge) +
      '</form>' +
      (premiere ? pied() : '') +
      '</div>';
  }

  function contenuDepense(r) {
    var erreur = r.depense !== '' && !depenseValide(r);
    var lim = CONFIG.limites.depense;
    return '<div class="champ-groupe champ-groupe--question">' +
      '<label for="depense" class="question question--label">Combien dépensez-vous par an pour le chauffage ?</label>' +
      '<div class="champ">' +
      '<input id="depense" class="champ__saisie" type="text" inputmode="numeric" autocomplete="off" aria-describedby="depense-aide depense-erreur" value="' + echapper(r.depense) + '">' +
      '<span class="champ__unite">€ par an</span>' +
      '</div>' +
      '<p id="depense-aide" class="aide">' + echapper(AIDE_DEPENSE[r.energie] || '') + '</p>' +
      '<p id="depense-erreur" class="aide" data-erreur' + (erreur ? '' : ' hidden') + '>Indiquez un montant entre ' +
      C.avecUnite(lim[0], '€') + ' et ' + C.avecUnite(lim[1], '€') + ' par an.</p>' +
      '<button type="button" class="lien-action" data-action="je-ne-sais-pas">Je ne sais pas</button>' +
      '</div>';
  }

  function contenuLogement(r) {
    var erreur = r.surface !== '' && !surfaceValide(r);
    var lim = CONFIG.limites.surface;
    return '<div class="titre-groupe">' +
      '<h2 class="question question--label">Combien dépensez-vous par an pour le chauffage ?</h2>' +
      '<p class="corps secondaire">Nous allons l\'estimer à partir de votre logement.</p>' +
      '</div>' +
      '<div class="champ-groupe">' +
      '<label for="surface" class="sous-question">Surface chauffée</label>' +
      '<div class="champ champ--court">' +
      '<input id="surface" class="champ__saisie" type="text" inputmode="numeric" autocomplete="off" maxlength="4" aria-describedby="surface-erreur" value="' + echapper(r.surface) + '">' +
      '<span class="champ__unite">m²</span>' +
      '</div>' +
      '<p id="surface-erreur" class="aide" data-erreur' + (erreur ? '' : ' hidden') + '>Indiquez une surface entre ' +
      C.avecUnite(lim[0], 'm²') + ' et ' + C.avecUnite(lim[1], 'm²') + '.</p>' +
      '</div>' +
      '<fieldset class="groupe">' +
      '<legend class="sous-question">Période de construction</legend>' +
      '<div class="options options--serrees">' +
      PERIODES.map(function (p) { return option('periode', p, r.periode, true); }).join('') +
      '</div></fieldset>' +
      '<button type="button" class="lien-action" data-action="saisir-montant">Saisir plutôt le montant</button>';
  }

  function contenuPieces(r) {
    return '<div class="question-compteur">' +
      '<label for="pieces" class="question question--label">Combien de pièces sont chauffées ?</label>' +
      compteur('pieces', r.pieces, 'Une pièce chauffée de moins', 'Une pièce chauffée de plus') +
      '</div>' +
      '<div class="question-compteur">' +
      '<div class="question-compteur__entete">' +
      '<label for="peuUtilisees" class="question question--label">Combien sont peu utilisées ?</label>' +
      '<p id="peu-aide" class="aide">Chambre d\'amis, bureau vide en semaine…</p>' +
      '</div>' +
      compteur('peuUtilisees', r.peuUtilisees, 'Une pièce peu utilisée de moins', 'Une pièce peu utilisée de plus', 'peu-aide') +
      '</div>';
  }

  /* ------------------------------------------------------------------------
     Écran de résultat
     ------------------------------------------------------------------------ */

  function journee(d) {
    var j = C.journeeType(d);
    var T = d.temperature;
    var legende = [
      ['confort', C.avecUnite(T, '°C')],
      j.niveaux.nuit ? ['nuit', C.avecUnite(j.niveaux.nuit, '°C') + ', nuit'] : null,
      ['tempere', C.avecUnite(j.niveaux.tempere, '°C') + ', tempéré']
    ].filter(Boolean).map(function (l) {
      return '<li class="legende__element"><span class="legende__echantillon legende__echantillon--' + l[0] + '"></span><span>' + l[1] + '</span></li>';
    }).join('');

    function piste(plages) {
      return '<div class="piste">' + plages.map(function (p) {
        return '<span class="plage plage--' + p.niveau + '" style="--debut: ' + p.debut + '; --duree-h: ' + (p.fin - p.debut) + '"></span>';
      }).join('') + '</div>';
    }

    var lignes = j.pieces.map(function (p) {
      return '<div class="journee__piece">' +
        '<div class="journee__nom">' + echapper(p.nom) + '</div>' +
        '<div class="journee__etiquette">Aujourd\'hui</div>' + piste(p.aujourdhui) +
        '<div class="journee__etiquette journee__etiquette--pilotage">Avec pilotage</div>' + piste(p.pilotage) +
        '</div>';
    }).join('');

    var axe = [0, 6, 12, 18, 24].map(function (h) {
      return '<span class="axe__heure axe__heure--' + h + '">' + C.avecUnite(h, 'h') + '</span>';
    }).join('');

    var n = d.pieces;
    var temp = C.avecUnite(T, '°C');
    var heures = C.avecUnite(j.debut, 'h') + ' à ' + C.avecUnite(j.fin, 'h');
    var phrase = n === 1
      ? 'Aujourd\'hui, la pièce est à ' + temp + ' de ' + heures + '. Avec le pilotage, elle n\'est à ' + temp +
        ' que lorsque vous y êtes, et reste tempérée le reste du temps.'
      : 'Aujourd\'hui, les ' + (NOMBRES[n] || n) + ' pièces sont à ' + temp + ' de ' + heures +
        '. Avec le pilotage, chacune n\'est à ' + temp + ' que lorsque vous y êtes, et reste tempérée le reste du temps.';

    return '<section class="bloc" aria-labelledby="titre-journee">' +
      '<div class="journee">' +
      '<div class="journee__entete">' +
      '<h2 id="titre-journee" class="intertitre">Une journée type, pièce par pièce</h2>' +
      '<span class="etiquette">Exemple de programme</span>' +
      '</div>' +
      '<ul class="legende" aria-hidden="true">' + legende + '</ul>' +
      '<div class="journee__grille" aria-hidden="true">' +
      '<div class="journee__ligne-axe"><div></div><div class="axe">' + axe + '</div></div>' +
      lignes +
      '</div>' +
      '<p class="journee__phrase">' + phrase + '</p>' +
      '</div>' +
      '</section>';
  }

  function confort(d) {
    var items = C.listeConfort(d).map(function (item) {
      return '<li><span>' + echapper(item.texte) +
        (item.precision ? ' <span class="secondaire">' + echapper(item.precision) + '</span>' : '') +
        '</span></li>';
    }).join('');
    return '<section class="bloc" aria-labelledby="titre-confort">' +
      '<h2 id="titre-confort" class="intertitre">Ce que vous gagnez en confort</h2>' +
      '<ul class="liste-puces">' + items + '</ul>' +
      '</section>';
  }

  function bonus(res, note) {
    return '<section class="encadre" aria-label="Baisser de 1 °C">' +
      '<p class="encadre__titre">Si vous baissez de ' + C.avecUnite(1, '°C') + ' : environ ' + montant(res.bonusDegre.euros) +
      (note ? ' par an' : ' de plus par an') + '</p>' +
      '<p class="note">' + (note || 'Ce montant n\'est pas compté dans l\'estimation.') + '</p>' +
      '</section>';
  }

  var PROGRAMMATION_RAISON = {
    main: 'rien n\'est programmé',
    thermostat: 'votre thermostat n\'est pas programmé',
    robinets: 'vos robinets n\'ont pas d\'horaires',
    programmable: 'votre chauffage est déjà programmé',
    piece: 'votre chauffage est déjà programmé pièce par pièce'
  };

  var OCCUPATION_RAISON = {
    vide: 'le logement est vide en journée',
    teletravail: 'le logement est occupé une partie de la semaine',
    occupe: 'le logement est occupé toute la journée'
  };

  function hypotheses(d, res) {
    var L = res.leviers;
    var f = res.facture;
    var lignes = [];
    var energie = d.energie;
    var prix = C.formaterNombre(f.prixFacture, 2) + NBSP + '€ le kWh';

    var depense = d.depense === null
      ? 'environ ' + montant(f.euros) + ' par an, ' + ENERGIE_RECAP[energie] + ', estimés pour ' + C.avecUnite(d.surface, 'm²') +
        ' à ' + C.avecUnite(CONFIG.consoParPeriode[d.periode], 'kWh') + ' par m² et par an'
      : montant(d.depense) + ' par an, ' + ENERGIE_RECAP[energie];
    lignes.push(['Votre dépense de chauffage', depense]);

    if (energie === 'pac') {
      lignes.push(['Prix de l\'électricité retenu', prix + ', soit environ ' + montant(f.kwh, 'kWh') +
        ' d\'électricité par an. Une pompe à chaleur donne environ ' + CONFIG.diviseurPac + NBSP + 'kWh de chaleur par kWh d\'électricité']);
    } else {
      lignes.push(['Prix ' + ENERGIE_NOM[energie] + ' retenu', prix + ', soit environ ' + montant(f.kwh, 'kWh') + ' de chauffage par an']);
    }

    lignes.push(['Programmation selon vos horaires', plagePourcent(L.programmation[0], L.programmation[1]) +
      ', car ' + PROGRAMMATION_RAISON[d.regulation] +
      (d.regulation === 'programmable' || d.regulation === 'piece' ? '' : ' et ' + OCCUPATION_RAISON[d.occupation])]);

    var pieces;
    if (d.regulation === 'piece') pieces = ', vos pièces sont déjà réglées une par une';
    else if (d.peuUtilisees === 0) pieces = ', toutes vos pièces sont utilisées';
    else pieces = ', pour ' + d.peuUtilisees + ' ' + (d.peuUtilisees > 1 ? 'pièces' : 'pièce') + ' sur ' + d.pieces;
    lignes.push(['Pièces peu utilisées tempérées', plagePourcent(L.pieces[0], L.pieces[1]) + pieces]);

    if (L.coefficient !== 1) {
      lignes.push(['Pompe à chaleur ou plancher chauffant', '<span class="nowrap chiffre">×' + NBSP + C.formaterNombre(L.coefficient, 1) +
        '</span> sur les deux leviers : ce chauffage gagne moins à la programmation']);
    }

    var total = plagePourcent(L.total[0], L.total[1]) + ', soit ' + plage(res.economie[0], res.economie[1], '€') +
      ' et ' + plage(res.kwh[0], res.kwh[1], 'kWh') + ' par an';
    if (L.plafonne) {
      total += ' (plafonné à ' + C.avecUnite(CONFIG.plafond.bas, '%') + ' pour le bas et ' + C.avecUnite(CONFIG.plafond.haut, '%') + ' pour le haut)';
    }
    lignes.push(['Total', total, true]);

    var inv = CONFIG.investissement;
    var detailInv = ' (prestation ' + montant(inv.prestation) + ', ' + plage(inv.parPiece[0], inv.parPiece[1], '€') +
      ' par pièce, box ' + plage(inv.box[0], inv.box[1], '€') + ')';
    var installation = plage(res.investissement[0], res.investissement[1], '€') + ' pour ' + d.pieces + NBSP +
      (d.pieces > 1 ? 'pièces' : 'pièce') + detailInv;
    installation += res.gainLimite
      ? ' : plus de ' + hiversTexte(CONFIG.gainLimite.retourMaxHivers) + ' pour la rembourser'
      : ', remboursés en ' + plageHivers(res.retour);
    lignes.push(['Installation', installation]);

    lignes.push(['Baisser de ' + C.avecUnite(1, '°C'), 'environ ' + C.avecUnite(CONFIG.gainParDegre, '%') +
      ' de consommation en moins, soit environ ' + montant(res.bonusDegre.euros) + ' par an']);

    var dl = lignes.map(function (l) {
      var total = l[2] ? ' class="est-total"' : '';
      return '<dt' + total + '>' + l[0] + '</dt><dd' + total + '>' + l[1] + '</dd>';
    }).join('');

    var s = CONFIG.sources;
    var sources = 'Repères de l\'' + s.nom + ' : ' + s.reperes.join(', ').replace(/ (\d+) %/g, ' $1' + NBSP + '%') + '. ' +
      '<a href="' + echapper(s.lien) + '">' + echapper(s.lien) + '</a>. ' +
      'Les fourchettes sont larges parce que l\'isolation et les habitudes varient d\'un logement à l\'autre.';

    return '<dl class="hypotheses">' + dl + '</dl><p class="sources">' + sources + '</p>';
  }

  function sectionCalcul(d, res, colle) {
    var ouvert = etat.calculOuvert;
    return '<section class="section-calcul' + (colle ? ' section-calcul--colle' : '') + '" aria-label="Comment c\'est calculé">' +
      '<div class="repliable">' +
      '<button type="button" class="repliable__bouton" aria-expanded="' + ouvert + '" aria-controls="calcul" data-action="replier">' +
      '<span>Comment c\'est calculé</span>' + SVG_CHEVRON + '</button>' +
      '<div id="calcul" class="repliable__contenu"' + (ouvert ? '' : ' hidden') + '>' + hypotheses(d, res) + '</div>' +
      '</div>' +
      '<p class="mention">Estimation indicative, pas une garantie.</p>' +
      '</section>';
  }

  function bilan() {
    return '<section class="bloc bloc--fort" aria-labelledby="titre-bilan">' +
      '<h2 id="titre-bilan" class="intertitre">Demander un bilan gratuit de 30' + NBSP + 'minutes</h2>' +
      '<p class="corps">Je regarde avec vous votre installation et ce qui vaut vraiment la peine d\'être fait.</p>' +
      boutonsContact() +
      '</section>';
  }

  function ecranResultat(d, res) {
    var titre = res.economie[0] === res.economie[1]
      ? 'Environ ' + montant(res.economie[1]) + ' d\'économies par an'
      : 'Entre ' + montant(res.economie[0]) + ' et ' + montant(res.economie[1]) + ' d\'économies par an';
    var kwh = plage(res.kwh[0], res.kwh[1], 'kWh') + (d.energie === 'pac' ? ' d\'électricité' : '');
    var ordinateur = ORDINATEUR.matches;

    var gauche = '<section class="resultat__tete" aria-labelledby="titre-resultat">' +
      '<div class="fourchette">' +
      '<h1 id="titre-resultat" class="fourchette__montant" tabindex="-1" data-focus>' + titre + '</h1>' +
      '<p class="fourchette__detail">soit ' + plage(res.pourcentage[0], res.pourcentage[1], '%') + ' de votre chauffage, ' + kwh + '</p>' +
      '</div>' +
      '<div class="investissement">' +
      '<p class="investissement__titre">Investissement remboursé en ' + plageHivers(res.retour) + '</p>' +
      '<p class="aide">Installation estimée entre ' + montant(res.investissement[0]) + ' et ' + montant(res.investissement[1]) + '.</p>' +
      '</div>' +
      recap(d) +
      '</section>' +
      (ordinateur ? bilan() : '');

    var droite = journee(d) +
      confort(d) +
      (res.bonusDegre.affiche ? bonus(res) : '') +
      sectionCalcul(d, res, false) +
      (ordinateur ? '' : bilan()) +
      qui() +
      fin();

    return '<div class="ecran resultat">' +
      '<div class="resultat__colonne-gauche">' + gauche + '</div>' +
      '<div class="resultat__colonne-droite">' + droite + '</div>' +
      '</div>';
  }

  var RAISONS = {
    'deja-programme': 'votre chauffage est déjà programmé',
    'deja-piece-par-piece': 'votre chauffage est déjà réglé pièce par pièce',
    'toutes-pieces-utilisees': 'toutes vos pièces sont utilisées',
    pac: 'avec une pompe à chaleur ou un plancher chauffant, la programmation fait gagner moins',
    occupe: 'le logement est occupé toute la journée',
    'petite-facture': 'votre facture de chauffage est déjà petite',
    'retour-long': 'l\'installation mettrait plus de ' + hiversTexte(CONFIG.gainLimite.retourMaxHivers) + ' à se rembourser'
  };

  var BONUS_NOTE = {
    main: 'Sans rien installer, en réglant vos radiateurs.',
    thermostat: 'Sans rien installer, avec votre thermostat actuel.',
    programmable: 'Sans rien installer, avec votre thermostat actuel.',
    robinets: 'Sans rien installer, avec vos robinets actuels.',
    piece: 'Sans rien installer, avec votre programmation actuelle.'
  };

  function ecranGainLimite(d, res) {
    var titre = 'Chez vous, le gain serait limité : ' + (res.economie[0] === res.economie[1]
      ? 'environ ' + montant(res.economie[1])
      : 'entre ' + montant(res.economie[0]) + ' et ' + montant(res.economie[1])) + ' par an.';
    var raison = majuscule(res.raisons.slice(0, 2).map(function (code) { return RAISONS[code]; }).join(', et ')) + '.';
    var avecBonus = res.bonusDegre.affiche;

    return '<div class="ecran ecran-fin">' +
      '<section class="resultat__tete resultat__tete--serree" aria-labelledby="titre-resultat">' +
      '<h1 id="titre-resultat" class="titre-ecran" tabindex="-1" data-focus>' + titre + '</h1>' +
      '<p class="raison">' + raison + '</p>' +
      recap(d) +
      '</section>' +
      '<section class="bloc" aria-labelledby="titre-davantage">' +
      '<h2 id="titre-davantage" class="intertitre intertitre--2">' +
      (avecBonus ? 'Ce qui compterait davantage chez vous' : 'Ce que le pilotage vous apporterait') + '</h2>' +
      (avecBonus ? bonus(res, BONUS_NOTE[d.regulation]) : '') +
      '<p class="corps corps--petit">Le pilotage pièce par pièce apporterait surtout du confort : réglage depuis votre téléphone, ' +
      'chauffage coupé quand une fenêtre est ouverte. Pas d\'économie notable.</p>' +
      '</section>' +
      sectionCalcul(d, res, true) +
      '<section class="bloc bloc--discret" aria-labelledby="titre-bilan">' +
      '<h2 id="titre-bilan" class="intertitre intertitre--3">Un avis sur votre installation ?</h2>' +
      '<p class="aide">Le bilan gratuit de 30' + NBSP + 'minutes reste possible.</p>' +
      '<div class="liens-contact">' +
      '<a href="tel:' + CONTACT.telephone + '">Appeler le ' + CONTACT.telephone + '</a>' +
      '<a href="mailto:' + CONTACT.email + '">Écrire à ' + CONTACT.email + '</a>' +
      '</div>' +
      '</section>' +
      qui() +
      fin() +
      '</div>';
  }

  /* ------------------------------------------------------------------------
     Résidence secondaire et poêle
     ------------------------------------------------------------------------ */

  var SECONDAIRE_MESSAGE = {
    maintenu: 'Maintenir le logement en température entre deux séjours, c\'est là que se trouve le plus gros gain. ' +
      'Il dépend surtout de votre rythme de séjours : parlons-en.',
    'hors-gel': 'Le gain dépend surtout de votre rythme de séjours : parlons-en.',
    coupe: 'Le gain dépend surtout de votre rythme de séjours : parlons-en.'
  };

  function ecranResidenceSecondaire(r) {
    var avantages = [
      ['Chauffage relancé à distance avant d\'arriver', 'Depuis votre téléphone, quelques heures avant votre arrivée.'],
      ['Hors-gel surveillé', 'Le logement reste juste au-dessus du gel pendant votre absence.'],
      ['Alerte si la température chute', 'Vous êtes prévenu sur votre téléphone en cas de panne ou de coupure.']
    ].map(function (a) {
      return '<li><span class="liste-puces__contenu"><span class="liste-puces__titre">' + a[0] + '</span>' +
        '<span class="note">' + a[1] + '</span></span></li>';
    }).join('');

    // Lundi 0 h = 0 ; vendredi 15 h = 4 × 24 + 15 ; dimanche 17 h = 6 × 24 + 17
    var arrivee = 4 * 24 + 15;
    var depart = 6 * 24 + 17;
    var plages = [[0, arrivee, 'hors-gel'], [arrivee, depart, 'present'], [depart, 168, 'hors-gel']].map(function (p) {
      return '<span class="plage plage--' + p[2] + '" style="--debut: ' + p[0] + '; --duree-h: ' + (p[1] - p[0]) + '"></span>';
    }).join('');
    var jours = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map(function (j) { return '<span>' + j + '</span>'; }).join('');

    return '<div class="ecran ecran-fin">' +
      '<section class="resultat__tete" aria-labelledby="titre-resultat">' +
      '<h1 id="titre-resultat" class="titre-ecran" tabindex="-1" data-focus>Pour une résidence secondaire, le pilotage sert surtout à distance.</h1>' +
      '<ul class="liste-puces liste-puces--titres">' + avantages + '</ul>' +
      '</section>' +
      '<section class="bloc" aria-labelledby="titre-semaine">' +
      '<div class="journee__entete">' +
      '<h2 id="titre-semaine" class="intertitre intertitre--2">Une semaine avec arrivée le vendredi</h2>' +
      '<span class="etiquette">Exemple de programme</span>' +
      '</div>' +
      '<ul class="legende" aria-hidden="true">' +
      '<li class="legende__element"><span class="legende__echantillon legende__echantillon--present"></span><span>' + C.avecUnite(19, '°C') + ', vous êtes là</span></li>' +
      '<li class="legende__element"><span class="legende__echantillon legende__echantillon--hors-gel"></span><span>Hors-gel</span></li>' +
      '</ul>' +
      '<div class="semaine" aria-hidden="true"><div class="piste">' + plages + '</div><div class="semaine__jours">' + jours + '</div></div>' +
      '<dl class="deroule">' +
      '<dt>ven ' + C.avecUnite(15, 'h') + '</dt><dd>Relance depuis votre téléphone, ' + C.avecUnite(19, '°C') + ' à votre arrivée.</dd>' +
      '<dt>dim ' + C.avecUnite(17, 'h') + '</dt><dd>Départ : retour au hors-gel.</dd>' +
      '</dl>' +
      '</section>' +
      '<section class="bloc bloc--fort" aria-labelledby="titre-bilan">' +
      '<p class="accroche">' + SECONDAIRE_MESSAGE[r.entreSejours] + '</p>' +
      '<h2 id="titre-bilan" class="intertitre intertitre--3 intertitre--leger">Demander un bilan gratuit de 30' + NBSP + 'minutes</h2>' +
      boutonsContact().replace(' pile--decalee', '') +
      '</section>' +
      qui() +
      fin() +
      '</div>';
  }

  function ecranPoele() {
    return '<div class="ecran ecran-fin ecran-fin--court">' +
      '<div class="titre-groupe titre-groupe--large">' +
      '<h1 class="titre-ecran" tabindex="-1" data-focus>Avec un poêle, le pilotage apporte peu.</h1>' +
      '<p class="corps corps--large">Les têtes thermostatiques et les modules fil pilote agissent sur des radiateurs. ' +
      'Un poêle se règle à part, le plus souvent avec son propre thermostat.</p>' +
      '<p class="corps corps--large secondaire">Si certaines pièces ont aussi des radiateurs, vous pouvez recommencer en les indiquant.</p>' +
      '</div>' +
      '<div class="pile">' +
      '<button type="button" class="bouton" data-action="recommencer">Recommencer</button>' +
      '<button type="button" class="bouton bouton--secondaire" data-action="retour">Modifier ma réponse</button>' +
      '</div>' +
      pied() +
      '</div>';
  }

  /* ------------------------------------------------------------------------
     Rendu et navigation
     ------------------------------------------------------------------------ */

  var main = document.getElementById('contenu');
  var annonce = document.getElementById('annonce');

  function html() {
    var r = etat.reponses;
    var ecran = etat.ecran;
    if (QUESTIONS[ecran]) return ecranQuestion(ecran, r);
    if (ecran === 'poele') return ecranPoele();
    if (ecran === 'residence-secondaire') return ecranResidenceSecondaire(r);
    var d = donneesCalcul(r);
    var res = C.simuler(d);
    return res.type === 'gain-limite' ? ecranGainLimite(d, res) : ecranResultat(d, res);
  }

  function titreDocument() {
    var q = QUESTIONS[etat.ecran];
    var base = 'Simulateur d\'économies de chauffage';
    if (q) return 'Question ' + q.numero + ' sur ' + (q.total || NOMBRE_QUESTIONS) + ' · ' + base;
    return 'Résultat · ' + base;
  }

  // nouvelEcran : vrai après une action de navigation (animation, défilement, focus)
  function rendre(nouvelEcran) {
    main.innerHTML = html();
    document.title = titreDocument();
    if (etat.ecran === 'pieces') majCompteurs();
    if (!nouvelEcran) return;
    var ecran = main.querySelector('.ecran');
    if (ecran) ecran.classList.add('vient-d-arriver');
    window.scrollTo(0, 0);
    var cible = main.querySelector('[data-focus]');
    if (cible) cible.focus({ preventScroll: true });
  }

  function aller(ecran) {
    etat.historique.push(etat.ecran);
    etat.ecran = ecran;
    rendre(true);
  }

  function retour() {
    if (etat.historique.length === 0) return;
    etat.ecran = etat.historique.pop();
    rendre(true);
  }

  function majContinuer() {
    var bouton = main.querySelector('[data-continuer]');
    if (bouton) bouton.disabled = !ecranComplet(etat.ecran, etat.reponses);
  }

  /* ------------------------------------------------------------------------
     Événements
     ------------------------------------------------------------------------ */

  main.addEventListener('change', function (e) {
    var cible = e.target;
    if (cible.type === 'radio') {
      etat.reponses[cible.name] = cible.value;
      majContinuer();
    }
  });

  main.addEventListener('input', function (e) {
    var cible = e.target;
    var r = etat.reponses;
    if (cible.id === 'depense' || cible.id === 'surface') {
      r[cible.id] = cible.value;
      // Le message d'erreur disparaît dès que la saisie redevient valable
      var erreur = main.querySelector('#' + cible.id + '-erreur');
      if (erreur && (cible.id === 'depense' ? depenseValide(r) : surfaceValide(r))) erreur.hidden = true;
      majContinuer();
    } else if (cible.id === 'pieces' || cible.id === 'peuUtilisees') {
      r[cible.id] = cible.value.replace(/[^\d]/g, '');
      majCompteurs();
    }
  });

  // L'erreur de saisie n'apparaît qu'en quittant le champ, pas pendant la frappe
  main.addEventListener('focusout', function (e) {
    var cible = e.target;
    var r = etat.reponses;
    if (cible.id === 'depense' || cible.id === 'surface') {
      var valide = cible.id === 'depense' ? depenseValide(r) : surfaceValide(r);
      var erreur = main.querySelector('#' + cible.id + '-erreur');
      if (erreur) erreur.hidden = valide || cible.value.trim() === '';
      if (valide) {
        r[cible.id] = C.formaterNombre(entier(cible.value));
        cible.value = r[cible.id];
      }
    } else if (cible.id === 'peuUtilisees' || cible.id === 'pieces') {
      bornerCompteurs();
    }
  });

  main.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!ecranComplet(etat.ecran, etat.reponses)) return;
    bornerCompteurs();
    aller(QUESTIONS[etat.ecran].suivant(etat.reponses));
  });

  main.addEventListener('click', function (e) {
    var bouton = e.target.closest('button');
    if (!bouton) return;

    if (bouton.hasAttribute('data-compteur')) {
      changerCompteur(bouton.getAttribute('data-compteur'), parseInt(bouton.getAttribute('data-pas'), 10));
      return;
    }

    switch (bouton.getAttribute('data-action')) {
      case 'retour':
        retour();
        break;
      case 'je-ne-sais-pas':
        etat.reponses.inconnu = true;
        etat.ecran = 'depense-inconnue';
        rendre(true);
        break;
      case 'saisir-montant':
        etat.reponses.inconnu = false;
        etat.ecran = 'depense';
        rendre(true);
        break;
      case 'modifier':
        // Retour au parcours, réponses conservées
        etat.historique = [];
        etat.ecran = 'residence';
        rendre(true);
        break;
      case 'recommencer':
        etat = nouvelEtat();
        rendre(true);
        break;
      case 'replier':
        etat.calculOuvert = !etat.calculOuvert;
        bouton.setAttribute('aria-expanded', String(etat.calculOuvert));
        document.getElementById('calcul').hidden = !etat.calculOuvert;
        break;
    }
  });

  /* Compteurs de pièces --------------------------------------------------- */

  var LIMITES_PIECES = CONFIG.limites.pieces;

  function changerCompteur(id, pas) {
    var r = etat.reponses;
    var valeur = entier(r[id]);
    if (id === 'pieces') {
      valeur = valeur === null ? LIMITES_PIECES[0] : valeur + pas;
      valeur = Math.max(LIMITES_PIECES[0], Math.min(LIMITES_PIECES[1], valeur));
    } else {
      var max = nombrePieces(r) === null ? 0 : nombrePieces(r);
      valeur = Math.max(0, Math.min(max, (valeur || 0) + pas));
    }
    r[id] = String(valeur);
    bornerCompteurs();
    var champ = document.getElementById(id);
    if (champ) champ.value = r[id];
    annoncer(id);
  }

  // Les pièces peu utilisées ne dépassent jamais les pièces chauffées
  function bornerCompteurs() {
    var r = etat.reponses;
    var n = nombrePieces(r);
    if (n !== null && n > LIMITES_PIECES[1]) r.pieces = String(LIMITES_PIECES[1]);
    n = nombrePieces(r);
    if (nombrePeu(r) > (n || 0)) r.peuUtilisees = String(n || 0);
    var champPeu = document.getElementById('peuUtilisees');
    if (champPeu && document.activeElement !== champPeu) champPeu.value = r.peuUtilisees;
    var champPieces = document.getElementById('pieces');
    if (champPieces && document.activeElement !== champPieces) champPieces.value = r.pieces;
    majCompteurs();
  }

  function majCompteurs() {
    var r = etat.reponses;
    var n = nombrePieces(r);
    var peu = nombrePeu(r);
    main.querySelectorAll('[data-compteur]').forEach(function (b) {
      var id = b.getAttribute('data-compteur');
      var plus = b.getAttribute('data-pas') === '1';
      var desactive;
      if (id === 'pieces') desactive = plus ? n !== null && n >= LIMITES_PIECES[1] : n === null || n <= LIMITES_PIECES[0];
      else desactive = plus ? peu >= (n || 0) : peu <= 0;
      // Garder le focus clavier : un bouton qui a le focus n'est pas désactivé
      if (desactive && document.activeElement === b) return;
      b.disabled = desactive;
    });
    majContinuer();
  }

  function annoncer(id) {
    var r = etat.reponses;
    var n = id === 'pieces' ? nombrePieces(r) : nombrePeu(r);
    var texte = n + ' ' + (n > 1 ? 'pièces' : 'pièce') + (id === 'pieces' ? ' chauffée' : ' peu utilisée') + (n > 1 ? 's' : '');
    annonce.textContent = texte;
  }

  /* Changement de largeur : le bloc « bilan » change de colonne ------------ */

  function auChangementDeLargeur() {
    if (etat.ecran === 'resultat') rendre(false);
  }
  if (ORDINATEUR.addEventListener) ORDINATEUR.addEventListener('change', auChangementDeLargeur);
  else if (ORDINATEUR.addListener) ORDINATEUR.addListener(auChangementDeLargeur);

  /* Démarrage -------------------------------------------------------------- */

  rendre(false);
})();
