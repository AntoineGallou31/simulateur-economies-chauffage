// Tests du calcul : node --test
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CONFIG = require('../config.js');
const C = require('../calcul.js');

const NBSP = ' ';
const FINE = ' ';

// Profils de référence du brief
const PROFILS = {
  maisonGaz: {
    residence: 'principale', energie: 'gaz', depense: 1800, regulation: 'main',
    pieces: 6, peuUtilisees: 2, occupation: 'vide', temperature: 21
  },
  appartementElectrique: {
    residence: 'principale', energie: 'electricite', depense: 900, regulation: 'programmable',
    pieces: 3, peuUtilisees: 0, occupation: 'occupe', temperature: 19
  },
  pac: {
    residence: 'principale', energie: 'pac', depense: 1200, regulation: 'robinets',
    pieces: 5, peuUtilisees: 1, occupation: 'teletravail', temperature: 20
  },
  jeNeSaisPas: {
    residence: 'principale', energie: 'gaz', depense: null, surface: 110, periode: '1975-1989',
    regulation: 'main', pieces: 5, peuUtilisees: 1, occupation: 'vide', temperature: 20
  }
};

test('maison gaz 1 800 € : 200 à 360 € par an, comme la maquette', () => {
  const r = C.simuler(PROFILS.maisonGaz);
  assert.equal(r.type, 'resultat');
  assert.deepEqual(r.economie, [200, 360]);
  assert.deepEqual(r.pourcentage, [11, 20]);
  assert.deepEqual(r.kwh, [1700, 3000]);
  assert.equal(r.facture.kwh, 15000);
  assert.deepEqual(r.investissement, [600, 800]);
  assert.deepEqual(r.retour, [2, 4]);
  assert.equal(r.bonusDegre.euros, 130);
  assert.equal(r.bonusDegre.affiche, true);
});

test('appartement électrique 900 €, thermostat programmable : gain limité', () => {
  const r = C.simuler(PROFILS.appartementElectrique);
  assert.equal(r.type, 'gain-limite');
  assert.deepEqual(r.economie, [0, 30]);
  assert.deepEqual(r.pourcentage, [0, 3]);
  assert.deepEqual(r.raisons, ['deja-programme', 'toutes-pieces-utilisees']);
  assert.equal(r.bonusDegre.euros, 60);
  assert.equal(r.bonusDegre.affiche, true, 'gain limité : bonus affiché dès 19 °C');
});

test('pompe à chaleur 1 200 €, robinets, télétravail : coefficient 0,6, retour trop long', () => {
  const r = C.simuler(PROFILS.pac);
  assert.equal(r.leviers.coefficient, 0.6);
  assert.deepEqual(r.leviers.programmation, [6, 12]);
  assert.ok(Math.abs(r.leviers.total[0] - 4.2) < 1e-9);
  assert.ok(Math.abs(r.leviers.total[1] - 8.4) < 1e-9);
  assert.deepEqual(r.economie, [50, 100]);
  // kWh d'électricité, ceux de la facture : 1 200 € / 0,25 €
  assert.equal(r.facture.kwh, 4800);
  assert.deepEqual(r.kwh, [200, 400]);
  assert.deepEqual(r.investissement, [570, 740]);
  assert.deepEqual(r.retour, [6, 15]);
  assert.ok(r.retourCentral > CONFIG.gainLimite.retourMaxHivers);
  assert.equal(r.type, 'gain-limite');
  assert.deepEqual(r.raisons, ['pac', 'retour-long']);
});

test('« Je ne sais pas » : 110 m², 1975-1989, gaz', () => {
  const r = C.simuler(PROFILS.jeNeSaisPas);
  assert.equal(r.facture.estimee, true);
  assert.equal(r.facture.kwh, 13200);
  assert.equal(r.facture.euros, 1580);
  assert.deepEqual(r.pourcentage, [10, 19]);
  assert.deepEqual(r.economie, [160, 300]);
  assert.deepEqual(r.kwh, [1320, 2510]);
  assert.deepEqual(r.retour, [2, 5]);
  assert.equal(r.type, 'resultat');
  assert.equal(r.bonusDegre.affiche, false);
});

