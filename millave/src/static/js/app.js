function applyTexture(textureName) {
    const validTextures = ['none', 'noise', 'velvet', 'stars', 'geometric', 'frost', 'parchment', 'water', 'carbon'];
    document.body.classList.remove(
        'u-bg-none', 'u-bg-noise', 'u-bg-velvet', 'u-bg-stars',
        'u-bg-geometric', 'u-bg-frost', 'u-bg-parchment', 'u-bg-water', 'u-bg-carbon'
    );
    if (textureName && validTextures.includes(textureName)) {
        document.body.classList.add(`u-bg-${textureName}`);
    } else {
        document.body.classList.add('u-bg-noise');
    }
}

async function loadTexture() {
    try {
        const config = await API.get('/api/config');
        applyTexture(config.background_texture || 'noise');
    } catch (e) {
        applyTexture('noise');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const app = document.getElementById('app');

    window.addEventListener('beforeunload', () => {
        sessionStorage.removeItem('millave_token');
    });

    try {
        const health = await API.get('/api/health');

        try { await loadTexture(); } catch (e) { applyTexture('noise'); }

        if (!health.vault_exists) {
            renderInitScreen(app);
        } else {
            try {
                const lockStatus = await API.get('/api/auth/lock-status');
                if (lockStatus.locked) {
                    renderLockScreen(app);
                    setTimeout(() => {
                        startLockoutCountdown(lockStatus.remaining_seconds, app);
                    }, 100);
                    return;
                }
            } catch (e) {}
            renderLockScreen(app);
        }
    } catch (e) {
        app.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:var(--space-md)">
                <p style="color:var(--state-error);font-family:var(--font-body);font-size:0.9rem">error de conexión con el servidor</p>
            </div>
        `;
    }
});

function renderInitScreen(app) {
    app.innerHTML = `
        <div class="u-init-screen">
            <div class="u-key-body" id="initKey">
                <div class="u-franja" style="background:transparent"></div>
                <div class="u-display" id="initDisplay">
                    <p class="u-display-label">primera vez</p>
                </div>
            </div>
            <div class="u-init-form" id="initForm">
                <div class="u-field-group">
                    <input type="password" class="u-input u-input--mono" id="passwordField"
                        placeholder="define tu clave maestra" autocomplete="off">
                    <p class="u-strength" id="strengthText"></p>
                </div>
                <div class="u-field-group" id="confirmGroup" style="display:none">
                    <input type="password" class="u-input u-input--mono" id="confirmField"
                        placeholder="confirma tu clave maestra" autocomplete="off">
                    <p class="u-match" id="matchText"></p>
                </div>
                <button class="u-btn u-btn--primary" id="createBtn" disabled>crear vault</button>
            </div>
        </div>
    `;

    const passwordField = document.getElementById('passwordField');
    const confirmField = document.getElementById('confirmField');
    const confirmGroup = document.getElementById('confirmGroup');
    const strengthText = document.getElementById('strengthText');
    const matchText = document.getElementById('matchText');
    const createBtn = document.getElementById('createBtn');

    let password = '';
    let confirmPassword = '';

    function getStrength(pw) {
        if (pw.length < 6) return { level: 'débil', color: 'var(--state-error)' };
        if (pw.length < 10) return { level: 'aceptable', color: 'var(--state-warning)' };
        if (pw.length < 12 || !/[!@#$%^&*(),.?":{}|<>]/.test(pw)) return { level: 'fuerte', color: 'var(--state-success)' };
        return { level: 'robusta', color: 'var(--state-success)' };
    }

    passwordField.addEventListener('input', (e) => {
        password = e.target.value;
        if (password.length > 0) {
            const strength = getStrength(password);
            strengthText.textContent = `fortaleza: ${strength.level}`;
            strengthText.style.color = strength.color;
            confirmGroup.style.display = 'block';
        } else {
            strengthText.textContent = '';
            confirmGroup.style.display = 'none';
        }
        validateForm();
    });

    confirmField.addEventListener('input', (e) => {
        confirmPassword = e.target.value;
        if (confirmPassword.length > 0) {
            if (confirmPassword === password) {
                matchText.textContent = 'coinciden';
                matchText.style.color = 'var(--state-success)';
            } else {
                matchText.textContent = 'no coinciden';
                matchText.style.color = 'var(--state-error)';
            }
        } else {
            matchText.textContent = '';
        }
        validateForm();
    });

    function validateForm() {
        const isValid = password.length >= 6 && password === confirmPassword;
        createBtn.disabled = !isValid;
    }

    createBtn.addEventListener('click', async () => {
        createBtn.disabled = true;
        createBtn.textContent = 'creando vault...';

        try {
            const res = await API.post('/api/vault/create', { password: password });
            if (res.status === 'created') {
                renderPhraseScreen(app, res.recovery_phrase, password);
            }
        } catch (e) {
            createBtn.disabled = false;
            createBtn.textContent = 'crear vault';
        }
    });
}

function renderPhraseScreen(app, phrase, password) {
    app.innerHTML = `
        <div class="u-init-screen">
            <div class="u-key-body" id="initKey" style="animation: successPulse 0.4s ease">
                <div class="u-franja" style="background:var(--franja-finanzas)"></div>
                <div class="u-display" id="initDisplay">
                    <p class="u-display-title">tu frase de recuperación</p>
                    <div class="u-phrase-grid">
                        ${phrase.map((word, i) => `<span class="u-phrase-word" style="animation-delay:${i * 30}ms">${i + 1}. ${word}</span>`).join('')}
                    </div>
                    <div class="u-phrase-instructions">
                        <p>escribe esta frase en un papel y guárdala en un lugar seguro. es tu única forma de recuperar tu vault si olvidas tu clave.</p>
                        <p>esta frase no se almacena en millave, ni en ningún servidor. solo existe en tu papel.</p>
                    </div>
                </div>
            </div>
            <div class="u-init-form">
                <button class="u-btn u-btn--secondary" id="copyPhraseBtn">copiar frase</button>
                <button class="u-btn u-btn--primary" id="enterBtn">entrar a millave</button>
            </div>
        </div>
    `;

    const copyPhraseBtn = document.getElementById('copyPhraseBtn');
    copyPhraseBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(phrase.join(' '));
            copyPhraseBtn.textContent = 'copiado';
            copyPhraseBtn.style.color = 'var(--state-success)';
            setTimeout(() => {
                copyPhraseBtn.textContent = 'copiar frase';
                copyPhraseBtn.style.color = '';
            }, 3000);
        } catch (e) {
            // fallback: seleccionar texto
        }
    });

    const enterBtn = document.getElementById('enterBtn');
    enterBtn.addEventListener('click', async () => {
        try {
            const res = await API.post('/api/auth/login', { password: password });
            if (res.authenticated) {
                await loadTexture();
                renderMainView(app);
            }
        } catch (e) {
            // error
        }
    });
}

function renderMainView(app) {
    app.innerHTML = `
        <div class="u-main-layout">
            <div class="u-search-panel">
                <input type="text" class="u-search" id="searchField"
                    placeholder="encontrar llave" autocomplete="off">
                <div class="u-results" id="resultsList"></div>
            </div>
            <div class="u-key-panel">
                <div class="u-key-body u-key--resting u-key-pulse" id="mainKey">
                    <div class="u-franja" id="keyFranja" style="background:var(--franja-general)"></div>
                    <div class="u-display" id="keyDisplay">
                        <p class="u-display-empty-title">sin llaves aún</p>
                        <p class="u-display-empty-sub">comienza buscando o agregando credenciales</p>
                    </div>
                </div>
            </div>
        </div>
        <div class="u-actions-bar">
            <button class="u-actions-btn" id="settingsBtn">configurar</button>
            <button class="u-actions-btn" id="categoriesBtn">categorias</button>
            <button class="u-actions-btn u-actions-btn--primary" id="newKeyBtn">nueva llave</button>
            <button class="u-actions-btn" id="logoutBtn">cerrar sesion</button>
        </div>
    `;

    const textures = [
        { id: 'none', name: 'ninguna' },
        { id: 'noise', name: 'grano' },
        { id: 'velvet', name: 'terciopelo' },
        { id: 'stars', name: 'estrellas' },
        { id: 'geometric', name: 'geometrico' },
        { id: 'frost', name: 'cristal' },
        { id: 'parchment', name: 'pergamino' },
        { id: 'water', name: 'agua' },
        { id: 'carbon', name: 'carbono' }
    ];

    const textureStrip = document.createElement('div');
    textureStrip.className = 'u-texture-strip';
    textureStrip.innerHTML = `
        <button class="u-texture-arrow u-texture-arrow--left" id="texLeft">&#8249;</button>
        <div class="u-texture-strip-viewport" id="texViewport">
            <div class="u-texture-strip-scroll" id="texScroll">
                ${textures.map(t => `
                    <div class="u-texture-chip" data-texture="${t.id}" title="${t.name}">
                        <div class="u-texture-chip-preview u-texture-chip--${t.id}"></div>
                        <span class="u-texture-chip-label">${t.name}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        <button class="u-texture-arrow u-texture-arrow--right" id="texRight">&#8250;</button>
    `;
    document.body.appendChild(textureStrip);

    const currentTex = document.body.className.match(/u-bg-(\w+)/);
    if (currentTex) {
        const active = textureStrip.querySelector(`[data-texture="${currentTex[1]}"]`);
        if (active) active.classList.add('u-texture-chip--active');
    }

    textureStrip.querySelectorAll('.u-texture-chip').forEach(chip => {
        chip.addEventListener('click', async () => {
            textureStrip.querySelectorAll('.u-texture-chip').forEach(c => c.classList.remove('u-texture-chip--active'));
            chip.classList.add('u-texture-chip--active');
            applyTexture(chip.dataset.texture);
            try { await API.patch('/api/config', { background_texture: chip.dataset.texture }); } catch (e) {}
        });
    });

    const viewport = document.getElementById('texViewport');
    const arrowLeft = document.getElementById('texLeft');
    const arrowRight = document.getElementById('texRight');
    const scrollAmount = 200;

    function updateArrows() {
        arrowLeft.style.opacity = viewport.scrollLeft <= 5 ? '0.3' : '1';
        arrowLeft.style.pointerEvents = viewport.scrollLeft <= 5 ? 'none' : 'auto';
        const maxScroll = viewport.scrollWidth - viewport.clientWidth;
        arrowRight.style.opacity = viewport.scrollLeft >= maxScroll - 5 ? '0.3' : '1';
        arrowRight.style.pointerEvents = viewport.scrollLeft >= maxScroll - 5 ? 'none' : 'auto';
    }

    arrowLeft.addEventListener('click', () => {
        viewport.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
        setTimeout(updateArrows, 350);
    });

    arrowRight.addEventListener('click', () => {
        viewport.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        setTimeout(updateArrows, 350);
    });

    viewport.addEventListener('scroll', updateArrows);
    setTimeout(updateArrows, 100);

    const searchField = document.getElementById('searchField');
    const resultsList = document.getElementById('resultsList');
    const keyDisplay = document.getElementById('keyDisplay');
    const keyFranja = document.getElementById('keyFranja');
    const mainKey = document.getElementById('mainKey');
    const logoutBtn = document.getElementById('logoutBtn');

    let debounceTimer = null;
    let searchAbortController = null;

    searchField.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(debounceTimer);

        if (!query) {
            resultsList.innerHTML = '';
            resetKey();
            return;
        }

        debounceTimer = setTimeout(async () => {
            if (searchAbortController) {
                searchAbortController.abort();
            }
            searchAbortController = new AbortController();

            try {
                const res = await fetch(`/api/vault/search?q=${encodeURIComponent(query)}`, {
                    signal: searchAbortController.signal
                });
                const data = await res.json();
                renderResults(data.results, resultsList, keyDisplay, keyFranja, mainKey, app);
            } catch (e) {
                if (e.name !== 'AbortError') {
                    resultsList.innerHTML = '<p class="u-results-empty">error de búsqueda</p>';
                }
            }
        }, 150);
    });

    logoutBtn.addEventListener('click', async () => {
        try { await API.post('/api/auth/logout'); } catch (e) {}
        if (app.stopInactivityTimer) app.stopInactivityTimer();
        sessionStorage.removeItem('millave_token');
        app.session_token = null;
        app.currentEntry = null;
        app.allEntries = [];
        renderLockScreen(app);
    });

    const newKeyBtn = document.getElementById('newKeyBtn');
    newKeyBtn.addEventListener('click', () => openCreateModal(app));

    const categoriesBtn = document.getElementById('categoriesBtn');
    if (categoriesBtn) {
        categoriesBtn.addEventListener('click', () => openCategoriesPanel(app));
    }

    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => openSettingsPanel(app));
    }

    loadSecurityConfig(app);
    setupInactivityTimer(app);
}

