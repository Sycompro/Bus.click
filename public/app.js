/* ==========================================================
   CLIENT LOGIC ENGINE: BUS.CLICK CONNECTED TO EXPRESS/RAILWAY API
   ========================================================== */

// ==========================================
// 1. ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================
const state = {
    currentRole: 'establecimiento', // 'super-admin', 'admin-empresa', 'establecimiento'
    
    // Datos cargados desde la REST API
    companies: [],
    sedes: [],
    trabajadores: [],
    movilidades: [],
    tickets: [],
    
    // Catálogos globales SaaS dinámicos
    saasPlans: [],
    saasServices: [],
    
    // Variables de selección activa
    activeCompanyId: '',
    activeSedeId: '',
    activeVehicleId: '',
    activeFloor: 1, // Para buses de 2 pisos
    selectedSeat: null // Asiento en proceso de selección/venta
};

// Nombres para simulación de consulta DNI (RENIEC)
const MOCK_NAMES = [
    "Juan Pérez Alva", "María Alarcón Díaz", "Carlos Mendoza Quispe", 
    "Sofía Huamán Flores", "Luis Ramírez Tello", "Ana Salazar Ramos", 
    "Diego Gutiérrez Ortiz", "Gabriela Rojas Valdivia", "José Castillo Vega",
    "Lucía Valenzuela Soto", "Mateo Espinoza Guerrero", "Valeria Paredes Rivas"
];

// ==========================================
// SISTEMA DE CONFIRMACIÓN MODAL Y TOASTS PREMIUM
// ==========================================
function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;

    let iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-triangle';
    if (type === 'info') iconName = 'info';

    toast.innerHTML = `
        <div class="toast-icon">
            <i data-lucide="${iconName}"></i>
        </div>
        <div class="toast-message">${message}</div>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 3500);
}

function showConfirmModal(title, message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';

        overlay.innerHTML = `
            <div class="confirm-card">
                <div class="confirm-header-icon">
                    <i data-lucide="alert-triangle"></i>
                </div>
                <div class="confirm-title">${title}</div>
                <div class="confirm-message">${message}</div>
                <div class="confirm-actions">
                    <button class="btn btn-confirm-no" id="btn-confirm-cancel">Cancelar</button>
                    <button class="btn btn-confirm-yes" id="btn-confirm-ok">Confirmar</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        lucide.createIcons();

        const btnOk = overlay.querySelector('#btn-confirm-ok');
        const btnCancel = overlay.querySelector('#btn-confirm-cancel');

        btnOk.addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });

        btnCancel.addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(false);
            }
        });
    });
}

// ==========================================
// 2. INICIALIZACIÓN DE LA APLICACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    setupUIEventListeners();
    initSidebarBehavior();
    initSuperAdminSaasBehavior();
    
    // Sincronizar dropdowns personalizados
    syncCustomDropdowns();
    
    // Inicializar y comprobar autenticación
    const authenticated = checkAuthentication();
    if (!authenticated) {
        return; // Detener inicialización de datos si no está autenticado
    }
    
    // Cargar datos por primera vez
    await reloadAllApiData();
    
    // Configurar Polling Inteligente cada 3 segundos para sincronización en tiempo real
    setInterval(syncTicketsOnly, 3000);
}

// Cargar todos los datos desde los endpoints Express
async function reloadAllApiData() {
    try {
        const [resComp, resSede, resTrab, resMov, resTick, resPlans, resServices] = await Promise.all([
            fetch('/api/companies').then(r => r.json()),
            fetch('/api/sedes').then(r => r.json()),
            fetch('/api/trabajadores').then(r => r.json()),
            fetch('/api/movilidades').then(r => r.json()),
            fetch('/api/tickets').then(r => r.json()),
            fetch('/api/saas/plans').then(r => r.json()).catch(() => []),
            fetch('/api/saas/services').then(r => r.json()).catch(() => [])
        ]);
        
        state.companies = resComp || [];
        state.sedes = resSede || [];
        state.trabajadores = resTrab || [];
        state.movilidades = resMov || [];
        state.tickets = resTick || [];
        state.saasPlans = resPlans || [];
        state.saasServices = resServices || [];
        
        // Actualizar UI
        populateCompanySelectors();
        renderCompaniesList();
        renderPlanesList();
        renderPaymentsList();
        updateSuperStats();
        updateEstabUI();
        applyCompanyBrandTheme();
        
        // Dibujar tablas del portal de empresa (Administrador / Vendedor)
        renderSedesList();
        renderTrabajadoresList();
        renderMovilidadesList();
        
        // Reactividad de catálogos globales SaaS
        renderCatalogoPlanes();
        renderCatalogoServicios();
        populatePlanSelectors();
        populateServiceCheckboxes();
        
        if (state.activeVehicleId) {
            renderSeatingMaqueta(state.activeVehicleId);
        }
    } catch (e) {
        console.error("Error al cargar datos de la API de Railway:", e);
    }
}

// Sincronizar únicamente los pasajes (tickets) en segundo plano para refrescar la maqueta
async function syncTicketsOnly() {
    try {
        const tickets = await fetch('/api/tickets').then(r => r.json());
        
        // Comprobar si hubo cambios antes de re-renderizar para evitar parpadeos
        if (JSON.stringify(state.tickets) !== JSON.stringify(tickets)) {
            state.tickets = tickets || [];
            
            // Actualizar vistas afectadas
            updateSuperStats();
            updateEstabUI();
            if (state.activeVehicleId) {
                renderSeatingMaqueta(state.activeVehicleId);
            }
        }
    } catch (e) {
        console.warn("Error en polling de tickets:", e);
    }
}

// ==========================================
// 3. POPULACIÓN DE SELECTORES HTML
// ==========================================
function populateCompanySelectors() {
    const headerSelect = document.getElementById('header-company-select');
    if (!headerSelect) return;
    
    const prevSelected = headerSelect.value || state.activeCompanyId;
    headerSelect.innerHTML = '';
    
    if (state.companies.length === 0) {
        headerSelect.innerHTML = '<option value="">Carga Datos Semilla</option>';
        return;
    }
    
    state.companies.forEach(company => {
        const option = document.createElement('option');
        option.value = company.id;
        option.textContent = `${company.name} (${company.ruc})`;
        headerSelect.appendChild(option);
    });
    
    // Intentar restaurar selección o tomar el primero
    if (state.companies.some(c => c.id === prevSelected)) {
        headerSelect.value = prevSelected;
    } else {
        headerSelect.value = state.companies[0].id;
    }
    
    // Restringir visualización multiempresa: solo el Super Admin puede cambiar de empresa libremente.
    // Para Vendedores y Administradores de Empresa, el selector permanece bloqueado en su empresa asignada.
    if (state.currentRole !== 'super-admin') {
        headerSelect.disabled = true;
    } else {
        headerSelect.disabled = false;
    }
    
    state.activeCompanyId = headerSelect.value;
    applyCompanyBrandTheme();
    populateSedeSelectors();
    syncCustomDropdowns();
}

function populateSedeSelectors() {
    const headerSedeSelect = document.getElementById('header-sede-select');
    const workerSedeSelect = document.getElementById('trabajador-sede');
    const vehicleSedeSelect = document.getElementById('movilidad-sede');
    const routeFromSelect = document.getElementById('movilidad-route-from');
    const routeToSelect = document.getElementById('movilidad-route-to');
    
    // Si no hay ningún selector en la página, retornar
    if (!headerSedeSelect && !workerSedeSelect && !vehicleSedeSelect && !routeFromSelect && !routeToSelect) return;
    
    const prevHeaderSelected = headerSedeSelect ? (headerSedeSelect.value || state.activeSedeId) : state.activeSedeId;
    if (headerSedeSelect) headerSedeSelect.innerHTML = '';
    if (workerSedeSelect) workerSedeSelect.innerHTML = '<option value="">Selecciona Sede</option>';
    if (vehicleSedeSelect) vehicleSedeSelect.innerHTML = '<option value="">Selecciona Sede</option>';
    if (routeFromSelect) routeFromSelect.innerHTML = '<option value="">Selecciona Origen</option>';
    if (routeToSelect) routeToSelect.innerHTML = '<option value="">Selecciona Destino</option>';
    
    // Filtrar sedes por la empresa activa
    const filteredSedes = state.sedes.filter(s => s.companyId === state.activeCompanyId);
    
    if (filteredSedes.length === 0) {
        if (headerSedeSelect) headerSedeSelect.innerHTML = '<option value="">Sin sedes</option>';
        return;
    }
    
    filteredSedes.forEach(sede => {
        // En header
        if (headerSedeSelect) {
            const opt1 = document.createElement('option');
            opt1.value = sede.id;
            opt1.textContent = `${sede.name} (${sede.city})`;
            headerSedeSelect.appendChild(opt1);
        }
        
        // En formulario trabajadores
        if (workerSedeSelect) {
            const opt2 = document.createElement('option');
            opt2.value = sede.id;
            opt2.textContent = sede.name;
            workerSedeSelect.appendChild(opt2);
        }
        
        // En formulario movilidades
        if (vehicleSedeSelect) {
            const opt3 = document.createElement('option');
            opt3.value = sede.id;
            opt3.textContent = sede.name;
            vehicleSedeSelect.appendChild(opt3);
        }

        // Origen y Destino del viaje
        if (routeFromSelect) {
            const optFrom = document.createElement('option');
            optFrom.value = sede.city;
            optFrom.textContent = `${sede.city} (${sede.name})`;
            routeFromSelect.appendChild(optFrom);
        }
        if (routeToSelect) {
            const optTo = document.createElement('option');
            optTo.value = sede.city;
            optTo.textContent = `${sede.city} (${sede.name})`;
            routeToSelect.appendChild(optTo);
        }
    });
    
    if (headerSedeSelect) {
        if (filteredSedes.some(s => s.id === prevHeaderSelected)) {
            headerSedeSelect.value = prevHeaderSelected;
        } else {
            headerSedeSelect.value = filteredSedes[0].id;
        }
        state.activeSedeId = headerSedeSelect.value;
    }
    
    updateEstabUI();
    syncCustomDropdowns();
}

// Aplicar colores de la empresa de forma dinámica con variables CSS
function applyCompanyBrandTheme() {
    // Inyectar la marca de la empresa activa en el sidebar (para roles admin y sede)
    const activeCompany = state.companies.find(c => String(c.id) === String(state.activeCompanyId));
    if (!activeCompany) return;

    const sidebarName = document.getElementById('sidebar-company-name');
    const sidebarIcon = document.getElementById('sidebar-logo-icon');
    const headerBrandText = document.querySelector('.main-header .brand-text h1');

    if (sidebarName) {
        sidebarName.textContent = activeCompany.name || 'Bus.click';
    }

    if (headerBrandText && (state.currentRole === 'admin-empresa' || state.currentRole === 'establecimiento')) {
        headerBrandText.textContent = activeCompany.name || 'Bus.click';
    }

    // Aplicar color corporativo al sidebar
    const brandColor = activeCompany.color || '#6366f1';
    if (sidebarIcon) {
        sidebarIcon.style.background = `linear-gradient(135deg, ${brandColor}, ${lightenColor(brandColor, 15)})`;
    }

    // Actualizar variables CSS de marca para elementos activos del sidebar (y del wrapper)
    const sidebarWrapper = document.getElementById('sidebar-container-wrapper') || document.getElementById('sidebar-menu');
    if (sidebarWrapper) {
        sidebarWrapper.style.setProperty('--brand-sidebar-color', brandColor);
        sidebarWrapper.style.setProperty('--brand-sidebar-pale', brandColor + '14');
        sidebarWrapper.style.setProperty('--brand-sidebar-border', brandColor + '28');
    }
}

function lightenColor(color, percent) {
    let num = parseInt(color.replace("#",""), 16),
        amt = Math.round(2.55 * percent),
        R = (num >> 16) + amt,
        G = (num >> 8 & 0x00FF) + amt,
        B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R<255?R<0?0:R:255)*0x10000 + (G<255?G<0?0:G:255)*0x100 + (B<255?B<0?0:B:255)).toString(16).slice(1);
}

// ==========================================
// 4. OPERACIONES DE ESCRITURA API (POST/DELETE)
// ==========================================

async function createCompany(name, ruc, logo, color, username, password, planName, billingCycle) {
    const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ruc, logo, color, username, password, planName, billingCycle })
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error del servidor (${res.status})`);
    }
    await reloadAllApiData();
}

async function createSede(companyId, name, city, address, username, password) {
    const res = await fetch('/api/sedes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, name, city, address, username, password })
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error del servidor (${res.status})`);
    }
    await reloadAllApiData();
}

async function createTrabajador(companyId, sedeId, name, lastname, dni, role) {
    const res = await fetch('/api/trabajadores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, sedeId, name, lastname, dni, role })
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error del servidor (${res.status})`);
    }
    await reloadAllApiData();
}

async function createMovilidad(companyId, sedeId, plate, brand, modelType, routeFrom, routeTo, price, tipoLogica) {
    const res = await fetch('/api/movilidades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, sedeId, plate, brand, modelType, routeFrom, routeTo, price, tipoLogica })
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error del servidor (${res.status})`);
    }
    await reloadAllApiData();
}



async function diagnoseDatabase() {
    const modal = document.getElementById('modal-diagnose-db');
    if (!modal) return;
    
    // Mostrar modal en estado cargando
    modal.classList.remove('hidden');
    
    const connBadge = document.getElementById('diagnostic-conn-badge');
    const tableBody = document.getElementById('table-diag-db-body');
    
    connBadge.innerHTML = '<span><i class="animate-spin" data-lucide="loader-2"></i> Consultando base de datos física...</span>';
    connBadge.style.background = 'rgba(234, 179, 8, 0.1)';
    connBadge.style.color = 'var(--color-warning)';
    
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center" style="color: #64748b;">Consultando base de datos de producción...</td></tr>';
    
    document.getElementById('diag-count-companies').textContent = '...';
    document.getElementById('diag-count-sedes').textContent = '...';
    document.getElementById('diag-count-trabajadores').textContent = '...';
    document.getElementById('diag-count-movilidades').textContent = '...';
    document.getElementById('diag-count-tickets').textContent = '...';
    lucide.createIcons();

    try {
        const data = await fetch('/api/diagnose-db').then(r => r.json());
        
        // Renderizar estado de conexión
        if (data.postgresActive) {
            connBadge.innerHTML = `
                <span><i data-lucide="shield-check"></i> Base de Datos: POSTGRESQL (Nube de Railway) ACTIVO</span>
                <span style="font-size: var(--text-xs); opacity: 0.8; font-weight: 500;">Conectado físicamente y persistente</span>
            `;
            connBadge.style.background = 'rgba(16, 185, 129, 0.1)';
            connBadge.style.color = 'var(--color-success)';
        } else {
            connBadge.innerHTML = `
                <span><i data-lucide="shield-alert"></i> Base de Datos: JSON LOCAL (Fallback Volátil)</span>
                <span style="font-size: var(--text-xs); opacity: 0.8; font-weight: 500;">Advertencia: Datos efímeros en contenedor</span>
            `;
            connBadge.style.background = 'rgba(239, 68, 68, 0.1)';
            connBadge.style.color = 'var(--color-danger)';
        }
        
        // Renderizar conteos
        document.getElementById('diag-count-companies').textContent = data.counts.companies;
        document.getElementById('diag-count-sedes').textContent = data.counts.sedes;
        document.getElementById('diag-count-trabajadores').textContent = data.counts.trabajadores;
        document.getElementById('diag-count-movilidades').textContent = data.counts.movilidades;
        document.getElementById('diag-count-tickets').textContent = data.counts.tickets;
        
        // Renderizar tabla detallada de empresas y sedes
        tableBody.innerHTML = '';
        
        if (data.companies.length === 0 && data.sedes.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center" style="color: #64748b;">No hay empresas ni sedes en la base de datos física actualmente.</td></tr>';
        } else {
            // Inyectar empresas
            data.companies.forEach(c => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><span class="badge badge-premium" style="background: rgba(99, 102, 241, 0.1); color: var(--color-indigo);">EMPRESA</span></td>
                    <td class="font-bold">${c.name} <span style="font-size: var(--text-xs); color: #64748b; font-weight: 500;">(ID: ${c.id})</span></td>
                    <td><code>${c.username || '---'}</code></td>
                    <td><code>${c.password || '---'}</code></td>
                    <td><span style="color: #94a3b8; font-style: italic;">N/A (Es Principal)</span></td>
                `;
                tableBody.appendChild(tr);
            });
            
            // Inyectar sedes
            data.sedes.forEach(s => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><span class="badge badge-premium" style="background: rgba(16, 185, 129, 0.1); color: var(--color-success);">SEDE / BOLETO</span></td>
                    <td class="font-bold">${s.name} <span style="font-size: var(--text-xs); color: #64748b; font-weight: 500;">(ID: ${s.id})</span></td>
                    <td><code>${s.username || '---'}</code></td>
                    <td><code>${s.password || '---'}</code></td>
                    <td><code>${s.company_id || s.companyId || '---'}</code></td>
                `;
                tableBody.appendChild(tr);
            });
        }
        lucide.createIcons();
    } catch (err) {
        console.error("Error en diagnóstico de base de datos:", err);
        connBadge.innerHTML = '<span><i data-lucide="alert-octagon"></i> ERROR al comunicarse con la API de diagnóstico</span>';
        connBadge.style.background = 'rgba(239, 68, 68, 0.1)';
        connBadge.style.color = 'var(--color-danger)';
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center" style="color: var(--color-danger); font-weight: bold;">Error: ${err.message}</td></tr>`;
        lucide.createIcons();
    }
}

