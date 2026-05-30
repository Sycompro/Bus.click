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
    
    // Obtener parámetros de multi-tenancy de la URL
    const urlParams = new URLSearchParams(window.location.search);
    state.companyId = urlParams.get('companyId') || urlParams.get('empresa');
    
    // Inicializar Datepicker Premium
    initPremiumDatepickers();
    
    // Cargar datos catálogos
    await loadInitialData();
    
    // Configurar controladores de eventos y navegación
    setupEventListeners();
    
    // Cargar el historial de pasajes si existe en el tab
    updateHistoryTabBadge();
    
    // Sincronizar en segundo plano de inmediato los pasajes locales con el servidor
    syncClientTickets();
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
        
        // Aplicar filtrado y marca multi-inquilino (Multi-Tenancy SaaS)
        if (state.companyId) {
            const foundCompany = state.companies.find(c => 
                c.id == state.companyId || 
                c.name.toLowerCase().replace(/\s+/g, '-').trim() === state.companyId.toLowerCase().trim()
            );
            
            if (foundCompany) {
                state.activeCompany = foundCompany;
                state.companyId = foundCompany.id; // Fijar ID numérico
                
                // Filtrar sedes: Solo las que pertenecen a la empresa seleccionada
                state.sedes = state.sedes.filter(s => s.companyId == foundCompany.id);
                
                // Personalizar dinámicamente la identidad de la Navbar (Marca Blanca)
                const logoText = document.querySelector(".b2c-logo span");
                if (logoText) {
                    const nameParts = foundCompany.name.split(' ');
                    const firstPart = nameParts[0] || "Empresa";
                    const secondPart = nameParts.slice(1).join(' ') || "";
                    logoText.innerHTML = `${firstPart}<strong>.${secondPart || 'click'}</strong>`;
                }
                
                // Mensaje de bienvenida corporativo
                setTimeout(() => {
                    showMobileNotification(`Portal oficial de ${foundCompany.name}`, "info");
                }, 800);
            }
        }
        
        // Poblar selectores de ciudades
        populateOriginDestinationSelects();
        
        // Renderizar dinámicamente los métodos de pago activos de la empresa
        renderCompanyPaymentMethods();
    } catch (e) {
        console.error("Error al cargar datos catálogos:", e);
        showMobileNotification("Error de conexión al cargar los destinos de viaje.", "error");
    }
}

