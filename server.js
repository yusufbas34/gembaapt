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
const DATA_FILE = path.join(__dirname, 'data.json');

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
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));

app.listen(PORT,()=>{
  console.log(`Server running on port ${PORT}`);
  console.log('Telegram:', TG_TOKEN?'configured':'not configured');
  console.log('Files:', fs.readdirSync(__dirname).filter(f=>!f.includes('node_modules')).join(', '));
  // Init data file
  if(!fs.existsSync(DATA_FILE)) saveData({users:{}});
});
