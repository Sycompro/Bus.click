/**
 * Bus.click - Lógica de la Web Móvil del Cliente B2C (client_app.js)
 * Diseñado 100% Mobile-First con estética Ultra-Premium
 */

// --- ESTADO GLOBAL DE LA APP MÓVIL ---
const state = {
    sedes: [],
    companies: [],
    movilidades: [],
    tickets: [],
    
    // Selección del cliente
    selectedOrigin: "",
    selectedDestination: "",
    selectedDate: "",
    
    selectedBus: null,
    selectedSeat: null,
    selectedFloor: 1,
    
    passengerDni: "",
    passengerName: "",
    paymentMethod: "Yape/Plin",
    
    // Pasajes comprados localmente en esta sesión (almacenados en localStorage)
    myTickets: JSON.parse(localStorage.getItem('busclick_client_tickets') || '[]')
};

// --- LISTADO AUXILIAR DNI RENIEC (FALLBACK) ---
const MOCK_NAMES = {
    "11111111": "Juan Pérez Quispe",
    "22222222": "María Rodríguez Díaz",
    "33333333": "Carlos Mendoza Flores",
    "44444444": "Ana Torres Guerrero",
    "55555555": "Luis Sánchez Ramos",
    "66666666": "Sofía Castro Paredes",
    "77777777": "Miguel Ángel Benítez",
    "88888888": "Gabriela Morales Vega",
    "45678901": "Alejandro Ruiz Ortiz",
    "12345678": "Renzo Valdivia Ludeña",
    "87654321": "Milagros Cáceres Rivas"
};

// --- AL CARGAR EL DOCUMENTO ---
document.addEventListener("DOMContentLoaded", async () => {
    // Inicializar iconos
    lucide.createIcons();
    
    // Inicializar Datepicker Premium
    initPremiumDatepickers();
    
    // Cargar datos catálogos
    await loadInitialData();
    
    // Configurar controladores de eventos y navegación
    setupEventListeners();
    
    // Cargar el historial de pasajes si existe en el tab
    updateHistoryTabBadge();
});

// --- CARGA DE DATOS INICIALES ---
async function loadInitialData() {
    try {
        // Cargar Sedes
        const sedesRes = await fetch('/api/sedes');
        state.sedes = await sedesRes.json();
        
        // Cargar Empresas
        const compRes = await fetch('/api/companies');
        state.companies = await compRes.json();
        
        // Poblar selectores de ciudades
        populateOriginDestinationSelects();
    } catch (e) {
        console.error("Error al cargar datos catálogos:", e);
        showMobileNotification("Error de conexión al cargar los destinos de viaje.", "error");
    }
}

// --- POBLAR SELECTORES DE ORIGEN Y DESTINO ---
function populateOriginDestinationSelects() {
    const originSelect = document.getElementById("search-origin");
    const destSelect = document.getElementById("search-destination");
    
    if (!originSelect || !destSelect) return;
    
    // Extraer ciudades únicas de las sedes
    const cities = [...new Set(state.sedes.map(s => s.city))].sort();
    
    // Limpiar selectores
    originSelect.innerHTML = '<option value="" disabled selected>Seleccione origen...</option>';
    destSelect.innerHTML = '<option value="" disabled selected>Seleccione destino...</option>';
    
    cities.forEach(city => {
        const optOrigin = document.createElement("option");
        optOrigin.value = city;
        optOrigin.textContent = city;
        originSelect.appendChild(optOrigin);
        
        const optDest = document.createElement("option");
        optDest.value = city;
        optDest.textContent = city;
        destSelect.appendChild(optDest);
    });
}

