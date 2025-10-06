// === CONFIG CLOUD (Google Apps Script WebApp) ===
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzaYj_dmVJtKGYBod7r7YA3HIkVh7yUdwTme98p15KxonEWhdsLAxe2CGu7aMcjwgzOZQ/exec";
const USE_REMOTE = true;
const AUTO_REFRESH_MS = 10000;

// --- Elo & règles ---
const DEFAULT_ELO = 1000;
const K_FACTOR = 32;

// --- ANTI-FARM / CONDITIONS BADGES ---
const N_MIN_MATCHES = 5;   // chaque joueur non-invité du match doit avoir >= 5 matchs
const ELO_TOLERANCE = 50;  // fenêtre ±50 ou outsider <= -50

// --- ADMIN / STATE ---
const ADMIN_PIN = "2025";
function currentYear(){ return new Date().getFullYear(); }
let db = { version:1, players:{}, history:[], hofYear: currentYear(), hof:{} };

let adminUnlocked = sessionStorage.getItem('bf_admin_unlocked') === '1';
let initialLoaded = false;
let writeLock = false;

// ----------- PALIERS DES BADGES (par difficulté) -----------
function gradeIcon(g){ return g===5?'💎':g===4?'🥇':g===3?'🥈':g===2?'🥉':g===1?'🪵':''; }
// Retourne un grade 0..5 selon la performance brute d’UN match
function gradeHatTrickDef(goals){ if(goals>=7) return 5; if(goals>=6) return 4; if(goals>=5) return 3; if(goals>=4) return 2; if(goals>=3) return 1; return 0; }
function gradeMurDeFer(saves){ if(saves>=20) return 5; if(saves>=18) return 4; if(saves>=15) return 3; if(saves>=12) return 2; if(saves>=10) return 1; return 0; }
function gradePrecisionChir(teamWon, teamGoals, misses){
  if(!(teamWon && teamGoals>=11)) return 0;
  if(misses<=0) return 5;
  if(misses<=1) return 4;
  if(misses<=2) return 3;
  if(misses<=3) return 2;
  if(misses<=4) return 1;
  return 0;
}
function gradeSerialPasseurDef(assists){ if(assists>=7) return 5; if(assists>=6) return 4; if(assists>=5) return 3; if(assists>=4) return 2; if(assists>=3) return 1; return 0; }

// ----------- RÉSEAU -----------
async function chargerEtatDistant(){
  if(!USE_REMOTE) return;
  const url = WEB_APP_URL + '?t=' + Date.now();
  const r = await fetch(url, { cache:'no-store' });
  const j = await r.json();
  if(j.ok && j.state){
    db = j.state;
    db.players ||= {};
    db.history ||= [];
    db.hofYear ||= currentYear();
    db.hof ||= {};
    migratePlayersModel();
  }
}
async function syncLatestBeforeWrite(){ if(!USE_REMOTE) return; try{ await chargerEtatDistant(); }catch(e){} }
async function sauvegarderEtatDistant(){
  if(!USE_REMOTE) return;
  db.version = (db.version||1) + 1;
  try{
    await fetch(WEB_APP_URL, {
      method:'POST', mode:'no-cors',
      headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body: JSON.stringify({ state: db })
    });
  }catch(e){}finally{
    localStorage.setItem('bf_league_db_v3', JSON.stringify(db));
  }
}
async function persist(){
  localStorage.setItem('bf_league_db_v3', JSON.stringify(db));
  renderAll();
  await sauvegarderEtatDistant();
}

// ----------- HELPERS -----------
function isGuest(name){ if(!name) return true; const n=name.trim().toLowerCase(); return n==='invité'||n==='invite'||n.startsWith('invité'); }
function ensurePlayer(name, prenom=''){
  const n=(name||'').trim(); if(!n||isGuest(n)) return null;
  if(!db.players[n]){
    db.players[n] = {
      prenom:(prenom||'').trim(), elo:DEFAULT_ELO, paid:false,
      w:0,l:0,matches:0, goals:0,assists:0,saves:0,misses:0,
      // meilleurs grades saison (0..5)
      badges_level:{ hat_trick_def:0, mur_de_fer:0, precision_chir:0, serial_passeur_def:0 }
    };
  }else if(prenom && !db.players[n].prenom){ db.players[n].prenom = prenom.trim(); }
  return n;
}
function expectedScore(a,b){ return 1/(1+Math.pow(10,(b-a)/400)); }
function ratioVD(p){ const t=p.w+p.l; return t? (p.w/t):0; }
function effPercent(p){ const shots=p.goals+p.misses; return shots? (p.goals/shots):0; }

