(function () {
    'use strict';

    let currentUser = null;
    let currentNotes = [];
    let currentGameData = [];
    let currentView = 'input';
    let analysisResult = null;

    // ===== Toast =====
    function showToast(msg, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = msg;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ===== Auth =====
    function initAuth() {
        auth.onAuthStateChanged(user => {
            document.getElementById('loading-screen').classList.add('hidden');
            if (user) {
                currentUser = user;
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('app').classList.remove('hidden');
                document.getElementById('user-avatar').src = user.photoURL || '';
                document.getElementById('user-name').textContent = user.displayName || user.email;
                loadNotes();
                loadStats();
                const savedKey = localStorage.getItem('gemini_api_key');
                if (savedKey) {
                    document.getElementById('gemini-api-key').value = savedKey;
                }
            } else {
                currentUser = null;
                document.getElementById('login-screen').classList.remove('hidden');
                document.getElementById('app').classList.add('hidden');
            }
        });

        document.getElementById('google-login-btn').addEventListener('click', () => {
            auth.signInWithPopup(googleProvider).catch(err => {
                showToast('登入失敗：' + err.message, 'error');
            });
        });

        document.getElementById('logout-btn').addEventListener('click', () => {
            auth.signOut();
        });
    }

    // ===== Navigation =====
    function switchView(viewName) {
        document.querySelectorAll('.view').forEach(v => {
            v.classList.remove('active');
        });
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

        const target = document.getElementById(`view-${viewName}`);
        if (target) {
            target.classList.add('active');
        }

        const navBtn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
        if (navBtn) navBtn.classList.add('active');

        currentView = viewName;
        if (viewName === 'review') updateGameCounts();
        if (viewName === 'stats') loadStats();
    }

    function initNavigation() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => switchView(btn.dataset.view));
        });

        document.getElementById('sidebar-toggle').addEventListener('click', () => {
            const sidebar = document.querySelector('.sidebar');
            if (window.innerWidth <= 768) {
                sidebar.classList.toggle('mobile-open');
            } else {
                sidebar.classList.toggle('collapsed');
            }
        });

        document.querySelectorAll('.input-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.input-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('text-input-area').classList.toggle('hidden', tab.dataset.input !== 'text');
                document.getElementById('url-input-area').classList.toggle('hidden', tab.dataset.input !== 'url');
            });
        });

        document.getElementById('back-to-list').addEventListener('click', () => switchView('input'));

        document.getElementById('back-to-games').addEventListener('click', () => {
            document.getElementById('game-area').classList.add('hidden');
            document.querySelector('.game-modes').classList.remove('hidden');
        });
    }

    // ===== Analysis =====
    function initAnalysis() {
        document.getElementById('analyze-btn').addEventListener('click', handleAnalyze);
        document.getElementById('save-note-btn').addEventListener('click', saveCurrentNote);
        document.getElementById('clear-result-btn').addEventListener('click', () => {
            document.getElementById('result-section').classList.add('hidden');
            analysisResult = null;
        });
    }

    async function handleAnalyze() {
        const btn = document.getElementById('analyze-btn');
        const activeTab = document.querySelector('.input-tab.active').dataset.input;
        const difficulty = document.getElementById('difficulty-select').value;
        let text = '';

        if (activeTab === 'url') {
            const url = document.getElementById('url-input').value.trim();
            if (!url) return showToast('請輸入網址', 'error');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在擷取網頁...';
            try {
                text = await gemini.fetchUrlContent(url);
                document.getElementById('text-input').value = text;
            } catch (err) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-magic"></i> AI 分析';
                return showToast(err.message, 'error');
            }
        } else {
            text = document.getElementById('text-input').value.trim();
            if (!text) return showToast('請輸入日文文本', 'error');
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI 分析中...';

        try {
            analysisResult = await gemini.analyze(text, difficulty);
            analysisResult.originalText = text;
            analysisResult.sourceUrl = document.getElementById('url-input').value.trim() || null;
            renderResult(analysisResult);
            document.getElementById('result-section').classList.remove('hidden');
            document.getElementById('result-section').scrollIntoView({ behavior: 'smooth' });
            showToast('分析完成！', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-magic"></i> AI 分析';
        }
    }

    function renderResult(data) {
        const transEl = document.getElementById('translation-content');
        transEl.innerHTML = (data.paragraphs || []).map(p => `
            <div class="paragraph-pair">
                <div class="para-original">${p.original}</div>
                <div class="para-translation">${p.translation}</div>
            </div>
        `).join('');

        const vocabEl = document.getElementById('vocab-list');
        const vocabs = data.vocabulary || [];
        document.getElementById('vocab-count').textContent = vocabs.length;
        vocabEl.innerHTML = vocabs.map(v => `
            <div class="vocab-item">
                <div class="vocab-main">
                    <span class="vocab-word">${v.word}</span>
                    <span class="vocab-reading">${v.reading}</span>
                    <span class="vocab-level level-${v.level}">${v.level}</span>
                    <span class="vocab-pos">${v.pos}</span>
                </div>
                <div class="vocab-meaning">${v.meaning}</div>
                <div class="vocab-example">
                    <div class="example-jp">💬 ${v.example}</div>
                    <div class="example-zh">${v.example_translation}</div>
                </div>
            </div>
        `).join('');

        const gramEl = document.getElementById('grammar-list');
        const grams = data.grammar || [];
        document.getElementById('grammar-count').textContent = grams.length;
        gramEl.innerHTML = grams.map(g => `
            <div class="grammar-item">
                <div class="grammar-header">
                    <span class="grammar-pattern">${g.pattern}</span>
                    <span class="vocab-level level-${g.level}">${g.level}</span>
                </div>
                <div class="grammar-meaning">${g.meaning}</div>
                <div class="grammar-structure">📐 接續：${g.structure}</div>
                <div class="vocab-example">
                    <div class="example-jp">💬 ${g.example}</div>
                    <div class="example-zh">${g.example_translation}</div>
                </div>
            </div>
        `).join('');

        const sentEl = document.getElementById('sentences-list');
        sentEl.innerHTML = (data.sentences || []).map(s => `
            <div class="sentence-item">
                <div class="sentence-jp">${s.japanese}</div>
                <div class="sentence-zh">${s.translation}</div>
                <div class="sentence-note">📝 ${s.note}</div>
            </div>
        `).join('');
    }

    // ===== Firestore =====
    async function saveCurrentNote() {
        if (!analysisResult || !currentUser) return;
        const btn = document.getElementById('save-note-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 儲存中...';

        try {
            const noteData = {
                userId: currentUser.uid,
                title: analysisResult.title || '未命名筆記',
                difficulty: analysisResult.difficulty || 'N3',
                summary: analysisResult.summary || '',
                originalText: analysisResult.originalText || '',
                sourceUrl: analysisResult.sourceUrl || null,
                paragraphs: analysisResult.paragraphs || [],
                vocabulary: analysisResult.vocabulary || [],
                grammar: analysisResult.grammar || [],
                sentences: analysisResult.sentences || [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                reviewCount: 0,
                lastReviewed: null
            };

            await db.collection('notes').add(noteData);
            showToast('筆記已儲存！', 'success');
            loadNotes();
            await updateUserStats(noteData);
        } catch (err) {
            showToast('儲存失敗：' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> 儲存筆記';
        }
    }

    async function loadNotes() {
        if (!currentUser) return;
        try {
            const snapshot = await db.collection('notes')
                .where('userId', '==', currentUser.uid)
                .orderBy('createdAt', 'desc')
                .get();

            currentNotes = [];
            snapshot.forEach(doc => currentNotes.push({ id: doc.id, ...doc.data() }));
            renderHistory();
        } catch (err) {
            try {
                const snapshot = await db.collection('notes')
                    .where('userId', '==', currentUser.uid)
                    .get();
                currentNotes = [];
                snapshot.forEach(doc => currentNotes.push({ id: doc.id, ...doc.data() }));
                currentNotes.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
                renderHistory();
            } catch (e) {
                console.error('載入失敗:', e);
            }
        }
    }

    function renderHistory() {
        const list = document.getElementById('history-list');
        if (currentNotes.length === 0) {
            list.innerHTML = '<div class="history-empty">還沒有筆記，開始學習吧！</div>';
            return;
        }

        list.innerHTML = currentNotes.map(note => {
            const date = note.createdAt?.toDate?.()
                ? note.createdAt.toDate().toLocaleDateString('zh-TW')
                : '剛剛';
            const icons = { N5: '🌱', N4: '🌿', N3: '🌳', N2: '🔥', N1: '👑' };
            const icon = icons[note.difficulty] || '📝';
            return `
                <div class="history-item" data-id="${note.id}">
                    <span class="history-item-icon">${icon}</span>
                    <div class="history-item-info">
                        <div class="history-item-title">${note.title}</div>
                        <div class="history-item-date">${date} · ${note.difficulty} · ${(note.vocabulary || []).length}字</div>
                    </div>
                </div>
            `;
        }).join('');

        list.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => openNote(item.dataset.id));
        });
    }

    function openNote(noteId) {
        const note = currentNotes.find(n => n.id === noteId);
        if (!note) return;
        switchView('detail');

        const icons = { N5: '🌱', N4: '🌿', N3: '🌳', N2: '🔥', N1: '👑' };
        const icon = icons[note.difficulty] || '📝';
        const content = document.getElementById('detail-content');
        content.innerHTML = `
            <div class="detail-header-info">
                <h2>${icon} ${note.title}</h2>
                <div class="detail-meta">
                    <span class="detail-level level-${note.difficulty}">${note.difficulty}</span>
                    <span>${note.createdAt?.toDate?.() ? note.createdAt.toDate().toLocaleDateString('zh-TW') : ''}</span>
                    ${note.sourceUrl ? `<a href="${note.sourceUrl}" target="_blank" class="detail-source"><i class="fas fa-external-link-alt"></i> 原始連結</a>` : ''}
                </div>
                <p class="detail-summary">${note.summary || ''}</p>
            </div>

            <div class="result-card">
                <h3><i class="fas fa-language"></i> 原文與翻譯</h3>
                <div class="translation-content">
                    ${(note.paragraphs || []).map(p => `
                        <div class="paragraph-pair">
                            <div class="para-original">${p.original}</div>
                            <div class="para-translation">${p.translation}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="result-card">
                <h3><i class="fas fa-book"></i> 單字 <span class="count-badge">${(note.vocabulary || []).length}</span></h3>
                <div class="vocab-list">
                    ${(note.vocabulary || []).map(v => `
                        <div class="vocab-item">
                            <div class="vocab-main">
                                <span class="vocab-word">${v.word}</span>
                                <span class="vocab-reading">${v.reading}</span>
                                <span class="vocab-level level-${v.level}">${v.level}</span>
                                <span class="vocab-pos">${v.pos}</span>
                            </div>
                            <div class="vocab-meaning">${v.meaning}</div>
                            <div class="vocab-example">
                                <div class="example-jp">💬 ${v.example}</div>
                                <div class="example-zh">${v.example_translation}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="result-card">
                <h3><i class="fas fa-puzzle-piece"></i> 文法 <span class="count-badge">${(note.grammar || []).length}</span></h3>
                <div class="grammar-list">
                    ${(note.grammar || []).map(g => `
                        <div class="grammar-item">
                            <div class="grammar-header">
                                <span class="grammar-pattern">${g.pattern}</span>
                                <span class="vocab-level level-${g.level}">${g.level}</span>
                            </div>
                            <div class="grammar-meaning">${g.meaning}</div>
                            <div class="grammar-structure">📐 接續：${g.structure}</div>
                            <div class="vocab-example">
                                <div class="example-jp">💬 ${g.example}</div>
                                <div class="example-zh">${g.example_translation}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="result-card">
                <h3><i class="fas fa-comment-dots"></i> 重點例句</h3>
                <div class="sentences-list">
                    ${(note.sentences || []).map(s => `
                        <div class="sentence-item">
                            <div class="sentence-jp">${s.japanese}</div>
                            <div class="sentence-zh">${s.translation}</div>
                            <div class="sentence-note">📝 ${s.note}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        document.getElementById('delete-note-btn').onclick = async () => {
            if (!confirm('確定要刪除這篇筆記嗎？')) return;
            try {
                await db.collection('notes').doc(noteId).delete();
                showToast('已刪除', 'success');
                loadNotes();
                switchView('input');
            } catch (err) {
                showToast('刪除失敗', 'error');
            }
        };

        document.getElementById('review-note-btn').onclick = () => startGameWithNote(note);
    }

    // ===== Search =====
    function initSearch() {
        document.getElementById('history-search').addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('.history-item').forEach(item => {
                const title = item.querySelector('.history-item-title')?.textContent.toLowerCase() || '';
                item.style.display = title.includes(query) ? 'flex' : 'none';
            });
        });
    }

    // ===== Stats =====
    async function updateUserStats(noteData) {
        if (!currentUser) return;
        const ref = db.collection('userStats').doc(currentUser.uid);
        try {
            const doc = await ref.get();
            if (doc.exists) {
                await ref.update({
                    totalNotes: firebase.firestore.FieldValue.increment(1),
                    totalVocab: firebase.firestore.FieldValue.increment((noteData.vocabulary || []).length),
                    totalGrammar: firebase.firestore.FieldValue.increment((noteData.grammar || []).length),
                    lastActive: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                await ref.set({
                    totalNotes: 1,
                    totalVocab: (noteData.vocabulary || []).length,
                    totalGrammar: (noteData.grammar || []).length,
                    totalGames: 0,
                    totalCorrect: 0,
                    totalAnswered: 0,
                    streak: 1,
                    lastActive: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (err) {
            console.error('更新統計失敗:', err);
        }
    }

    async function loadStats() {
        if (!currentUser) return;
        try {
            const doc = await db.collection('userStats').doc(currentUser.uid).get();
            if (doc.exists) {
                const s = doc.data();
                document.getElementById('stat-notes').textContent = s.totalNotes || 0;
                document.getElementById('stat-vocab').textContent = s.totalVocab || 0;
                document.getElementById('stat-grammar').textContent = s.totalGrammar || 0;
                document.getElementById('stat-games').textContent = s.totalGames || 0;
                document.getElementById('stat-streak').textContent = s.streak || 0;
                const accuracy = s.totalAnswered > 0
                    ? Math.round((s.totalCorrect / s.totalAnswered) * 100) + '%'
                    : '0%';
                document.getElementById('stat-accuracy').textContent = accuracy;
            }
        } catch (err) {
            console.error('載入統計失敗:', err);
        }

        // 最近單字
        const recentEl = document.getElementById('recent-vocab');
        const allVocab = [];
        currentNotes.slice(0, 5).forEach(note => {
            (note.vocabulary || []).forEach(v => allVocab.push(v));
        });
        recentEl.innerHTML = allVocab.slice(0, 30).map(v =>
            `<span class="recent-vocab-tag">${v.word}（${v.meaning}）</span>`
        ).join('');
    }

    async function recordGameResult(correct, total) {
        if (!currentUser) return;
        const ref = db.collection('userStats').doc(currentUser.uid);
        try {
            const doc = await ref.get();
            if (doc.exists) {
                await ref.update({
                    totalGames: firebase.firestore.FieldValue.increment(1),
                    totalCorrect: firebase.firestore.FieldValue.increment(correct),
                    totalAnswered: firebase.firestore.FieldValue.increment(total),
                    lastActive: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (err) {
            console.error('記錄遊戲結果失敗:', err);
        }
    }
    // ===== Games =====
    function getAllVocab() {
        const all = [];
        currentNotes.forEach(note => {
            (note.vocabulary || []).forEach(v => all.push({ ...v, noteTitle: note.title }));
        });
        return all;
    }

    function updateGameCounts() {
        const vocab = getAllVocab();
        document.getElementById('flashcard-count').textContent = `${vocab.length} 個單字`;
        document.getElementById('quiz-count').textContent = `${Math.min(vocab.length, 20)} 題可用`;
        document.getElementById('typing-count').textContent = `${vocab.length} 個單字`;
        document.getElementById('matching-count').textContent = `${Math.min(Math.floor(vocab.length / 2) * 2, 12)} 組可用`;
    }

    function initGames() {
        document.querySelectorAll('.game-card').forEach(card => {
            card.addEventListener('click', () => {
                const game = card.dataset.game;
                const vocab = getAllVocab();
                if (vocab.length < 4) {
                    return showToast('至少需要 4 個單字才能開始遊戲，多學幾篇吧！', 'warning');
                }
                startGame(game, vocab);
            });
        });
    }

    function startGameWithNote(note) {
        const vocab = (note.vocabulary || []).map(v => ({ ...v, noteTitle: note.title }));
        if (vocab.length < 4) {
            showToast('這篇筆記的單字太少，至少需要 4 個', 'warning');
            return;
        }
        switchView('review');
        startGame('flashcard', vocab);
    }

    function startGame(type, vocab) {
        document.querySelector('.game-modes').classList.add('hidden');
        document.getElementById('game-area').classList.remove('hidden');
        const shuffled = [...vocab].sort(() => Math.random() - 0.5);
        currentGameData = shuffled;

        switch (type) {
            case 'flashcard': runFlashcardGame(shuffled); break;
            case 'quiz': runQuizGame(shuffled); break;
            case 'typing': runTypingGame(shuffled); break;
            case 'matching': runMatchingGame(shuffled); break;
        }
    }

    function updateProgress(current, total, score) {
        const pct = total > 0 ? (current / total) * 100 : 0;
        document.getElementById('game-progress-bar').style.width = pct + '%';
        document.getElementById('game-progress-text').textContent = `${current}/${total}`;
        document.getElementById('game-score').textContent = score;
    }

    function showGameResult(correct, total) {
        const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
        let emoji = '🎉';
        let message = '太厲害了！';
        if (pct < 40) { emoji = '😅'; message = '繼續加油，多複習幾次！'; }
        else if (pct < 70) { emoji = '👍'; message = '不錯喔，再練習一下！'; }
        else if (pct < 90) { emoji = '🔥'; message = '很棒！快要完全掌握了！'; }

        document.getElementById('game-content').innerHTML = `
            <div class="game-result">
                <div class="result-emoji">${emoji}</div>
                <div class="result-score">${correct} / ${total}</div>
                <div class="result-message">${message}（正確率 ${pct}%）</div>
                <div class="result-btns">
                    <button class="result-btn primary" id="retry-game">再玩一次</button>
                    <button class="result-btn secondary" id="back-games">返回遊戲列表</button>
                </div>
            </div>
        `;

        document.getElementById('retry-game').addEventListener('click', () => {
            const shuffled = [...currentGameData].sort(() => Math.random() - 0.5);
            runFlashcardGame(shuffled);
        });

        document.getElementById('back-games').addEventListener('click', () => {
            document.getElementById('game-area').classList.add('hidden');
            document.querySelector('.game-modes').classList.remove('hidden');
        });

        recordGameResult(correct, total);
    }

    // --- Flashcard ---
    function runFlashcardGame(vocab) {
        let idx = 0;
        let known = 0;
        const total = Math.min(vocab.length, 20);
        const cards = vocab.slice(0, total);

        function renderCard() {
            updateProgress(idx, total, known);
            if (idx >= total) return showGameResult(known, total);

            const v = cards[idx];
            document.getElementById('game-content').innerHTML = `
                <div class="flashcard" id="flashcard">
                    <div class="flashcard-inner">
                        <div class="flashcard-front">
                            <div class="fc-word">${v.word}</div>
                            <div class="fc-reading">${v.reading}</div>
                            <div class="fc-hint">點擊翻面</div>
                        </div>
                        <div class="flashcard-back">
                            <div class="fc-meaning">${v.meaning}</div>
                            <div class="fc-pos">${v.pos}</div>
                            <div class="fc-example">${v.example}</div>
                            <div class="fc-example-zh">${v.example_translation}</div>
                        </div>
                    </div>
                </div>
                <div class="fc-actions">
                    <button class="fc-btn fc-unknown" id="fc-unknown">❌ 不熟</button>
                    <button class="fc-btn fc-known" id="fc-known">✅ 記住了</button>
                </div>
            `;

            document.getElementById('flashcard').addEventListener('click', () => {
                document.getElementById('flashcard').classList.toggle('flipped');
            });

            document.getElementById('fc-known').addEventListener('click', () => { known++; idx++; renderCard(); });
            document.getElementById('fc-unknown').addEventListener('click', () => { idx++; renderCard(); });
        }

        renderCard();
    }

    // --- Quiz ---
    function runQuizGame(vocab) {
        let idx = 0;
        let score = 0;
        const total = Math.min(vocab.length, 15);
        const questions = vocab.slice(0, total);

        function renderQuestion() {
            updateProgress(idx, total, score);
            if (idx >= total) return showGameResult(score, total);

            const q = questions[idx];
            const wrongAnswers = vocab
                .filter(v => v.meaning !== q.meaning)
                .sort(() => Math.random() - 0.5)
                .slice(0, 3)
                .map(v => v.meaning);

            const options = [q.meaning, ...wrongAnswers].sort(() => Math.random() - 0.5);

            document.getElementById('game-content').innerHTML = `
                <div class="quiz-question">
                    <div class="quiz-word">${q.word}</div>
                    <div class="quiz-reading">${q.reading}</div>
                </div>
                <div class="quiz-options">
                    ${options.map(opt => `
                        <button class="quiz-option" data-answer="${opt}">${opt}</button>
                    `).join('')}
                </div>
            `;

            document.querySelectorAll('.quiz-option').forEach(btn => {
                btn.addEventListener('click', () => {
                    const isCorrect = btn.dataset.answer === q.meaning;
                    btn.classList.add(isCorrect ? 'correct' : 'wrong');

                    if (!isCorrect) {
                        document.querySelector(`.quiz-option[data-answer="${q.meaning}"]`)?.classList.add('correct');
                    } else {
                        score++;
                    }

                    document.querySelectorAll('.quiz-option').forEach(b => b.style.pointerEvents = 'none');
                    setTimeout(() => { idx++; renderQuestion(); }, 1200);
                });
            });
        }

        renderQuestion();
    }

    // --- Typing ---
    function runTypingGame(vocab) {
        let idx = 0;
        let score = 0;
        const total = Math.min(vocab.length, 10);
        const questions = vocab.slice(0, total);

        function renderTyping() {
            updateProgress(idx, total, score);
            if (idx >= total) return showGameResult(score, total);

            const q = questions[idx];
            document.getElementById('game-content').innerHTML = `
                <div class="typing-question">
                    <div class="typing-meaning">${q.meaning}</div>
                    <div class="typing-hint">提示：${q.reading}</div>
                </div>
                <div class="typing-input-wrapper">
                    <input type="text" class="typing-input" id="typing-answer" placeholder="輸入日文..." autocomplete="off">
                </div>
                <button class="typing-submit" id="typing-submit">確認</button>
                <div class="typing-answer" id="typing-result"></div>
            `;

            const input = document.getElementById('typing-answer');
            input.focus();

            function checkAnswer() {
                const answer = input.value.trim();
                if (!answer) return;

                const isCorrect = answer === q.word || answer === q.reading;
                input.classList.add(isCorrect ? 'correct' : 'wrong');
                input.disabled = true;

                if (isCorrect) {
                    score++;
                    document.getElementById('typing-result').textContent = '✅ 正確！';
                    document.getElementById('typing-result').style.color = 'var(--success)';
                } else {
                    document.getElementById('typing-result').innerHTML = `❌ 正確答案：<strong>${q.word}</strong>（${q.reading}）`;
                    document.getElementById('typing-result').style.color = 'var(--danger)';
                }

                setTimeout(() => { idx++; renderTyping(); }, 1500);
            }

            document.getElementById('typing-submit').addEventListener('click', checkAnswer);
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkAnswer(); });
        }

        renderTyping();
    }

    // --- Matching ---
    function runMatchingGame(vocab) {
        const pairCount = Math.min(Math.floor(vocab.length / 2), 6);
        const selected = vocab.slice(0, pairCount);
        let matched = 0;
        let firstCard = null;
        let locked = false;

        const cards = [];
        selected.forEach((v, i) => {
            cards.push({ id: i, type: 'jp', text: v.word, pairId: i });
            cards.push({ id: i, type: 'zh', text: v.meaning, pairId: i });
        });
        cards.sort(() => Math.random() - 0.5);

        updateProgress(0, pairCount, 0);

        document.getElementById('game-content').innerHTML = `
            <div class="matching-grid">
                ${cards.map((c, idx) => `
                    <button class="matching-card" data-idx="${idx}" data-pair="${c.pairId}" data-type="${c.type}">
                        ${c.text}
                    </button>
                `).join('')}
            </div>
        `;

        document.querySelectorAll('.matching-card').forEach(card => {
            card.addEventListener('click', () => {
                if (locked || card.classList.contains('matched') || card.classList.contains('selected')) return;

                card.classList.add('selected');

                if (!firstCard) {
                    firstCard = card;
                    return;
                }

                locked = true;
                const secondCard = card;

                if (firstCard.dataset.pair === secondCard.dataset.pair && firstCard.dataset.type !== secondCard.dataset.type) {
                    firstCard.classList.add('matched');
                    secondCard.classList.add('matched');
                    firstCard.classList.remove('selected');
                    secondCard.classList.remove('selected');
                    matched++;
                    updateProgress(matched, pairCount, matched);
                    firstCard = null;
                    locked = false;

                    if (matched === pairCount) {
                        setTimeout(() => showGameResult(pairCount, pairCount), 500);
                    }
                } else {
                    firstCard.classList.add('wrong-match');
                    secondCard.classList.add('wrong-match');

                    setTimeout(() => {
                        firstCard.classList.remove('selected', 'wrong-match');
                        secondCard.classList.remove('selected', 'wrong-match');
                        firstCard = null;
                        locked = false;
                    }, 800);
                }
            });
        });
    }

    // ===== Settings =====
    function initSettings() {
        // 新增 Key
        document.getElementById('add-api-key').addEventListener('click', () => {
            const name = document.getElementById('key-name-input').value.trim();
            const key = document.getElementById('key-value-input').value.trim();
            if (!name) return showToast('請輸入名稱', 'error');
            if (!key) return showToast('請輸入 API Key', 'error');
            gemini.addKey(name, key);
            document.getElementById('key-name-input').value = '';
            document.getElementById('key-value-input').value = '';
            renderKeyList();
            showToast('API Key 已新增！', 'success');
        });

        // 主題切換
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.body.setAttribute('data-theme', btn.dataset.theme);
                localStorage.setItem('theme', btn.dataset.theme);
            });
        });

        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.body.setAttribute('data-theme', savedTheme);
        document.querySelector(`.theme-btn[data-theme="${savedTheme}"]`)?.classList.add('active');

        // 舊版 Key 遷移
        const oldKey = localStorage.getItem('gemini_api_key');
        if (oldKey && gemini.keys.length === 0) {
            gemini.addKey('預設', oldKey);
            localStorage.removeItem('gemini_api_key');
        }

        renderKeyList();
    }

    function renderKeyList() {
        const list = document.getElementById('api-key-list');
        const keys = gemini.getKeys();

        if (keys.length === 0) {
            list.innerHTML = '<div style="color:var(--text-secondary);font-size:0.85rem;">尚未新增任何 API Key</div>';
            return;
        }

        list.innerHTML = keys.map(k => `
            <div class="api-key-item ${k.active ? 'active' : ''}">
                <div class="key-info">
                    <div class="key-info-name">${k.name}</div>
                    <div class="key-info-value">${k.key}</div>
                </div>
                <div class="key-actions">
                    <button class="key-use-btn ${k.active ? 'active' : ''}" data-id="${k.id}">
                        ${k.active ? '✓ 使用中' : '切換'}
                    </button>
                    <button class="key-del-btn" data-id="${k.id}">刪除</button>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.key-use-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                gemini.setActiveKey(btn.dataset.id);
                renderKeyList();
                showToast('已切換 API Key', 'success');
            });
        });

        list.querySelectorAll('.key-del-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!confirm('確定刪除這組 Key？')) return;
                gemini.removeKey(btn.dataset.id);
                renderKeyList();
                showToast('已刪除', 'success');
            });
        });
    }

    // ===== Init =====
    function init() {
        initAuth();
        initNavigation();
        initAnalysis();
        initSearch();
        initGames();
        initSettings();
    }

    init();
})();
