const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── Telegram bildirimi ──────────────────────────────────────────────────────
const TG_TOKEN = process.env.TELEGRAM_TOKEN;
const TG_CHAT  = process.env.TELEGRAM_CHAT_ID;

function sendTelegram(msg){
  if(!TG_TOKEN || !TG_CHAT) return;
  const body = JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'HTML' });
  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${TG_TOKEN}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  });
  req.on('error', e => console.error('Telegram error:', e.message));
  req.write(body);
  req.end();
}

// ── Kullanıcı kaydı bildirimi ───────────────────────────────────────────────
app.post('/notify-user', (req, res) => {
  const { name, action } = req.body || {};
  if(!name) return res.json({ ok: false });

  const now = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  let msg = '';

  if(action === 'register'){
    msg = `👤 <b>Yeni Kullanıcı</b>\n\nİsim: <b>${name}</b>\nZaman: ${now}`;
  } else if(action === 'mail'){
    const { store, reyon, week } = req.body;
    msg = `📧 <b>Mail Gönderildi</b>\n\nKullanıcı: <b>${name}</b>\nMağaza: ${store||'-'}\nReyon: ${reyon||'-'}\nHafta: ${week||'-'}\nZaman: ${now}`;
  } else if(action === 'visit'){
    const { store, reyon, week } = req.body;
    msg = `💾 <b>Ziyaret Kaydedildi</b>\n\nKullanıcı: <b>${name}</b>\nMağaza: ${store||'-'}\nReyon: ${reyon||'-'}\nHafta: ${week||'-'}\nZaman: ${now}`;
  }

  if(msg) sendTelegram(msg);
  res.json({ ok: true });
});

// ── Static routes ───────────────────────────────────────────────────────────
app.get('/gemba.png', (req, res) => {
  const file = path.join(__dirname, 'gemba.png');
  if(fs.existsSync(file)){
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(file);
  } else {
    res.status(404).send('Not found');
  }
});

app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

app.use(express.static(path.join(__dirname)));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Telegram:', TG_TOKEN ? 'configured' : 'not configured');
  console.log('Files:', fs.readdirSync(__dirname).join(', '));
});