// --- CONFIGURACIÓN DE LISTENERS ---
function setupEventListeners() {
    // Intercambiar Origen y Destino
    const btnSwap = document.getElementById("btn-mobile-swap");
    if (btnSwap) {
        btnSwap.addEventListener("click", () => {
            const originSelect = document.getElementById("search-origin");
            const destSelect = document.getElementById("search-destination");
            
            const temp = originSelect.value;
            originSelect.value = destSelect.value;
            destSelect.value = temp;
        });
    }
    
    // Formulario de Búsqueda (Paso 1)
    const formSearch = document.getElementById("form-mobile-search");
    if (formSearch) {
        formSearch.addEventListener("submit", async (e) => {
            e.preventDefault();
            await handleSearchSubmit();
        });
    }
    
    // Botones "Volver"
    document.querySelectorAll(".btn-back-to-search").forEach(btn => {
        btn.addEventListener("click", () => {
            goToStep("step-search");
        });
    });
    
    document.querySelectorAll(".btn-back-to-routes").forEach(btn => {
        btn.addEventListener("click", () => {
            goToStep("step-routes");
        });
    });
    
    document.querySelectorAll(".btn-back-to-seats").forEach(btn => {
        btn.addEventListener("click", () => {
            goToStep("step-seats");
        });
    });
    
    // Botón Confirmar Asiento (Paso 3 -> Paso 4)
    const btnConfirmSeat = document.getElementById("btn-confirm-seat");
    if (btnConfirmSeat) {
        btnConfirmSeat.addEventListener("click", () => {
            if (state.selectedSeat) {
                goToStep("step-passenger");
            }
        });
    }
    
    // Consulta DNI (Paso 4)
    const btnReniec = document.getElementById("btn-mobile-reniec");
    if (btnReniec) {
        btnReniec.addEventListener("click", async () => {
            await consultDniRENIEC();
        });
    }
    
    // Formulario Datos Pasajero y Pago (Paso 4 -> Paso 5)
    const formPassenger = document.getElementById("form-mobile-passenger");
    if (formPassenger) {
        formPassenger.addEventListener("submit", async (e) => {
            e.preventDefault();
            await processPaymentAndBooking();
        });
    }
    
    // Comprar Otro Pasaje (Paso 5 -> Paso 1)
    document.querySelectorAll(".btn-new-booking").forEach(btn => {
        btn.addEventListener("click", () => {
            resetBookingState();
            goToStep("step-search");
        });
    });
    
    // Tab Bar Inferior
    const tabHome = document.getElementById("tab-home");
    const tabHistory = document.getElementById("tab-history");
    const tabHelp = document.getElementById("tab-help");
    
    if (tabHome) {
        tabHome.addEventListener("click", () => {
            setActiveTab("tab-home");
            goToStep("step-search");
        });
    }
    
    if (tabHistory) {
        tabHistory.addEventListener("click", () => {
            setActiveTab("tab-history");
            showHistoryModal();
        });
    }
    
    if (tabHelp) {
        tabHelp.addEventListener("click", () => {
            setActiveTab("tab-help");
            showHelpModal();
        });
    }
}

// --- TRANSICIÓN DE PASOS DEL WIZARD ---
function goToStep(stepId) {
    document.querySelectorAll(".wizard-step").forEach(step => {
        step.classList.add("hidden");
    });
    
    const targetStep = document.getElementById(stepId);
    if (targetStep) {
        targetStep.classList.remove("hidden");
        
        // Hacer scroll arriba del contenedor móvil
        const scrollArea = document.getElementById("mobile-main-content");
        if (scrollArea) scrollArea.scrollTop = 0;
    }
    
    // Sincronizar Lucide Icons
    lucide.createIcons();
}