// ----------- MIGRATION (compat anciennes structures) -----------
function migratePlayersModel(){
  for(const name in db.players){
    const p = db.players[name];
    p.badges_level ||= { hat_trick_def:0, mur_de_fer:0, precision_chir:0, serial_passeur_def:0 };
    // S’il existe un ancien champ badges_prog/badges, on garde seulement le meilleur grade déjà stocké (s’il y en avait).
    if(p.badges){ delete p.badges; }
    if(p.badges_prog){ delete p.badges_prog; }
  }
}

// ----------- Anti-doublon (même match, 10 minutes) -----------
function canonicalTeamSignature(team){
  // uniquement joueurs réguliers (non invités), triés alphabétiquement
  const regs = team.filter(p=>!isGuest(p.name)).map(p=>p.name.trim()).sort((a,b)=>a.localeCompare(b));
  return regs.join('|');
}
function isDuplicateMatch(mode, teamA, teamB, scoreA, scoreB){
  if(!db.history || db.history.length===0) return false;
  const sigA = canonicalTeamSignature(teamA);
  const sigB = canonicalTeamSignature(teamB);
  const now = Date.now();
  for(const h of db.history){
    // vérifier fenêtre de 10 minutes
    const t = new Date(h.date).getTime();
    if(Math.abs(now - t) > 10*60*1000) break; // historique trié du plus récent au plus ancien
    if(h.mode!==mode) continue;
    if(h.scoreA!==scoreA || h.scoreB!==scoreB) continue;
    const hA = canonicalTeamSignature(h.teamA||[]);
    const hB = canonicalTeamSignature(h.teamB||[]);
    if((hA===sigA && hB===sigB) || (hA===sigB && hB===sigA)) return true;
  }
  return false;
}

// ----------- Eligibilité badges (anti-farm) -----------
function allNonGuestsHaveMinMatches(team){
  const regs = team.filter(p=>!isGuest(p.name));
  if(regs.length===0) return false;
  return regs.every(p => (db.players[p.name]?.matches||0) >= N_MIN_MATCHES);
}
function avgOppElo(team){
  const regs = team.filter(p=>!isGuest(p.name));
  if(!regs.length) return null;
  return regs.reduce((s,p)=>s+(db.players[p.name]?.elo||DEFAULT_ELO),0)/regs.length;
}
function eligibleForBadges(ref, isA, teamA, teamB){
  if(!ref) return false;
  // Chaque joueur non-invité du match doit avoir >= 5 matchs
  const regsAok = allNonGuestsHaveMinMatches(teamA);
  const regsBok = allNonGuestsHaveMinMatches(teamB);
  if(!(regsAok && regsBok)) return false;

  const oppAvg = avgOppElo(isA?teamB:teamA);
  if(oppAvg===null) return false;
  const diff = ref.elo - oppAvg;
  const within = Math.abs(diff) <= ELO_TOLERANCE;
  const underdog = (ref.elo + ELO_TOLERANCE) < oppAvg; // ref a au moins 50 de moins
  return within || underdog;
}

// ----------- UI: Ajouter joueur -----------
async function addPlayer(){
  if(!initialLoaded){ alert('Chargement en cours…'); return; }
  if(writeLock) return; writeLock=true;
  try{
    await syncLatestBeforeWrite();
    const prenom=document.getElementById('newPlayerPrenom').value;
    const name=document.getElementById('newPlayerName').value;
    const ok=ensurePlayer(name, prenom);
    if(!ok){ alert('Nom/Pseudo invalide. (Évite “Invité”)'); return; }
    document.getElementById('newPlayerPrenom').value='';
    document.getElementById('newPlayerName').value='';
    await persist();
  }finally{ writeLock=false; }
}