test('« Je ne sais pas » donne le même résultat que la saisie du montant estimé', () => {
  const estime = C.simuler(PROFILS.jeNeSaisPas);
  const saisi = C.simuler({ ...PROFILS.jeNeSaisPas, depense: 110 * 120 * 0.12 });
  assert.deepEqual(estime.economie, saisi.economie);
  assert.deepEqual(estime.kwh, saisi.kwh);
});

test('prix du kWh : PAC = électricité / 3', () => {
  assert.equal(C.prixKwh('gaz'), 0.12);
  assert.equal(C.prixKwh('fioul'), 0.12);
  assert.equal(C.prixKwh('electricite'), 0.25);
  assert.ok(Math.abs(C.prixKwh('pac') - 0.25 / 3) < 1e-12);
});

test('plafonds : 15 % en bas, 20 % en haut', () => {
  const r = C.simuler({ ...PROFILS.maisonGaz, pieces: 6, peuUtilisees: 6 });
  assert.deepEqual(r.leviers.avantPlafond, [18, 35]);
  assert.deepEqual(r.leviers.total, [15, 20]);
  assert.equal(r.leviers.plafonne, true);
});

test('bas ≤ haut et total ≤ plafonds, pour toutes les combinaisons', () => {
  const regulations = Object.keys(CONFIG.levierProgrammation);
  const occupations = ['vide', 'teletravail', 'occupe'];
  const energies = ['gaz', 'electricite', 'fioul', 'pac'];
  for (const regulation of regulations) {
    for (const occupation of occupations) {
      for (const energie of energies) {
        for (let pieces = 1; pieces <= 12; pieces++) {
          for (let peu = 0; peu <= pieces; peu++) {
            const r = C.simuler({
              residence: 'principale', energie, depense: 1500, regulation,
              pieces, peuUtilisees: peu, occupation, temperature: 20
            });
            assert.ok(r.leviers.total[0] <= r.leviers.total[1]);
            assert.ok(r.leviers.total[0] <= CONFIG.plafond.bas);
            assert.ok(r.leviers.total[1] <= CONFIG.plafond.haut);
            assert.ok(r.economie[0] <= r.economie[1]);
            assert.ok(r.economie[0] >= 0);
            assert.equal(r.economie[0] % 10, 0);
            assert.equal(r.kwh[1] % 10, 0);
          }
        }
      }
    }
  }
});

test('régulation pièce par pièce : pas de levier pièces peu utilisées', () => {
  const r = C.simuler({ ...PROFILS.maisonGaz, regulation: 'piece' });
  assert.deepEqual(r.leviers.pieces, [0, 0]);
  assert.deepEqual(r.leviers.programmation, [0, 2]);
  assert.equal(r.type, 'gain-limite');
  assert.equal(r.raisons[0], 'deja-piece-par-piece');
});

test('robinets thermostatiques : levier pièces à 5–10 %', () => {
  const r = C.leviers({ ...PROFILS.maisonGaz, regulation: 'robinets', pieces: 4, peuUtilisees: 2 });
  assert.deepEqual(r.pieces, [2.5, 5]);
});

test('bonus 1 °C : affiché seulement à partir de 21 °C, jamais ajouté au total', () => {
  for (const temperature of [18, 19, 20, 21, 22]) {
    const r = C.simuler({ ...PROFILS.maisonGaz, temperature });
    assert.equal(r.bonusDegre.affiche, temperature >= 21);
    assert.deepEqual(r.economie, [200, 360]);
  }
});

test('bonus 1 °C sur « gain limité » : affiché dès 19 °C', () => {
  for (const temperature of [18, 19, 20, 21, 22]) {
    const r = C.simuler({ ...PROFILS.appartementElectrique, temperature });
    assert.equal(r.type, 'gain-limite');
    assert.equal(r.bonusDegre.affiche, temperature >= 19);
  }
});

