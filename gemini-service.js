class GeminiService {
    constructor() {
        this.keys = JSON.parse(localStorage.getItem('gemini_api_keys') || '[]');
        this.activeKeyId = localStorage.getItem('gemini_active_key') || '';
        this.baseModel = 'gemini-3-flash-preview';
    }

    get apiKey() {
        const active = this.keys.find(k => k.id === this.activeKeyId);
        return active ? active.key : '';
    }

    get baseUrl() {
        return `https://generativelanguage.googleapis.com/v1beta/models/${this.baseModel}:generateContent`;
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
            key: k.key.slice(0, 8) + '...',
            active: k.id === this.activeKeyId
        }));
    }

    setApiKey(key) {
        this.addKey('預設', key);
    }

    getApiKey() {
        return this.apiKey;
    }

    // ===== 核心 API 呼叫 =====
    async callAPI(prompt, maxTokens = 8192) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);

        let response;
        try {
            response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: maxTokens,
                        responseMimeType: "application/json"
                    }
                })
            });
        } catch (err) {
            clearTimeout(timeout);
            if (err.name === 'AbortError') {
                throw new Error('請求超時（60秒），請稍後再試');
            }
            throw err;
        }
        clearTimeout(timeout);

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Gemini API 呼叫失敗');
        }

        return await response.json();
    }

    // ===== 主分析入口 =====
    async analyze(text, difficulty = 'auto') {
        if (!this.apiKey) {
            throw new Error('請先在設定頁面新增 Gemini API Key');
        }

        // 第一步：翻譯全文（分批，不會被截斷）
        const paragraphs = await this.translateText(text);

        // 第二步：提取單字、文法、例句（只做一次）
        const analysis = await this.extractAnalysis(text, difficulty);

        return {
            title: analysis.title || '未命名',
            difficulty: analysis.difficulty || 'N3',
            summary: analysis.summary || '',
            paragraphs: paragraphs,
            vocabulary: analysis.vocabulary || [],
            grammar: analysis.grammar || [],
            sentences: analysis.sentences || [],
            originalText: text
        };
    }

    // ===== 翻譯：按段落拆分，分批送出 =====
    async translateText(text) {
        const rawParagraphs = text.split(/\n+/).filter(p => p.trim().length > 0);
        const batchSize = 5;
        const allParagraphs = [];

        for (let i = 0; i < rawParagraphs.length; i += batchSize) {
            const batch = rawParagraphs.slice(i, i + batchSize);
            const result = await this.translateBatch(batch);
            allParagraphs.push(...result);
        }

        return allParagraphs;
    }

    async translateBatch(paragraphs) {
        const numbered = paragraphs.map((p, i) => `[${i}] ${p}`).join('\n');

        const prompt = `請翻譯以下日文段落為中文。每段前面有編號。

如果段落開頭有說話者名稱（如「芹澤」「MOTSU」「――」），請標示出來。

回傳 JSON 陣列格式（不要加 markdown 標記）：
[
    {
        "speaker": "說話者（沒有則留空字串）",
        "lines": [
            {
                "original": "原文句子",
                "translation": "中文翻譯"
            }
        ]
    }
]

每個段落對應陣列中的一個物件。每個段落內按句號（。）拆成多個 lines，逐句翻譯，不可省略任何內容。

日文段落：
${numbered}

直接回傳 JSON 陣列：`;

        try {
            const data = await this.callAPI(prompt, 4096);
            const rawText = data.candidates[0].content.parts[0].text;
            let cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            return JSON.parse(cleaned);
        } catch (e) {
            // 解析失敗就用簡單格式回傳
            return paragraphs.map(p => ({
                speaker: '',
                lines: [{ original: p, translation: '（翻譯失敗，請重試）' }]
            }));
        }
    }

    // ===== 分析：提取單字、文法、例句 =====
    async extractAnalysis(text, difficulty) {
        const sample = text.slice(0, 2000);

        const prompt = `你是一位專業的日文教師。請分析以下日文文本，提取學習重點。

文本：
${sample}

難度設定：${difficulty === 'auto' ? '請自動判斷' : difficulty}

回傳 JSON 格式（不要加 markdown 標記）：
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
        {
            "japanese": "重點例句",
            "translation": "中文翻譯",
            "note": "學習重點說明"
        }
    ]
}

要求：
- 單字提取 10-20 個重要單字
- 文法提取 3-5 個文法點
- 重點例句 3-5 句
- 標注 JLPT 等級

直接回傳 JSON：`;

        const data = await this.callAPI(prompt, 8192);
        const rawText = data.candidates[0].content.parts[0].text;
        let cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        try {
            return JSON.parse(cleaned);
        } catch (e) {
            try {
                if (!cleaned.endsWith('}')) {
                    const last = cleaned.lastIndexOf('}');
                    if (last > 0) {
                        cleaned = cleaned.substring(0, last + 1);
                        const ob = (cleaned.match(/\[/g) || []).length;
                        const cb = (cleaned.match(/\]/g) || []).length;
                        const oc = (cleaned.match(/\{/g) || []).length;
                        const cc = (cleaned.match(/\}/g) || []).length;
                        for (let i = 0; i < ob - cb; i++) cleaned += ']';
                        for (let i = 0; i < oc - cc; i++) cleaned += '}';
                    }
                }
                return JSON.parse(cleaned);
            } catch (e2) {
                console.error('JSON parse error:', rawText.substring(0, 500));
                throw new Error('AI 回傳格式異常，請重試');
            }
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
            } catch (e) {
                continue;
            }
        }

        if (!html) {
            throw new Error('所有代理都無法取得網頁內容。\n請直接複製網頁文字，貼到「文本輸入」使用。');
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        doc.querySelectorAll('script, style, nav, header, footer, iframe, noscript, aside, form').forEach(el => el.remove());

        const selectors = ['article', '[role="main"]', 'main', '.content', '.post', '.entry', '#content', '.article-body'];
        let container = null;
        for (const sel of selectors) {
            container = doc.querySelector(sel);
            if (container && container.textContent.trim().length > 100) break;
            container = null;
        }

        if (!container) container = doc.body;

        const text = (container.innerText || container.textContent || '')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
            .slice(0, 8000);

        if (text.length < 30) {
            throw new Error('網頁內容太少或無法解析。\n請直接複製網頁文字，貼到「文本輸入」使用。');
        }

        return text;
    }
}

const gemini = new GeminiService();