// ==========================================
// 6. RENDERIZACIÓN DE TABLAS DE GESTIÓN (ADMIN)
// ==========================================
function renderCompaniesList() {
    const tbody = document.getElementById('table-companies-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (state.companies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No hay empresas registradas actualmente.</td></tr>';
        return;
    }
    
    state.companies.forEach(company => {
        const sedesCount = state.sedes.filter(s => s.companyId === company.id).length;
        const movCount = state.movilidades.filter(m => m.companyId === company.id).length;
        
        const username = company.username || '';
        const password = company.password || '';
        
        let credsHtml = '';
        if (!username && !password) {
            credsHtml = `
                <button type="button" class="btn-generate-cred-inline" style="margin: 0;" onclick="generateAndSaveCompanyCredentials('${company.id}', '${company.name.replace(/'/g, "\\'")}', this)">
                    <i data-lucide="key" style="width: 10px; height: 10px;"></i> Generar Acceso
                </button>
            `;
        } else {
            credsHtml = `
                <div class="credentials-badge-container" style="display: flex; gap: 0.35rem; flex-wrap: wrap; margin: 0; padding: 0;">
                    <div class="credential-badge-premium user-badge" style="margin: 0;" onclick="copyTextToClipboard('${username}', this)" title="Copiar Usuario de Acceso">
                        <i data-lucide="user" style="width: 9px; height: 9px;"></i>
                        <span style="font-weight: 700; margin-left: 2px;">${username}</span>
                        <span class="btn-copy-cred" style="margin-left: 4px;"><i data-lucide="copy" style="width: 8px; height: 8px;"></i></span>
                    </div>
                    <div class="credential-badge-premium lock-badge" style="margin: 0;" onclick="copyTextToClipboard('${password}', this)" title="Copiar Contraseña de Acceso">
                        <i data-lucide="lock" style="width: 9px; height: 9px;"></i>
                        <span style="font-weight: 700; margin-left: 2px;">${password}</span>
                        <span class="btn-copy-cred" style="margin-left: 4px;"><i data-lucide="copy" style="width: 8px; height: 8px;"></i></span>
                    </div>
                </div>
            `;
        }
        
        // Generar enlace B2C exclusivo de marca blanca para la empresa
        const slug = company.name.toLowerCase().replace(/\s+/g, '-').trim();
        const b2cLink = `${window.location.origin}/compra?empresa=${slug}`;
        
        const linkHtml = `
            <div style="display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
                <div class="credential-badge-premium user-badge" style="background: rgba(124, 58, 237, 0.08); border-color: rgba(124, 58, 237, 0.2); color: #7c3aed; padding: 3px 8px; font-size: 9px; cursor: pointer; max-width: max-content; display: inline-flex; margin: 0;" onclick="copyTextToClipboard('${b2cLink}', this)" title="Copiar enlace de venta B2C de la empresa">
                    <i data-lucide="link" style="width: 10px; height: 10px;"></i>
                    <span style="font-weight: 700; margin-left: 2px;">Copiar Link Ventas</span>
                    <span class="btn-copy-cred" style="margin-left: 4px;"><i data-lucide="copy" style="width: 8px; height: 8px;"></i></span>
                </div>
                <a href="${b2cLink}" target="_blank" class="btn-generate-cred-inline" style="padding: 3px 8px; font-size: 8px; height: auto; width: auto; background: rgba(16, 185, 129, 0.08); border-color: rgba(16, 185, 129, 0.2); color: #059669; text-decoration: none; border-radius: 8px; display: inline-flex; align-items: center; gap: 2px; margin: 0; font-weight: 700;" title="Abrir portal de venta B2C">
                    <i data-lucide="external-link" style="width: 9px; height: 9px;"></i> Abrir
                </a>
            </div>
        `;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background: ${company.color || '#6366f1'}; display: inline-block; flex-shrink: 0; box-shadow: 0 0 4px ${company.color || '#6366f1'};"></span>
                    <div>
                        <div style="font-size: 0.9rem; font-weight: 800; color: #1e293b; line-height: 1.2;">${company.name}</div>
                        <div style="font-size: 0.72rem; color: #94a3b8; font-weight: 600; margin-top: 1px;">RUC: ${company.ruc}</div>
                    </div>
                </div>
            </td>
            <td>${credsHtml}</td>
            <td>${linkHtml}</td>
            <td>
                <span class="company-badge-color" style="background-color: ${company.color || '#6366f1'}"></span>
                <span class="ml-2 font-mono font-bold" style="font-size: 0.8rem; color: #475569;">${company.color || '#6366F1'}</span>
            </td>
            <td style="text-align: center; font-weight: 800; color: #475569; font-size: 0.95rem;">${sedesCount}</td>
            <td style="text-align: center; font-weight: 800; color: #475569; font-size: 0.95rem;">${movCount}</td>
            <td class="action-buttons-cell">
                <button class="btn-delete-row" data-delete-type="company" data-delete-id="${company.id}">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    lucide.createIcons();
    attachDeleteEvents();
}

function renderSedesList() {
    const tbody = document.getElementById('table-sedes-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const filteredSedes = state.sedes.filter(s => s.companyId === state.activeCompanyId);
    
    if (filteredSedes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">No hay sedes para esta empresa.</td></tr>';
        return;
    }
    
    filteredSedes.forEach(sede => {
        const username = sede.username || '';
        const password = sede.password || '';
        
        let credsHtml = '';
        if (!username && !password) {
            credsHtml = `
                <div style="margin-top: 0.35rem;">
                    <button type="button" class="btn-generate-cred-inline" onclick="generateAndSaveSedeCredentials('${sede.id}', '${sede.name.replace(/'/g, "\\'")}', this)">
                        <i data-lucide="key" style="width: 10px; height: 10px;"></i> Generar Credenciales
                    </button>
                </div>
            `;
        } else {
            credsHtml = `
                <div class="credentials-badge-container">
                    <div class="credential-badge-premium user-badge" onclick="copyTextToClipboard('${username}', this)" title="Haz clic para copiar el usuario">
                        <i data-lucide="user" style="width: 10px; height: 10px;"></i>
                        <span>${username}</span>
                        <span class="btn-copy-cred"><i data-lucide="copy"></i></span>
                    </div>
                    <div class="credential-badge-premium lock-badge" onclick="copyTextToClipboard('${password}', this)" title="Haz clic para copiar la contraseña">
                        <i data-lucide="lock" style="width: 10px; height: 10px;"></i>
                        <span>${password}</span>
                        <span class="btn-copy-cred"><i data-lucide="copy"></i></span>
                    </div>
                </div>
            `;
        }
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="font-bold">
                <div style="font-size: var(--text-sm); font-weight: 700; color: #0f172a;">${sede.name}</div>
                ${credsHtml}
            </td>
            <td>${sede.city}</td>
            <td>${sede.address}</td>
            <td class="action-buttons-cell">
                <button class="btn-delete-row" data-delete-type="sede" data-delete-id="${sede.id}">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    lucide.createIcons();
    attachDeleteEvents();
}

function renderTrabajadoresList() {
    const tbody = document.getElementById('table-trabajadores-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const filteredTrabajadores = state.trabajadores.filter(t => t.companyId === state.activeCompanyId);
    
    if (filteredTrabajadores.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No hay trabajadores registrados.</td></tr>';
        return;
    }
    
    filteredTrabajadores.forEach(t => {
        const sedeObj = state.sedes.find(s => s.id === t.sedeId);
        const sedeName = sedeObj ? sedeObj.name : 'No Asignada';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="font-bold">${t.name} ${t.lastname}</td>
            <td>${t.dni}</td>
            <td><span class="badge-version">${t.role}</span></td>
            <td>${commandLinkText(sedeName)}</td>
            <td class="action-buttons-cell">
                <button class="btn-delete-row" data-delete-type="trabajador" data-delete-id="${t.id}">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    lucide.createIcons();
    attachDeleteEvents();
}

function commandLinkText(val) {
    return val;
}

function renderMovilidadesList() {
    const tbody = document.getElementById('table-movilidades-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const filteredMovilidades = state.movilidades.filter(m => m.companyId === state.activeCompanyId);
    
    if (filteredMovilidades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">No hay vehículos registrados para esta empresa.</td></tr>';
        return;
    }
    
    filteredMovilidades.forEach(m => {
        const sedeObj = state.sedes.find(s => s.id === m.sedeId);
        const sedeName = sedeObj ? sedeObj.name : 'Sin Sede Base';
        
        const currentLocId = m.ubicacionActualSedeId || m.sedeId;
        const currentSedeObj = state.sedes.find(s => s.id === currentLocId);
        const currentSedeName = currentSedeObj ? currentSedeObj.name : sedeName;
        
        let modelText = "";
        if (m.modelType === "combi") modelText = "Combi Rural (15a)";
        else if (m.modelType === "minibus") modelText = "Minibus Colectivo (24a)";
        else if (m.modelType === "bus1p") modelText = "Bus 1 Piso (44a)";
        else if (m.modelType === "bus2p") modelText = "Bus 2 Pisos VIP (60a)";
        
        const logicaBadge = (m.tipoLogica === 'Flotante' || m.tipo_logica === 'Flotante')
            ? `<span class="badge-version" style="background: rgba(124, 58, 237, 0.08); color: #7c3aed; border: 1px solid rgba(124, 58, 237, 0.15); font-weight: 700; padding: 2px 6px;">Flotante</span>`
            : `<span class="badge-version" style="background: rgba(99, 102, 241, 0.08); color: var(--color-indigo); border: 1px solid rgba(99, 102, 241, 0.15); font-weight: 700; padding: 2px 6px;">Fija</span>`;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="plate-badge font-bold">${m.plate}</td>
            <td>${m.brand}</td>
            <td><span class="vehicle-model-pill">${modelText}</span></td>
            <td>${sedeName}</td>
            <td><span class="font-bold text-emerald-600"><i data-lucide="map-pin" style="width: 10px; height: 10px; display: inline-block; vertical-align: middle; margin-right: 2px;"></i> ${currentSedeName}</span></td>
            <td>${logicaBadge}</td>
            <td>${m.routeFrom} ➔ ${m.routeTo}</td>
            <td class="font-bold">S/. ${m.price.toFixed(2)}</td>
            <td class="action-buttons-cell">
                <button class="btn-delete-row" data-delete-type="movilidad" data-delete-id="${m.id}">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    lucide.createIcons();
    attachDeleteEvents();
}

function attachDeleteEvents() {
    const deleteButtons = document.querySelectorAll('.btn-delete-row');
    deleteButtons.forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', async (e) => {
            const type = newBtn.getAttribute('data-delete-type');
            const id = newBtn.getAttribute('data-delete-id');
            
            const typeMap = {
                'company': 'companies',
                'sede': 'sedes',
                'trabajador': 'trabajadores',
                'movilidad': 'movilidades'
            };
            const endpoint = typeMap[type] || `${type}s`;
            
            const confirmed = await showConfirmModal('Eliminar Registro', `¿Estás seguro de eliminar este registro (${type})?`);
            if (confirmed) {
                try {
                    const response = await fetch(`/api/${endpoint}/${id}`, { method: 'DELETE' });
                    if (!response.ok) {
                        const errData = await response.json().catch(() => ({}));
                        throw new Error(errData.error || 'Error del servidor');
                    }
                    await reloadAllApiData();
                    showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} eliminado correctamente.`, 'success');
                } catch (err) {
                    console.error("Error al borrar:", err);
                    showToast(`Error al eliminar: ${err.message || 'Fallo de red o servidor'}`, 'error');
                }
            }
        });
    });
}

// ==========================================
// 7. MONITOR DE ESTABLECIMIENTO Y VENDEDOR
// ==========================================
function updateEstabUI() {
    const sedeNameSpan = document.getElementById('txt-estab-sede-name');
    const countVehiclesSpan = document.getElementById('txt-estab-count-vehicles');
    const countSoldSpan = document.getElementById('txt-estab-count-sold');
    const vehiclesGrid = document.getElementById('estab-vehicles-grid');
    
    if (!sedeNameSpan) return;
    
    const activeSede = state.sedes.find(s => s.id === state.activeSedeId);
    if (!activeSede) {
        sedeNameSpan.textContent = "Sin Sede Seleccionada";
        countVehiclesSpan.textContent = "0";
        countSoldSpan.textContent = "0";
        vehiclesGrid.innerHTML = '<div class="no-data-card glass"><i data-lucide="info"></i><p>Por favor, registra o selecciona una Sede en la cabecera.</p></div>';
        lucide.createIcons();
        return;
    }
    
    sedeNameSpan.textContent = activeSede.name;
    
    const sedeVehicles = state.movilidades.filter(m => {
        const currentLocId = m.ubicacionActualSedeId || m.sedeId || m.ubicacion_actual_sede_id || m.sede_id;
        return currentLocId === state.activeSedeId && m.companyId === state.activeCompanyId;
    });
    countVehiclesSpan.textContent = sedeVehicles.length;
    
    const sedeTickets = state.tickets.filter(t => t.sedeId === state.activeSedeId);
    countSoldSpan.textContent = sedeTickets.length;
    
    vehiclesGrid.innerHTML = '';
    
    if (sedeVehicles.length === 0) {
        vehiclesGrid.innerHTML = `
            <div class="no-data-card glass">
                <i data-lucide="info"></i>
                <p>No hay vehículos programados en esta sede. Registra un vehículo y asígnalo a esta sede en el panel del Administrador.</p>
            </div>
        `;
        lucide.createIcons();
        
        document.getElementById('maqueta-empty-state').classList.remove('hidden');
        document.getElementById('maqueta-active-container').classList.add('hidden');
        state.activeVehicleId = '';
        return;
    }
    
    sedeVehicles.forEach(vehicle => {
        const vehicleTickets = state.tickets.filter(t => t.movilidadId === vehicle.id);
        const totalSeats = getCapacityByModel(vehicle.modelType);
        const occupiedSeats = vehicleTickets.length;
        const percentage = totalSeats > 0 ? Math.round((occupiedSeats / totalSeats) * 100) : 0;
        
        let modelName = "";
        let modelIcon = "bus";
        if (vehicle.modelType === "combi") { modelName = "Combi Rural"; modelIcon = "car"; }
        else if (vehicle.modelType === "minibus") { modelName = "Minibus"; modelIcon = "bus"; }
        else if (vehicle.modelType === "bus1p") { modelName = "Bus 1 Piso"; modelIcon = "bus"; }
        else if (vehicle.modelType === "bus2p") { modelName = "Bus 2 Pisos VIP"; modelIcon = "layers"; }
        
        const card = document.createElement('div');
        card.className = `vehicle-sede-card glass ${state.activeVehicleId === vehicle.id ? 'active' : ''}`;
        card.innerHTML = `
            <div class="card-top">
                <span class="plate-badge">${vehicle.plate}</span>
                <span class="badge-model-flat model-${vehicle.modelType}">
                    <i data-lucide="${modelIcon}"></i> ${modelName}
                </span>
            </div>
            
            <div class="route-graph-display">
                <div class="route-node source">
                    <i data-lucide="map-pin" style="color: #10b981;"></i>
                    <span class="node-city">${vehicle.routeFrom}</span>
                </div>
                <div class="route-line-connector">
                    <span class="connector-arrow">➔</span>
                </div>
                <div class="route-node destination">
                    <i data-lucide="map-pin" style="color: var(--brand-primary);"></i>
                    <span class="node-city">${vehicle.routeTo}</span>
                </div>
            </div>
            
            <div class="occupancy-bar-container">
                <div class="occupancy-label">
                    <span>Ocupación: ${occupiedSeats}/${totalSeats} Asientos</span>
                    <span>${percentage}%</span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill" style="width: ${percentage}%"></div>
                </div>
            </div>
            
            <button class="btn btn-secondary btn-full mt-6 btn-manage-seats" data-vehicle-id="${vehicle.id}">
                <i data-lucide="grid-3x3"></i> Gestionar Asientos
            </button>
        `;
        
        card.querySelector('.btn-manage-seats').addEventListener('click', (e) => {
            e.stopPropagation();
            selectVehicleForMaqueta(vehicle.id);
        });
        
        card.addEventListener('click', () => {
            selectVehicleForMaqueta(vehicle.id);
        });
        
        vehiclesGrid.appendChild(card);
    });
    
    lucide.createIcons();
    updateSalesTurnReport();
}

function selectVehicleForMaqueta(vehicleId) {
    state.activeVehicleId = vehicleId;
    state.activeFloor = 1;
    updateEstabUI();
    renderSeatingMaqueta(vehicleId);
}

function getCapacityByModel(modelType) {
    if (modelType === "combi") return 15;
    if (modelType === "minibus") return 24;
    if (modelType === "bus1p") return 44;
    if (modelType === "bus2p") return 60;
    return 0;
}

// ==========================================
// 8. MAQUETA INTERACTIVA DE ASIENTOS (BUS CANVAS)
// ==========================================
function renderSeatingMaqueta(vehicleId) {
    const emptyState = document.getElementById('maqueta-empty-state');
    const container = document.getElementById('maqueta-active-container');
    
    if (!emptyState || !container) return;
    
    const vehicle = state.movilidades.find(m => m.id === vehicleId);
    if (!vehicle) {
        emptyState.classList.remove('hidden');
        container.classList.add('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    container.classList.remove('hidden');
    
    document.getElementById('maqueta-txt-plate').textContent = vehicle.plate;
    document.getElementById('maqueta-txt-route').textContent = `Ruta: ${vehicle.routeFrom} ➔ ${vehicle.routeTo} | ${vehicle.brand}`;
    
    const modelIcon = document.getElementById('maqueta-icon-model');
    if (vehicle.modelType === "combi") {
        modelIcon.setAttribute('data-lucide', 'car');
    } else {
        modelIcon.setAttribute('data-lucide', 'bus');
    }
    lucide.createIcons();
    
    const floorSelector = document.getElementById('maqueta-floor-selector');
    if (vehicle.modelType === "bus2p") {
        floorSelector.classList.remove('hidden');
    } else {
        floorSelector.classList.add('hidden');
    }
    
    renderSeatsGrid(vehicle);
}

function renderSeatsGrid(vehicle) {
    const gridRender = document.getElementById('bus-seats-grid-render');
    const chassis = document.getElementById('bus-chassis-body');
    if (!gridRender || !chassis) return;
    
    gridRender.innerHTML = '';
    const vehicleTickets = state.tickets.filter(t => t.movilidadId === vehicle.id);
    
    let rows = 0;
    let cols = 4;
    let seatsLayout = [];
    
    if (vehicle.modelType === "combi") {
        rows = 5;
        cols = 4;
        chassis.style.width = "260px";
        chassis.style.borderRadius = "30px 30px 16px 16px";
        
        let seatCounter = 1;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (r === 0) {
                    if (c === 0) seatsLayout.push({ type: 'empty' });
                    else if (c === 3) seatsLayout.push({ type: 'door' });
                    else seatsLayout.push({ seatNum: seatCounter++, type: 'seat' });
                } else {
                    if (c === 2) {
                        seatsLayout.push({ type: 'aisle' });
                    } else {
                        seatsLayout.push({ seatNum: seatCounter++, type: 'seat' });
                    }
                }
            }
        }
    }
    else if (vehicle.modelType === "minibus") {
        rows = 8;
        cols = 3;
        chassis.style.width = "220px";
        chassis.style.borderRadius = "36px 36px 16px 16px";
        
        let seatCounter = 1;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (c === 2) {
                    seatsLayout.push({ type: 'aisle' });
                } else if (c === 1 && r === 0) {
                    seatsLayout.push({ type: 'door' });
                } else {
                    seatsLayout.push({ seatNum: seatCounter++, type: 'seat' });
                }
            }
        }
    }
    else if (vehicle.modelType === "bus1p") {
        rows = 11;
        cols = 4;
        chassis.style.width = "280px";
        chassis.style.borderRadius = "40px 40px 16px 16px";
        
        let seatCounter = 1;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (c === 2) {
                    seatsLayout.push({ type: 'aisle' });
                } else if (c === 3 && r === 4) {
                    seatsLayout.push({ type: 'door' });
                } else {
                    seatsLayout.push({ seatNum: seatCounter++, type: 'seat' });
                }
            }
        }
    }
    else if (vehicle.modelType === "bus2p") {
        cols = 4;
        chassis.style.width = "280px";
        chassis.style.borderRadius = "40px 40px 16px 16px";
        
        let seatCounter = 1;
        if (state.activeFloor === 1) {
            rows = 4;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (c === 2) {
                        seatsLayout.push({ type: 'aisle' });
                    } else if (r === 3 && c === 3) {
                        seatsLayout.push({ type: 'stairs' });
                    } else {
                        seatsLayout.push({ seatNum: seatCounter++, type: 'seat' });
                    }
                }
            }
        } else {
            rows = 12;
            seatCounter = 13;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (c === 2) {
                        seatsLayout.push({ type: 'aisle' });
                    } else {
                        seatsLayout.push({ seatNum: seatCounter++, type: 'seat' });
                    }
                }
            }
        }
    }
    
    gridRender.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    
    let availCount = 0;
    let occCount = 0;
    let resCount = 0;
    let totalCash = 0;
    
    seatsLayout.forEach(cell => {
        const cellEl = document.createElement('div');
        
        if (cell.type === 'aisle') {
            cellEl.className = 'aisle-cell';
        } 
        else if (cell.type === 'door') {
            cellEl.className = 'door-cell';
            cellEl.innerHTML = '<i data-lucide="door-open"></i>';
        }
        else if (cell.type === 'stairs') {
            cellEl.className = 'door-cell';
            cellEl.innerHTML = '<i data-lucide="layers"></i>';
        }
        else if (cell.type === 'empty') {
            cellEl.className = 'empty-cell';
        }
        else if (cell.type === 'seat') {
            const ticket = vehicleTickets.find(t => t.seatNum === cell.seatNum && t.floor === state.activeFloor);
            
            cellEl.className = 'bus-seat';
            cellEl.textContent = cell.seatNum;
            
            if (ticket) {
                if (ticket.status === 'Ocupado') {
                    cellEl.classList.add('occupied');
                    occCount++;
                    totalCash += parseFloat(ticket.price || 0);
                    
                    const tooltip = document.createElement('div');
                    tooltip.className = 'seat-tooltip';
                    tooltip.innerHTML = `
                        <div class="font-bold text-indigo-400">Asiento N° ${cell.seatNum}</div>
                        <div class="tooltip-line"><strong>Nombre:</strong> ${ticket.passengerName}</div>
                        <div class="tooltip-line"><strong>DNI:</strong> ${ticket.passengerDni}</div>
                        <div class="tooltip-line"><strong>Ruta:</strong> ${ticket.routeFrom} ➔ ${ticket.routeTo}</div>
                        <div class="tooltip-line"><strong>Pago:</strong> ${ticket.paymentMethod}</div>
                        <div class="tooltip-line"><strong>Precio:</strong> S/. ${parseFloat(ticket.price).toFixed(2)}</div>
                    `;
                    cellEl.appendChild(tooltip);
                } else if (ticket.status === 'Reservado') {
                    cellEl.classList.add('reserved');
                    resCount++;
                    
                    const tooltip = document.createElement('div');
                    tooltip.className = 'seat-tooltip';
                    tooltip.innerHTML = `
                        <div class="font-bold text-amber-400">Asiento Reservado</div>
                        <div class="tooltip-line"><strong>Nombre:</strong> ${ticket.passengerName}</div>
                        <div class="tooltip-line"><strong>DNI:</strong> ${ticket.passengerDni}</div>
                        <div class="tooltip-line text-xs italic mt-2">Reservado sin pago completo</div>
                    `;
                    cellEl.appendChild(tooltip);
                    
                    cellEl.addEventListener('click', async () => {
                        const confirmed = await showConfirmModal('Liberar Reserva', `La reserva de este asiento está a nombre de ${ticket.passengerName}.<br><br>¿Deseas cancelarla y liberarla de la base de datos?`);
                        if (confirmed) {
                            try {
                                await fetch(`/api/tickets/${ticket.id}`, { method: 'DELETE' });
                                await reloadAllApiData();
                                showToast('Reserva liberada correctamente.', 'success');
                            } catch (e) {
                                console.error(e);
                                showToast('Error al intentar liberar la reserva.', 'error');
                            }
                        }
                    });
                } else if (ticket.status === 'Reservado_Temporal') {
                    cellEl.classList.add('reserved');
                    cellEl.style.opacity = '0.85';
                    resCount++;
                    
                    const tooltip = document.createElement('div');
                    tooltip.className = 'seat-tooltip';
                    tooltip.innerHTML = `
                        <div class="font-bold text-amber-300">Bloqueo Temporal</div>
                        <div class="tooltip-line"><strong>Origen:</strong> Compra Web/Taquilla</div>
                        <div class="tooltip-line text-xs italic mt-2">Se liberará automáticamente si no se concreta el pago en 10 minutos.</div>
                    `;
                    cellEl.appendChild(tooltip);
                    
                    // Permitir al administrador liberar un bloqueo temporal si lo desea
                    cellEl.addEventListener('click', async () => {
                        const confirmed = await showConfirmModal('Liberar Bloqueo Temporal', `Este asiento se encuentra bloqueado temporalmente por un cliente.<br><br>¿Deseas forzar su liberación?`);
                        if (confirmed) {
                            try {
                                await fetch(`/api/tickets/${ticket.id}`, { method: 'DELETE' });
                                await reloadAllApiData();
                                showToast('Bloqueo temporal liberado.', 'success');
                            } catch (e) {
                                console.error(e);
                                showToast('Error al intentar liberar el bloqueo.', 'error');
                            }
                        }
                    });
                }
            } else {
                cellEl.classList.add('available');
                availCount++;
                
                cellEl.addEventListener('click', () => {
                    openSaleModal(cell.seatNum, vehicle);
                });
            }
        }
        
        gridRender.appendChild(cellEl);
    });
    
    const occupancyEl = document.getElementById('maqueta-txt-occupancy');
    const availEl = document.getElementById('stat-seats-avail');
    const occEl = document.getElementById('stat-seats-occ');
    const resEl = document.getElementById('stat-seats-res');
    const cashEl = document.getElementById('stat-seats-cash');

    if (occupancyEl) occupancyEl.textContent = `Asientos: ${occCount + resCount} / ${getCapacityByModel(vehicle.modelType)} ocupados`;
    if (availEl) availEl.textContent = availCount;
    if (occEl) occEl.textContent = occCount;
    if (resEl) resEl.textContent = resCount;
    if (cashEl) cashEl.textContent = `S/. ${totalCash.toFixed(2)}`;
    
    lucide.createIcons();
}

// ==========================================
// 9. MODAL DE REGISTRO DE VENTA
// ==========================================
function openSaleModal(seatNum, vehicle) {
    state.selectedSeat = seatNum;
    
    // Ejecutar el reset primero para limpiar campos anteriores sin afectar los elementos que inyectamos por JS
    document.getElementById('form-register-sale').reset();
    
    document.getElementById('modal-seat-num').textContent = seatNum;
    document.getElementById('sale-route-from').value = vehicle.routeFrom;
    document.getElementById('sale-route-to').value = vehicle.routeTo;
    document.getElementById('sale-price').value = vehicle.price;
    
    // Rellenar dinámicamente métodos de pago configurados por la empresa
    const activeCompany = state.companies.find(c => c.id === state.activeCompanyId);
    const methods = (activeCompany && activeCompany.paymentMethods) ? activeCompany.paymentMethods : ['Efectivo', 'Yape/Plin'];
    const selectPayment = document.getElementById('sale-payment');
    if (selectPayment) {
        selectPayment.innerHTML = '';
        methods.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            selectPayment.appendChild(opt);
        });
    }
    
    document.getElementById('modal-sale-register').classList.remove('hidden');
    syncCustomDropdowns(); // Sincronizar el dropdown personalizado con los nuevos métodos
}

function closeSaleModal() {
    document.getElementById('modal-sale-register').classList.add('hidden');
    state.selectedSeat = null;
}

// Guardado del boleto a la API
async function handleRegisterSale(e) {
    e.preventDefault();
    
    const dni = document.getElementById('sale-dni').value.trim();
    const name = document.getElementById('sale-passenger-name').value.trim();
    const status = document.getElementById('sale-status').value;
    const payment = document.getElementById('sale-payment').value;
    const price = parseFloat(document.getElementById('sale-price').value);
    
    if (!dni || !name) {
        showToast("Completa todos los campos obligatorios.", "error");
        return;
    }
    
    const vehicle = state.movilidades.find(m => m.id === state.activeVehicleId);
    if (!vehicle) return;
    
    try {
        const ticketData = {
            companyId: state.activeCompanyId,
            sedeId: state.activeSedeId,
            movilidadId: state.activeVehicleId,
            seatNum: state.selectedSeat,
            floor: state.activeFloor,
            passengerName: name,
            passengerDni: dni,
            status, // 'Ocupado', 'Reservado'
            paymentMethod: payment,
            price,
            date: new Date().toLocaleString('es-PE')
        };
        
        const res = await fetch('/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ticketData)
        }).then(r => r.json());
        
        closeSaleModal();
        await reloadAllApiData();
        
        showToast(status === 'Ocupado' ? "Boleto emitido con éxito." : "Reserva registrada con éxito.", "success");
        
        if (status === 'Ocupado') {
            showTicket(res.id, ticketData);
        }
    } catch (e) {
        console.error("Error al registrar venta en API:", e);
        showToast("Ocurrió un error guardando el boleto.", "error");
    }
}

// Mostrar Boleto Digital
function showTicket(ticketId, ticketData) {
    const activeCompany = state.companies.find(c => c.id === state.activeCompanyId);
    
    document.getElementById('ticket-company-name').textContent = activeCompany ? activeCompany.name : "Expreso Bus.click";
    document.getElementById('ticket-company-ruc').textContent = activeCompany ? `RUC: ${activeCompany.ruc}` : "RUC: 20123456789";
    
    document.getElementById('ticket-id').textContent = `SERIE BC02-00${String(ticketId).slice(-6).toUpperCase()}`;
    document.getElementById('ticket-passenger').textContent = ticketData.passengerName;
    document.getElementById('ticket-dni').textContent = ticketData.passengerDni;
    document.getElementById('ticket-seat').textContent = ticketData.seatNum + (vehicleIsTwoFloors() ? ` (Piso ${ticketData.floor})` : '');
    document.getElementById('ticket-status').textContent = ticketData.status === 'Ocupado' ? 'PAGADO' : 'SEPARADO';
    const mobility = state.movilidades.find(m => m.id === ticketData.movilidadId);
    const routeFrom = mobility ? mobility.routeFrom : (ticketData.routeFrom || ticketData.route_from || "Origen");
    const routeTo = mobility ? mobility.routeTo : (ticketData.routeTo || ticketData.route_to || "Destino");
    document.getElementById('ticket-route').textContent = `${routeFrom} ➔ ${routeTo}`;

    // Buscar sede de llegada (destino) de la empresa para indicar la dirección exacta
    const companySedes = state.sedes.filter(s => s.companyId === state.activeCompanyId);
    const destSede = companySedes.find(s => s.city.toLowerCase() === routeTo.toLowerCase());
    const destinationAddress = destSede ? `${destSede.name} - ${destSede.address}` : `Terminal Terrestre de ${routeTo}`;
    
    const addressContainer = document.getElementById('ticket-destination-address');
    if (addressContainer) {
        addressContainer.textContent = destinationAddress;
    }

    document.getElementById('ticket-payment').textContent = ticketData.paymentMethod;
    document.getElementById('ticket-date').textContent = ticketData.date;
    document.getElementById('ticket-price').textContent = `S/. ${ticketData.price.toFixed(2)}`;

    // --- GENERAR CÓDIGO QR Y CÓDIGO DE BARRAS DINÁMICOS EN TAQUILLA ---
    const qrContainer = document.getElementById("seller-qr-render");
    if (qrContainer) {
        qrContainer.innerHTML = "";
        try {
            new QRCode(qrContainer, {
                text: `https://bus.click/verify/${ticketId}`,
                width: 80,
                height: 80,
                colorDark: "#1e1b4b",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        } catch (e) {
            console.error("Error al generar código QR para taquilla:", e);
        }
    }

    const barcodeSvg = document.getElementById("seller-barcode-render");
    if (barcodeSvg) {
        try {
            JsBarcode("#seller-barcode-render", String(ticketId).toUpperCase(), {
                format: "CODE128",
                lineColor: "#1e1b4b",
                height: 35,
                width: 1.5,
                displayValue: true,
                fontSize: 10,
                background: "transparent"
            });
        } catch (e) {
            console.error("Error al generar código de barras para taquilla:", e);
        }
    }
    
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
    
    document.getElementById('modal-ticket-view').classList.remove('hidden');
}

function vehicleIsTwoFloors() {
    const vehicle = state.movilidades.find(m => m.id === state.activeVehicleId);
    return vehicle && vehicle.modelType === "bus2p";
}

function closeTicketModal() {
    document.getElementById('modal-ticket-view').classList.add('hidden');
}

// Consulta real de DNI con apiperu.dev a través de proxy seguro
async function handleSearchDni() {
    const dniInput = document.getElementById('sale-dni');
    const dni = dniInput ? dniInput.value.trim() : '';
    if (dni.length !== 8 || isNaN(dni)) {
        showToast("Por favor, ingresa un número de DNI válido de 8 dígitos numéricos.", "error");
        return;
    }
    
    const searchBtn = document.getElementById('btn-buscar-dni');
    if (!searchBtn) return;
    
    searchBtn.disabled = true;
    const originalHtml = searchBtn.innerHTML;
    searchBtn.innerHTML = `...`;
    
    try {
        showToast("Consultando DNI en RENIEC...", "info");
        const res = await fetch('/api/consultar-dni', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dni })
        }).then(r => r.json());
        
        if (res.success && res.data) {
            const person = res.data;
            document.getElementById('sale-passenger-name').value = person.nombre_completo;
            searchBtn.innerHTML = '<i data-lucide="check"></i>';
            showToast(`DNI Encontrado: ${person.nombre_completo}`, "success");
        } else {
            showToast(res.error || "No se encontraron datos en RENIEC. Puedes ingresar el nombre manualmente.", "error");
            searchBtn.innerHTML = '<i data-lucide="alert-circle"></i>';
        }
    } catch (err) {
        console.error(err);
        showToast("Error al conectarse con el servicio de consulta de DNI.", "error");
        searchBtn.innerHTML = '<i data-lucide="alert-circle"></i>';
    } finally {
        setTimeout(() => {
            searchBtn.disabled = false;
            searchBtn.innerHTML = originalHtml;
            lucide.createIcons();
        }, 1500);
    }
}

// Consulta de DNI para registro de Personal
async function handleSearchTrabajadorDni() {
    const dniInput = document.getElementById('trabajador-dni');
    const dni = dniInput ? dniInput.value.trim() : '';
    if (dni.length !== 8 || isNaN(dni)) {
        showToast("Por favor, ingresa un número de DNI válido de 8 dígitos numéricos.", "error");
        return;
    }
    
    const searchBtn = document.getElementById('btn-buscar-trabajador-dni');
    if (!searchBtn) return;
    
    searchBtn.disabled = true;
    const originalHtml = searchBtn.innerHTML;
    searchBtn.innerHTML = `...`;
    
    try {
        showToast("Consultando DNI de personal en RENIEC...", "info");
        const res = await fetch('/api/consultar-dni', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dni })
        }).then(r => r.json());
        
        if (res.success && res.data) {
            const person = res.data;
            document.getElementById('trabajador-name').value = person.nombres || person.nombre_completo || "";
            const apellido = [person.apellido_paterno, person.apellido_materno].filter(Boolean).join(" ");
            document.getElementById('trabajador-lastname').value = apellido || "";
            searchBtn.innerHTML = '<i data-lucide="check"></i>';
            showToast(`DNI Encontrado: ${person.nombre_completo}`, "success");
        } else {
            showToast(res.error || "No se encontraron datos en RENIEC. Puedes ingresar los nombres manualmente.", "error");
            searchBtn.innerHTML = '<i data-lucide="alert-circle"></i>';
        }
    } catch (err) {
        console.error(err);
        showToast("Error al conectarse con el servicio de consulta de DNI.", "error");
        searchBtn.innerHTML = '<i data-lucide="alert-circle"></i>';
    } finally {
        setTimeout(() => {
            searchBtn.disabled = false;
            searchBtn.innerHTML = originalHtml;
            lucide.createIcons();
        }, 1500);
    }
}

// --- MODAL GESTIONAR TICKET (MODIFICAR, CAMBIAR VIAJE, LIBERAR ASIENTO) ---
function openManageTicketModal(ticket) {
    document.getElementById('manage-ticket-id').value = ticket.id;
    document.getElementById('manage-dni').value = ticket.passengerDni;
    document.getElementById('manage-passenger-name').value = ticket.passengerName;
    
    // Formatear fecha para el input tipo date (YYYY-MM-DD)
    let formattedDate = "";
    if (ticket.date) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(ticket.date)) {
            formattedDate = ticket.date;
        } else {
            const parts = ticket.date.split('/');
            if (parts.length === 3) {
                formattedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            } else {
                formattedDate = new Date().toISOString().split('T')[0];
            }
        }
    } else {
        formattedDate = new Date().toISOString().split('T')[0];
    }
    setPremiumDatepickerValue('manage-date', formattedDate);
    document.getElementById('manage-seat').value = ticket.seatNum;
    document.getElementById('manage-floor').value = ticket.floor || "1";
    
    document.getElementById('modal-manage-ticket').classList.remove('hidden');
    lucide.createIcons();
}

function closeManageTicketModal() {
    document.getElementById('modal-manage-ticket').classList.add('hidden');
}

// Búsqueda RENIEC en Gestionar Ticket
async function handleSearchManageDni() {
    const dniInput = document.getElementById('manage-dni');
    const dni = dniInput ? dniInput.value.trim() : '';
    if (dni.length !== 8 || isNaN(dni)) {
        showToast("Por favor, ingresa un número de DNI válido de 8 dígitos numéricos.", "error");
        return;
    }
    
    const searchBtn = document.getElementById('btn-buscar-manage-dni');
    if (!searchBtn) return;
    
    searchBtn.disabled = true;
    const originalHtml = searchBtn.innerHTML;
    searchBtn.innerHTML = `...`;
    
    try {
        showToast("Consultando DNI en RENIEC...", "info");
        const res = await fetch('/api/consultar-dni', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dni })
        }).then(r => r.json());
        
        if (res.success && res.data) {
            const person = res.data;
            document.getElementById('manage-passenger-name').value = person.nombre_completo;
            searchBtn.innerHTML = '<i data-lucide="check"></i>';
            showToast(`DNI Encontrado: ${person.nombre_completo}`, "success");
        } else {
            showToast(res.error || "No se encontraron datos en RENIEC.", "error");
            searchBtn.innerHTML = '<i data-lucide="alert-circle"></i>';
        }
    } catch (err) {
        console.error(err);
        showToast("Error al conectarse con el servicio de DNI.", "error");
        searchBtn.innerHTML = '<i data-lucide="alert-circle"></i>';
    } finally {
        setTimeout(() => {
            searchBtn.disabled = false;
            searchBtn.innerHTML = originalHtml;
            lucide.createIcons();
        }, 1500);
    }
}

