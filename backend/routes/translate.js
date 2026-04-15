const express = require('express');
const router = express.Router();

// This is the brain of our backend. It handles the translation.
router.post('/', async (req, res) => {
    try {
        // Get the Hindi text that the frontend sent.
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'No text was provided to translate.' });
        }

        // Debug: log incoming text
        console.log('Incoming text to translate:', text);

        // We'll try a higher-quality provider first (LibreTranslate public instance).
        // If that fails (timeout, network, or unexpected shape) we'll fall back to MyMemory.
        const timeoutMs = 6000;

        // Helper to run a fetch with timeout
        const fetchWithTimeout = async (url, opts = {}, ms = timeoutMs) => {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), ms);
            try {
                const r = await fetch(url, { ...opts, signal: controller.signal });
                clearTimeout(id);
                return r;
            } catch (err) {
                clearTimeout(id);
                throw err;
            }
        };

        // 1) Try Google Translate web endpoint (unofficial public endpoint) — often higher quality
        try {
            const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=hi&tl=en&dt=t&q=${encodeURIComponent(text)}`;
            const gtResp = await fetchWithTimeout(gtUrl, { method: 'GET' }, timeoutMs);
            if (gtResp && gtResp.ok) {
                const gtData = await gtResp.json();
                // gtData[0] is an array of chunks  
                const parts = (gtData[0] || []).map(p => (p && p[0]) ? p[0] : '').filter(Boolean);
                const translated = parts.join(' ').trim();
                if (translated.length > 0) {
                    console.log('Google Translate response (snippet):', translated.slice(0,200));
                    return res.status(200).json({ translation: translated, provider: 'google-web' });
                }
            } else {
                console.warn('Google Translate returned non-OK', gtResp && gtResp.status);
            }
        } catch (gErr) {
            console.warn('Google Translate attempt failed:', gErr && gErr.message);
        }

        // 2) Try LibreTranslate (public instance)
        try {
            const libreUrl = 'https://libretranslate.de/translate';
            const libreResp = await fetchWithTimeout(libreUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ q: text, source: 'hi', target: 'en', format: 'text' }),
            });

            if (libreResp && libreResp.ok) {
                const libreData = await libreResp.json();
                console.log('LibreTranslate response:', JSON.stringify(libreData).slice(0, 2000));
                const translated = (libreData?.translatedText || libreData?.translation || '').toString().trim();
                if (translated.length > 0) {
                    return res.status(200).json({ translation: translated, provider: 'libretranslate' });
                }
            } else {
                console.warn('LibreTranslate failed or returned non-OK status', libreResp && libreResp.status);
            }
        } catch (libErr) {
            console.warn('LibreTranslate attempt failed:', libErr && libErr.message);
        }

        // 2) Fallback: MyMemory
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=hi|en`;
        let data;
        try {
            const response = await fetchWithTimeout(url, { method: 'GET' }, timeoutMs);
            data = await response.json();
        } catch (err) {
            console.error('MyMemory fetch failed:', err && err.message);
            return res.status(502).json({ error: 'Translation providers failed', details: err && err.message });
        }

        // Debug: log the raw API response to help diagnose issues
        try { console.log('MyMemory response:', JSON.stringify(data).slice(0, 2000)); } catch (e) { console.log('MyMemory response (raw):', data); }

        // Try multiple places for a translation and pick the best one
        let translatedText = (data?.responseData?.translatedText || '').toString().trim();

        if (!translatedText && Array.isArray(data?.matches)) {
            // prefer the best match with a non-empty translation and highest quality score
            const goodMatches = data.matches.filter(m => m && m.translation && m.translation.toString().trim().length > 0);
            if (goodMatches.length > 0) {
                // sort by quality (if available) or by match percentage
                goodMatches.sort((a, b) => (b?.quality || b?.match || 0) - (a?.quality || a?.match || 0));
                translatedText = goodMatches[0].translation;
            }
        }

        // Final safeguard: ensure we have something meaningful
        if (translatedText && translatedText.toString().trim().length > 0) {
            console.log('Final translatedText (sending):', translatedText);
            return res.status(200).json({ translation: translatedText, provider: 'mymemory' });
        }

        // If we reach here, the API returned unexpected data — include raw payload to help debugging
        console.error('Translation failed - unexpected MyMemory response shape', data);
        return res.status(500).json({ error: 'Translation failed or returned in an unexpected format.', raw: data });

    } catch (error) {
        console.error('Error during translation:', error);
        res.status(500).json({ error: 'An error occurred during translation.' });
    }
});

module.exports = router;