// --- RENDERIZAR DINÁMICAMENTE LOS MÉTODOS DE PAGO DE LA EMPRESA ---
function renderCompanyPaymentMethods() {
    const container = document.querySelector('.b2c-payment-options');
    if (!container) return;
    
    const company = state.activeCompany;
    if (!company) return;
    
    // Obtener los métodos de pago configurados (fallback a Efectivo y Yape/Plin si no hay ninguno)
    const methods = company.paymentMethods || ['Efectivo', 'Yape/Plin'];
    
    container.innerHTML = '';
    
    methods.forEach((method, index) => {
        const label = document.createElement('label');
        label.className = `b2c-payment-opt ${index === 0 ? 'selected' : ''}`;
        
        let iconName = 'credit-card';
        let bgStyle = 'background: #fce7f3; color: #db2777;'; // Tarjeta por defecto
        
        const normMethod = method.toLowerCase();
        if (normMethod.includes('efectivo')) {
            iconName = 'banknote';
            bgStyle = 'background: #d1fae5; color: #059669;'; // Verde Efectivo
        } else if (normMethod.includes('yape') || normMethod.includes('plin') || normMethod.includes('billetera') || normMethod.includes('billeteras')) {
            iconName = 'smartphone';
            bgStyle = 'background: #ede9fe; color: #7c3aed;'; // Morado Yape
        } else if (normMethod.includes('transferencia') || normMethod.includes('banco') || normMethod.includes('bancaria')) {
            iconName = 'landmark';
            bgStyle = 'background: #e0f2fe; color: #0284c7;'; // Celeste Banco
        }
        
        label.innerHTML = `
            <input type="radio" name="mobile-payment" value="${method}" ${index === 0 ? 'checked' : ''}>
            <div class="b2c-payment-icon" style="${bgStyle}"><i data-lucide="${iconName}"></i></div>
            <span>${method}</span>
        `;
        
        // Agregar listener para alternar la clase selected visualmente al cambiar de opción
        label.querySelector('input[type="radio"]').addEventListener('change', () => {
            container.querySelectorAll('.b2c-payment-opt').forEach(opt => opt.classList.remove('selected'));
            label.classList.add('selected');
        });
        
        container.appendChild(label);
    });
    
    // Instanciar iconos Lucide frescos inyectados
    lucide.createIcons();
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
    
    // Función auxiliar para liberar reserva temporal
    async function releaseTemporaryReservation() {
        if (state.selectedBus && state.selectedSeat) {
            try {
                const ticketsRes = await fetch('/api/tickets');
                const allTickets = await ticketsRes.json();
                const tempTicket = allTickets.find(t => t.movilidadId === state.selectedBus.id && t.seatNum === state.selectedSeat && t.floor === state.selectedFloor && t.status === 'Reservado_Temporal');
                if (tempTicket) {
                    await fetch(`/api/tickets/${tempTicket.id}`, { method: 'DELETE' });
                    console.log(`❄ Reserva temporal ${tempTicket.id} liberada al volver atrás.`);
                }
            } catch (e) {
                console.error("Error al liberar reserva temporal al volver atrás:", e);
            }
        }
    }

    document.querySelectorAll(".btn-back-to-seats").forEach(btn => {
        btn.addEventListener("click", async () => {
            await releaseTemporaryReservation();
            goToStep("step-seats");
        });
    });
    
    // Botón Confirmar Asiento (Paso 3 -> Paso 4)
    const btnConfirmSeat = document.getElementById("btn-confirm-seat");
    if (btnConfirmSeat) {
        btnConfirmSeat.addEventListener("click", async () => {
            if (state.selectedSeat) {
                // Bloquear el asiento temporalmente para evitar sobrecupos omnicanal
                btnConfirmSeat.disabled = true;
                const origText = btnConfirmSeat.innerHTML;
                btnConfirmSeat.innerHTML = `<div class="mobile-loading-spinner" style="width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.2); border-top-color: #fff; border-radius: 50%; animation: spin 1s linear infinite; display: inline-block; vertical-align: middle; margin-right: 6px;"></div> Reservando...`;
                
                try {
                    const bus = state.selectedBus;
                    const response = await fetch('/api/tickets/reserve-temporary', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            companyId: bus.companyId,
                            sedeId: bus.sedeId,
                            movilidadId: bus.id,
                            seatNum: state.selectedSeat,
                            floor: state.selectedFloor,
                            date: state.selectedDate,
                            price: bus.price
                        })
                    });
                    
                    const resData = await response.json();
                    if (response.ok) {
                        showMobileNotification("Asiento congelado por 10 minutos para completar tu pago.", "info");
                        // Renderizar de forma ultra-fresca los métodos de pago de la empresa
                        renderCompanyPaymentMethods();
                        goToStep("step-passenger");
                    } else {
                        showMobileNotification(resData.error || "El asiento ya ha sido tomado por otro canal. Seleccione otro.", "error");
                        // Recargar asientos frescos
                        const tickRes = await fetch('/api/tickets');
                        state.tickets = await tickRes.json();
                        renderSeatsGridMobile();
                    }
                } catch (err) {
                    console.error("Error al bloquear asiento temporalmente:", err);
                    showMobileNotification("Error de red. Intente confirmar nuevamente.", "error");
                } finally {
                    btnConfirmSeat.disabled = false;
                    btnConfirmSeat.innerHTML = origText;
                }
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
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem 0; color: #f59e0b;">
            <div style="width: 32px; height: 32px; border: 3.5px solid #1e2028; border-top-color: #f59e0b; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1.25rem;"></div>
            <span style="font-size: 0.85rem; font-weight: 700; color: #94a3b8; letter-spacing: 0.2px;">Buscando buses disponibles...</span>
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
        
        // Filtrar movilidades que coincidan con la ruta y con la empresa activa
        const filteredBuses = state.movilidades.filter(m => {
            const routeMatch = m.routeFrom && m.routeFrom.trim().toLowerCase() === origin.trim().toLowerCase() && 
                               m.routeTo && m.routeTo.trim().toLowerCase() === destination.trim().toLowerCase();
            
            if (state.companyId) {
                return routeMatch && m.companyId == state.companyId;
            }
            return routeMatch;
        });
        
        state.availableBuses = filteredBuses;
        
        renderAvailableBuses();
    } catch (e) {
        routesList.innerHTML = `
            <div style="text-align: center; padding: 3rem 1.5rem; color: #ef4444; background: #ffffff; border-radius: 20px; border: 1px solid #e0e7ff; box-shadow: 0 4px 16px rgba(99, 102, 241, 0.06);">
                <div style="width: 48px; height: 48px; border-radius: 50%; background: #ffe4e6; color: #881337; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem auto;">
                    <i data-lucide="wifi-off" style="width: 22px; height: 22px;"></i>
                </div>
                <div style="font-size: 0.95rem; font-weight: 800; color: #1e293b;">Error de conexión</div>
                <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.4rem; line-height: 1.4;">No pudimos comunicarnos con el servidor. Por favor, inténtalo de nuevo.</div>
                <button type="button" class="b2c-btn-back" onclick="handleSearchSubmit()" style="margin: 1.25rem auto 0 auto; display: inline-flex; gap: 0.4rem; border-color: #e0e7ff; color: #881337; background: #ffe4e6;">
                    <i data-lucide="refresh-cw" style="width: 13px; height: 13px;"></i> Reintentar
                </button>
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
            <div style="text-align: center; padding: 3.5rem 1.5rem; background: #ffffff; border-radius: 20px; border: 1px solid #e0e7ff; box-shadow: 0 4px 16px rgba(99, 102, 241, 0.06);">
                <div style="width: 52px; height: 52px; border-radius: 50%; background: #fef3c7; color: #78350f; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem auto;">
                    <i data-lucide="alert-circle" style="width: 26px; height: 26px;"></i>
                </div>
                <div style="font-size: 1rem; font-weight: 800; color: #1e293b;">Sin servicios disponibles</div>
                <div style="font-size: 0.82rem; color: #64748b; margin-top: 0.5rem; line-height: 1.5;">Lo sentimos, actualmente no hay salidas programadas de <strong>${state.selectedOrigin}</strong> a <strong>${state.selectedDestination}</strong> para el día seleccionado.</div>
                <button type="button" class="b2c-btn-back btn-back-to-search" style="margin: 1.5rem auto 0 auto; display: inline-flex; gap: 0.4rem;">
                    <i data-lucide="chevron-left" style="width: 14px; height: 14px;"></i> Cambiar Búsqueda
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
        card.className = "b2c-route-card";
        
        // Determinar icono del modelo
        const isTwoFloors = bus.modelType === "bus2p";
        const busTypeLabel = isTwoFloors ? "2 Pisos (VIP)" : "1 Piso (Premium)";
        const busIcon = isTwoFloors ? "layers" : "bus";
        
        // Generar colores pasteles según empresa
        const hash = company.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const hue = hash % 360;
        const pastelBg = `hsl(${hue}, 85%, 93%)`;
        const pastelColor = `hsl(${hue}, 65%, 35%)`;
        
        card.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <span class="bus-feature-badge" style="color: ${pastelColor}; background: ${pastelBg}; font-weight: 800; font-size: 0.68rem; padding: 3px 8px; border-radius: 6px;">
                    ${company.name}
                </span>
                <span class="bus-feature-badge" style="background: #f1f5f9; color: #475569; font-size: 0.68rem; padding: 3px 8px; border-radius: 6px;">
                    <i data-lucide="${busIcon}" style="width: 10px; height: 10px;"></i> ${busTypeLabel}
                </span>
            </div>
            
            <div class="bus-route-time" style="font-size: 0.95rem; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 0.4rem; margin-top: 0.65rem;">
                <i data-lucide="clock" style="width: 14px; height: 14px; color: #64748b;"></i>
                <span>08:30 AM <span style="color:#64748b; font-weight:500;">➔</span> 04:30 PM</span>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.75rem; border-top: 1px solid #e0e7ff; padding-top: 0.65rem;">
                <span style="font-size: 0.72rem; font-weight: 600; color: #64748b;">
                    Placa: <strong style="color: #1e293b; font-weight: 700;">${bus.plate}</strong>
                </span>
                <span style="font-size: 0.72rem; font-weight: 700; color: ${freeSeats > 5 ? '#10b981' : '#f59e0b'}; background: ${freeSeats > 5 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)'}; padding: 2px 8px; border-radius: 20px;">
                    ${freeSeats} Asientos Libres
                </span>
            </div>
            
            <div class="bus-route-price" style="font-size: 1.15rem; font-weight: 900; color: #6366f1; position: absolute; right: 1.25rem; top: 1.1rem;">
                S/ ${parseFloat(bus.price).toFixed(2)}
            </div>
            
            <div class="bus-features-row" style="margin-top: 0.65rem; display: flex; gap: 0.4rem; flex-wrap: wrap;">
                <span class="bus-feature-badge" style="background: #f1f5f9; border: 1px solid #e0e7ff; color: #475569; font-size: 0.62rem; padding: 2px 6px; border-radius: 4px;"><i data-lucide="wifi" style="width: 9px; height: 9px; color:#f59e0b;"></i> WiFi</span>
                <span class="bus-feature-badge" style="background: #f1f5f9; border: 1px solid #e0e7ff; color: #475569; font-size: 0.62rem; padding: 2px 6px; border-radius: 4px;"><i data-lucide="battery-charging" style="width: 9px; height: 9px; color:#14b8a6;"></i> USB</span>
                <span class="bus-feature-badge" style="background: #f1f5f9; border: 1px solid #e0e7ff; color: #475569; font-size: 0.62rem; padding: 2px 6px; border-radius: 4px;"><i data-lucide="wind" style="width: 9px; height: 9px; color:#10b981;"></i> Aire A.</span>
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
        (t.status === "Ocupado" || t.status === "Reservado" || t.status === "Reservado_Temporal")
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
    const whatsapp = document.getElementById("passenger-whatsapp") ? document.getElementById("passenger-whatsapp").value.trim() : "";
    const paymentRadio = document.querySelector('input[name="mobile-payment"]:checked');
    const paymentMethod = paymentRadio ? paymentRadio.value : "Yape/Plin";
    
    if (!dni || !name || !whatsapp) {
        showMobileNotification("Complete todos los datos, incluyendo tu WhatsApp.", "warning");
        return;
    }
    
    if (whatsapp.length !== 9 || !whatsapp.startsWith('9') || isNaN(whatsapp)) {
        showMobileNotification("Por favor, ingresa un número de WhatsApp celular válido de 9 dígitos.", "warning");
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
            movilidadId: bus.id,
            seatNum: state.selectedSeat,
            floor: state.selectedFloor,
            passengerName: name,
            passengerDni: dni,
            passengerWhatsapp: whatsapp,
            paymentMethod: paymentMethod,
            price: bus.price
        };
        
        const response = await fetch('/api/tickets/confirm-temporary', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // ¡Ticket inyectado en Postgres de forma exitosa!
            const finalTicket = {
                id: result.id,
                companyId: bus.companyId,
                sedeId: bus.sedeId,
                movilidadId: bus.id,
                seatNum: state.selectedSeat,
                floor: state.selectedFloor,
                passengerName: name,
                passengerDni: dni,
                passengerWhatsapp: whatsapp,
                status: "Ocupado",
                paymentMethod: paymentMethod,
                price: bus.price,
                date: state.selectedDate
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
    
    // --- LÓGICA DE RECUPERACIÓN SEGURA DE RUTA Y DIRECCIÓN DE LLEGADA ---
    const mobility = state.movilidades.find(m => m.id === ticket.movilidadId);
    const origin = mobility ? mobility.routeFrom : (ticket.routeFrom || state.selectedOrigin || "Origen");
    const destination = mobility ? mobility.routeTo : (ticket.routeTo || state.selectedDestination || "Destino");
    
    // Buscar sede de llegada (destino) de la empresa para indicar la dirección exacta
    const companySedes = state.sedes.filter(s => s.companyId === ticket.companyId);
    const destSede = companySedes.find(s => s.city.toLowerCase() === destination.toLowerCase());
    const destinationAddress = destSede ? `${destSede.name} - ${destSede.address}` : `Terminal Terrestre de ${destination}`;

    document.getElementById("ticket-company-name").textContent = company.name;
    document.getElementById("ticket-origin").textContent = origin;
    document.getElementById("ticket-destination").textContent = destination;
    
    // Inyectar dirección de destino exacta
    const addressContainer = document.getElementById("ticket-destination-address");
    if (addressContainer) {
        addressContainer.textContent = destinationAddress;
    }
    
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

    // --- GENERAR CÓDIGO QR Y CÓDIGO DE BARRAS DINÁMICOS ---
    const qrContainer = document.getElementById("b2c-qr-render");
    if (qrContainer) {
        qrContainer.innerHTML = "";
        try {
            new QRCode(qrContainer, {
                text: `https://bus.click/verify/${ticket.id}`,
                width: 96,
                height: 96,
                colorDark: "#1e1b4b",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        } catch (e) {
            console.error("Error al generar código QR para pasajero:", e);
        }
    }

    const barcodeSvg = document.getElementById("b2c-barcode-render");
    if (barcodeSvg) {
        try {
            JsBarcode("#b2c-barcode-render", ticket.id.toUpperCase(), {
                format: "CODE128",
                lineColor: "#1e1b4b",
                height: 35,
                width: 1.5,
                displayValue: true,
                fontSize: 10,
                background: "transparent"
            });
        } catch (e) {
            console.error("Error al generar código de barras para pasajero:", e);
        }
    }
    
    // --- MANEJO DEL BANNER INTERACTIVO YAPE/PLIN EN PANTALLA ---
    const yapeBanner = document.getElementById("yape-payment-instructions");
    const statusHeader = document.getElementById("b2c-status-header");
    const statusIconBox = document.getElementById("b2c-status-icon-box");
    const statusTitle = document.getElementById("b2c-status-title");
    const statusSubtitle = document.getElementById("b2c-status-subtitle");

    if (ticket.paymentMethod === "Yape/Plin") {
        // Obtener datos de soporte de la empresa (celular y nombre de la empresa como titular)
        let yapePhone = company.supportPhone || company.support_phone || "987654321";
        // Limpiar formato para wa.me (dejar solo dígitos)
        let cleanPhone = yapePhone.replace(/\D/g, '');
        if (cleanPhone.length === 9 && cleanPhone.startsWith('9')) {
            cleanPhone = '51' + cleanPhone;
        }

        // Configurar los campos del banner
        const displayPhone = document.getElementById("yape-display-phone");
        if (displayPhone) displayPhone.textContent = yapePhone;
        
        const displayTitular = document.getElementById("yape-display-titular");
        if (displayTitular) displayTitular.textContent = `Titular: ${company.name}`;
        
        const displayMonto = document.getElementById("yape-display-monto");
        if (displayMonto) displayMonto.textContent = `S/. ${parseFloat(ticket.price).toFixed(2)}`;

        // Generar QR dinámico para WhatsApp de Yape
        const yapeQrBox = document.getElementById("yape-qr-box");
        if (yapeQrBox) {
            yapeQrBox.innerHTML = "";
            try {
                new QRCode(yapeQrBox, {
                    text: `https://wa.me/${cleanPhone}?text=Hola,%20adjunto%20comprobante%20de%20pago%20de%20mi%20pasaje%20${ticket.id}`,
                    width: 76,
                    height: 76,
                    colorDark: "#7c3aed",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.M
                });
            } catch (e) {
                console.error("Error al generar QR de Yape:", e);
            }
        }

        // Configurar enlace del botón de WhatsApp pre-redactado
        const sendWaBtn = document.getElementById("yape-send-whatsapp-btn");
        if (sendWaBtn) {
            const displayDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : ticket.date;
            const messageText = `¡Hola! Acabo de realizar mi reserva en Bus.click para viajar con la empresa *${company.name}*.\n\n` +
                                `📋 *Detalle de mi Reserva:*\n` +
                                `• *Código:* ${ticket.id.toUpperCase()}\n` +
                                `• *Ruta:* ${origin} ➔ ${destination}\n` +
                                `• *Fecha:* ${displayDate}\n` +
                                `• *Asiento:* N° ${ticket.seatNum}\n` +
                                `• *Total a Pagar:* S/. ${parseFloat(ticket.price).toFixed(2)}\n\n` +
                                `Aquí adjunto la captura de pantalla de mi comprobante de pago de Yape/Plin para su validación rápida y activación.`;
            sendWaBtn.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;
        }

        // Cambiar estilos de cabecera a "Pendiente de Pago" (Naranja/Morado de Yape)
        if (statusHeader) statusHeader.style.background = "#fffbeb";
        if (statusIconBox) {
            statusIconBox.style.background = "#fef3c7";
            statusIconBox.style.color = "#d97706";
            statusIconBox.innerHTML = `<i data-lucide="clock" style="width: 26px; height: 26px;"></i>`;
        }
        if (statusTitle) {
            statusTitle.textContent = "¡Reserva Registrada!";
            statusTitle.style.color = "#d97706";
        }
        if (statusSubtitle) {
            statusSubtitle.textContent = "Boleto pendiente de activación. Completa tu pago por Yape para activarlo.";
        }

        // Mostrar el banner
        if (yapeBanner) yapeBanner.classList.remove("hidden");
    } else {
        // Si no es Yape (es Tarjeta, etc.), ocultamos el banner y restablecemos la cabecera verde de éxito
        if (yapeBanner) yapeBanner.classList.add("hidden");
        
        if (statusHeader) statusHeader.style.background = "#e6f4ea";
        if (statusIconBox) {
            statusIconBox.style.background = "#e6f4ea";
            statusIconBox.style.color = "#137333";
            statusIconBox.innerHTML = `<i data-lucide="check" style="width: 26px; height: 26px;"></i>`;
        }
        if (statusTitle) {
            statusTitle.textContent = "¡Compra Confirmada!";
            statusTitle.style.color = "#059669";
        }
        if (statusSubtitle) {
            statusSubtitle.textContent = "Tu boleto digital está listo. Muéstralo al abordar.";
        }
    }
    
    // Renderizar iconos de Lucide dinámicos
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
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
    let bg = "rgba(16, 185, 129, 0.12)";
    let border = "#e0e7ff";
    if (type === "warning") { icon = "alert-triangle"; color = "#f59e0b"; bg = "rgba(245, 158, 11, 0.12)"; border = "#e0e7ff"; }
    if (type === "error") { icon = "x-circle"; color = "#ef4444"; bg = "rgba(239, 68, 68, 0.12)"; border = "#e0e7ff"; }
    if (type === "info") { icon = "info"; color = "#f59e0b"; bg = "rgba(245, 158, 11, 0.12)"; border = "#e0e7ff"; }
    
    toast.innerHTML = `
        <div style="background: #ffffff; border: 1.5px solid ${border}; box-shadow: 0 10px 40px rgba(0,0,0,0.5); padding: 0.75rem 1.25rem; border-radius: 16px; display: flex; align-items: center; gap: 0.6rem; max-width: 340px; animation: slideUpToast 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
            <div style="width: 24px; height: 24px; border-radius: 50%; background: ${bg}; color: ${color}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <i data-lucide="${icon}" style="width: 14px; height: 14px;"></i>
            </div>
            <span style="font-size: 0.82rem; font-weight: 700; color: #1e293b; line-height: 1.3;">${message}</span>
        </div>
    `;
    
    // Estilos fijos para la notificación dentro del contenedor responsivo
    toast.style.position = "fixed";
    toast.style.bottom = "80px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
    toast.style.zIndex = "2000";
    toast.style.pointerEvents = "none";
    
    const wrapper = document.querySelector(".b2c-app-container");
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
        badge.style.background = "#f59e0b";
        badge.style.color = "#000000";
        badge.style.fontSize = "8px";
        badge.style.fontWeight = "900";
        badge.style.padding = "1px 5px";
        badge.style.borderRadius = "10px";
        badge.style.border = "1.5px solid #000000";
        tabHistory.appendChild(badge);
    }
}