// Guardar cambios en el Ticket
async function handleManageTicketSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('manage-ticket-id').value;
    const passengerName = document.getElementById('manage-passenger-name').value.trim();
    const passengerDni = document.getElementById('manage-dni').value.trim();
    const date = document.getElementById('manage-date').value;
    const seatNum = parseInt(document.getElementById('manage-seat').value);
    const floor = parseInt(document.getElementById('manage-floor').value);

    try {
        showToast("Guardando cambios en el pasaje...", "info");
        const res = await fetch(`/api/tickets/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passengerName, passengerDni, seatNum, floor, date })
        }).then(r => r.json());

        if (res.success) {
            showToast("Boleto modificado con éxito.", "success");
            closeManageTicketModal();
            await reloadAllApiData();
            if (state.activeVehicleId) {
                renderSeatingMaqueta(state.activeVehicleId);
            }
        } else {
            showToast(res.error || "Error al modificar el boleto.", "error");
        }
    } catch (e) {
        console.error("Error al actualizar pasaje:", e);
        showToast("Ocurrió un error al actualizar el pasaje.", "error");
    }
}

// Liberar asiento (Eliminar pasaje)
async function handleLiberarAsiento() {
    const id = document.getElementById('manage-ticket-id').value;
    if (!id) return;
    
    showConfirmModal({
        title: "Liberar Asiento",
        message: "¿Estás completamente seguro de liberar este asiento? Esta acción eliminará el pasaje de forma permanente y el asiento quedará disponible.",
        icon: "trash-2",
        confirmColor: "#ef4444",
        onConfirm: async () => {
            try {
                showToast("Liberando asiento...", "info");
                const res = await fetch(`/api/tickets/${id}`, {
                    method: 'DELETE'
                }).then(r => r.json());
                
                if (res.success) {
                    showToast("Asiento liberado y pasaje eliminado correctamente.", "success");
                    closeManageTicketModal();
                    await reloadAllApiData();
                    if (state.activeVehicleId) {
                        renderSeatingMaqueta(state.activeVehicleId);
                    }
                } else {
                    showToast(res.error || "Error al liberar el asiento.", "error");
                }
            } catch (e) {
                console.error("Error al liberar asiento:", e);
                showToast("Ocurrió un error al liberar el asiento.", "error");
            }
        }
    });
}

// ==========================================
// 10. SISTEMA MULTI-ROL Y SWITCHER FLOTANTE
// ==========================================
function switchRoleView(role) {
    state.currentRole = role;
    
    const buttons = document.querySelectorAll('.floating-role-switcher .role-btn');
    buttons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-role-view') === role) {
            btn.classList.add('active');
        }
    });
    
    const panelSuperAdmin = document.getElementById('panel-super-admin') || document.getElementById('apartado-ecosistema');
    const panelAdminEmpresa = document.getElementById('panel-admin-empresa');
    const panelEstablecimiento = document.getElementById('panel-establecimiento');
    
    if (panelSuperAdmin) panelSuperAdmin.classList.add('hidden');
    if (panelAdminEmpresa) panelAdminEmpresa.classList.add('hidden');
    if (panelEstablecimiento) panelEstablecimiento.classList.add('hidden');
    
    const headerCompanySelect = document.getElementById('header-company-select');
    const headerCompany = headerCompanySelect ? headerCompanySelect.closest('.company-selector-container') : null;
    const headerSede = document.getElementById('header-sede-wrapper') || document.querySelector('.sede-selector-container');
    
    if (role === 'super-admin') {
        if (panelSuperAdmin) panelSuperAdmin.classList.remove('hidden');
        if (headerCompany) headerCompany.style.display = 'none';
        if (headerSede) headerSede.style.display = 'none';
    } 
    else if (role === 'admin-empresa') {
        if (panelAdminEmpresa) panelAdminEmpresa.classList.remove('hidden');
        if (headerCompany) headerCompany.style.display = 'flex';
        if (headerSede) headerSede.style.display = 'none';
    } 
    else if (role === 'establecimiento') {
        if (panelEstablecimiento) panelEstablecimiento.classList.remove('hidden');
        if (headerCompany) headerCompany.style.display = 'flex';
        if (headerSede) headerSede.style.display = 'flex';
    }
}

// Actualizar contadores en Panel Super Admin
function updateSuperStats() {
    const sCompanies = document.getElementById('stat-super-companies');
    const sSedes = document.getElementById('stat-super-sedes');
    const sVehicles = document.getElementById('stat-super-vehicles');
    const sTickets = document.getElementById('stat-super-tickets');
    
    if (!sCompanies) return;
    
    sCompanies.textContent = state.companies.length;
    sSedes.textContent = state.sedes.length;
    sVehicles.textContent = state.movilidades.length;
    
    const paidTickets = state.tickets.filter(t => t.status === 'Ocupado');
    sTickets.textContent = paidTickets.length;
}

// ==========================================
// 11. EVENT LISTENERS GENERALES
// ==========================================
function setupUIEventListeners() {
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            const role = state.currentRole;
            if (role === 'super-admin') {
                localStorage.removeItem('superadmin_logged_in');
                localStorage.removeItem('superadmin_email');
                localStorage.removeItem('superadmin_name');
            } else if (role === 'admin-empresa') {
                localStorage.removeItem('admin_company_id');
                localStorage.removeItem('admin_company_name');
            } else if (role === 'establecimiento') {
                localStorage.removeItem('sede_id');
                localStorage.removeItem('sede_name');
                localStorage.removeItem('sede_company_id');
            }
            showToast("Sesión cerrada correctamente. Redirigiendo...", "info");
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        });
    }

    const headerCompanySelect = document.getElementById('header-company-select');
    if (headerCompanySelect) {
        headerCompanySelect.addEventListener('change', (e) => {
            state.activeCompanyId = e.target.value;
            applyCompanyBrandTheme();
            populateSedeSelectors();
            renderSedesList();
            renderTrabajadoresList();
            renderMovilidadesList();
            updateEstabUI();
            
            const activeCompanyObj = state.companies.find(c => c.id === state.activeCompanyId);
            if (activeCompanyObj) {
                document.getElementById('admin-empresa-subtitle').textContent = `Gestiona las sedes, personal y vehículos de ${activeCompanyObj.name}.`;
            }
        });
    }

    const headerSedeSelect = document.getElementById('header-sede-select');
    if (headerSedeSelect) {
        headerSedeSelect.addEventListener('change', (e) => {
            state.activeSedeId = e.target.value;
            updateEstabUI();
            
            document.getElementById('maqueta-empty-state').classList.remove('hidden');
            document.getElementById('maqueta-active-container').classList.add('hidden');
            state.activeVehicleId = '';
        });
    }

    const roleButtons = document.querySelectorAll('.floating-role-switcher .role-btn');
    roleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const role = btn.getAttribute('data-role-view');
            switchRoleView(role);
        });
    });



    const btnDiag = document.getElementById('btn-diagnose-db');
    if (btnDiag) {
        btnDiag.addEventListener('click', diagnoseDatabase);
    }

    const modalDiag = document.getElementById('modal-diagnose-db');
    if (modalDiag) {
        const btnCloseDiag = document.getElementById('btn-close-diagnose-modal');
        const btnCloseDiagBottom = document.getElementById('btn-close-diagnose-modal-bottom');
        if (btnCloseDiag) {
            btnCloseDiag.addEventListener('click', () => modalDiag.classList.add('hidden'));
        }
        if (btnCloseDiagBottom) {
            btnCloseDiagBottom.addEventListener('click', () => modalDiag.classList.add('hidden'));
        }
    }

    const formCompany = document.getElementById('form-create-company');
    if (formCompany) {
        formCompany.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('company-name').value.trim();
            const ruc = document.getElementById('company-ruc').value.trim();
            const logo = ""; // Solución preventiva: no leer '#company-logo' ya que no existe en el DOM
            const color = document.getElementById('company-color').value;
            const username = document.getElementById('company-username').value.trim();
            const password = document.getElementById('company-password').value.trim();
            const planName = document.getElementById('company-plan').value;
            const billingCycle = document.getElementById('company-billing-cycle').value;
            
            await createCompany(name, ruc, logo, color, username, password, planName, billingCycle);
            formCompany.reset();
            const cu = document.getElementById('company-username');
            const cp = document.getElementById('company-password');
            if (cu) delete cu.dataset.dirty;
            if (cp) delete cp.dataset.dirty;
            
            const colorText = document.querySelector('.color-value-text');
            if (colorText) colorText.textContent = '#6366F1';
            
            const modalCompany = document.getElementById('modal-create-company');
            if (modalCompany) modalCompany.classList.add('hidden');
            
            showToast("Empresa registrada con éxito.", "success");
        });
        
        const btnBuscarRuc = document.getElementById('btn-buscar-ruc');
        if (btnBuscarRuc) {
            btnBuscarRuc.addEventListener('click', async () => {
                const rucInput = document.getElementById('company-ruc');
                const ruc = rucInput ? rucInput.value.trim() : '';
                if (ruc.length !== 11 || isNaN(ruc)) {
                    showToast("Por favor, ingresa un RUC válido de 11 dígitos numéricos.", "error");
                    return;
                }
                
                btnBuscarRuc.disabled = true;
                const originalHtml = btnBuscarRuc.innerHTML;
                btnBuscarRuc.innerHTML = `Buscando...`;
                
                try {
                    showToast("Consultando RUC en SUNAT...", "info");
                    const res = await fetch('/api/consultar-ruc', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ruc })
                    }).then(r => r.json());
                    
                    if (res.success && res.data) {
                        const co = res.data;
                        document.getElementById('company-name').value = co.nombre_o_razon_social;
                        generateCompanyCredentialsSuggestions(co.nombre_o_razon_social);
                        showToast(`RUC Encontrado: ${co.nombre_o_razon_social} (${co.estado} / ${co.condicion})`, "success");
                    } else {
                        showToast(res.error || "No se encontraron datos de SUNAT para este RUC. Regístralo manualmente.", "error");
                    }
                } catch (err) {
                    console.error(err);
                    showToast("Error al conectarse con el servicio de consulta de RUC.", "error");
                } finally {
                    setTimeout(() => {
                        btnBuscarRuc.disabled = false;
                        btnBuscarRuc.innerHTML = originalHtml;
                        lucide.createIcons();
                    }, 1000);
                }
            });
            
            document.getElementById('company-ruc').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    btnBuscarRuc.click();
                }
            });
        }
        
        document.getElementById('company-color').addEventListener('input', (e) => {
            document.querySelector('.color-value-text').textContent = e.target.value.toUpperCase();
        });
    }

    const formSede = document.getElementById('form-create-sede');
    if (formSede) {
        formSede.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('sede-name').value.trim();
            const city = document.getElementById('sede-city').value.trim();
            const address = document.getElementById('sede-address').value.trim();
            const username = document.getElementById('sede-username').value.trim();
            const password = document.getElementById('sede-password').value.trim();
            
            try {
                await createSede(state.activeCompanyId, name, city, address, username, password);
                
                formSede.reset();
                const su = document.getElementById('sede-username');
                const sp = document.getElementById('sede-password');
                if (su) delete su.dataset.dirty;
                if (sp) delete sp.dataset.dirty;
                
                const modalSede = document.getElementById('modal-create-sede');
                if (modalSede) modalSede.classList.add('hidden');
                
                showToast("Sede registrada con éxito.", "success");
            } catch (err) {
                console.error(err);
                showToast(err.message || "Error al registrar la sede.", "error");
            }
        });
    }

    const formTrabajador = document.getElementById('form-create-trabajador');
    if (formTrabajador) {
        formTrabajador.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('trabajador-name').value.trim();
            const lastname = document.getElementById('trabajador-lastname').value.trim();
            const dni = document.getElementById('trabajador-dni').value.trim();
            const role = document.getElementById('trabajador-role').value;
            const sedeId = document.getElementById('trabajador-sede').value;
            
            if (!sedeId) {
                showToast("Por favor selecciona una sede válida.", "error");
                return;
            }
            
            await createTrabajador(state.activeCompanyId, sedeId, name, lastname, dni, role);
            formTrabajador.reset();
            
            const modalTrab = document.getElementById('modal-create-trabajador');
            if (modalTrab) modalTrab.classList.add('hidden');
            
            showToast("Trabajador registrado con éxito.", "success");
        });
    }

    const formMovilidad = document.getElementById('form-create-movilidad');
    if (formMovilidad) {
        formMovilidad.addEventListener('submit', async (e) => {
            e.preventDefault();
            const plate = document.getElementById('movilidad-plate').value.trim();
            const brand = document.getElementById('movilidad-brand').value.trim();
            const modelType = document.getElementById('movilidad-model').value;
            const tipoLogica = document.getElementById('movilidad-tipo-logica').value;
            const sedeId = document.getElementById('movilidad-sede').value;
            const routeFrom = document.getElementById('movilidad-route-from').value.trim();
            const routeTo = document.getElementById('movilidad-route-to').value.trim();
            const price = document.getElementById('movilidad-price').value;
            
            if (!sedeId) {
                showToast("Por favor selecciona una sede base.", "error");
                return;
            }
            
            await createMovilidad(state.activeCompanyId, sedeId, plate, brand, modelType, routeFrom, routeTo, price, tipoLogica);
            formMovilidad.reset();
            
            const modalMov = document.getElementById('modal-create-movilidad');
            if (modalMov) modalMov.classList.add('hidden');
            
            showToast("Vehículo incorporado a la flota con éxito.", "success");
        });
    }

    const adminTabBtns = document.querySelectorAll('.tab-btn[data-admin-tab]');
    adminTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            adminTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const targetTab = btn.getAttribute('data-admin-tab');
            const tabs = ['sedes', 'trabajadores', 'movilidades', 'settings'];
            tabs.forEach(t => {
                const el = document.getElementById(`tab-admin-${t}`);
                if (el) el.classList.add('hidden');
            });
            
            const targetEl = document.getElementById(`tab-admin-${targetTab}`);
            if (targetEl) targetEl.classList.remove('hidden');
            
            if (targetTab === 'settings') {
                initAdminSettingsTab();
            }
        });
    });

    const floorBtns = document.querySelectorAll('.floor-btn');
    floorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            floorBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            state.activeFloor = parseInt(btn.getAttribute('data-floor'));
            if (state.activeVehicleId) {
                renderSeatingMaqueta(state.activeVehicleId);
            }
        });
    });

    document.getElementById('btn-close-sale-modal')?.addEventListener('click', closeSaleModal);
    document.getElementById('btn-cancel-sale')?.addEventListener('click', closeSaleModal);
    document.getElementById('btn-search-dni')?.addEventListener('click', handleSearchDni);
    document.getElementById('btn-buscar-dni')?.addEventListener('click', handleSearchDni);
    document.getElementById('sale-dni')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSearchDni();
        }
    });
    document.getElementById('form-register-sale')?.addEventListener('submit', handleRegisterSale);
    
    // Buscar DNI de personal en RENIEC
    document.getElementById('btn-buscar-trabajador-dni')?.addEventListener('click', handleSearchTrabajadorDni);
    document.getElementById('trabajador-dni')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSearchTrabajadorDni();
        }
    });
    
    // Gestionar ticket (Modificar, Cambiar viaje, Liberar)
    document.getElementById('btn-close-manage-ticket-modal')?.addEventListener('click', closeManageTicketModal);
    document.getElementById('btn-buscar-manage-dni')?.addEventListener('click', handleSearchManageDni);
    document.getElementById('manage-dni')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSearchManageDni();
        }
    });
    document.getElementById('form-manage-ticket')?.addEventListener('submit', handleManageTicketSubmit);
    document.getElementById('btn-liberar-asiento')?.addEventListener('click', handleLiberarAsiento);
    
    document.getElementById('btn-close-ticket')?.addEventListener('click', closeTicketModal);
    document.getElementById('btn-print-ticket')?.addEventListener('click', () => {
        window.print();
    });

    // Cambiar vista inicial según el rol detectado o por defecto
    if (typeof state !== 'undefined' && state.currentRole) {
        switchRoleView(state.currentRole);
    } else {
        switchRoleView('establecimiento');
    }

    // --- AUTO-GENERACIÓN DINÁMICA DE CREDENCIALES ---
    // 1. Inputs de Empresa
    const compName = document.getElementById('company-name');
    const compUser = document.getElementById('company-username');
    const compPass = document.getElementById('company-password');
    
    if (compUser) compUser.addEventListener('input', () => compUser.dataset.dirty = 'true');
    if (compPass) compPass.addEventListener('input', () => compPass.dataset.dirty = 'true');
    
    if (compName && compUser && compPass) {
        compName.addEventListener('input', (e) => {
            generateCompanyCredentialsSuggestions(e.target.value);
        });
    }
    
    // 2. Inputs de Sede
    const sedeName = document.getElementById('sede-name');
    const sedeUser = document.getElementById('sede-username');
    const sedePass = document.getElementById('sede-password');
    
    if (sedeUser) sedeUser.addEventListener('input', () => sedeUser.dataset.dirty = 'true');
    if (sedePass) sedePass.addEventListener('input', () => sedePass.dataset.dirty = 'true');
    
    if (sedeName && sedeUser && sedePass) {
        sedeName.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (!val) {
                if (!sedeUser.dataset.dirty) sedeUser.value = '';
                if (!sedePass.dataset.dirty) sedePass.value = '';
                return;
            }
            const activeCompany = state.companies.find(c => c.id === state.activeCompanyId);
            const companyPrefix = activeCompany ? slugify(activeCompany.name) : 'sede';
            const cleanSlug = slugify(val);
            const initials = val.split(' ').map(w => w[0]).join('').toLowerCase().replace(/[^a-z]/g, '');
            const randomNum = Math.floor(100 + Math.random() * 900);
            
            if (!sedeUser.dataset.dirty) {
                sedeUser.value = `${companyPrefix}_${cleanSlug}`;
            }
            if (!sedePass.dataset.dirty) {
                sedePass.value = `${initials}${randomNum}`;
            }
        });
    }

    // Inicializar modales de registro emergentes con animaciones fluidas
    initGenericModal('modal-create-company', 'btn-open-create-company-modal', 'btn-close-create-company-modal', 'form-create-company');
    initGenericModal('modal-create-sede', 'btn-open-create-sede-modal', 'btn-close-create-sede-modal', 'form-create-sede');
    initGenericModal('modal-create-trabajador', 'btn-open-create-trabajador-modal', 'btn-close-create-trabajador-modal', 'form-create-trabajador');
    initGenericModal('modal-create-movilidad', 'btn-open-create-movilidad-modal', 'btn-close-create-movilidad-modal', 'form-create-movilidad');
}

/**
 * Inicializa la lógica genérica de apertura, cierre y reset de modales premium.
 */
function initGenericModal(modalId, btnOpenId, btnCloseId, formId) {
    const modal = document.getElementById(modalId);
    const btnOpen = document.getElementById(btnOpenId);
    const btnClose = document.getElementById(btnCloseId);
    const form = document.getElementById(formId);

    if (btnOpen && modal) {
        btnOpen.addEventListener('click', () => {
            modal.classList.remove('hidden');
        });
    }

    if (btnClose && modal) {
        btnClose.addEventListener('click', () => {
            modal.classList.add('hidden');
            if (form) {
                form.reset();
                const inputs = form.querySelectorAll('input');
                inputs.forEach(input => {
                    delete input.dataset.dirty;
                });
                if (modalId === 'modal-create-company') {
                    const colorValueText = form.querySelector('.color-value-text');
                    if (colorValueText) colorValueText.textContent = '#6366F1';
                }
            }
        });
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
                if (form) {
                    form.reset();
                    const inputs = form.querySelectorAll('input');
                    inputs.forEach(input => {
                        delete input.dataset.dirty;
                    });
                    if (modalId === 'modal-create-company') {
                        const colorValueText = form.querySelector('.color-value-text');
                        if (colorValueText) colorValueText.textContent = '#6366F1';
                    }
                }
            }
        });
    }
}

/**
 * Inicializa el comportamiento colapsable del sidebar premium.
 * Gestiona expansión/contracción, persistencia en localStorage,
 * rotación del icono toggle, y vincula el botón de cerrar sesión del sidebar.
 */
function initSidebarBehavior() {
    const wrapper = document.getElementById('sidebar-container-wrapper');
    const menu = document.getElementById('sidebar-menu');
    const btnSidebarLogout = document.getElementById('btn-sidebar-logout');

    // Forzar estado expandido siempre en ambos elementos (wrapper y tarjeta de navegación)
    if (wrapper) wrapper.classList.add('expanded');
    if (menu) menu.classList.add('expanded');
    localStorage.setItem('bus-click-sidebar-state', 'expanded');

    if (!wrapper && !menu) return;

    // Vincular botón de cerrar sesión del sidebar
    if (btnSidebarLogout) {
        btnSidebarLogout.addEventListener('click', () => {
            const mainLogoutBtn = document.getElementById('btn-logout');
            if (mainLogoutBtn) {
                mainLogoutBtn.click();
            } else {
                // Fallback: limpiar sesión directamente
                localStorage.removeItem('busclick-session');
                window.location.reload();
            }
        });
    }

    // Navegación del sidebar: items con data-nav-target que NO son enlaces externos
    const navItems = (wrapper || menu).querySelectorAll('.nav-item[data-nav-target]');
    navItems.forEach(item => {
        const link = item.querySelector('.nav-link');
        // Si el link tiene href real (no "#"), permitimos la navegación normal
        if (link && link.getAttribute('href') && link.getAttribute('href') !== '#') {
            return; // No interceptar, dejar que haga navegación normal
        }
        
        item.addEventListener('click', (e) => {
            e.preventDefault();
            // Marcar activo
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            const targetId = item.getAttribute('data-nav-target');
            if (targetId) {
                // Ocultar todas las secciones del panel
                const sections = document.querySelectorAll('.panel-section');
                sections.forEach(sec => sec.classList.add('hidden'));

                // Mostrar la sección seleccionada
                const targetSec = document.getElementById(targetId);
                if (targetSec) {
                    targetSec.classList.remove('hidden');
                }

                // Cargar datos del apartado específico si estamos en Super Admin
                if (targetId === 'apartado-ecosistema') {
                    renderCompaniesList();
                } else if (targetId === 'apartado-planes') {
                    renderPlanesList();
                } else if (targetId === 'apartado-pagos') {
                    renderPaymentsList();
                }
            }
        });
    });
}

// ==========================================
// 10. GESTIÓN DE UI RESILIENTE (PARA PANELES SEPARADOS)
// ==========================================
function updateSuperStats() {
    const sComp = document.getElementById('stat-super-companies');
    const sSede = document.getElementById('stat-super-sedes');
    const sMovi = document.getElementById('stat-super-vehicles');
    const sTick = document.getElementById('stat-super-tickets');

    if (sComp) sComp.textContent = state.companies.length;
    if (sSede) sSede.textContent = state.sedes.length;
    if (sMovi) sMovi.textContent = state.movilidades.length;
    if (sTick) sTick.textContent = state.tickets.length;
}

// ==========================================
// 12. SISTEMA DE DROPDOWNS PERSONALIZADOS PREMIUM (CUSTOM SELECT)
// ==========================================
function syncCustomDropdowns() {
    // 1. Limpiar dropdowns anteriores para evitar duplicados en actualizaciones de UI
    document.querySelectorAll('.custom-dropdown-container').forEach(c => c.remove());
    document.querySelectorAll('select.select-native-hidden').forEach(s => s.classList.remove('select-native-hidden'));

    const selects = document.querySelectorAll('select');
    selects.forEach(select => {
        if (select.classList.contains('select-native-hidden')) return;

        // Crear el contenedor de dropdown premium
        const container = document.createElement('div');
        container.className = 'custom-dropdown-container';

        // Crear el botón disparador (trigger)
        const trigger = document.createElement('div');
        trigger.className = 'custom-dropdown-trigger';
        if (select.disabled) {
            trigger.classList.add('disabled');
            trigger.style.cursor = 'not-allowed';
            trigger.style.opacity = '0.7';
            trigger.style.color = '#64748b';
            trigger.style.background = '#f8fafc';
        }

        // Obtener opción seleccionada o la primera por defecto
        const selectedOption = select.options[select.selectedIndex] || select.options[0];
        const selectedText = selectedOption ? selectedOption.textContent : 'Seleccionar...';

        trigger.innerHTML = `
            <span class="trigger-text">${selectedText}</span>
            <i data-lucide="chevron-down" class="chevron"></i>
        `;

        // Crear el menú desplegable
        const menu = document.createElement('div');
        menu.className = 'custom-dropdown-menu hidden';

        // Función para reconstruir dinámicamente las opciones del select nativo
        function rebuildOptions() {
            menu.innerHTML = '';
            Array.from(select.options).forEach(opt => {
                const optEl = document.createElement('div');
                optEl.className = 'custom-dropdown-option';
                if (opt.value === select.value) {
                    optEl.classList.add('selected');
                }
                optEl.textContent = opt.textContent;
                optEl.setAttribute('data-value', opt.value);

                optEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (select.disabled) return;

                    // Cambiar valor en select nativo y disparar evento de cambio
                    select.value = opt.value;
                    select.dispatchEvent(new Event('change'));

                    // Cerrar y actualizar texto del trigger
                    trigger.querySelector('.trigger-text').textContent = opt.textContent;
                    menu.classList.add('hidden');
                    trigger.classList.remove('active');

                    menu.querySelectorAll('.custom-dropdown-option').forEach(o => o.classList.remove('selected'));
                    optEl.classList.add('selected');
                });

                menu.appendChild(optEl);
            });
        }

        rebuildOptions();

        // Manejar apertura/cierre al dar clic en el trigger
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (select.disabled) return;

            // Cerrar todos los demás menús dropdowns abiertos primero
            document.querySelectorAll('.custom-dropdown-menu').forEach(m => {
                if (m !== menu) {
                    m.classList.add('hidden');
                    m.previousElementSibling.classList.remove('active');
                }
            });

            // Reconstruir opciones frescas de la base de datos
            rebuildOptions();

            const isOpen = !menu.classList.contains('hidden');
            if (isOpen) {
                menu.classList.add('hidden');
                trigger.classList.remove('active');
            } else {
                menu.classList.remove('hidden');
                trigger.classList.add('active');
            }

            lucide.createIcons();
        });

        // Ocultar select nativo de forma segura y accesible
        select.classList.add('select-native-hidden');
        select.parentNode.insertBefore(container, select);
        container.appendChild(trigger);
        container.appendChild(menu);

        // Mantener sincronizado si el select cambia mediante código externo de JS
        select.addEventListener('change', () => {
            const currentOpt = select.options[select.selectedIndex];
            if (currentOpt) {
                trigger.querySelector('.trigger-text').textContent = currentOpt.textContent;
            }
            rebuildOptions();
        });
    });

    lucide.createIcons();
}

// Cerrar todos los dropdowns personalizados al hacer clic en cualquier parte fuera del desplegable
document.addEventListener('click', () => {
    document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.custom-dropdown-trigger').forEach(t => t.classList.remove('active'));
});

// ==========================================
// 13. REPORTE DE VENTAS DEL TURNO Y ARQUEO DE CAJA
// ==========================================
function updateSalesTurnReport() {
    const tbody = document.getElementById('table-sales-today-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    const activeCompany = state.companies.find(c => c.id === state.activeCompanyId);
    const companyMethods = (activeCompany && activeCompany.paymentMethods) ? activeCompany.paymentMethods : ['Efectivo', 'Yape/Plin'];

    // Inicializar balances acumulados para cada método de pago habilitado
    const paymentsAccumulator = {};
    companyMethods.forEach(method => {
        paymentsAccumulator[method] = 0;
    });

    const cashTotalSpan = document.getElementById('cash-payment-total');
    const digitalTotalSpan = document.getElementById('digital-payment-total');

    // Si no hay sede seleccionada, salir
    if (!state.activeSedeId) {
        if (cashTotalSpan) cashTotalSpan.textContent = 'S/. 0.00';
        if (digitalTotalSpan) digitalTotalSpan.textContent = 'S/. 0.00';
        
        const badgesContainer = document.getElementById('dynamic-payment-badges-container');
        if (badgesContainer) {
            badgesContainer.innerHTML = '<span class="text-xs text-subtle" style="color: #64748b;">Selecciona una sede para calcular los arqueos.</span>';
        }
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Selecciona una Sede en la cabecera para ver las ventas.</td></tr>';
        return;
    }

    // Filtrar los tickets de los vehículos de la sede seleccionada y de la empresa seleccionada
    const sedeVehicles = state.movilidades.filter(m => {
        const currentLocId = m.ubicacionActualSedeId || m.sedeId || m.ubicacion_actual_sede_id || m.sede_id;
        return currentLocId === state.activeSedeId && m.companyId === state.activeCompanyId;
    });
    const vehicleIds = sedeVehicles.map(v => v.id);

    const activeTickets = state.tickets.filter(t => t.sedeId === state.activeSedeId && vehicleIds.includes(t.movilidadId));

    if (activeTickets.length === 0) {
        if (cashTotalSpan) cashTotalSpan.textContent = 'S/. 0.00';
        if (digitalTotalSpan) digitalTotalSpan.textContent = 'S/. 0.00';
        
        const badgesContainer = document.getElementById('dynamic-payment-badges-container');
        if (badgesContainer) {
            badgesContainer.innerHTML = '';
            companyMethods.forEach(method => {
                const badgeSpan = document.createElement('span');
                let iconName = 'credit-card';
                let badgeClass = 'digital';
                if (method.toLowerCase().includes('efectivo')) {
                    iconName = 'banknote';
                    badgeClass = 'cash';
                } else if (method.toLowerCase().includes('yape') || method.toLowerCase().includes('plin')) {
                    iconName = 'smartphone';
                    badgeClass = 'digital';
                }
                badgeSpan.className = `payment-badge ${badgeClass}`;
                badgeSpan.innerHTML = `<i data-lucide="${iconName}"></i> ${method}: <strong>S/. 0.00</strong>`;
                badgesContainer.appendChild(badgeSpan);
            });
        }
        
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No hay ventas emitidas en este turno todavía.</td></tr>';
        lucide.createIcons();
        return;
    }

    // Ordenar tickets de forma cronológica invertida (las más recientes primero)
    const sortedTickets = [...activeTickets].reverse();

    sortedTickets.forEach(ticket => {
        const vehicle = state.movilidades.find(v => v.id === ticket.movilidadId);
        const vehiclePlate = vehicle ? vehicle.plate : '---';
        const price = parseFloat(ticket.price || 0);

        if (ticket.status === 'Ocupado') {
            const method = ticket.paymentMethod || 'Efectivo';
            if (paymentsAccumulator[method] === undefined) {
                paymentsAccumulator[method] = 0;
            }
            paymentsAccumulator[method] += price;
        }

        // Estilo de badge del ticket en la lista
        let paymentBadgeClass = 'badge-digital';
        if (ticket.paymentMethod && ticket.paymentMethod.toLowerCase().includes('efectivo')) {
            paymentBadgeClass = 'badge-cash';
        }

        const ticketCode = ticket.id.substring(0, 8).toUpperCase();

        const routeTo = vehicle ? vehicle.routeTo : (ticket.routeTo || ticket.route_to || 'Destino');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="font-bold text-indigo-400">#${ticketCode}</td>
            <td>
                <div class="font-bold">${ticket.passengerName}</div>
                <div class="text-xs text-subtle" style="font-size: 0.65rem; color: #64748b;">DNI: ${ticket.passengerDni}</div>
            </td>
            <td>
                <div class="font-bold">${routeTo}</div>
                <div class="text-xs text-subtle" style="font-size: 0.65rem; color: #64748b;">Placa: ${vehiclePlate}</div>
            </td>
            <td>
                <span class="seat-badge-mini">Asiento ${ticket.seatNum}</span>
            </td>
            <td>
                <span class="badge-payment-pill ${paymentBadgeClass}">${ticket.paymentMethod || 'Efectivo'}</span>
            </td>
            <td class="font-bold text-emerald-400" style="color: #10b981;">S/. ${price.toFixed(2)}</td>
            <td style="display: flex; gap: 0.4rem; align-items: center; justify-content: flex-start; height: 100%;">
                <button class="btn btn-secondary btn-print-sale-mini" data-ticket-id="${ticket.id}" style="padding: 4px 8px; font-size: 0.75rem; height: 30px; display: inline-flex; align-items: center; gap: 4px;">
                    <i data-lucide="ticket" style="width: 12px; height: 12px; stroke-width: 2.5;"></i> Boleto
                </button>
                <button class="btn btn-primary btn-manage-sale-mini" data-ticket-id="${ticket.id}" style="padding: 4px 8px; font-size: 0.75rem; height: 30px; background: var(--brand-gradient); display: inline-flex; align-items: center; gap: 4px;">
                    <i data-lucide="settings" style="width: 12px; height: 12px; stroke-width: 2.5;"></i> Gestionar
                </button>
            </td>
        `;

        tr.querySelector('.btn-print-sale-mini').addEventListener('click', () => {
            const ticketData = {
                ...ticket,
                date: ticket.date || new Date().toLocaleDateString('es-PE')
            };
            showTicket(ticket.id, ticketData);
        });

        tr.querySelector('.btn-manage-sale-mini').addEventListener('click', () => {
            openManageTicketModal(ticket);
        });

        tbody.appendChild(tr);
    });

    // Renderizar dinámicamente los badges de balances arriba en la UI
    const badgesContainer = document.getElementById('dynamic-payment-badges-container');
    if (badgesContainer) {
        badgesContainer.innerHTML = '';
        Object.keys(paymentsAccumulator).forEach(method => {
            const amount = paymentsAccumulator[method];
            let iconName = 'credit-card';
            let badgeClass = 'digital';
            if (method.toLowerCase().includes('efectivo')) {
                iconName = 'banknote';
                badgeClass = 'cash';
            } else if (method.toLowerCase().includes('yape') || method.toLowerCase().includes('plin')) {
                iconName = 'smartphone';
                badgeClass = 'digital';
            } else if (method.toLowerCase().includes('transferencia') || method.toLowerCase().includes('bcp') || method.toLowerCase().includes('banco') || method.toLowerCase().includes('interbank') || method.toLowerCase().includes('bbva')) {
                iconName = 'landmark';
                badgeClass = 'digital';
            }
            
            const badgeSpan = document.createElement('span');
            badgeSpan.className = `payment-badge ${badgeClass}`;
            badgeSpan.innerHTML = `<i data-lucide="${iconName}"></i> ${method}: <strong>S/. ${amount.toFixed(2)}</strong>`;
            badgesContainer.appendChild(badgeSpan);
        });
    }

    // Mantener soporte legado de fallback para ids antiguos por si acaso
    let cashSum = 0;
    let digiSum = 0;
    Object.keys(paymentsAccumulator).forEach(m => {
        if (m.toLowerCase().includes('efectivo')) {
            cashSum += paymentsAccumulator[m];
        } else {
            digiSum += paymentsAccumulator[m];
        }
    });
    if (cashTotalSpan) cashTotalSpan.textContent = `S/. ${cashSum.toFixed(2)}`;
    if (digitalTotalSpan) digitalTotalSpan.textContent = `S/. ${digiSum.toFixed(2)}`;

    lucide.createIcons();
}