async function loadSecurityConfig(app) {
    try {
        const config = await API.get('/api/auth/config');
        app.securityConfig = config;
    } catch (e) {
        app.securityConfig = {
            inactivity_timeout: 300,
            max_attempts: 5,
            lock_duration: 300,
            clipboard_clear_time: 30,
            password_visible_duration: 5
        };
    }
}

function setupInactivityTimer(app) {
    let inactivityTimer = null;
    const config = app.securityConfig || { inactivity_timeout: 300 };

    function resetTimer() {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            if (app.stopInactivityTimer) app.stopInactivityTimer();
            sessionStorage.removeItem('millave_token');
            app.session_token = null;
            app.currentEntry = null;
            app.allEntries = [];
            renderLockScreen(app);
        }, config.inactivity_timeout * 1000);
    }

    const events = ['keydown', 'mousedown', 'touchstart', 'scroll', 'focus'];
    events.forEach(event => {
        document.addEventListener(event, resetTimer, { passive: true });
    });

    resetTimer();

    app.stopInactivityTimer = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        events.forEach(event => {
            document.removeEventListener(event, resetTimer);
        });
    };
}

function renderResults(results, container, keyDisplay, keyFranja, mainKey, app) {
    if (results.length === 0) {
        container.innerHTML = '<p class="u-results-empty">no se encontraron llaves</p>';
        return;
    }

    container.innerHTML = results.map((entry, i) => `
        <div class="u-result-item" data-id="${entry.id}" style="animation-delay:${Math.min(i * 50, 500)}ms">
            <div class="u-result-title">${entry.title}</div>
            <div class="u-result-meta">
                ${entry.username ? `<span class="u-result-username">${entry.username}</span>` : ''}
                ${entry.username && entry.category_name ? `<span class="u-result-dot">·</span>` : ''}
                ${entry.category_name ? `<span class="u-result-category" style="color:${entry.category_color}">${entry.category_name}</span>` : ''}
            </div>
        </div>
    `).join('');

    container.classList.add('u-stagger');

    container.querySelectorAll('.u-result-item').forEach(item => {
        item.addEventListener('click', async () => {
            const id = item.dataset.id;
            container.querySelectorAll('.u-result-item').forEach(r => r.classList.remove('u-result-item--selected'));
            item.classList.add('u-result-item--selected');

            try {
                const entry = await API.get(`/api/vault/entries/${id}`);
                app.currentEntry = entry;
                transformKey(entry, keyDisplay, keyFranja, mainKey, app);
            } catch (e) {
                // error silencioso
            }
        });
    });
}

function transformKey(entry, keyDisplay, keyFranja, mainKey, app) {
    let passwordHideTimer = null;
    let isPasswordVisible = false;

    keyFranja.style.background = entry.category_color || 'var(--franja-general)';

    let html = `
        <div class="u-display-zone u-display-zone--superior">
            <p class="u-display-title">${entry.title}</p>
            ${entry.category_name ? `<p class="u-display-category" style="color:${entry.category_color}">${entry.category_name.toUpperCase()}</p>` : ''}
        </div>
        <div class="u-display-separator"></div>
        <div class="u-display-zone u-display-zone--central">
    `;

    if (entry.username) {
        html += `
            <div class="u-display-field">
                <span class="u-display-label">usuario</span>
                <div class="u-display-value-row">
                    <span class="u-display-value">${entry.username}</span>
                    <button class="u-btn-copy" data-value="${entry.username}" title="copiar">copiar</button>
                </div>
            </div>
        `;
    }

    html += `
        <div class="u-display-field">
            <span class="u-display-label">contraseña</span>
            <div class="u-display-value-row">
                <span class="u-display-value u-display-password" id="entryPassword">●●●●●●●●●●</span>
                <button class="u-btn-toggle" id="togglePassword" title="mostrar">mostrar</button>
                <button class="u-btn-copy" data-value="${entry.password}" title="copiar">copiar</button>
            </div>
        </div>
    `;

    if (entry.url) {
        html += `
            <div class="u-display-field">
                <span class="u-display-label">url</span>
                <div class="u-display-value-row">
                    <a class="u-display-link" href="${entry.url}" target="_blank" rel="noopener">${entry.url}</a>
                    <button class="u-btn-copy" data-value="${entry.url}" title="copiar">copiar</button>
                </div>
            </div>
        `;
    }

    html += `</div>`;

    const hasLowerZone = entry.notes || entry.created_at || entry.support_contact || (entry.account_status && entry.account_status !== 'active');

    if (hasLowerZone) {
        html += `<div class="u-display-separator"></div>`;
        html += `<div class="u-display-zone u-display-zone--inferior">`;

        if (entry.notes) {
            html += `
                <div class="u-display-field">
                    <span class="u-display-label">notas</span>
                    <p class="u-display-notes">${entry.notes}</p>
                </div>
            `;
        }

        if (entry.created_at) {
            const createdDate = new Date(entry.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
            html += `<p class="u-display-dates">cuenta desde: ${createdDate}</p>`;
        }

        if (entry.updated_at && entry.updated_at !== entry.created_at) {
            const updatedDate = new Date(entry.updated_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
            html += `<p class="u-display-dates">ultima actualizacion: ${updatedDate}</p>`;
        }

        if (entry.support_contact) {
            const isEmail = entry.support_contact.includes('@');
            html += `<p class="u-display-dates">soporte: ${isEmail ? `<a href="mailto:${entry.support_contact}">${entry.support_contact}</a>` : entry.support_contact}</p>`;
        }

        if (entry.account_status && entry.account_status !== 'active') {
            const statusColors = {
                'inactive': 'background:rgba(255,255,255,0.05);color:var(--text-muted)',
                'suspended': 'background:rgba(234,179,8,0.1);color:var(--state-warning)',
                'trial': 'background:rgba(59,130,246,0.1);color:var(--state-info)',
                'closed': 'background:rgba(239,68,68,0.1);color:var(--state-error)'
            };
            const statusStyle = statusColors[entry.account_status] || statusColors['inactive'];
            html += `<span class="u-display-badge" style="${statusStyle}">${entry.account_status}</span>`;
        }

        html += `<button class="u-display-edit-btn" id="editEntryBtn">editar</button>`;

        html += `</div>`;
    } else {
        html += `<div class="u-display-separator"></div>`;
        html += `<div class="u-display-zone u-display-zone--inferior">`;
        html += `<button class="u-display-edit-btn" id="editEntryBtn">editar</button>`;
        html += `</div>`;
    }

    keyDisplay.innerHTML = html;

    const displayZones = keyDisplay.querySelectorAll('.u-display-zone');
    displayZones.forEach(zone => zone.classList.add('u-stagger'));

    const editBtn = document.getElementById('editEntryBtn');
    if (editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openCredentialModal(app, 'edit', entry);
        });
    }

    mainKey.classList.remove('u-key--resting', 'u-key-pulse');
    mainKey.classList.add('u-key--active');

    keyDisplay.querySelectorAll('.u-btn-copy').forEach(btn => {
        btn.addEventListener('click', async () => {
            const value = btn.dataset.value;
            try {
                await navigator.clipboard.writeText(value);
                btn.textContent = 'copiado';
                btn.classList.add('u-btn-copy--copied');
                mainKey.classList.add('key-pulse--success');
                setTimeout(() => mainKey.classList.remove('key-pulse--success'), 400);
                setTimeout(async () => {
                    try {
                        const current = await navigator.clipboard.readText();
                        if (current === value) {
                            await navigator.clipboard.writeText('');
                        }
                    } catch (e) {}
                }, 30000);
                setTimeout(() => {
                    btn.textContent = 'copiar';
                    btn.classList.remove('u-btn-copy--copied');
                }, 1500);
            } catch (e) {
                const range = document.createRange();
                range.selectNodeContents(btn.previousElementSibling);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
            }
        });
    });

    const togglePassword = document.getElementById('togglePassword');
    const passwordEl = document.getElementById('entryPassword');
    if (togglePassword && passwordEl) {
        togglePassword.addEventListener('click', () => {
            isPasswordVisible = !isPasswordVisible;
            if (isPasswordVisible) {
                passwordEl.textContent = entry.password;
                passwordEl.classList.add('u-display-password--visible');
                togglePassword.textContent = 'ocultar';
                clearTimeout(passwordHideTimer);
                passwordHideTimer = setTimeout(() => {
                    passwordEl.textContent = '●●●●●●●●●●';
                    passwordEl.classList.remove('u-display-password--visible');
                    togglePassword.textContent = 'mostrar';
                    isPasswordVisible = false;
                }, 5000);
            } else {
                passwordEl.textContent = '●●●●●●●●●●';
                passwordEl.classList.remove('u-display-password--visible');
                togglePassword.textContent = 'mostrar';
                clearTimeout(passwordHideTimer);
            }
        });
    }
}