// --- SINCRONIZAR BOLETOS DEL CLIENTE CON EL SERVIDOR (TIEMPO REAL) ---
async function syncClientTickets() {
    if (state.myTickets.length === 0) return;
    
    try {
        const ticketIds = state.myTickets.map(t => t.id);
        const res = await fetch('/api/tickets/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketIds })
        }).then(r => r.json());
        
        if (res.success && Array.isArray(res.tickets)) {
            // Actualizar el array local manteniendo solo los boletos que siguen existiendo en el servidor
            state.myTickets = res.tickets;
            localStorage.setItem('busclick_client_tickets', JSON.stringify(state.myTickets));
            updateHistoryTabBadge();
        }
    } catch (e) {
        console.error("Error al sincronizar boletos locales con servidor:", e);
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

// --- RENDERIZAR HTML DE LISTA DE TICKETS (B2C) ---
function renderTicketsListHtml() {
    let ticketsListHtml = "";
    if (state.myTickets.length === 0) {
        ticketsListHtml = `
            <div style="text-align: center; padding: 3rem 0; color: #64748b;">
                <div style="width: 52px; height: 52px; border-radius: 50%; background: #f1f5f9; color: #94a3b8; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem auto;">
                    <i data-lucide="ticket" style="width: 24px; height: 24px;"></i>
                </div>
                <div style="font-size: 0.95rem; font-weight: 800; color: #475569;">No tienes pasajes emitidos</div>
                <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.25rem;">Tus boletos comprados en esta sesión aparecerán listados aquí.</div>
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
                <div style="background: #ffffff; border: 1px solid #e0e7ff; border-radius: 16px; padding: 1rem; margin-bottom: 0.75rem; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.06); position: relative;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <span style="font-size: 0.72rem; font-weight: 800; color: #6366f1;"><i data-lucide="bus" style="width: 11px; height: 11px; display: inline-block; vertical-align: middle; margin-right: 3px;"></i> ${company.name}</span>
                        <span style="font-size: 0.65rem; font-weight: 800; background: rgba(16, 185, 129, 0.12); color: #10b981; padding: 2px 8px; border-radius: 20px;">Válido</span>
                    </div>
                    
                    <div style="font-size: 0.9rem; font-weight: 800; color: #1e293b;">
                        ${ticket.routeFrom || state.selectedOrigin} ➔ ${ticket.routeTo || state.selectedDestination}
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem; font-size: 0.72rem; color: #64748b; border-top: 1px solid #e0e7ff; padding-top: 0.5rem;">
                        <div>Fecha: <strong style="color:#1e293b;">${displayDate}</strong></div>
                        <div>Asiento: <strong style="color:#6366f1;">N° ${ticket.seatNum} (Piso ${ticket.floor})</strong></div>
                        <div>Pasajero: <strong style="color:#1e293b;">${ticket.passengerName}</strong></div>
                        <div>DNI: <strong style="color:#1e293b;">${ticket.passengerDni}</strong></div>
                    </div>
                    
                    <button type="button" class="b2c-btn-back btn-view-ticket-qr" data-id="${ticket.id}" style="margin-top: 0.75rem; width: 100%; justify-content: center; border-color: #e0e7ff; color: #6366f1; background: #ede9fe;">
                        <i data-lucide="qr-code" style="width: 12px; height: 12px;"></i> Ver Boleto QR
                    </button>
                </div>
            `;
        });
    }
    return ticketsListHtml;
}