// ==========================================
// 12. SISTEMA DE AUTENTICACIÓN MULTI-NIVEL PREMIUM
// ==========================================

function checkAuthentication() {
    const role = state.currentRole;
    if (role === 'super-admin') {
        const loggedIn = localStorage.getItem('superadmin_logged_in') === 'true';
        const overlay = document.getElementById('superadmin-login-overlay');
        if (loggedIn) {
            if (overlay) overlay.classList.add('hidden');
            return true;
        } else {
            if (overlay) overlay.classList.remove('hidden');
            initGoogleSignIn();
            return false;
        }
    } else if (role === 'admin-empresa') {
        const activeCompanyId = localStorage.getItem('admin_company_id');
        const overlay = document.getElementById('admin-login-overlay');
        if (activeCompanyId) {
            if (overlay) overlay.classList.add('hidden');
            state.activeCompanyId = activeCompanyId;
            lockCompanySelector(activeCompanyId);
            return true;
        } else {
            if (overlay) overlay.classList.remove('hidden');
            setupAdminLoginListener();
            return false;
        }
    } else if (role === 'establecimiento') {
        const activeCompanyId = localStorage.getItem('sede_company_id');
        const activeSedeId = localStorage.getItem('sede_id');
        const overlay = document.getElementById('sede-login-overlay');
        if (activeCompanyId && activeSedeId) {
            if (overlay) overlay.classList.add('hidden');
            state.activeCompanyId = activeCompanyId;
            state.activeSedeId = activeSedeId;
            lockSedeSelector(activeCompanyId, activeSedeId);
            return true;
        } else {
            if (overlay) overlay.classList.remove('hidden');
            setupSedeLoginListener();
            return false;
        }
    }
    return true;
}

