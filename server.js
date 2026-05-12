const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({limit:'10mb'}));

// ── Telegram ────────────────────────────────────────────────────────────────
const TG_TOKEN = process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT  = process.env.TELEGRAM_CHAT_ID;

function sendTelegram(msg){
  if(!TG_TOKEN||!TG_CHAT)return;
  const body=JSON.stringify({chat_id:TG_CHAT,text:msg,parse_mode:'HTML'});
  const req=https.request({
    hostname:'api.telegram.org',
    path:`/bot${TG_TOKEN}/sendMessage`,
    method:'POST',
    headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}
  });
  req.on('error',e=>console.error('TG:',e.message));
  req.write(body);req.end();
}

// ── Data store (JSON file) ───────────────────────────────────────────────────
const DATA_FILE = process.env.DATA_PATH || path.join('/app/data', 'data.json');

function loadData(){
  try{ return JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); }
  catch(e){ return {users:{}}; }
}

function saveData(data){
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── Auth endpoints ───────────────────────────────────────────────────────────

// Kayıt / İlk giriş
app.post('/auth/register', (req, res) => {
  const {name, pin, visits} = req.body||{};
  if(!name||!pin) return res.json({ok:false, error:'Eksik bilgi'});
  if(!/^\d{4}$/.test(pin)) return res.json({ok:false, error:'PIN 4 haneli olmalı'});

  const data = loadData();
  const key = name.trim().toLowerCase().replace(/\s+/g,'_');

  if(data.users[key]){
    return res.json({ok:false, error:'Bu isim zaten kayıtlı. Giriş yapın.'});
  }

  data.users[key] = {
    name: name.trim(),
    pin,
    visits: visits||[],
    createdAt: new Date().toISOString()
  };
  saveData(data);

  const now = new Date().toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'});
  sendTelegram(`👤 <b>Yeni Kullanıcı</b>\n\nİsim: <b>${name}</b>\nZaman: ${now}`);

  res.json({ok:true, name:name.trim(), visits:data.users[key].visits});
});

// Giriş
app.post('/auth/login', (req, res) => {
  const {name, pin} = req.body||{};
  if(!name||!pin) return res.json({ok:false, error:'Eksik bilgi'});

  const data = loadData();
  const key = name.trim().toLowerCase().replace(/\s+/g,'_');
  const user = data.users[key];

  if(!user) return res.json({ok:false, error:'Kullanıcı bulunamadı. Kayıt olun.'});
  if(user.pin !== pin) return res.json({ok:false, error:'PIN hatalı.'});

  const now = new Date().toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'});
  sendTelegram(`🔑 <b>Giriş</b>\n\nİsim: <b>${name}</b>\nZaman: ${now}`);

  res.json({ok:true, name:user.name, visits:user.visits||[]});
});

// Ziyaret kaydet
app.post('/visits/save', (req, res) => {
  const {name, pin, visit} = req.body||{};
  if(!name||!pin||!visit) return res.json({ok:false, error:'Eksik bilgi'});

  const data = loadData();
  const key = name.trim().toLowerCase().replace(/\s+/g,'_');
  const user = data.users[key];

  if(!user||user.pin!==pin) return res.json({ok:false, error:'Yetkisiz'});

  if(!user.visits) user.visits=[];
  user.visits.unshift(visit);
  if(user.visits.length>50) user.visits.splice(50);
  saveData(data);

  const now = new Date().toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'});
  sendTelegram(`💾 <b>Ziyaret Kaydedildi</b>\n\nKullanıcı: <b>${user.name}</b>\nMağaza: ${visit.store||'-'}\nReyon: ${visit.reyon||'-'}\nZaman: ${now}`);

  res.json({ok:true, visits:user.visits});
});

// Ziyaret sil
app.post('/visits/delete', (req, res) => {
  const {name, pin, visitId} = req.body||{};
  if(!name||!pin||!visitId) return res.json({ok:false});

  const data = loadData();
  const key = name.trim().toLowerCase().replace(/\s+/g,'_');
  const user = data.users[key];
  if(!user||user.pin!==pin) return res.json({ok:false, error:'Yetkisiz'});

  user.visits=(user.visits||[]).filter(v=>v.id!==visitId);
  saveData(data);
  res.json({ok:true, visits:user.visits});
});

// Mail bildirimi
app.post('/notify-user', (req, res) => {
  const {name, action, store, reyon, week} = req.body||{};
  if(!name) return res.json({ok:false});
  const now = new Date().toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'});
  if(action==='mail'){
    sendTelegram(`📧 <b>Mail Gönderildi</b>\n\nKullanıcı: <b>${name}</b>\nMağaza: ${store||'-'}\nReyon: ${reyon||'-'}\nHafta: ${week||'-'}\nZaman: ${now}`);
  }
  res.json({ok:true});
});



// ── AI Analiz endpoint ──────────────────────────────────────────────────────
app.post('/ai/analyze', async (req, res) => {
  const {mag, feedbacks, kwResults} = req.body||{};
  if(!mag||!feedbacks) return res.json({ok:false, error:'Eksik bilgi'});

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if(!ANTHROPIC_KEY) return res.json({ok:false, error:'API key yok'});

  // MAG veri yapısı
  const erkekMAG = {
    "BUC":{bg:["CHINO DUVARI","DIŞ GİYİM","DOKUMA ÜST","ÖRME","ÖRME BASIC","TRİKO"],kl:{"CHINO DUVARI":["BASİC DOKUMA CHİNO PANTOLON İNCE","BASIC DOKUMA CHINO PANTOLON ORTA","CL BASIC DOKUMA PANTOLON KALIN","CLASSIC DOKUMA ROLLER","CLASSIC DOKUMA ŞORT"],"DIŞ GİYİM":["İNCE MONT","İNCE PUFFER MONT","MONT/KABAN KALIN","PARKA","PU MONT İNCE","PU MONT KALIN","YELEK"],"DOKUMA ÜST":["KEY DOKUMA GOMLEK K.KOL","KEY DOKUMA GOMLEK U.KOL","KEY EKOSELİ DOKUMA GOMLEK K.KOL","KEY EKOSELİ DOKUMA GOMLEK U.KOL"],"ÖRME":["BASIC ORME BİSİKLET YAKA T-SHIRT K.KOL","BASIC ORME POLO YAKA T-SHIRT K.KOL","BASIC ORME V YAKA T-SHIRT K.KOL","KEY BASKILI ORME T-SHIRT K.KOL","KEY ORME T-SHIRT K.KOL"],"ÖRME BASIC":["BASIC KEY BASKILI ORME SWEAT","CL BASIC ORME HIRKA","CL BASIC ORME PANTOLON","CL BASIC ORME ROLLER","CL BASIC ORME SORT / BERMUDA","CL BASIC ORME SWEAT","CL BASIC ORME T-SHIRT U.KOL","ÖRME ATLET"],"TRİKO":["KEY ÇİZGİLİ TRIKO KAZAK","KEY TRIKO HIRKA","KEY TRIKO HIRKA MONT","KEY TRIKO KAZAK","KEY TRIKO YELEK"]}},
    "BUB":{bg:["BLAZER CEKET","DENİM","DIŞ GİYİM","DOKUMA ALT","DOKUMA SET","DOKUMA ÜST","ÖRME","TRİKO"],kl:{"BLAZER CEKET":["BLAZER CEKET"],"DENİM":["KEY DOKUMA JEAN PANTOLON"],"DIŞ GİYİM":["İNCE MONT","MONT/KABAN KALIN","NAYLON PUFFER MONT/KABAN","PARKA","PU MONT İNCE","PU MONT KALIN","YAGMURLUK","YELEK"],"DOKUMA ALT":["KEY DOKUMA PANTOLON ORTA","KEY DOKUMA ŞORT/BERMUDA"],"DOKUMA SET":["BLAZER CEKET SET","DOKUMA SHACKET SET","İNCE MONT SET"],"DOKUMA ÜST":["DOKUMA SHACKET","KEY BASKILI DOKUMA GOMLEK K.KOL","KEY DOKUMA GOMLEK K.KOL","KEY DOKUMA GOMLEK U.KOL"],"ÖRME":["KEY BASKILI ORME T-SHIRT K.KOL","KEY ORME HIRKA","KEY ORME PANTOLON","KEY ORME SORT / BERMUDA","KEY ORME SWEAT","KEY ORME T-SHIRT K.KOL"],"TRİKO":["KEY TRIKO HIRKA","KEY TRIKO KAZAK","KEY TRIKO KAZAK K.KOL","KEY TRIKO SUVETER","KEY TRIKO YELEK"]}},
    "BUL":{bg:["BLAZER CEKET","DIŞ GİYİM","DOKUMA ALT","DOKUMA ÜST","ÖRME","TRİKO"],kl:{"BLAZER CEKET":["BLAZER CEKET"],"DIŞ GİYİM":["İNCE MONT","MONT/KABAN KALIN","NAYLON PUFFER MONT/KABAN","PARKA","PU MONT İNCE","PU MONT KALIN","YAGMURLUK","YELEK"],"DOKUMA ALT":["KEY DOKUMA PANTOLON ORTA","KEY DOKUMA ŞORT/BERMUDA"],"DOKUMA ÜST":["DOKUMA SHACKET","KEY BASKILI DOKUMA GOMLEK K.KOL","KEY DOKUMA GOMLEK K.KOL","KEY DOKUMA GOMLEK U.KOL"],"ÖRME":["KEY BASKILI ORME T-SHIRT K.KOL","KEY ÇİZGİLİ ORME T-SHIRT K.KOL","KEY ÖRME ATLET","KEY ORME HIRKA","KEY ORME PANTOLON","KEY ORME SORT / BERMUDA","KEY ORME SWEAT","KEY ORME T-SHIRT K.KOL"],"TRİKO":["KEY TRIKO HIRKA","KEY TRIKO HIRKA MONT","KEY TRIKO KAZAK","KEY TRIKO KAZAK K.KOL","KEY TRIKO SUVETER"]}},
    "BUXL":{bg:["DENİM","DIŞ GİYİM","DOKUMA ALT","DOKUMA ÜST","ÖRME","TRİKO"],kl:{"DENİM":["KEY DOKUMA JEAN BERMUDA","KEY DOKUMA JEAN GOMLEK K.KOL","KEY DOKUMA JEAN GOMLEK U.KOL","KEY DOKUMA JEAN MONT","KEY DOKUMA JEAN PANTOLON"],"DIŞ GİYİM":["İNCE MONT","İNCE PUFFER MONT","MONT/KABAN KALIN","NAYLON PUFFER MONT/KABAN","PARKA","PU MONT İNCE","PU MONT KALIN","YAGMURLUK","YELEK"],"DOKUMA ALT":["KEY DOKUMA PANTOLON KARGO","KEY DOKUMA PANTOLON ORTA","KEY DOKUMA ŞORT/BERMUDA"],"DOKUMA ÜST":["DOKUMA SHACKET","KEY DOKUMA GOMLEK K.KOL","KEY DOKUMA GOMLEK U.KOL"],"ÖRME":["BASIC ORME T-SHIRT K.KOL","KEY BASKILI ORME T-SHIRT K.KOL","KEY ÖRME ATLET","KEY ORME HIRKA","KEY ORME PANTOLON","KEY ORME POLO YAKA T-SHIRT K.KOL","KEY ORME SORT / BERMUDA","KEY ORME SWEAT"],"TRİKO":["KEY ÇİZGİLİ TRIKO KAZAK","KEY TRIKO HIRKA","KEY TRIKO KAZAK","KEY TRIKO KAZAK K.KOL","KEY TRIKO KAZAK Z4"]}},
    "BUMH":{bg:["DOKUMA ÜST","ÖRME","YÜZME GİYİM"],kl:{"DOKUMA ÜST":["KEY DOKUMA GOMLEK K.KOL"],"ÖRME":["BASIC ORME POLO YAKA T-SHIRT K.KOL","KEY ÖRME ATLET","KEY ORME T-SHIRT K.KOL"],"YÜZME GİYİM":["BASIC DOKUMA YUZME ŞORT","DOKUMA YUZME UZUN ŞORT","KEY DOKUMA YUZME ŞORT"]}},
    "BUCF":{bg:["BLAZER CEKET","DOKUMA ALT","DOKUMA ÜST","KRAVAT/PAPYON"],kl:{"BLAZER CEKET":["BLAZER CEKET"],"DOKUMA ALT":["KEY DOKUMA PANTOLON"],"DOKUMA ÜST":["BASIC DOKUMA GOMLEK U.KOL","KEY DOKUMA GOMLEK K.KOL","KEY DOKUMA GOMLEK U.KOL"],"KRAVAT/PAPYON":["KEY AKSESUAR KRAVAT/PAPYON SMART"]}},
    "BUGA":{bg:["AKTİF SPOR","DIŞ GİYİM","DOKUMA ALT"],kl:{"AKTİF SPOR":["BASIC ORME T-SHIRT K.KOL AKTİF SPOR","KEY ORME ATLET AKTİF SPOR","KEY ORME HIRKA AKTİF SPOR","KEY ORME PANTOLON AKTİF SPOR","KEY ORME SORT/TAYTLI SORT AKTİF SPOR","KEY ORME SWEAT AKTİF SPOR","KEY ORME T-SHIRT U.KOL AKTİF SPOR"],"DIŞ GİYİM":["MONT/KABAN KALIN"],"DOKUMA ALT":["KEY DOKUMA PANTOLON"]}},
    "BUJD":{bg:["DENİM"],kl:{"DENİM":["BASIC DOKUMA JEAN BERMUDA","BASIC DOKUMA JEAN PANTOLON"]}},
    "BUJW":{bg:["DENİM","DENIM DUVARI"],kl:{"DENİM":["KEY DOKUMA JEAN GOMLEK K.KOL","KEY DOKUMA JEAN GOMLEK U.KOL","KEY DOKUMA JEAN MONT"],"DENIM DUVARI":["BASIC DENIM DUVAR DOKUMA JEAN PANTOLON","BASIC DENIM DUVAR DOKUMA JEAN SORT /BERMUDA"]}},
    "BUK":{bg:["DERİ AKSESUAR","DOKUMA AKSESUAR","STANDART DIŞI","TRİKO ÖRME AKSESUAR"],kl:{"DERİ AKSESUAR":["KEY AKSESUAR CANTA BUYUK","KEY AKSESUAR CANTA KUCUK","KEY AKSESUAR CUZDAN","KEY AKSESUAR KEMER"],"DOKUMA AKSESUAR":["KEY AKSESUAR ATKI","KEY AKSESUAR DOKUMA ŞAPKA","KEY AKSESUAR ELDIVEN"],"STANDART DIŞI":["KEY AKSESUAR TAKI"],"TRİKO ÖRME AKSESUAR":["KEY AKSESUAR HAVLU","KEY ORME AKSESUAR BERE","KEY TRIKO AKSESUAR BERE","KEY TRIKO AKSESUAR ELDIVEN","KEY TRIKO AKSESUAR KAŞKOL"]}},
    "BUR":{bg:["ÇORAP"],kl:{"ÇORAP":["KEY AKSESUAR ÇORAP BABET","KEY AKSESUAR CORAP EV","KEY AKSESUAR CORAP PATIK","KEY AKSESUAR CORAP SNEAKER","KEY AKSESUAR CORAP SOKET"]}},
    "BUS":{bg:["BOXER","İÇ GİYİM"],kl:{"BOXER":["İÇGYM BASIC BOXER","İÇGYM KEY BOXER","İÇGYM SLİP"],"İÇ GİYİM":["İÇGYM KEY ÖRME FANİLA K.KOL","İÇGYM ORME ATLET","İÇGYM ORME FANILA U.KOL"]}},
    "BUSP":{bg:["PİJAMA"],kl:{"PİJAMA":["İÇGYM ÖRME PİJAMA TAKIM K.KOL-K.PAÇA","İÇGYM ÖRME PİJAMA TAKIM K.KOL-U.PAÇA","İÇGYM ÖRME PİJAMA TAKIM U.KOL-U.PAÇA","İÇGYM ÖRME PİJAMA TEK ALT KISA","İÇGYM ÖRME PİJAMA TEK ALT UZUN","İÇGYM ÖRME PİJAMA TEK ÜST","İÇGYM TERMAL ÜST","PİJAMA TERMAL ALT"]}}
  };

  const magData = erkekMAG[mag];
  if(!magData) return res.json({ok:false, error:'Geçersiz MAG'});

  const bgList = magData.bg.join(', ');
  let klSummary = '';
  Object.keys(magData.kl||{}).forEach(bg => {
    klSummary += bg + ': [' + magData.kl[bg].join(', ') + ']\n';
  });

  const feedbacksWithKW = feedbacks.map((f,i) => {
    const kw = kwResults[i]||{};
    return 'index='+i+': "'+f+'" → KW: BG='+(kw.bg||'?')+', KL='+(kw.kl||'?');
  }).join('\n');

  const prompt = `LC Waikiki erkek reyonu mağaza ziyaret sistemi geri bildirim sınıflandırma.

MAG: ${mag}
Geçerli Buyer Gruplar: ${bgList}
Geçerli Klasmanlar (BG -> KL eşlemesi):
${klSummary}

GÖREV: Her geri bildirim için doğru BG ve KL belirle.

KRİTİK KURALLAR:
1. SADECE yukarıda listelenen BG ve KL değerlerini kullan. Listede olmayan değer yazma.
2. Anahtar kelime analizi (KW) zaten bir öneri sunmuş. KW önerisini YALNIZCA açıkça yanlışsa değiştir.
3. KW önerisi mantıklıysa aynen kabul et, "high" confidence ver.
4. Emin değilsen KW önerisini koru, değiştirme.
5. Hiçbir BG veya KL bulamıyorsan null yaz.
6. Uydurma, tahmin etme — sadece metinde açıkça geçen ürün/kategori bilgisine dayan.

Geri bildirimler ve KW önerileri:
${feedbacksWithKW}

Sadece JSON döndür, başka hiçbir şey yazma.
index değeri 0'dan başlar ve her geri bildirime karşılık gelir.
reason: O satırın kendisi için kısa açıklama yaz.
[{"index":0,"bg":"BG_ADI veya null","kl":"KL_ADI veya null","confidence":"high/medium/low","reason":"bu satir icin aciklama"}]`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{role:'user', content: prompt}]
      })
    });

    const data = await response.json();
    const text = data.content&&data.content[0] ? data.content[0].text : '';
    const clean = text.replace(/```json|```/g,'').trim();
    const results = JSON.parse(clean);
    res.json({ok:true, results});
  } catch(e) {
    res.json({ok:false, error: e.message});
  }
});



