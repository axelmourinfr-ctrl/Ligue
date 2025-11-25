// ===============================
// CONFIG
// ===============================
const API_URL = "https://script.google.com/macros/s/AKfycbzaYj_dmVJtKGYBod7r7YA3HIkVh7yUdwTme98p15KxonEWhdsLAxe2CGu7aMcjwgzOZQ/exec";

let STATE = {
  players: {},
  history: [],
  version: 1
};

let isAdmin = false;

// Pour affichage des niveaux de badges
const BADGE_EMOJIS = {
  0: "—",
  1: "🪵",
  2: "🥉",
  3: "🥈",
  4: "🥇",
  5: "💎"
};

// ===============================
// HELPERS API
// ===============================
async function loadState() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json(); // {players, history, version, ...}
    STATE = data;
    renderAll();
    renderMatchForm(); // regénère les listes avec les joueurs à jour
  } catch (e) {
    console.error(e);
    alert("Erreur réseau : impossible de charger la ligue.");
  }
}

async function apiPost(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return await res.json();
}

// ===============================
// ADMIN
// ===============================
function updateAdminVisibility() {
  const adminSections = document.querySelectorAll(".adminOnly");
  adminSections.forEach(sec => {
    sec.style.display = isAdmin ? "block" : "none";
  });
}

function toggleAdmin() {
  const pin = prompt("Code admin :");
  if (pin === "2025") {
    isAdmin = true;
    localStorage.setItem("ligue_admin", "1");
    updateAdminVisibility();
    alert("Mode admin activé");
  } else {
    alert("Code incorrect");
  }
}

// ===============================
// INIT
// ===============================
window.addEventListener("load", () => {
  isAdmin = localStorage.getItem("ligue_admin") === "1";
  updateAdminVisibility();
  loadState();
});

// ===============================
// AJOUT JOUEUR
// ===============================
async function addPlayer() {
  const nameInput = document.getElementById("newPlayerName");
  const name = nameInput.value.trim();
  if (!name) {
    alert("Veuillez entrer un nom de joueur.");
    return;
  }

  if (!STATE.players[name]) {
    STATE.players[name] = {
      prenom: "",
      elo: 1000,
      paid: false,
      w: 0,
      l: 0,
      matches: 0,
      attGoals: 0,
      attMisses: 0,
      defSaves: 0,
      defPasses: 0,
      defGoals: 0,
      defConceded: 0,
      ratio_att: "-",
      ratio_def: "-",
      badges_level: {
        hat_trick_def: 0,
        mur_de_fer: 0,
        precision_chir: 0,
        serial_passeur_def: 0,
        vainqueur_ecrasant: 0,
        progres_continu: 0
      }
    };
  }

  await apiPost({
    action: "updatePlayers",
    players: STATE.players
  });

  nameInput.value = "";
  await loadState();
}

