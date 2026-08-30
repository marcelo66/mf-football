let DATA = null;
let page = 0;
let timer = null;

const params = new URLSearchParams(location.search);
const path = location.pathname
  .replace(/\/index\.html$/i, "")
  .replace(/\/+$/, "") || "/";

const mode =
  path.endsWith("/zona-a") ? "zona-a" :
  path.endsWith("/zona-b") ? "zona-b" :
  path.endsWith("/resultados") ? "resultados" :
  path.endsWith("/proximos") ? "proximos" :
  "auto";

const rotateMs = Number(params.get("rotate") || 8000);
const bg = params.get("bg");
const video = params.get("video");
const transparent = params.get("transparent") === "1";

const $ = s => document.querySelector(s);

function esc(v){
  return String(v ?? "").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function cleanName(v){
  return String(v || "").trim();
}

function teamLogo(id){
  if(!id) return "";
  return `<img class="logo" src="https://api.promiedos.com.ar/images/team/${encodeURIComponent(id)}/1"
    onerror="this.style.display='none'">`;
}

function firstValue(row, keys, fallback=""){
  for(const key of keys){
    if(row?.values?.[key] !== undefined && row.values[key] !== null)
      return row.values[key];
  }
  return fallback;
}

function normalizeColumns(table){
  const cols = table.columns || [];
  const map = {};
  cols.forEach((c,i)=>map[String(c).toLowerCase()] = i);
  return map;
}

function valueByColumn(row, table, names, fallback=""){
  const wanted = names.map(x=>x.toLowerCase());
  const idx = normalizeColumns(table);
  for(const n of wanted){
    if(idx[n] !== undefined){
      const key = table.columns[idx[n]];
      if(row.values?.[key] !== undefined) return row.values[key];
    }
  }
  return firstValue(row,names,fallback);
}

function formHtml(row){
  const raw = row?.values?.trend;
  if(!Array.isArray(raw)) return "";
  const letters = raw.slice(-5).map(v => {
    const n = Number(v);
    if(n === 2) return ["G","g"];
    if(n === 1) return ["E","e"];
    if(n === 0) return ["P","p"];
    return ["","n"];
  });
  return `<span class="form">${letters.map(([l,c]) =>
    `<span class="form-dot ${c}">${l || "•"}</span>`).join("")}</span>`;
}

function tableHtml(table){
  const rows = table?.rows || [];
  let html = `<table><thead><tr>
    <th>#</th><th>Equipo</th><th>PTS</th><th>J</th>
    <th>GOL</th><th>+/-</th><th>G</th><th>E</th><th>P</th><th>ÚLTIMAS</th>
  </tr></thead><tbody>`;

  for(const r of rows){
    const pts = valueByColumn(r,table,["PTS","Points"],"");
    const pj = valueByColumn(r,table,["J","PJ","GamePlayed"],"");
    const gol = valueByColumn(r,table,["Gol","Goals"],"");
    const dif = valueByColumn(r,table,["+/-","Ratio","Difference"],"");
    const g = valueByColumn(r,table,["G","GamesWon"],"");
    const e = valueByColumn(r,table,["E","GamesEven"],"");
    const p = valueByColumn(r,table,["P","GamesLost"],"");
    const diffClass = Number(dif) > 0 ? "posdiff" : Number(dif) < 0 ? "negdiff" : "";

    html += `<tr>
      <td class="pos">${esc(r.pos)}</td>
      <td class="team"><div class="team-wrap">${teamLogo(r.teamId)}<span>${esc(r.team)}</span></div></td>
      <td class="pts">${esc(pts)}</td>
      <td>${esc(pj)}</td>
      <td>${esc(gol)}</td>
      <td class="diff ${diffClass}">${esc(dif)}</td>
      <td>${esc(g)}</td>
      <td>${esc(e)}</td>
      <td>${esc(p)}</td>
      <td>${formHtml(r)}</td>
    </tr>`;
  }
  html += "</tbody></table>";
  return html;
}

function getTables(){
  return DATA?.tables || [];
}

function tableForMode(){
  const tables = getTables();
  if(!tables.length) return null;

  if(mode === "zona-a"){
    return tables.find(t => /zona\s*a/i.test(t.name)) || tables[0];
  }
  if(mode === "zona-b"){
    return tables.find(t => /zona\s*b/i.test(t.name)) || tables[1] || tables[0];
  }

  const autoTables = tables;
  return autoTables[page % autoTables.length];
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
    : `<div class="empty">No hay resultados disponibles.</div>`;

  $("#next").innerHTML = next.length
    ? next.slice(0,4).map(matchHtml).join("")
    : `<div class="empty">No hay próximos partidos disponibles.</div>`;
}

function render(){
  const tables = getTables();
  const t = tableForMode();

  if(mode === "resultados" || mode === "proximos"){
    $("#sectionLabel").textContent = mode === "resultados" ? "RESULTADOS" : "FIXTURE";
    $("#tableName").textContent = mode === "resultados" ? "ÚLTIMOS RESULTADOS" : "PRÓXIMOS PARTIDOS";
    $("#counter").textContent = "";
    $("#table").innerHTML = mode === "resultados"
      ? (DATA.results?.length ? `<div>${DATA.results.map(matchHtml).join("")}</div>` : `<div class="empty">Sin resultados.</div>`)
      : (DATA.next?.length ? `<div>${DATA.next.map(matchHtml).join("")}</div>` : `<div class="empty">Sin próximos partidos.</div>`);
  }else{
    $("#sectionLabel").textContent = "TABLA DE POSICIONES";
    $("#tableName").textContent = t?.name || "Sin datos";
    $("#counter").textContent = tables.length ? `${(page % tables.length)+1} / ${tables.length}` : "";
    $("#table").innerHTML = t ? tableHtml(t) : `<div class="empty">No se recibieron tablas.</div>`;
  }

  renderSide();

  const d = DATA?.meta?.updatedAt;
  $("#updated").textContent = d
    ? "DATOS " + new Date(d).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})
    : "SIN DATOS";
  $("#statusDot").parentElement.classList.toggle("error",!DATA?.meta?.ok);
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
    $("#statusDot").parentElement.classList.add("error");
  }
}

function next(){
  if(mode === "zona-a" || mode === "zona-b" || mode === "resultados" || mode === "proximos") return;
  page = (page + 1) % Math.max(1,getTables().length);
  render();
}
function prev(){
  if(mode !== "auto") return;
  const n = Math.max(1,getTables().length);
  page = (page - 1 + n) % n;
  render();
}

function setupBackground(){
  if(transparent){
    document.body.classList.add("transparent");
  }
  if(bg){
    $("#backgroundImage").style.backgroundImage = `url("${bg}")`;
  }
  if(video){
    const v = $("#backgroundVideo");
    v.src = video;
    v.style.display = "block";
    $("#backgroundImage").style.display = "none";
  }
}

document.addEventListener("keydown",e=>{
  if(e.key==="ArrowRight" || e.key==="PageDown") next();
  if(e.key==="ArrowLeft" || e.key==="PageUp") prev();
  if(e.key.toLowerCase()==="r") load();
});

setupBackground();
load();
setInterval(load,30000);
if(mode === "auto"){
  timer = setInterval(next,rotateMs);
}

