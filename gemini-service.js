class GeminiService {
    constructor() {
        this.apiKey = localStorage.getItem('gemini_api_key') || '';
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
    }

    setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem('gemini_api_key', key);
    }

    getApiKey() {
        return this.apiKey;
    }

    async analyze(text, difficulty = 'auto') {
        if (!this.apiKey) {
            throw new Error('請先在設定頁面填入 Gemini API Key');
        }

        const prompt = `你是一位專業的日文教師。請分析以下日文文本，並以 JSON 格式回傳結果。

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
            "original": "原文段落",
            "translation": "中文翻譯"
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

要求：
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
            `https://corsproxy.io/?${encodeURIComponent(url)}`,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
        ];

        let html = '';
        for (const proxyUrl of proxies) {
            try {
                const response = await fetch(proxyUrl);
                if (response.ok) {
                    html = await response.text();
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!html) {
            throw new Error('無法取得網頁內容，請改用文本輸入，直接複製網頁文字貼上');
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 移除不需要的元素
        doc.querySelectorAll('script, style, nav, header, footer, iframe, noscript').forEach(el => el.remove());

        // 取得主要文字內容
        const article = doc.querySelector('article') || doc.querySelector('main') || doc.body;
        const text = article.innerText || article.textContent || '';

        // 清理空白行，取前 3000 字
        const cleaned = text.replace(/\n{3,}/g, '\n\n').trim().slice(0, 3000);

        if (cleaned.length < 20) {
            throw new Error('網頁內容太少，請改用文本輸入');
        }

        return cleaned;
    }
}

const gemini = new GeminiService();
