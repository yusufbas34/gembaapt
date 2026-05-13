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

  const prompt = `LC Waikiki mağaza ziyaret geri bildirim sınıflandırma sistemi.

MAG: ${mag}
Buyer Gruplar: ${bgList}
Klasmanlar:
${klSummary}

GÖREV: Her geri bildirimi ürün kategorisine göre sınıflandır.

TEMEL MANTIK — önce ürün tipini anla:
- "üst / tişört / gömlek / sweat / kazak / hirka / atlet / bluz" → üst giyim klasmanı
- "pantolon / chino / jean / şort / bermuda / alt" → alt giyim klasmanı  
- "mont / kaban / parka / yelek / ceket" → dış giyim klasmanı
- "v yaka / bisiklet yaka / polo yaka" → o yaka tipinin tişörtü
- "ince / kalın / orta" → ürün kalınlığı/ağırlığı — ürün tipini değiştirmez!
- Model adı (örn: Dubar, Scup, Zero, Ferjo) → o modelin ait olduğu kategori

KURALLAR:
1. Sadece yukarıdaki listede olan BG ve KL değerlerini kullan.
2. KW önerisi verilmiş ama sen BAĞIMSIZ düşün — geri bildirimin ürün tipine bak.
3. KW açıkça yanlışsa (üst ürün → pantolon klasmanı gibi) DÜZELt, high confidence ver.
4. KW mantıklıysa aynen kabul et.
5. Emin değilsen null bırak, uydurma.

Geri bildirimler (KW önerisiyle):
${feedbacksWithKW}

JSON döndür:
[{"index":0,"bg":"BG_ADI","kl":"KL_ADI_veya_null","confidence":"high/medium/low","reason":"1 satir aciklama"}]`;

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


// Model auth endpoint
app.post('/models/auth', (req, res) => {
  const {pin} = req.body||{};
  const MODEL_PIN = process.env.MODEL_PIN || '1923';
  res.json({ok: pin === MODEL_PIN});
});


// ── Model adı çıkarma ────────────────────────────────────────────────────────
app.post('/ai/extract-models', async (req, res) => {
  const {feedbacks} = req.body||{};
  if(!feedbacks||!feedbacks.length) return res.json({ok:false,error:'Eksik'});

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if(!ANTHROPIC_KEY) return res.json({ok:true, models: feedbacks.map(()=>null)});

  const prompt = `Aşağıdaki geri bildirimlerin her birinde geçen ÜRÜN MODEL ADINI bul.

Model adı: LC Waikiki ürünlerinin özel isimleri (örn: Scup, Zero, Ferjo, Jerno, Parma, Semper, Atina, Dubar, Neso, Iko vb.)
Bunlar genellikle büyük harfle başlar veya tamamen büyük harfle yazılır.

Eğer model adı yoksa null döndür.
Sadece JSON döndür:
[{"index":0,"model":"MODEL_ADI_veya_null"}]

Geri bildirimler:
${feedbacks.map((f,i)=>`${i}. "${f}"`).join('\n')}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{role:'user', content: prompt}]
      })
    });
    const data = await response.json();
    const text = data.content&&data.content[0] ? data.content[0].text : '[]';
    const clean = text.replace(/```json|```/g,'').trim();
    const results = JSON.parse(clean);
    res.json({ok:true, models: results});
  } catch(e) {
    res.json({ok:true, models: feedbacks.map(()=>null)});
  }
});


// ── Telegram Bot Entegrasyonu ────────────────────────────────────────────────
const TG_USERS_FILE = path.join(path.dirname(DATA_FILE), 'tg_users.json');
const TG_TOKENS_FILE = path.join(path.dirname(DATA_FILE), 'tg_tokens.json');

// In-memory session storage
const tgSessions = {}; // {tgId: {store, mag, feedbacks, lastMsgAt, timeout}}

function getSession(tgId){ return tgSessions[tgId]||null; }
function setSession(tgId, data){ tgSessions[tgId] = {...data, lastMsgAt: Date.now()}; }
function clearSession(tgId){ delete tgSessions[tgId]; }

function loadTGUsers(){ try{ return JSON.parse(fs.readFileSync(TG_USERS_FILE,'utf8')); }catch(e){ return {}; } }
function saveTGUsers(d){ fs.writeFileSync(TG_USERS_FILE, JSON.stringify(d,null,2)); }
function loadTGTokens(){ try{ return JSON.parse(fs.readFileSync(TG_TOKENS_FILE,'utf8')); }catch(e){ return {}; } }
function saveTGTokens(d){ fs.writeFileSync(TG_TOKENS_FILE, JSON.stringify(d,null,2)); }

function sendTGMsg(chatId, text){
  if(!TG_TOKEN) return;
  const body = JSON.stringify({chat_id:chatId, text, parse_mode:'HTML'});
  const req = https.request({
    hostname:'api.telegram.org',
    path:`/bot${TG_TOKEN}/sendMessage`,
    method:'POST',
    headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}
  }, (res)=>{ res.on('data',()=>{}); });
  req.on('error',()=>{});
  req.write(body); req.end();
}

// Token üret - ai-test'ten çağrılır
app.post('/telegram/create-token', (req, res) => {
  const {name, pin} = req.body||{};
  if(!name||!pin) return res.json({ok:false, error:'Ad ve PIN gerekli'});
  
  // Kullanıcıyı doğrula
  const data = loadData();
  const userKey = Object.keys(data.users||{}).find(k => {
    const u = data.users[k];
    return u.name === name && u.pin === pin;
  });
  if(!userKey) return res.json({ok:false, error:'Kullanıcı bulunamadı'});
  
  // Token üret
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const tokens = loadTGTokens();
  tokens[token] = {name, createdAt: Date.now(), expires: Date.now() + 10*60*1000}; // 10 dakika
  saveTGTokens(tokens);
  
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'GembaGPTBot';
  res.json({ok:true, token, botUrl:`https://t.me/${botUsername}?start=${token}`});
});

