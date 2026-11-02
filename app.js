'use strict';
const $ = id => document.getElementById(id);
const labels = ['Done','Pending','Issue','Unmarked','N/A','Other'];
const colors = ['#53ad91','#dfae51','#ce727e','#aba7bb','#819fc3','#ac8cc4'];
let entries=[], notes=[], dates=[], owners=[], memberIds=new Map(), busy=false;
const clean = value => String(value ?? '').trim();
const esc = value => clean(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Date().toLocaleDateString('sv-SE');
function dateKey(value){
  if(typeof value==='number' && value>20000 && value<100000) return new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10);
  const s=clean(value);
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0') : '';
}
function bucket(value){
  const s=clean(value).toLowerCase();
  if(!s) return 'Unmarked';
  if(['done','✓','✔','✅','completed','true'].includes(s)) return 'Done';
  if(s==='n/a'||s==='na') return 'N/A';
  if(/^pending\b/.test(s)) return 'Pending';
  if(/^issue\b/.test(s)) return 'Issue';
  return 'Other';
}
function parse(tabs){
  const data=[], extra=[], days=new Set(), names=[], ids=new Map();
  for(const {gid,name,rows} of tabs){
    const h=rows[0]||[];
    if(!/location/i.test(h[1]) || !/checklist activity/i.test(h[4])) continue;
    const cols=h.map(dateKey).map((d,i)=>[d,i]).filter(([d,i])=>d && i>=5);
    if(!cols.length) continue;
    names.push(name);
    ids.set(name, String(gid ?? name));
    for(const [date,i] of cols){
      days.add(date);
      for(const r of rows.slice(1)){
        const value=clean(r[i]);
        if(clean(r[4])) data.push({name,date,fields:r.slice(0,5),value,status:bucket(value)});
        else if(value) extra.push({name,date,value});
      }
    }
  }
  entries=data;notes=extra;dates=[...days].sort();owners=names;memberIds=ids;
}
function options(id,values,first,preferred){
  const el=$(id);
  el.replaceChildren(...(first ? [new Option(first,'')] : []),...values.map(v=>new Option(v,v)));
  if([...el.options].some(o=>o.value===preferred)) el.value=preferred;
}
function load(tabs){
  const prev=$('day').value, owner=$('person').value;
  const selectedId=memberIds.get(owner);
  parse(tabs);
  options('day',dates,null,dates.includes(prev)?prev:dates.filter(d=>d<=today()).at(-1)||dates[0]);
  // Google worksheet IDs survive renames; deleted selections return to All members.
  const currentOwner=owners.find(name=>memberIds.get(name)===selectedId);
  options('person',owners,'All members',currentOwner || '');
  render();
}
function progress(rows){
  const done=rows.filter(r=>r.status==='Done').length, total=rows.filter(r=>r.status!=='N/A').length;
  return {done,total,pct:total?Math.round(100*done/total):null};
}
const percent=p=>p===null?'—':p+'%';
function render(){
  const day=$('day').value, name=$('person').value;
  const pool=entries.filter(r=>!name||r.name===name), selected=pool.filter(r=>r.date===day), p=progress(selected);
  $('rate').textContent=percent(p.pct);$('fill').style.width=(p.pct||0)+'%';
  $('caption').textContent=p.done+' of '+p.total+' applicable activities complete · N/A excluded';
  $('metrics').innerHTML=labels.map((s,i)=>'<div class="metric" style="--accent:'+colors[i]+'"><span>'+s+'</span><b>'+selected.filter(r=>r.status===s).length+'</b></div>').join('');
  const end=dates.indexOf(day)+1;
  $('trend').innerHTML=dates.slice(Math.max(0,end-7),end).map(d=>{
    const v=progress(pool.filter(r=>r.date===d)).pct;
    return '<button class="bar" data-day="'+d+'" aria-pressed="'+(d===day)+'">'+percent(v)+'<i style="height:'+Math.max(2,v||0)+'px"></i>'+d.slice(8)+'/'+d.slice(5,7)+'</button>';
  }).join('');
  $('team').innerHTML=(name?[name]:owners).map(n=>{
    const x=progress(selected.filter(r=>r.name===n));
    return '<div class="member"><b>'+esc(n)+'</b><div class="track"><i style="width:'+(x.pct||0)+'%"></i></div><em>'+x.done+' / '+x.total+'</em></div>';
  }).join('');
  const ns=notes.filter(r=>r.date===day&&(!name||r.name===name));
  $('notes').innerHTML=ns.map(r=>'<p class="note"><b>'+esc(r.name)+'</b><br>'+esc(r.value)+'</p>').join('')||'<p>No additional notes for this selection.</p>';
  const q=$('query').value.trim().toLowerCase(), filter=$('status').value;
  const visible=selected.filter(r=>(!filter||r.status===filter)&&[r.name,...r.fields,r.value].join(' ').toLowerCase().includes(q));
  $('body').innerHTML=visible.map(r=>'<tr>'+[r.name+' · '+r.fields[0],...r.fields.slice(1),r.value||'Unmarked'].map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')||'<tr><td colspan="6">No matching activities.</td></tr>';
}
options('status',labels,'All statuses','');
['day','person','status','query'].forEach(id=>$(id).addEventListener('input',render));
$('trend').onclick=e=>{const b=e.target.closest('[data-day]');if(b){$('day').value=b.dataset.day;render();}};
// CSV preserves quoted notes, embedded newlines and empty checklist cells.
function csvRows(text){
  const rows=[];
  let row=[], field='', quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted && text[i+1]==='"'){field+='"';i++;}
      else quoted=!quoted;
    }else if(!quoted && c===','){row.push(field);field='';}
    else if(!quoted && (c==='\n'||c==='\r')){
      if(c==='\r' && text[i+1]==='\n')i++;
      row.push(field);rows.push(row);row=[];field='';
    }else field+=c;
  }
  if(row.length||field)rows.push([...row,field]);
  return rows;
}
// Google’s HTML viewer lists worksheet IDs and titles, including renamed tabs.
async function discoverTabs(){
  const url=new URL('https://docs.google.com/spreadsheets/d/'+CONFIG.sheetId+'/htmlview');
  url.searchParams.set('_ts',Date.now());
  const response=await fetch(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error('Sheet list unavailable');
  const doc=new DOMParser().parseFromString(await response.text(),'text/html');
  const tabs=new Map();
  for(const item of doc.querySelectorAll('[id^="sheet-button-"]')){
    const gid=item.id.slice('sheet-button-'.length);
    const name=(item.querySelector('a')||item).textContent.trim();
    if(/^\d+$/.test(gid)&&name)tabs.set(gid,{gid,name});
  }
  if(!tabs.size)throw Error('Sheet list unavailable');
  return [...tabs.values()];
}
async function readTab({gid,name}){
  const url=new URL('https://docs.google.com/spreadsheets/d/'+CONFIG.sheetId+'/gviz/tq');
  url.search=new URLSearchParams({gid,headers:'1',tqx:'out:csv',_ts:String(Date.now())});
  const response=await fetch(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error('Sheet unavailable');
  const rows=csvRows(await response.text());
  if(response.headers.get('content-type')?.includes('text/html'))throw Error('Public access unavailable');
  return {gid,name,rows};
}
let lastLive='';
async function refresh(){
  if(busy)return;
  busy=true;
  const button=$('sync');
  button.disabled=true;
  button.textContent='Refreshing…';
  const visibleFeedback=new Promise(resolve=>setTimeout(resolve,700));
  try{
    const tabs=await discoverTabs();
    const results=await Promise.allSettled(tabs.map(readTab));
    if(results.some(r=>r.status==='rejected'))throw Error('Live sheet unavailable');
    load(results.map(r=>r.value));
    lastLive=new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true});
    const badge=document.createElement('span');
    badge.className='updated-badge';
    badge.textContent='Updated '+lastLive;
    $('message').replaceChildren('Live Google Sheet · ',badge,' · '+owners.length+' employees · Checks every '+CONFIG.refreshSeconds+' seconds');
  }catch{
    $('message').textContent=(lastLive?'Showing last live update at '+lastLive:'Showing the supplied Excel snapshot')+' · Live refresh unavailable. Could not read the current workbook. Check public viewer access or retry.';
  }finally{
    await visibleFeedback;
    button.textContent='Refresh now';
    button.disabled=false;
    busy=false;
  }
}
load(window.WORKBOOK);
$('message').textContent='Showing workbook snapshot · Checking live sheet…';
$('sync').onclick=refresh;
refresh();
setInterval(()=>{if(!document.hidden)refresh();},CONFIG.refreshSeconds*1000);
