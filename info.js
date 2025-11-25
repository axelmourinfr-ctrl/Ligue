// ========================
// CONFIG
// ========================
const API_URL_INFO = "https://script.google.com/macros/s/AKfycbzaYj_dmVJtKGYBod7r7YA3HIkVh7yUdwTme98p15KxonEWhdsLAxe2CGu7aMcjwgzOZQ/exec";

var STATE_INFO = {
  players: {},
  history: [],
  version: 1
};

// ========================
// INIT
// ========================
document.addEventListener("DOMContentLoaded", function () {
  loadInfoState();
});

async function loadInfoState() {
  try {
    var res = await fetch(API_URL_INFO);
    var data = await res.json();
    STATE_INFO = data;
    renderHallOfFameInfo();
    renderSeasonStats();
  } catch (e) {
    console.error(e);
    var err = document.getElementById("infoError");
    if (err) {
      err.textContent = "Impossible de charger les données de la ligue.";
    }
  }
}

// ========================
// HALL OF FAME (INFO PAGE)
// ========================
function renderHallOfFameInfo() {
  var tbody = document.getElementById("hofBodyInfo");
  if (!tbody) return;
  tbody.innerHTML = "";

  var categories = [
    { key: "vainqueur_ecrasant", label: "Vainqueur écrasant" },
    { key: "mur_de_fer", label: "Mur de fer" },
    { key: "hat_trick_def", label: "Hat-trick Défenseur" },
    { key: "precision_chir", label: "Précision chirurgicale" },
    { key: "serial_passeur_def", label: "Serial passeur (défenseur)" },
    { key: "progres_continu", label: "Progrès continu" }
  ];

  var playersObj = STATE_INFO.players || {};

  for (var i = 0; i < categories.length; i++) {
    var cat = categories[i];
    var bestPlayers = [];
    var bestDiamonds = 0;

    for (var name in playersObj) {
      if (!playersObj.hasOwnProperty(name)) continue;
      var p = playersObj[name];
      var lvl = (p.badges_level && p.badges_level[cat.key]) || 0;
      // On compte 1 diamant si le niveau est 5 (Diamant)
      var diamonds = (lvl === 5) ? 1 : 0;
      if (diamonds > 0) {
        if (diamonds > bestDiamonds) {
          bestDiamonds = diamonds;
          bestPlayers = [name];
        } else if (diamonds === bestDiamonds) {
          bestPlayers.push(name);
        }
      }
    }

    var tr = document.createElement("tr");
    if (bestDiamonds === 0 || bestPlayers.length === 0) {
      tr.innerHTML = "<td>" + cat.label + "</td>" +
                     "<td>Aucun pour l'instant</td>" +
                     "<td>—</td>";
    } else {
      var diamondsTxt = "";
      for (var d = 0; d < bestDiamonds; d++) {
        diamondsTxt += "💎";
      }
      tr.innerHTML = "<td>" + cat.label + "</td>" +
                     "<td>" + bestPlayers.join(", ") + "</td>" +
                     "<td>" + diamondsTxt + "</td>";
    }
    tbody.appendChild(tr);
  }
}

// ========================
// STATISTIQUES DE SAISON
// ========================
function renderSeasonStats() {
  var playersObj = STATE_INFO.players || {};
  var history = STATE_INFO.history || [];

  // Total matchs = nombre d'entrées dans history
  var totalMatches = history.length;

  // Total buts = somme des scores A + B
  var totalGoals = 0;
  for (var i = 0; i < history.length; i++) {
    var m = history[i];
    if (typeof m.scoreA === "number") totalGoals += m.scoreA;
    if (typeof m.scoreB === "number") totalGoals += m.scoreB;
  }

  // Convertir players en tableau
  var playersArr = [];
  for (var name in playersObj) {
    if (!playersObj.hasOwnProperty(name)) continue;
    var p = playersObj[name];
    p.name = name;
    playersArr.push(p);
  }

  // Joueur le plus actif = celui avec le plus de matches
  var mostActive = null;
  for (var j = 0; j < playersArr.length; j++) {
    var pl = playersArr[j];
    var mCount = pl.matches || 0;
    if (!mostActive || mCount > (mostActive.matches || 0)) {
      mostActive = pl;
    }
  }

  // Meilleur attaquant = meilleur ratio_att (en %) avec au moins 3 matches
  var bestAtt = null;
  for (var k = 0; k < playersArr.length; k++) {
    var pa = playersArr[k];
    var ratioA = pa.ratio_att || "-";
    var matchesA = pa.matches || 0;
    if (ratioA === "-" || matchesA < 3) continue;

    var valA = parseFloat(ratioA.replace("%", ""));
    if (isNaN(valA)) continue;

    if (!bestAtt || valA > bestAtt._val) {
      bestAtt = {
        name: pa.name,
        ratio: ratioA,
        _val: valA
      };
    }
  }

  // Meilleur défenseur = meilleur ratio_def (en %) avec au moins 3 matches
  var bestDef = null;
  for (var l = 0; l < playersArr.length; l++) {
    var pd = playersArr[l];
    var ratioD = pd.ratio_def || "-";
    var matchesD = pd.matches || 0;
    if (ratioD === "-" || matchesD < 3) continue;

    var valD = parseFloat(ratioD.replace("%", ""));
    if (isNaN(valD)) continue;

    if (!bestDef || valD > bestDef._val) {
      bestDef = {
        name: pd.name,
        ratio: ratioD,
        _val: valD
      };
    }
  }

  // Injecter dans le HTML si les éléments existent
  var elMatches = document.getElementById("statMatches");
  var elGoals   = document.getElementById("statGoals");
  var elBestAtt = document.getElementById("statBestAtt");
  var elBestDef = document.getElementById("statBestDef");
  var elMostAct = document.getElementById("statMostActive");

  if (elMatches) elMatches.textContent = totalMatches + " match(s) joué(s) dans la saison en cours.";
  if (elGoals)   elGoals.textContent   = totalGoals + " buts marqués au total.";

  if (elMostAct) {
    if (mostActive && (mostActive.matches || 0) > 0) {
      elMostAct.textContent = mostActive.name + " (" + (mostActive.matches || 0) + " match(s) joué(s))";
    } else {
      elMostAct.textContent = "Pas encore de joueur actif.";
    }
  }

  if (elBestAtt) {
    if (bestAtt) {
      elBestAtt.textContent = bestAtt.name + " (" + bestAtt.ratio + " de réussite en attaque, min. 3 matchs)";
    } else {
      elBestAtt.textContent = "Pas encore de meilleur attaquant (conditions non remplies).";
    }
  }

  if (elBestDef) {
    if (bestDef) {
      elBestDef.textContent = bestDef.name + " (" + bestDef.ratio + " de performance défensive, min. 3 matchs)";
    } else {
      elBestDef.textContent = "Pas encore de meilleur défenseur (conditions non remplies).";
    }
  }
}