// Token durumu kontrol
app.get('/telegram/check-token/:token', (req, res) => {
  const tokens = loadTGTokens();
  const t = tokens[req.params.token];
  if(!t) return res.json({ok:false, status:'invalid'});
  if(t.linkedTgId) return res.json({ok:true, status:'linked', name:t.name});
  if(Date.now() > t.expires) return res.json({ok:false, status:'expired'});
  res.json({ok:true, status:'pending'});
});

// Bağlı Telegram hesabını getir
app.post('/telegram/get-link', (req, res) => {
  const {name, pin} = req.body||{};
  if(!name||!pin) return res.json({ok:false});
  const data = loadData();
  const userKey = Object.keys(data.users||{}).find(k => {
    const u = data.users[k];
    return u.name === name && u.pin === pin;
  });
  if(!userKey) return res.json({ok:false});
  const tgUsers = loadTGUsers();
  const linked = Object.values(tgUsers).find(u => u.name === name);
  res.json({ok:true, linked: !!linked, tgName: linked ? linked.tgName : null});
});

// Telegram Webhook - bottan gelen mesajlar
app.post('/telegram/webhook', async (req, res) => {
  res.json({ok:true}); // Telegram'a hemen 200 ver
  const update = req.body;
  if(!update.message) return;
  
  const msg = update.message;
  const chatId = msg.chat.id;
  const tgId = msg.from.id.toString();
  const text = (msg.text||'').trim();
  const tgName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ');

  // /start token ile gelen bağlantı
  if(text.startsWith('/start')){
    const token = text.split(' ')[1];
    if(!token){
      sendTGMsg(chatId, '👋 Merhaba! GembaGPT uygulamasindan QR kodu okutun.');
      return;
    }
    const tokens = loadTGTokens();
    const t = tokens[token];
    if(!t){ sendTGMsg(chatId, '❌ Geçersiz veya süresi dolmuş bağlantı. Uygulamadan yeni QR kod alın.'); return; }
    if(Date.now() > t.expires){ sendTGMsg(chatId, '⏰ QR kodun süresi dolmuş. Uygulamadan yeni QR kod alın.'); return; }
    
    // Bağla
    const tgUsers = loadTGUsers();
    tgUsers[tgId] = {name: t.name, tgName, tgId, linkedAt: Date.now()};
    saveTGUsers(tgUsers);
    
    t.linkedTgId = tgId;
    tokens[token] = t;
    saveTGTokens(tokens);
    
    sendTGMsg(chatId, `✅ Merhaba <b>${t.name}</b>! Telegram hesabın GembaGPT'e bağlandı.\n\nArtık geri bildirim gönderebilirsin. Format:\n\n<b>MAĞAZA ADI</b>\n<b>MAG</b> (örn: BUC)\n- Geri bildirim 1\n- Geri bildirim 2`);
    return;
  }

  // Kullanıcı tanımlı mı?
  const tgUsers = loadTGUsers();
  const user = tgUsers[tgId];
  if(!user){
    sendTGMsg(chatId, '❌ Henüz bağlantı kurulmadı. GembaGPT uygulamasından QR kodu okutun.');
    return;
  }

  // Özel komutları kontrol et
  const lowerText = text.toLowerCase().trim();
  
  // İPTAL
  if(lowerText==='iptal' || lowerText==='cancel' || lowerText==='sil'){
    const sess = getSession(tgId);
    if(sess){
      clearSession(tgId);
      sendTGMsg(chatId, '🗑 Oturum iptal edildi. Yeni geri bildirim için mağaza adıyla başlayın.');
    } else {
      sendTGMsg(chatId, 'Aktif oturum yok.');
    }
    return;
  }

  // GÖNDER / TAMAM - mevcut oturumu analiz et
  if(lowerText==='gönder'||lowerText==='gonder'||lowerText==='tamam'||lowerText==='ok'||lowerText==='✓'){
    const sess = getSession(tgId);
    if(!sess||!sess.feedbacks||!sess.feedbacks.length){
      sendTGMsg(chatId, '❌ Gönderilecek geri bildirim yok. Önce mağaza ve geri bildirimleri yazın.');
      return;
    }
    clearSession(tgId);
    await processAnalysis(chatId, user, sess.store, sess.mag, sess.feedbacks);
    return;
  }

  // Mevcut oturum var mı?
  const existingSession = getSession(tgId);
  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);

  if(existingSession){
    // Oturuma ek geri bildirimler ekle
    const newFeedbacks = lines.map(l=>l.replace(/^[-•*\d.)]\s*/,'')).filter(function(l){return l.length>2;});
    if(newFeedbacks.length){
      existingSession.feedbacks.push(...newFeedbacks);
      setSession(tgId, existingSession);
      sendTGMsg(chatId, `➕ ${newFeedbacks.length} geri bildirim eklendi. Toplam: <b>${existingSession.feedbacks.length}</b>\n\nDevam etmek için daha fazla yazın veya <b>tamam</b> yazarak analiz edin.\n<b>iptal</b> yazarak oturumu silebilirsiniz.`);
    } else {
      sendTGMsg(chatId, '❓ Geri bildirim anlaşılamadı. Her satıra - ile başlayan geri bildirim yazın veya <b>tamam</b> yazın.');
    }
    return;
  }

  // Yeni oturum başlat
  // Format: MAĞAZA\nREYON\nMAG\n- fb1\n- fb2
  if(lines.length < 2){
    sendTGMsg(chatId, '👋 Merhaba <b>'+user.name+'</b>!\n\nFormat:\n<code>MAĞAZA ADI\nReyon (Erkek/Kadın vb)\nMAG (örn: BUC)\n- Geri bildirim 1\n- Geri bildirim 2</code>');
    return;
  }

  const store = lines[0];
  // 2. satır reyon mu MAG mı?
  const REYONLAR = ['erkek','kadin','kadın','cocuk','çocuk','home','bebek'];
  let reyon = 'Erkek', mag = '', fbStart = 1;
  
  if(REYONLAR.includes(lines[1].toLowerCase().trim())){
    reyon = lines[1].trim();
    reyon = reyon.charAt(0).toUpperCase() + reyon.slice(1).toLowerCase();
    mag = lines[2] ? lines[2].toUpperCase().trim() : '';
    fbStart = 3;
  } else {
    mag = lines[1].toUpperCase().trim();
    fbStart = 2;
  }

  const feedbacks = lines.slice(fbStart).map(l=>l.replace(/^[-•*\d.)]\s*/,'')).filter(function(l){return l.length>2;});

  if(!feedbacks.length){
    setSession(tgId, {store, reyon, mag, feedbacks:[]});
    sendTGMsg(chatId, '📋 <b>'+store+'</b> / '+reyon+' / <b>'+mag+'</b> oturumu başlatıldı.\n\nGeri bildirimlerinizi yazın. Bitince <b>tamam</b> yazın.');
    return;
  }

  setSession(tgId, {store, reyon, mag, feedbacks});
  sendTGMsg(chatId, '📋 <b>'+store+'</b> — '+reyon+' — <b>'+mag+'</b>\n'+feedbacks.length+' geri bildirim alındı:\n\n'+feedbacks.map(function(f){return '• '+f;}).join('\n')+'\n\n<b>tamam</b> → analiz et\n<b>iptal</b> → sil\nYa da devam edin');
  return;

  // Bu noktaya artık gelmiyor - processAnalysis fonksiyonu kullanılıyor
});