function initGoogleSignIn() {
    // 1. Botón Éxito: syscomecosistemadigital@gmail.com
    const btnSuccess = document.getElementById('btn-google-account-success');
    if (btnSuccess) {
        btnSuccess.addEventListener('click', async () => {
            await simulateGoogleAuth('syscomecosistemadigital@gmail.com', 'Syscom Ecosistema Digital');
        });
    }
    
    // 2. Botón Denegado: otro_usuario@gmail.com
    const btnDenied = document.getElementById('btn-google-account-denied');
    if (btnDenied) {
        btnDenied.addEventListener('click', () => {
            showGoogleBlockedScreen('otro_usuario@gmail.com');
        });
    }
    
    // 3. Botón Mostrar input personalizado
    const btnCustomTrigger = document.getElementById('btn-google-account-custom-trigger');
    const customContainer = document.getElementById('google-custom-email-container');
    if (btnCustomTrigger && customContainer) {
        btnCustomTrigger.addEventListener('click', () => {
            customContainer.classList.remove('hidden');
            btnCustomTrigger.classList.add('hidden');
        });
    }
    
    // 4. Submit de email personalizado
    const btnCustomSubmit = document.getElementById('btn-google-custom-email-submit');
    const inputCustomEmail = document.getElementById('google-custom-email-input');
    if (btnCustomSubmit && inputCustomEmail) {
        const submitFn = async () => {
            const email = inputCustomEmail.value.trim().toLowerCase();
            if (!email || !email.includes('@')) {
                showToast("Por favor, ingresa un correo válido.", "error");
                return;
            }
            if (email === 'syscomecosistemadigital@gmail.com') {
                await simulateGoogleAuth(email, 'Syscom Ecosistema Digital');
            } else {
                showGoogleBlockedScreen(email);
            }
        };
        btnCustomSubmit.addEventListener('click', submitFn);
        inputCustomEmail.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitFn();
            }
        });
    }
    
    // 5. Botón Volver de pantalla bloqueada
    const btnBack = document.getElementById('btn-back-from-blocked');
    if (btnBack) {
        btnBack.addEventListener('click', () => {
            const blockedCard = document.getElementById('superadmin-google-blocked-card');
            const mainCard = document.getElementById('superadmin-google-card');
            if (blockedCard && mainCard) {
                blockedCard.classList.add('hidden');
                mainCard.classList.remove('hidden');
            }
        });
    }
}