test('« Je ne sais pas » avec une pompe à chaleur : chaleur au prix électricité / 3', () => {
  const r = C.simuler({ ...PROFILS.jeNeSaisPas, energie: 'pac' });
  // 110 m² × 120 kWh = 13 200 kWh de chaleur, à 0,25 / 3 € = 1 100 € ; 4 400 kWh d'électricité
  assert.equal(r.facture.euros, 1100);
  assert.equal(r.facture.kwh, 4400);
});

test('résidence secondaire et poêle : pas de montant', () => {
  const s = C.simuler({ residence: 'secondaire', entreSejours: 'maintenu' });
  assert.equal(s.type, 'residence-secondaire');
  assert.equal(s.maintenuEnTemperature, true);
  assert.equal(s.economie, undefined);
  assert.equal(C.simuler({ residence: 'secondaire', entreSejours: 'hors-gel' }).maintenuEnTemperature, false);

  const p = C.simuler({ residence: 'principale', energie: 'bois' });
  assert.equal(p.type, 'poele');
  assert.equal(p.economie, undefined);
});

test('économie haute sous 60 € : gain limité, raison « petite facture »', () => {
  const r = C.simuler({ ...PROFILS.maisonGaz, depense: 250 });
  assert.ok(r.economie[1] < 60);
  assert.equal(r.type, 'gain-limite');
  assert.deepEqual(r.raisons, ['petite-facture']);
});

test('hivers : arrondi au-dessus, infini sans économie', () => {
  assert.equal(C.hivers(600, 360), 2);
  assert.equal(C.hivers(800, 200), 4);
  assert.equal(C.hivers(800, 0), Infinity);
});

/* Journée type ------------------------------------------------------------- */

test('journée type : 6 pièces dont 2 peu utilisées = exactement la maquette', () => {
  const j = C.journeeType(PROFILS.maisonGaz);
  assert.deepEqual(j.pieces.map(p => p.nom),
    ['Séjour', 'Cuisine', 'Salle de bain', 'Chambre', 'Bureau', 'Chambre d\'amis']);
  assert.deepEqual(j.niveaux, { confort: 21, nuit: 18, tempere: 16 });

  const plages = Object.fromEntries(j.pieces.map(p => [p.nom, p.pilotage.map(x => [x.debut, x.fin, x.niveau])]));
  assert.deepEqual(plages['Séjour'], [[6, 7, 'tempere'], [7, 9, 'confort'], [9, 17, 'tempere'], [17, 23, 'confort']]);
  assert.deepEqual(plages['Cuisine'], [[6, 7, 'tempere'], [7, 8, 'confort'], [8, 18, 'tempere'], [18, 21, 'confort'], [21, 23, 'tempere']]);
  assert.deepEqual(plages['Salle de bain'], [[6, 8, 'confort'], [8, 20, 'tempere'], [20, 22, 'confort'], [22, 23, 'tempere']]);
  assert.deepEqual(plages['Chambre'], [[6, 7, 'nuit'], [7, 21, 'tempere'], [21, 23, 'nuit']]);
  assert.deepEqual(plages['Bureau'], [[6, 23, 'tempere']]);
  assert.deepEqual(plages['Chambre d\'amis'], [[6, 23, 'tempere']]);

  for (const p of j.pieces) {
    assert.deepEqual(p.aujourdhui, [{ debut: 6, fin: 23, niveau: 'confort' }]);
  }
});

test('journée type : bureau après la chambre en télétravail, sans doublon', () => {
  const noms = (pieces, peu, occupation) =>
    C.piecesJournee({ pieces, peuUtilisees: peu, occupation }).map(p => p.nom);

  assert.deepEqual(noms(6, 1, 'teletravail'),
    ['Séjour', 'Cuisine', 'Salle de bain', 'Chambre', 'Bureau', 'Chambre d\'amis']);
  assert.deepEqual(noms(8, 2, 'teletravail'),
    ['Séjour', 'Cuisine', 'Salle de bain', 'Chambre', 'Bureau', 'Chambre 2', 'Chambre d\'amis', 'Autre pièce']);
  assert.deepEqual(noms(10, 5, 'vide'),
    ['Séjour', 'Cuisine', 'Salle de bain', 'Chambre', 'Chambre 2',
      'Bureau', 'Chambre d\'amis', 'Autre pièce', 'Autre pièce 2', 'Autre pièce 3']);
  assert.deepEqual(noms(2, 0, 'occupe'), ['Séjour', 'Cuisine']);
  assert.deepEqual(noms(3, 3, 'vide'), ['Bureau', 'Chambre d\'amis', 'Autre pièce']);

  for (let pieces = 1; pieces <= 20; pieces++) {
    for (let peu = 0; peu <= pieces; peu++) {
      for (const occupation of ['vide', 'teletravail', 'occupe']) {
        const n = noms(pieces, peu, occupation);
        assert.equal(n.length, pieces);
        assert.equal(new Set(n).size, pieces);
      }
    }
  }
});