function getWeekNumber(d){
  const dd=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  dd.setUTCDate(dd.getUTCDate()+4-(dd.getUTCDay()||7));
  return Math.ceil((((dd-new Date(Date.UTC(dd.getUTCFullYear(),0,1)))/86400000)+1)/7);
}

async function processAnalysis(chatId, user, store, mag, feedbacks, reyon){
  sendTGMsg(chatId, `⏳ <b>${store}</b> / <b>${mag}</b> için ${feedbacks.length} geri bildirim analiz ediliyor...`);
  
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if(!ANTHROPIC_KEY){ sendTGMsg(chatId, '❌ AI servisi yapılandırılmamış.'); return; }

  try{
    const prompt = `LC Waikiki mağaza ziyaret geri bildirimlerini sınıflandır.
MAG: ${mag}

Her geri bildirim için en uygun Buyer Grup belirle. Emin değilsen GENEL yaz.

Geri bildirimler:
${feedbacks.map((f,i)=>`${i}. "${f}"`).join('\n')}

JSON döndür:
[{"index":0,"bg":"BG_ADI","kl":"KL_veya_null"}]`;

    const aiResp = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':ANTHROPIC_KEY,'anthropic-version':'2023-06-01'},
      body: JSON.stringify({model:'claude-haiku-4-5-20251001', max_tokens:800, messages:[{role:'user',content:prompt}]})
    });
    const aiData = await aiResp.json();
    const aiText = aiData.content&&aiData.content[0] ? aiData.content[0].text : '[]';
    const aiResults = JSON.parse(aiText.replace(/```json|```/g,'').trim());

    // Özet oluştur - BG'ye göre grupla
    const groups = {};
    feedbacks.forEach((f,i)=>{
      const r = aiResults.find(a=>a.index===i)||{bg:'GENEL'};
      const key = r.bg||'GENEL';
      if(!groups[key]) groups[key]=[];
      groups[key].push(f);
    });

    let summary = '✅ <b>'+store+'</b> — <b>'+mag+'</b>\n<i>'+user.name+'</i>\n\n';
    Object.keys(groups).forEach(function(bg){
      summary += '👔 <b>'+bg+'</b>\n';
      groups[bg].forEach(function(f){ summary += '  • '+f+'\n'; });
      summary += '\n';
    });

    if(TG_CHAT) sendTGMsg(TG_CHAT, summary);
    sendTGMsg(chatId, summary+'✅ Kaydedildi! Yeni ziyaret icin magaza adiyla baslayin.');

    // Ziyareti kaydet
    try{
      const wn = getWeekNumber(new Date());
      const visitNotes = feedbacks.map(function(f,i){
        const r = aiResults.find(function(a){return a.index===i;})||{};
        return {id:Date.now()+i, reyon:reyon||'Erkek', mag:mag, bg:r.bg||'GENEL', kl:r.kl||'', tx:f, photos:[]};
      });
      const visit = {
        id:Date.now(), store, reyon:reyon||'Erkek', week:wn,
        date:new Date().toLocaleDateString('tr-TR'), user:user.name,
        notes:visitNotes,
        subject:wn+'. Hafta '+store+' '+(reyon||'Erkek')+' Reyonu',
        body:summary, source:'telegram'
      };
      const data = loadData();
      const userKey = Object.keys(data.users||{}).find(k=>data.users[k].name===user.name);
      if(userKey){
        if(!data.users[userKey].visits) data.users[userKey].visits=[];
        data.users[userKey].visits.unshift(visit);
        if(data.users[userKey].visits.length>100) data.users[userKey].visits.splice(100);
        saveData(data);
        console.log('Visit saved:', store, 'for', user.name);
      }
    }catch(saveErr){ console.log('Visit save err:', saveErr.message); }

  }catch(e){
    sendTGMsg(chatId, '❌ Analiz hatasi: '+e.message);
  }
}

// Webhook ayarla
app.get('/telegram/set-webhook', (req, res) => {
  if(!TG_TOKEN) return res.json({ok:false, error:'Token yok'});
  const webhookUrl = `${process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://'+process.env.RAILWAY_PUBLIC_DOMAIN : 'https://gembaapt.up.railway.app'}/telegram/webhook`;
  const body = JSON.stringify({url: webhookUrl});
  const apiReq = https.request({
    hostname:'api.telegram.org',
    path:`/bot${TG_TOKEN}/setWebhook`,
    method:'POST',
    headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}
  },(apiRes)=>{
    let data='';
    apiRes.on('data',d=>data+=d);
    apiRes.on('end',()=>res.json(JSON.parse(data)));
  });
  apiReq.on('error',e=>res.json({ok:false,error:e.message}));
  apiReq.write(body); apiReq.end();
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