// ===============================
// FORM MATCH (1v1 / 2v2)
// ===============================
function renderMatchForm() {
  const modeSelect = document.getElementById("mode");
  const container = document.getElementById("matchForm");
  if (!modeSelect || !container) return;

  const mode = modeSelect.value;
  const players = Object.keys(STATE.players || {}).sort();

  const options = players
    .map(p => `<option value="${p}">${p}</option>`)
    .join("");

  if (mode === "1v1") {
    container.innerHTML = `
      <div class="row">
        <label>Joueur A</label>
        <select id="p1">
          <option value="">-- Choisir --</option>
          ${options}
        </select>
      </div>
      <div class="row">
        <label>Joueur B</label>
        <select id="p2">
          <option value="">-- Choisir --</option>
          ${options}
        </select>
      </div>
      <div class="row">
        <input id="scoreA" type="number" min="0" max="11" placeholder="Score A" />
        <input id="scoreB" type="number" min="0" max="11" placeholder="Score B" />
      </div>
    `;
  } else {
    container.innerHTML = `
      <h3>Équipe A</h3>
      <div class="row">
        <label>Défenseur A</label>
        <select id="Adef">
          <option value="">-- Choisir --</option>
          ${options}
        </select>
      </div>
      <div class="row">
        <label>Attaquant A</label>
        <select id="Aatt">
          <option value="">-- Choisir --</option>
          ${options}
        </select>
      </div>
      <div class="row">
        <label>Score A</label>
        <input id="scoreA" type="number" min="0" max="11" placeholder="Score A" />
      </div>

      <h4>Stats Équipe A</h4>
      <div class="row">
        <label>Déf A - Buts</label>
        <input id="Adef_goals" type="number" min="0" placeholder="0" />
        <label>Passes</label>
        <input id="Adef_passes" type="number" min="0" placeholder="0" />
      </div>
      <div class="row">
        <label>Déf A - Arrêts</label>
        <input id="Adef_saves" type="number" min="0" placeholder="0" />
        <label>Tirs encaissés</label>
        <input id="Adef_conceded" type="number" min="0" placeholder="0" />
      </div>
      <div class="row">
        <label>Att A - Buts</label>
        <input id="Aatt_goals" type="number" min="0" placeholder="0" />
        <label>Tirs ratés</label>
        <input id="Aatt_misses" type="number" min="0" placeholder="0" />
      </div>

      <h3>Équipe B</h3>
      <div class="row">
        <label>Défenseur B</label>
        <select id="Bdef">
          <option value="">-- Choisir --</option>
          ${options}
        </select>
      </div>
      <div class="row">
        <label>Attaquant B</label>
        <select id="Batt">
          <option value="">-- Choisir --</option>
          ${options}
        </select>
      </div>
      <div class="row">
        <label>Score B</label>
        <input id="scoreB" type="number" min="0" max="11" placeholder="Score B" />
      </div>

      <h4>Stats Équipe B</h4>
      <div class="row">
        <label>Déf B - Buts</label>
        <input id="Bdef_goals" type="number" min="0" placeholder="0" />
        <label>Passes</label>
        <input id="Bdef_passes" type="number" min="0" placeholder="0" />
      </div>
      <div class="row">
        <label>Déf B - Arrêts</label>
        <input id="Bdef_saves" type="number" min="0" placeholder="0" />
        <label>Tirs encaissés</label>
        <input id="Bdef_conceded" type="number" min="0" placeholder="0" />
      </div>
      <div class="row">
        <label>Att B - Buts</label>
        <input id="Batt_goals" type="number" min="0" placeholder="0" />
        <label>Tirs ratés</label>
        <input id="Batt_misses" type="number" min="0" placeholder="0" />
      </div>

      <p class="hint">Les stats sont facultatives, mais utiles pour les ratios & badges.</p>
    `;
  }
}

function clearMatchForm() {
  renderMatchForm();
}

// ===============================
// ENREGISTREMENT MATCH
// ===============================
async function submitMatch() {
  const mode = document.getElementById("mode").value;
  if (mode === "1v1") {
    await submitMatch1v1();
  } else {
    await submitMatch2v2();
  }
}

async function submitMatch1v1() {
  const p1 = document.getElementById("p1").value;
  const p2 = document.getElementById("p2").value;
  const scoreA = parseInt(document.getElementById("scoreA").value, 10);
  const scoreB = parseInt(document.getElementById("scoreB").value, 10);

  if (!p1 || !p2 || isNaN(scoreA) || isNaN(scoreB)) {
    alert("Complète les joueurs et les scores.");
    return;
  }
  if (p1 === p2) {
    alert("Un joueur ne peut pas jouer contre lui-même.");
    return;
  }

  await apiPost({
    action: "submitMatch",
    mode: "1v1",
    scoreA: scoreA,
    scoreB: scoreB,
    p1: p1,
    p2: p2
  });

  await loadState();
}

function valInt(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const v = el.value;
  if (v === "" || v === null || typeof v === "undefined") return 0;
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}