async function simulateGoogleAuth(email, name) {
    try {
        const res = await fetch('/api/login/superadmin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        
        const data = await res.json();
        
        if (res.ok && data.success) {
            showToast(`¡Bienvenido de vuelta, ${name}!`, "success");
            localStorage.setItem('superadmin_logged_in', 'true');
            localStorage.setItem('superadmin_email', email);
            localStorage.setItem('superadmin_name', name);
            
            const overlay = document.getElementById('superadmin-login-overlay');
            if (overlay) overlay.classList.add('hidden');
            
            // Cargar datos
            await reloadAllApiData();
            // Polling
            setInterval(syncTicketsOnly, 3000);
        } else {
            showGoogleBlockedScreen(email);
        }
    } catch (err) {
        console.error(err);
        showToast("Error al conectarse con el servidor de autenticación.", "error");
    }
}

function showGoogleBlockedScreen(email) {
    const mainCard = document.getElementById('superadmin-google-card');
    const blockedCard = document.getElementById('superadmin-google-blocked-card');
    const emailDisplay = document.getElementById('google-blocked-email-display');
    
    if (mainCard && blockedCard && emailDisplay) {
        emailDisplay.textContent = email;
        mainCard.classList.add('hidden');
        blockedCard.classList.remove('hidden');
        showToast("Acceso denegado. Google OAuth bloqueado.", "error");
    }
}

let adminLoginListenerAdded = false;
function setupAdminLoginListener() {
    if (adminLoginListenerAdded) return;
    const form = document.getElementById('form-login-admin');
    if (!form) return;
    adminLoginListenerAdded = true;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-admin-user').value.trim();
        const password = document.getElementById('login-admin-pass').value.trim();
        
        if (!username || !password) {
            showToast("Por favor, ingresa tu usuario y contraseña.", "error");
            return;
        }
        
        try {
            const res = await fetch('/api/login/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await res.json();
            
            if (res.ok && data.success) {
                showToast(`¡Bienvenido! Administrador de ${data.company.name}`, "success");
                localStorage.setItem('admin_company_id', data.company.id);
                localStorage.setItem('admin_company_name', data.company.name);
                
                state.activeCompanyId = data.company.id;
                
                const overlay = document.getElementById('admin-login-overlay');
                if (overlay) overlay.classList.add('hidden');
                
                lockCompanySelector(data.company.id);
                
                await reloadAllApiData();
                setInterval(syncTicketsOnly, 3000);
            } else {
                showToast(data.error || "Usuario o contraseña incorrectos.", "error");
            }
        } catch (err) {
            console.error(err);
            showToast("Error al conectarse con el servidor de autenticación.", "error");
        }
    });
}

function lockCompanySelector(companyId) {
    const select = document.getElementById('header-company-select');
    if (select) {
        select.value = companyId;
        select.disabled = true;
        
        // Aislamiento extra: deshabilitar el custom dropdown
        setTimeout(() => {
            const trigger = select.closest('.custom-dropdown-container')?.querySelector('.custom-dropdown-trigger');
            if (trigger) {
                trigger.style.pointerEvents = 'none';
                trigger.style.background = 'var(--bg-subtle)';
                trigger.style.opacity = '0.7';
            }
        }, 500);
    }
}

let sedeLoginListenerAdded = false;
function setupSedeLoginListener() {
    if (sedeLoginListenerAdded) return;
    const form = document.getElementById('form-login-sede');
    if (!form) return;
    sedeLoginListenerAdded = true;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-sede-user').value.trim();
        const password = document.getElementById('login-sede-pass').value.trim();
        
        if (!username || !password) {
            showToast("Por favor, ingresa tu usuario y contraseña.", "error");
            return;
        }
        
        try {
            const res = await fetch('/api/login/sede', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await res.json();
            
            if (res.ok && data.success) {
                showToast(`¡Bienvenido! Sede: ${data.sede.name}`, "success");
                localStorage.setItem('sede_id', data.sede.id);
                localStorage.setItem('sede_name', data.sede.name);
                localStorage.setItem('sede_company_id', data.sede.companyId);
                
                state.activeCompanyId = data.sede.companyId;
                state.activeSedeId = data.sede.id;
                
                const overlay = document.getElementById('sede-login-overlay');
                if (overlay) overlay.classList.add('hidden');
                
                lockSedeSelector(data.sede.companyId, data.sede.id);
                
                await reloadAllApiData();
                setInterval(syncTicketsOnly, 3000);
            } else {
                showToast(data.error || "Usuario o contraseña de sede incorrectos.", "error");
            }
        } catch (err) {
            console.error(err);
            showToast("Error al conectarse con el servidor de autenticación.", "error");
        }
    });
}

function lockSedeSelector(companyId, sedeId) {
    const companySelect = document.getElementById('header-company-select');
    if (companySelect) {
        companySelect.value = companyId;
        companySelect.disabled = true;
    }
    
    const sedeSelect = document.getElementById('header-sede-select');
    if (sedeSelect) {
        sedeSelect.value = sedeId;
        sedeSelect.disabled = true;
    }
    
    // Deshabilitar triggers de custom select
    setTimeout(() => {
        const triggers = document.querySelectorAll('.custom-dropdown-container .custom-dropdown-trigger');
        triggers.forEach(trigger => {
            trigger.style.pointerEvents = 'none';
            trigger.style.background = 'var(--bg-subtle)';
            trigger.style.opacity = '0.7';
        });
    }, 500);
}

// ==========================================
// 13. CONFIGURACIÓN DE MÉTODOS DE PAGO EN EL ADMINISTRADOR
// ==========================================
let adminSettingsPaymentMethods = [];

function initAdminSettingsTab() {
    const activeCompanyObj = state.companies.find(c => c.id === state.activeCompanyId);
    if (!activeCompanyObj) return;
    
    // Set Razón Social / RUC
    const companyNameInput = document.getElementById('admin-settings-company-name');
    if (companyNameInput) {
        companyNameInput.value = `${activeCompanyObj.name} (RUC: ${activeCompanyObj.ruc})`;
    }
    
    // Cargar datos del canal de soporte corporativo
    const phoneInput = document.getElementById('admin-support-phone');
    const emailInput = document.getElementById('admin-support-email');
    const msgInput = document.getElementById('admin-support-message');
    
    if (phoneInput) phoneInput.value = activeCompanyObj.supportPhone || '+51 987 654 321';
    if (emailInput) emailInput.value = activeCompanyObj.supportEmail || 'soporte@empresa.com';
    if (msgInput) msgInput.value = activeCompanyObj.supportMessage || 'Contáctanos por nuestros canales de soporte oficiales 24/7 para cambios, reprogramaciones o anulaciones de tu viaje.';
    
    // Cargar métodos actuales
    adminSettingsPaymentMethods = [...(activeCompanyObj.paymentMethods || ['Efectivo', 'Yape/Plin'])];
    
    // Renderizar la lista
    renderAdminPaymentMethodsList();
    
    // Configurar listeners de eventos
    setupAdminSettingsEvents();
}

