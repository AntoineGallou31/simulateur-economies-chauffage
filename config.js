/*
  Toutes les hypothèses chiffrées du simulateur.

  Ce sont des ordres de grandeur, à vérifier avant mise en ligne.
  Le calcul (calcul.js) et le bloc « Comment c'est calculé » relisent ces valeurs :
  une modification ici se répercute partout.

  Les pourcentages sont exprimés en % de la facture de chauffage annuelle (F).
  Les fourchettes s'écrivent [bas, haut].
*/
(function (racine) {
  'use strict';

  var CONFIG = {
    // Prix de l'énergie, en € par kWh. Ordre de grandeur à vérifier.
    prixKwh: {
      gaz: 0.12,
      electricite: 0.25,
      fioul: 0.12
    },

    // Pompe à chaleur ou plancher chauffant : prix du kWh de chaleur = prix de l'électricité
    // divisé par ce nombre (environ 3 kWh de chaleur pour 1 kWh d'électricité).
    // Les kWh affichés restent des kWh d'électricité, ceux de la facture.
    // Ordre de grandeur à vérifier.
    diviseurPac: 3,

    // Consommation de chauffage si « Je ne sais pas », en kWh par m² et par an,
    // climat toulousain. Ordre de grandeur à vérifier.
    consoParPeriode: {
      'avant-1975': 150,
      '1975-1989': 120,
      '1990-2005': 95,
      '2006-2012': 75,
      'apres-2012': 45
    },

    // Levier 1 : programmation horaire, en % de F, selon la régulation actuelle
    // et l'occupation du logement en journée. Ordre de grandeur à vérifier.
    levierProgrammation: {
      main:         { vide: [8, 15], teletravail: [6, 12], occupe: [4, 8] },
      thermostat:   { vide: [8, 15], teletravail: [6, 12], occupe: [4, 8] },
      robinets:     { vide: [8, 15], teletravail: [6, 12], occupe: [4, 8] },
      programmable: { vide: [0, 3],  teletravail: [0, 3],  occupe: [0, 3] },
      piece:        { vide: [0, 2],  teletravail: [0, 2],  occupe: [0, 2] }
    },

    // Levier 2 : pièces peu utilisées tempérées, en % de F,
    // multiplié par f = pièces peu utilisées / pièces chauffées. Ordre de grandeur à vérifier.
    levierPieces: {
      main: [10, 20],
      thermostat: [10, 20],
      programmable: [10, 20],
      robinets: [5, 10],
      piece: [0, 0]
    },

    // Coefficient appliqué aux deux leviers pour une pompe à chaleur ou un plancher chauffant.
    // Ordre de grandeur à vérifier.
    coefficientPac: 0.6,

    // Plafonds du total, en % de F. Ordre de grandeur à vérifier.
    plafond: { bas: 15, haut: 20 },

    // Les montants en € et en kWh sont arrondis à ce pas.
    arrondi: 10,

    // Bonus séparé, jamais ajouté au total : économie par degré en moins, en % de F.
    // Ordre de grandeur à vérifier.
    gainParDegre: 7,
    // Température habituelle à partir de laquelle le bonus est affiché :
    // sur le résultat, et sur l'écran « gain limité » (où c'est ce qui compte le plus).
    temperatureBonus: 21,
    temperatureBonusGainLimite: 19,

    // Investissement indicatif, en €. Ordre de grandeur à vérifier.
    investissement: {
      prestation: 290,
      parPiece: [35, 60],
      box: [100, 150]
    },

    // Résultat « gain limité » si l'économie haute est inférieure à ce montant (€ par an)
    // ou si le retour sur investissement dépasse ce nombre d'hivers.
    gainLimite: {
      economieHauteMin: 60,
      retourMaxHivers: 6
    },

    // Journée type : illustration seulement, n'entre pas dans le calcul.
    journee: {
      debut: 6,        // aujourd'hui, toutes les pièces chauffées de 6 h…
      fin: 23,         // … à 23 h
      nuit: 18,        // chambres la nuit, en °C
      tempere: 16      // pièces tempérées, en °C
    },

    // Limites de saisie.
    limites: {
      depense: [50, 20000],   // € par an
      surface: [10, 1000],    // m²
      pieces: [1, 20]
    },

    // Repères affichés dans « Comment c'est calculé ».
    sources: {
      nom: 'ADEME',
      lien: '[LIEN ADEME]',
      reperes: [
        'une régulation fait économiser environ 10 % en moyenne',
        'une programmation jusqu\'à 15 %',
        'une régulation programmable par pièce près de 20 %',
        'chaque degré en moins environ 7 %'
      ]
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
  } else {
    racine.CONFIG = CONFIG;
  }
})(this);