// ----------- Formulaire match -----------
function renderMatchForm(){
  const mode=document.getElementById('mode').value;
  const box=document.getElementById('matchForm'); box.innerHTML='';
  if(mode==='1v1'){ box.appendChild(playerForm('Joueur A')); box.appendChild(playerForm('Joueur B')); }
  else { box.appendChild(playerForm('Équipe A - Joueur 1')); box.appendChild(playerForm('Équipe A - Joueur 2'));
         box.appendChild(playerForm('Équipe B - Joueur 1')); box.appendChild(playerForm('Équipe B - Joueur 2')); }
  const sc=document.createElement('div'); sc.className='player-form';
  sc.innerHTML=`<div class="score-box">
    <div class="badge">Total buts Équipe A</div><input id="scoreA" type="number" value="0" />
    <div class="badge">Total buts Équipe B</div><input id="scoreB" type="number" value="0" />
  </div><p class="hint">Optionnel : si tu laisses 0-0, on calcule avec la somme des buts individuels.</p>`;
  box.appendChild(sc);
}
function playerForm(title){
  const w=document.createElement('div'); w.className='player-form';
  w.innerHTML=`<h4>${title}</h4>
    <div class="row wrap"><label>Nom/Pseudo</label><input class="p-name" placeholder="Ex: Axel ou Invité"/></div>
    <div class="row wrap"><label>Rôle</label><select class="p-role"><option value="attaquant">Attaquant</option><option value="defenseur">Défenseur</option></select></div>
    <div class="row wrap"><label>Buts</label><input class="p-goals" type="number" value="0"/></div>
    <div class="row wrap"><label>Passes (déf.)</label><input class="p-assists" type="number" value="0"/></div>
    <div class="row wrap"><label>Arrêts (déf.)</label><input class="p-saves" type="number" value="0"/></div>
    <div class="row wrap"><label>Tirs ratés (att.)</label><input class="p-misses" type="number" value="0"/></div>`;
  return w;
}
function clearMatchForm(){ renderMatchForm(); }