function renderAdminPaymentMethodsList() {
    const container = document.getElementById('admin-payment-methods-list-render');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (adminSettingsPaymentMethods.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4" style="color: #94a3b8; font-size: var(--text-xs); font-weight: 500;">
                No hay métodos de pago habilitados. Agrega al menos uno.
            </div>
        `;
        return;
    }
    
    adminSettingsPaymentMethods.forEach((method, index) => {
        const item = document.createElement('div');
        item.className = 'payment-method-admin-item';
        item.innerHTML = `
            <div class="payment-method-admin-item-left">
                <i data-lucide="credit-card"></i>
                <span>${method}</span>
            </div>
            <button type="button" class="btn-remove-payment-method" data-index="${index}">
                <i data-lucide="trash-2"></i>
            </button>
        `;
        
        // Evento para eliminar
        item.querySelector('.btn-remove-payment-method').addEventListener('click', () => {
            adminSettingsPaymentMethods.splice(index, 1);
            renderAdminPaymentMethodsList();
            showToast(`Método "${method}" quitado temporalmente.`, "info");
        });
        
        container.appendChild(item);
    });
    
    lucide.createIcons();
}

let adminSettingsEventsAdded = false;
function setupAdminSettingsEvents() {
    if (adminSettingsEventsAdded) return;
    adminSettingsEventsAdded = true;
    
    const btnAdd = document.getElementById('btn-add-payment-method');
    const inputMethod = document.getElementById('input-new-payment-method');
    const btnSave = document.getElementById('btn-save-payment-methods');
    
    if (btnAdd && inputMethod) {
        const addFn = () => {
            const val = inputMethod.value.trim();
            if (!val) {
                showToast("Por favor, escribe un método de pago válido.", "error");
                return;
            }
            if (adminSettingsPaymentMethods.includes(val)) {
                showToast("Este método de pago ya está en la lista.", "error");
                return;
            }
            adminSettingsPaymentMethods.push(val);
            inputMethod.value = '';
            renderAdminPaymentMethodsList();
            showToast(`Método "${val}" agregado a la lista.`, "success");
        };
        
        btnAdd.addEventListener('click', addFn);
        inputMethod.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addFn();
            }
        });
    }
    
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            if (adminSettingsPaymentMethods.length === 0) {
                showToast("Debes habilitar al menos un método de pago.", "error");
                return;
            }
            
            btnSave.disabled = true;
            const originalText = btnSave.innerHTML;
            btnSave.innerHTML = `<i class="animate-spin" data-lucide="loader-2"></i> Guardando...`;
            lucide.createIcons();
            
            try {
                const res = await fetch(`/api/companies/${state.activeCompanyId}/payment-methods`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paymentMethods: adminSettingsPaymentMethods })
                });
                
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast("Métodos de pago actualizados con éxito en el servidor.", "success");
                    await reloadAllApiData();
                } else {
                    showToast("Error al guardar los métodos de pago.", "error");
                }
            } catch (err) {
                console.error(err);
                showToast("Error al conectarse con el servidor.", "error");
            } finally {
                btnSave.disabled = false;
                btnSave.innerHTML = originalText;
                lucide.createIcons();
            }
        });
    }
    
    // Configuración del Formulario de Soporte Marca Blanca
    const formSupport = document.getElementById('form-admin-support-settings');
    if (formSupport) {
        formSupport.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const phoneVal = document.getElementById('admin-support-phone').value.trim();
            const emailVal = document.getElementById('admin-support-email').value.trim();
            const msgVal = document.getElementById('admin-support-message').value.trim();
            
            const btnSupportSave = document.getElementById('btn-save-support-settings');
            if (btnSupportSave) btnSupportSave.disabled = true;
            
            try {
                const res = await fetch(`/api/companies/${state.activeCompanyId}/support`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        supportPhone: phoneVal,
                        supportEmail: emailVal,
                        supportMessage: msgVal
                    })
                });
                
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast("Configuración del Canal de Soporte guardada con éxito.", "success");
                    await reloadAllApiData();
                } else {
                    showToast("Error al guardar los ajustes de soporte corporativo.", "error");
                }
            } catch (err) {
                console.error("Error al guardar soporte:", err);
                showToast("Fallo al conectar con el servidor de base de datos.", "error");
            } finally {
                if (btnSupportSave) btnSupportSave.disabled = false;
            }
        });
    }
}

// --- FUNCIONES AUXILIARES DE GENERACIÓN DINÁMICA ---
function slugify(text) {
    if (!text) return '';
    return text.toString().toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 15);
}

function generateCompanyCredentialsSuggestions(name) {
    const compUser = document.getElementById('company-username');
    const compPass = document.getElementById('company-password');
    if (!compUser || !compPass) return;
    
    const val = name.trim();
    if (!val) {
        if (!compUser.dataset.dirty) compUser.value = '';
        if (!compPass.dataset.dirty) compPass.value = '';
        return;
    }
    
    const cleanSlug = slugify(val);
    const initials = val.split(' ').map(w => w[0]).join('').toLowerCase().replace(/[^a-z]/g, '');
    const randomNum = Math.floor(100 + Math.random() * 900);
    
    if (!compUser.dataset.dirty) {
        compUser.value = cleanSlug;
    }
    if (!compPass.dataset.dirty) {
        compPass.value = `${initials}${randomNum}`;
    }
}

// --- FUNCIONALIDAD GLOBAL DE COPIAR CREDENCIALES AL PORTAPAPELES ---
async function copyTextToClipboard(text, element) {
    if (!text) return;
    
    try {
        await navigator.clipboard.writeText(text);
        
        // Efecto visual en el badge
        element.classList.add('success-copy');
        
        // Cambiar temporalmente el icono de copiar
        const copyIcon = element.querySelector('.btn-copy-cred i');
        let originalIcon = 'copy';
        if (copyIcon) {
            originalIcon = copyIcon.getAttribute('data-lucide') || 'copy';
            copyIcon.setAttribute('data-lucide', 'check');
            lucide.createIcons();
        }
        
        showToast("¡Copiado con éxito!", "success");
        
        setTimeout(() => {
            element.classList.remove('success-copy');
            if (copyIcon) {
                copyIcon.setAttribute('data-lucide', originalIcon);
                lucide.createIcons();
            }
        }, 1500);
    } catch (err) {
        console.error("No se pudo copiar al portapapeles:", err);
        showToast("Error al copiar. Selecciona el texto manualmente.", "error");
    }
}

// --- GENERACIÓN Y GUARDADO DE CREDENCIALES COMPLEMENTARIAS ---
async function generateAndSaveCompanyCredentials(id, name, button) {
    button.disabled = true;
    button.innerHTML = '<i class="animate-spin" data-lucide="loader-2"></i> Generando...';
    lucide.createIcons();
    
    const cleanSlug = slugify(name) || 'empresa';
    const randomNum = Math.floor(100 + Math.random() * 900);
    const username = cleanSlug;
    const password = `${cleanSlug.slice(0, 3)}${randomNum}`;
    
    try {
        const res = await fetch(`/api/companies/${id}/credentials`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        }).then(r => r.json());
        
        if (res.success) {
            showToast("Credenciales creadas y guardadas.", "success");
            await reloadAllApiData();
        } else {
            showToast("No se pudieron guardar las credenciales: " + res.error, "error");
        }
    } catch (err) {
        console.error(err);
        showToast("Error de conexión al guardar credenciales.", "error");
    } finally {
        button.disabled = false;
        button.innerHTML = '<i data-lucide="key" style="width: 10px; height: 10px;"></i> Generar Credenciales';
        lucide.createIcons();
    }
}

async function generateAndSaveSedeCredentials(id, name, button) {
    button.disabled = true;
    button.innerHTML = '<i class="animate-spin" data-lucide="loader-2"></i> Generando...';
    lucide.createIcons();
    
    const cleanSlug = 'sede_' + (slugify(name) || 'sede');
    const randomNum = Math.floor(100 + Math.random() * 900);
    const username = cleanSlug;
    const password = `${cleanSlug.slice(5, 8)}${randomNum}`; // Usar parte del slug
    
    try {
        const res = await fetch(`/api/sedes/${id}/credentials`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        }).then(r => r.json());
        
        if (res.success) {
            showToast("Credenciales de sede creadas y guardadas.", "success");
            await reloadAllApiData();
        } else {
            showToast("No se pudieron guardar las credenciales de sede: " + res.error, "error");
        }
    } catch (err) {
        console.error(err);
        showToast("Error de conexión al guardar credenciales.", "error");
    } finally {
        button.disabled = false;
        button.innerHTML = '<i data-lucide="key" style="width: 10px; height: 10px;"></i> Generar Credenciales';
        lucide.createIcons();
    }
}

// --- GESTIÓN SAAS DE PLANES, SERVICIOS Y PAGOS DESDE SUPER ADMIN ---

function calcularMontoMensual(planName, servicesStr) {
    let total = 0;
    // 1. Obtener costo del Plan base dinámico
    const foundPlan = state.saasPlans && state.saasPlans.find(p => p.name === planName);
    if (foundPlan) {
        total = parseFloat(foundPlan.price);
    } else {
        // Fallback histórico estable
        if (planName === 'Plan Básico') total = 100;
        else if (planName === 'Plan Profesional') total = 250;
        else if (planName === 'Plan Enterprise') total = 500;
        else total = 250; // default
    }

    // 2. Obtener costo de Servicios adicionales dinámicos (extrayendo el precio de la descripción)
    const services = servicesStr ? servicesStr.split(',') : [];
    services.forEach(srv => {
        const cleanSrv = srv.trim();
        let servicePrice = 0;
        const foundService = state.saasServices && state.saasServices.find(s => s.name === cleanSrv);
        if (foundService && foundService.description) {
            // Intentar extraer patrón numérico como "+S/ 50" o "S/ 50" o "costo de S/50.00"
            const match = foundService.description.match(/(?:\+\s*S\/\.?|S\/\.?\s*\+?)\s*(\d+(?:\.\d+)?)/i);
            if (match) {
                servicePrice = parseFloat(match[1]);
            } else {
                // Segundo intento para cualquier número precedido por S/
                const match2 = foundService.description.match(/(\d+(?:\.\d+)?)/);
                if (match2 && foundService.description.toLowerCase().includes('s/')) {
                    servicePrice = parseFloat(match2[1]);
                }
            }
        }
        
        // Fallback histórico para compatibilidad nativa
        if (servicePrice === 0) {
            if (cleanSrv === 'Encomiendas') servicePrice = 50;
            else if (cleanSrv === 'GPS Satelital') servicePrice = 80;
            else if (cleanSrv === 'Pasarela Online') servicePrice = 30;
        }
        
        total += servicePrice;
    });

    return total;
}

function renderPlanesList() {
    const tbody = document.getElementById('table-planes-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (state.companies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No hay empresas integradas en el ecosistema.</td></tr>';
        return;
    }

    state.companies.forEach(company => {
        const plan = company.planName || 'Plan Profesional';
        const srvs = company.services || 'Boletería,Flota';
        const totalCost = calcularMontoMensual(plan, srvs);

        // Dar formato visual a los servicios/módulos
        const srvArray = srvs.split(',');
        const srvBadges = srvArray.map(s => {
            const clean = s.trim();
            if (clean === 'Boletería' || clean === 'Flota') {
                return `<span class="badge-version" style="background: rgba(99, 102, 241, 0.08); color: #6366f1; border-color: rgba(99, 102, 241, 0.2); font-size: 0.65rem;">${clean}</span>`;
            } else {
                return `<span class="badge-version" style="background: rgba(16, 185, 129, 0.08); color: #10b981; border-color: rgba(16, 185, 129, 0.2); font-size: 0.65rem;">${clean}</span>`;
            }
        }).join(' ');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="font-bold">${company.name}</td>
            <td>
                <span class="badge-version" style="background: var(--brand-sidebar-pale); color: var(--brand-sidebar-color); font-weight: 800; border-radius: 8px;">
                    ${plan}
                </span>
            </td>
            <td>${srvBadges}</td>
            <td class="font-bold font-mono text-indigo-600">S/ ${totalCost.toFixed(2)}</td>
            <td class="action-buttons-cell">
                <button type="button" class="btn btn-secondary btn-sparkle" style="padding: 4px 10px; font-size: 0.7rem; gap: 0.25rem;" onclick="openEditServicesModal('${company.id}', '${company.name.replace(/'/g, "\\'")}', '${plan}', '${srvs.replace(/'/g, "\\'")}')">
                    <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i> Configurar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    lucide.createIcons();
}

window.openEditServicesModal = function(id, name, plan, services) {
    const modal = document.getElementById('modal-edit-services');
    if (!modal) return;

    document.getElementById('edit-services-company-id').value = id;
    document.getElementById('edit-services-company-name').value = name;
    document.getElementById('edit-services-plan').value = plan;

    // Resetear checkboxes
    const checkboxes = modal.querySelectorAll('.service-checkbox');
    const activeServices = services.split(',').map(s => s.trim());

    checkboxes.forEach(chk => {
        // Boletería siempre queda checked
        if (chk.value === 'Boletería') {
            chk.checked = true;
        } else {
            chk.checked = activeServices.includes(chk.value);
        }
    });

    modal.classList.remove('hidden');
};
function renderCatalogoPlanes() {
    const tbody = document.getElementById('table-catalogo-planes-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!state.saasPlans || state.saasPlans.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center" style="color: #94a3b8; padding: 1rem;">No hay planes registrados en el catálogo.</td></tr>';
        return;
    }

    state.saasPlans.forEach(plan => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="font-bold">${plan.name}</td>
            <td class="font-bold font-mono text-indigo-600">S/ ${parseFloat(plan.price).toFixed(2)}</td>
            <td class="action-buttons-cell" style="justify-content: center; gap: 0.25rem;">
                <button type="button" class="btn btn-secondary btn-sparkle" style="padding: 3px 6px; font-size: 0.65rem;" onclick="openEditPlanModal('${plan.id}', '${plan.name.replace(/'/g, "\\'")}', ${plan.price})">
                    <i data-lucide="edit" style="width: 10px; height: 10px;"></i>
                </button>
                <button type="button" class="btn btn-primary" style="padding: 3px 6px; font-size: 0.65rem; background: #ef4444; border-color: #ef4444;" onclick="deletePlanSaas('${plan.id}', '${plan.name.replace(/'/g, "\\'")}')">
                    <i data-lucide="trash-2" style="width: 10px; height: 10px;"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    lucide.createIcons();
}

function renderCatalogoServicios() {
    const tbody = document.getElementById('table-catalogo-servicios-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!state.saasServices || state.saasServices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center" style="color: #94a3b8; padding: 1rem;">No hay servicios registrados en el catálogo.</td></tr>';
        return;
    }

    state.saasServices.forEach(srv => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="font-bold">${srv.name}</td>
            <td style="color: #64748b; font-size: var(--text-xxs); line-height: 1.2;">${srv.description || '-'}</td>
            <td class="action-buttons-cell" style="justify-content: center; gap: 0.25rem;">
                <button type="button" class="btn btn-secondary btn-sparkle" style="padding: 3px 6px; font-size: 0.65rem;" onclick="openEditServiceModal('${srv.id}', '${srv.name.replace(/'/g, "\\'")}', '${(srv.description || '').replace(/'/g, "\\'")}')">
                    <i data-lucide="edit" style="width: 10px; height: 10px;"></i>
                </button>
                <button type="button" class="btn btn-primary" style="padding: 3px 6px; font-size: 0.65rem; background: #ef4444; border-color: #ef4444;" onclick="deleteServiceSaas('${srv.id}', '${srv.name.replace(/'/g, "\\'")}')">
                    <i data-lucide="trash-2" style="width: 10px; height: 10px;"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    lucide.createIcons();
}

window.openEditPlanModal = function(id, name, price) {
    const modal = document.getElementById('modal-create-plan');
    if (!modal) return;
    document.getElementById('plan-id-hidden').value = id;
    document.getElementById('plan-name').value = name;
    document.getElementById('plan-price').value = price;
    document.getElementById('modal-plan-title').innerHTML = `<i data-lucide="edit"></i> Editar Plan SaaS`;
    modal.classList.remove('hidden');
    lucide.createIcons();
};

window.openEditServiceModal = function(id, name, description) {
    const modal = document.getElementById('modal-create-service');
    if (!modal) return;
    document.getElementById('service-id-hidden').value = id;
    document.getElementById('service-name').value = name;
    document.getElementById('service-description').value = description;
    document.getElementById('modal-service-title').innerHTML = `<i data-lucide="edit"></i> Editar Módulo / Servicio`;
    modal.classList.remove('hidden');
    lucide.createIcons();
};

window.deletePlanSaas = function(id, name) {
    showConfirmModal({
        title: "Eliminar Plan SaaS",
        message: `¿Está seguro de que desea eliminar permanentemente el plan "${name}" del catálogo?\n\nLas empresas activas que tengan asignado este plan lo conservarán, pero no se podrá asignar a nuevas empresas.`,
        icon: "trash-2",
        confirmColor: "#ef4444",
        onConfirm: async () => {
            try {
                const res = await fetch(`/api/saas/plans/${id}`, { method: 'DELETE' }).then(r => r.json());
                if (res.success) {
                    showToast(`Plan "${name}" eliminado correctamente.`, "success");
                    await reloadAllApiData();
                } else {
                    showToast("Error al eliminar plan: " + res.error, "error");
                }
            } catch (err) {
                console.error(err);
                showToast("Error al conectar con el servidor.", "error");
            }
        }
    });
};

window.deleteServiceSaas = function(id, name) {
    if (name === 'Boletería') {
        showToast("No se puede eliminar el servicio núcleo 'Boletería'.", "error");
        return;
    }
    showConfirmModal({
        title: "Eliminar Módulo / Servicio",
        message: `¿Está seguro de que desea eliminar permanentemente el servicio "${name}" del catálogo?\n\nLas empresas activas que tengan habilitado este servicio lo conservarán, pero no se podrá activar para nuevas empresas.`,
        icon: "trash-2",
        confirmColor: "#ef4444",
        onConfirm: async () => {
            try {
                const res = await fetch(`/api/saas/services/${id}`, { method: 'DELETE' }).then(r => r.json());
                if (res.success) {
                    showToast(`Servicio "${name}" eliminado correctamente.`, "success");
                    await reloadAllApiData();
                } else {
                    showToast("Error al eliminar servicio: " + res.error, "error");
                }
            } catch (err) {
                console.error(err);
                showToast("Error al conectar con el servidor.", "error");
            }
        }
    });
};

function populatePlanSelectors() {
    const selectCompanyPlan = document.getElementById('company-plan');
    const selectEditServicesPlan = document.getElementById('edit-services-plan');
    
    const selectedCompanyPlanVal = selectCompanyPlan ? selectCompanyPlan.value : '';
    const selectedEditServicesPlanVal = selectEditServicesPlan ? selectEditServicesPlan.value : '';

    if (selectCompanyPlan) {
        selectCompanyPlan.innerHTML = '';
        state.saasPlans.forEach(plan => {
            const opt = document.createElement('option');
            opt.value = plan.name;
            opt.textContent = `${plan.name} (S/ ${parseFloat(plan.price).toFixed(2)}/mes)`;
            selectCompanyPlan.appendChild(opt);
        });
        if (selectedCompanyPlanVal) {
            selectCompanyPlan.value = selectedCompanyPlanVal;
        } else if (state.saasPlans.length > 1) {
            const proPlan = state.saasPlans.find(p => p.name.includes('Profesional'));
            if (proPlan) selectCompanyPlan.value = proPlan.name;
        }
    }

    if (selectEditServicesPlan) {
        selectEditServicesPlan.innerHTML = '';
        state.saasPlans.forEach(plan => {
            const opt = document.createElement('option');
            opt.value = plan.name;
            opt.textContent = `${plan.name} (S/ ${parseFloat(plan.price).toFixed(2)}/mes)`;
            selectEditServicesPlan.appendChild(opt);
        });
        if (selectedEditServicesPlanVal) {
            selectEditServicesPlan.value = selectedEditServicesPlanVal;
        }
    }
}

function populateServiceCheckboxes() {
    const container = document.getElementById('edit-services-checkboxes-container');
    if (!container) return;
    container.innerHTML = '';

    if (!state.saasServices || state.saasServices.length === 0) {
        container.innerHTML = '<p style="font-size: var(--text-xs); color: #94a3b8;">No hay servicios definidos en el catálogo.</p>';
        return;
    }

    state.saasServices.forEach(srv => {
        const isCore = srv.name === 'Boletería';
        const checkedAttr = isCore ? 'checked disabled' : '';
        const coreTag = isCore ? ' (Módulo Núcleo - Incluido)' : '';
        
        container.innerHTML += `
            <label style="display: flex; align-items: center; gap: 0.5rem; font-size: var(--text-xs); font-weight: 600; cursor: pointer; color: #334155;">
                <input type="checkbox" class="service-checkbox" value="${srv.name}" ${checkedAttr} style="width: 16px; height: 16px; accent-color: var(--brand-primary);"> 
                ${srv.name}${coreTag} ${srv.description ? `<span style="font-weight: normal; color: #64748b; font-size: var(--text-xxs); margin-left: 4px;">(${srv.description})</span>` : ''}
            </label>
        `;
    });
}
async function renderPaymentsList() {
    const tbody = document.getElementById('table-payments-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    try {
        const payments = await fetch('/api/payments').then(r => r.json());
        
        // TABLA DE SUSCRIPCIONES ACTIVAS Y VENCIMIENTO DE SERVICIOS
        const tbodyVencimientos = document.getElementById('table-vencimientos-body');
        if (tbodyVencimientos) {
            tbodyVencimientos.innerHTML = '';
            if (state.companies && state.companies.length > 0) {
                state.companies.forEach(comp => {
                    const compPayments = payments.filter(p => p.companyId === comp.id);
                    let nextDueDate = '';
                    let latestPaymentStatus = 'Pendiente';
                    if (compPayments.length > 0) {
                        compPayments.sort((a, b) => b.dueDate.localeCompare(a.dueDate));
                        nextDueDate = compPayments[0].dueDate;
                        latestPaymentStatus = compPayments[0].status;
                    } else {
                        // Calcular fecha en base a createdAt
                        const baseDate = comp.createdAt ? new Date(comp.createdAt) : new Date("2026-05-26");
                        let monthsToAdd = 1;
                        if (comp.billingCycle === 'Trimestral') monthsToAdd = 3;
                        else if (comp.billingCycle === 'Semestral') monthsToAdd = 6;
                        else if (comp.billingCycle === 'Anual') monthsToAdd = 12;
                        baseDate.setMonth(baseDate.getMonth() + monthsToAdd);
                        nextDueDate = baseDate.toISOString().split('T')[0];
                    }

                    let statusBadge = '';
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    const dueDate = new Date(nextDueDate);
                    dueDate.setHours(0,0,0,0);
                    
                    const diffTime = dueDate.getTime() - today.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    if (diffDays < 0) {
                        // Ya venció
                        if (latestPaymentStatus === 'Pagado') {
                            statusBadge = `<span class="badge-version" style="background: rgba(16, 185, 129, 0.1); color: #10b981; border-color: rgba(16, 185, 129, 0.3); font-weight: 700; border-radius: 8px;">Activo</span>`;
                        } else {
                            statusBadge = `<span class="badge-version" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.3); font-weight: 700; border-radius: 8px;">Vencido (Mora)</span>`;
                        }
                    } else {
                        // Aún no vence
                        if (latestPaymentStatus === 'Pagado') {
                            statusBadge = `<span class="badge-version" style="background: rgba(16, 185, 129, 0.1); color: #10b981; border-color: rgba(16, 185, 129, 0.3); font-weight: 700; border-radius: 8px;">Activo</span>`;
                        } else {
                            // Si falta 4 días o menos, se marca como "Por Vencer"
                            if (diffDays <= 4) {
                                statusBadge = `<span class="badge-version" style="background: rgba(245, 158, 11, 0.1); color: #f59e0b; border-color: rgba(245, 158, 11, 0.3); font-weight: 700; border-radius: 8px;">Por Vencer</span>`;
                            } else {
                                statusBadge = `<span class="badge-version" style="background: rgba(16, 185, 129, 0.1); color: #10b981; border-color: rgba(16, 185, 129, 0.3); font-weight: 700; border-radius: 8px;">Activo</span>`;
                            }
                        }
                    }

                    const regDate = comp.createdAt ? comp.createdAt.split('T')[0] : '2026-05-26';

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="font-bold">${comp.name}</td>
                        <td class="font-semibold">${comp.planName || 'Plan Profesional'}</td>
                        <td class="font-medium text-indigo-600">${comp.billingCycle || 'Mensual'}</td>
                        <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            <span class="text-xs text-slate-500">${comp.services || 'Boletería'}</span>
                        </td>
                        <td class="font-medium font-mono">${regDate}</td>
                        <td class="font-bold font-mono text-slate-700">${nextDueDate}</td>
                        <td>${statusBadge}</td>
                    `;
                    tbodyVencimientos.appendChild(tr);
                });
            } else {
                tbodyVencimientos.innerHTML = '<tr><td colspan="7" class="text-center">No hay empresas registradas.</td></tr>';
            }
        }
        
        // Elementos métricos
        const statTotal = document.getElementById('stat-pay-total');
        const statCompleted = document.getElementById('stat-pay-completed');
        const statPending = document.getElementById('stat-pay-pending');
        const statOverdue = document.getElementById('stat-pay-overdue');

        let totalIngresos = 0;
        let cCompleted = 0;
        let cPending = 0;
        let cOverdue = 0;

        if (payments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No hay registros de cobros mensuales.</td></tr>';
            if (statTotal) statTotal.textContent = 'S/ 0.00';
            if (statCompleted) statCompleted.textContent = '0';
            if (statPending) statPending.textContent = '0';
            if (statOverdue) statOverdue.textContent = '0';
            return;
        }

        payments.forEach(pay => {
            const totalCost = parseFloat(pay.amount);
            
            // Acumular métricas
            if (pay.status === 'Pagado') {
                totalIngresos += totalCost;
                cCompleted++;
            } else if (pay.status === 'Pendiente') {
                cPending++;
            } else if (pay.status === 'Vencido') {
                cOverdue++;
            }

            let statusBadge = '';
            let actionBtn = '';

            if (pay.status === 'Pagado') {
                statusBadge = `<span class="badge-version" style="background: rgba(16, 185, 129, 0.1); color: #10b981; border-color: rgba(16, 185, 129, 0.3); font-weight: 700; border-radius: 8px;">Cobrado</span>`;
            } else if (pay.status === 'Pendiente') {
                statusBadge = `<span class="badge-version" style="background: rgba(245, 158, 11, 0.1); color: #f59e0b; border-color: rgba(245, 158, 11, 0.3); font-weight: 700; border-radius: 8px;">Pendiente</span>`;
                actionBtn = `
                    <button type="button" class="btn btn-primary btn-sparkle" style="padding: 4px 10px; font-size: 0.65rem; background: #10b981; border-color: #10b981; gap: 0.2rem;" onclick="registerSaasPaymentPaid('${pay.id}')">
                        <i data-lucide="check" style="width: 10px; height: 10px;"></i> Cobrar
                    </button>
                `;
            } else if (pay.status === 'Vencido') {
                statusBadge = `<span class="badge-version" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.3); font-weight: 700; border-radius: 8px;">Vencido</span>`;
                actionBtn = `
                    <button type="button" class="btn btn-primary btn-sparkle" style="padding: 4px 10px; font-size: 0.65rem; background: #ef4444; border-color: #ef4444; gap: 0.2rem;" onclick="registerSaasPaymentPaid('${pay.id}')">
                        <i data-lucide="check" style="width: 10px; height: 10px;"></i> Cobrar
                    </button>
                `;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="font-bold">${pay.companyName}</td>
                <td class="font-semibold">${pay.billingPeriod}</td>
                <td class="font-bold font-mono">S/ ${totalCost.toFixed(2)}</td>
                <td class="font-medium">${pay.dueDate}</td>
                <td class="font-medium text-emerald-600">${pay.payDate || '-'}</td>
                <td>${statusBadge}</td>
                <td class="action-buttons-cell">${actionBtn}</td>
            `;
            tbody.appendChild(tr);
        });

        // Actualizar UI de estadísticas
        if (statTotal) statTotal.textContent = `S/ ${totalIngresos.toFixed(2)}`;
        if (statCompleted) statCompleted.textContent = cCompleted;
        if (statPending) statPending.textContent = cPending;
        if (statOverdue) statOverdue.textContent = cOverdue;

        lucide.createIcons();

    } catch (err) {
        console.error("Error al cargar pagos:", err);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-red-500">Error de conexión al cargar pagos.</td></tr>';
    }
}

window.registerSaasPaymentPaid = async function(id) {
    const today = new Date().toISOString().split('T')[0];
    try {
        const res = await fetch(`/api/payments/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Pagado', payDate: today })
        }).then(r => r.json());

        if (res.success) {
            showToast("Pago registrado como cobrado exitosamente.", "success");
            await renderPaymentsList();
        } else {
            showToast("Error al cobrar pago: " + res.error, "error");
        }
    } catch (err) {
        console.error(err);
        showToast("Error de conexión al procesar cobro.", "error");
    }
};

