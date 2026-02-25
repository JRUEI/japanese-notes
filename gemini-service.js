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

        // 長文章自動拆分
        if (text.length > 1500) {
            return await this.analyzeLong(text, difficulty);
        }

        return await this.callAnalyze(text, difficulty);
    }

    async analyzeLong(text, difficulty) {
        // 按句號拆分成多段，每段約 1000 字
        const chunks = [];
        let remaining = text;

        while (remaining.length > 0) {
            if (remaining.length <= 1200) {
                chunks.push(remaining);
                break;
            }
            // 在 800~1200 字之間找句號斷點
            let splitAt = -1;
            for (let i = 1200; i >= 800; i--) {
                if (remaining[i] === '。' || remaining[i] === '\n') {
                    splitAt = i + 1;
                    break;
                }
            }
            if (splitAt === -1) splitAt = 1200;

            chunks.push(remaining.slice(0, splitAt));
            remaining = remaining.slice(splitAt);
        }

        // 逐段分析
        const results = [];
        for (let i = 0; i < chunks.length; i++) {
            const label = `第${i + 1}/${chunks.length}部分`;
            const result = await this.callAnalyze(chunks[i], difficulty, label);
            results.push(result);
        }

        // 合併所有結果
        const merged = {
            title: results[0].title,
            difficulty: results[0].difficulty,
            summary: results[0].summary,
            paragraphs: [],
            vocabulary: [],
            grammar: [],
            sentences: []
        };

        for (const r of results) {
            merged.paragraphs.push(...(r.paragraphs || []));
            merged.vocabulary.push(...(r.vocabulary || []));
            merged.grammar.push(...(r.grammar || []));
            merged.sentences.push(...(r.sentences || []));
        }

        merged.vocabulary = this.mergeUnique(merged.vocabulary, 'word');
        merged.grammar = this.mergeUnique(merged.grammar, 'pattern');

        return merged;
    }

    mergeUnique(arr, key) {
        const seen = new Set();
        return arr.filter(item => {
            if (seen.has(item[key])) return false;
            seen.add(item[key]);
            return true;
        });
    }

    async callAnalyze(text, difficulty = 'auto', partLabel = '') {
        const partNote = partLabel ? `（注意：這是文章的${partLabel}部分，請完整分析所有句子）` : '';

        const prompt = `你是一位專業的日文教師。請完整分析以下日文文本，並以 JSON 格式回傳結果。${partNote}

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
- paragraphs 必須包含原文的【每一個句子】，逐句翻譯，不可省略任何內容
- 單字至少提取 8-15 個重要單字
- 文法至少提取 3-5 個文法點
- 重點例句至少 3-5 句
- 所有翻譯要自然通順
- 標注 JLPT 等級`;

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
                        maxOutputTokens: 16384,
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

        const data = await response.json();
        const rawText = data.candidates[0].content.parts[0].text;
        let cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        try {
            return JSON.parse(cleaned);
        } catch (e) {
            try {
                if (!cleaned.endsWith('}')) {
                    const lastBracket = cleaned.lastIndexOf('}');
                    if (lastBracket > 0) {
                        cleaned = cleaned.substring(0, lastBracket + 1);
                        const openBrackets = (cleaned.match(/\[/g) || []).length;
                        const closeBrackets = (cleaned.match(/\]/g) || []).length;
                        const openBraces = (cleaned.match(/\{/g) || []).length;
                        const closeBraces = (cleaned.match(/\}/g) || []).length;
                        for (let i = 0; i < openBrackets - closeBrackets; i++) cleaned += ']';
                        for (let i = 0; i < openBraces - closeBraces; i++) cleaned += '}';
                    }
                }
                return JSON.parse(cleaned);
            } catch (e2) {
                console.error('JSON parse error:', rawText.substring(0, 500));
                throw new Error('AI 回傳格式異常，請嘗試較短的文本');
            }
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