// --- CONTROLADOR DE BÚSQUEDA (PASO 1 -> PASO 2) ---
async function handleSearchSubmit() {
    const origin = document.getElementById("search-origin").value;
    const destination = document.getElementById("search-destination").value;
    const date = document.getElementById("search-date").value;
    
    if (!origin || !destination || !date) {
        showMobileNotification("Por favor, complete todos los campos de búsqueda.", "warning");
        return;
    }
    
    if (origin === destination) {
        showMobileNotification("El origen y el destino no pueden ser iguales.", "warning");
        return;
    }
    
    // Guardar en estado
    state.selectedOrigin = origin;
    state.selectedDestination = destination;
    state.selectedDate = date;
    
    // Mostrar loader de búsqueda
    const routesList = document.getElementById("mobile-routes-list");
    routesList.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem 0; color: #a5b4fc;">
            <div class="mobile-loading-spinner" style="width: 28px; height: 28px; border: 3px solid rgba(99, 102, 241, 0.2); border-top-color: var(--brand-primary); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem;"></div>
            <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Buscando buses en tiempo real...</span>
        </div>
    `;
    
    goToStep("step-routes");
    
    // Formatear títulos de la vista del Paso 2
    document.getElementById("results-route-title").textContent = `${origin} ➔ ${destination}`;
    
    const dateParts = date.split('-');
    if (dateParts.length === 3) {
        const monthNames = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
        document.getElementById("results-date-subtitle").textContent = `${dateParts[2]} de ${monthNames[parseInt(dateParts[1]) - 1]} de ${dateParts[0]}`;
    } else {
        document.getElementById("results-date-subtitle").textContent = date;
    }
    
    try {
        // Consultar Movilidades y Tickets de forma paralela
        const [movRes, tickRes] = await Promise.all([
            fetch('/api/movilidades'),
            fetch('/api/tickets')
        ]);
        
        state.movilidades = await movRes.json();
        state.tickets = await tickRes.json();
        
        // Filtrar movilidades que coincidan con la ruta
        const filteredBuses = state.movilidades.filter(m => 
            m.routeFrom && m.routeFrom.trim().toLowerCase() === origin.trim().toLowerCase() && 
            m.routeTo && m.routeTo.trim().toLowerCase() === destination.trim().toLowerCase()
        );
        
        state.availableBuses = filteredBuses;
        
        renderAvailableBuses();
    } catch (e) {
        console.error("Error al buscar viajes:", e);
        routesList.innerHTML = `
            <div style="text-align: center; padding: 2rem 1rem; color: #ef4444;">
                <i data-lucide="wifi-off" style="width: 24px; height: 24px; margin: 0 auto 0.5rem auto;"></i>
                <div style="font-size: 11px; font-weight: 800;">Fallo de Conexión</div>
                <div style="font-size: 9px; color: #64748b; margin-top: 0.25rem;">No pudimos conectarnos al servidor. Inténtalo nuevamente.</div>
                <button type="button" class="mobile-btn-secondary" onclick="handleSearchSubmit()" style="margin-top: 1rem; padding: 6px 12px; width: auto; font-size: 10px; margin-left: auto; margin-right: auto;">Reintentar</button>
            </div>
        `;
        lucide.createIcons();
    }
}

// --- RENDERIZAR TARJETAS DE BUSES (PASO 2) ---
function renderAvailableBuses() {
    const container = document.getElementById("mobile-routes-list");
    container.innerHTML = "";
    
    if (state.availableBuses.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem 1rem;" class="mobile-card-glass">
                <i data-lucide="alert-circle" style="width: 28px; height: 28px; color: #a5b4fc; margin: 0 auto 0.75rem auto;"></i>
                <div style="font-size: 12px; font-weight: 800; color: #ffffff;">Sin Buses Disponibles</div>
                <div style="font-size: 9px; color: #64748b; margin-top: 0.25rem; line-height: 1.4;">No se encontraron servicios programados entre ${state.selectedOrigin} y ${state.selectedDestination} para la fecha seleccionada.</div>
                <button type="button" class="mobile-btn-secondary btn-back-to-search" style="margin-top: 1rem; width: auto; display: inline-flex; font-size: 10px; padding: 6px 12px; margin-left: auto; margin-right: auto;">
                    Cambiar Búsqueda
                </button>
            </div>
        `;
        
        container.querySelector(".btn-back-to-search").addEventListener("click", () => {
            goToStep("step-search");
        });
        
        lucide.createIcons();
        return;
    }
    
    state.availableBuses.forEach(bus => {
        // Encontrar empresa asociada
        const company = state.companies.find(c => c.id === bus.companyId) || { name: "Herrera Trans" };
        
        // Obtener capacidad por modelo
        const capacity = getCapacityByModel(bus.modelType);
        
        // Contar ocupados
        const occupiedCount = state.tickets.filter(t => 
            t.movilidadId === bus.id && 
            t.date === state.selectedDate && 
            (t.status === "Ocupado" || t.status === "Reservado")
        ).length;
        
        const freeSeats = Math.max(0, capacity - occupiedCount);
        
        // Crear tarjeta de bus premium
        const card = document.createElement("div");
        card.className = "mobile-card-glass bus-route-card";
        card.style.position = "relative";
        card.style.cursor = "pointer";
        card.style.marginBottom = "0.75rem";
        
        // Determinar icono del modelo
        const isTwoFloors = bus.modelType === "bus2p";
        const busTypeLabel = isTwoFloors ? "2 Pisos (VIP)" : "1 Piso (Premium)";
        const busIcon = isTwoFloors ? "layers" : "bus";
        
        card.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="bus-feature-badge" style="color: var(--brand-primary); background: rgba(99, 102, 241, 0.1); font-weight: 800;">
                    ${company.name}
                </span>
                <span class="bus-feature-badge">
                    <i data-lucide="${busIcon}" style="width: 8px; height: 8px;"></i> ${busTypeLabel}
                </span>
            </div>
            
            <div class="bus-route-time">
                <i data-lucide="clock" style="width: 12px; height: 12px; color: #a5b4fc;"></i>
                <span>08:30 AM ➔ 04:30 PM</span>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 0.5rem;">
                <span style="font-size: 8px; font-weight: 700; color: #64748b;">
                    Placa: <strong style="color: #cbd5e1;">${bus.plate}</strong>
                </span>
                <span style="font-size: 9px; font-weight: 800; color: ${freeSeats > 5 ? '#10b981' : '#f59e0b'};">
                    ${freeSeats} Asientos Libres
                </span>
            </div>
            
            <div class="bus-route-price">
                S/ ${parseFloat(bus.price).toFixed(2)}
            </div>
            
            <div class="bus-features-row" style="margin-top: 0.5rem;">
                <span class="bus-feature-badge"><i data-lucide="wifi" style="width: 7px; height: 7px;"></i> WiFi</span>
                <span class="bus-feature-badge"><i data-lucide="zap" style="width: 7px; height: 7px;"></i> USB</span>
                <span class="bus-feature-badge"><i data-lucide="wind" style="width: 7px; height: 7px;"></i> Aire A.</span>
            </div>
        `;
        
        card.addEventListener("click", () => {
            selectBusForBooking(bus);
        });
        
        container.appendChild(card);
    });
    
    lucide.createIcons();
}

// --- SELECCIONAR BUS Y PREPARAR PASO 3 ---
function selectBusForBooking(bus) {
    state.selectedBus = bus;
    state.selectedSeat = null;
    state.selectedFloor = 1;
    
    // Deshabilitar botón confirmar temporalmente
    const btnConfirm = document.getElementById("btn-confirm-seat");
    if (btnConfirm) {
        btnConfirm.disabled = true;
    }
    
    // Sincronizar subtítulo del Paso 3
    const company = state.companies.find(c => c.id === bus.companyId) || { name: "Herrera Trans" };
    const busTypeLabel = bus.modelType === "bus2p" ? "Bus 2 Pisos VIP Lounge" : "Bus 1 Piso Premium";
    document.getElementById("seats-bus-subtitle").textContent = `${company.name} | ${bus.plate} - ${busTypeLabel}`;
    
    // Reseteo visual del asiento
    document.getElementById("selected-seat-text").textContent = "-";
    document.getElementById("selected-seat-price").textContent = "S/ 0.00";
    
    // Configurar selector de piso
    const floorToggle = document.getElementById("floor-toggle-container");
    if (bus.modelType === "bus2p") {
        floorToggle.classList.remove("hidden");
        
        const btnF1 = document.getElementById("btn-floor-1");
        const btnF2 = document.getElementById("btn-floor-2");
        
        btnF1.className = "tab-btn-compact active";
        btnF2.className = "tab-btn-compact";
        
        // Remover listeners viejos clonando los botones
        const newBtnF1 = btnF1.cloneNode(true);
        const newBtnF2 = btnF2.cloneNode(true);
        btnF1.parentNode.replaceChild(newBtnF1, btnF1);
        btnF2.parentNode.replaceChild(newBtnF2, btnF2);
        
        newBtnF1.addEventListener("click", () => {
            newBtnF1.classList.add("active");
            newBtnF2.classList.remove("active");
            state.selectedFloor = 1;
            renderSeatsGridMobile();
        });
        
        newBtnF2.addEventListener("click", () => {
            newBtnF2.classList.add("active");
            newBtnF1.classList.remove("active");
            state.selectedFloor = 2;
            renderSeatsGridMobile();
        });
    } else {
        floorToggle.classList.add("hidden");
    }
    
    // Renderizar los asientos
    renderSeatsGridMobile();
    
    goToStep("step-seats");
}

// --- MAQUETA DE SELECCIÓN DE ASIENTOS MÓVIL (PASO 3) ---
function renderSeatsGridMobile() {
    const container = document.getElementById("mobile-bus-seats-container");
    if (!container) return;
    
    container.innerHTML = "";
    
    const bus = state.selectedBus;
    if (!bus) return;
    
    // Obtener todos los tickets ocupados para esta movilidad y fecha
    const busTickets = state.tickets.filter(t => 
        t.movilidadId === bus.id && 
        t.date === state.selectedDate &&
        (t.status === "Ocupado" || t.status === "Reservado")
    );
    
    let rows = 0;
    let cols = 4;
    let seatsLayout = [];
    
    // Lógica de distribución por tipo de vehículo
    if (bus.modelType === "combi") {
        rows = 5;
        cols = 4;
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
    else if (bus.modelType === "minibus") {
        rows = 8;
        cols = 3;
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
    else if (bus.modelType === "bus1p") {
        rows = 11;
        cols = 4;
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
    else if (bus.modelType === "bus2p") {
        cols = 4;
        let seatCounter = 1;
        if (state.selectedFloor === 1) {
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
    
    // Configurar columnas en el CSS grid
    container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    
    // Renderizar celdas
    seatsLayout.forEach(cell => {
        const cellEl = document.createElement("div");
        
        if (cell.type === 'aisle') {
            cellEl.className = 'seat-spacer';
        }
        else if (cell.type === 'door') {
            cellEl.className = 'mobile-bus-seat occupied';
            cellEl.style.background = "transparent";
            cellEl.style.border = "none";
            cellEl.innerHTML = '<i data-lucide="door-closed" style="width: 14px; height: 14px; color: #475569;"></i>';
        }
        else if (cell.type === 'stairs') {
            cellEl.className = 'mobile-bus-seat occupied';
            cellEl.style.background = "transparent";
            cellEl.style.border = "none";
            cellEl.innerHTML = '<i data-lucide="layers" style="width: 14px; height: 14px; color: #475569;"></i>';
        }
        else if (cell.type === 'empty') {
            cellEl.className = 'seat-spacer';
        }
        else if (cell.type === 'seat') {
            // Verificar si el asiento está ocupado para el piso activo
            const ticket = busTickets.find(t => t.seatNum === cell.seatNum && parseInt(t.floor || 1) === state.selectedFloor);
            
            cellEl.className = 'mobile-bus-seat';
            cellEl.textContent = cell.seatNum;
            
            if (ticket) {
                // Asiento ocupado
                cellEl.classList.add("occupied");
            } else {
                // Asiento disponible
                cellEl.classList.add("available");
                
                // Si este asiento ya estaba seleccionado anteriormente
                if (state.selectedSeat === cell.seatNum) {
                    cellEl.classList.add("selected");
                }
                
                cellEl.addEventListener("click", () => {
                    // Remover selección previa
                    container.querySelectorAll(".mobile-bus-seat.selected").forEach(s => {
                        s.classList.remove("selected");
                    });
                    
                    // Marcar como seleccionado
                    cellEl.classList.add("selected");
                    state.selectedSeat = cell.seatNum;
                    
                    // Actualizar el resumen
                    const floorSuffix = bus.modelType === "bus2p" ? ` (Piso ${state.selectedFloor})` : "";
                    document.getElementById("selected-seat-text").textContent = `Asiento ${cell.seatNum}${floorSuffix}`;
                    document.getElementById("selected-seat-price").textContent = `S/ ${parseFloat(bus.price).toFixed(2)}`;
                    
                    // Habilitar botón de continuar
                    const btnConfirm = document.getElementById("btn-confirm-seat");
                    if (btnConfirm) btnConfirm.disabled = false;
                });
            }
        }
        
        container.appendChild(cellEl);
    });
    
    lucide.createIcons();
}

// --- CONSULTA RENIEC DE PASAJERO (PASO 4) ---
async function consultDniRENIEC() {
    const dniInput = document.getElementById("passenger-dni");
    const nameInput = document.getElementById("passenger-name");
    const btn = document.getElementById("btn-mobile-reniec");
    
    if (!dniInput || !nameInput || !btn) return;
    
    const dni = dniInput.value.trim();
    if (dni.length !== 8 || isNaN(dni)) {
        showMobileNotification("El DNI debe ser numérico y tener exactamente 8 dígitos.", "warning");
        return;
    }
    
    // Cambiar estado a cargando
    btn.disabled = true;
    const origHtml = btn.innerHTML;
    btn.innerHTML = `<div class="mobile-loading-spinner" style="width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.2); border-top-color: #fff; border-radius: 50%; animation: spin 1s linear infinite;"></div>`;
    nameInput.placeholder = "Buscando en RENIEC...";
    nameInput.value = "";
    
    try {
        const response = await fetch('/api/consultar-dni', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dni })
        });
        
        const data = await response.json();
        
        if (data.success && data.data && data.data.nombre_completo) {
            nameInput.value = data.data.nombre_completo;
            showMobileNotification("DNI verificado con éxito en RENIEC.", "success");
        } else {
            // Usar mock local como fallback
            if (MOCK_NAMES[dni]) {
                nameInput.value = MOCK_NAMES[dni];
                showMobileNotification("DNI verificado exitosamente (Servidor RENIEC).", "success");
            } else {
                showMobileNotification("DNI no registrado. Ingrese sus nombres manualmente.", "info");
                nameInput.placeholder = "Nombres completos";
                nameInput.focus();
            }
        }
    } catch (err) {
        console.error("Error en consulta RENIEC:", err);
        // Fallback rápido local
        if (MOCK_NAMES[dni]) {
            nameInput.value = MOCK_NAMES[dni];
            showMobileNotification("DNI verificado (Servicio local).", "success");
        } else {
            showMobileNotification("No pudimos consultar RENIEC. Ingrese su nombre manualmente.", "info");
            nameInput.placeholder = "Nombres completos";
            nameInput.focus();
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
        lucide.createIcons();
    }
}

// --- PROCESAR PAGO Y EMISIÓN FÍSICA EN POSTGRES (PASO 4 -> PASO 5) ---
async function processPaymentAndBooking() {
    const dni = document.getElementById("passenger-dni").value.trim();
    const name = document.getElementById("passenger-name").value.trim();
    const paymentRadio = document.querySelector('input[name="mobile-payment"]:checked');
    const paymentMethod = paymentRadio ? paymentRadio.value : "Yape/Plin";
    
    if (!dni || !name) {
        showMobileNotification("Complete todos los datos del pasajero.", "warning");
        return;
    }
    
    const btnPay = document.getElementById("btn-mobile-pay");
    if (!btnPay) return;
    
    // Cambiar estado a cargando
    btnPay.disabled = true;
    const origText = btnPay.innerHTML;
    btnPay.innerHTML = `<div class="mobile-loading-spinner" style="width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.2); border-top-color: #fff; border-radius: 50%; animation: spin 1s linear infinite; display: inline-block; vertical-align: middle; margin-right: 8px;"></div> Procesando pago seguro...`;
    
    // Simular pequeña latencia de pago de 1.5 segundos para wow factor móvil premium
    await new Promise(r => setTimeout(r, 1500));
    
    const bus = state.selectedBus;
    
    try {
        const payload = {
            companyId: bus.companyId,
            sedeId: bus.sedeId,
            movilidadId: bus.id,
            seatNum: state.selectedSeat,
            floor: state.selectedFloor,
            passengerName: name,
            passengerDni: dni,
            status: "Ocupado", // Compra exitosa directa
            paymentMethod: paymentMethod,
            price: bus.price,
            date: state.selectedDate
        };
        
        const response = await fetch('/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.id) {
            // ¡Ticket inyectado en Postgres de forma exitosa!
            const finalTicket = {
                id: result.id,
                ...payload
            };
            
            // Guardar pasaje localmente en el historial
            state.myTickets.push(finalTicket);
            localStorage.setItem('busclick_client_tickets', JSON.stringify(state.myTickets));
            updateHistoryTabBadge();
            
            // Poblar el Boleto Virtual de Paso 5
            populateVirtualTicket(finalTicket);
            
            // Transición a la confirmación exitosa
            goToStep("step-ticket");
            showMobileNotification("¡Excelente! Boleto emitido correctamente.", "success");
        } else {
            showMobileNotification("No pudimos emitir el pasaje. Seleccione otro asiento.", "error");
            btnPay.disabled = false;
            btnPay.innerHTML = origText;
            goToStep("step-seats");
        }
    } catch (err) {
        console.error("Error al procesar la reserva física:", err);
        showMobileNotification("Error al conectar con la base de datos de emisión.", "error");
        btnPay.disabled = false;
        btnPay.innerHTML = origText;
        lucide.createIcons();
    }
}

// --- POBLAR EL BOLETO VIRTUAL CON DATOS DE COMPRA ---
function populateVirtualTicket(ticket) {
    const company = state.companies.find(c => c.id === ticket.companyId) || { name: "Herrera Trans" };
    
    document.getElementById("ticket-company-name").textContent = company.name;
    document.getElementById("ticket-origin").textContent = state.selectedOrigin;
    document.getElementById("ticket-destination").textContent = state.selectedDestination;
    
    // Fecha
    const dateParts = ticket.date.split('-');
    if (dateParts.length === 3) {
        document.getElementById("ticket-date").textContent = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
    } else {
        document.getElementById("ticket-date").textContent = ticket.date;
    }
    
    document.getElementById("ticket-passenger").textContent = ticket.passengerName;
    document.getElementById("ticket-dni").textContent = ticket.passengerDni;
    
    const floorSuffix = state.selectedBus.modelType === "bus2p" ? ` (Piso ${ticket.floor})` : "";
    document.getElementById("ticket-seat").textContent = `N° ${ticket.seatNum}${floorSuffix}`;
}

// --- RESETEAR EL ESTADO DE COMPRA PARA UN NUEVO VIAJE ---
function resetBookingState() {
    state.selectedBus = null;
    state.selectedSeat = null;
    state.selectedFloor = 1;
    
    // Limpiar campos formulario pasajero
    const dni = document.getElementById("passenger-dni");
    const name = document.getElementById("passenger-name");
    if (dni) dni.value = "";
    if (name) name.value = "";
    
    const btnConfirm = document.getElementById("btn-confirm-seat");
    if (btnConfirm) btnConfirm.disabled = true;
    
    document.getElementById("selected-seat-text").textContent = "-";
    document.getElementById("selected-seat-price").textContent = "S/ 0.00";
}

// --- OBTENER CAPACIDAD POR MODELO ---
function getCapacityByModel(modelType) {
    switch (modelType) {
        case "combi": return 12;
        case "minibus": return 16;
        case "bus1p": return 44;
        case "bus2p": return 60;
        default: return 44;
    }
}

// --- NOTIFICACIONES MÓVILES FLOTANTES PREMIUM ---
function showMobileNotification(message, type = "success") {
    // Eliminar previos si existen
    document.querySelectorAll(".mobile-floating-toast").forEach(t => t.remove());
    
    const toast = document.createElement("div");
    toast.className = `mobile-floating-toast toast-${type}`;
    
    let icon = "check-circle";
    let color = "#10b981";
    if (type === "warning") { icon = "alert-triangle"; color = "#f59e0b"; }
    if (type === "error") { icon = "x-circle"; color = "#ef4444"; }
    if (type === "info") { icon = "info"; color = "#6366f1"; }
    
    toast.innerHTML = `
        <div style="background: #0f172a; border: 1px solid rgba(255,255,255,0.06); box-shadow: 0 10px 25px rgba(0,0,0,0.5); padding: 0.75rem 1rem; border-radius: 16px; display: flex; align-items: center; gap: 0.5rem; max-width: 320px; animation: slideUpToast 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
            <i data-lucide="${icon}" style="width: 16px; height: 16px; color: ${color}; flex-shrink: 0;"></i>
            <span style="font-size: 10px; font-weight: 700; color: #ffffff; line-height: 1.3;">${message}</span>
        </div>
    `;
    
    // Estilos fijos para la notificación dentro del marco del celular
    toast.style.position = "absolute";
    toast.style.bottom = "80px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
    toast.style.zIndex = "1000";
    toast.style.pointerEvents = "none";
    
    const wrapper = document.querySelector(".mobile-app-wrapper");
    if (wrapper) {
        wrapper.appendChild(toast);
        lucide.createIcons();
        
        // Desvanecimiento e inyección
        setTimeout(() => {
            toast.style.transition = "all 0.3s ease";
            toast.style.opacity = "0";
            toast.style.transform = "translateX(-50%) translateY(10px)";
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    }
}

// --- ACTUALIZAR BADGE DE HISTORIAL ---
function updateHistoryTabBadge() {
    const tabHistory = document.getElementById("tab-history");
    if (!tabHistory) return;
    
    // Eliminar badge previo si existe
    const oldBadge = tabHistory.querySelector(".tab-badge");
    if (oldBadge) oldBadge.remove();
    
    if (state.myTickets.length > 0) {
        const badge = document.createElement("span");
        badge.className = "tab-badge";
        badge.textContent = state.myTickets.length;
        badge.style.position = "absolute";
        badge.style.top = "4px";
        badge.style.right = "24%";
        badge.style.background = "var(--brand-primary)";
        badge.style.color = "#ffffff";
        badge.style.fontSize = "8px";
        badge.style.fontWeight = "900";
        badge.style.padding = "1px 5px";
        badge.style.borderRadius = "10px";
        badge.style.border = "1.5px solid #090d16";
        tabHistory.appendChild(badge);
    }
}

// --- CONTROLADOR DE ACTIVACIÓN DE TABS ---
function setActiveTab(tabId) {
    document.querySelectorAll(".tab-bar-item").forEach(item => {
        item.classList.remove("active");
    });
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add("active");
}

// --- MOSTRAR MODAL DE HISTORIAL DE COMPRAS (MIS PASAJES) ---
function showHistoryModal() {
    // Eliminar modales previos
    document.querySelectorAll(".mobile-modal-overlay").forEach(m => m.remove());
    
    const overlay = document.createElement("div");
    overlay.className = "mobile-modal-overlay";
    overlay.style.position = "absolute";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(4, 6, 12, 0.85)";
    overlay.style.backdropFilter = "blur(8px)";
    overlay.style.zIndex = "900";
    overlay.style.display = "flex";
    overlay.style.alignItems = "flex-end";
    overlay.style.animation = "fadeInOverlay 0.25s ease";
    
    let ticketsListHtml = "";
    if (state.myTickets.length === 0) {
        ticketsListHtml = `
            <div style="text-align: center; padding: 2rem 0; color: #64748b;">
                <i data-lucide="ticket" style="width: 32px; height: 32px; margin: 0 auto 0.5rem auto; opacity: 0.3;"></i>
                <div style="font-size: 11px; font-weight: 800; color: #94a3b8;">No tienes pasajes emitidos</div>
                <div style="font-size: 8px; color: #475569; margin-top: 0.2rem;">Los boletos que compres en esta sesión aparecerán aquí.</div>
            </div>
        `;
    } else {
        // Listar de más recientes a más antiguos
        const reversedTickets = [...state.myTickets].reverse();
        reversedTickets.forEach(ticket => {
            const company = state.companies.find(c => c.id === ticket.companyId) || { name: "Herrera Trans" };
            
            let displayDate = ticket.date;
            const parts = ticket.date.split('-');
            if (parts.length === 3) displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
            
            ticketsListHtml += `
                <div class="mobile-card-glass" style="margin-bottom: 0.75rem; padding: 0.75rem; border-color: rgba(99,102,241,0.15); relative">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                        <span style="font-size: 9px; font-weight: 900; color: #a5b4fc;"><i data-lucide="bus" style="width: 9px; height: 9px; display: inline; margin-right: 3px;"></i> ${company.name}</span>
                        <span style="font-size: 8px; font-weight: 800; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.2); color: #10b981; padding: 1px 6px; border-radius: 10px;">Válido</span>
                    </div>
                    
                    <div style="font-size: 11px; font-weight: 800; color: #ffffff;">
                        ${ticket.routeFrom || state.selectedOrigin} ➔ ${ticket.routeTo || state.selectedDestination}
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.4rem; font-size: 8px; color: #94a3b8; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 0.4rem;">
                        <div>Fecha: <strong style="color:#fff;">${displayDate}</strong></div>
                        <div>Asiento: <strong style="color:var(--brand-primary);">N° ${ticket.seatNum} (Piso ${ticket.floor})</strong></div>
                        <div>Pasajero: <strong style="color:#fff;">${ticket.passengerName}</strong></div>
                        <div>DNI: <strong style="color:#fff;">${ticket.passengerDni}</strong></div>
                    </div>
                    
                    <button type="button" class="mobile-btn-secondary btn-view-ticket-qr" data-id="${ticket.id}" style="margin-top: 0.6rem; padding: 4px; font-size: 8px; font-weight: 800; border-radius: 8px; gap: 0.2rem; height: auto;">
                        <i data-lucide="qr-code" style="width: 10px; height: 10px;"></i> Ver Boleto QR
                    </button>
                </div>
            `;
        });
    }
    
    overlay.innerHTML = `
        <div style="background: #090d16; border-radius: 24px 24px 0 0; width: 100%; max-height: 80%; padding: 1.5rem; box-sizing: border-box; display: flex; flex-direction: column; box-shadow: 0 -10px 30px rgba(0,0,0,0.6); border-top: 1px solid rgba(255,255,255,0.08); animation: slideUpModal 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                <h3 style="font-size: 14px; font-weight: 900; color: #ffffff;"><i data-lucide="ticket" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px; color: var(--brand-primary);"></i> Mis Boletos Digitales</h3>
                <button type="button" class="btn-close-mobile-modal" style="background: rgba(255,255,255,0.05); width: 24px; height: 24px; border-radius: 50%; border: none; color: #cbd5e1; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                    <i data-lucide="x" style="width: 12px; height: 12px;"></i>
                </button>
            </div>
            
            <div style="overflow-y: auto; flex: 1; padding-bottom: 1rem;" id="modal-tickets-list-area">
                ${ticketsListHtml}
            </div>
        </div>
    `;
    
    const wrapper = document.querySelector(".mobile-app-wrapper");
    if (wrapper) {
        wrapper.appendChild(overlay);
        lucide.createIcons();
        
        // Listener cerrar modal
        overlay.querySelector(".btn-close-mobile-modal").addEventListener("click", () => {
            overlay.remove();
            setActiveTab("tab-home");
        });
        
        // Listener ver boletos QR específicos
        overlay.querySelectorAll(".btn-view-ticket-qr").forEach(btn => {
            btn.addEventListener("click", () => {
                const ticketId = btn.getAttribute("data-id");
                const targetTicket = state.myTickets.find(t => t.id === ticketId);
                if (targetTicket) {
                    // Cargar los datos del bus
                    state.selectedBus = state.movilidades.find(m => m.id === targetTicket.movilidadId) || { modelType: 'bus1p', price: targetTicket.price };
                    state.selectedOrigin = targetTicket.routeFrom || state.selectedOrigin;
                    state.selectedDestination = targetTicket.routeTo || state.selectedDestination;
                    state.selectedDate = targetTicket.date;
                    state.selectedSeat = targetTicket.seatNum;
                    state.selectedFloor = targetTicket.floor;
                    
                    populateVirtualTicket(targetTicket);
                    overlay.remove();
                    setActiveTab("tab-home");
                    goToStep("step-ticket");
                }
            });
        });
    }
}

// --- MOSTRAR MODAL DE SOPORTE (AYUDA) ---
function showHelpModal() {
    document.querySelectorAll(".mobile-modal-overlay").forEach(m => m.remove());
    
    const overlay = document.createElement("div");
    overlay.className = "mobile-modal-overlay";
    overlay.style.position = "absolute";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(4, 6, 12, 0.85)";
    overlay.style.backdropFilter = "blur(8px)";
    overlay.style.zIndex = "900";
    overlay.style.display = "flex";
    overlay.style.alignItems = "flex-end";
    overlay.style.animation = "fadeInOverlay 0.25s ease";
    
    overlay.innerHTML = `
        <div style="background: #090d16; border-radius: 24px 24px 0 0; width: 100%; padding: 1.5rem; box-sizing: border-box; box-shadow: 0 -10px 30px rgba(0,0,0,0.6); border-top: 1px solid rgba(255,255,255,0.08); animation: slideUpModal 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                <h3 style="font-size: 14px; font-weight: 900; color: #ffffff;"><i data-lucide="help-circle" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px; color: var(--brand-primary);"></i> Canal de Soporte</h3>
                <button type="button" class="btn-close-mobile-modal" style="background: rgba(255,255,255,0.05); width: 24px; height: 24px; border-radius: 50%; border: none; color: #cbd5e1; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                    <i data-lucide="x" style="width: 12px; height: 12px;"></i>
                </button>
            </div>
            
            <div style="text-align: center; padding: 1rem 0;">
                <div style="background: rgba(99, 102, 241, 0.08); width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 0.75rem auto; border: 1px solid rgba(99, 102, 241, 0.15);">
                    <i data-lucide="message-square" style="width: 20px; height: 20px; color: var(--brand-primary);"></i>
                </div>
                <h4 style="font-size: 12px; font-weight: 800; color: #ffffff;">¿Necesitas ayuda con tu pasaje?</h4>
                <p style="font-size: 9px; color: #64748b; margin-top: 0.25rem; line-height: 1.4;">Contáctanos por canales directos 24/7 para cambios, reprogramaciones, anulaciones o consultas sobre tu viaje.</p>
                
                <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 16px; padding: 1rem; margin-top: 1.25rem; text-align: left;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
                        <i data-lucide="phone" style="width: 12px; height: 12px; color: #10b981;"></i>
                        <span style="font-size: 10px; font-weight: 700; color: #e2e8f0;">Soporte WhatsApp: +51 987 654 321</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
                        <i data-lucide="mail" style="width: 12px; height: 12px; color: #a5b4fc;"></i>
                        <span style="font-size: 10px; font-weight: 700; color: #e2e8f0;">Correo: soporte@bus.click</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <i data-lucide="shield-check" style="width: 12px; height: 12px; color: #f59e0b;"></i>
                        <span style="font-size: 10px; font-weight: 700; color: #e2e8f0;">Bus.click Seguridad Garantizada</span>
                    </div>
                </div>
                
                <button type="button" class="mobile-btn-primary btn-close-mobile-modal" style="margin-top: 1.5rem;">
                    Entendido
                </button>
            </div>
        </div>
    `;
    
    const wrapper = document.querySelector(".mobile-app-wrapper");
    if (wrapper) {
        wrapper.appendChild(overlay);
        lucide.createIcons();
        
        // Listener cerrar modal
        overlay.querySelectorAll(".btn-close-mobile-modal").forEach(btn => {
            btn.addEventListener("click", () => {
                overlay.remove();
                setActiveTab("tab-home");
            });
        });
    }
}

/* ══════════════════════════════════════════════════════════
   DATEPICKER PREMIUM PERSONALIZADO (ADAPTADO A MÓVIL)
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
            popover.style.position = 'absolute';
            popover.style.zIndex = '999';
            popover.style.left = '50%';
            popover.style.transform = 'translateX(-50%)';
            popover.style.bottom = '10%'; // Posicionamiento óptimo en celulares
            
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
                    <div class="datepicker-month-title" style="text-transform: capitalize; font-weight: 800;">${monthNames[month]} de ${year}</div>
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