// ----------- Enregistrer match -----------
async function submitMatch(){
  if(!initialLoaded){ alert('Chargement en cours…'); return; }
  if(writeLock) return; writeLock=true;
  try{
    await syncLatestBeforeWrite();

    const mode=document.getElementById('mode').value;
    const forms=Array.from(document.querySelectorAll('#matchForm .player-form')).filter(d=>d.querySelector('.p-name'));
    const playersData=forms.map(f=>({
      name:(f.querySelector('.p-name').value||'').trim(),
      role:f.querySelector('.p-role').value,
      goals:parseInt(f.querySelector('.p-goals').value||'0',10),
      assists:parseInt(f.querySelector('.p-assists').value||'0',10),
      saves:parseInt(f.querySelector('.p-saves').value||'0',10),
      misses:parseInt(f.querySelector('.p-misses').value||'0',10),
    }));

    // Vérifs : nom + cotisation (sauf Invité)
    for(const p of playersData){
      if(!p.name){ alert('Renseigne tous les noms.'); return; }
      if(!isGuest(p.name)){
        ensurePlayer(p.name);
        if(!db.players[p.name].paid){ alert(`${p.name} doit payer sa cotisation.`); return; }
      }
    }

    const half=playersData.length/2;
    const teamA=playersData.slice(0,half);
    const teamB=playersData.slice(half);

    let scoreA=parseInt(document.getElementById('scoreA')?.value||'0',10);
    let scoreB=parseInt(document.getElementById('scoreB')?.value||'0',10);
    if(scoreA===0&&scoreB===0){ scoreA=teamA.reduce((s,p)=>s+(p.goals||0),0); scoreB=teamB.reduce((s,p)=>s+(p.goals||0),0); }

    // Anti-doublon (10 minutes, mêmes équipes régulières et même score)
    if(isDuplicateMatch(mode, teamA, teamB, scoreA, scoreB)){
      alert('Ce match semble déjà avoir été enregistré récemment (anti-doublon 10 min).');
      return;
    }

    // Mise à jour stats
    const regPlayers=playersData.filter(p=>!isGuest(p.name));
    for(const p of regPlayers){
      const ref=db.players[p.name];
      ref.matches+=1; ref.goals+=p.goals;
      if(p.role==='defenseur'){ ref.assists+=p.assists; ref.saves+=p.saves; }
      else { ref.misses+=p.misses; }
    }

    // Résultat & V/D
    const resA=scoreA>scoreB?1:(scoreA===scoreB?0.5:0);
    const resB=1-resA;
    for(const p of teamA) if(!isGuest(p.name)){ if(resA===1) db.players[p.name].w++; else if(resA===0) db.players[p.name].l++; }
    for(const p of teamB) if(!isGuest(p.name)){ if(resB===1) db.players[p.name].w++; else if(resB===0) db.players[p.name].l++; }

    // Elo
    function teamAvgElo(team){ const regs=team.filter(p=>!isGuest(p.name)); if(!regs.length) return null; return Math.round(regs.reduce((s,p)=>s+db.players[p.name].elo,0)/regs.length); }
    const eloA=teamAvgElo(teamA), eloB=teamAvgElo(teamB);
    if(eloA!==null&&eloB!==null){
      const eA=expectedScore(eloA,eloB), eB=expectedScore(eloB,eloA);
      const dA=Math.round(K_FACTOR*(resA-eA)), dB=Math.round(K_FACTOR*(resB-eB));
      for(const p of teamA) if(!isGuest(p.name)) db.players[p.name].elo+=dA;
      for(const p of teamB) if(!isGuest(p.name)) db.players[p.name].elo+=dB;
    }

    // Badges (anti-farm + meilleurs grades saison)
    for(let idx=0; idx<playersData.length; idx++){
      const P=playersData[idx]; if(isGuest(P.name)) continue;
      const ref=db.players[P.name];
      const isA = idx<half;
      if(!eligibleForBadges(ref, isA, teamA, teamB)) continue;

      // calcul des grades atteints sur CE match
      if(P.role==='defenseur'){
        const gHT = gradeHatTrickDef(P.goals);
        const gMF = gradeMurDeFer(P.saves);
        const gSP = gradeSerialPasseurDef(P.assists);
        if(gHT > (ref.badges_level.hat_trick_def||0)) ref.badges_level.hat_trick_def = gHT;
        if(gMF > (ref.badges_level.mur_de_fer||0))    ref.badges_level.mur_de_fer    = gMF;
        if(gSP > (ref.badges_level.serial_passeur_def||0)) ref.badges_level.serial_passeur_def = gSP;
        if(ref.badges_level.hat_trick_def===5) hofAdd(P.name,'hat_trick_def',5);
        if(ref.badges_level.mur_de_fer===5)    hofAdd(P.name,'mur_de_fer',5);
        if(ref.badges_level.serial_passeur_def===5) hofAdd(P.name,'serial_passeur_def',5);
      }else{
        const teamGoals=isA?scoreA:scoreB;
        const teamWon=isA?(resA===1):(resB===1);
        const gPC = gradePrecisionChir(teamWon, teamGoals, P.misses);
        if(gPC > (ref.badges_level.precision_chir||0)) ref.badges_level.precision_chir = gPC;
        if(ref.badges_level.precision_chir===5) hofAdd(P.name,'precision_chir',5);
      }
    }

    // Historique
    const record={ date:new Date().toISOString(), mode, scoreA, scoreB,
      teamA:teamA.map(x=>({name:x.name,role:x.role,goals:x.goals,assists:x.assists,saves:x.saves,misses:x.misses})),
      teamB:teamB.map(x=>({name:x.name,role:x.role,goals:x.goals,assists:x.assists,saves:x.saves,misses:x.misses})) };
    db.history.unshift(record);

    await persist();
    clearMatchForm();
    alert('Match enregistré !');
  }finally{ writeLock=false; }
}

