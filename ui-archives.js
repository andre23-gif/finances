// ui-archives.js
import { getAll, STORES } from './db.js';
const { STOREBtn.textContent='Exporter JSON';const { STORE_MOVEMENTS } = STORES;

  head.appendChild(select);
  head.appendChild(exportBtn);

  const list = document.createElement('div');
  list.style.display='grid';
  list.style.gap='0.5rem';

  container.appendChild(head);
  container.appendChild(list);

  function render(){
    list.innerHTML='';
    const fm = select.value;
    const data = (fm==='all') ? all : all.filter(m=>m.financialMonth===fm);
    if(!data.length){
      list.innerHTML = `<div class="muted">Aucune donnée.</div>`;
      return;
    }
    data
      .slice()
      .sort((a,b)=>(a.financialMonth+a.date).localeCompare(b.financialMonth+b.date))
      .forEach(m=>{
        const row=document.createElement('div');
        row.style.padding='0.6rem 0.75rem';
        row.style.border='1px solid #2a2a2a';
        row.style.borderRadius='12px';
        row.style.background='rgba(255,255,255,0.02)';
        row.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:1rem;">
            <div>
              <div style="color:#bdbdbd;font-weight:600;">${m.label || '(sans libellé)'}</div>
              <div style="color:#9e9e9e;font-size:0.85rem;">${m.date} • ${m.account} • ${m.category || '—'}</div>
            </div>
            <div style="font-weight:700;color:${m.amount<0?'#b23b3b':'#3a8f3a'};">${eur(m.amount)}</div>
          </div>
        `;
        list.appendChild(row);
      });
  }

  exportBtn.addEventListener('click', ()=>{
    const fm = select.value;
    const data = (fm==='all') ? all : all.filter(m=>m.financialMonth===fm);
    const name = fm==='all' ? 'archives-completes.json' : `archives-${fm}.json`;
    downloadJSON(name, data);
  });

  select.addEventListener('change', render);
  render();
}

function eur(v){ return v.toLocaleString('fr-FR',{style:'currency',currency:'EUR'}); }

function downloadJSON(filename, data){
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

export async function initArchivesUI(){
  const page = document.querySelector('.page[data-page="archives"]');
  if(!page) return;
  const container = page.querySelector('[data-archives]');
  if(!container) return;

  const all = (await getAll(STORE_MOVEMENTS))
    .filter(m => m.status === 'SAISIE_MANUELLE' || m.status === 'APPLIQUEE');

  const months = Array.from(new Set(all.map(m=>m.financialMonth).filter(Boolean))).sort();

  container.innerHTML = '';

  const head = document.createElement('div');
  head.style.display='flex';
  head.style.gap='0.6rem';
  head.style.marginBottom='0.75rem';
  head.style.flexWrap='wrap';

  const select = document.createElement('select');
  select.style.flex='1';
  select.style.minWidth='200px';
  select.style.background='#111';
  select.style.border='1px solid #2a2a2a';
  select.style.color='#e0e0e0';
  select.style.borderRadius='10px';
  select.style.padding='0.6rem';

  const optAll = document.createElement('option');
  optAll.value='all'; optAll.textContent='Tous les mois';
  select.appendChild(optAll);

  months.forEach(m=>{
    const o=document.createElement('option');
    o.value=m; o.textContent=m;
    select.appendChild(o);
  });

  const exportBtn = document.createElement('button');
  exportBtn.className='btn-primary';
  exportBtn.type='button';
