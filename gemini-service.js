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

    // 舊版相容
    setApiKey(key) {
        this.addKey('預設', key);
    }

    getApiKey() {
        return this.apiKey;
    }

    async analyze(text, difficulty = 'auto') {
        if (!this.apiKey) {
            throw new Error('請先在設定頁面新增 Gemini API Key');
        }

        const prompt = `你是一位專業的日文教師。請完整分析以下日文文本，並以 JSON 格式回傳結果。

文本：
${text}

難度設定：${difficulty === 'auto' ? '請自動判斷' : difficulty}

請回傳以下 JSON 格式（不要加 markdown 標記，直接回傳純 JSON）：
{
    "title": "這段文本的簡短標題（中文，10字以內）",
    "difficulty": "N5/N4/N3/N2/N1",
    "summary": "文本摘要（中文，50字以內）",
    "paragraphs": [
        {
            "original": "原文的一個句子（日文）",
            "translation": "該句的中文翻譯"
        }
    ],
    "vocabulary": [
        {
            "word": "日文單字",
            "reading": "平假名讀音",
            "meaning": "中文意思",
            "pos": "詞性（名詞/動詞/形容詞等）",
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

重要要求：
- paragraphs 必須包含原文的【每一個句子】，逐句翻譯，不可省略任何內容。將原文按句號（。）或換行拆分，每個句子都要有對應的中文翻譯
- 單字至少提取 8-15 個重要單字
- 文法至少提取 3-5 個文法點
- 重點例句至少 3-5 句
- 所有翻譯要自然通順
- 標注 JLPT 等級`;

        const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 8192
                }
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Gemini API 呼叫失敗');
        }

        const data = await response.json();
        const rawText = data.candidates[0].content.parts[0].text;
        const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        try {
            return JSON.parse(cleaned);
        } catch (e) {
            console.error('JSON parse error:', cleaned);
            throw new Error('AI 回傳格式異常，請重試');
        }
    }

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
            .slice(0, 3000);

        if (text.length < 30) {
            throw new Error('網頁內容太少或無法解析。\n請直接複製網頁文字，貼到「文本輸入」使用。');
        }

        return text;
    }
}

const gemini = new GeminiService();