// ----------- RENDUS -----------
function setSeasonLabel(){
  const el=document.getElementById('seasonLabel'); if(!el) return;
  const d=new Date();
  const mois = d.toLocaleString(undefined,{month:'long'});
  el.textContent = `Saison de ${mois} ${d.getFullYear()}`;
}
function renderRanking(){
  const body=document.getElementById('rankingBody');
  const rows=Object.entries(db.players)
    .sort((a,b)=>b[1].elo-a[1].elo || a[0].localeCompare(b[0]))
    .map(([name,s])=>{
      const vd=(ratioVD(s)*100).toFixed(0)+'%';
      const eff=(effPercent(s)*100).toFixed(0)+'%';
      const badges=[
        s.badges_level?.hat_trick_def?`HT Déf <span class="grade">${gradeIcon(s.badges_level.hat_trick_def)}</span>`:'',
        s.badges_level?.mur_de_fer?`Mur <span class="grade">${gradeIcon(s.badges_level.mur_de_fer)}</span>`:'',
        s.badges_level?.precision_chir?`Précis <span class="grade">${gradeIcon(s.badges_level.precision_chir)}</span>`:'',
        s.badges_level?.serial_passeur_def?`Passeur <span class="grade">${gradeIcon(s.badges_level.serial_passeur_def)}</span>`:''
      ].filter(Boolean).join(' ');
      const pseudo = `<span class="pseudo-link" onclick="openProfile('${name.replace(/'/g,"\\'")}')">${name}</span>`;
      return `<tr>
        <td>${pseudo}</td><td>${s.prenom||''}</td><td><strong>${s.elo}</strong></td>
        <td>${s.w}</td><td>${s.l}</td><td>${(s.w+s.l)?vd:'—'}</td>
        <td>${s.goals}</td><td>${s.assists}</td><td>${s.saves}</td><td>${s.misses}</td>
        <td>${(s.goals+s.misses)?eff:'—'}</td><td>${badges||'—'}</td>
      </tr>`;
    }).join('');
  body.innerHTML=rows || '<tr><td colspan="12">Aucun joueur</td></tr>';
}
function renderHof(){
  const body=document.getElementById('hofBody'); if(!body) return;
  const entries=Object.entries(db.hof);
  const rows=entries.sort((a,b)=>a[0].localeCompare(b[0])).map(([name,h])=>{
    const d1=h.hat_trick_def?.[5]||0, d2=h.mur_de_fer?.[5]||0, d3=h.precision_chir?.[5]||0, d4=h.serial_passeur_def?.[5]||0;
    return `<tr><td>${name}</td><td>${d1}</td><td>${d2}</td><td>${d3}</td><td>${d4}</td></tr>`;
  }).join('');
  body.innerHTML = rows || '<tr><td colspan="5">Aucun diamant enregistré pour le moment</td></tr>';
}
function renderHistory(){
  const body=document.getElementById('historyBody');
  const rows=db.history.map(h=>{
    const date=new Date(h.date).toLocaleString();
    const ta=h.teamA.map(p=>`${p.name} (${p.role}) ${p.goals}B/${p.assists}P/${p.saves}A/${p.misses}T`).join(' • ');
    const tb=h.teamB.map(p=>`${p.name} (${p.role}) ${p.goals}B/${p.assists}P/${p.saves}A/${p.misses}T`).join(' • ');
    return `<tr><td>${date}</td><td>${h.mode}</td><td>${ta}</td><td>${h.scoreA} - ${h.scoreB}</td><td>${tb}</td></tr>`;
  }).join('');
  body.innerHTML=rows || '<tr><td colspan="5">Aucun match enregistré</td></tr>';
}
function renderAdmin(){
  const body=document.getElementById('adminBody'); if(!body) return;
  if(!adminUnlocked){ body.innerHTML=''; return; }
  const rows=Object.entries(db.players).sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([name,s])=>`<tr>
      <td>${name}</td><td>${s.prenom||''}</td><td>${s.paid?'✅':'❌'}</td>
      <td>${s.matches}</td>
      <td><button class="btn" onclick="togglePaidProtected('${name.replace(/'/g,"\\'")}')">${s.paid?'Marquer non payé':'Marquer payé'}</button></td>
    </tr>`).join('');
  body.innerHTML=rows || '<tr><td colspan="5">Aucun joueur</td></tr>';
}
function renderAll(){ setSeasonLabel(); renderRanking(); renderHof(); renderHistory(); updateAdminVisibility(); }