function resetKey() {
    const keyDisplay = document.getElementById('keyDisplay');
    const keyFranja = document.getElementById('keyFranja');
    const mainKey = document.getElementById('mainKey');

    if (keyDisplay) {
        keyDisplay.innerHTML = `
            <p class="u-display-empty-title">sin llaves aún</p>
            <p class="u-display-empty-sub">comienza buscando o agregando credenciales</p>
        `;
    }
    if (keyFranja) keyFranja.style.background = 'var(--franja-general)';
    if (mainKey) {
        mainKey.classList.remove('u-key--active');
        mainKey.classList.add('u-key--resting', 'u-key-pulse');
    }
}

function renderLockScreen(app) {
    app.innerHTML = `
        <div class="u-lock-screen">
            <div class="u-lock-header">
                <h1 class="u-lock-title">Millave</h1>
                <p class="u-lock-subtitle">MI SOBERANÍA DIGITAL</p>
            </div>
            <div class="u-lock-form">
                <p class="u-lock-label">ingresa tu clave</p>
                <input type="password" class="u-lock-input" id="masterPassword" placeholder="contraseña maestra" autocomplete="off">
                <p class="u-lock-error" id="lockError"></p>
                <button class="u-lock-btn" id="unlockBtn">abrir</button>
                <a href="#" class="u-lock-forgot" id="forgotPasswordLink">¿olvidaste tu contraseña?</a>
            </div>
        </div>
    `;

    const passwordField = document.getElementById('masterPassword');
    const lockBtn = document.getElementById('unlockBtn');
    const lockError = document.getElementById('lockError');
    const lockForm = document.querySelector('.u-lock-form');

    passwordField.focus();

    document.getElementById('forgotPasswordLink').addEventListener('click', (e) => {
        e.preventDefault();
        openRecoveryPanel(app);
    });

    passwordField.addEventListener('input', () => {
        lockError.textContent = '';
        lockError.style.color = '';
    });

    passwordField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            lockBtn.click();
        }
    });

    lockBtn.addEventListener('click', async () => {
        const password = passwordField.value;
        if (!password) return;

        lockBtn.disabled = true;
        lockBtn.textContent = 'abriendo...';

        try {
            const res = await API.post('/api/auth/login', { password: password });

            if (res.authenticated) {
                sessionStorage.setItem('millave_token', res.token);
                await loadTexture();
                renderMainView(app);
            } else if (res.locked) {
                startLockoutCountdown(res.lock_duration, app);
            } else {
                const remaining = res.attemptsRemaining || 0;
                const errorMsg = remaining > 0
                    ? `contraseña incorrecta. ${remaining} intentos restantes.`
                    : 'contraseña incorrecta.';

                lockForm.classList.add('u-lock-form--error');
                lockError.textContent = errorMsg;
                lockError.style.color = 'var(--state-error)';

                passwordField.value = '';
                lockBtn.disabled = false;
                lockBtn.textContent = 'abrir';

                setTimeout(() => {
                    lockForm.classList.remove('u-lock-form--error');
                    lockError.textContent = '';
                    lockError.style.color = '';
                }, 3000);
            }
        } catch (e) {
            lockError.textContent = 'error de conexión';
            lockError.style.color = 'var(--state-error)';
            lockBtn.disabled = false;
            lockBtn.textContent = 'abrir';
        }
    });

    checkLockStatus();
}

function startLockoutCountdown(seconds, app) {
    let remaining = seconds;

    const passwordField = document.getElementById('masterPassword');
    const lockBtn = document.getElementById('unlockBtn');
    const lockError = document.getElementById('lockError');

    if (passwordField) {
        passwordField.disabled = true;
        passwordField.style.opacity = '0.3';
        passwordField.style.cursor = 'not-allowed';
    }
    if (lockBtn) {
        lockBtn.disabled = true;
        lockBtn.style.opacity = '0.3';
        lockBtn.style.cursor = 'not-allowed';
        lockBtn.textContent = 'acceso bloqueado';
    }
    if (lockError) {
        lockError.textContent = '';
    }

    const countdownInterval = setInterval(() => {
        remaining--;

        if (remaining <= 0) {
            clearInterval(countdownInterval);
            if (passwordField) {
                passwordField.disabled = false;
                passwordField.style.opacity = '1';
                passwordField.style.cursor = 'text';
                passwordField.value = '';
                passwordField.focus();
            }
            if (lockBtn) {
                lockBtn.disabled = false;
                lockBtn.style.opacity = '1';
                lockBtn.style.cursor = 'pointer';
                lockBtn.textContent = 'abrir';
            }
            if (lockError) {
                lockError.textContent = '';
            }
            return;
        }

        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        const display = `${mins}:${secs.toString().padStart(2, '0')}`;

        if (lockError) {
            lockError.textContent = `acceso bloqueado. espera ${display}`;
            lockError.style.color = 'var(--state-error)';
        }
    }, 1000);
}

async function checkLockStatus() {
    try {
        const lockStatus = await API.get('/api/auth/lock-status');
        if (lockStatus.locked) {
            setTimeout(() => {
                startLockoutCountdown(lockStatus.remaining_seconds, null);
            }, 100);
        }
    } catch (e) {}
}