// ── KW Rules ────────────────────────────────────────────────────────────────
const KW_FILE = path.join(path.dirname(process.env.DATA_PATH || '/app/data/data.json'), 'kw_rules.json');

function loadKWFile(){ try{ return JSON.parse(fs.readFileSync(KW_FILE,'utf8')); }catch(e){ return null; } }
function saveKWFile(data){ fs.writeFileSync(KW_FILE, JSON.stringify(data)); }

app.post('/kw/save', (req, res) => {
  const {rules} = req.body||{};
  if(!Array.isArray(rules)) return res.json({ok:false, error:'Gecersiz veri'});
  saveKWFile(rules);
  res.json({ok:true, count:rules.length});
});

app.get('/kw/load', (req, res) => {
  const rules = loadKWFile();
  res.json({ok:true, rules});
});

// ── Model DB ────────────────────────────────────────────────────────────────
const MODEL_FILE = process.env.DATA_PATH
  ? path.join(path.dirname(process.env.DATA_PATH || '/app/data/data.json'), 'models.json')
  : path.join('/app/data', 'models.json');

function loadModels(){
  try{ return JSON.parse(fs.readFileSync(MODEL_FILE,'utf8')); }
  catch(e){ return []; }
}
function saveModels(data){
  fs.writeFileSync(MODEL_FILE, JSON.stringify(data));
}

