// ===== Storage =====
const storage = {
    ARTICLES_KEY: 'jp_articles',
    getArticles() {
        try { return JSON.parse(localStorage.getItem(this.ARTICLES_KEY) || '[]'); }
        catch (e) { return []; }
    },
    saveArticle(article) {
        const articles = this.getArticles();
        article.id = article.id || Date.now().toString();
        article.savedAt = article.savedAt || new Date().toISOString();
        articles.unshift(article);
        localStorage.setItem(this.ARTICLES_KEY, JSON.stringify(articles));
    },
    deleteArticle(id) {
        const articles = this.getArticles().filter(a => a.id !== id);
        localStorage.setItem(this.ARTICLES_KEY, JSON.stringify(articles));
    },
    getArticle(id) {
        return this.getArticles().find(a => a.id === id);
    }
};

function showToast(msg, type = 'info') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 300); }, 3000);
}

(function() {
    let currentResult = null;

    // ===== Auth =====
    function initAuth() {
        const loading = document.getElementById('loading-screen');
        const login = document.getElementById('login-screen');
        const app = document.getElementById('app');

        firebase.auth().onAuthStateChanged(user => {
            loading.classList.add('hidden');
            if (user) {
                login.classList.add('hidden');
                app.classList.remove('hidden');
                document.getElementById('user-avatar').src = user.photoURL || '';
                document.getElementById('user-name').textContent = user.displayName || 'User';
                loadHistory();
                updateStats();
                updateGameCounts();
            } else {
                login.classList.remove('hidden');
                app.classList.add('hidden');
            }
        });

        document.getElementById('google-login-btn').addEventListener('click', () => {
            firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => showToast(e.message, 'error'));
        });
        document.getElementById('logout-btn').addEventListener('click', () => {
            if (confirm('確定登出？')) firebase.auth().signOut();
        });
    }

    // ===== Navigation =====
    function initNavigation() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => switchView(btn.dataset.view));
        });
        document.getElementById('sidebar-toggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('collapsed');
        });
    }

    function switchView(view) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.nav-btn[data-view="${view}"]`)?.classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById(`view-${view}`)?.classList.remove('hidden');
    }

    // ===== Workspace =====
    function initWorkspace() {
        // Tab 切換
        document.querySelectorAll('.input-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.input-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('url-input-area').classList.toggle('hidden', tab.dataset.input !== 'url');
            });
        });

        // 擷取網址
        document.getElementById('fetch-url-btn')?.addEventListener('click', async () => {
            const url = document.getElementById('url-input').value.trim();
            if (!url) return showToast('請輸入網址', 'error');
            const btn = document.getElementById('fetch-url-btn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 擷取中...';
            try {
                const text = await gemini.fetchUrlContent(url);
                document.getElementById('text-input').value = text;
                showToast('網頁內容已擷取', 'success');
            } catch (e) {
                showToast(e.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-download"></i> 擷取網頁';
            }
        });

        // 開始分析
        document.getElementById('start-analyze-btn').addEventListener('click', startAnalyze);

        // 複製 prompt
        document.getElementById('copy-translate-prompt').addEventListener('click', () => {
            copyText(document.getElementById('translate-prompt').textContent);
        });
        document.getElementById('copy-analysis-prompt').addEventListener('click', () => {
            copyText(document.getElementById('analysis-prompt').textContent);
        });

        // 送出
        document.getElementById('submit-translate').addEventListener('click', submitTranslate);
        document.getElementById('submit-analysis').addEventListener('click', submitAnalysis);

        // 儲存 & 重置
        document.getElementById('save-note-btn').addEventListener('click', saveNote);
        document.getElementById('reset-workspace-btn').addEventListener('click', resetWorkspace);
    }

    function copyText(text) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('已複製到剪貼簿', 'success');
        }).catch(() => showToast('複製失敗', 'error'));
    }

    function startAnalyze() {
        const text = document.getElementById('text-input').value.trim();
        if (!text) return showToast('請輸入日文內容', 'error');
        if (text.length < 10) return showToast('內容太短', 'error');

        const difficulty = document.getElementById('difficulty-select').value;

        // 產生 prompt
        document.getElementById('translate-prompt').textContent = gemini.buildTranslatePrompt(text);
        document.getElementById('analysis-prompt').textContent = gemini.buildAnalysisPrompt(text, difficulty);

        // 顯示步驟 1
        document.getElementById('workspace-placeholder').classList.add('hidden');
        document.getElementById('step-translate').classList.remove('hidden');
        document.getElementById('step-analysis').classList.add('hidden');
        document.getElementById('step-result').classList.add('hidden');

        // 清空
        document.getElementById('translate-result').value = '';
        document.getElementById('analysis-result').value = '';
        document.getElementById('translate-error').classList.add('hidden');
        document.getElementById('analysis-error').classList.add('hidden');

        // 複製翻譯 prompt + 開 AI Studio
        copyText(document.getElementById('translate-prompt').textContent);
        window.open('https://aistudio.google.com/app/prompts/new_chat', '_blank');
    }

    function submitTranslate() {
        const raw = document.getElementById('translate-result').value.trim();
        if (!raw) return showToast('請貼上 AI 的翻譯結果', 'error');

        const errEl = document.getElementById('translate-error');
        try {
            currentResult = currentResult || {};
            currentResult.paragraphs = gemini.parseJSON(raw);
            errEl.classList.add('hidden');

            // 進入步驟 2
            document.getElementById('step-analysis').classList.remove('hidden');
            copyText(document.getElementById('analysis-prompt').textContent);
            showToast('翻譯解析成功，分析 Prompt 已複製', 'success');
            document.getElementById('step-analysis').scrollIntoView({ behavior: 'smooth' });
        } catch (e) {
            errEl.classList.remove('hidden');
            errEl.textContent = '解析失敗：' + e.message;
        }
    }

    function submitAnalysis() {
        const raw = document.getElementById('analysis-result').value.trim();
        if (!raw) return showToast('請貼上 AI 的分析結果', 'error');

        const errEl = document.getElementById('analysis-error');
        try {
            const analysis = gemini.parseJSON(raw);
            errEl.classList.add('hidden');

            currentResult = {
                ...currentResult,
                title: analysis.title || '未命名',
                difficulty: analysis.difficulty || 'N3',
                summary: analysis.summary || '',
                vocabulary: analysis.vocabulary || [],
                grammar: analysis.grammar || [],
                sentences: analysis.sentences || [],
                originalText: document.getElementById('text-input').value.trim()
            };

            document.getElementById('step-result').classList.remove('hidden');
            renderResult(currentResult);
            showToast('分析完成！', 'success');
            document.getElementById('step-result').scrollIntoView({ behavior: 'smooth' });
        } catch (e) {
            errEl.classList.remove('hidden');
            errEl.textContent = '解析失敗：' + e.message;
        }
    }

    function saveNote() {
        if (!currentResult) return showToast('沒有可儲存的結果', 'error');
        storage.saveArticle({ ...currentResult });
        showToast('已儲存！', 'success');
        document.getElementById('save-note-btn').innerHTML = '<i class="fas fa-check"></i> 已儲存';
        document.getElementById('save-note-btn').disabled = true;
        loadHistory();
        updateStats();
        updateGameCounts();
    }

    function resetWorkspace() {
        currentResult = null;
        document.getElementById('workspace-placeholder').classList.remove('hidden');
        document.getElementById('step-translate').classList.add('hidden');
        document.getElementById('step-analysis').classList.add('hidden');
        document.getElementById('step-result').classList.add('hidden');
        document.getElementById('translate-result').value = '';
        document.getElementById('analysis-result').value = '';
        document.getElementById('save-note-btn').innerHTML = '<i class="fas fa-save"></i> 儲存筆記';
        document.getElementById('save-note-btn').disabled = false;
    }

    // ===== Render Result =====
    function renderResult(data) {
        renderTranslation(data.paragraphs || []);
        renderVocabulary(data.vocabulary || []);
        renderGrammar(data.grammar || []);
        renderSentences(data.sentences || []);
    }

    function renderTranslation(paragraphs) {
        const controls = document.getElementById('translation-controls');
        const content = document.getElementById('translation-content');

        controls.innerHTML = `
            <button class="trans-mode-btn active" data-mode="parallel">對照</button>
            <button class="trans-mode-btn" data-mode="original">原文</button>
            <button class="trans-mode-btn" data-mode="translation">翻譯</button>
        `;

        function render(mode) {
            content.innerHTML = paragraphs.map(p => {
                const speaker = p.speaker ? `<div class="speaker-tag">${p.speaker}</div>` : '';
                const lines = (p.lines || []).map(l => {
                    if (mode === 'original') return `<div class="line-original">${l.original}</div>`;
                    if (mode === 'translation') return `<div class="line-translation">${l.translation}</div>`;
                    return `<div class="line-pair"><div class="line-original">${l.original}</div><div class="line-translation">${l.translation}</div></div>`;
                }).join('');
                return `<div class="paragraph-block">${speaker}${lines}</div>`;
            }).join('');
        }

        render('parallel');
        controls.querySelectorAll('.trans-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                controls.querySelectorAll('.trans-mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                render(btn.dataset.mode);
            });
        });
    }

    function renderVocabulary(vocab) {
        document.getElementById('vocab-count').textContent = vocab.length;
        document.getElementById('vocab-list').innerHTML = vocab.map(v => `
            <div class="vocab-card">
                <div class="vocab-word">${v.word}</div>
                <div class="vocab-reading">${v.reading || ''}</div>
                <div class="vocab-meaning">${v.meaning}</div>
                <div class="vocab-meta">
                    <span class="vocab-pos">${v.pos || ''}</span>
                    <span class="vocab-level">${v.level || ''}</span>
                </div>
                ${v.example ? `<div class="vocab-example"><div class="example-jp">${v.example}</div><div class="example-zh">${v.example_translation || ''}</div></div>` : ''}
            </div>
        `).join('');
    }

    function renderGrammar(grammar) {
        document.getElementById('grammar-count').textContent = grammar.length;
        document.getElementById('grammar-list').innerHTML = grammar.map(g => `
            <div class="grammar-card">
                <div class="grammar-pattern">${g.pattern}</div>
                <div class="grammar-meaning">${g.meaning}</div>
                <div class="grammar-meta">
                    <span class="grammar-level">${g.level || ''}</span>
                    <span class="grammar-structure">${g.structure || ''}</span>
                </div>
                ${g.example ? `<div class="grammar-example"><div class="example-jp">${g.example}</div><div class="example-zh">${g.example_translation || ''}</div></div>` : ''}
            </div>
        `).join('');
    }

    function renderSentences(sentences) {
        document.getElementById('sentences-list').innerHTML = sentences.map(s => `
            <div class="sentence-card">
                <div class="sentence-jp">${s.japanese}</div>
                <div class="sentence-zh">${s.translation}</div>
                ${s.note ? `<div class="sentence-note">${s.note}</div>` : ''}
            </div>
        `).join('');
    }

    // ===== History =====
    function loadHistory() {
        const list = document.getElementById('history-list');
        const articles = storage.getArticles();
        if (articles.length === 0) {
            list.innerHTML = '<div class="history-empty">還沒有筆記</div>';
            return;
        }
        list.innerHTML = articles.map(a => `
            <div class="history-item" data-id="${a.id}">
                <div class="history-title">${a.title || '未命名'}</div>
                <div class="history-meta">
                    <span class="history-level">${a.difficulty || ''}</span>
                    <span class="history-date">${new Date(a.savedAt).toLocaleDateString()}</span>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => showDetail(item.dataset.id));
        });
    }

    function showDetail(id) {
        const article = storage.getArticle(id);
        if (!article) return showToast('找不到筆記', 'error');

        switchView('detail');
        const content = document.getElementById('detail-content');
        content.innerHTML = `
            <h2>${article.title || '未命名'}</h2>
            <div class="detail-meta">
                <span class="detail-level">${article.difficulty || ''}</span>
                <span class="detail-date">${new Date(article.savedAt).toLocaleDateString()}</span>
            </div>
            <div class="detail-section">
                <h3><i class="fas fa-language"></i> 原文與翻譯</h3>
                <div id="detail-translation" class="translation-content"></div>
            </div>
            <div class="detail-section">
                <h3><i class="fas fa-book"></i> 單字 (${(article.vocabulary || []).length})</h3>
                <div id="detail-vocab" class="vocab-list"></div>
            </div>
            <div class="detail-section">
                <h3><i class="fas fa-puzzle-piece"></i> 文法 (${(article.grammar || []).length})</h3>
                <div id="detail-grammar" class="grammar-list"></div>
            </div>
            <div class="detail-section">
                <h3><i class="fas fa-comment-dots"></i> 重點例句</h3>
                <div id="detail-sentences" class="sentences-list"></div>
            </div>
        `;

        // 翻譯
        document.getElementById('detail-translation').innerHTML = (article.paragraphs || []).map(p => {
            const speaker = p.speaker ? `<div class="speaker-tag">${p.speaker}</div>` : '';
            const lines = (p.lines || []).map(l => `<div class="line-pair"><div class="line-original">${l.original}</div><div class="line-translation">${l.translation}</div></div>`).join('');
            return `<div class="paragraph-block">${speaker}${lines}</div>`;
        }).join('');

        // 單字
        document.getElementById('detail-vocab').innerHTML = (article.vocabulary || []).map(v => `
            <div class="vocab-card"><div class="vocab-word">${v.word}</div><div class="vocab-reading">${v.reading || ''}</div><div class="vocab-meaning">${v.meaning}</div><div class="vocab-meta"><span class="vocab-pos">${v.pos || ''}</span><span class="vocab-level">${v.level || ''}</span></div></div>
        `).join('');

        // 文法
        document.getElementById('detail-grammar').innerHTML = (article.grammar || []).map(g => `
            <div class="grammar-card"><div class="grammar-pattern">${g.pattern}</div><div class="grammar-meaning">${g.meaning}</div><div class="grammar-meta"><span class="grammar-level">${g.level || ''}</span></div></div>
        `).join('');

        // 例句
        document.getElementById('detail-sentences').innerHTML = (article.sentences || []).map(s => `
            <div class="sentence-card"><div class="sentence-jp">${s.japanese}</div><div class="sentence-zh">${s.translation}</div>${s.note ? `<div class="sentence-note">${s.note}</div>` : ''}</div>
        `).join('');

        document.getElementById('delete-note-btn').onclick = () => {
            if (confirm('確定刪除此筆記？')) {
                storage.deleteArticle(id);
                showToast('已刪除', 'success');
                loadHistory(); updateStats(); updateGameCounts();
                switchView('input');
            }
        };
        document.getElementById('back-to-list').onclick = () => switchView('input');
    }

    // ===== Stats =====
    function updateStats() {
        const articles = storage.getArticles();
        let totalVocab = 0, totalGrammar = 0;
        articles.forEach(a => {
            totalVocab += (a.vocabulary || []).length;
            totalGrammar += (a.grammar || []).length;
        });
        document.getElementById('stat-notes').textContent = articles.length;
        document.getElementById('stat-vocab').textContent = totalVocab;
        document.getElementById('stat-grammar').textContent = totalGrammar;
    }

    function updateGameCounts() {
        const articles = storage.getArticles();
        let vocabCount = 0;
        articles.forEach(a => vocabCount += (a.vocabulary || []).length);
        document.getElementById('flashcard-count').textContent = vocabCount + ' 個單字';
        document.getElementById('quiz-count').textContent = vocabCount + ' 題可用';
        document.getElementById('typing-count').textContent = vocabCount + ' 個單字';
        document.getElementById('matching-count').textContent = Math.min(vocabCount, 10) + ' 組可用';
    }

    // ===== History Search =====
    function initHistorySearch() {
        document.getElementById('history-search')?.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            document.querySelectorAll('.history-item').forEach(item => {
                const title = item.querySelector('.history-title')?.textContent.toLowerCase() || '';
                item.style.display = title.includes(q) ? '' : 'none';
            });
        });
    }

    // ===== Settings =====
    function initSettings() {
        document.getElementById('add-api-key')?.addEventListener('click', () => {
            const name = document.getElementById('key-name-input').value.trim() || '預設';
            const key = document.getElementById('key-value-input').value.trim();
            if (!key) return showToast('請輸入 API Key', 'error');
            gemini.addKey(name, key);
            document.getElementById('key-name-input').value = '';
            document.getElementById('key-value-input').value = '';
            renderApiKeys();
            showToast('API Key 已新增', 'success');
        });

        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.body.dataset.theme = btn.dataset.theme;
                localStorage.setItem('jp_theme', btn.dataset.theme);
            });
        });

        const savedTheme = localStorage.getItem('jp_theme') || 'dark';
        document.body.dataset.theme = savedTheme;
        document.querySelector(`.theme-btn[data-theme="${savedTheme}"]`)?.classList.add('active');
        renderApiKeys();
    }

    function renderApiKeys() {
        const list = document.getElementById('api-key-list');
        if (!list) return;
        const keys = gemini.getKeys();
        if (keys.length === 0) {
            list.innerHTML = '<div class="no-keys">尚未新增 API Key</div>';
            return;
        }
        list.innerHTML = keys.map(k => `
            <div class="api-key-item ${k.active ? 'active' : ''}">
                <span class="key-name">${k.name}</span>
                <span class="key-value">${k.key}</span>
                <div class="key-actions">
                    ${!k.active ? `<button class="key-activate" data-id="${k.id}">啟用</button>` : '<span class="key-active-badge">使用中</span>'}
                    <button class="key-delete" data-id="${k.id}">刪除</button>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.key-activate').forEach(btn => {
            btn.addEventListener('click', () => { gemini.setActiveKey(btn.dataset.id); renderApiKeys(); });
        });
        list.querySelectorAll('.key-delete').forEach(btn => {
            btn.addEventListener('click', () => { gemini.removeKey(btn.dataset.id); renderApiKeys(); });
        });
    }

    // ===== Init =====
    document.addEventListener('DOMContentLoaded', () => {
        initAuth();
        initNavigation();
        initWorkspace();
        initHistorySearch();
        initSettings();
    });
})();