async function submitMatch2v2() {
  const Adef = document.getElementById("Adef").value;
  const Aatt = document.getElementById("Aatt").value;
  const Bdef = document.getElementById("Bdef").value;
  const Batt = document.getElementById("Batt").value;
  const scoreA = parseInt(document.getElementById("scoreA").value, 10);
  const scoreB = parseInt(document.getElementById("scoreB").value, 10);

  if (!Adef || !Aatt || !Bdef || !Batt || isNaN(scoreA) || isNaN(scoreB)) {
    alert("Complète les joueurs et les scores.");
    return;
  }

  const names = [Adef, Aatt, Bdef, Batt];
  if ((new Set(names)).size < names.length) {
    alert("Un joueur ne peut pas jouer dans les deux équipes.");
    return;
  }

  // 1) backend : Elo, V/D, matches, history
  await apiPost({
    action: "submitMatch",
    mode: "2v2",
    scoreA: scoreA,
    scoreB: scoreB,
    a1: Aatt,
    d1: Adef,
    a2: Batt,
    d2: Bdef
  });

  // 2) recharger l'état pour avoir Elo et V/D à jour
  await loadState();

  // 3) Appliquer les stats détaillées côté front puis les envoyer via updatePlayers
  const pAdef = ensurePlayer(Adef);
  const pAatt = ensurePlayer(Aatt);
  const pBdef = ensurePlayer(Bdef);
  const pBatt = ensurePlayer(Batt);

  const Adef_goals     = valInt("Adef_goals");
  const Adef_passes    = valInt("Adef_passes");
  const Adef_saves     = valInt("Adef_saves");
  const Adef_conceded  = valInt("Adef_conceded");
  const Aatt_goals     = valInt("Aatt_goals");
  const Aatt_misses    = valInt("Aatt_misses");

  const Bdef_goals     = valInt("Bdef_goals");
  const Bdef_passes    = valInt("Bdef_passes");
  const Bdef_saves     = valInt("Bdef_saves");
  const Bdef_conceded  = valInt("Bdef_conceded");
  const Batt_goals     = valInt("Batt_goals");
  const Batt_misses    = valInt("Batt_misses");

  pAdef.defGoals    = (pAdef.defGoals    || 0) + Adef_goals;
  pAdef.defPasses   = (pAdef.defPasses   || 0) + Adef_passes;
  pAdef.defSaves    = (pAdef.defSaves    || 0) + Adef_saves;
  pAdef.defConceded = (pAdef.defConceded || 0) + Adef_conceded;

  pAatt.attGoals    = (pAatt.attGoals    || 0) + Aatt_goals;
  pAatt.attMisses   = (pAatt.attMisses   || 0) + Aatt_misses;

  pBdef.defGoals    = (pBdef.defGoals    || 0) + Bdef_goals;
  pBdef.defPasses   = (pBdef.defPasses   || 0) + Bdef_passes;
  pBdef.defSaves    = (pBdef.defSaves    || 0) + Bdef_saves;
  pBdef.defConceded = (pBdef.defConceded || 0) + Bdef_conceded;

  pBatt.attGoals    = (pBatt.attGoals    || 0) + Batt_goals;
  pBatt.attMisses   = (pBatt.attMisses   || 0) + Batt_misses;

  recomputeRatios(pAdef);
  recomputeRatios(pAatt);
  recomputeRatios(pBdef);
  recomputeRatios(pBatt);

  await apiPost({
    action: "updatePlayers",
    players: STATE.players
  });

  await loadState();
  clearMatchForm();
}

function ensurePlayer(name) {
  if (!STATE.players[name]) {
    STATE.players[name] = {
      prenom: "",
      elo: 1000,
      paid: false,
      w: 0,
      l: 0,
      matches: 0,
      attGoals: 0,
      attMisses: 0,
      defSaves: 0,
      defPasses: 0,
      defGoals: 0,
      defConceded: 0,
      ratio_att: "-",
      ratio_def: "-",
      badges_level: {
        hat_trick_def: 0,
        mur_de_fer: 0,
        precision_chir: 0,
        serial_passeur_def: 0,
        vainqueur_ecrasant: 0,
        progres_continu: 0
      }
    };
  }
  return STATE.players[name];
}

