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
    
    // Cargar datos por primera vez
    await reloadAllApiData();
    
    // Configurar Polling Inteligente cada 3 segundos para sincronización en tiempo real
    setInterval(syncTicketsOnly, 3000);
}

// Cargar todos los datos desde los endpoints Express
async function reloadAllApiData() {
    try {
        const [resComp, resSede, resTrab, resMov, resTick] = await Promise.all([
            fetch('/api/companies').then(r => r.json()),
            fetch('/api/sedes').then(r => r.json()),
            fetch('/api/trabajadores').then(r => r.json()),
            fetch('/api/movilidades').then(r => r.json()),
            fetch('/api/tickets').then(r => r.json())
        ]);
        
        state.companies = resComp || [];
        state.sedes = resSede || [];
        state.trabajadores = resTrab || [];
        state.movilidades = resMov || [];
        state.tickets = resTick || [];
        
        // Actualizar UI
        populateCompanySelectors();
        renderCompaniesList();
        updateSuperStats();
        updateEstabUI();
        
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
    
    state.activeCompanyId = headerSelect.value;
    applyCompanyBrandTheme();
    populateSedeSelectors();
}

function populateSedeSelectors() {
    const headerSedeSelect = document.getElementById('header-sede-select');
    const workerSedeSelect = document.getElementById('trabajador-sede');
    const vehicleSedeSelect = document.getElementById('movilidad-sede');
    
    if (!headerSedeSelect) return;
    
    const prevHeaderSelected = headerSedeSelect.value || state.activeSedeId;
    headerSedeSelect.innerHTML = '';
    if (workerSedeSelect) workerSedeSelect.innerHTML = '<option value="">Selecciona Sede</option>';
    if (vehicleSedeSelect) vehicleSedeSelect.innerHTML = '<option value="">Selecciona Sede</option>';
    
    // Filtrar sedes por la empresa activa
    const filteredSedes = state.sedes.filter(s => s.companyId === state.activeCompanyId);
    
    if (filteredSedes.length === 0) {
        headerSedeSelect.innerHTML = '<option value="">Sin sedes</option>';
        return;
    }
    
    filteredSedes.forEach(sede => {
        // En header
        const opt1 = document.createElement('option');
        opt1.value = sede.id;
        opt1.textContent = `${sede.name} (${sede.city})`;
        headerSedeSelect.appendChild(opt1);
        
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
    });
    
    if (filteredSedes.some(s => s.id === prevHeaderSelected)) {
        headerSedeSelect.value = prevHeaderSelected;
    } else {
        headerSedeSelect.value = filteredSedes[0].id;
    }
    
    state.activeSedeId = headerSedeSelect.value;
    updateEstabUI();
}

// Aplicar colores de la empresa de forma dinámica con variables CSS
function applyCompanyBrandTheme() {
    const activeCompany = state.companies.find(c => c.id === state.activeCompanyId);
    if (activeCompany && activeCompany.color) {
        document.documentElement.style.setProperty('--brand-primary', activeCompany.color);
        document.documentElement.style.setProperty('--brand-primary-glow', `${activeCompany.color}35`);
        document.documentElement.style.setProperty('--brand-primary-light', lightenColor(activeCompany.color, 15));
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

async function createCompany(name, ruc, logo, color) {
    await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ruc, logo, color })
    });
    await reloadAllApiData();
}

async function createSede(companyId, name, city, address) {
    await fetch('/api/sedes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, name, city, address })
    });
    await reloadAllApiData();
}

async function createTrabajador(companyId, sedeId, name, lastname, dni, role) {
    await fetch('/api/trabajadores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, sedeId, name, lastname, dni, role })
    });
    await reloadAllApiData();
}

async function createMovilidad(companyId, sedeId, plate, brand, modelType, routeFrom, routeTo, price) {
    await fetch('/api/movilidades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, sedeId, plate, brand, modelType, routeFrom, routeTo, price })
    });
    await reloadAllApiData();
}