function openCredentialModal(app, mode = 'create', entryData = null) {
    let currentCategories = [];
    let originalData = null;
    let hasChanges = false;

    API.get('/api/categories').then(cats => {
        currentCategories = cats;
        const categorySelect = document.getElementById('modalCategory');
        if (categorySelect) {
            categorySelect.innerHTML = cats.map(c =>
                `<option value="${c.id}" ${c.id === (entryData?.category_id || 'general') ? 'selected' : ''}>${c.name}</option>`
            ).join('');
        }
    });

    const isEdit = mode === 'edit' && entryData;

    if (isEdit) {
        originalData = {
            title: entryData.title || '',
            username: entryData.username || '',
            password: entryData.password || '',
            url: entryData.url || '',
            totp_secret: entryData.totp_secret || '',
            notes: entryData.notes || '',
            category_id: entryData.category_id || 'general',
            support_contact: entryData.support_contact || '',
            account_status: entryData.account_status || 'active'
        };
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'u-backdrop';
    backdrop.id = 'modalBackdrop';

    const modal = document.createElement('div');
    modal.className = 'u-modal';
    modal.id = 'createModal';

    const title = isEdit ? 'editar' : 'nueva llave';

    modal.innerHTML = `
        <h2 class="u-modal-title">${title}</h2>

        <div class="u-modal-section">
            <label class="u-modal-label">título *</label>
            <input type="text" class="u-modal-input u-modal-input--text" id="modalTitle" placeholder="nombre de la credencial" autocomplete="off" value="${isEdit ? (entryData.title || '') : ''}">
            <p class="u-modal-error" id="modalTitleError"></p>
        </div>

        <div class="u-modal-section">
            <label class="u-modal-label">categoría</label>
            <select class="u-modal-select" id="modalCategory">
                <option value="general">general</option>
            </select>
        </div>

        <div class="u-modal-section">
            <label class="u-modal-label">usuario</label>
            <input type="text" class="u-modal-input u-modal-input--mono" id="modalUsername" placeholder="usuario o email" autocomplete="off" value="${isEdit ? (entryData.username || '') : ''}">
        </div>

        <div class="u-modal-section">
            <label class="u-modal-label">contraseña *</label>
            <div class="u-modal-input-group">
                <input type="text" class="u-modal-input u-modal-input--mono" id="modalPassword" placeholder="contraseña" autocomplete="off" value="${isEdit ? (entryData.password || '') : ''}">
                <button class="u-modal-btn-generate" id="modalGenerateBtn" title="generar contraseña">🎲</button>
            </div>
            <p class="u-modal-error" id="modalPasswordError"></p>
        </div>

        <div class="u-modal-section">
            <label class="u-modal-label">url del sitio</label>
            <input type="text" class="u-modal-input u-modal-input--text" id="modalUrl" placeholder="https://ejemplo.com" autocomplete="off" value="${isEdit ? (entryData.url || '') : ''}">
        </div>

        <div class="u-modal-section">
            <label class="u-modal-label">semilla totp</label>
            <input type="text" class="u-modal-input u-modal-input--mono" id="modalTotp" placeholder="semilla para autenticación de dos factores" autocomplete="off" value="${isEdit ? (entryData.totp_secret || '') : ''}">
        </div>

        <div class="u-modal-section">
            <label class="u-modal-label">notas</label>
            <textarea class="u-modal-textarea" id="modalNotes" placeholder="información adicional">${isEdit ? (entryData.notes || '') : ''}</textarea>
        </div>

        <div class="u-modal-section">
            <label class="u-modal-label">contacto de soporte</label>
            <input type="text" class="u-modal-input u-modal-input--text" id="modalSupport" placeholder="email o teléfono de soporte" autocomplete="off" value="${isEdit ? (entryData.support_contact || '') : ''}">
        </div>

        <div class="u-modal-section">
            <label class="u-modal-label">estado de cuenta</label>
            <select class="u-modal-select" id="modalStatus">
                <option value="active" ${isEdit && entryData.account_status === 'active' ? 'selected' : ''}>activa</option>
                <option value="inactive" ${isEdit && entryData.account_status === 'inactive' ? 'selected' : ''}>inactiva</option>
                <option value="suspended" ${isEdit && entryData.account_status === 'suspended' ? 'selected' : ''}>suspendida</option>
                <option value="trial" ${isEdit && entryData.account_status === 'trial' ? 'selected' : ''}>en prueba</option>
                <option value="closed" ${isEdit && entryData.account_status === 'closed' ? 'selected' : ''}>cerrada</option>
            </select>
        </div>

        <div class="u-modal-actions">
            ${isEdit ? '<button class="u-modal-btn u-modal-btn--delete" id="modalDeleteBtn">eliminar</button>' : ''}
            <div class="u-modal-actions-right">
                <button class="u-modal-btn u-modal-btn--cancel" id="modalCancelBtn">cancelar</button>
                <button class="u-modal-btn u-modal-btn--save" id="modalSaveBtn" ${isEdit ? '' : 'disabled'}>guardar</button>
            </div>
        </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    requestAnimationFrame(() => {
        backdrop.classList.add('u-backdrop--visible');
        modal.classList.add('u-modal--visible');
    });

    const titleInput = document.getElementById('modalTitle');
    const passwordInput = document.getElementById('modalPassword');
    const saveBtn = document.getElementById('modalSaveBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');
    const generateBtn = document.getElementById('modalGenerateBtn');
    const titleError = document.getElementById('modalTitleError');
    const passwordError = document.getElementById('modalPasswordError');
    const deleteBtn = document.getElementById('modalDeleteBtn');

    setTimeout(() => titleInput.focus(), 300);

    function getCurrentData() {
        return {
            title: titleInput.value.trim(),
            username: document.getElementById('modalUsername').value.trim(),
            password: passwordInput.value.trim(),
            url: document.getElementById('modalUrl').value.trim(),
            totp_secret: document.getElementById('modalTotp').value.trim(),
            notes: document.getElementById('modalNotes').value.trim(),
            category_id: document.getElementById('modalCategory').value,
            support_contact: document.getElementById('modalSupport').value.trim(),
            account_status: document.getElementById('modalStatus').value
        };
    }

    function checkChanges() {
        if (!isEdit || !originalData) return;
        const current = getCurrentData();
        hasChanges = Object.keys(originalData).some(key => {
            return current[key] !== originalData[key];
        });
    }

    function validateForm() {
        const hasTitle = titleInput.value.trim().length > 0;
        const hasPassword = passwordInput.value.trim().length > 0;
        saveBtn.disabled = !(hasTitle && hasPassword);
        checkChanges();
    }

    const allInputs = modal.querySelectorAll('.u-modal-input, .u-modal-select, .u-modal-textarea');
    allInputs.forEach(input => {
        input.addEventListener('input', () => {
            titleError.textContent = '';
            titleInput.classList.remove('u-modal-input--error');
            passwordError.textContent = '';
            passwordInput.classList.remove('u-modal-input--error');
            validateForm();
        });
        input.addEventListener('change', () => {
            validateForm();
        });
    });

    generateBtn.addEventListener('click', () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
        const array = new Uint8Array(20);
        crypto.getRandomValues(array);
        let generated = '';
        for (let i = 0; i < 20; i++) {
            generated += chars[array[i] % chars.length];
        }
        passwordInput.value = generated;
        passwordInput.type = 'text';
        passwordInput.classList.add('u-modal-input--generated');
        setTimeout(() => passwordInput.classList.remove('u-modal-input--generated'), 400);
        validateForm();
    });

    saveBtn.addEventListener('click', async () => {
        const data = getCurrentData();
        let hasError = false;

        if (!data.title) {
            titleError.textContent = 'el título es obligatorio';
            titleInput.classList.add('u-modal-input--error');
            hasError = true;
        }

        if (!data.password) {
            passwordError.textContent = 'la contraseña es obligatoria';
            passwordInput.classList.add('u-modal-input--error');
            hasError = true;
        }

        if (hasError) return;

        saveBtn.textContent = 'guardando...';
        saveBtn.disabled = true;
        allInputs.forEach(el => el.disabled = true);

        try {
            if (isEdit) {
                const res = await API.patch(`/api/vault/entries/${entryData.id}`, data);
                if (res.status === 'updated') {
                    const updatedEntry = await API.get(`/api/vault/entries/${entryData.id}`);
                    app.currentEntry = updatedEntry;
                    closeModal();
                    const kd = document.getElementById('keyDisplay');
                    const kf = document.getElementById('keyFranja');
                    const mk = document.getElementById('mainKey');
                    if (kd && kf && mk) {
                        transformKey(updatedEntry, kd, kf, mk, app);
                    }
                }
            } else {
                const res = await API.post('/api/vault/entries', data);
                if (res.status === 'created' || res.status === 'ok') {
                    closeModal();
                }
            }
        } catch (e) {
            saveBtn.textContent = 'guardar';
            saveBtn.disabled = false;
            allInputs.forEach(el => el.disabled = false);
        }
    });

    if (isEdit && deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            const confirmModal = document.createElement('div');
            confirmModal.className = 'u-cat-confirm';
            confirmModal.style.position = 'fixed';
            confirmModal.style.top = '50%';
            confirmModal.style.left = '50%';
            confirmModal.style.transform = 'translate(-50%, -50%)';
            confirmModal.style.background = 'var(--bg-root)';
            confirmModal.style.border = '1px solid var(--border-glow)';
            confirmModal.style.borderRadius = '12px';
            confirmModal.style.padding = 'var(--space-lg)';
            confirmModal.style.zIndex = '200';
            confirmModal.style.maxWidth = '320px';
            confirmModal.style.width = '90%';
            confirmModal.innerHTML = `
                <p class="u-cat-confirm-title">¿eliminar esta llave?</p>
                <p class="u-cat-confirm-info">esta acción no se puede deshacer</p>
                <div style="display:flex;gap:var(--space-sm);margin-top:var(--space-md)">
                    <button class="u-cat-confirm-btn u-cat-confirm-btn--cancel" id="confirmDeleteCancel">volver</button>
                    <button class="u-cat-confirm-btn u-cat-confirm-btn--delete" id="confirmDeleteYes">eliminar</button>
                </div>
            `;
            document.body.appendChild(confirmModal);

            document.getElementById('confirmDeleteCancel').addEventListener('click', () => {
                confirmModal.remove();
            });

            document.getElementById('confirmDeleteYes').addEventListener('click', async () => {
                try {
                    const res = await API.del(`/api/vault/entries/${entryData.id}`);
                    if (res.status === 'deleted') {
                        confirmModal.remove();
                        closeModal();
                        if (app.currentEntry && app.currentEntry.id === entryData.id) {
                            app.currentEntry = null;
                        }
                        resetKey();
                    }
                } catch (e) {
                    confirmModal.remove();
                }
            });
        });
    }

    function closeModal() {
        modal.classList.remove('u-modal--visible');
        backdrop.classList.remove('u-backdrop--visible');
        setTimeout(() => {
            modal.remove();
            backdrop.remove();
        }, 300);
    }

    cancelBtn.addEventListener('click', () => {
        if (isEdit && hasChanges) {
            const confirmModal = document.createElement('div');
            confirmModal.className = 'u-cat-confirm';
            confirmModal.style.position = 'fixed';
            confirmModal.style.top = '50%';
            confirmModal.style.left = '50%';
            confirmModal.style.transform = 'translate(-50%, -50%)';
            confirmModal.style.background = 'var(--bg-root)';
            confirmModal.style.border = '1px solid var(--border-glow)';
            confirmModal.style.borderRadius = '12px';
            confirmModal.style.padding = 'var(--space-lg)';
            confirmModal.style.zIndex = '200';
            confirmModal.style.maxWidth = '320px';
            confirmModal.style.width = '90%';
            confirmModal.innerHTML = `
                <p class="u-cat-confirm-title">¿descartar cambios?</p>
                <div style="display:flex;gap:var(--space-sm);margin-top:var(--space-md)">
                    <button class="u-cat-confirm-btn u-cat-confirm-btn--cancel" id="confirmDiscardCancel">seguir editando</button>
                    <button class="u-cat-confirm-btn u-cat-confirm-btn--delete" id="confirmDiscardYes">descartar</button>
                </div>
            `;
            document.body.appendChild(confirmModal);

            document.getElementById('confirmDiscardCancel').addEventListener('click', () => {
                confirmModal.remove();
            });

            document.getElementById('confirmDiscardYes').addEventListener('click', () => {
                confirmModal.remove();
                closeModal();
            });
        } else {
            closeModal();
        }
    });

    backdrop.addEventListener('click', () => {
        cancelBtn.click();
    });

    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            cancelBtn.click();
            document.removeEventListener('keydown', escHandler);
        }
    });
}

function openCreateModal(app) {
    openCredentialModal(app, 'create');
}

function openCategoriesPanel(app) {
    const COLORS = [
        { name: 'piedra', hex: '#78716c' },
        { name: 'dorado', hex: '#d4af37' },
        { name: 'verde', hex: '#22c55e' },
        { name: 'azul', hex: '#3b82f6' },
        { name: 'púrpura', hex: '#a855f7' },
        { name: 'rojo', hex: '#ef4444' },
        { name: 'naranja', hex: '#f97316' },
        { name: 'cian', hex: '#06b6d4' }
    ];

    let categories = [];
    let activeColorPalette = null;

    const backdrop = document.createElement('div');
    backdrop.className = 'u-backdrop';
    backdrop.id = 'catBackdrop';

    const panel = document.createElement('div');
    panel.className = 'u-cat-panel';
    panel.id = 'catPanel';
    panel.innerHTML = `
        <h2 class="u-cat-panel-title">categorías</h2>
        <div class="u-cat-list" id="catList"></div>
        <button class="u-cat-btn-new" id="catNewBtn">+ nueva categoría</button>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);

    requestAnimationFrame(() => {
        backdrop.classList.add('u-backdrop--visible');
        panel.classList.add('u-cat-panel--visible');
    });

    const catList = document.getElementById('catList');
    const catNewBtn = document.getElementById('catNewBtn');

    async function loadCategories() {
        try {
            categories = await API.get('/api/categories');
            renderCategories();
        } catch (e) {}
    }

    function renderCategories() {
        catList.innerHTML = categories.map(cat => `
            <div class="u-cat-item" data-id="${cat.id}">
                <div class="u-cat-color" data-id="${cat.id}" style="background:${cat.color}" title="cambiar color"></div>
                <span class="u-cat-name" data-id="${cat.id}">${cat.name}</span>
                <span class="u-cat-count">${cat.entry_count} ${cat.entry_count === 1 ? 'llave' : 'llaves'}</span>
                <div class="u-cat-actions">
                    <button class="u-cat-action u-cat-edit" data-id="${cat.id}" title="renombrar">✏</button>
                    ${cat.id !== 'general' ? `<button class="u-cat-action u-cat-delete" data-id="${cat.id}" title="eliminar">✕</button>` : ''}
                </div>
                <div class="u-cat-palette" id="palette-${cat.id}"></div>
            </div>
        `).join('');

        catList.classList.add('u-stagger');

        catList.querySelectorAll('.u-cat-color').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const catId = el.dataset.id;
                const paletteEl = document.getElementById(`palette-${catId}`);

                if (activeColorPalette && activeColorPalette !== paletteEl) {
                    activeColorPalette.innerHTML = '';
                    activeColorPalette.classList.remove('u-cat-palette--visible');
                }

                if (paletteEl.classList.contains('u-cat-palette--visible')) {
                    paletteEl.innerHTML = '';
                    paletteEl.classList.remove('u-cat-palette--visible');
                    activeColorPalette = null;
                    return;
                }

                const currentCat = categories.find(c => c.id === catId);
                paletteEl.innerHTML = COLORS.map(c => `
                    <div class="u-cat-palette-color ${c.hex === currentCat.color ? 'u-cat-palette-color--selected' : ''}"
                         data-hex="${c.hex}" data-id="${catId}"
                         style="background:${c.hex}" title="${c.name}"></div>
                `).join('');
                paletteEl.classList.add('u-cat-palette--visible');
                activeColorPalette = paletteEl;

                paletteEl.querySelectorAll('.u-cat-palette-color').forEach(colorEl => {
                    colorEl.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const hex = colorEl.dataset.hex;
                        const id = colorEl.dataset.id;
                        try {
                            await API.patch(`/api/categories/${id}`, { color: hex });
                            const cat = categories.find(c => c.id === id);
                            if (cat) cat.color = hex;
                            renderCategories();
                        } catch (e) {}
                    });
                });
            });
        });

        catList.querySelectorAll('.u-cat-edit').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const catId = el.dataset.id;
                const nameEl = catList.querySelector(`.u-cat-name[data-id="${catId}"]`);
                const cat = categories.find(c => c.id === catId);
                if (!nameEl || !cat) return;

                const originalName = cat.name;
                nameEl.innerHTML = `<input type="text" class="u-cat-rename-input" value="${originalName}" />`;
                const input = nameEl.querySelector('input');
                input.focus();
                input.select();

                async function save() {
                    const newName = input.value.trim();
                    if (!newName || newName === originalName) {
                        nameEl.textContent = originalName;
                        return;
                    }
                    try {
                        await API.patch(`/api/categories/${catId}`, { name: newName });
                        cat.name = newName;
                        nameEl.textContent = newName;
                    } catch (err) {
                        nameEl.innerHTML = `<input type="text" class="u-cat-rename-input u-cat-rename-input--error" value="${input.value}" />`;
                        const newInput = nameEl.querySelector('input');
                        newInput.focus();
                        newInput.select();
                        newInput.addEventListener('keydown', function handler(e) {
                            if (e.key === 'Enter') { save(); newInput.removeEventListener('keydown', handler); }
                            if (e.key === 'Escape') { nameEl.textContent = originalName; newInput.removeEventListener('keydown', handler); }
                        });
                        newInput.addEventListener('blur', () => { save(); newInput.removeEventListener('blur', handler); });
                    }
                }

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') save();
                    if (e.key === 'Escape') nameEl.textContent = originalName;
                });
                input.addEventListener('blur', save);
            });
        });

        catList.querySelectorAll('.u-cat-delete').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const catId = el.dataset.id;
                const cat = categories.find(c => c.id === catId);
                if (!cat) return;

                if (cat.entry_count === 0) {
                    deleteCategory(catId, 'reassign');
                } else {
                    showDeleteConfirm(cat);
                }
            });
        });
    }

    function showDeleteConfirm(cat) {
        catList.innerHTML = `
            <div class="u-cat-confirm">
                <p class="u-cat-confirm-title">¿eliminar "${cat.name}"?</p>
                <p class="u-cat-confirm-info">${cat.entry_count} ${cat.entry_count === 1 ? 'credencial asociada' : 'credenciales asociadas'}</p>
                <p class="u-cat-confirm-question">¿qué hacer con las credenciales?</p>
                <button class="u-cat-confirm-btn u-cat-confirm-btn--reassign" id="catReassignBtn">mover a general</button>
                <button class="u-cat-confirm-btn u-cat-confirm-btn--delete" id="catDeleteEntriesBtn">eliminar credenciales</button>
                <button class="u-cat-confirm-btn u-cat-confirm-btn--cancel" id="catCancelDeleteBtn">volver</button>
            </div>
        `;

        document.getElementById('catReassignBtn').addEventListener('click', () => {
            deleteCategory(cat.id, 'reassign');
        });

        document.getElementById('catDeleteEntriesBtn').addEventListener('click', () => {
            showFinalConfirm(cat);
        });

        document.getElementById('catCancelDeleteBtn').addEventListener('click', () => {
            renderCategories();
        });
    }

    function showFinalConfirm(cat) {
        catList.innerHTML = `
            <div class="u-cat-confirm">
                <p class="u-cat-confirm-title">¿eliminar ${cat.entry_count} credenciales?</p>
                <p class="u-cat-confirm-info">esta acción no se puede deshacer</p>
                <button class="u-cat-confirm-btn u-cat-confirm-btn--delete" id="catFinalDeleteBtn">eliminar todo</button>
                <button class="u-cat-confirm-btn u-cat-confirm-btn--cancel" id="catFinalCancelBtn">volver</button>
            </div>
        `;

        document.getElementById('catFinalDeleteBtn').addEventListener('click', () => {
            deleteCategory(cat.id, 'delete_entries');
        });

        document.getElementById('catFinalCancelBtn').addEventListener('click', () => {
            renderCategories();
        });
    }

    async function deleteCategory(catId, action) {
        try {
            await API.del(`/api/categories/${catId}`, { action: action, target_id: 'general' });
            await loadCategories();
        } catch (e) {}
    }

    catNewBtn.addEventListener('click', () => {
        const existingForm = document.getElementById('catNewForm');
        if (existingForm) return;

        const newForm = document.createElement('div');
        newForm.className = 'u-cat-new-form';
        newForm.id = 'catNewForm';
        newForm.innerHTML = `
            <input type="text" class="u-cat-new-input" id="catNewInput" placeholder="nombre de categoría" />
            <div class="u-cat-new-color" id="catNewColor" style="background:#78716c" title="elegir color"></div>
            <button class="u-cat-new-save" id="catNewSave" disabled>guardar</button>
        `;
        catList.appendChild(newForm);

        const input = document.getElementById('catNewInput');
        const saveBtn = document.getElementById('catNewSave');
        const colorEl = document.getElementById('catNewColor');
        let selectedColor = '#78716c';
        let colorPickerOpen = false;

        input.focus();

        input.addEventListener('input', () => {
            saveBtn.disabled = input.value.trim().length === 0;
        });

        colorEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (colorPickerOpen) {
                const oldPicker = document.getElementById('catNewPalette');
                if (oldPicker) oldPicker.remove();
                colorPickerOpen = false;
                return;
            }
            const picker = document.createElement('div');
            picker.className = 'u-cat-palette u-cat-palette--visible';
            picker.id = 'catNewPalette';
            picker.innerHTML = COLORS.map(c => `
                <div class="u-cat-palette-color ${c.hex === selectedColor ? 'u-cat-palette-color--selected' : ''}"
                     data-hex="${c.hex}" style="background:${c.hex}" title="${c.name}"></div>
            `).join('');
            newForm.appendChild(picker);
            colorPickerOpen = true;

            picker.querySelectorAll('.u-cat-palette-color').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectedColor = el.dataset.hex;
                    colorEl.style.background = selectedColor;
                    picker.remove();
                    colorPickerOpen = false;
                });
            });
        });

        saveBtn.addEventListener('click', async () => {
            const name = input.value.trim();
            if (!name) return;
            try {
                await API.post('/api/categories', { name: name, color: selectedColor });
                await loadCategories();
            } catch (err) {
                if (err.message && err.message.includes('409')) {
                    input.classList.add('u-cat-rename-input--error');
                }
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveBtn.click();
            if (e.key === 'Escape') newForm.remove();
        });
    });

    function closePanel() {
        panel.classList.remove('u-cat-panel--visible');
        backdrop.classList.remove('u-backdrop--visible');
        setTimeout(() => { panel.remove(); backdrop.remove(); }, 300);
    }

    backdrop.addEventListener('click', closePanel);
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') { closePanel(); document.removeEventListener('keydown', escHandler); }
    });

    loadCategories();
}

