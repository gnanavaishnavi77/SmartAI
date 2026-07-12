/**
 * Smart AI Chatbot - Frontend Logic
 * Features: Session management, dynamic DOM rendering, markdown formatting,
 * theme toggling, automatic text-area sizing, error handling and status indicators.
 */

document.addEventListener('DOMContentLoaded', () => {
    // API base URL configuration (uses current domain/port, or fallbacks to localhost:5000 for local file/live server dev)
    const API_BASE = (window.location.origin.startsWith('file://') || 
                      ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000'))
        ? 'http://127.0.0.1:5000'
        : window.location.origin;

    // DOM Elements
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const messagesContainer = document.getElementById('messages-container');
    const chatWindow = document.getElementById('chat-window');
    const welcomeScreen = document.getElementById('welcome-screen');
    const typingIndicator = document.getElementById('typing-indicator');
    const charCounter = document.getElementById('char-counter');
    const newChatBtn = document.getElementById('new-chat-btn');
    const sessionsList = document.getElementById('sessions-list');
    const chatTitle = document.getElementById('chat-title');
    const chatSubtitle = document.getElementById('chat-subtitle');
    const deleteChatBtn = document.getElementById('delete-chat-btn');
    
    // Sidebar Controls
    const sidebar = document.getElementById('sidebar');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    
    // Theme & Info Modal Controls
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const themeIconLight = themeToggleBtn.querySelector('.theme-icon-light');
    const themeIconDark = themeToggleBtn.querySelector('.theme-icon-dark');
    const infoBtn = document.getElementById('info-btn');
    const infoModal = document.getElementById('info-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const modalOkBtn = document.getElementById('modal-ok-btn');
    
    // Status Indicators
    const statusDot = document.querySelector('#status-indicator .status-dot');
    const statusText = document.querySelector('#status-indicator .status-text');
    const settingsStatusBadge = document.getElementById('settings-status-badge');
    const toastContainer = document.getElementById('toast-container');

    // App State Variables
    let currentSessionId = localStorage.getItem('current_session_id') || '';
    let isWaitingForResponse = false;
    let isDemoMode = true;

    // ==========================================
    // INITIALIZATION
    // ==========================================
    initApp();

    async function initApp() {
        setupEventListeners();
        loadThemePreference();
        
        // Load sessions list from backend
        await refreshSessionsList();
        
        // If we have an existing session, restore it. Otherwise start fresh.
        if (currentSessionId) {
            await loadSessionHistory(currentSessionId);
        } else {
            startNewSession();
        }

        // Run system check to update API Status displays
        checkSystemStatus();
    }

    // ==========================================
    // THEME & UX
    // ==========================================
    function setupEventListeners() {
        // Send button trigger
        sendBtn.addEventListener('click', handleSendMessage);

        // Input typing logic
        chatInput.addEventListener('input', () => {
            adjustInputHeight();
            updateCharCounter();
            sendBtn.disabled = chatInput.value.trim().length === 0 || isWaitingForResponse;
        });

        // Keypress logic (Enter to send, Shift+Enter for new line)
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!sendBtn.disabled) {
                    handleSendMessage();
                }
            }
        });

        // New Chat Button
        newChatBtn.addEventListener('click', () => {
            startNewSession();
            closeSidebarMobile();
        });

        // Delete Conversation Button
        deleteChatBtn.addEventListener('click', () => {
            if (currentSessionId) {
                handleDeleteSession(currentSessionId);
            }
        });

        // Toggle Sidebar (Mobile)
        sidebarToggleBtn.addEventListener('click', openSidebarMobile);
        sidebarCloseBtn.addEventListener('click', closeSidebarMobile);
        sidebarOverlay.addEventListener('click', closeSidebarMobile);

        // Toggle Theme
        themeToggleBtn.addEventListener('click', toggleTheme);

        // Info Modal Triggers
        infoBtn.addEventListener('click', openModal);
        closeModalBtn.addEventListener('click', closeModal);
        modalOkBtn.addEventListener('click', closeModal);
        infoModal.addEventListener('click', (e) => {
            if (e.target === infoModal) closeModal();
        });

        // Suggestion prompt cards click
        document.querySelectorAll('.suggestion-card').forEach(card => {
            card.addEventListener('click', () => {
                const prompt = card.getAttribute('data-prompt');
                if (prompt) {
                    chatInput.value = prompt;
                    adjustInputHeight();
                    updateCharCounter();
                    sendBtn.disabled = false;
                    chatInput.focus();
                }
            });
        });
    }

    function loadThemePreference() {
        const theme = localStorage.getItem('theme') || 'dark';
        if (theme === 'light') {
            document.body.classList.add('light-mode');
            themeIconLight.classList.add('hidden');
            themeIconDark.classList.remove('hidden');
        } else {
            document.body.classList.remove('light-mode');
            themeIconLight.classList.remove('hidden');
            themeIconDark.classList.add('hidden');
        }
    }

    function toggleTheme() {
        const isLight = document.body.classList.toggle('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        
        if (isLight) {
            themeIconLight.classList.add('hidden');
            themeIconDark.classList.remove('hidden');
            showToast('Theme Changed', 'Switched to Light mode.', 'success');
        } else {
            themeIconLight.classList.remove('hidden');
            themeIconDark.classList.add('hidden');
            showToast('Theme Changed', 'Switched to Dark mode.', 'success');
        }
    }

    function adjustInputHeight() {
        chatInput.style.height = '24px'; // Reset
        chatInput.style.height = (chatInput.scrollHeight - 4) + 'px';
    }

    function updateCharCounter() {
        const length = chatInput.value.length;
        charCounter.textContent = `${length} / 4000`;
    }

    // Mobile Sidebar Control
    function openSidebarMobile() {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('open');
    }

    function closeSidebarMobile() {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('open');
    }

    // Modal Control
    function openModal() {
        infoModal.classList.remove('hidden');
    }

    function closeModal() {
        infoModal.classList.add('hidden');
    }

    // ==========================================
    // TOAST NOTIFICATIONS
    // ==========================================
    function showToast(title, message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let icon = 'info';
        if (type === 'error') icon = 'alert-circle';
        if (type === 'success') icon = 'check-circle';
        if (type === 'warning') icon = 'alert-triangle';

        toast.innerHTML = `
            <i data-lucide="${icon}" class="toast-icon"></i>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close"><i data-lucide="x"></i></button>
        `;

        toastContainer.appendChild(toast);
        lucide.createIcons({ attrs: { class: 'toast-icon' } });
        
        // Setup manual close
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.style.animation = 'fadeOut 0.2s ease forwards';
            setTimeout(() => toast.remove(), 200);
        });

        // Auto remove
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.animation = 'fadeOut 0.2s ease forwards';
                setTimeout(() => toast.remove(), 200);
            }
        }, 5000);
    }

    // ==========================================
    // SYSTEM STATUS & DEMO MODE
    // ==========================================
    async function checkSystemStatus() {
        try {
            // We verify by trying to fetch sessions, which serves as a heartbeat
            const response = await fetch(`${API_BASE}/api/sessions`);
            if (response.ok) {
                // If backend is active, send a dummy metadata verify or assume demo mode based on API key settings
                // For a more comprehensive check, we fetch the last chat session metadata if available.
                // We'll update indicators based on whether openai has credentials.
                
                // Let's call /api/chat with a probe or check settings.
                // Alternatively, we can let user know everything is online.
                statusDot.className = 'status-dot success';
                statusText.textContent = 'Connected';
                
                // Fetch details from backend regarding API configuration state.
                // If demo mode (placeholder key used), we will set to Warning mode.
                updateStatusIndicators(isDemoMode);
            } else {
                throw new Error('Connection failed');
            }
        } catch (e) {
            statusDot.className = 'status-dot error';
            statusText.textContent = 'Offline';
            settingsStatusBadge.textContent = 'Status: Cannot Connect to Backend';
            settingsStatusBadge.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
            settingsStatusBadge.style.color = 'var(--danger-color)';
            showToast('Connection Error', 'Backend server is offline. Run python app.py.', 'error');
        }
    }

    function updateStatusIndicators(demoState) {
        isDemoMode = demoState;
        if (isDemoMode) {
            statusDot.className = 'status-dot warning';
            statusText.textContent = 'Demo Mode';
            settingsStatusBadge.textContent = 'Status: Active (Demo / Simulated API)';
            settingsStatusBadge.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
            settingsStatusBadge.style.color = 'var(--warning-color)';
        } else {
            statusDot.className = 'status-dot success';
            statusText.textContent = 'Connected';
            settingsStatusBadge.textContent = 'Status: Configured (OpenAI GPT Active)';
            settingsStatusBadge.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
            settingsStatusBadge.style.color = 'var(--success-color)';
        }
    }

    // ==========================================
    // CHAT & SESSION BUSINESS LOGIC
    // ==========================================

    function startNewSession() {
        currentSessionId = '';
        localStorage.removeItem('current_session_id');
        
        // Show Welcome Screen
        messagesContainer.innerHTML = '';
        welcomeScreen.classList.remove('hidden');
        
        // Update Titles
        chatTitle.textContent = 'New Conversation';
        chatSubtitle.textContent = 'Start a conversation with Smart AI';
        deleteChatBtn.classList.add('hidden');

        // Clear active classes in sidebar
        document.querySelectorAll('.session-item').forEach(item => {
            item.classList.remove('active');
        });

        chatInput.focus();
    }

    async function refreshSessionsList() {
        try {
            const response = await fetch(`${API_BASE}/api/sessions`);
            if (!response.ok) throw new Error('Failed to load sessions');
            
            const sessions = await response.json();
            sessionsList.innerHTML = '';

            if (sessions.length === 0) {
                sessionsList.innerHTML = `
                    <div style="padding: 1rem 0; font-size: 0.8rem; color: var(--text-muted); text-align: center;">
                        No previous chats
                    </div>
                `;
                return;
            }

            sessions.forEach(session => {
                const isActive = session.session_id === currentSessionId;
                const div = document.createElement('div');
                div.className = `session-item ${isActive ? 'active' : ''}`;
                div.setAttribute('data-id', session.session_id);

                div.innerHTML = `
                    <div class="session-item-content">
                        <i data-lucide="message-square" class="session-item-icon"></i>
                        <span class="session-item-text">${escapeHTML(session.last_message || 'Empty Chat')}</span>
                    </div>
                    <button class="btn-icon session-delete-btn" title="Delete Conversation" aria-label="Delete Session">
                        <i data-lucide="trash-2"></i>
                    </button>
                `;

                // Load session click listener
                div.querySelector('.session-item-content').addEventListener('click', () => {
                    selectSession(session.session_id);
                });

                // Delete session click listener
                div.querySelector('.session-delete-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleDeleteSession(session.session_id);
                });

                sessionsList.appendChild(div);
            });

            lucide.createIcons();
        } catch (err) {
            console.error(err);
            sessionsList.innerHTML = `
                <div style="padding: 1rem 0; font-size: 0.8rem; color: var(--danger-color); text-align: center;">
                    Error loading conversations.
                </div>
            `;
        }
    }

    async function selectSession(sessionId) {
        currentSessionId = sessionId;
        localStorage.setItem('current_session_id', sessionId);
        
        // Highlight active session
        document.querySelectorAll('.session-item').forEach(item => {
            if (item.getAttribute('data-id') === sessionId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Load History
        await loadSessionHistory(sessionId);
        closeSidebarMobile();
    }

    async function loadSessionHistory(sessionId) {
        try {
            messagesContainer.innerHTML = '';
            welcomeScreen.classList.add('hidden');
            showTypingIndicator();

            const response = await fetch(`${API_BASE}/api/history/${sessionId}`);
            hideTypingIndicator();

            if (!response.ok) throw new Error('Failed to load chat history');

            const history = await response.json();
            
            if (history.length === 0) {
                startNewSession();
                return;
            }

            // Set Chat Title to the first message's preview
            const firstMsg = history[0].user_message || 'Chat';
            chatTitle.textContent = firstMsg.length > 30 ? firstMsg.substring(0, 30) + '...' : firstMsg;
            
            // Set dynamic subtitle based on model used
            const lastMsg = history[history.length - 1];
            const isSim = lastMsg?.metadata?.simulated ?? true;
            chatSubtitle.textContent = isSim ? 'Demo Mode' : 'Connected to GPT-4';
            updateStatusIndicators(isSim);

            // Show delete button for active conversation
            deleteChatBtn.classList.remove('hidden');

            history.forEach(entry => {
                appendMessageToUI('user', entry.user_message, entry.timestamp, entry.id);
                appendMessageToUI('bot', entry.bot_response, entry.timestamp, entry.id, entry.metadata);
            });

            scrollToBottom();
        } catch (err) {
            hideTypingIndicator();
            showToast('History Error', 'Failed to retrieve conversation history.', 'error');
            console.error(err);
        }
    }

    async function handleDeleteSession(sessionId) {
        if (!confirm('Are you sure you want to permanently delete this conversation?')) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/api/sessions/${sessionId}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete session');

            showToast('Chat Deleted', 'The conversation was permanently removed.', 'success');
            
            // If the deleted session was the current active one, reset
            if (sessionId === currentSessionId) {
                startNewSession();
            }

            await refreshSessionsList();
        } catch (err) {
            showToast('Delete Error', 'Could not delete conversation from server.', 'error');
            console.error(err);
        }
    }

    async function handleSendMessage() {
        const text = chatInput.value.trim();
        if (!text || isWaitingForResponse) return;

        // Reset input immediately for positive UI response
        chatInput.value = '';
        adjustInputHeight();
        updateCharCounter();
        sendBtn.disabled = true;

        // Hide welcome screen if showing
        welcomeScreen.classList.add('hidden');

        // Append user message immediately
        const userTime = new Date().toISOString();
        const userMsgEl = appendMessageToUI('user', text, userTime);
        scrollToBottom();

        // Lock interface
        isWaitingForResponse = true;
        showTypingIndicator();

        try {
            const payload = {
                message: text,
                session_id: currentSessionId,
                metadata: {
                    client_agent: "Smart AI UI",
                    screen_size: `${window.innerWidth}x${window.innerHeight}`
                }
            };

            const response = await fetch(`${API_BASE}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            hideTypingIndicator();

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Server error. Please check configuration.');
            }

            const data = await response.json();
            
            // If we generated a new session, store it
            if (!currentSessionId && data.session_id) {
                currentSessionId = data.session_id;
                localStorage.setItem('current_session_id', data.session_id);
                
                // Update Chat Title
                chatTitle.textContent = text.length > 30 ? text.substring(0, 30) + '...' : text;
                
                // Show delete button
                deleteChatBtn.classList.remove('hidden');
            }

            // Update status indicator based on whether OpenAI API is configured
            updateStatusIndicators(data.simulated);
            chatSubtitle.textContent = data.simulated ? 'Demo Mode' : 'Connected to GPT-4';

            // Bind the assigned ID to the user message element
            if (userMsgEl && data.id) {
                userMsgEl.setAttribute('data-message-id', data.id);
                addDeleteButtonToElement(userMsgEl, data.id);
            }

            // Append bot message to UI
            appendMessageToUI('bot', data.bot_response, data.timestamp, data.id, { simulated: data.simulated });
            scrollToBottom();

            // Refresh sessions list
            await refreshSessionsList();

        } catch (err) {
            hideTypingIndicator();
            showToast('Chat Error', err.message, 'error');
            
            // Append error message to chat window for clarity
            appendMessageToUI('bot', `⚠️ **Error**: ${err.message}\n\nPlease check that your backend Flask server is running and your API Key is correctly configured in \`backend/app.py\`.`, new Date().toISOString(), { error: true });
            scrollToBottom();
        } finally {
            isWaitingForResponse = false;
            chatInput.focus();
        }
    }

    // ==========================================
    // UI DOM MANIPULATIONS
    // ==========================================

    function appendMessageToUI(sender, text, timestamp, id = null, metadata = {}) {
        // Handle case where metadata is passed in place of id (e.g. error/simulated fallback logs)
        if (id && typeof id === 'object') {
            metadata = id;
            id = null;
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        if (id) {
            messageDiv.setAttribute('data-message-id', id);
        }

        const formattedTime = formatTimestamp(timestamp);

        let avatarIcon = sender === 'user' ? 'user' : 'bot';
        if (metadata && metadata.error) avatarIcon = 'alert-triangle';

        let innerContent = `
            <div class="message-avatar">
                <i data-lucide="${avatarIcon}"></i>
            </div>
            <div class="message-bubble">
                <div class="message-content">${formatMarkdown(text)}</div>
                <div class="message-meta">
                    <span>${formattedTime}</span>
        `;

        if (sender === 'bot') {
            const isSim = metadata?.simulated ?? true;
            innerContent += `
                <span>•</span>
                <span>${isSim ? 'Demo' : 'GPT-4'}</span>
            `;
        }

        innerContent += `
                </div>
            </div>
        `;

        messageDiv.innerHTML = innerContent;
        messagesContainer.appendChild(messageDiv);

        if (id) {
            addDeleteButtonToElement(messageDiv, id);
        }
        
        // Render newly added Lucide icons
        lucide.createIcons({
            nameAttr: 'data-lucide',
            attrs: { class: 'msg-icon' }
        });

        return messageDiv;
    }

    function addDeleteButtonToElement(element, id) {
        if (!id) return;
        
        // Remove existing overlay if any to prevent duplicate buttons
        const existing = element.querySelector('.message-actions-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'message-actions-overlay';
        overlay.innerHTML = `
            <button class="msg-delete-btn" title="Delete message turn" data-id="${id}">
                <i data-lucide="trash-2"></i>
            </button>
        `;
        
        // Add click listener
        overlay.querySelector('.msg-delete-btn').addEventListener('click', () => {
            handleDeleteMessage(id);
        });

        element.appendChild(overlay);
        lucide.createIcons({ nameAttr: 'data-lucide' });
    }

    async function handleDeleteMessage(messageId) {
        if (!confirm('Are you sure you want to delete this conversation turn (both the question and the response) from your history?')) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/api/chat/${messageId}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete message');

            showToast('Message Deleted', 'The conversation turn has been removed.', 'success');

            // Find all DOM elements with this message ID (both user bubble and bot bubble) and animate delete
            const elements = document.querySelectorAll(`[data-message-id="${messageId}"]`);
            elements.forEach(el => {
                el.style.transition = 'all 0.3s ease';
                el.style.opacity = '0';
                el.style.transform = 'translateY(10px)';
                setTimeout(() => {
                    el.remove();
                    // Show welcome screen if timeline becomes empty
                    if (messagesContainer.children.length === 0) {
                        welcomeScreen.classList.remove('hidden');
                        chatTitle.textContent = 'New Conversation';
                        chatSubtitle.textContent = 'Start a conversation with Smart AI';
                    }
                }, 300);
            });

            // Refresh sessions list
            await refreshSessionsList();

        } catch (err) {
            showToast('Delete Error', 'Could not delete the message from database.', 'error');
            console.error(err);
        }
    }

    function showTypingIndicator() {
        typingIndicator.classList.remove('hidden');
        scrollToBottom();
    }

    function hideTypingIndicator() {
        typingIndicator.classList.add('hidden');
    }

    function scrollToBottom() {
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    // ==========================================
    // HELPERS & FORMATTERS
    // ==========================================

    function escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatTimestamp(isoString) {
        try {
            const date = new Date(isoString);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return '';
        }
    }

    /**
     * Extremely lightweight markdown-to-HTML parser.
     * Safely handles paragraphs, bold, code blocks, and list elements.
     */
    function formatMarkdown(text) {
        if (!text) return '';
        
        let html = escapeHTML(text);

        // Code blocks: ```python ... ```
        html = html.replace(/```(?:[a-zA-Z0-9]+)?\s*([\s\S]*?)\s*```/g, (match, code) => {
            return `<pre><code>${code.trim()}</code></pre>`;
        });

        // Inline Code: `code`
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Bold: **text**
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Italic: *text*
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // Unordered lists: starting with "- " or "* " (multi-line parse)
        // Group together consecutive lists
        html = html.split('\n').map(line => {
            const trim = line.trim();
            if (trim.startsWith('- ') || trim.startsWith('* ')) {
                return `<li>${trim.substring(2)}</li>`;
            }
            return line;
        }).join('\n');
        
        // Wrap consecutive <li> tags in <ul> (handles optional spaces/newlines between <li> elements)
        html = html.replace(/((?:<li>.*?<\/li>\s*)+)/g, '<ul>$1</ul>');

        // Paragraphs: double linebreaks
        html = html.split('\n\n').map(p => {
            if (p.trim().startsWith('<pre>') || p.trim().startsWith('<ul>') || p.trim().startsWith('<li>')) {
                return p;
            }
            return `<p>${p.replace(/\n/g, '<br>')}</p>`;
        }).join('');

        return html;
    }
});