// ----------- Admin & Profil -----------
function updateAdminVisibility(){ const tools=document.getElementById('adminTools'); if(!tools) return; tools.style.display=adminUnlocked?'block':'none'; }
function demanderPINAdmin(){ const pin=prompt('Code admin :'); if(pin===ADMIN_PIN){ adminUnlocked=true; sessionStorage.setItem('bf_admin_unlocked','1'); alert('Accès admin activé.'); updateAdminVisibility(); renderAdmin(); } else alert('Code incorrect.'); }
function toggleAdmin(){ if(!adminUnlocked){ demanderPINAdmin(); return; } const t=document.getElementById('adminTools'); t.style.display=(t.style.display==='none')?'block':'none'; renderAdmin(); }
function ensureAdminOrAlert(){ if(!adminUnlocked){ alert('Accès admin requis — demande au patron.'); return false; } return true; }
function togglePaidProtected(name){ if(!ensureAdminOrAlert()) return; const p=db.players[name]; if(!p) return; p.paid=!p.paid; persist(); }

function openProfile(name){
  const p=db.players[name]; if(!p) return;
  const html=`
    <h3>${name} ${p.prenom?`(${p.prenom})`:''}</h3>
    <p><b>Elo :</b> ${p.elo} — <b>V/D :</b> ${p.w}/${p.l} — <b>Matchs :</b> ${p.matches}</p>
    <p><b>Buts :</b> ${p.goals} — <b>Passes (déf.) :</b> ${p.assists} — <b>Arrêts (déf.) :</b> ${p.saves} — <b>Tirs ratés (att.) :</b> ${p.misses}</p>
    <p><b>Badges (meilleur grade saison) :</b>
      HT Déf ${gradeIcon(p.badges_level.hat_trick_def)||'—'} |
      Mur ${gradeIcon(p.badges_level.mur_de_fer)||'—'} |
      Précis ${gradeIcon(p.badges_level.precision_chir)||'—'} |
      Passeur ${gradeIcon(p.badges_level.serial_passeur_def)||'—'}
    </p>
  `;
  document.getElementById('playerProfile').innerHTML = html;
  document.getElementById('playerModal').style.display='block';
}
function closeModal(){ document.getElementById('playerModal').style.display='none'; }

// ----------- Outils ligue -----------
function newSeason(){
  if(!ensureAdminOrAlert()) return;
  if(!confirm('Confirmer : réinitialiser stats/profils/badges (Elo et Hall of Fame conservés) ?')) return;
  for(const name in db.players){
    const p=db.players[name];
    p.w=0; p.l=0; p.matches=0;
    p.goals=0; p.assists=0; p.saves=0; p.misses=0;
    p.badges_level={ hat_trick_def:0, mur_de_fer:0, precision_chir:0, serial_passeur_def:0 };
  }
  db.history=[];
  persist();
  alert('Nouvelle saison lancée ! (Elo et Hall of Fame annuel conservés)');
}

function applyBonus(){
  if(!ensureAdminOrAlert()) return;
  const name=(document.getElementById('bonusName').value||'').trim();
  const pts=parseInt(document.getElementById('bonusAmount').value||'0',10);
  if(!name||isGuest(name)){ alert('Nom manquant ou invalide'); return; }
  if(isNaN(pts)||pts===0){ alert('Indique un nombre de points Elo (ex: 50 ou -10)'); return; }
  if(pts<0){
    const ok = confirm(`Confirmer le MALUS de ${pts} points pour ${name} ?`);
    if(!ok) return;
  }
  ensurePlayer(name);
  db.players[name].elo+=pts;
  persist();
  alert(`Ajustement Elo appliqué à ${name} : ${pts>0?'+':''}${pts}`);
}

// ----------- Init -----------
renderMatchForm();
(async () => {
  try{
    if(USE_REMOTE) await chargerEtatDistant();
  }catch(e){
    const local = localStorage.getItem('bf_league_db_v3');
    if(local) db = JSON.parse(local);
    migratePlayersModel();
  }finally{
    initialLoaded = true;
    renderAll();
    if(USE_REMOTE) setInterval(async ()=>{ try{ await chargerEtatDistant(); renderAll(); }catch(e){} }, AUTO_REFRESH_MS);
  }
})();