// ==========================================
// 5. REGISTRO DE DATOS SEMILLA (SEED DATA)
// ==========================================
async function seedDefaultRailwayData() {
    const seedBtn = document.getElementById('btn-seed-data');
    seedBtn.disabled = true;
    seedBtn.innerHTML = '<i class="animate-spin" data-lucide="loader-2"></i> Precargando Datos...';
    lucide.createIcons();

    try {
        const res = await fetch('/api/seed', { method: 'POST' }).then(r => r.json());
        if (res.success) {
            await reloadAllApiData();
            showToast("¡Datos semilla creados en tu Base de Datos de Railway exitosamente!", "success");
        } else {
            showToast("Error al cargar datos semilla: " + res.error, "error");
        }
    } catch (err) {
        console.error("Error al sembrar datos:", err);
        showToast("Ocurrió un error cargando los datos semilla.", "error");
    } finally {
        seedBtn.disabled = false;
        seedBtn.innerHTML = '<i data-lucide="database-backup"></i> Cargar Datos Semilla en Railway';
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
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay empresas. Carga datos semilla para empezar.</td></tr>';
        return;
    }
    
    state.companies.forEach(company => {
        const sedesCount = state.sedes.filter(s => s.companyId === company.id).length;
        const movCount = state.movilidades.filter(m => m.companyId === company.id).length;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="font-bold">${company.name}</td>
            <td>${company.ruc}</td>
            <td>
                <span class="company-badge-color" style="background-color: ${company.color || '#6366f1'}"></span>
                <span class="ml-2 font-mono">${company.color || '#6366F1'}</span>
            </td>
            <td>${sedesCount}</td>
            <td>${movCount}</td>
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
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="font-bold">${sede.name}</td>
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
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No hay vehículos registrados para esta empresa.</td></tr>';
        return;
    }
    
    filteredMovilidades.forEach(m => {
        const sedeObj = state.sedes.find(s => s.id === m.sedeId);
        const sedeName = sedeObj ? sedeObj.name : 'Sin Sede Base';
        
        let modelText = "";
        if (m.modelType === "combi") modelText = "Combi Rural (15a)";
        else if (m.modelType === "minibus") modelText = "Minibus Colectivo (24a)";
        else if (m.modelType === "bus1p") modelText = "Bus 1 Piso (44a)";
        else if (m.modelType === "bus2p") modelText = "Bus 2 Pisos VIP (60a)";
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="plate-badge font-bold">${m.plate}</td>
            <td>${m.brand}</td>
            <td><span class="vehicle-model-pill">${modelText}</span></td>
            <td>${sedeName}</td>
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
    
    const sedeVehicles = state.movilidades.filter(m => m.sedeId === state.activeSedeId && m.companyId === state.activeCompanyId);
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
            cellEl.innerHTML = '<i data-lucide="log-out"></i>';
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
    
    document.getElementById('modal-seat-num').textContent = seatNum;
    document.getElementById('sale-route-from').value = vehicle.routeFrom;
    document.getElementById('sale-route-to').value = vehicle.routeTo;
    document.getElementById('sale-price').value = vehicle.price;
    
    document.getElementById('form-register-sale').reset();
    document.getElementById('sale-price').value = vehicle.price;
    
    document.getElementById('modal-sale-register').classList.remove('hidden');
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
    
    document.getElementById('ticket-id').textContent = `SERIE BC02-00${ticketId.slice(-6).toUpperCase()}`;
    document.getElementById('ticket-passenger').textContent = ticketData.passengerName;
    document.getElementById('ticket-dni').textContent = ticketData.passengerDni;
    document.getElementById('ticket-seat').textContent = ticketData.seatNum + (vehicleIsTwoFloors() ? ` (Piso ${ticketData.floor})` : '');
    document.getElementById('ticket-status').textContent = ticketData.status === 'Ocupado' ? 'PAGADO' : 'SEPARADO';
    document.getElementById('ticket-route').textContent = `${ticketData.routeFrom} ➔ ${ticketData.routeTo}`;
    document.getElementById('ticket-payment').textContent = ticketData.paymentMethod;
    document.getElementById('ticket-date').textContent = ticketData.date;
    document.getElementById('ticket-price').textContent = `S/. ${ticketData.price.toFixed(2)}`;
    
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
    
    const panelSuperAdmin = document.getElementById('panel-super-admin');
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

    const btnSeed = document.getElementById('btn-seed-data');
    if (btnSeed) {
        btnSeed.addEventListener('click', seedDefaultRailwayData);
    }

    const formCompany = document.getElementById('form-create-company');
    if (formCompany) {
        formCompany.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('company-name').value.trim();
            const ruc = document.getElementById('company-ruc').value.trim();
            const logo = ""; // Solución preventiva: no leer '#company-logo' ya que no existe en el DOM
            const color = document.getElementById('company-color').value;
            
            await createCompany(name, ruc, logo, color);
            formCompany.reset();
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
            
            await createSede(state.activeCompanyId, name, city, address);
            formSede.reset();
            showToast("Sede registrada con éxito.", "success");
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
            const sedeId = document.getElementById('movilidad-sede').value;
            const routeFrom = document.getElementById('movilidad-route-from').value.trim();
            const routeTo = document.getElementById('movilidad-route-to').value.trim();
            const price = document.getElementById('movilidad-price').value;
            
            if (!sedeId) {
                showToast("Por favor selecciona una sede base.", "error");
                return;
            }
            
            await createMovilidad(state.activeCompanyId, sedeId, plate, brand, modelType, routeFrom, routeTo, price);
            formMovilidad.reset();
            showToast("Vehículo incorporado a la flota con éxito.", "success");
        });
    }

    const adminTabBtns = document.querySelectorAll('.tab-btn[data-admin-tab]');
    adminTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            adminTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const targetTab = btn.getAttribute('data-admin-tab');
            const tabs = ['sedes', 'trabajadores', 'movilidades'];
            tabs.forEach(t => {
                const el = document.getElementById(`tab-admin-${t}`);
                if (el) el.classList.add('hidden');
            });
            
            const targetEl = document.getElementById(`tab-admin-${targetTab}`);
            if (targetEl) targetEl.classList.remove('hidden');
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
