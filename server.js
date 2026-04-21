const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

// Explicit routes for static assets
app.get('/gemba.png', (req, res) => {
  const file = path.join(__dirname, 'gemba.png');
  if (fs.existsSync(file)) {
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

// Serve all static files
app.use(express.static(path.join(__dirname)));

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Files:', fs.readdirSync(__dirname).join(', '));
});