// Model listesini kaydet
app.post('/models/save', (req, res) => {
  const {models} = req.body||{};
  if(!Array.isArray(models)) return res.json({ok:false, error:'Geçersiz veri'});
  saveModels(models);
  res.json({ok:true, count:models.length});
});

// Model listesini yükle
app.get('/models/load', (req, res) => {
  const models = loadModels();
  res.json({ok:true, models});
});

// ── Backup / Restore ─────────────────────────────────────────────────────────
const BACKUP_KEY = process.env.BACKUP_KEY || 'gemba2024';

// Backup indir: /admin/backup?key=gemba2024
app.get('/admin/backup', (req, res) => {
  if(req.query.key !== BACKUP_KEY) return res.status(403).send('Yetkisiz');
  const data = loadData();
  const filename = 'gemba_backup_' + new Date().toISOString().slice(0,10) + '.json';
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(data, null, 2));
});

// Restore: POST /admin/restore?key=gemba2024
app.post('/admin/restore', (req, res) => {
  if(req.query.key !== BACKUP_KEY) return res.status(403).send('Yetkisiz');
  const data = req.body;
  if(!data||!data.users) return res.status(400).json({ok:false, error:'Gecersiz veri'});
  saveData(data);
  const count = Object.keys(data.users).length;
  res.json({ok:true, message: count + ' kullanici geri yuklendi'});
});

