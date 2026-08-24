// assets/admin/departements-liste.js
// Liste officielle des departements francais (101 : 96 metropole + 5 outre-mer).
// Source : INSEE - Code officiel geographique.
// Format : { code: 'XX', nom: 'Nom', region: 'Region' }
// Chargee par admin.html dans window.App.DEPARTEMENTS.

(function () {
  'use strict';

  window.App = window.App || {};
  window.App.DEPARTEMENTS = [
    // === METROPOLE (96) ===
    { code: '01', nom: 'Ain', region: 'Auvergne-Rhone-Alpes' },
    { code: '02', nom: 'Aisne', region: 'Hauts-de-France' },
    { code: '03', nom: 'Allier', region: 'Auvergne-Rhone-Alpes' },
    { code: '04', nom: 'Alpes-de-Haute-Provence', region: 'Provence-Alpes-Cote d\'Azur' },
    { code: '05', nom: 'Hautes-Alpes', region: 'Provence-Alpes-Cote d\'Azur' },
    { code: '06', nom: 'Alpes-Maritimes', region: 'Provence-Alpes-Cote d\'Azur' },
    { code: '07', nom: 'Ardeche', region: 'Auvergne-Rhone-Alpes' },
    { code: '08', nom: 'Ardennes', region: 'Grand Est' },
    { code: '09', nom: 'Ariege', region: 'Occitanie' },
    { code: '10', nom: 'Aube', region: 'Grand Est' },
    { code: '11', nom: 'Aude', region: 'Occitanie' },
    { code: '12', nom: 'Aveyron', region: 'Occitanie' },
    { code: '13', nom: 'Bouches-du-Rhone', region: 'Provence-Alpes-Cote d\'Azur' },
    { code: '14', nom: 'Calvados', region: 'Normandie' },
    { code: '15', nom: 'Cantal', region: 'Auvergne-Rhone-Alpes' },
    { code: '16', nom: 'Charente', region: 'Nouvelle-Aquitaine' },
    { code: '17', nom: 'Charente-Maritime', region: 'Nouvelle-Aquitaine' },
    { code: '18', nom: 'Cher', region: 'Centre-Val de Loire' },
    { code: '19', nom: 'Correze', region: 'Nouvelle-Aquitaine' },
    { code: '2A', nom: 'Corse-du-Sud', region: 'Corse' },
    { code: '2B', nom: 'Haute-Corse', region: 'Corse' },
    { code: '21', nom: 'Cote-d\'Or', region: 'Bourgogne-Franche-Comte' },
    { code: '22', nom: 'Cotes-d\'Armor', region: 'Bretagne' },
    { code: '23', nom: 'Creuse', region: 'Nouvelle-Aquitaine' },
    { code: '24', nom: 'Dordogne', region: 'Nouvelle-Aquitaine' },
    { code: '25', nom: 'Doubs', region: 'Bourgogne-Franche-Comte' },
    { code: '26', nom: 'Drome', region: 'Auvergne-Rhone-Alpes' },
    { code: '27', nom: 'Eure', region: 'Normandie' },
    { code: '28', nom: 'Eure-et-Loir', region: 'Centre-Val de Loire' },
    { code: '29', nom: 'Finistere', region: 'Bretagne' },
    { code: '30', nom: 'Gard', region: 'Occitanie' },
    { code: '31', nom: 'Haute-Garonne', region: 'Occitanie' },
    { code: '32', nom: 'Gers', region: 'Occitanie' },
    { code: '33', nom: 'Gironde', region: 'Nouvelle-Aquitaine' },
    { code: '34', nom: 'Herault', region: 'Occitanie' },
    { code: '35', nom: 'Ille-et-Vilaine', region: 'Bretagne' },
    { code: '36', nom: 'Indre', region: 'Centre-Val de Loire' },
    { code: '37', nom: 'Indre-et-Loire', region: 'Centre-Val de Loire' },
    { code: '38', nom: 'Isere', region: 'Auvergne-Rhone-Alpes' },
    { code: '39', nom: 'Jura', region: 'Bourgogne-Franche-Comte' },
    { code: '40', nom: 'Landes', region: 'Nouvelle-Aquitaine' },
    { code: '41', nom: 'Loir-et-Cher', region: 'Centre-Val de Loire' },
    { code: '42', nom: 'Loire', region: 'Auvergne-Rhone-Alpes' },
    { code: '43', nom: 'Haute-Loire', region: 'Auvergne-Rhone-Alpes' },
    { code: '44', nom: 'Loire-Atlantique', region: 'Pays de la Loire' },
    { code: '45', nom: 'Loiret', region: 'Centre-Val de Loire' },
    { code: '46', nom: 'Lot', region: 'Occitanie' },
    { code: '47', nom: 'Lot-et-Garonne', region: 'Nouvelle-Aquitaine' },
    { code: '48', nom: 'Lozere', region: 'Occitanie' },
    { code: '49', nom: 'Maine-et-Loire', region: 'Pays de la Loire' },
    { code: '50', nom: 'Manche', region: 'Normandie' },
    { code: '51', nom: 'Marne', region: 'Grand Est' },
    { code: '52', nom: 'Haute-Marne', region: 'Grand Est' },
    { code: '53', nom: 'Mayenne', region: 'Pays de la Loire' },
    { code: '54', nom: 'Meurthe-et-Moselle', region: 'Grand Est' },
    { code: '55', nom: 'Meuse', region: 'Grand Est' },
    { code: '56', nom: 'Morbihan', region: 'Bretagne' },
    { code: '57', nom: 'Moselle', region: 'Grand Est' },
    { code: '58', nom: 'Nievre', region: 'Bourgogne-Franche-Comte' },
    { code: '59', nom: 'Nord', region: 'Hauts-de-France' },
    { code: '60', nom: 'Oise', region: 'Hauts-de-France' },
    { code: '61', nom: 'Orne', region: 'Normandie' },
    { code: '62', nom: 'Pas-de-Calais', region: 'Hauts-de-France' },
    { code: '63', nom: 'Puy-de-Dome', region: 'Auvergne-Rhone-Alpes' },
    { code: '64', nom: 'Pyrenees-Atlantiques', region: 'Nouvelle-Aquitaine' },
    { code: '65', nom: 'Hautes-Pyrenees', region: 'Occitanie' },
    { code: '66', nom: 'Pyrenees-Orientales', region: 'Occitanie' },
    { code: '67', nom: 'Bas-Rhin', region: 'Grand Est' },
    { code: '68', nom: 'Haut-Rhin', region: 'Grand Est' },
    { code: '69', nom: 'Rhone', region: 'Auvergne-Rhone-Alpes' },
    { code: '70', nom: 'Haute-Saone', region: 'Bourgogne-Franche-Comte' },
    { code: '71', nom: 'Saone-et-Loire', region: 'Bourgogne-Franche-Comte' },
    { code: '72', nom: 'Sarthe', region: 'Pays de la Loire' },
    { code: '73', nom: 'Savoie', region: 'Auvergne-Rhone-Alpes' },
    { code: '74', nom: 'Haute-Savoie', region: 'Auvergne-Rhone-Alpes' },
    { code: '75', nom: 'Paris', region: 'Ile-de-France' },
    { code: '76', nom: 'Seine-Maritime', region: 'Normandie' },
    { code: '77', nom: 'Seine-et-Marne', region: 'Ile-de-France' },
    { code: '78', nom: 'Yvelines', region: 'Ile-de-France' },
    { code: '79', nom: 'Deux-Sevres', region: 'Nouvelle-Aquitaine' },
    { code: '80', nom: 'Somme', region: 'Hauts-de-France' },
    { code: '81', nom: 'Tarn', region: 'Occitanie' },
    { code: '82', nom: 'Tarn-et-Garonne', region: 'Occitanie' },
    { code: '83', nom: 'Var', region: 'Provence-Alpes-Cote d\'Azur' },
    { code: '84', nom: 'Vaucluse', region: 'Provence-Alpes-Cote d\'Azur' },
    { code: '85', nom: 'Vendee', region: 'Pays de la Loire' },
    { code: '86', nom: 'Vienne', region: 'Nouvelle-Aquitaine' },
    { code: '87', nom: 'Haute-Vienne', region: 'Nouvelle-Aquitaine' },
    { code: '88', nom: 'Vosges', region: 'Grand Est' },
    { code: '89', nom: 'Yonne', region: 'Bourgogne-Franche-Comte' },
    { code: '90', nom: 'Territoire de Belfort', region: 'Bourgogne-Franche-Comte' },
    { code: '91', nom: 'Essonne', region: 'Ile-de-France' },
    { code: '92', nom: 'Hauts-de-Seine', region: 'Ile-de-France' },
    { code: '93', nom: 'Seine-Saint-Denis', region: 'Ile-de-France' },
    { code: '94', nom: 'Val-de-Marne', region: 'Ile-de-France' },
    { code: '95', nom: 'Val-d\'Oise', region: 'Ile-de-France' },

    // === OUTRE-MER (5 DOM + 2 COM) ===
    { code: '971', nom: 'Guadeloupe', region: 'Guadeloupe' },
    { code: '972', nom: 'Martinique', region: 'Martinique' },
    { code: '973', nom: 'Guyane', region: 'Guyane' },
    { code: '974', nom: 'La Reunion', region: 'La Reunion' },
    { code: '976', nom: 'Mayotte', region: 'Mayotte' },
    { code: '987', nom: 'Polynesie francaise', region: 'Polynesie francaise' },
    { code: '988', nom: 'Nouvelle-Caledonie', region: 'Nouvelle-Caledonie' },
  ];

  // Helper : retrouve un departement par son code
  window.App.getDepartement = function (code) {
    return window.App.DEPARTEMENTS.find(d => d.code === String(code)) || null;
  };

  // Helper : formate un code (zero-padding pour 01-09, garde 2A/2B tels quels)
  window.App.formatDeptCode = function (code) {
    const s = String(code || '').trim();
    if (!s) return '';
    if (/^0?\d$/.test(s)) return s.padStart(2, '0');
    return s;
  };
})();
