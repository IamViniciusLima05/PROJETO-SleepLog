/* SleepLog — registra horários de dormir/acordar, média semanal e gráfico por qualidade */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const banco = {
  ler(k, padrao) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? padrao; } catch { return padrao; } },
  salvar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } }
};

const QUAL = [['😫', 'Péssimo'], ['😕', 'Ruim'], ['😐', 'Ok'], ['🙂', 'Bom'], ['😴', 'Ótimo']];
const TAGS = ['☕ Café à noite', '📱 Celular na cama', '🏃 Exercício', '🍷 Álcool', '😰 Estresse', '🌡️ Calor', '🔊 Barulho', '👶 Acordei de madrugada'];
const iso = (d) => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const minutos = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
// duração cruzando a meia-noite (ex.: 23:30 → 07:00 = 7h30)
const duracao = (deitou, acordou) => ((minutos(acordou) - minutos(deitou) + 1440) % 1440) || 1440;
const fmtDur = (m) => `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, '0')}`;

let noites = banco.ler('sl_noites', null);
if (!noites) {
  // duas semanas de exemplo
  noites = {};
  const ex = [['23:40', '07:05', 4], ['00:30', '06:50', 2], ['23:15', '07:00', 4], ['01:10', '07:10', 1], ['23:00', '06:55', 5], ['00:45', '09:30', 4], ['23:50', '08:40', 5], ['23:30', '07:00', 4], ['00:10', '06:45', 3], ['23:20', '07:05', 4], ['01:30', '07:00', 2], ['23:05', '06:50', 5], ['00:20', '09:00', 4]];
  ex.forEach(([d, a, q], i) => { const dt = new Date(); dt.setDate(dt.getDate() - (ex.length - i)); noites[iso(dt)] = { deitou: d, acordou: a, qual: q, tags: q <= 2 ? [TAGS[1], TAGS[4]] : q === 5 ? [TAGS[2]] : [], nota: '' }; });
}
let meta = banco.ler('sl_meta', 8);
const salvar = () => { banco.salvar('sl_noites', noites); banco.salvar('sl_meta', meta); };
function segunda(d) { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
let inicio = segunda(new Date());
const diasSemana = () => Array.from({ length: 7 }, (_, i) => { const d = new Date(inicio); d.setDate(d.getDate() + i); return d; });

/* ---------- Formulário ---------- */
let qual = 4, tagsSel = new Set();
$('#f-qual').innerHTML = QUAL.map(([e, n], i) => `<button type="button" role="radio" data-q="${i + 1}" style="--c:var(--q${i + 1})" aria-label="${n}">${e}<small>${n}</small></button>`).join('');
$('#f-tags').innerHTML = TAGS.map((t) => `<button type="button" data-tag="${t}" aria-pressed="false">${t}</button>`).join('');
function marcarForm() {
  $$('[data-q]').forEach((b) => b.setAttribute('aria-checked', +b.dataset.q === qual));
  $$('[data-tag]').forEach((b) => b.setAttribute('aria-pressed', tagsSel.has(b.dataset.tag)));
  const d = $('#f-deitou').value, a = $('#f-acordou').value;
  $('#previa').textContent = d && a ? `💤 ${fmtDur(duracao(d, a))} de sono${duracao(d, a) < meta * 60 ? ` · ${fmtDur(meta * 60 - duracao(d, a))} abaixo da meta` : ' · meta atingida ✨'}` : '';
}
function preencher(data) {
  const n = noites[data];
  $('#f-data').value = data;
  $('#f-deitou').value = n?.deitou ?? '23:00'; $('#f-acordou').value = n?.acordou ?? '07:00';
  qual = n?.qual ?? 4; tagsSel = new Set(n?.tags ?? []); $('#f-nota').value = n?.nota ?? '';
  marcarForm();
}
$('#f-qual').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) { qual = +b.dataset.q; marcarForm(); } });
$('#f-tags').addEventListener('click', (e) => { const b = e.target.closest('[data-tag]'); if (!b) return; tagsSel.has(b.dataset.tag) ? tagsSel.delete(b.dataset.tag) : tagsSel.add(b.dataset.tag); marcarForm(); });
['f-deitou', 'f-acordou'].forEach((id) => $('#' + id).addEventListener('input', marcarForm));
$('#f-data').addEventListener('change', (e) => preencher(e.target.value));
$('#form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = $('#f-data').value;
  if (data > iso(new Date())) { toast('Essa noite ainda não aconteceu 😉'); return; }
  const existia = !!noites[data];
  noites[data] = { deitou: $('#f-deitou').value, acordou: $('#f-acordou').value, qual, tags: [...tagsSel], nota: $('#f-nota').value.trim() };
  salvar(); inicio = segunda(new Date(data + 'T12:00')); desenhar();
  toast(existia ? 'Noite atualizada' : `Noite salva: ${fmtDur(duracao(noites[data].deitou, noites[data].acordou))} 🌙`);
});

