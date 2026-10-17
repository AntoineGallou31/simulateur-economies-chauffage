/*
  Calcul du simulateur : fonctions pures, aucune dépendance au DOM.
  Toutes les hypothèses viennent de config.js.

  Réponses attendues (objet « reponses ») :
    residence      'principale' | 'secondaire'
    entreSejours   'coupe' | 'hors-gel' | 'maintenu'          (résidence secondaire)
    energie        'gaz' | 'electricite' | 'fioul' | 'pac' | 'bois'
    depense        nombre (€ par an), ou null si « Je ne sais pas »
    surface        nombre (m²)                                 (si « Je ne sais pas »)
    periode        'avant-1975' | '1975-1989' | '1990-2005' | '2006-2012' | 'apres-2012'
    regulation     'main' | 'thermostat' | 'programmable' | 'robinets' | 'piece'
    pieces         nombre de pièces chauffées
    peuUtilisees   nombre de pièces peu utilisées (≤ pieces)
    occupation     'vide' | 'teletravail' | 'occupe'
    temperature    18 | 19 | 20 | 21 | 22 (22 = « 22 °C ou plus »)
*/
(function (racine) {
  'use strict';

  var CONFIG = (typeof module !== 'undefined' && module.exports)
    ? require('./config.js')
    : racine.CONFIG;

  /* ------------------------------------------------------------------------
     Outils
     ------------------------------------------------------------------------ */

  function arrondir(valeur, pas) {
    pas = pas || 10;
    return Math.round(valeur / pas) * pas;
  }

  function fourchette(bas, haut) {
    return [Math.min(bas, haut), Math.max(bas, haut)];
  }

  /* ------------------------------------------------------------------------
     Facture de chauffage
     ------------------------------------------------------------------------ */

  // Prix du kWh retenu pour une énergie, en €.
  function prixKwh(energie, config) {
    config = config || CONFIG;
    if (energie === 'pac') return config.prixKwh.electricite / config.diviseurPac;
    return config.prixKwh[energie];
  }

  // Prix du kWh tel qu'il apparaît sur la facture : pour une pompe à chaleur, l'électricité.
  function prixFacture(energie, config) {
    config = config || CONFIG;
    if (energie === 'pac') return config.prixKwh.electricite;
    return config.prixKwh[energie];
  }

  // F : facture de chauffage annuelle, saisie ou estimée (surface × conso × prix).
  // kwh : kWh de la facture (d'électricité pour une pompe à chaleur).
  function facture(reponses, config) {
    config = config || CONFIG;
    var prix = prixKwh(reponses.energie, config);
    var estimee = reponses.depense == null;
    var euros = estimee
      ? reponses.surface * config.consoParPeriode[reponses.periode] * prix
      : reponses.depense;
    var prixFactureKwh = prixFacture(reponses.energie, config);
    return { euros: euros, kwh: euros / prixFactureKwh, prixKwh: prix, prixFacture: prixFactureKwh, estimee: estimee };
  }

  /* ------------------------------------------------------------------------
     Leviers d'économie, en % de F
     ------------------------------------------------------------------------ */

  function leviers(reponses, config) {
    config = config || CONFIG;
    var programmation = config.levierProgrammation[reponses.regulation][reponses.occupation];
    var f = reponses.pieces > 0 ? reponses.peuUtilisees / reponses.pieces : 0;
    var parPiece = config.levierPieces[reponses.regulation];
    var pieces = [f * parPiece[0], f * parPiece[1]];
    var coefficient = reponses.energie === 'pac' ? config.coefficientPac : 1;

    var brutBas = (programmation[0] + pieces[0]) * coefficient;
    var brutHaut = (programmation[1] + pieces[1]) * coefficient;
    var bas = Math.min(brutBas, config.plafond.bas);
    var haut = Math.min(brutHaut, config.plafond.haut);

    return {
      programmation: programmation.slice(),
      pieces: pieces,
      partPeuUtilisees: f,
      coefficient: coefficient,
      avantPlafond: [brutBas, brutHaut],
      plafonne: brutBas > config.plafond.bas || brutHaut > config.plafond.haut,
      total: fourchette(bas, haut)
    };
  }

  /* ------------------------------------------------------------------------
     Investissement et retour
     ------------------------------------------------------------------------ */

  function investissement(pieces, config) {
    config = config || CONFIG;
    var inv = config.investissement;
    return [
      inv.prestation + pieces * inv.parPiece[0] + inv.box[0],
      inv.prestation + pieces * inv.parPiece[1] + inv.box[1]
    ];
  }

  // Nombre d'hivers pour rembourser un investissement. Infinity si rien n'est économisé.
  function hivers(montant, economieParAn) {
    if (!(economieParAn > 0)) return Infinity;
    return Math.ceil(montant / economieParAn - 1e-9);
  }

  /* ------------------------------------------------------------------------
     Simulation complète
     ------------------------------------------------------------------------ */

  function simuler(reponses, config) {
    config = config || CONFIG;

    if (reponses.residence === 'secondaire') {
      return {
        type: 'residence-secondaire',
        entreSejours: reponses.entreSejours,
        maintenuEnTemperature: reponses.entreSejours === 'maintenu'
      };
    }

    if (reponses.energie === 'bois') {
      return { type: 'poele' };
    }

    var pas = config.arrondi;
    var F = facture(reponses, config);
    var L = leviers(reponses, config);

    var economieBrute = [F.euros * L.total[0] / 100, F.euros * L.total[1] / 100];
    var economie = [arrondir(economieBrute[0], pas), arrondir(economieBrute[1], pas)];
    var kwh = [arrondir(F.kwh * L.total[0] / 100, pas), arrondir(F.kwh * L.total[1] / 100, pas)];

    var invBrut = investissement(reponses.pieces, config);
    var inv = [arrondir(invBrut[0], pas), arrondir(invBrut[1], pas)];

    // Retour affiché : du cas le plus favorable au moins favorable, sur les montants affichés.
    var retour = [hivers(inv[0], economie[1]), hivers(inv[1], economie[0])];
    // Retour central : investissement moyen / économie moyenne. Sert au seuil « gain limité ».
    var economieMoyenne = (economieBrute[0] + economieBrute[1]) / 2;
    var retourCentral = economieMoyenne > 0 ? ((invBrut[0] + invBrut[1]) / 2) / economieMoyenne : Infinity;

    var seuils = config.gainLimite;
    var economieFaible = economieBrute[1] < seuils.economieHauteMin;
    var retourLong = retourCentral > seuils.retourMaxHivers;
    var gainLimite = economieFaible || retourLong;

    var bonus = {
      pourcentage: config.gainParDegre,
      euros: arrondir(F.euros * config.gainParDegre / 100, pas),
      kwh: arrondir(F.kwh * config.gainParDegre / 100, pas),
      affiche: reponses.temperature >= (gainLimite ? config.temperatureBonusGainLimite : config.temperatureBonus)
    };

    return {
      type: gainLimite ? 'gain-limite' : 'resultat',
      facture: {
        euros: arrondir(F.euros, pas),
        kwh: arrondir(F.kwh, pas),
        prixKwh: F.prixKwh,
        prixFacture: F.prixFacture,
        estimee: F.estimee
      },
      leviers: L,
      pourcentage: [Math.round(L.total[0]), Math.round(L.total[1])],
      economie: economie,
      kwh: kwh,
      investissement: inv,
      retour: retour,
      retourCentral: retourCentral,
      gainLimite: gainLimite,
      raisons: gainLimite ? raisonsGainLimite(reponses, economieFaible, retourLong) : [],
      bonusDegre: bonus
    };
  }

  // Pourquoi le gain est limité, de la raison la plus parlante à la moins parlante.
  function raisonsGainLimite(reponses, economieFaible, retourLong) {
    var raisons = [];
    if (reponses.regulation === 'piece') raisons.push('deja-piece-par-piece');
    else if (reponses.regulation === 'programmable') raisons.push('deja-programme');
    if (reponses.peuUtilisees === 0) raisons.push('toutes-pieces-utilisees');
    if (reponses.energie === 'pac') raisons.push('pac');
    if (raisons.length === 0 && reponses.occupation === 'occupe') raisons.push('occupe');
    if (raisons.length === 0 && economieFaible) raisons.push('petite-facture');
    if (retourLong && !economieFaible) raisons.push('retour-long');
    if (raisons.length === 0) raisons.push('petite-facture');
    return raisons;
  }

  /* ------------------------------------------------------------------------
     Journée type (illustration, n'entre pas dans le calcul)
     ------------------------------------------------------------------------ */

  var PIECES_UTILISEES = ['Séjour', 'Cuisine', 'Salle de bain', 'Chambre'];
  var PIECES_PEU_UTILISEES = ['Bureau', 'Chambre d\'amis', 'Autre pièce'];

  // Nom de la n-ième pièce d'une liste, en prolongeant le dernier nom :
  // « Chambre », « Chambre 2 », « Chambre 3 »… ; « Autre pièce », « Autre pièce 2 »…
  function nomsPieces(base, dernier, nombre, exclus) {
    var noms = [];
    var i = 0;
    var suite = 1;
    while (noms.length < nombre) {
      var nom;
      if (i < base.length) {
        nom = base[i];
        i++;
      } else {
        suite++;
        nom = dernier + ' ' + suite;
      }
      if (exclus.indexOf(nom) === -1 && noms.indexOf(nom) === -1) noms.push(nom);
    }
    return noms;
  }

  // Pièces de la journée type : d'abord les pièces utilisées, puis les peu utilisées.
  function piecesJournee(reponses) {
    var nbPeu = Math.max(0, Math.min(reponses.peuUtilisees, reponses.pieces));
    var nbUtilisees = reponses.pieces - nbPeu;

    // En télétravail, le bureau s'insère après la première chambre, avant « Chambre 2 ».
    var base = PIECES_UTILISEES.slice();
    if (reponses.occupation === 'teletravail') base.push('Bureau');
    var utilisees = nomsPieces(base, 'Chambre', nbUtilisees, []);
    var peu = nomsPieces(PIECES_PEU_UTILISEES, 'Autre pièce', nbPeu, utilisees);

    return utilisees.map(function (nom) { return { nom: nom, peuUtilisee: false }; })
      .concat(peu.map(function (nom) { return { nom: nom, peuUtilisee: true }; }));
  }

  function genrePiece(nom, peuUtilisee) {
    if (peuUtilisee) return 'peu';
    if (nom === 'Séjour') return 'sejour';
    if (nom === 'Cuisine') return 'cuisine';
    if (nom === 'Salle de bain') return 'salle-de-bain';
    if (nom === 'Bureau') return 'bureau';
    return 'chambre';
  }

  // Plages « Avec pilotage », entre 6 h et 23 h. Niveaux : confort, nuit, tempere.
  function programmePilote(genre, occupation) {
    var occupe = occupation === 'occupe';
    switch (genre) {
      case 'sejour':
        return occupe
          ? [[6, 7, 'tempere'], [7, 23, 'confort']]
          : [[6, 7, 'tempere'], [7, 9, 'confort'], [9, 17, 'tempere'], [17, 23, 'confort']];
      case 'cuisine':
        return occupe
          ? [[6, 7, 'tempere'], [7, 21, 'confort'], [21, 23, 'tempere']]
          : [[6, 7, 'tempere'], [7, 8, 'confort'], [8, 18, 'tempere'], [18, 21, 'confort'], [21, 23, 'tempere']];
      case 'salle-de-bain':
        return [[6, 8, 'confort'], [8, 20, 'tempere'], [20, 22, 'confort'], [22, 23, 'tempere']];
      case 'chambre':
        return [[6, 7, 'nuit'], [7, 21, 'tempere'], [21, 23, 'nuit']];
      case 'bureau':
        return [[6, 8, 'tempere'], [8, 18, 'confort'], [18, 23, 'tempere']];
      default:
        return [[6, 23, 'tempere']];
    }
  }

  // Réunit deux plages voisines de même niveau.
  function fusionnerPlages(plages) {
    var resultat = [];
    plages.forEach(function (p) {
      var precedente = resultat[resultat.length - 1];
      if (precedente && precedente.niveau === p.niveau && precedente.fin === p.debut) {
        precedente.fin = p.fin;
      } else {
        resultat.push({ debut: p.debut, fin: p.fin, niveau: p.niveau });
      }
    });
    return resultat;
  }

  function journeeType(reponses, config) {
    config = config || CONFIG;
    var j = config.journee;
    var temperature = reponses.temperature;
    // Si la température habituelle ne dépasse pas celle de la nuit,
    // les chambres restent à la température habituelle : le niveau « nuit » disparaît.
    var nuitDistincte = temperature > j.nuit;

    var pieces = piecesJournee(reponses).map(function (piece) {
      var genre = genrePiece(piece.nom, piece.peuUtilisee);
      var plages = programmePilote(genre, reponses.occupation).map(function (p) {
        var niveau = (p[2] === 'nuit' && !nuitDistincte) ? 'confort' : p[2];
        return { debut: p[0], fin: p[1], niveau: niveau };
      });
      return {
        nom: piece.nom,
        peuUtilisee: piece.peuUtilisee,
        aujourdhui: [{ debut: j.debut, fin: j.fin, niveau: 'confort' }],
        pilotage: fusionnerPlages(plages)
      };
    });

    var niveaux = { confort: temperature, tempere: j.tempere };
    if (nuitDistincte) niveaux.nuit = j.nuit;

    return {
      debut: j.debut,
      fin: j.fin,
      niveaux: niveaux,
      pieces: pieces
    };
  }

  /* ------------------------------------------------------------------------
     Confort : liste générée selon les réponses
     ------------------------------------------------------------------------ */

  function listeConfort(reponses) {
    var liste = [];
    if (reponses.peuUtilisees > 0) {
      liste.push({ texte: 'Les pièces inoccupées restent tempérées et se réchauffent quand vous en avez besoin' });
    }
    if (reponses.occupation === 'vide') {
      liste.push({ texte: 'Maison chaude à votre retour, sans chauffer pendant votre absence' });
    }
    if (reponses.occupation === 'teletravail') {
      liste.push({ texte: 'Bureau chauffé pendant vos heures de travail seulement' });
    }
    if (reponses.regulation === 'main') {
      liste.push({ texte: 'Plus besoin de passer de radiateur en radiateur : tout se règle depuis votre téléphone' });
    }
    liste.push({ texte: 'Salle de bain chaude le matin, chambres plus fraîches la nuit' });
    liste.push({ texte: 'Chauffage coupé automatiquement quand une fenêtre est ouverte', precision: '(avec capteurs d\'ouverture)' });
    return liste;
  }

  /* ------------------------------------------------------------------------
     Mise en forme des nombres (espaces insécables)
     ------------------------------------------------------------------------ */

  var ESPACE_INSECABLE = ' ';      // entre un chiffre et son unité
  var ESPACE_FINE_INSECABLE = ' '; // séparateur des milliers

  // 1800 → « 1 800 » (espace fine insécable) ; 0.12 → « 0,12 » avec decimales = 2.
  function formaterNombre(valeur, decimales) {
    decimales = decimales || 0;
    var signe = valeur < 0 ? '-' : '';
    var texte = Math.abs(valeur).toFixed(decimales);
    var parties = texte.split('.');
    var entier = parties[0];
    if (entier.length > 4) {
      entier = entier.replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_FINE_INSECABLE);
    } else if (entier.length === 4) {
      entier = entier.charAt(0) + ESPACE_FINE_INSECABLE + entier.slice(1);
    }
    return signe + entier + (parties[1] ? ',' + parties[1] : '');
  }

  // « 200 € », « 21 °C », « 6 h » : espace insécable avant l'unité.
  function avecUnite(valeur, unite, decimales) {
    var nombre = typeof valeur === 'number' ? formaterNombre(valeur, decimales) : valeur;
    return nombre + ESPACE_INSECABLE + unite;
  }

  var exporte = {
    arrondir: arrondir,
    prixKwh: prixKwh,
    prixFacture: prixFacture,
    facture: facture,
    leviers: leviers,
    investissement: investissement,
    hivers: hivers,
    simuler: simuler,
    piecesJournee: piecesJournee,
    journeeType: journeeType,
    listeConfort: listeConfort,
    formaterNombre: formaterNombre,
    avecUnite: avecUnite,
    ESPACE_INSECABLE: ESPACE_INSECABLE,
    ESPACE_FINE_INSECABLE: ESPACE_FINE_INSECABLE
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exporte;
  } else {
    racine.Calcul = exporte;
  }
})(this);
