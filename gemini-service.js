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
    async callAPI(prompt, maxTokens = 8192, useJson = false) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const config = {
            temperature: 0.3,
            maxOutputTokens: maxTokens
        };
        if (useJson) {
            config.responseMimeType = "application/json";
        }

        let response;
        try {
            response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: config
                })
            });
        } catch (err) {
            clearTimeout(timeout);
            if (err.name === 'AbortError') {
                throw new Error('請求超時，請稍後再試');
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
    // ===== 主分析入口（手動模式）=====
    async analyze(text, difficulty = 'auto') {
        // 產生完整 prompt
        const prompt = this.buildFullPrompt(text, difficulty);

        // 複製到剪貼簿
        await navigator.clipboard.writeText(prompt);

        // 開啟 AI Studio
        window.open('https://aistudio.google.com/app/prompts/new_chat', '_blank');

        // 等使用者貼回結果
        return new Promise((resolve, reject) => {
            this._pendingResolve = resolve;
            this._pendingReject = reject;
            this._pendingText = text;

            // 顯示貼回對話框
            this.showPasteDialog();
        });
    }

    buildFullPrompt(text, difficulty) {
        return `你是一位專業的日文教師。請分析以下日文文本，完成翻譯與學習重點提取。

===== 日文原文 =====
${sample}

===== 任務 =====
難度設定：${difficulty === 'auto' ? '請自動判斷' : difficulty}

請回傳以下 JSON（不要加 markdown 標記，直接回傳純 JSON）：
{
    "title": "簡短標題（中文，10字以內）",
    "difficulty": "N5/N4/N3/N2/N1",
    "summary": "摘要（中文，50字以內）",
    "paragraphs": [
        {
            "speaker": "說話者（沒有就留空字串）",
            "lines": [
                {
                    "original": "日文原句",
                    "translation": "中文翻譯"
                }
            ]
        }
    ],
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
- paragraphs：將原文每段逐句翻譯，每句一組 original + translation
- 單字提取 10-20 個重要單字
- 文法提取 3-5 個文法點
- 重點例句 3-5 句
- 標注 JLPT 等級
- 直接回傳 JSON，不要任何多餘文字`;
    }

    showPasteDialog() {
        // 移除舊的
        document.getElementById('paste-dialog')?.remove();

        const dialog = document.createElement('div');
        dialog.id = 'paste-dialog';
        dialog.className = 'paste-dialog-overlay';
        dialog.innerHTML = `
            <div class="paste-dialog">
                <h3>📋 Prompt 已複製到剪貼簿</h3>
                <p>已開啟 AI Studio，請：</p>
                <ol>
                    <li>在 AI Studio 聊天框貼上（Ctrl+V）</li>
                    <li>等 AI 回覆完整 JSON</li>
                    <li>複製 AI 的回覆，貼到下方</li>
                </ol>
                <textarea id="paste-result" placeholder="把 AI Studio 的回覆貼在這裡..."></textarea>
                <div class="paste-dialog-actions">
                    <button id="paste-submit" class="save-btn">✅ 送出</button>
                    <button id="paste-cancel" class="clear-btn">❌ 取消</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        document.getElementById('paste-submit').addEventListener('click', () => {
            const raw = document.getElementById('paste-result').value.trim();
            if (!raw) return;

            try {
                let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                const result = JSON.parse(cleaned);
                result.originalText = this._pendingText;
                dialog.remove();
                this._pendingResolve(result);
            } catch (e) {
                alert('JSON 解析失敗，請確認複製了完整的 AI 回覆');
            }
        });

        document.getElementById('paste-cancel').addEventListener('click', () => {
            dialog.remove();
            this._pendingReject(new Error('已取消'));
        });
    }

    // ===== 翻譯：逐段送出，每段獨立請求 =====
    async translateText(text) {
        const rawParagraphs = text.split(/\n+/).filter(p => p.trim().length > 0);
        const allParagraphs = [];

        for (let i = 0; i < rawParagraphs.length; i++) {
            window.dispatchEvent(new CustomEvent('translate-progress', {
                detail: { current: i + 1, total: rawParagraphs.length }
            }));

            const result = await this.translateSingle(rawParagraphs[i]);
            allParagraphs.push(result);
        }

        return allParagraphs;
    }

    async translateSingle(paragraph) {
        // 偵測說話者
        let speaker = '';
        let text = paragraph;
        const speakerMatch = paragraph.match(/^(――|──|[^\s　]{1,8})[　\s]+/);
        if (speakerMatch) {
            speaker = speakerMatch[1];
            text = paragraph.slice(speakerMatch[0].length);
        }

        // 純文字翻譯，不要求 JSON，最輕量
        const prompt = `將以下日文翻譯成中文，只回傳中文翻譯，不要加任何說明：

${text}`;

        try {
            const data = await this.callAPI(prompt, 1024, false);
            const translation = data.candidates[0].content.parts[0].text.trim();

            // 嘗試按句號對齊拆分
            const origSentences = text.split(/(?<=。)/).filter(s => s.trim());
            const transSentences = translation.split(/(?<=[。\.！？\!\?])/).filter(s => s.trim());

            if (origSentences.length > 1 && origSentences.length === transSentences.length) {
                return {
                    speaker,
                    lines: origSentences.map((s, i) => ({
                        original: s.trim(),
                        translation: transSentences[i].trim()
                    }))
                };
            }

            // 對不上就整段顯示
            return {
                speaker,
                lines: [{ original: text, translation }]
            };
        } catch (e) {
            return {
                speaker,
                lines: [{ original: text, translation: '（翻譯失敗）' }]
            };
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

        const data = await this.callAPI(prompt, 8192, true);
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