function recomputeRatios(p) {
  const shots = (p.attGoals || 0) + (p.attMisses || 0);
  if (shots > 0) {
    p.ratio_att = ((p.attGoals || 0) * 100 / shots).toFixed(1) + "%";
  } else {
    p.ratio_att = "-";
  }

  const defGood = (p.defSaves || 0) + (p.defPasses || 0) + (p.defGoals || 0);
  const defTotal = defGood + (p.defConceded || 0);
  if (defTotal > 0) {
    p.ratio_def = (defGood * 100 / defTotal).toFixed(1) + "%";
  } else {
    p.ratio_def = "-";
  }
}

// ===============================
// GESTION LIGUE : nouvelle saison / bonus
// ===============================
async function newSeason() {
  if (!isAdmin) {
    alert("Réservé à l'admin.");
    return;
  }
  if (!confirm("Réinitialiser toutes les stats (Elo conservé) ?")) return;

  await apiPost({ action: "newSeason" });
  await loadState();
}

async function applyBonus() {
  if (!isAdmin) {
    alert("Réservé à l'admin.");
    return;
  }

  const name = document.getElementById("bonusName").value.trim();
  const amount = parseInt(document.getElementById("bonusAmount").value, 10);
  if (!name || isNaN(amount)) {
    alert("Nom ou montant invalide.");
    return;
  }

  await apiPost({ action: "applyBonus", name: name, amount: amount });
  await loadState();

  document.getElementById("bonusName").value = "";
  document.getElementById("bonusAmount").value = "";
}

// ===============================
// GESTION JOUEURS (Admin)
// ===============================
function renderAdminPlayerLists() {
  const selectEdit = document.getElementById("editPlayerSelect");
  const selectDelete = document.getElementById("deletePlayerSelect");
  const players = Object.keys(STATE.players || {}).sort();

  if (selectEdit) {
    selectEdit.innerHTML = '<option value="">-- Choisir un joueur --</option>';
    players.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      selectEdit.appendChild(opt);
    });
  }

  if (selectDelete) {
    selectDelete.innerHTML = '<option value="">-- Choisir un joueur --</option>';
    players.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      selectDelete.appendChild(opt);
    });
  }
}

async function renamePlayer() {
  if (!isAdmin) {
    alert("Réservé à l'admin.");
    return;
  }

  const select = document.getElementById("editPlayerSelect");
  const newNameInput = document.getElementById("renameNewName");
  if (!select || !newNameInput) return;

  const oldName = select.value;
  const newName = newNameInput.value.trim();

  if (!oldName) {
    alert("Choisis un joueur à renommer.");
    return;
  }
  if (!newName) {
    alert("Entre un nouveau nom.");
    return;
  }
  if (STATE.players[newName] && newName !== oldName) {
    alert("Un joueur avec ce nom existe déjà.");
    return;
  }

  // Copier les données
  STATE.players[newName] = STATE.players[oldName];
  if (newName !== oldName) {
    delete STATE.players[oldName];
  }

  await apiPost({
    action: "updatePlayers",
    players: STATE.players
  });

  newNameInput.value = "";
  await loadState();
}

async function deletePlayer() {
  if (!isAdmin) {
    alert("Réservé à l'admin.");
    return;
  }

  const select = document.getElementById("deletePlayerSelect");
  if (!select) return;

  const name = select.value;
  if (!name) {
    alert("Choisis un joueur à supprimer.");
    return;
  }

  if (!confirm("Supprimer " + name + " du classement ? (L'historique des matchs reste intact)")) {
    return;
  }

  delete STATE.players[name];

  await apiPost({
    action: "updatePlayers",
    players: STATE.players
  });

  await loadState();
}

// ===============================
// RENDU GLOBAL
// ===============================
function renderAll() {
  renderRanking();
  renderBadgesTable();
  renderHallOfFame();
  renderHistoryAdmin();
  renderAdminPlayerLists();
}