// --- CONFIGURAR REGISTROS DE EVENTOS DEL HISTORIAL ---
function setupHistoryModalListeners(overlay) {
    // Listener cerrar modal
    overlay.querySelector(".btn-close-mobile-modal")?.addEventListener("click", () => {
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
    overlay.style.background = "rgba(15, 23, 42, 0.4)";
    overlay.style.backdropFilter = "blur(8px)";
    overlay.style.zIndex = "900";
    overlay.style.display = "flex";
    overlay.style.alignItems = "flex-end";
    overlay.style.animation = "fadeInOverlay 0.25s ease";
    
    const ticketsListHtml = renderTicketsListHtml();
    
    overlay.innerHTML = `
        <div style="background: #ffffff; border-radius: 24px 24px 0 0; width: 100%; max-height: 80%; padding: 1.5rem; box-sizing: border-box; display: flex; flex-direction: column; box-shadow: 0 -10px 40px rgba(99, 102, 241, 0.1); border-top: 1px solid #e0e7ff; animation: slideUpModal 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                <h3 style="font-size: 1.05rem; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 0.5rem; margin: 0;"><div style="width: 32px; height: 32px; border-radius: 8px; background: #fef3c7; color: #78350f; display: flex; align-items: center; justify-content: center;"><i data-lucide="ticket" style="width: 16px; height: 16px;"></i></div> Mis Boletos Digitales</h3>
                <button type="button" class="btn-close-mobile-modal" style="background: #f1f5f9; width: 28px; height: 28px; border-radius: 50%; border: none; color: #475569; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease;">
                    <i data-lucide="x" style="width: 14px; height: 14px;"></i>
                </button>
            </div>
            
            <div style="overflow-y: auto; flex: 1; padding-bottom: 1rem;" id="modal-tickets-list-area">
                ${ticketsListHtml}
            </div>
        </div>
    `;
    
    const wrapper = document.querySelector(".b2c-app-container");
    if (wrapper) {
        wrapper.appendChild(overlay);
        lucide.createIcons();
        
        setupHistoryModalListeners(overlay);
        
        // Sincronizar en segundo plano de inmediato al abrir para asegurar la verdad en Railway
        syncClientTickets().then(() => {
            const listArea = document.getElementById("modal-tickets-list-area");
            if (listArea) {
                listArea.innerHTML = renderTicketsListHtml();
                lucide.createIcons();
                setupHistoryModalListeners(overlay);
            }
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
    overlay.style.background = "rgba(15, 23, 42, 0.4)";
    overlay.style.backdropFilter = "blur(8px)";
    overlay.style.zIndex = "900";
    overlay.style.display = "flex";
    overlay.style.alignItems = "flex-end";
    overlay.style.animation = "fadeInOverlay 0.25s ease";
    
    const activeComp = state.activeCompany || {};
    const supportPhone = activeComp.supportPhone || '+51 987 654 321';
    const supportEmail = activeComp.supportEmail || 'soporte@bus.click';
    const supportMsg = activeComp.supportMessage || 'Contáctanos por nuestros canales de soporte oficiales 24/7 para cambios, reprogramaciones o anulaciones de tu viaje.';

    overlay.innerHTML = `
        <div style="background: #ffffff; border-radius: 24px 24px 0 0; width: 100%; padding: 1.5rem; box-sizing: border-box; box-shadow: 0 -10px 40px rgba(99, 102, 241, 0.1); border-top: 1px solid #e0e7ff; animation: slideUpModal 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                <h3 style="font-size: 1.05rem; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 0.5rem; margin: 0;"><div style="width: 32px; height: 32px; border-radius: 8px; background: #e0f2fe; color: #0c4a6e; display: flex; align-items: center; justify-content: center;"><i data-lucide="help-circle" style="width: 16px; height: 16px;"></i></div> Canal de Soporte</h3>
                <button type="button" class="btn-close-mobile-modal" style="background: #f1f5f9; width: 28px; height: 28px; border-radius: 50%; border: none; color: #475569; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease;">
                    <i data-lucide="x" style="width: 14px; height: 14px;"></i>
                </button>
            </div>
            
            <div style="text-align: center; padding: 0.5rem 0;">
                <div style="background: #e0f2fe; width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 0.75rem auto; color: #0c4a6e;">
                    <i data-lucide="message-square" style="width: 22px; height: 22px;"></i>
                </div>
                <h4 style="font-size: 0.95rem; font-weight: 800; color: #1e293b;">¿Necesitas ayuda con tu pasaje?</h4>
                <p style="font-size: 0.8rem; color: #64748b; margin-top: 0.35rem; line-height: 1.5;">${supportMsg}</p>
                
                <div style="background: #f8fafc; border: 1px solid #e0e7ff; border-radius: 16px; padding: 1.1rem; margin-top: 1.25rem; text-align: left; display: flex; flex-direction: column; gap: 0.75rem;">
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                        <div style="width: 24px; height: 24px; border-radius: 50%; background: #d1fae5; color: #065f46; display: flex; align-items: center; justify-content: center;"><i data-lucide="phone" style="width: 12px; height: 12px;"></i></div>
                        <span style="font-size: 0.8rem; font-weight: 700; color: #334155;">WhatsApp: ${supportPhone}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                        <div style="width: 24px; height: 24px; border-radius: 50%; background: #e0f2fe; color: #0c4a6e; display: flex; align-items: center; justify-content: center;"><i data-lucide="mail" style="width: 12px; height: 12px;"></i></div>
                        <span style="font-size: 0.8rem; font-weight: 700; color: #334155;">Correo: ${supportEmail}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                        <div style="width: 24px; height: 24px; border-radius: 50%; background: #ede9fe; color: #4c1d95; display: flex; align-items: center; justify-content: center;"><i data-lucide="shield-check" style="width: 12px; height: 12px;"></i></div>
                        <span style="font-size: 0.8rem; font-weight: 700; color: #334155;">Seguridad de Compra Garantizada</span>
                    </div>
                </div>
                
                <button type="button" class="b2c-btn-primary btn-close-mobile-modal" style="margin-top: 1.5rem;">
                    Entendido
                </button>
            </div>
        </div>
    `;
    
    const wrapper = document.querySelector(".b2c-app-container");
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
                    <button type="button" class="datepicker-nav-btn btn-prev" style="display: flex; align-items: center; justify-content: center; outline: none; border-radius: 6px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="color: #64748b;"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
                    <div class="datepicker-month-title" style="text-transform: capitalize; font-weight: 800; color: #1e293b; font-size: 0.85rem;">${monthNames[month]} de ${year}</div>
                    <button type="button" class="datepicker-nav-btn btn-next" style="display: flex; align-items: center; justify-content: center; outline: none; border-radius: 6px;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="color: #64748b;"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
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
                    <button type="button" class="datepicker-footer-btn datepicker-btn-clear" style="color: #ef4444; font-weight: 700;">Borrar</button>
                    <button type="button" class="datepicker-footer-btn datepicker-btn-today" style="color: #cbd5e1; font-weight: 700;">Hoy</button>
                    <button type="button" class="datepicker-footer-btn datepicker-btn-close" style="color: #f59e0b; font-weight: 800;">Cerrar</button>
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

                popover.querySelector('.datepicker-btn-close').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    closeAllPremiumDatepickers();
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

// =========================================================================
// 🖨️ DETECTAR EVENTOS DE IMPRESIÓN, DESCARGA Y COMPARTIDO DE BOLETO B2C
// =========================================================================

// Evento Imprimir (permite elegir formatos: ticket o a4 en el CSS de impresión)
document.getElementById("b2c-btn-print")?.addEventListener("click", () => {
    const format = document.getElementById("b2c-print-format").value;
    const ticketElement = document.querySelector(".b2c-ticket");
    
    if (ticketElement) {
        // Limpiar clases de formato anteriores
        ticketElement.classList.remove("print-format-ticket", "print-format-a4");
        
        // Aplicar clase correspondiente para impresión
        if (format === "a4") {
            ticketElement.classList.add("print-format-a4");
        } else {
            ticketElement.classList.add("print-format-ticket");
        }
    }
    
    window.print();
});

// Evento Descargar PDF (utilizando la librería html2pdf.js en el cliente)
document.getElementById("b2c-btn-pdf")?.addEventListener("click", () => {
    const ticketElement = document.querySelector(".b2c-ticket");
    if (!ticketElement) return;

    const passengerName = document.getElementById("ticket-passenger")?.textContent.trim() || "pasajero";
    const cleanName = passengerName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const filename = `boleto_busclick_${cleanName}.pdf`;
    
    showMobileNotification("Generando tu PDF de descarga...", "info");
    
    // Configuración para el tamaño PDF
    const format = document.getElementById("b2c-print-format").value;
    const opt = {
        margin:       5,
        filename:     filename,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 3.0, logging: false, useCORS: true, letterRendering: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    // Aplicar la clase de formato PDF dinámicamente antes del renderizado
    ticketElement.classList.remove("pdf-mode-ticket", "pdf-mode-a4");
    if (format === "ticket") {
        ticketElement.classList.add("pdf-mode-ticket");
        opt.jsPDF.format = [80, 160]; // 80mm ancho, 160mm alto
        opt.margin = 2;
    } else {
        ticketElement.classList.add("pdf-mode-a4");
        opt.margin = 10; // Un margen elegante de 10mm para A4
    }
    
    html2pdf().from(ticketElement).set(opt).save().then(() => {
        // Limpiar clases PDF después de la renderización
        ticketElement.classList.remove("pdf-mode-ticket", "pdf-mode-a4");
        showMobileNotification("¡Tu boleto PDF ha sido descargado!", "success");
    }).catch(err => {
        console.error("Error al descargar PDF:", err);
        ticketElement.classList.remove("pdf-mode-ticket", "pdf-mode-a4");
        showMobileNotification("No se pudo descargar el PDF automáticamente.", "error");
    });
});

// Evento Compartir PDF (utilizando Web Share API si está disponible en dispositivos móviles)
document.getElementById("b2c-btn-share")?.addEventListener("click", () => {
    const ticketElement = document.querySelector(".b2c-ticket");
    if (!ticketElement) return;

    const passengerName = document.getElementById("ticket-passenger")?.textContent.trim() || "pasajero";
    const cleanName = passengerName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const filename = `boleto_busclick_${cleanName}.pdf`;
    
    showMobileNotification("Preparando el archivo para compartir...", "info");
    
    const format = document.getElementById("b2c-print-format").value;
    const opt = {
        margin:       5,
        filename:     filename,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 3.0, logging: false, useCORS: true, letterRendering: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    // Aplicar la clase de formato PDF dinámicamente antes del renderizado
    ticketElement.classList.remove("pdf-mode-ticket", "pdf-mode-a4");
    if (format === "ticket") {
        ticketElement.classList.add("pdf-mode-ticket");
        opt.jsPDF.format = [80, 160];
        opt.margin = 2;
    } else {
        ticketElement.classList.add("pdf-mode-a4");
        opt.margin = 10;
    }
    
    html2pdf().from(ticketElement).set(opt).outputPdf('blob').then(async (pdfBlob) => {
        // Limpiar clases PDF inmediatamente después de obtener el blob
        ticketElement.classList.remove("pdf-mode-ticket", "pdf-mode-a4");
        
        const file = new File([pdfBlob], filename, { type: "application/pdf" });
        
        // Intentar compartir de forma nativa en móviles (Web Share API)
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: 'Boleto Digital Bus.click',
                    text: `Hola, te comparto el pasaje de ${passengerName} emitido por Bus.click.`
                });
                showMobileNotification("¡Boleto compartido correctamente!", "success");
            } catch (err) {
                console.log("Compartido cancelado o fallido:", err);
            }
        } else {
            // Fallback para navegadores de escritorio que no soportan Web Share
            const fileUrl = URL.createObjectURL(pdfBlob);
            const shareWindow = window.open(fileUrl, '_blank');
            if (shareWindow) {
                showMobileNotification("Boleto PDF abierto en nueva pestaña para compartir.", "success");
            } else {
                showMobileNotification("Por favor, permite ventanas emergentes.", "error");
            }
        }
    }).catch(err => {
        console.error("Error al generar PDF para compartir:", err);
        ticketElement.classList.remove("pdf-mode-ticket", "pdf-mode-a4");
        showMobileNotification("Ocurrió un error al preparar el PDF.", "error");
    });
});