function openSettingsPanel(app) {
    const backdrop = document.createElement('div');
    backdrop.className = 'u-backdrop';

    const panel = document.createElement('div');
    panel.className = 'u-modal';
    panel.id = 'settingsModal';
    panel.innerHTML = `
        <h2 class="u-modal-title">configurar</h2>

        <div class="u-settings-section">
            <h3 class="u-settings-subtitle">cambiar contraseña maestra</h3>

            <div class="u-modal-section">
                <label class="u-modal-label">contraseña actual *</label>
                <input type="password" class="u-modal-input u-modal-input--mono" id="settingsCurrentPass" autocomplete="off">
                <p class="u-modal-error" id="settingsCurrentPassError"></p>
            </div>

            <div class="u-modal-section">
                <label class="u-modal-label">nueva contraseña *</label>
                <input type="password" class="u-modal-input u-modal-input--mono" id="settingsNewPass" autocomplete="off">
                <div class="u-strength-bar" id="settingsStrengthBar">
                    <div class="u-strength-fill" id="settingsStrengthFill"></div>
                </div>
                <p class="u-strength-text" id="settingsStrengthText"></p>
                <p class="u-modal-error" id="settingsNewPassError"></p>
            </div>

            <div class="u-modal-section">
                <label class="u-modal-label">confirmar nueva contraseña *</label>
                <input type="password" class="u-modal-input u-modal-input--mono" id="settingsConfirmPass" autocomplete="off">
                <p class="u-modal-error" id="settingsConfirmPassError"></p>
            </div>

            <button class="u-modal-btn u-modal-btn--save" id="settingsChangePassBtn" disabled>cambiar contraseña</button>
        </div>

        <div class="u-settings-divider"></div>

        <div class="u-settings-section" id="securitySection">
            <h3 class="u-settings-subtitle">seguridad</h3>

            <div class="u-modal-section">
                <label class="u-modal-label">bloqueo por inactividad</label>
                <select class="u-modal-select" id="cfgInactivity">
                    <option value="60">1 minuto</option>
                    <option value="180">3 minutos</option>
                    <option value="300" selected>5 minutos</option>
                    <option value="600">10 minutos</option>
                    <option value="900">15 minutos</option>
                    <option value="1800">30 minutos</option>
                </select>
                <p class="u-config-desc">la app se bloquea tras este tiempo sin actividad</p>
            </div>

            <div class="u-modal-section">
                <label class="u-modal-label">intentos máximos</label>
                <select class="u-modal-select" id="cfgMaxAttempts">
                    <option value="3">3</option>
                    <option value="5" selected>5</option>
                    <option value="7">7</option>
                    <option value="10">10</option>
                </select>
                <p class="u-config-desc">número de intentos fallidos antes de bloquear el acceso</p>
            </div>

            <div class="u-modal-section">
                <label class="u-modal-label">tiempo de espera tras bloqueo</label>
                <select class="u-modal-select" id="cfgLockDuration">
                    <option value="60">1 minuto</option>
                    <option value="180">3 minutos</option>
                    <option value="300" selected>5 minutos</option>
                    <option value="600">10 minutos</option>
                    <option value="900">15 minutos</option>
                    <option value="1800">30 minutos</option>
                </select>
                <p class="u-config-desc">tiempo de espera después de alcanzar el máximo de intentos</p>
            </div>

            <div class="u-modal-section">
                <label class="u-modal-label">limpieza del portapapeles</label>
                <select class="u-modal-select" id="cfgClipboardClear">
                    <option value="15">15 segundos</option>
                    <option value="30" selected>30 segundos</option>
                    <option value="60">1 minuto</option>
                    <option value="120">2 minutos</option>
                    <option value="300">5 minutos</option>
                </select>
                <p class="u-config-desc">tiempo antes de borrar lo copiado del portapapeles</p>
            </div>

            <div class="u-modal-section">
                <label class="u-modal-label">contraseña visible temporalmente</label>
                <select class="u-modal-select" id="cfgPasswordVisible">
                    <option value="3">3 segundos</option>
                    <option value="5" selected>5 segundos</option>
                    <option value="10">10 segundos</option>
                    <option value="0">nunca ocultar</option>
                </select>
                <p class="u-config-desc">tiempo que la contraseña se muestra antes de ocultarse</p>
            </div>

            <button class="u-modal-btn u-modal-btn--save" id="cfgSaveSecurity">guardar configuración</button>
        </div>

        <div class="u-settings-divider"></div>

        <div class="u-settings-section" id="dataSection">
            <h3 class="u-settings-subtitle">datos</h3>

            <div class="u-csv-actions">
                <div class="u-csv-action">
                    <p class="u-csv-action-title">exportar credenciales</p>
                    <p class="u-csv-action-desc">descarga un CSV con todas tus credenciales actuales</p>
                    <button class="u-modal-btn u-modal-btn--save" id="csvExportBtn">exportar csv</button>
                </div>

                <div class="u-csv-action">
                    <p class="u-csv-action-title">plantilla csv</p>
                    <p class="u-csv-action-desc">descarga una plantilla con los campos correctos para importar</p>
                    <button class="u-modal-btn u-modal-btn--save" id="csvTemplateBtn">descargar plantilla</button>
                </div>

                <div class="u-csv-action">
                    <p class="u-csv-action-title">importar credenciales</p>
                    <p class="u-csv-action-desc">carga un CSV con credenciales para importar de forma masiva</p>
                    <input type="file" id="csvFileInput" accept=".csv" style="display:none">
                    <button class="u-modal-btn u-modal-btn--save" id="csvImportBtn">seleccionar archivo</button>
                    <p class="u-csv-import-status" id="csvImportStatus"></p>
                </div>
            </div>
        </div>

        <div class="u-modal-actions">
            <button class="u-modal-btn u-modal-btn--cancel" id="settingsCloseBtn">cerrar</button>
        </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);

    requestAnimationFrame(() => {
        backdrop.classList.add('u-backdrop--visible');
        panel.classList.add('u-modal--visible');
    });

    const currentPass = document.getElementById('settingsCurrentPass');
    const newPass = document.getElementById('settingsNewPass');
    const confirmPass = document.getElementById('settingsConfirmPass');
    const changeBtn = document.getElementById('settingsChangePassBtn');
    const strengthFill = document.getElementById('settingsStrengthFill');
    const strengthText = document.getElementById('settingsStrengthText');

    function validate() {
        const hasCurrent = currentPass.value.length > 0;
        const hasNew = newPass.value.length >= 6;
        const match = newPass.value === confirmPass.value && confirmPass.value.length > 0;
        changeBtn.disabled = !(hasCurrent && hasNew && match);
    }

    function checkStrength(password) {
        let score = 0;
        if (password.length >= 8) score++;
        if (password.length >= 12) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;

        if (score <= 1) return { level: 'débil', color: 'var(--state-error)', width: '20%' };
        if (score <= 2) return { level: 'regular', color: 'var(--state-warning)', width: '40%' };
        if (score <= 3) return { level: 'buena', color: 'var(--accent-primary)', width: '60%' };
        if (score <= 4) return { level: 'fuerte', color: 'var(--state-success)', width: '80%' };
        return { level: 'muy fuerte', color: 'var(--state-success)', width: '100%' };
    }

    newPass.addEventListener('input', () => {
        const strength = checkStrength(newPass.value);
        strengthFill.style.width = newPass.value.length > 0 ? strength.width : '0%';
        strengthFill.style.background = strength.color;
        strengthText.textContent = newPass.value.length > 0 ? strength.level : '';
        strengthText.style.color = strength.color;
        validate();
    });

    currentPass.addEventListener('input', validate);
    confirmPass.addEventListener('input', () => {
        if (confirmPass.value.length > 0 && confirmPass.value !== newPass.value) {
            document.getElementById('settingsConfirmPassError').textContent = 'las contraseñas no coinciden';
        } else {
            document.getElementById('settingsConfirmPassError').textContent = '';
        }
        validate();
    });

    changeBtn.addEventListener('click', async () => {
        const current = currentPass.value;
        const newP = newPass.value;
        const confirm = confirmPass.value;

        let hasError = false;
        if (newP.length < 6) {
            document.getElementById('settingsNewPassError').textContent = 'mínimo 6 caracteres';
            hasError = true;
        }
        if (newP !== confirm) {
            document.getElementById('settingsConfirmPassError').textContent = 'las contraseñas no coinciden';
            hasError = true;
        }
        if (hasError) return;

        changeBtn.textContent = 'cambiando...';
        changeBtn.disabled = true;
        panel.querySelectorAll('.u-modal-input').forEach(el => el.disabled = true);

        try {
            const res = await API.post('/api/auth/change-password', {
                current_password: current,
                new_password: newP
            });

            if (res.status === 'changed') {
                const section = panel.querySelector('.u-settings-section');
                if (section && res.recovery_phrase) {
                    section.innerHTML = `
                        <div class="u-recovery-phrase">
                            <h3 class="u-settings-subtitle">nueva frase de recuperación</h3>
                            <p class="u-recovery-warning">guarda esta frase en un lugar seguro. es tu única forma de recuperar tu vault si olvidas la contraseña.</p>
                            <div class="u-recovery-words">
                                ${res.recovery_phrase.map((word, i) => `<span class="u-recovery-word"><span class="u-recovery-num">${i + 1}.</span> ${word}</span>`).join('')}
                            </div>
                            <button class="u-modal-btn u-modal-btn--save" id="recoveryDoneBtn">entendido</button>
                        </div>
                    `;
                    document.getElementById('recoveryDoneBtn').addEventListener('click', () => {
                        closeModal();
                        sessionStorage.removeItem('millave_token');
                        location.reload();
                    });
                }
            }
        } catch (e) {
            const errorMsg = e.message || '';
            if (errorMsg.includes('401')) {
                document.getElementById('settingsCurrentPassError').textContent = 'la contraseña actual es incorrecta';
            } else {
                document.getElementById('settingsCurrentPassError').textContent = 'error al cambiar contraseña';
            }
            changeBtn.textContent = 'cambiar contraseña';
            changeBtn.disabled = false;
            panel.querySelectorAll('.u-modal-input').forEach(el => el.disabled = false);
        }
    });

    const cfgSaveBtn = document.getElementById('cfgSaveSecurity');
    if (cfgSaveBtn) {
        cfgSaveBtn.addEventListener('click', async () => {
            const data = {
                inactivity_timeout: parseInt(document.getElementById('cfgInactivity').value),
                max_attempts: parseInt(document.getElementById('cfgMaxAttempts').value),
                lock_duration: parseInt(document.getElementById('cfgLockDuration').value),
                clipboard_clear_time: parseInt(document.getElementById('cfgClipboardClear').value),
                password_visible_duration: parseInt(document.getElementById('cfgPasswordVisible').value)
            };

            try {
                await API.patch('/api/auth/config', data);
                if (app) app.securityConfig = data;
                cfgSaveBtn.textContent = 'guardado';
                setTimeout(() => { cfgSaveBtn.textContent = 'guardar configuración'; }, 2000);
            } catch (e) {
                cfgSaveBtn.textContent = 'error al guardar';
                setTimeout(() => { cfgSaveBtn.textContent = 'guardar configuración'; }, 2000);
            }
        });
    }

    async function loadSecurityConfig() {
        try {
            const config = await API.get('/api/auth/config');
            document.getElementById('cfgInactivity').value = config.inactivity_timeout;
            document.getElementById('cfgMaxAttempts').value = config.max_attempts;
            document.getElementById('cfgLockDuration').value = config.lock_duration;
            document.getElementById('cfgClipboardClear').value = config.clipboard_clear_time;
            document.getElementById('cfgPasswordVisible').value = config.password_visible_duration;
        } catch (e) {}
    }
    loadSecurityConfig();

    document.getElementById('csvExportBtn').addEventListener('click', () => {
        window.location.href = '/api/csv/export';
    });

    document.getElementById('csvTemplateBtn').addEventListener('click', () => {
        window.location.href = '/api/csv/template';
    });

    const csvFileInput = document.getElementById('csvFileInput');
    const csvImportBtn = document.getElementById('csvImportBtn');
    const csvImportStatus = document.getElementById('csvImportStatus');

    csvImportBtn.addEventListener('click', () => {
        csvFileInput.click();
    });

    csvFileInput.addEventListener('change', async () => {
        const file = csvFileInput.files[0];
        if (!file) return;

        csvImportBtn.textContent = 'importando...';
        csvImportBtn.disabled = true;
        csvImportStatus.textContent = '';
        csvImportStatus.style.color = '';

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/csv/import', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (res.ok) {
                csvImportStatus.textContent = `${data.imported} credenciales importadas`;
                csvImportStatus.style.color = 'var(--state-success)';
                if (data.errors && data.errors.length > 0) {
                    csvImportStatus.textContent += ` (${data.errors.length} errores)`;
                    csvImportStatus.style.color = 'var(--state-warning)';
                }
            } else {
                csvImportStatus.textContent = data.detail || 'error al importar';
                csvImportStatus.style.color = 'var(--state-error)';
            }
        } catch (e) {
            csvImportStatus.textContent = 'error de conexión';
            csvImportStatus.style.color = 'var(--state-error)';
        }

        csvImportBtn.textContent = 'seleccionar archivo';
        csvImportBtn.disabled = false;
        csvFileInput.value = '';
    });

    function closeModal() {
        panel.classList.remove('u-modal--visible');
        backdrop.classList.remove('u-backdrop--visible');
        setTimeout(() => { panel.remove(); backdrop.remove(); }, 300);
    }

    document.getElementById('settingsCloseBtn').addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
    });

    setTimeout(() => currentPass.focus(), 300);
}


function openRecoveryPanel(app) {
    const backdrop = document.createElement('div');
    backdrop.className = 'u-backdrop';

    const panel = document.createElement('div');
    panel.className = 'u-modal u-modal--wide';
    panel.id = 'recoveryModal';

    let wordlist = [];
    let currentPhase = 1;
    let enteredWords = [];
    let recoveryKey = '';

    panel.innerHTML = `
        <div class="u-recovery-phase" id="recoveryPhase1">
            <h2 class="u-modal-title">recuperar vault</h2>
            <p class="u-recovery-desc">ingresa tu frase de recuperación de 24 palabras</p>

            <div class="u-recovery-paste-row">
                <input type="text" class="u-modal-input u-modal-input--mono" id="recoveryPasteInput" placeholder="pega las 24 palabras separadas por espacios" autocomplete="off">
                <button class="u-btn u-btn--outline" id="recoveryPasteBtn">pegar</button>
            </div>

            <div class="u-recovery-grid" id="recoveryGrid"></div>
            <p class="u-recovery-counter"><span id="recoveryWordCount">0</span>/24</p>
            <p class="u-modal-error" id="recoveryPhraseError"></p>

            <div class="u-recovery-actions">
                <button class="u-btn u-btn--ghost" id="recoveryCancelBtn">cancelar</button>
                <button class="u-btn u-btn--primary" id="recoveryVerifyBtn" disabled>verificar</button>
            </div>
        </div>

        <div class="u-recovery-phase" id="recoveryPhase2" style="display:none">
            <h2 class="u-modal-title">nueva contraseña</h2>
            <p class="u-recovery-desc">define tu nueva contraseña maestra</p>

            <div class="u-modal-section">
                <label class="u-modal-label">nueva contraseña *</label>
                <input type="password" class="u-modal-input u-modal-input--mono" id="recoveryNewPass" autocomplete="off">
                <div class="u-strength-bar"><div class="u-strength-fill" id="recoveryStrengthFill"></div></div>
                <p class="u-modal-error" id="recoveryNewPassError"></p>
            </div>

            <div class="u-modal-section">
                <label class="u-modal-label">confirmar contraseña *</label>
                <input type="password" class="u-modal-input u-modal-input--mono" id="recoveryConfirmPass" autocomplete="off">
                <p class="u-modal-error" id="recoveryConfirmPassError"></p>
            </div>

            <div class="u-recovery-actions">
                <button class="u-btn u-btn--ghost" id="recoveryBackBtn1">volver</button>
                <button class="u-btn u-btn--primary" id="recoveryResetBtn" disabled>restablecer</button>
            </div>
        </div>

        <div class="u-recovery-phase" id="recoveryPhase3" style="display:none">
            <h2 class="u-modal-title">vault restaurado</h2>
            <p class="u-recovery-desc">tu nueva frase de recuperación</p>

            <div class="u-recovery-words" id="recoveryNewWords"></div>

            <p class="u-recovery-warning">guarda esta frase en un lugar seguro. es la única forma de recuperar tu vault.</p>

            <div class="u-recovery-actions">
                <button class="u-btn u-btn--primary" id="recoveryAccessBtn">acceder a millave</button>
            </div>
        </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);

    requestAnimationFrame(() => {
        backdrop.classList.add('u-backdrop--visible');
        panel.classList.add('u-modal--visible');
    });

    loadWordlist();
    setupPhase1();

    function loadWordlist() {
        fetch('/api/recovery/wordlist')
            .then(r => r.json())
            .then(data => { wordlist = data.words; })
            .catch(() => {});
    }

    function setupPhase1() {
        const grid = document.getElementById('recoveryGrid');
        const pasteInput = document.getElementById('recoveryPasteInput');
        const pasteBtn = document.getElementById('recoveryPasteBtn');
        const wordCount = document.getElementById('recoveryWordCount');
        const verifyBtn = document.getElementById('recoveryVerifyBtn');
        const cancelBtn = document.getElementById('recoveryCancelBtn');
        const errorEl = document.getElementById('recoveryPhraseError');

        enteredWords = [];
        grid.innerHTML = '';

        for (let i = 0; i < 24; i++) {
            const cell = document.createElement('div');
            cell.className = 'u-recovery-cell';
            cell.innerHTML = `
                <span class="u-recovery-num">${i + 1}</span>
                <input type="text" class="u-recovery-input" data-index="${i}" placeholder="—" autocomplete="off" spellcheck="false">
            `;
            grid.appendChild(cell);
        }

        const inputs = grid.querySelectorAll('.u-recovery-input');

        inputs.forEach((input, idx) => {
            input.addEventListener('input', () => {
                const val = input.value.toLowerCase().trim();
                if (val && wordlist.length > 0) {
                    const matches = wordlist.filter(w => w.startsWith(val) && w !== val).slice(0, 5);
                    showSuggestions(input, matches);
                } else {
                    removeSuggestions(input);
                }

                if (val && idx < 23) {
                    const exactMatch = wordlist.find(w => w === val);
                    if (exactMatch) {
                        input.value = exactMatch;
                        inputs[idx + 1].focus();
                    }
                }

                updateEnteredWords();
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = input.value.toLowerCase().trim();
                    const exactMatch = wordlist.find(w => w === val);
                    if (exactMatch) {
                        input.value = exactMatch;
                        if (idx < 23) inputs[idx + 1].focus();
                    }
                    updateEnteredWords();
                }
                if (e.key === 'Backspace' && !input.value && idx > 0) {
                    inputs[idx - 1].focus();
                }
            });

            input.addEventListener('focus', () => {
                const val = input.value.toLowerCase().trim();
                if (val && wordlist.length > 0) {
                    const matches = wordlist.filter(w => w.startsWith(val) && w !== val).slice(0, 5);
                    showSuggestions(input, matches);
                }
            });

            input.addEventListener('blur', () => {
                setTimeout(() => removeSuggestions(input), 200);
            });
        });

        pasteBtn.addEventListener('click', () => {
            const text = pasteInput.value.trim();
            if (!text) return;
            const words = text.split(/\s+/).slice(0, 24);
            words.forEach((w, i) => {
                if (inputs[i]) inputs[i].value = w.toLowerCase();
            });
            pasteInput.value = '';
            updateEnteredWords();
            if (words.length === 24) inputs[23].focus();
        });

        cancelBtn.addEventListener('click', closeModal);

        verifyBtn.addEventListener('click', async () => {
            updateEnteredWords();
            if (enteredWords.length !== 24) {
                errorEl.textContent = 'necesitas 24 palabras';
                errorEl.style.color = 'var(--state-error)';
                return;
            }

            verifyBtn.disabled = true;
            verifyBtn.textContent = 'verificando...';
            errorEl.textContent = '';

            try {
                const res = await API.post('/api/recovery/verify', { phrase: enteredWords });
                if (res.valid) {
                    const keyRes = await API.post('/api/recovery/derive-key', { phrase: enteredWords });
                    recoveryKey = keyRes.recovery_key;
                    showPhase(2);
                } else {
                    errorEl.textContent = 'frase incorrecta';
                    errorEl.style.color = 'var(--state-error)';
                    markInvalidWords();
                }
            } catch (e) {
                errorEl.textContent = 'error de conexión';
                errorEl.style.color = 'var(--state-error)';
            }

            verifyBtn.disabled = false;
            verifyBtn.textContent = 'verificar';
        });

        function updateEnteredWords() {
            enteredWords = [];
            inputs.forEach(input => {
                const val = input.value.toLowerCase().trim();
                if (val) enteredWords.push(val);
            });
            wordCount.textContent = enteredWords.length;
            verifyBtn.disabled = enteredWords.length !== 24;
        }

        function markInvalidWords() {
            inputs.forEach(input => {
                const val = input.value.toLowerCase().trim();
                if (val && wordlist.length > 0 && !wordlist.includes(val)) {
                    input.classList.add('u-recovery-input--error');
                }
            });
        }

        function showSuggestions(input, matches) {
            removeSuggestions(input);
            if (matches.length === 0) return;

            const list = document.createElement('div');
            list.className = 'u-recovery-suggestions';
            matches.forEach(word => {
                const item = document.createElement('div');
                item.className = 'u-recovery-suggestion';
                item.textContent = word;
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    input.value = word;
                    removeSuggestions(input);
                    const idx = parseInt(input.dataset.index);
                    if (idx < 23) {
                        const nextInput = grid.querySelector(`[data-index="${idx + 1}"]`);
                        if (nextInput) nextInput.focus();
                    }
                    updateEnteredWords();
                });
                list.appendChild(item);
            });
            input.parentElement.appendChild(list);
        }

        function removeSuggestions(input) {
            const existing = input.parentElement.querySelector('.u-recovery-suggestions');
            if (existing) existing.remove();
        }

        setTimeout(() => inputs[0].focus(), 300);
    }

    function setupPhase2() {
        const newPass = document.getElementById('recoveryNewPass');
        const confirmPass = document.getElementById('recoveryConfirmPass');
        const strengthFill = document.getElementById('recoveryStrengthFill');
        const newPassError = document.getElementById('recoveryNewPassError');
        const confirmPassError = document.getElementById('recoveryConfirmPassError');
        const resetBtn = document.getElementById('recoveryResetBtn');
        const backBtn = document.getElementById('recoveryBackBtn1');

        function checkStrength() {
            const val = newPass.value;
            let score = 0;
            if (val.length >= 6) score++;
            if (val.length >= 10) score++;
            if (/[A-Z]/.test(val)) score++;
            if (/[0-9]/.test(val)) score++;
            if (/[^A-Za-z0-9]/.test(val)) score++;

            const pct = (score / 5) * 100;
            strengthFill.style.width = pct + '%';

            if (score <= 1) strengthFill.style.background = 'var(--state-error)';
            else if (score <= 3) strengthFill.style.background = 'var(--accent-golden)';
            else strengthFill.style.background = 'var(--state-success)';

            validateResetBtn();
        }

        function validateResetBtn() {
            const a = newPass.value;
            const b = confirmPass.value;
            newPassError.textContent = '';
            confirmPassError.textContent = '';

            if (a && a.length < 6) {
                newPassError.textContent = 'mínimo 6 caracteres';
                newPassError.style.color = 'var(--state-error)';
            }
            if (b && a !== b) {
                confirmPassError.textContent = 'las contraseñas no coinciden';
                confirmPassError.style.color = 'var(--state-error)';
            }

            resetBtn.disabled = !(a.length >= 6 && a === b);
        }

        newPass.addEventListener('input', checkStrength);
        confirmPass.addEventListener('input', validateResetBtn);

        backBtn.addEventListener('click', () => showPhase(1));

        resetBtn.addEventListener('click', async () => {
            resetBtn.disabled = true;
            resetBtn.textContent = 'restableciendo...';

            try {
                const res = await API.post('/api/recovery/reset', {
                    recovery_key: recoveryKey,
                    new_password: newPass.value
                });

                if (res.status === 'reset') {
                    const wordsContainer = document.getElementById('recoveryNewWords');
                    wordsContainer.innerHTML = '';
                    res.recovery_phrase.forEach((word, i) => {
                        const span = document.createElement('span');
                        span.className = 'u-recovery-word';
                        span.innerHTML = `<span class="u-recovery-num">${i + 1}</span>${word}`;
                        wordsContainer.appendChild(span);
                    });

                    const accessBtn = document.getElementById('recoveryAccessBtn');
                    accessBtn.addEventListener('click', () => {
                        closeModal();
                        sessionStorage.setItem('millave_recover_pass', newPass.value);
                        renderLockScreen(app);
                        const passField = document.getElementById('masterPassword');
                        if (passField) {
                            passField.value = newPass.value;
                            document.getElementById('unlockBtn').click();
                        }
                    });

                    showPhase(3);
                }
            } catch (e) {
                newPassError.textContent = 'error al restablecer';
                newPassError.style.color = 'var(--state-error)';
            }

            resetBtn.disabled = false;
            resetBtn.textContent = 'restablecer';
        });

        setTimeout(() => newPass.focus(), 300);
    }

    function showPhase(phase) {
        currentPhase = phase;
        document.getElementById('recoveryPhase1').style.display = phase === 1 ? '' : 'none';
        document.getElementById('recoveryPhase2').style.display = phase === 2 ? '' : 'none';
        document.getElementById('recoveryPhase3').style.display = phase === 3 ? '' : 'none';

        if (phase === 2) setupPhase2();
    }

    function closeModal() {
        panel.classList.remove('u-modal--visible');
        backdrop.classList.remove('u-backdrop--visible');
        setTimeout(() => { panel.remove(); backdrop.remove(); }, 300);
    }

    document.getElementById('recoveryCancelBtn')?.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
    });
}
