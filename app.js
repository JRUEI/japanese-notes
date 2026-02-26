const storage = {
    ARTICLES_KEY: 'jp_articles',
    FOLDERS_KEY: 'jp_folders',
    getArticles() {
        try { return JSON.parse(localStorage.getItem(this.ARTICLES_KEY) || '[]'); } catch { return []; }
    },
    saveArticle(a) {
        const list = this.getArticles();
        a.id = a.id || Date.now().toString();
        a.savedAt = a.savedAt || new Date().toISOString();
        list.unshift(a);
        localStorage.setItem(this.ARTICLES_KEY, JSON.stringify(list));
    },
    deleteArticle(id) {
        localStorage.setItem(this.ARTICLES_KEY, JSON.stringify(this.getArticles().filter(a => a.id !== id)));
    },
    getArticle(id) { return this.getArticles().find(a => a.id === id); },
    getAllTags() {
        const s = new Set();
        this.getArticles().forEach(a => (a.tags || []).forEach(t => s.add(t)));
        return [...s].sort();
    },
    getFolders() {
        try { return JSON.parse(localStorage.getItem(this.FOLDERS_KEY) || '[]'); } catch { return []; }
    },
    addFolder(name) {
        const f = this.getFolders();
        if (!f.includes(name)) { f.push(name); f.sort(); localStorage.setItem(this.FOLDERS_KEY, JSON.stringify(f)); }
    },
    deleteFolder(name) {
        localStorage.setItem(this.FOLDERS_KEY, JSON.stringify(this.getFolders().filter(f => f !== name)));
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
    let currentTags = [];
    let sourceUrl = '';
    let filterMode = 'all';
    let filterValue = '';

    function initAuth() {
        firebase.auth().onAuthStateChanged(user => {
            document.getElementById('loading-screen').classList.add('hidden');
            if (user) {
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('app').classList.remove('hidden');
                document.getElementById('user-avatar').src = user.photoURL || '';
                document.getElementById('user-name').textContent = user.displayName || 'User';
                refresh();
            } else {
                document.getElementById('login-screen').classList.remove('hidden');
                document.getElementById('app').classList.add('hidden');
            }
        });
        document.getElementById('google-login-btn').addEventListener('click', () => {
            firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => showToast(e.message, 'error'));
        });
        document.getElementById('logout-btn').addEventListener('click', () => { if (confirm('確定登出？')) firebase.auth().signOut(); });
    }

    function refresh() {
        loadHistory();
        updateStats();
        updateGameCounts();
        refreshFolderList();
        refreshTagCloud();
        refreshFolderSelect();
        refreshRecentTags();
    }

    function initNav() {
        document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
        document.getElementById('sidebar-toggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('collapsed'));
    }

    function switchView(v) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.nav-btn[data-view="${v}"]`)?.classList.add('active');
        document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
        document.getElementById(`view-${v}`)?.classList.remove('hidden');
    }

    // ===== Filter =====
    function initFilter() {
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                filterMode = tab.dataset.filter;
                filterValue = '';
                document.getElementById('filter-folder-area').classList.toggle('hidden', filterMode !== 'folder');
                document.getElementById('filter-tag-area').classList.toggle('hidden', filterMode !== 'tag');
                refreshFolderList();
                refreshTagCloud();
                loadHistory();
            });
        });

        document.getElementById('add-folder-btn')?.addEventListener('click', addNewFolder);
        document.getElementById('new-folder-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addNewFolder(); } });
    }

    function addNewFolder() {
        const input = document.getElementById('new-folder-input');
        const name = input.value.trim();
        if (!name) return showToast('請輸入名稱', 'error');
        storage.addFolder(name);
        input.value = '';
        refreshFolderList();
        refreshFolderSelect();
        showToast(`「${name}」已建立`, 'success');
    }

    function refreshFolderList() {
        const el = document.getElementById('folder-list');
        if (!el) return;
        const folders = storage.getFolders();
        const articles = storage.getArticles();
        if (!folders.length) { el.innerHTML = '<div class="filter-empty">還沒有資料夾</div>'; return; }

        el.innerHTML = folders.map(f => {
            const count = articles.filter(a => a.folder === f).length;
            const active = filterMode === 'folder' && filterValue === f;
            return `<div class="filter-item ${active ? 'active' : ''}" data-value="${f}">
                <i class="fas fa-folder${active ? '-open' : ''}"></i>
                <span class="filter-item-name">${f}</span>
                <span class="filter-item-count">${count}</span>
                <button class="filter-item-del" data-value="${f}"><i class="fas fa-times"></i></button>
            </div>`;
        }).join('');

        el.querySelectorAll('.filter-item').forEach(item => {
            item.addEventListener('click', e => {
                if (e.target.closest('.filter-item-del')) return;
                filterValue = filterValue === item.dataset.value ? '' : item.dataset.value;
                refreshFolderList();
                loadHistory();
            });
        });
        el.querySelectorAll('.filter-item-del').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                if (confirm(`刪除資料夾「${btn.dataset.value}」？`)) {
                    storage.deleteFolder(btn.dataset.value);
                    if (filterValue === btn.dataset.value) filterValue = '';
                    refreshFolderList();
                    refreshFolderSelect();
                    loadHistory();
                }
            });
        });
    }

    function refreshTagCloud() {
        const el = document.getElementById('tag-cloud');
        if (!el) return;
        const tags = storage.getAllTags();
        if (!tags.length) { el.innerHTML = '<div class="filter-empty">還沒有標籤</div>'; return; }

        const articles = storage.getArticles();
        el.innerHTML = tags.map(t => {
            const count = articles.filter(a => (a.tags || []).includes(t)).length;
            const active = filterMode === 'tag' && filterValue === t;
            return `<span class="tag-cloud-item ${active ? 'active' : ''}" data-tag="${t}">${t} <small>${count}</small></span>`;
        }).join('');

        el.querySelectorAll('.tag-cloud-item').forEach(item => {
            item.addEventListener('click', () => {
                filterValue = filterValue === item.dataset.tag ? '' : item.dataset.tag;
                refreshTagCloud();
                loadHistory();
            });
        });
    }

    function refreshFolderSelect() {
        const sel = document.getElementById('note-folder-select');
        if (!sel) return;
        sel.innerHTML = '<option value="">不分類</option>' + storage.getFolders().map(f => `<option value="${f}">${f}</option>`).join('');
    }

    function refreshRecentTags() {
        const el = document.getElementById('recent-tags');
        if (!el) return;
        const tags = storage.getAllTags().slice(0, 15);
        if (!tags.length) { el.innerHTML = ''; return; }
        el.innerHTML = '<span class="recent-tags-label">常用：</span>' +
            tags.map(t => `<span class="recent-tag-btn" data-tag="${t}">${t}</span>`).join('');
        el.querySelectorAll('.recent-tag-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!currentTags.includes(btn.dataset.tag)) {
                    currentTags.push(btn.dataset.tag);
                    renderTags();
                }
            });
        });
    }

    // ===== Tags Input =====
    function initTags() {
        document.getElementById('tag-input').addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const tag = e.target.value.trim();
                if (tag && !currentTags.includes(tag)) { currentTags.push(tag); renderTags(); }
                e.target.value = '';
            }
        });
    }

    function renderTags() {
        const c = document.getElementById('tags-container');
        c.innerHTML = currentTags.map(t => `<span class="tag-chip">${t}<button class="tag-remove" data-tag="${t}">&times;</button></span>`).join('');
        c.querySelectorAll('.tag-remove').forEach(b => {
            b.addEventListener('click', () => { currentTags = currentTags.filter(t => t !== b.dataset.tag); renderTags(); });
        });
    }

    // ===== Workspace =====
    function initWorkspace() {
        document.querySelectorAll('.input-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.input-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('url-input-area').classList.toggle('hidden', tab.dataset.input !== 'url');
            });
        });

        document.getElementById('fetch-url-btn')?.addEventListener('click', async () => {
            const url = document.getElementById('url-input').value.trim();
            if (!url) return showToast('請輸入網址', 'error');
            const btn = document.getElementById('fetch-url-btn');
            btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 擷取中...';
            try {
                document.getElementById('text-input').value = await gemini.fetchUrlContent(url);
                sourceUrl = url;
                showToast('已擷取', 'success');
            } catch (e) { showToast(e.message, 'error'); }
            finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-download"></i> 擷取網頁'; }
        });

        document.getElementById('start-analyze-btn').addEventListener('click', startAnalyze);
        document.getElementById('copy-translate-prompt').addEventListener('click', () => copyText(document.getElementById('translate-prompt').textContent));
        document.getElementById('copy-analysis-prompt').addEventListener('click', () => copyText(document.getElementById('analysis-prompt').textContent));
        document.getElementById('submit-translate').addEventListener('click', submitTranslate);
        document.getElementById('submit-analysis').addEventListener('click', submitAnalysis);
        document.getElementById('save-note-btn').addEventListener('click', saveNote);
        document.getElementById('reset-workspace-btn').addEventListener('click', resetWorkspace);
    }

    function copyText(t) { navigator.clipboard.writeText(t).then(() => showToast('已複製', 'success')).catch(() => showToast('複製失敗', 'error')); }

    function startAnalyze() {
        const text = document.getElementById('text-input').value.trim();
        if (!text) return showToast('請輸入日文內容', 'error');
        if (text.length < 10) return showToast('內容太短', 'error');
        const urlInput = document.getElementById('url-input').value.trim();
        if (urlInput) sourceUrl = urlInput;

        document.getElementById('translate-prompt').textContent = gemini.buildTranslatePrompt(text);
        document.getElementById('analysis-prompt').textContent = gemini.buildAnalysisPrompt(text, document.getElementById('difficulty-select').value);
        document.getElementById('workspace-placeholder').classList.add('hidden');
        document.getElementById('step-translate').classList.remove('hidden');
        document.getElementById('step-analysis').classList.add('hidden');
        document.getElementById('step-result').classList.add('hidden');
        document.getElementById('translate-result').value = '';
        document.getElementById('analysis-result').value = '';
        document.getElementById('translate-error').classList.add('hidden');
        document.getElementById('analysis-error').classList.add('hidden');
        copyText(document.getElementById('translate-prompt').textContent);
        window.open('https://aistudio.google.com/app/prompts/new_chat', '_blank');
    }

    function submitTranslate() {
        const raw = document.getElementById('translate-result').value.trim();
        if (!raw) return showToast('請貼上翻譯結果', 'error');
        try {
            currentResult = currentResult || {};
            currentResult.paragraphs = gemini.parseJSON(raw);
            document.getElementById('translate-error').classList.add('hidden');
            document.getElementById('step-analysis').classList.remove('hidden');
            copyText(document.getElementById('analysis-prompt').textContent);
            showToast('翻譯解析成功，分析 Prompt 已複製', 'success');
            document.getElementById('step-analysis').scrollIntoView({ behavior: 'smooth' });
        } catch (e) {
            const err = document.getElementById('translate-error');
            err.classList.remove('hidden'); err.textContent = '解析失敗：' + e.message;
        }
    }

    function submitAnalysis() {
        const raw = document.getElementById('analysis-result').value.trim();
        if (!raw) return showToast('請貼上分析結果', 'error');
        try {
            const a = gemini.parseJSON(raw);
            document.getElementById('analysis-error').classList.add('hidden');
            currentResult = {
                ...currentResult,
                title: a.title || '未命名', difficulty: a.difficulty || 'N3', summary: a.summary || '',
                vocabulary: a.vocabulary || [], grammar: a.grammar || [], sentences: a.sentences || [],
                originalText: document.getElementById('text-input').value.trim()
            };

            document.getElementById('note-title-input').value = currentResult.title;
            refreshFolderSelect();

            if (sourceUrl) {
                document.getElementById('note-source-url').classList.remove('hidden');
                const link = document.getElementById('note-url-link');
                link.href = sourceUrl; link.textContent = sourceUrl;
            } else { document.getElementById('note-source-url').classList.add('hidden'); }

            currentTags = [];
            renderTags();
            refreshRecentTags();

            document.getElementById('step-result').classList.remove('hidden');
            renderResult(currentResult);
            showToast('分析完成！', 'success');
            document.getElementById('step-result').scrollIntoView({ behavior: 'smooth' });
        } catch (e) {
            const err = document.getElementById('analysis-error');
            err.classList.remove('hidden'); err.textContent = '解析失敗：' + e.message;
        }
    }

    function saveNote() {
        if (!currentResult) return showToast('沒有可儲存的結果', 'error');
        const title = document.getElementById('note-title-input').value.trim();
        if (title) currentResult.title = title;

        let folder = document.getElementById('note-new-folder').value.trim();
        if (folder) { storage.addFolder(folder); } else { folder = document.getElementById('note-folder-select').value; }
        currentResult.folder = folder || '';
        currentResult.tags = [...currentTags];
        currentResult.sourceUrl = sourceUrl || '';

        storage.saveArticle({ ...currentResult });
        showToast('已儲存！', 'success');
        document.getElementById('save-note-btn').innerHTML = '<i class="fas fa-check"></i> 已儲存';
        document.getElementById('save-note-btn').disabled = true;
        refresh();
    }

    function resetWorkspace() {
        currentResult = null; currentTags = []; sourceUrl = '';
        document.getElementById('workspace-placeholder').classList.remove('hidden');
        ['step-translate', 'step-analysis', 'step-result'].forEach(id => document.getElementById(id).classList.add('hidden'));
        document.getElementById('translate-result').value = '';
        document.getElementById('analysis-result').value = '';
        document.getElementById('note-title-input').value = '';
        document.getElementById('note-new-folder').value = '';
        document.getElementById('save-note-btn').innerHTML = '<i class="fas fa-save"></i> 儲存筆記';
        document.getElementById('save-note-btn').disabled = false;
        renderTags();
    }

    // ===== Render =====
    function renderResult(d) {
        renderTranslation(d.paragraphs || []);
        renderVocab(d.vocabulary || []);
        renderGrammar(d.grammar || []);
        renderSentences(d.sentences || []);
    }

    function renderTranslation(paragraphs) {
        const ctrl = document.getElementById('translation-controls');
        const cont = document.getElementById('translation-content');
        ctrl.innerHTML = ['parallel', 'original', 'translation'].map((m, i) =>
            `<button class="trans-mode-btn ${i === 0 ? 'active' : ''}" data-mode="${m}">${['對照', '原文', '翻譯'][i]}</button>`
        ).join('');

        function render(mode) {
            cont.innerHTML = paragraphs.map(p => {
                const sp = p.speaker ? `<div class="speaker-tag">${p.speaker}</div>` : '';
                const lines = (p.lines || []).map(l => {
                    if (mode === 'original') return `<div class="line-original">${l.original}</div>`;
                    if (mode === 'translation') return `<div class="line-translation">${l.translation}</div>`;
                    return `<div class="line-pair"><div class="line-original">${l.original}</div><div class="line-translation">${l.translation}</div></div>`;
                }).join('');
                return `<div class="paragraph-block">${sp}${lines}</div>`;
            }).join('');
        }
        render('parallel');
        ctrl.querySelectorAll('.trans-mode-btn').forEach(b => b.addEventListener('click', () => {
            ctrl.querySelectorAll('.trans-mode-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active'); render(b.dataset.mode);
        }));
    }

    function renderVocab(vocab) {
        document.getElementById('vocab-count').textContent = vocab.length;
        document.getElementById('vocab-list').innerHTML = vocab.map(v => `
            <div class="vocab-card">
                <div class="vocab-word">${v.word}</div>
                <div class="vocab-reading">${v.reading || ''}</div>
                <div class="vocab-meaning">${v.meaning}</div>
                <div class="vocab-meta"><span class="vocab-pos">${v.pos || ''}</span><span class="vocab-level">${v.level || ''}</span></div>
                ${v.example ? `<div class="vocab-example"><div class="example-jp">${v.example}</div><div class="example-zh">${v.example_translation || ''}</div></div>` : ''}
            </div>`).join('');
    }

    function renderGrammar(grammar) {
        document.getElementById('grammar-count').textContent = grammar.length;
        document.getElementById('grammar-list').innerHTML = grammar.map(g => `
            <div class="grammar-card">
                <div class="grammar-pattern">${g.pattern}</div>
                <div class="grammar-meaning">${g.meaning}</div>
                <div class="grammar-meta"><span class="grammar-level">${g.level || ''}</span><span class="grammar-structure">${g.structure || ''}</span></div>
                ${g.example ? `<div class="grammar-example"><div class="example-jp">${g.example}</div><div class="example-zh">${g.example_translation || ''}</div></div>` : ''}
            </div>`).join('');
    }

    function renderSentences(sentences) {
        document.getElementById('sentences-list').innerHTML = sentences.map(s => `
            <div class="sentence-card">
                <div class="sentence-jp">${s.japanese}</div>
                <div class="sentence-zh">${s.translation}</div>
                ${s.note ? `<div class="sentence-note">${s.note}</div>` : ''}
            </div>`).join('');
    }

    // ===== History =====
    function loadHistory() {
        const list = document.getElementById('history-list');
        let articles = storage.getArticles();

        if (filterMode === 'folder' && filterValue) articles = articles.filter(a => a.folder === filterValue);
        else if (filterMode === 'tag' && filterValue) articles = articles.filter(a => (a.tags || []).includes(filterValue));

        if (!articles.length) { list.innerHTML = '<div class="history-empty">還沒有筆記</div>'; return; }

        list.innerHTML = articles.map(a => {
            const tags = (a.tags || []).map(t => `<span class="history-tag">${t}</span>`).join('');
            const folder = a.folder ? `<span class="history-folder"><i class="fas fa-folder"></i> ${a.folder}</span>` : '';
            return `<div class="history-item" data-id="${a.id}">
                <div class="history-title">${a.title || '未命名'}</div>
                <div class="history-meta">
                    <span class="history-level">${a.difficulty || ''}</span>
                    <span class="history-date">${new Date(a.savedAt).toLocaleDateString()}</span>
                    ${folder}
                </div>
                ${tags ? `<div class="history-tags">${tags}</div>` : ''}
            </div>`;
        }).join('');

        list.querySelectorAll('.history-item').forEach(item => item.addEventListener('click', () => showDetail(item.dataset.id)));
    }

    function showDetail(id) {
        const a = storage.getArticle(id);
        if (!a) return showToast('找不到筆記', 'error');
        switchView('detail');
        const c = document.getElementById('detail-content');
        const tags = (a.tags || []).map(t => `<span class="detail-tag">${t}</span>`).join('');
        const folder = a.folder ? `<span class="detail-folder"><i class="fas fa-folder"></i> ${a.folder}</span>` : '';
        const url = a.sourceUrl ? `<div class="detail-source"><i class="fas fa-link"></i> <a href="${a.sourceUrl}" target="_blank">${a.sourceUrl}</a></div>` : '';

        c.innerHTML = `
            <h2>${a.title || '未命名'}</h2>
            <div class="detail-meta"><span class="detail-level">${a.difficulty || ''}</span><span class="detail-date">${new Date(a.savedAt).toLocaleDateString()}</span>${folder}</div>
            ${tags ? `<div class="detail-tags">${tags}</div>` : ''}
            ${url}
            <div class="detail-section"><h3><i class="fas fa-language"></i> 原文與翻譯</h3><div id="detail-translation" class="translation-content"></div></div>
            <div class="detail-section"><h3><i class="fas fa-book"></i> 單字 (${(a.vocabulary || []).length})</h3><div id="detail-vocab" class="vocab-list"></div></div>
            <div class="detail-section"><h3><i class="fas fa-puzzle-piece"></i> 文法 (${(a.grammar || []).length})</h3><div id="detail-grammar" class="grammar-list"></div></div>
            <div class="detail-section"><h3><i class="fas fa-comment-dots"></i> 重點例句</h3><div id="detail-sentences" class="sentences-list"></div></div>
        `;

        document.getElementById('detail-translation').innerHTML = (a.paragraphs || []).map(p => {
            const sp = p.speaker ? `<div class="speaker-tag">${p.speaker}</div>` : '';
            const lines = (p.lines || []).map(l => `<div class="line-pair"><div class="line-original">${l.original}</div><div class="line-translation">${l.translation}</div></div>`).join('');
            return `<div class="paragraph-block">${sp}${lines}</div>`;
block">${sp}${lines}</div>`;
        }).join('');

        document.getElementById('detail-vocab').innerHTML = (a.vocabulary || []).map(v => `
            <div class="vocab-card"><div class="vocab-word">${v.word}</div><div class="vocab-reading">${v.reading || ''}</div><div class="vocab-meaning">${v.meaning}</div>
            <div class="vocab-meta"><span class="vocab-pos">${v.pos || ''}</span><span class="vocab-level">${v.level || ''}</span></div></div>
        `).join('');

        document.getElementById('detail-grammar').innerHTML = (a.grammar || []).map(g => `
            <div class="grammar-card"><div class="grammar-pattern">${g.pattern}</div><div class="grammar-meaning">${g.meaning}</div>
            <div class="grammar-meta"><span class="grammar-level">${g.level || ''}</span></div></div>
        `).join('');

        document.getElementById('detail-sentences').innerHTML = (a.sentences || []).map(s => `
            <div class="sentence-card"><div class="sentence-jp">${s.japanese}</div><div class="sentence-zh">${s.translation}</div>
            ${s.note ? `<div class="sentence-note">${s.note}</div>` : ''}</div>
        `).join('');

        document.getElementById('delete-note-btn').onclick = () => {
            if (confirm('確定刪除？')) { storage.deleteArticle(id); showToast('已刪除', 'success'); refresh(); switchView('input'); }
        };
        document.getElementById('back-to-list').onclick = () => switchView('input');
    }

    // ===== Search =====
    function initSearch() {
        document.getElementById('history-search')?.addEventListener('input', e => {
            const q = e.target.value.toLowerCase();
            document.querySelectorAll('.history-item').forEach(item => {
                const text = (item.querySelector('.history-title')?.textContent || '') +
                    (item.querySelector('.history-tags')?.textContent || '') +
                    (item.querySelector('.history-folder')?.textContent || '');
                item.style.display = text.toLowerCase().includes(q) ? '' : 'none';
            });
        });
    }

    // ===== Stats =====
    function updateStats() {
        const articles = storage.getArticles();
        let v = 0, g = 0;
        articles.forEach(a => { v += (a.vocabulary || []).length; g += (a.grammar || []).length; });
        document.getElementById('stat-notes').textContent = articles.length;
        document.getElementById('stat-vocab').textContent = v;
        document.getElementById('stat-grammar').textContent = g;
    }

    function updateGameCounts() {
        const articles = storage.getArticles();
        let vc = 0;
        articles.forEach(a => vc += (a.vocabulary || []).length);
        document.getElementById('flashcard-count').textContent = vc + ' 個單字';
        document.getElementById('quiz-count').textContent = vc + ' 題可用';
        document.getElementById('typing-count').textContent = vc + ' 個單字';
        document.getElementById('matching-count').textContent = Math.min(vc, 10) + ' 組可用';
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
            showToast('已新增', 'success');
        });

        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.body.dataset.theme = btn.dataset.theme;
                localStorage.setItem('jp_theme', btn.dataset.theme);
            });
        });

        const saved = localStorage.getItem('jp_theme') || 'dark';
        document.body.dataset.theme = saved;
        document.querySelector(`.theme-btn[data-theme="${saved}"]`)?.classList.add('active');
        renderApiKeys();
    }

    function renderApiKeys() {
        const list = document.getElementById('api-key-list');
        if (!list) return;
        const keys = gemini.getKeys();
        if (!keys.length) { list.innerHTML = '<div class="no-keys">尚未新增 API Key</div>'; return; }
        list.innerHTML = keys.map(k => `
            <div class="api-key-item ${k.active ? 'active' : ''}">
                <span class="key-name">${k.name}</span>
                <span class="key-value">${k.key.slice(0, 8)}...${k.key.slice(-4)}</span>
                <div class="key-actions">
                    ${!k.active ? `<button class="key-activate" data-id="${k.id}">啟用</button>` : '<span class="key-active-badge">使用中</span>'}
                    <button class="key-delete" data-id="${k.id}">刪除</button>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.key-activate').forEach(btn => {
            btn.addEventListener('click', () => { gemini.setActiveKey(btn.dataset.id); renderApiKeys(); showToast('已切換', 'success'); });
        });
        list.querySelectorAll('.key-delete').forEach(btn => {
            btn.addEventListener('click', () => { gemini.removeKey(btn.dataset.id); renderApiKeys(); showToast('已刪除', 'success'); });
        });
    }

    // ===== Init =====
    document.addEventListener('DOMContentLoaded', () => {
        initAuth();
        initNav();
        initFilter();
        initTags();
        initWorkspace();
        initSearch();
        initSettings();
    });
})();
