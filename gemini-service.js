class GeminiService {
    constructor() {
        this.keys = JSON.parse(localStorage.getItem('gemini_api_keys') || '[]');
        this.activeKeyId = localStorage.getItem('gemini_active_key') || '';
    }

    get apiKey() {
        const active = this.keys.find(k => k.id === this.activeKeyId);
        return active ? active.key : '';
    }

    addKey(name, key) {
        const id = Date.now().toString();
        this.keys.push({ id, name, key });
        this.saveKeys();
        if (!this.activeKeyId) this.setActiveKey(id);
        return id;
    }

    removeKey(id) {
        this.keys = this.keys.filter(k => k.id !== id);
        if (this.activeKeyId === id) {
            this.activeKeyId = this.keys.length > 0 ? this.keys[0].id : '';
        }
        this.saveKeys();
    }

    setActiveKey(id) {
        this.activeKeyId = id;
        localStorage.setItem('gemini_active_key', id);
    }

    saveKeys() {
        localStorage.setItem('gemini_api_keys', JSON.stringify(this.keys));
        localStorage.setItem('gemini_active_key', this.activeKeyId);
    }

    getKeys() {
        return this.keys.map(k => ({
            id: k.id,
            name: k.name,
            key: k.key,
            active: k.id === this.activeKeyId
        }));
    }

    // ===== Prompt 產生器 =====
    buildTranslatePrompt(text) {
        return `將以下日文逐段逐句翻譯成中文。

回傳 JSON 陣列（不要加 markdown 標記，直接回傳純 JSON）：
[
    {
        "speaker": "說話者（沒有就留空字串）",
        "lines": [
            { "original": "日文原句", "translation": "中文翻譯" }
        ]
    }
]

每個段落拆成多個句子，每句一組 original + translation。

===== 日文原文 =====
${text}`;
    }

    buildAnalysisPrompt(text, difficulty) {
        return `分析以下日文文本的學習重點。

回傳 JSON（不要加 markdown 標記，直接回傳純 JSON）：
{
    "title": "簡短標題（中文，10字以內）",
    "difficulty": "N5/N4/N3/N2/N1",
    "summary": "摘要（中文，50字以內）",
    "vocabulary": [
        {
            "word": "日文單字",
            "reading": "平假名",
            "meaning": "中文意思",
            "pos": "詞性",
            "level": "N5/N4/N3/N2/N1",
            "example": "例句（日文）",
            "example_translation": "例句翻譯（中文）"
        }
    ],
    "grammar": [
        {
            "pattern": "文法句型",
            "meaning": "中文說明",
            "level": "N5/N4/N3/N2/N1",
            "structure": "接續方式",
            "example": "例句（日文）",
            "example_translation": "例句翻譯（中文）"
        }
    ],
    "sentences": [
        { "japanese": "重點例句", "translation": "中文翻譯", "note": "學習重點說明" }
    ]
}

要求：單字 10-20 個、文法 3-5 個、例句 3-5 句、標注 JLPT 等級
難度設定：${difficulty === 'auto' ? '自動判斷' : difficulty}

===== 日文原文 =====
${text}`;
    }

    // ===== 寬容 JSON 解析 =====
    parseJSON(raw) {
        let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

        try { return JSON.parse(cleaned); } catch (e) {}

        const firstBracket = cleaned.search(/[\[{]/);
        if (firstBracket === -1) throw new Error('找不到 JSON 內容');

        const startChar = cleaned[firstBracket];
        const endChar = startChar === '[' ? ']' : '}';
        const lastBracket = cleaned.lastIndexOf(endChar);
        if (lastBracket === -1) throw new Error('JSON 不完整');

        cleaned = cleaned.substring(firstBracket, lastBracket + 1);
        try { return JSON.parse(cleaned); } catch (e) {}

        // 修復括號
        const ob = (cleaned.match(/\[/g) || []).length;
        const cb = (cleaned.match(/\]/g) || []).length;
        const oc = (cleaned.match(/\{/g) || []).length;
        const cc = (cleaned.match(/\}/g) || []).length;
        for (let i = 0; i < ob - cb; i++) cleaned += ']';
        for (let i = 0; i < oc - cc; i++) cleaned += '}';

        try { return JSON.parse(cleaned); } catch (e) {
            throw new Error('無法解析 JSON，請確認 AI 回覆完整');
        }
    }

    // ===== 網頁擷取 =====
    async fetchUrlContent(url) {
        const proxies = [
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
            `https://corsproxy.io/?${encodeURIComponent(url)}`,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
        ];

        let html = '';
        for (const proxyUrl of proxies) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000);
                const response = await fetch(proxyUrl, { signal: controller.signal });
                clearTimeout(timeout);
                if (response.ok) {
                    html = await response.text();
                    if (html.length > 100) break;
                }
            } catch (e) { continue; }
        }

        if (!html) throw new Error('無法取得網頁內容，請直接複製文字貼上。');

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        doc.querySelectorAll('script,style,nav,header,footer,iframe,noscript,aside,form').forEach(el => el.remove());

        const selectors = ['article', '[role="main"]', 'main', '.content', '.post', '.entry', '#content'];
        let container = null;
        for (const sel of selectors) {
            container = doc.querySelector(sel);
            if (container && container.textContent.trim().length > 100) break;
            container = null;
        }
        if (!container) container = doc.body;

        const text = (container.innerText || container.textContent || '')
            .replace(/\n{3,}/g, '\n\n').trim().slice(0, 15000);

        if (text.length < 30) throw new Error('網頁內容太少，請直接複製文字貼上。');
        return text;
    }
}

const gemini = new GeminiService();