// Classement
function renderRanking() {
  const tbody = document.getElementById("rankingBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const arr = Object.entries(STATE.players || {})
    .map(([name, p]) => ({ name: name, ...p }))
    .sort((a, b) => (b.elo || 0) - (a.elo || 0));

  arr.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.name}</td>
      <td>${p.elo}</td>
      <td>${p.w || 0}</td>
      <td>${p.l || 0}</td>
      <td>${p.attGoals || 0}</td>
      <td>${p.defPasses || 0}</td>
      <td>${p.defSaves || 0}</td>
      <td>${p.attMisses || 0}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===============================
// TABLEAU DES BADGES
// ===============================
function renderBadgesTable() {
  const tbody = document.getElementById("badgesBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const arr = Object.entries(STATE.players || {})
    .map(([name, p]) => ({ name: name, ...p }))
    .sort((a, b) => (b.elo || 0) - (a.elo || 0));

  arr.forEach(p => {
    const b = p.badges_level || {};
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.name}</td>
      <td>${BADGE_EMOJIS[b.vainqueur_ecrasant || 0]}</td>
      <td>${BADGE_EMOJIS[b.mur_de_fer || 0]}</td>
      <td>${BADGE_EMOJIS[b.hat_trick_def || 0]}</td>
      <td>${BADGE_EMOJIS[b.precision_chir || 0]}</td>
      <td>${BADGE_EMOJIS[b.serial_passeur_def || 0]}</td>
      <td>${BADGE_EMOJIS[b.progres_continu || 0]}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===============================
// HALL OF FAME (par catégorie)
// ===============================
function renderHallOfFame() {
  const tbody = document.getElementById("hofBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const categories = [
    { key: "vainqueur_ecrasant", label: "Vainqueur écrasant" },
    { key: "mur_de_fer", label: "Mur de fer" },
    { key: "hat_trick_def", label: "Hat-trick Déf." },
    { key: "precision_chir", label: "Précision chir." },
    { key: "serial_passeur_def", label: "Serial passeur (Déf.)" },
    { key: "progres_continu", label: "Progrès continu" }
  ];

  categories.forEach(cat => {
    let bestPlayers = [];
    let bestDiamonds = 0;

    for (const [name, p] of Object.entries(STATE.players || {})) {
      const lvl = (p.badges_level && p.badges_level[cat.key]) || 0;
      const diamonds = (lvl === 5) ? 1 : 0;
      if (diamonds > 0) {
        if (diamonds > bestDiamonds) {
          bestDiamonds = diamonds;
          bestPlayers = [name];
        } else if (diamonds === bestDiamonds) {
          bestPlayers.push(name);
        }
      }
    }

    const tr = document.createElement("tr");
    if (bestDiamonds === 0 || bestPlayers.length === 0) {
      tr.innerHTML = `
        <td>${cat.label}</td>
        <td>Aucun pour l'instant</td>
        <td>—</td>
      `;
    } else {
      tr.innerHTML = `
        <td>${cat.label}</td>
        <td>${bestPlayers.join(", ")}</td>
        <td>${"💎".repeat(bestDiamonds)}</td>
      `;
    }
    tbody.appendChild(tr);
  });
}

// ===============================
// HISTORIQUE ADMIN (10 derniers matchs)
// ===============================
function renderHistoryAdmin() {
  const container = document.getElementById("historyAdmin");
  if (!container) return;

  if (!isAdmin) {
    container.textContent = "Réservé à l'admin.";
    return;
  }

  const hist = STATE.history || [];
  if (hist.length === 0) {
    container.textContent = "Aucun match enregistré pour l'instant.";
    return;
  }

  const last10 = hist.slice(-10).reverse();
  const lines = last10.map(m => {
    const d = new Date(m.date || "");
    const when = isNaN(d.getTime())
      ? ""
      : d.toLocaleString("fr-BE", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        });

    const sA = (typeof m.scoreA === "number") ? m.scoreA : "?";
    const sB = (typeof m.scoreB === "number") ? m.scoreB : "?";

    return "• [" + when + "] " + (m.mode || "?") + " : " + sA + " - " + sB;
  });

  container.innerHTML = lines.join("<br>");
}