test('journée type : bureau chauffé en journée en télétravail, pièces de vie la journée si occupé', () => {
  const t = C.journeeType({ ...PROFILS.maisonGaz, occupation: 'teletravail', peuUtilisees: 1 });
  const bureau = t.pieces.find(p => p.nom === 'Bureau');
  assert.equal(bureau.peuUtilisee, false);
  assert.deepEqual(bureau.pilotage.find(p => p.niveau === 'confort'), { debut: 8, fin: 18, niveau: 'confort' });

  const o = C.journeeType({ ...PROFILS.maisonGaz, occupation: 'occupe' });
  const sejour = o.pieces.find(p => p.nom === 'Séjour');
  assert.ok(sejour.pilotage.some(p => p.niveau === 'confort' && p.debut <= 12 && p.fin >= 12));
});

test('journée type à 18 °C : pas de niveau « nuit » distinct', () => {
  const j = C.journeeType({ ...PROFILS.maisonGaz, temperature: 18 });
  assert.deepEqual(j.niveaux, { confort: 18, tempere: 16 });
  const chambre = j.pieces.find(p => p.nom === 'Chambre');
  assert.ok(chambre.pilotage.every(p => p.niveau !== 'nuit'));
});

/* Confort ----------------------------------------------------------------- */

test('confort : liste de la maquette pour la maison au gaz', () => {
  assert.deepEqual(C.listeConfort(PROFILS.maisonGaz).map(x => x.texte), [
    'Les pièces inoccupées restent tempérées et se réchauffent quand vous en avez besoin',
    'Maison chaude à votre retour, sans chauffer pendant votre absence',
    'Plus besoin de passer de radiateur en radiateur : tout se règle depuis votre téléphone',
    'Salle de bain chaude le matin, chambres plus fraîches la nuit',
    'Chauffage coupé automatiquement quand une fenêtre est ouverte'
  ]);
});

test('confort : télétravail, aucune pièce peu utilisée', () => {
  const liste = C.listeConfort({ ...PROFILS.pac, peuUtilisees: 0 }).map(x => x.texte);
  assert.deepEqual(liste, [
    'Bureau chauffé pendant vos heures de travail seulement',
    'Salle de bain chaude le matin, chambres plus fraîches la nuit',
    'Chauffage coupé automatiquement quand une fenêtre est ouverte'
  ]);
});

/* Mise en forme ------------------------------------------------------------ */

test('nombres : espace fine insécable pour les milliers, virgule décimale', () => {
  assert.equal(C.formaterNombre(360), '360');
  assert.equal(C.formaterNombre(1800), `1${FINE}800`);
  assert.equal(C.formaterNombre(15000), `15${FINE}000`);
  assert.equal(C.formaterNombre(1234567), `1${FINE}234${FINE}567`);
  assert.equal(C.formaterNombre(0.12, 2), '0,12');
});

test('unités : espace insécable entre le chiffre et l\'unité', () => {
  assert.equal(C.avecUnite(200, '€'), `200${NBSP}€`);
  assert.equal(C.avecUnite(1700, 'kWh'), `1${FINE}700${NBSP}kWh`);
  assert.equal(C.avecUnite(21, '°C'), `21${NBSP}°C`);
  assert.equal(C.avecUnite(6, 'h'), `6${NBSP}h`);
  assert.ok(!/ /.test(C.avecUnite(1800, '€')), 'aucune espace sécable');
});