function initSuperAdminSaasBehavior() {
    // === CONTROLADOR DE SUB-PESTAÑAS DE PLANES Y SERVICIOS ===
    const subtabsButtons = document.querySelectorAll('#apartado-planes .tab-btn-compact');
    const subtabContents = document.querySelectorAll('#apartado-planes .subtab-content');

    subtabsButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            subtabsButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            subtabContents.forEach(content => content.classList.add('hidden'));

            const targetSubtab = btn.getAttribute('data-subtab');
            const targetContent = document.getElementById(targetSubtab);
            if (targetContent) {
                targetContent.classList.remove('hidden');
            }
            lucide.createIcons();
        });
    });

    // === CONTROLADOR DE SUB-PESTAÑAS DE COBROS Y PAGOS ===
    const subtabsPagosButtons = document.querySelectorAll('#apartado-pagos .tab-btn-compact');
    const subtabPagosContents = document.querySelectorAll('#apartado-pagos .subtab-content');

    subtabsPagosButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            subtabsPagosButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            subtabPagosContents.forEach(content => content.classList.add('hidden'));

            const targetSubtab = btn.getAttribute('data-subtab');
            const targetContent = document.getElementById(targetSubtab);
            if (targetContent) {
                targetContent.classList.remove('hidden');
            }
            lucide.createIcons();
        });
    });

    const formEditServices = document.getElementById('form-edit-services');
    const formCreatePayment = document.getElementById('form-create-payment');

    const modalEdit = document.getElementById('modal-edit-services');
    const modalCreatePay = document.getElementById('modal-create-payment');

    const btnCloseEdit = document.getElementById('btn-close-edit-services-modal');
    const btnCloseCreatePay = document.getElementById('btn-close-create-payment-modal');
    const btnOpenCreatePay = document.getElementById('btn-open-create-payment-modal');

    // Cerrar modal editar servicios
    if (btnCloseEdit && modalEdit) {
        btnCloseEdit.addEventListener('click', () => {
            modalEdit.classList.add('hidden');
        });
    }

    // Registrar pago / cobro
    if (btnOpenCreatePay && modalCreatePay) {
        btnOpenCreatePay.addEventListener('click', () => {
            // Popular select de empresas
            const selectCompany = document.getElementById('payment-company-id');
            if (selectCompany) {
                selectCompany.innerHTML = '<option value="">Seleccione empresa...</option>';
                state.companies.forEach(c => {
                    selectCompany.innerHTML += `<option value="${c.id}">${c.name}</option>`;
                });

                // Auto calcular monto cuando se cambie de empresa
                selectCompany.addEventListener('change', () => {
                    const compId = selectCompany.value;
                    const comp = state.companies.find(c => c.id === compId);
                    const amountInput = document.getElementById('payment-amount');
                    if (comp && amountInput) {
                        const cost = calcularMontoMensual(comp.planName, comp.services);
                        amountInput.value = cost;
                    }
                });
            }

            // Poner fecha de vencimiento por defecto (vencimiento a 15 días)
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 15);
            const yyyymmdd = tomorrow.toISOString().split('T')[0];
            setPremiumDatepickerValue('payment-due-date', yyyymmdd);

            modalCreatePay.classList.remove('hidden');
        });
    }

    // Cerrar modal cobro
    if (btnCloseCreatePay && modalCreatePay) {
        btnCloseCreatePay.addEventListener('click', () => {
            modalCreatePay.classList.add('hidden');
        });
    }

    // Toggle de campo Fecha de Pago según estado
    const selectStatus = document.getElementById('payment-status');
    const containerPayDate = document.getElementById('payment-pay-date-container');
    if (selectStatus && containerPayDate) {
        selectStatus.addEventListener('change', () => {
            if (selectStatus.value === 'Pagado') {
                containerPayDate.classList.remove('hidden');
                setPremiumDatepickerValue('payment-pay-date', new Date().toISOString().split('T')[0]);
            } else {
                containerPayDate.classList.add('hidden');
                setPremiumDatepickerValue('payment-pay-date', '');
            }
        });
    }

    // Enviar formulario editar servicios
    if (formEditServices && modalEdit) {
        formEditServices.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-services-company-id').value;
            const planName = document.getElementById('edit-services-plan').value;

            // Recopilar checkboxes activos
            const checkedValues = [];
            modalEdit.querySelectorAll('.service-checkbox:checked').forEach(chk => {
                checkedValues.push(chk.value);
            });
            const services = checkedValues.join(',');

            try {
                const res = await fetch(`/api/companies/${id}/services`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ planName, services })
                }).then(r => r.json());

                if (res.success) {
                    showToast("Servicios y plan actualizados exitosamente.", "success");
                    modalEdit.classList.add('hidden');
                    await reloadAllApiData();
                    renderPlanesList();
                } else {
                    showToast("Error al actualizar servicios: " + res.error, "error");
                }
            } catch (err) {
                console.error(err);
                showToast("Error de conexión al actualizar servicios.", "error");
            }
        });
    }

    // Enviar formulario crear cobro
    if (formCreatePayment && modalCreatePay) {
        formCreatePayment.addEventListener('submit', async (e) => {
            e.preventDefault();
            const companyId = document.getElementById('payment-company-id').value;
            const billingPeriod = document.getElementById('payment-period').value;
            const amount = parseFloat(document.getElementById('payment-amount').value);
            const dueDate = document.getElementById('payment-due-date').value;
            const status = document.getElementById('payment-status').value;
            const payDate = document.getElementById('payment-pay-date').value || null;

            try {
                const res = await fetch('/api/payments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ companyId, billingPeriod, amount, dueDate, status, payDate })
                }).then(r => r.json());

                if (res.id) {
                    showToast("Cobro mensual registrado exitosamente.", "success");
                    modalCreatePay.classList.add('hidden');
                    formCreatePayment.reset();
                    setPremiumDatepickerValue('payment-due-date', '');
                    setPremiumDatepickerValue('payment-pay-date', '');
                    if (containerPayDate) containerPayDate.classList.add('hidden');
                    await reloadAllApiData();
                } else {
                    showToast("Error al registrar cobro: " + res.error, "error");
                }
            } catch (err) {
                console.error(err);
                showToast("Error de conexión al registrar cobro.", "error");
            }
        });
    }

    // === LÓGICA DE CONTROLADORES DE MODALES Y FORMULARIOS DE PLANES Y SERVICIOS SAAS ===
    const btnOpenCreatePlan = document.getElementById('btn-open-create-plan-modal');
    const btnCloseCreatePlan = document.getElementById('btn-close-create-plan-modal');
    const modalCreatePlan = document.getElementById('modal-create-plan');
    const formCreatePlan = document.getElementById('form-create-plan');

    const btnOpenCreateService = document.getElementById('btn-open-create-service-modal');
    const btnCloseCreateService = document.getElementById('btn-close-create-service-modal');
    const modalCreateService = document.getElementById('modal-create-service');
    const formCreateService = document.getElementById('form-create-service');

    // Cerrar / Abrir Modal de Plan
    if (btnOpenCreatePlan && modalCreatePlan) {
        btnOpenCreatePlan.addEventListener('click', () => {
            if (formCreatePlan) formCreatePlan.reset();
            document.getElementById('plan-id-hidden').value = '';
            document.getElementById('modal-plan-title').innerHTML = `<i data-lucide="gem"></i> Registrar Nuevo Plan SaaS`;
            modalCreatePlan.classList.remove('hidden');
            lucide.createIcons();
        });
    }
    if (btnCloseCreatePlan && modalCreatePlan) {
        btnCloseCreatePlan.addEventListener('click', () => {
            modalCreatePlan.classList.add('hidden');
        });
    }

    // Cerrar / Abrir Modal de Servicio
    if (btnOpenCreateService && modalCreateService) {
        btnOpenCreateService.addEventListener('click', () => {
            if (formCreateService) formCreateService.reset();
            document.getElementById('service-id-hidden').value = '';
            document.getElementById('modal-service-title').innerHTML = `<i data-lucide="package-plus"></i> Registrar Nuevo Módulo / Servicio`;
            modalCreateService.classList.remove('hidden');
            lucide.createIcons();
        });
    }
    if (btnCloseCreateService && modalCreateService) {
        btnCloseCreateService.addEventListener('click', () => {
            modalCreateService.classList.add('hidden');
        });
    }

    // Envío del Formulario de Crear / Editar Plan
    if (formCreatePlan && modalCreatePlan) {
        formCreatePlan.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('plan-id-hidden').value;
            const name = document.getElementById('plan-name').value.trim();
            const price = parseFloat(document.getElementById('plan-price').value);

            const method = id ? 'PUT' : 'POST';
            const url = id ? `/api/saas/plans/${id}` : '/api/saas/plans';

            try {
                const res = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, price })
                }).then(r => r.json());

                if (res.id || res.success) {
                    showToast(id ? "Plan actualizado exitosamente." : "Plan registrado exitosamente.", "success");
                    modalCreatePlan.classList.add('hidden');
                    formCreatePlan.reset();
                    await reloadAllApiData();
                } else {
                    showToast("Error al guardar plan: " + res.error, "error");
                }
            } catch (err) {
                console.error(err);
                showToast("Error de conexión al guardar plan.", "error");
            }
        });
    }

    // Envío del Formulario de Crear / Editar Servicio
    if (formCreateService && modalCreateService) {
        formCreateService.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('service-id-hidden').value;
            const name = document.getElementById('service-name').value.trim();
            const description = document.getElementById('service-description').value.trim();

            const method = id ? 'PUT' : 'POST';
            const url = id ? `/api/saas/services/${id}` : '/api/saas/services';

            try {
                const res = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, description })
                }).then(r => r.json());

                if (res.id || res.success) {
                    showToast(id ? "Servicio actualizado exitosamente." : "Servicio registrado exitosamente.", "success");
                    modalCreateService.classList.add('hidden');
                    formCreateService.reset();
                    await reloadAllApiData();
                } else {
                    showToast("Error al guardar servicio: " + res.error, "error");
                }
            } catch (err) {
                console.error(err);
                showToast("Error de conexión al guardar servicio.", "error");
            }
        });
    }

    // Inicializar Datepickers Premium del Super Admin
    initPremiumDatepickers();
}

/* ══════════════════════════════════════════════════════════
   DATEPICKER PREMIUM PERSONALIZADO (CSS-VANILLA / JS-NATIVO)
   ══════════════════════════════════════════════════════════ */
function initPremiumDatepickers() {
    const datepickerInputs = document.querySelectorAll('.datepicker-input');

    datepickerInputs.forEach(input => {
        const wrapper = input.closest('.datepicker-wrapper');
        if (!wrapper) return;

        const hiddenInput = wrapper.querySelector('input[type="hidden"]');
        
        input.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Cerrar cualquier popover abierto
            closeAllPremiumDatepickers();

            input.classList.add('active');
            
            const popover = document.createElement('div');
            popover.className = 'datepicker-calendar-popover';
            
            let initialDate = new Date();
            if (hiddenInput.value) {
                const parts = hiddenInput.value.split('-');
                if (parts.length === 3) {
                    initialDate = new Date(parts[0], parts[1] - 1, parts[2]);
                }
            }

            let currentMonth = initialDate.getMonth();
            let currentYear = initialDate.getFullYear();

            function renderCalendar(month, year) {
                popover.innerHTML = '';

                const header = document.createElement('div');
                header.className = 'datepicker-header';
                
                const monthNames = [
                    "enero", "febrero", "marzo", "abril", "mayo", "junio",
                    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
                ];

                header.innerHTML = `
                    <button type="button" class="datepicker-nav-btn btn-prev"><i data-lucide="chevron-left" style="width: 12px; height: 12px;"></i></button>
                    <div class="datepicker-month-title">${monthNames[month]} de ${year}</div>
                    <button type="button" class="datepicker-nav-btn btn-next"><i data-lucide="chevron-right" style="width: 12px; height: 12px;"></i></button>
                `;
                popover.appendChild(header);

                const grid = document.createElement('div');
                grid.className = 'datepicker-grid';

                const weekdays = ["do", "lu", "ma", "mi", "ju", "vi", "sa"];
                weekdays.forEach(day => {
                    grid.innerHTML += `<div class="datepicker-weekday">${day}</div>`;
                });

                const firstDayIndex = new Date(year, month, 1).getDay();
                const totalDays = new Date(year, month + 1, 0).getDate();
                const prevTotalDays = new Date(year, month, 0).getDate();

                // Relleno mes anterior
                for (let i = firstDayIndex - 1; i >= 0; i--) {
                    const dayNum = prevTotalDays - i;
                    const prevMonth = month === 0 ? 11 : month - 1;
                    const prevYear = month === 0 ? year - 1 : year;
                    
                    const dayDiv = document.createElement('div');
                    dayDiv.className = 'datepicker-day other-month';
                    dayDiv.textContent = dayNum;
                    dayDiv.addEventListener('click', () => {
                        selectDate(dayNum, prevMonth, prevYear);
                    });
                    grid.appendChild(dayDiv);
                }

                // Mes actual
                const today = new Date();
                for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
                    const dayDiv = document.createElement('div');
                    dayDiv.className = 'datepicker-day';
                    dayDiv.textContent = dayNum;

                    if (dayNum === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
                        dayDiv.classList.add('today');
                    }

                    if (hiddenInput.value) {
                        const parts = hiddenInput.value.split('-');
                        if (parts.length === 3) {
                            const selDay = parseInt(parts[2]);
                            const selMonth = parseInt(parts[1]) - 1;
                            const selYear = parseInt(parts[0]);
                            if (dayNum === selDay && month === selMonth && year === selYear) {
                                dayDiv.classList.add('selected');
                            }
                        }
                    }

                    dayDiv.addEventListener('click', () => {
                        selectDate(dayNum, month, year);
                    });
                    grid.appendChild(dayDiv);
                }

                // Relleno mes siguiente
                const totalGridCells = firstDayIndex + totalDays;
                const remainingCells = 42 - totalGridCells;
                for (let dayNum = 1; dayNum <= remainingCells; dayNum++) {
                    const nextMonth = month === 11 ? 0 : month + 1;
                    const nextYear = month === 11 ? year + 1 : year;

                    const dayDiv = document.createElement('div');
                    dayDiv.className = 'datepicker-day other-month';
                    dayDiv.textContent = dayNum;
                    dayDiv.addEventListener('click', () => {
                        selectDate(dayNum, nextMonth, nextYear);
                    });
                    grid.appendChild(dayDiv);
                }

                popover.appendChild(grid);

                const footer = document.createElement('div');
                footer.className = 'datepicker-footer';
                footer.innerHTML = `
                    <button type="button" class="datepicker-footer-btn datepicker-btn-clear">Borrar</button>
                    <button type="button" class="datepicker-footer-btn datepicker-btn-today">Hoy</button>
                `;
                popover.appendChild(footer);

                popover.querySelector('.btn-prev').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    if (currentMonth === 0) {
                        currentMonth = 11;
                        currentYear--;
                    } else {
                        currentMonth--;
                    }
                    renderCalendar(currentMonth, currentYear);
                });

                popover.querySelector('.btn-next').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    if (currentMonth === 11) {
                        currentMonth = 0;
                        currentYear++;
                    } else {
                        currentMonth++;
                    }
                    renderCalendar(currentMonth, currentYear);
                });

                popover.querySelector('.datepicker-btn-clear').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    hiddenInput.value = '';
                    input.value = '';
                    hiddenInput.dispatchEvent(new Event('change'));
                    closeAllPremiumDatepickers();
                });

                popover.querySelector('.datepicker-btn-today').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const now = new Date();
                    selectDate(now.getDate(), now.getMonth(), now.getFullYear());
                });

                lucide.createIcons();
            }

            function selectDate(day, month, year) {
                const formattedMonth = String(month + 1).padStart(2, '0');
                const formattedDay = String(day).padStart(2, '0');
                const dbDate = `${year}-${formattedMonth}-${formattedDay}`;
                const displayDate = `${formattedDay}/${formattedMonth}/${year}`;

                hiddenInput.value = dbDate;
                input.value = displayDate;
                hiddenInput.dispatchEvent(new Event('change'));
                closeAllPremiumDatepickers();
            }

            renderCalendar(currentMonth, currentYear);
            wrapper.appendChild(popover);
        });
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.datepicker-wrapper') && !e.target.closest('.datepicker-calendar-popover')) {
            closeAllPremiumDatepickers();
        }
    });
}

function closeAllPremiumDatepickers() {
    document.querySelectorAll('.datepicker-calendar-popover').forEach(pop => pop.remove());
    document.querySelectorAll('.datepicker-input').forEach(input => input.classList.remove('active'));
}

window.setPremiumDatepickerValue = function(id, yyyymmdd) {
    const hidden = document.getElementById(id);
    if (!hidden) return;
    
    const wrapper = hidden.closest('.datepicker-wrapper');
    if (!wrapper) return;

    const display = wrapper.querySelector('.datepicker-input');
    if (!display) return;

    hidden.value = yyyymmdd;
    if (yyyymmdd) {
        const parts = yyyymmdd.split('-');
        if (parts.length === 3) {
            display.value = `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else {
            display.value = yyyymmdd;
        }
    } else {
        display.value = '';
    }
};

/* ══════════════════════════════════════════════════════════
   MODAL DE CONFIRMACIÓN PREMIUM PERSONALIZADO (NO-CONFIRM NATIVO)
   ══════════════════════════════════════════════════════════ */
window.showConfirmModal = function({ title, message, icon = 'alert-triangle', confirmColor = '#ef4444', onConfirm, onCancel }) {
    const modal = document.getElementById('modal-confirm-premium');
    if (!modal) return;

    // Configurar textos dinámicos
    document.getElementById('confirm-modal-title').textContent = title || "¿Confirmar Acción?";
    document.getElementById('confirm-modal-message').textContent = message || "";
    
    // Configurar icono dinámico y su caja
    const iconBox = document.getElementById('confirm-modal-icon-box');
    if (iconBox) {
        iconBox.style.color = confirmColor;
        // Si es rojo peligro, color lila suave de advertencia, sino indigo/azul para otras confirmaciones
        iconBox.style.background = confirmColor === '#ef4444' ? '#fee2e2' : '#e0e7ff';
        iconBox.innerHTML = `<i data-lucide="${icon}" style="width: 28px; height: 28px;"></i>`;
    }
    
    // Configurar el color de fondo y hover del botón de confirmar
    const btnAccept = document.getElementById('btn-confirm-accept');
    if (btnAccept) {
        btnAccept.style.background = confirmColor;
    }

    const handleCancel = () => {
        modal.classList.add('hidden');
        if (onCancel) onCancel();
        cleanup();
    };

    const handleAccept = () => {
        modal.classList.add('hidden');
        if (onConfirm) onConfirm();
        cleanup();
    };

    function cleanup() {
        document.getElementById('btn-confirm-cancel')?.removeEventListener('click', handleCancel);
        document.getElementById('btn-confirm-accept')?.removeEventListener('click', handleAccept);
    }

    // Registrar listeners limpios
    cleanup();
    document.getElementById('btn-confirm-cancel')?.addEventListener('click', handleCancel);
    document.getElementById('btn-confirm-accept')?.addEventListener('click', handleAccept);

    // Mostrar el modal con la animación y renderizar el nuevo icono Lucide
    modal.classList.remove('hidden');
    lucide.createIcons();
};


