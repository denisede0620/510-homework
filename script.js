const API_URL='https://script.google.com/macros/s/AKfycbyR8U4jLoTcCaiHJPI96SYqSFuB-fDRNp_EY0MhEiAAxHcyn6l65kaBEuD1JvAZQJmj/exec';

const el=id=>document.getElementById(id);
const homework=el('homework'),startBtn=el('startBtn'),stopBtn=el('stopBtn');
let scanner=null,isScanning=false,lastCode='',lastScanAt=0;

document.addEventListener('DOMContentLoaded',async()=>{
  homework.addEventListener('change',()=>{startBtn.disabled=!homework.value;refreshStats();});
  startBtn.addEventListener('click',startScanner);
  stopBtn.addEventListener('click',stopScanner);
  el('refreshBtn').addEventListener('click',refreshStats);
  await loadInitial();
});

function jsonp(params){
  return new Promise((resolve,reject)=>{
    const callback='cb_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const script=document.createElement('script');
    const timer=setTimeout(()=>cleanup(new Error('連線逾時，請稍後再試。')),15000);
    function cleanup(error){
      clearTimeout(timer); delete window[callback]; script.remove();
      error?reject(error):null;
    }
    window[callback]=data=>{clearTimeout(timer);delete window[callback];script.remove();resolve(data);};
    script.onerror=()=>cleanup(new Error('無法連接 Google 試算表。'));
    const query=new URLSearchParams({...params,callback});
    script.src=API_URL+'?'+query.toString();
    document.body.appendChild(script);
  });
}

async function loadInitial(){
  try{
    const data=await jsonp({action:'initial'});
    homework.innerHTML='<option value="">請選擇作業</option>';
    (data.homeworkTypes||[]).forEach(item=>{
      const option=document.createElement('option');
      option.value=item;option.textContent=item;homework.appendChild(option);
    });
    show('請選擇作業後開始掃描。','info');
  }catch(error){show(error.message,'error');}
}

async function startScanner(){
  if(!homework.value)return show('請先選擇作業。','error');
  if(typeof Html5Qrcode==='undefined')return show('掃描元件載入失敗，請重新整理。','error');
  try{
    scanner=new Html5Qrcode('reader');
    el('reader').hidden=false;startBtn.hidden=true;stopBtn.hidden=false;
    await scanner.start(
      {facingMode:'environment'},
      {fps:10,qrbox:{width:240,height:240},aspectRatio:1},
      onScanSuccess,
      ()=>{}
    );
    isScanning=true;show('相機已開啟，請對準學生 QR Code。','info');
  }catch(error){
    el('reader').hidden=true;startBtn.hidden=false;stopBtn.hidden=true;
    show('無法開啟相機，請確認相機權限後再試。','error');
  }
}

async function stopScanner(){
  if(scanner&&isScanning){try{await scanner.stop();}catch(e){}}
  isScanning=false;scanner=null;el('reader').hidden=true;startBtn.hidden=false;stopBtn.hidden=true;
}

async function onScanSuccess(code){
  const now=Date.now();
  if(code===lastCode&&now-lastScanAt<2500)return;
  lastCode=code;lastScanAt=now;
  try{
    const result=await jsonp({action:'submit',studentCode:String(code).trim(),homework:homework.value});
    if(result.ok){
      show('✅ '+result.message,'success');beep(880);navigator.vibrate?.(120);
    }else if(result.type==='duplicate'){
      show('⚠️ '+result.message,'warning');beep(520);
    }else{
      show('❌ '+(result.message||'登記失敗'),'error');beep(260);
    }
    await refreshStats();
  }catch(error){show(error.message,'error');}
}

async function refreshStats(){
  if(!homework.value){renderStats({});return;}
  try{
    const data=await jsonp({action:'statistics',homework:homework.value});
    renderStats(data);
  }catch(error){show(error.message,'error');}
}

function renderStats(data){
  el('total').textContent=data.totalStudents||0;
  el('submitted').textContent=data.submittedCount||0;
  el('missing').textContent=data.missingCount||0;
  el('rate').textContent=(data.completionRate||0)+'%';
  renderList('submittedList',data.submittedStudents||[],'目前還沒有人繳交');
  renderList('missingList',data.missingStudents||[],'全班都已繳交');
  const done=new Set((data.submittedStudents||[]).map(s=>String(s.studentCode)));
  const all=[...(data.submittedStudents||[]),...(data.missingStudents||[])].sort((a,b)=>Number(a.seat)-Number(b.seat));
  const wall=el('seatWall');wall.innerHTML='';
  if(!all.length){wall.innerHTML='<p class="empty">沒有學生資料</p>';return;}
  all.forEach(s=>{
    const d=document.createElement('div');
    d.className='seat '+(done.has(String(s.studentCode))?'done':'wait');
    d.textContent=String(s.seat).padStart(2,'0');d.title=s.name;wall.appendChild(d);
  });
}

function renderList(id,students,emptyText){
  const box=el(id);box.innerHTML='';
  if(!students.length){box.innerHTML='<p class="empty">'+emptyText+'</p>';return;}
  students.forEach(s=>{
    const row=document.createElement('div');row.className='student';
    row.innerHTML='<span class="badge">'+escapeHtml(s.seat)+'</span><span class="name">'+escapeHtml(s.name)+'</span>';
    box.appendChild(row);
  });
}

function show(text,type){const m=el('message');m.textContent=text;m.className='message '+type;}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function beep(freq){
  try{const ctx=new (window.AudioContext||window.webkitAudioContext)();const o=ctx.createOscillator(),g=ctx.createGain();
  o.frequency.value=freq;g.gain.value=.05;o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.12);}catch(e){}
}