/* ---------- Painel ---------- */
// média de horários que cruzam a meia-noite: conta a partir das 18h
function mediaHorario(lista) {
  if (!lista.length) return '—';
  const m = lista.map((h) => (minutos(h) + 1440 - 18 * 60) % 1440).reduce((s, x) => s + x, 0) / lista.length;
  const r = Math.round(m + 18 * 60) % 1440;
  return `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`;
}
function desenhar() {
  const dias = diasSemana(), hoje = iso(new Date());
  const fim = dias[6];
  $('#sem-label').textContent = `${dias[0].getDate()}/${dias[0].getMonth() + 1} – ${fim.getDate()}/${fim.getMonth() + 1}`;
  $('#prox').disabled = iso(dias[6]) >= hoje;
  const doSem = dias.map((d) => ({ d, k: iso(d), n: noites[iso(d)] })).map((x) => ({ ...x, min: x.n ? duracao(x.n.deitou, x.n.acordou) : 0 }));
  const com = doSem.filter((x) => x.n);
  const media = com.length ? com.reduce((s, x) => s + x.min, 0) / com.length : 0;
  const divida = com.reduce((s, x) => s + Math.max(0, meta * 60 - x.min), 0);
  const qualMed = com.length ? com.reduce((s, x) => s + x.n.qual, 0) / com.length : 0;
  // semana anterior para comparar
  const ant = Array.from({ length: 7 }, (_, i) => { const d = new Date(inicio); d.setDate(d.getDate() - 7 + i); return noites[iso(d)]; }).filter(Boolean);
  const mediaAnt = ant.length ? ant.reduce((s, n) => s + duracao(n.deitou, n.acordou), 0) / ant.length : 0;
  const dif = media && mediaAnt ? media - mediaAnt : 0;
  $('#meta-txt').textContent = `${String(meta).replace('.', ',')}h`;
  $('#numeros').innerHTML = `
    <div class="num ${media >= meta * 60 ? 'bom' : media && media < (meta - 1) * 60 ? 'ruim' : ''}"><small>Média da semana</small><b>${media ? fmtDur(media) : '—'}</b><span>${dif ? `${dif > 0 ? '▲' : '▼'} ${fmtDur(Math.abs(dif))} vs semana anterior` : `${com.length} de 7 noites`}</span></div>
    <div class="num"><small>Hora média de dormir</small><b>${mediaHorario(com.map((x) => x.n.deitou))}</b><span>acordando ${mediaHorario(com.map((x) => x.n.acordou))}</span></div>
    <div class="num ${divida > 180 ? 'ruim' : ''}"><small>Sono a menos que a meta</small><b>${divida ? fmtDur(divida) : '0h'}</b><span>somando a semana</span></div>
    <div class="num"><small>Qualidade média</small><b>${qualMed ? QUAL[Math.round(qualMed) - 1][0] + ' ' + qualMed.toFixed(1).replace('.', ',') : '—'}</b><span>de 5</span></div>`;
  const maxH = 11;
  $('#grafico').innerHTML = `<span class="linha-meta" style="bottom:calc(26px + (100% - 26px) * ${meta / maxH})"></span>` +
    doSem.map((x) => `<div class="col ${x.k === hoje ? 'hoje' : ''}">${x.n ? `<div class="barra" style="height:${(Math.min(x.min / 60, maxH) / maxH) * 100}%;--c:var(--q${x.n.qual})" title="${fmtDur(x.min)} · ${QUAL[x.n.qual - 1][1]}"><b>${fmtDur(x.min)}</b></div>` : '<div class="sem"></div>'}<span class="dia">${x.d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').slice(0, 3)}</span></div>`).join('');
  $('#noites').innerHTML = com.length ? [...com].reverse().map((x) => `<li style="--c:var(--q${x.n.qual})" data-k="${x.k}">
      <span class="d">${x.d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}<small>${x.d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</small></span>
      <span class="h">${x.n.deitou} → ${x.n.acordou} · ${QUAL[x.n.qual - 1][0]} ${QUAL[x.n.qual - 1][1]}${x.n.tags.length ? `<br><em>${x.n.tags.map(escapar).join(' · ')}</em>` : ''}${x.n.nota ? `<br><em>“${escapar(x.n.nota)}”</em>` : ''}</span>
      <span class="dur">${fmtDur(x.min)}</span><button data-tirar aria-label="Apagar noite">✕</button></li>`).join('') : '<li class="vazio">Nenhuma noite registrada nesta semana.</li>';
}
$('#noites').addEventListener('click', (e) => {
  const li = e.target.closest('[data-k]'); if (!li) return;
  if (e.target.closest('[data-tirar]')) {
    const b = e.target.closest('[data-tirar]');
    if (b.textContent !== '?') { b.textContent = '?'; b.title = 'Clique de novo para apagar'; return; }
    delete noites[li.dataset.k]; salvar(); desenhar(); return;
  }
  preencher(li.dataset.k); $('#f-deitou').focus();
});
$('#ant').addEventListener('click', () => { inicio.setDate(inicio.getDate() - 7); desenhar(); });
$('#prox').addEventListener('click', () => { inicio.setDate(inicio.getDate() + 7); desenhar(); });
$('#meta').addEventListener('change', (e) => { meta = +e.target.value; salvar(); desenhar(); marcarForm(); });

let tt;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 2200); }

$('#meta').value = String(meta);
$('#f-data').max = iso(new Date());
// sugere registrar a noite passada
const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
preencher(iso(ontem));
salvar();
desenhar();
