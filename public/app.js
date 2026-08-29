let DATA = null;
let page = 0;
let timer = null;
const ROTATE_MS = 8000;

const $ = s => document.querySelector(s);

function esc(v){
  return String(v ?? "").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function getVal(row, keys, fallback=""){
  for(const key of keys){
    if(row.values && row.values[key] !== undefined && row.values[key] !== null)
      return row.values[key];
  }
  return fallback;
}

function teamLogo(id){
  return id ? `<img class="logo" src="https://api.promiedos.com.ar/images/team/${encodeURIComponent(id)}/1" onerror="this.style.display='none'">` : "";
}

function renderTable(){
  const tables = DATA?.tables || [];
  if(!tables.length){
    $("#tableName").textContent = "Sin datos";
    $("#table").innerHTML = "<p style='padding:30px'>No se recibieron tablas.</p>";
    return;
  }

  const t = tables[page % tables.length];
  $("#tableName").textContent = t.name;
  $("#counter").textContent = `${(page % tables.length)+1} / ${tables.length}`;

  const rows = t.rows || [];
  const isSpecial = /promed|relegation|anual/i.test(t.name);

  let html = `<table><thead><tr>
    <th>#</th><th>Equipo</th><th>PTS</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF:GC</th><th>DIF</th>
  </tr></thead><tbody>`;

  for(const r of rows){
    const pts = getVal(r,["Points","Puntos","PTS","pts"],"");
    const pj = getVal(r,["GamePlayed","GamesPlayed","PJ","Played"],"");
    const g = getVal(r,["GamesWon","Won","G"],"");
    const e = getVal(r,["GamesEven","Draw","E"],"");
    const p = getVal(r,["GamesLost","Lost","P"],"");
    const goals = getVal(r,["Goals","GF:GC"],"");
    const dif = getVal(r,["Ratio","Difference","DIF"],"");

    html += `<tr>
      <td>${esc(r.pos)}</td>
      <td class="team">${teamLogo(r.teamId)}${esc(r.team)}</td>
      <td class="pts">${esc(pts)}</td>
      <td>${esc(pj)}</td>
      <td>${esc(g)}</td>
      <td>${esc(e)}</td>
      <td>${esc(p)}</td>
      <td>${esc(goals)}</td>
      <td>${esc(dif)}</td>
    </tr>`;
  }
  html += "</tbody></table>";
  $("#table").innerHTML = html;
}

function matchHtml(g){
  return `<div class="match">
    <div class="when">${g.played ? "FINAL" : "PRÓX."}</div>
    <div class="teams">${esc(g.home)}<br>${esc(g.away)}</div>
    <div class="score ${g.played ? "" : "pending"}">${esc(g.score || "–")}</div>
  </div>`;
}

function renderSide(){
  const results = DATA?.results || [];
  const next = DATA?.next || [];

  $("#gameDate").textContent = DATA?.gameDate || "";

  $("#results").innerHTML = results.length
    ? results.slice(0,7).map(matchHtml).join("")
    : `<div style="padding:20px;color:#aaa">No hay resultados disponibles.</div>`;

  $("#next").innerHTML = next.length
    ? next.slice(0,4).map(matchHtml).join("")
    : `<div style="padding:20px;color:#aaa">No hay próximos partidos disponibles.</div>`;
}

function render(){
  renderTable();
  renderSide();

  const d = DATA?.meta?.updatedAt;
  $("#updated").textContent = d
    ? "DATOS " + new Date(d).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})
    : "SIN DATOS";
}

async function load(){
  try{
    const r = await fetch("/api/primera-c?_="+Date.now(),{cache:"no-store"});
    const json = await r.json();
    if(!r.ok) throw new Error(json.error || "API error");
    DATA = json;
    render();
  }catch(e){
    console.error(e);
    $("#updated").textContent = "ERROR DE DATOS";
  }
}

function next(){
  page = (page + 1) % Math.max(1, DATA?.tables?.length || 1);
  renderTable();
}

function prev(){
  const n = Math.max(1, DATA?.tables?.length || 1);
  page = (page - 1 + n) % n;
  renderTable();
}

document.addEventListener("keydown",e=>{
  if(e.key==="ArrowRight" || e.key==="PageDown") next();
  if(e.key==="ArrowLeft" || e.key==="PageUp") prev();
  if(e.key.toLowerCase()==="r") load();
});

load();
setInterval(load,30000);
timer = setInterval(next,ROTATE_MS);
