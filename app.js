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

function showToast(msg, type) {
    type = type || 'info';
    var c = document.getElementById('toast-container');
    var t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(function() { t.classList.add('fade-out'); setTimeout(function() { t.remove(); }, 300); }, 3000);
}

(function() {
    var currentResult = null;
    var currentTags = [];
    var sourceUrl = '';
    var filterMode = 'all';
    var filterValue = '';

    function initAuth() {
        firebase.auth().onAuthStateChanged(function(user) {
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
        document.getElementById('google-login-btn').addEventListener('click', function() {
            firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(function(e) { showToast(e.message, 'error'); });
        });
        document.getElementById('logout-btn').addEventListener('click', function() {
            if (confirm('確定登出？')) firebase.auth().signOut();
        });
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
        document.querySelectorAll('.nav-btn').forEach(function(b) {
            b.addEventListener('click', function() { switchView(b.dataset.view); });
        });
        document.getElementById('sidebar-toggle').addEventListener('click', function() {
            document.getElementById('sidebar').classList.toggle('collapsed');
        });
    }

    function switchView(v) {
        document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
        var btn = document.querySelector('.nav-btn[data-view="' + v + '"]');
        if (btn) btn.classList.add('active');
        document.querySelectorAll('.view').forEach(function(el) { el.classList.add('hidden'); });
        var view = document.getElementById('view-' + v);
        if (view) view.classList.remove('hidden');
    }

    function initFilter() {
        document.querySelectorAll('.filter-tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.filter-tab').forEach(function(t) { t.classList.remove('active'); });
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

        var addBtn = document.getElementById('add-folder-btn');
        if (addBtn) addBtn.addEventListener('click', addNewFolder);
        var folderInput = document.getElementById('new-folder-input');
        if (folderInput) folderInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); addNewFolder(); }
        });
    }

    function addNewFolder() {
        var input = document.getElementById('new-folder-input');
        var name = input.value.trim();
        if (!name) return showToast('請輸入名稱', 'error');
        storage.addFolder(name);
        input.value = '';
        refreshFolderList();
        refreshFolderSelect();
        showToast('「' + name + '」已建立', 'success');
    }

    function refreshFolderList() {
        var el = document.getElementById('folder-list');
        if (!el) return;
        var folders = storage.getFolders();
        var articles = storage.getArticles();
        if (!folders.length) { el.innerHTML = '<div class="filter-empty">還沒有資料夾</div>'; return; }

        el.innerHTML = folders.map(function(f) {
            var count = articles.filter(function(a) { return a.folder === f; }).length;
            var active = filterMode === 'folder' && filterValue === f;
            return '<div class="filter-item ' + (active ? 'active' : '') + '" data-value="' + f + '">' +
                '<i class="fas fa-folder' + (active ? '-open' : '') + '"></i>' +
                '<span class="filter-item-name">' + f + '</span>' +
                '<span class="filter-item-count">' + count + '</span>' +
                '<button class="filter-item-del" data-value="' + f + '"><i class="fas fa-times"></i></button>' +
                '</div>';
        }).join('');

        el.querySelectorAll('.filter-item').forEach(function(item) {
            item.addEventListener('click', function(e) {
                if (e.target.closest('.filter-item-del')) return;
                filterValue = filterValue === item.dataset.value ? '' : item.dataset.value;
                refreshFolderList();
                loadHistory();
            });
        });
        el.querySelectorAll('.filter-item-del').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (confirm('刪除資料夾「' + btn.dataset.value + '」？')) {
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
        var el = document.getElementById('tag-cloud');
        if (!el) return;
        var tags = storage.getAllTags();
        if (!tags.length) { el.innerHTML = '<div class="filter-empty">還沒有標籤</div>'; return; }
        var articles = storage.getArticles();
        el.innerHTML = tags.map(function(t) {
            var count = articles.filter(function(a) { return (a.tags || []).indexOf(t) >= 0; }).length;
            var active = filterMode === 'tag' && filterValue === t;
            return '<span class="tag-cloud-item ' + (active ? 'active' : '') + '" data-tag="' + t + '">' + t + ' <small>' + count + '</small></span>';
        }).join('');

        el.querySelectorAll('.tag-cloud-item').forEach(function(item) {
            item.addEventListener('click', function() {
                filterValue = filterValue === item.dataset.tag ? '' : item.dataset.tag;
                refreshTagCloud();
                loadHistory();
            });
        });
    }

    function refreshFolderSelect() {
        var sel = document.getElementById('note-folder-select');
        if (!sel) return;
        sel.innerHTML = '<option value="">不分類</option>' +
            storage.getFolders().map(function(f) { return '<option value="' + f + '">' + f + '</option>'; }).join('');
    }

    function refreshRecentTags() {
        var el = document.getElementById('recent-tags');
        if (!el) return;
        var tags = storage.getAllTags().slice(0, 15);
        if (!tags.length) { el.innerHTML = ''; return; }
        el.innerHTML = '<span class="recent-tags-label">常用：</span>' +
            tags.map(function(t) { return '<span class="recent-tag-btn" data-tag="' + t + '">' + t + '</span>'; }).join('');
        el.querySelectorAll('.recent-tag-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (currentTags.indexOf(btn.dataset.tag) < 0) {
                    currentTags.push(btn.dataset.tag);
                    renderTags();
                }
            });
        });
    }

    function initTags() {
        document.getElementById('tag-input').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                var tag = e.target.value.trim();
                if (tag && currentTags.indexOf(tag) < 0) { currentTags.push(tag); renderTags(); }
                e.target.value = '';
            }
        });
    }

    function renderTags() {
        var c = document.getElementById('tags-container');
        c.innerHTML = currentTags.map(function(t) {
            return '<span class="tag-chip">' + t + '<button class="tag-remove" data-tag="' + t + '">&times;</button></span>';
        }).join('');
        c.querySelectorAll('.tag-remove').forEach(function(b) {
            b.addEventListener('click', function() {
                currentTags = currentTags.filter(function(t) { return t !== b.dataset.tag; });
                renderTags();
            });
        });
    }

    function initWorkspace() {
        document.querySelectorAll('.input-tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.input-tab').forEach(function(t) { t.classList.remove('active'); });
                tab.classList.add('active');
                document.getElementById('url-input-area').classList.toggle('hidden', tab.dataset.input !== 'url');
            });
        });

        var fetchBtn = document.getElementById('fetch-url-btn');
        if (fetchBtn) fetchBtn.addEventListener('click', function() {
            var url = document.getElementById('url-input').value.trim();
            if (!url) return showToast('請輸入網址', 'error');
            fetchBtn.disabled = true;
            fetchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 擷取中...';
            gemini.fetchUrlContent(url).then(function(text) {
                document.getElementById('text-input').value = text;
                sourceUrl = url;
                showToast('已擷取', 'success');
            }).catch(function(e) {
                showToast(e.message, 'error');
            }).finally(function() {
                fetchBtn.disabled = false;
                fetchBtn.innerHTML = '<i class="fas fa-download"></i> 擷取網頁';
            });
        });

        document.getElementById('start-analyze-btn').addEventListener('click', startAnalyze);
        document.getElementById('copy-translate-prompt').addEventListener('click', function() { copyText(document.getElementById('translate-prompt').textContent); });
        document.getElementById('copy-analysis-prompt').addEventListener('click', function() { copyText(document.getElementById('analysis-prompt').textContent); });
        document.getElementById('submit-translate').addEventListener('click', submitTranslate);
        document.getElementById('submit-analysis').addEventListener('click', submitAnalysis);
        document.getElementById('save-note-btn').addEventListener('click', saveNote);
        document.getElementById('reset-workspace-btn').addEventListener('click', resetWorkspace);
    }

    function copyText(t) {
        navigator.clipboard.writeText(t).then(function() { showToast('已複製', 'success'); }).catch(function() { showToast('複製失敗', 'error'); });
    }

    function startAnalyze() {
        var text = document.getElementById('text-input').value.trim();
        if (!text) return showToast('請輸入日文內容', 'error');
        if (text.length < 10) return showToast('內容太短', 'error');
        var urlInput = document.getElementById('url-input').value.trim();
        if (urlInput) sourceUrl = urlInput;
        var difficulty = document.getElementById('difficulty-select').value;

        document.getElementById('translate-prompt').textContent = gemini.buildTranslatePrompt(text);
        document.getElementById('analysis-prompt').textContent = gemini.buildAnalysisPrompt(text, difficulty);
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
        var raw = document.getElementById('translate-result').value.trim();
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
            var err = document.getElementById('translate-error');
            err.classList.remove('hidden');
            err.textContent = '解析失敗：' + e.message;
        }
    }

    function submitAnalysis() {
        var raw = document.getElementById('analysis-result').value.trim();
        if (!raw) return showToast('請貼上分析結果', 'error');
        try {
            var a = gemini.parseJSON(raw);
            document.getElementById('analysis-error').classList.add('hidden');
            currentResult = currentResult || {};
            currentResult.title = a.title || '未命名';
            currentResult.difficulty = a.difficulty || 'N3';
            currentResult.summary = a.summary || '';
            currentResult.vocabulary = a.vocabulary || [];
            currentResult.grammar = a.grammar || [];
            currentResult.sentences = a.sentences || [];
            currentResult.originalText = document.getElementById('text-input').value.trim();

            document.getElementById('note-title-input').value = currentResult.title;
            refreshFolderSelect();

            if (sourceUrl) {
                document.getElementById('note-source-url').classList.remove('hidden');
                var link = document.getElementById('note-url-link');
                link.href = sourceUrl;
                link.textContent = sourceUrl;
            } else {
                document.getElementById('note-source-url').classList.add('hidden');
            }

            currentTags = [];
            renderTags();
            refreshRecentTags();

            document.getElementById('step-result').classList.remove('hidden');
            renderResult(currentResult);
            showToast('分析完成！', 'success');
            document.getElementById('step-result').scrollIntoView({ behavior: 'smooth' });
        } catch (e) {
            var err = document.getElementById('analysis-error');
            err.classList.remove('hidden');
            err.textContent = '解析失敗：' + e.message;
        }
    }

    function saveNote() {
        if (!currentResult) return showToast('沒有可儲存的結果', 'error');
        var title = document.getElementById('note-title-input').value.trim();
        if (title) currentResult.title = title;

        var folder = document.getElementById('note-new-folder').value.trim();
        if (folder) {
            storage.addFolder(folder);
        } else {
            folder = document.getElementById('note-folder-select').value;
        }
        currentResult.folder = folder || '';
        currentResult.tags = currentTags.slice();
        currentResult.sourceUrl = sourceUrl || '';

        storage.saveArticle(JSON.parse(JSON.stringify(currentResult)));
        showToast('已儲存！', 'success');
        document.getElementById('save-note-btn').innerHTML = '<i class="fas fa-check"></i> 已儲存';
        document.getElementById('save-note-btn').disabled = true;
        refresh();
    }

    function resetWorkspace() {
        currentResult = null;
        currentTags = [];
        sourceUrl = '';
        document.getElementById('workspace-placeholder').classList.remove('hidden');
        document.getElementById('step-translate').classList.add('hidden');
        document.getElementById('step-analysis').classList.add('hidden');
        document.getElementById('step-result').classList.add('hidden');
        document.getElementById('translate-result').value = '';
        document.getElementById('analysis-result').value = '';
        document.getElementById('note-title-input').value = '';
        document.getElementById('note-new-folder').value = '';
        document.getElementById('save-note-btn').innerHTML = '<i class="fas fa-save"></i> 儲存筆記';
        document.getElementById('save-note-btn').disabled = false;
        renderTags();
    }

    function renderResult(d) {
        renderTranslation(d.paragraphs || []);
        renderVocab(d.vocabulary || []);
        renderGrammar(d.grammar || []);
        renderSentences(d.sentences || []);
    }

    function renderTranslation(paragraphs) {
        var ctrl = document.getElementById('translation-controls');
        var cont = document.getElementById('translation-content');
        ctrl.innerHTML = '<button class="trans-mode-btn active" data-mode="parallel">對照</button>' +
            '<button class="trans-mode-btn" data-mode="original">原文</button>' +
            '<button class="trans-mode-btn" data-mode="translation">翻譯</button>';

        function render(mode) {
            cont.innerHTML = paragraphs.map(function(p) {
                var sp = p.speaker ? '<div class="speaker-tag">' + p.speaker + '</div>' : '';
                var lines = (p.lines || []).map(function(l) {
                    if (mode === 'original') return '<div class="line-original">' + l.original + '</div>';
                    if (mode === 'translation') return '<div class="line-translation">' + l.translation + '</div>';
                    return '<div class="line-pair"><div class="line-original">' + l.original + '</div><div class="line-translation">' + l.translation + '</div></div>';
                }).join('');
                return '<div class="paragraph-block">' + sp + lines + '</div>';
            }).join('');
        }
        render('parallel');
        ctrl.querySelectorAll('.trans-mode-btn').forEach(function(b) {
            b.addEventListener('click', function() {
                ctrl.querySelectorAll('.trans-mode-btn').forEach(function(x) { x.classList.remove('active'); });
                b.classList.add('active');
                render(b.dataset.mode);
            });
        });
    }

    function renderVocab(vocab) {
        document.getElementById('vocab-count').textContent = vocab.length;
        document.getElementById('vocab-list').innerHTML = vocab.map(function(v) {
            var ex = v.example ? '<div class="vocab-example"><div class="example-jp">' + v.example + '</div><div class="example-zh">' + (v.example_translation || '') + '</div></div>' : '';
            return '<div class="vocab-card">' +
                '<div class="vocab-word">' + v.word + '</div>' +
                '<div class="vocab-reading">' + (v.reading || '') + '</div>' +
                '<div class="vocab-meaning">' + v.meaning + '</div>' +
                '<div class="vocab-meta"><span class="vocab-pos">' + (v.pos || '') + '</span><span class="vocab-level">' + (v.level || '') + '</span></div>' +
                ex + '</div>';
        }).join('');
    }

    function renderGrammar(grammar) {
        document.getElementById('grammar-count').textContent = grammar.length;
        document.getElementById('grammar-list').innerHTML = grammar.map(function(g) {
            var ex = g.example ? '<div class="grammar-example"><div class="example-jp">' + g.example + '</div><div class="example-zh">' + (g.example_translation || '') + '</div></div>' : '';
            return '<div class="grammar-card">' +
                '<div class="grammar-pattern">' + g.pattern + '</div>' +
                '<div class="grammar-meaning">' + g.meaning + '</div>' +
                '<div class="grammar-meta"><span class="grammar-level">' + (g.level || '') + '</span><span class="grammar-structure">' + (g.structure || '') + '</span></div>' +
                ex + '</div>';
        }).join('');
    }

    function renderSentences(sentences) {
        document.getElementById('sentences-list').innerHTML = sentences.map(function(s) {
            var note = s.note ? '<div class="sentence-note">' + s.note + '</div>' : '';
            return '<div class="sentence-card">' +
                '<div class="sentence-jp">' + s.japanese + '</div>' +
                '<div class="sentence-zh">' + s.translation + '</div>' +
                note + '</div>';
        }).join('');
    }

    function loadHistory() {
        var list = document.getElementById('history-list');
        var articles = storage.getArticles();

        if (filterMode === 'folder' && filterValue) {
            articles = articles.filter(function(a) { return a.folder === filterValue; });
        } else if (filterMode === 'tag' && filterValue) {
            articles = articles.filter(function(a) { return (a.tags || []).indexOf(filterValue) >= 0; });
        }

        if (!articles.length) {
            list.innerHTML = '<div class="history-empty">還沒有筆記</div>';
            return;
        }

        list.innerHTML = articles.map(function(a) {
            var tags = (a.tags || []).map(function(t) { return '<span class="history-tag">' + t + '</span>'; }).join('');
            var folder = a.folder ? '<span class="history-folder"><i class="fas fa-folder"></i> ' + a.folder + '</span>' : '';
            return '<div class="history-item" data-id="' + a.id + '">' +
                '<div class="history-title">' + (a.title || '未命名') + '</div>' +
                '<div class="history-meta">' +
                '<span class="history-level">' + (a.difficulty || '') + '</span>' +
                '<span class="history-date">' + new Date(a.savedAt).toLocaleDateString() + '</span>' +
                folder +
                '</div>' +
                (tags ? '<div class="history-tags">' + tags + '</div>' : '') +
                '</div>';
        }).join('');

        list.querySelectorAll('.history-item').forEach(function(item) {
            item.addEventListener('click', function() { showDetail(item.dataset.id); });
        });
    }

    function showDetail(id) {
        var a = storage.getArticle(id);
        if (!a) return showToast('找不到筆記', 'error');
        switchView('detail');
        var c = document.getElementById('detail-content');
        var tags = (a.tags || []).map(function(t) { return '<span class="detail-tag">' + t + '</span>'; }).join('');
        var folder = a.folder ? '<span class="detail-folder"><i class="fas fa-folder"></i> ' + a.folder + '</span>' : '';
        var urlHtml = a.sourceUrl ? '<div class="detail-source"><i class="fas fa-link"></i> <a href="' + a.sourceUrl + '" target="_blank">' + a.sourceUrl + '</a></div>' : '';

        var translationHtml = (a.paragraphs || []).map(function(p) {
            var sp = p.speaker ? '<div class="speaker-tag">' + p.speaker + '</div>' : '';
            var lines = (p.lines || []).map(function(l) {
                return '<div class="line-pair"><div class="line-original">' + l.original + '</div><div class="line-translation">' + l.translation + '</div></div>';
            }).join('');
            return '<div class="paragraph-block">' + sp + lines + '</div>';
        }).join('');

        var vocabHtml = (a.vocabulary || []).map(function(v) {
            return '<div class="vocab-card">' +
                '<div class="vocab-word">' + v.word + '</div>' +
                '<div class="vocab-reading">' + (v.reading || '') + '</div>' +
                '<div class="vocab-meaning">' + v.meaning + '</div>' +
                '<div class="vocab-meta"><span class="vocab-pos">' + (v.pos || '') + '</span><span class="vocab-level">' + (v.level || '') + '</span></div>' +
                '</div>';
        }).join('');

        var grammarHtml = (a.grammar || []).map(function(g) {
            return '<div class="grammar-card">' +
                '<div class="grammar-pattern">' + g.pattern + '</div>' +
                '<div class="grammar-meaning">' + g.meaning + '</div>' +
                '<div class="grammar-meta"><span class="grammar-level">' + (g.level || '') + '</span></div>' +
                '</div>';
        }).join('');

        var sentencesHtml = (a.sentences || []).map(function(s) {
            var note = s.note ? '<div class="sentence-note">' + s.note + '</div>' : '';
            return '<div class="sentence-card">' +
                '<div class="sentence-jp">' + s.japanese + '</div>' +
                '<div class="sentence-zh">' + s.translation + '</div>' +
                note + '</div>';
        }).join('');

        var folderOptions = '<option value="">不分類</option>' +
            storage.getFolders().map(function(f) {
                return '<option value="' + f + '"' + (a.folder === f ? ' selected' : '') + '>' + f + '</option>';
            }).join('');

        var editTagsHtml = (a.tags || []).map(function(t) {
            return '<span class="tag-chip">' + t + '<button class="edit-tag-remove" data-tag="' + t + '">&times;</button></span>';
        }).join('');

        c.innerHTML = '<h2>' + (a.title || '未命名') + '</h2>' +
            '<div class="detail-meta">' +
            '<span class="detail-level">' + (a.difficulty || '') + '</span>' +
            '<span class="detail-date">' + new Date(a.savedAt).toLocaleDateString() + '</span>' +
            folder +
            '</div>' +
            (tags ? '<div class="detail-tags" id="detail-tags-display">' + tags + '</div>' : '<div class="detail-tags" id="detail-tags-display"></div>') +
            urlHtml +
            '<div id="edit-form" class="edit-form hidden">' +
            '<div class="panel"><div class="panel-header"><i class="fas fa-edit"></i> 編輯筆記</div><div class="panel-body">' +
            '<div class="note-info-form">' +
            '<div class="form-row"><label>標題</label><input type="text" id="edit-title" class="form-input" value="' + (a.title || '').replace(/"/g, '&quot;') + '"></div>' +
            '<div class="form-row"><label>資料夾</label><div class="folder-select-wrapper"><select id="edit-folder" class="form-input">' + folderOptions + '</select><span class="folder-or">或</span><input type="text" id="edit-new-folder" class="form-input" placeholder="新資料夾..."></div></div>' +
            '<div class="form-row"><label>標籤</label><div class="tags-input-wrapper"><div id="edit-tags-container" class="tags-container">' + editTagsHtml + '</div><input type="text" id="edit-tag-input" class="form-input tag-input" placeholder="輸入標籤後按 Enter"></div></div>' +
            '<div class="edit-actions"><button id="save-edit-btn" class="save-btn"><i class="fas fa-check"></i> 儲存修改</button><button id="cancel-edit-btn" class="clear-btn"><i class="fas fa-times"></i> 取消</button></div>' +
            '</div></div></div>' +
            '</div>' +
            '<div class="detail-section"><h3><i class="fas fa-language"></i> 原文與翻譯</h3>' + translationHtml + '</div>' +
            '<div class="detail-section"><h3><i class="fas fa-book"></i> 單字 (' + (a.vocabulary || []).length + ')</h3><div class="vocab-list">' + vocabHtml + '</div></div>' +
            '<div class="detail-section"><h3><i class="fas fa-puzzle-piece"></i> 文法 (' + (a.grammar || []).length + ')</h3><div class="grammar-list">' + grammarHtml + '</div></div>' +
            '<div class="detail-section"><h3><i class="fas fa-comment-dots"></i> 重點例句</h3><div class="sentences-list">' + sentencesHtml + '</div></div>';

        // 編輯用的 tags 狀態
        var editTags = (a.tags || []).slice();

        function renderEditTags() {
            var container = document.getElementById('edit-tags-container');
            if (!container) return;
            container.innerHTML = editTags.map(function(t) {
                return '<span class="tag-chip">' + t + '<button class="edit-tag-remove" data-tag="' + t + '">&times;</button></span>';
            }).join('');
            container.querySelectorAll('.edit-tag-remove').forEach(function(b) {
                b.addEventListener('click', function() {
                    editTags = editTags.filter(function(t) { return t !== b.dataset.tag; });
                    renderEditTags();
                });
            });
        }

        // 編輯標籤輸入
        var editTagInput = document.getElementById('edit-tag-input');
        if (editTagInput) editTagInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                var tag = e.target.value.trim();
                if (tag && editTags.indexOf(tag) < 0) { editTags.push(tag); renderEditTags(); }
                e.target.value = '';
            }
        });

        renderEditTags();

        // 編輯按鈕
        document.getElementById('delete-note-btn').onclick = function() {
            if (confirm('確定刪除？')) {
                storage.deleteArticle(id);
                showToast('已刪除', 'success');
                refresh();
                switchView('input');
            }
        };

        document.getElementById('back-to-list').onclick = function() { switchView('input'); };

        // 儲存編輯
        var saveEditBtn = document.getElementById('save-edit-btn');
        if (saveEditBtn) saveEditBtn.addEventListener('click', function() {
            var articles = storage.getArticles();
            var idx = -1;
            for (var i = 0; i < articles.length; i++) {
                if (articles[i].id === id) { idx = i; break; }
            }
            if (idx === -1) return showToast('找不到筆記', 'error');

            var newTitle = document.getElementById('edit-title').value.trim();
            if (newTitle) articles[idx].title = newTitle;

            var newFolder = document.getElementById('edit-new-folder').value.trim();
            if (newFolder) {
                storage.addFolder(newFolder);
                articles[idx].folder = newFolder;
            } else {
                articles[idx].folder = document.getElementById('edit-folder').value;
            }

            articles[idx].tags = editTags.slice();

            localStorage.setItem(storage.ARTICLES_KEY, JSON.stringify(articles));
            showToast('已更新', 'success');
            refresh();
            showDetail(id);
        });

        // 取消編輯
        var cancelEditBtn = document.getElementById('cancel-edit-btn');
        if (cancelEditBtn) cancelEditBtn.addEventListener('click', function() {
            document.getElementById('edit-form').classList.add('hidden');
        });
    }

        var grammarHtml = (a.grammar || []).map(function(g) {
            return '<div class="grammar-card">' +
                '<div class="grammar-pattern">' + g.pattern + '</div>' +
                '<div class="grammar-meaning">' + g.meaning + '</div>' +
                '<div class="grammar-meta"><span class="grammar-level">' + (g.level || '') + '</span></div>' +
                '</div>';
        }).join('');

        var sentencesHtml = (a.sentences || []).map(function(s) {
            var note = s.note ? '<div class="sentence-note">' + s.note + '</div>' : '';
            return '<div class="sentence-card">' +
                '<div class="sentence-jp">' + s.japanese + '</div>' +
                '<div class="sentence-zh">' + s.translation + '</div>' +
                note + '</div>';
        }).join('');

        c.innerHTML = '<h2>' + (a.title || '未命名') + '</h2>' +
            '<div class="detail-meta">' +
            '<span class="detail-level">' + (a.difficulty || '') + '</span>' +
            '<span class="detail-date">' + new Date(a.savedAt).toLocaleDateString() + '</span>' +
            folder +
            '</div>' +
            (tags ? '<div class="detail-tags">' + tags + '</div>' : '') +
            urlHtml +
            '<div class="detail-section"><h3><i class="fas fa-language"></i> 原文與翻譯</h3>' + translationHtml + '</div>' +
            '<div class="detail-section"><h3><i class="fas fa-book"></i> 單字 (' + (a.vocabulary || []).length + ')</h3><div class="vocab-list">' + vocabHtml + '</div></div>' +
            '<div class="detail-section"><h3><i class="fas fa-puzzle-piece"></i> 文法 (' + (a.grammar || []).length + ')</h3><div class="grammar-list">' + grammarHtml + '</div></div>' +
            '<div class="detail-section"><h3><i class="fas fa-comment-dots"></i> 重點例句</h3><div class="sentences-list">' + sentencesHtml + '</div></div>';

        document.getElementById('delete-note-btn').onclick = function() {
            if (confirm('確定刪除？')) {
                storage.deleteArticle(id);
                showToast('已刪除', 'success');
                refresh();
                switchView('input');
            }
        };
        document.getElementById('back-to-list').onclick = function() { switchView('input'); };
    }

    function initSearch() {
        var searchInput = document.getElementById('history-search');
        if (searchInput) searchInput.addEventListener('input', function(e) {
            var q = e.target.value.toLowerCase();
            document.querySelectorAll('.history-item').forEach(function(item) {
                var title = item.querySelector('.history-title');
                var tagsEl = item.querySelector('.history-tags');
                var folderEl = item.querySelector('.history-folder');
                var text = (title ? title.textContent : '') + (tagsEl ? tagsEl.textContent : '') + (folderEl ? folderEl.textContent : '');
                item.style.display = text.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
            });
        });
    }

    function updateStats() {
        var articles = storage.getArticles();
        var v = 0, g = 0;
        articles.forEach(function(a) { v += (a.vocabulary || []).length; g += (a.grammar || []).length; });
        document.getElementById('stat-notes').textContent = articles.length;
        document.getElementById('stat-vocab').textContent = v;
        document.getElementById('stat-grammar').textContent = g;
    }

    function updateGameCounts() {
        var articles = storage.getArticles();
        var vc = 0;
        articles.forEach(function(a) { vc += (a.vocabulary || []).length; });
        document.getElementById('flashcard-count').textContent = vc + ' 個單字';
        document.getElementById('quiz-count').textContent = vc + ' 題可用';
        document.getElementById('typing-count').textContent = vc + ' 個單字';
        document.getElementById('matching-count').textContent = Math.min(vc, 10) + ' 組可用';
    }

    function initSettings() {
        var addKeyBtn = document.getElementById('add-api-key');
        if (addKeyBtn) addKeyBtn.addEventListener('click', function() {
            var name = document.getElementById('key-name-input').value.trim() || '預設';
            var key = document.getElementById('key-value-input').value.trim();
            if (!key) return showToast('請輸入 API Key', 'error');
            gemini.addKey(name, key);
            document.getElementById('key-name-input').value = '';
            document.getElementById('key-value-input').value = '';
            renderApiKeys();
            showToast('已新增', 'success');
        });

        document.querySelectorAll('.theme-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.theme-btn').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                document.body.dataset.theme = btn.dataset.theme;
                localStorage.setItem('jp_theme', btn.dataset.theme);
            });
        });

        var saved = localStorage.getItem('jp_theme') || 'dark';
        document.body.dataset.theme = saved;
        var themeBtn = document.querySelector('.theme-btn[data-theme="' + saved + '"]');
        if (themeBtn) themeBtn.classList.add('active');
        renderApiKeys();
    }

    function renderApiKeys() {
        var list = document.getElementById('api-key-list');
        if (!list) return;
        var keys = gemini.getKeys();
        if (!keys.length) { list.innerHTML = '<div class="no-keys">尚未新增 API Key</div>'; return; }
        list.innerHTML = keys.map(function(k) {
            var actions = '';
            if (!k.active) {
                actions = '<button class="key-activate" data-id="' + k.id + '">啟用</button>';
            } else {
                actions = '<span class="key-active-badge">使用中</span>';
            }
            actions += '<button class="key-delete" data-id="' + k.id + '">刪除</button>';
            return '<div class="api-key-item ' + (k.active ? 'active' : '') + '">' +
                '<span class="key-name">' + k.name + '</span>' +
                '<span class="key-value">' + k.key.slice(0, 8) + '...' + k.key.slice(-4) + '</span>' +
                '<div class="key-actions">' + actions + '</div></div>';
        }).join('');

        list.querySelectorAll('.key-activate').forEach(function(btn) {
            btn.addEventListener('click', function() {
                gemini.setActiveKey(btn.dataset.id);
                renderApiKeys();
                showToast('已切換', 'success');
            });
        });
        list.querySelectorAll('.key-delete').forEach(function(btn) {
            btn.addEventListener('click', function() {
                gemini.removeKey(btn.dataset.id);
                renderApiKeys();
                showToast('已刪除', 'success');
            });
        });
    }

    document.addEventListener('DOMContentLoaded', function() {
        initAuth();
        initNav();
        initFilter();
        initTags();
        initWorkspace();
        initSearch();
        initSettings();
    });
})();

