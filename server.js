const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const Database = require('better-sqlite3');
const { nanoid } = require('nanoid');
const cors = require('cors');

const app = express();
const db = new Database('links.db');

app.use(cors());
app.use(express.json());

// Initialize DB
db.exec(`CREATE TABLE IF NOT EXISTS urls (id TEXT PRIMARY KEY, original_url TEXT NOT NULL)`);

// SCANNING LOGIC
app.post('/api/scan', async (req, res) => {
    const { url } = req.body;
    try {
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(response.data);
        const assets = { images: [], links: [], audio: [] };
        const resolve = (l) => { try { return new URL(l, url).href; } catch(e) { return null; } };

        $('img').each((i, el) => { const s = $(el).attr('src'); if(s) assets.images.push(resolve(s)); });
        $('a').each((i, el) => { const h = $(el).attr('href'); if(h) assets.links.push(resolve(h)); });
        $('audio, source').each((i, el) => { const s = $(el).attr('src'); if(s) assets.audio.push(resolve(s)); });

        res.json(assets);
    } catch (e) { res.status(500).json({ error: "Failed to scan site" }); }
});

// ZIP PROXY: Crucial for fixing the ZIP download
app.get('/api/proxy-download', async (req, res) => {
    const { url } = req.query;
    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'arraybuffer', // Get as buffer for binary files
            timeout: 15000
        });
        res.set('Content-Type', response.headers['content-type']);
        res.send(response.data);
    } catch (e) {
        res.status(500).send("Error fetching file for ZIP");
    }
});

// MASKING LOGIC
app.post('/api/mask', (req, res) => {
    const { longUrl, customAlias } = req.body;
    const maskId = customAlias ? customAlias.trim().replace(/\s+/g, '-') : nanoid(7);
    try {
        db.prepare('INSERT INTO urls (id, original_url) VALUES (?, ?)').run(maskId, longUrl);
        res.json({ maskedUrl: `http://localhost:3000/go/${maskId}` });
    } catch (err) { res.status(400).json({ error: "Alias already in use" }); }
});

app.get('/go/:id', (req, res) => {
    const row = db.prepare('SELECT original_url FROM urls WHERE id = ?').get(req.params.id);
    if (row) res.redirect(row.original_url);
    else res.status(404).send("Link not found");
});

app.delete('/api/clear-history', (req, res) => {
    db.prepare('DELETE FROM urls').run();
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));