// ── Static ───────────────────────────────────────────────────────────────────
app.get('/gemba.png',(req,res)=>{
  const file=path.join(__dirname,'gemba.png');
  if(fs.existsSync(file)){res.setHeader('Content-Type','image/png');res.sendFile(file);}
  else res.status(404).send('Not found');
});
app.get('/manifest.json',(req,res)=>{
  res.setHeader('Content-Type','application/manifest+json');
  res.sendFile(path.join(__dirname,'manifest.json'));
});
app.use(express.static(path.join(__dirname)));
app.get('/ai-test.html',(req,res)=>res.sendFile(path.join(__dirname,'ai-test.html')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));

app.listen(PORT,()=>{
  console.log(`Server running on port ${PORT}`);
  console.log('Telegram:', TG_TOKEN?'configured':'not configured');
  console.log('Files:', fs.readdirSync(__dirname).filter(f=>!f.includes('node_modules')).join(', '));
  // Init data file
  // Klasoru olustur
  const dataDir=path.dirname(DATA_FILE);
  if(!fs.existsSync(dataDir)){
    fs.mkdirSync(dataDir,{recursive:true});
    console.log('Data dir created:', dataDir);
  }
  if(!fs.existsSync(DATA_FILE)) saveData({users:{}});
  console.log('Data file:', DATA_FILE);
});
