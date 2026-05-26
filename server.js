/* ==========================================================
   SERVER BACKEND: BUS.CLICK WITH HYBRID POSTGRESQL & JSON STORE
   ========================================================== */

const express = require('express');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 1. CONFIGURACIÓN E INITIALIZACIÓN DE BASE DE DATOS
// ==========================================
let pool = null;
let usePostgres = false;
const jsonDbPath = path.join(__dirname, 'database.json');

// Inicializar almacenamiento local en memoria como fallback
let localDb = {
    companies: [],
    sedes: [],
    trabajadores: [],
    movilidades: [],
    tickets: []
};

// Intentar leer la base de datos JSON si existe
if (fs.existsSync(jsonDbPath)) {
    try {
        const data = fs.readFileSync(jsonDbPath, 'utf8');
        localDb = JSON.parse(data);
        console.log("✔ Base de datos local JSON cargada exitosamente.");
    } catch (e) {
        console.error("⚠ Error leyendo base de datos local JSON, usando estructura vacía:", e);
    }
}

function saveLocalDb() {
    try {
        fs.writeFileSync(jsonDbPath, JSON.stringify(localDb, null, 2), 'utf8');
    } catch (e) {
        console.error("⚠ Error guardando base de datos JSON local:", e);
    }
}

// Conexión inteligente a PostgreSQL (Railway Cloud)
if (process.env.DATABASE_URL) {
    console.log("⚡ Detectada base de datos PostgreSQL en la nube de Railway. Conectando...");
    try {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: {
                rejectUnauthorized: false // Requerido para conexiones seguras en Railway
            }
        });
        usePostgres = true;
        console.log("✔ Pool de conexiones de PostgreSQL inicializado.");
        
        // Inicializar tablas
        initializePostgresTables();
    } catch (error) {
        console.error("❌ Falló la inicialización de PostgreSQL. Usando fallback JSON local.", error);
        usePostgres = false;
    }
} else {
    console.log("ℹ No se detectó DATABASE_URL. Usando almacenamiento JSON local persistente.");
}

async function initializePostgresTables() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Tabla Empresas
        await client.query(`
            CREATE TABLE IF NOT EXISTS companies (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                ruc VARCHAR(20) NOT NULL,
                logo TEXT,
                color VARCHAR(10) DEFAULT '#6366f1',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Tabla Sedes
        await client.query(`
            CREATE TABLE IF NOT EXISTS sedes (
                id VARCHAR(50) PRIMARY KEY,
                company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                city VARCHAR(100) NOT NULL,
                address VARCHAR(200) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Tabla Trabajadores
        await client.query(`
            CREATE TABLE IF NOT EXISTS trabajadores (
                id VARCHAR(50) PRIMARY KEY,
                company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
                sede_id VARCHAR(50) REFERENCES sedes(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                lastname VARCHAR(100) NOT NULL,
                dni VARCHAR(20) NOT NULL,
                role VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Tabla Movilidades
        await client.query(`
            CREATE TABLE IF NOT EXISTS movilidades (
                id VARCHAR(50) PRIMARY KEY,
                company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
                sede_id VARCHAR(50) REFERENCES sedes(id) ON DELETE CASCADE,
                plate VARCHAR(20) NOT NULL,
                brand VARCHAR(100) NOT NULL,
                model_type VARCHAR(50) NOT NULL,
                route_from VARCHAR(100) NOT NULL,
                route_to VARCHAR(100) NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Tabla Tickets (Venta de Pasajes)
        await client.query(`
            CREATE TABLE IF NOT EXISTS tickets (
                id VARCHAR(50) PRIMARY KEY,
                company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
                sede_id VARCHAR(50) REFERENCES sedes(id) ON DELETE CASCADE,
                movilidad_id VARCHAR(50) REFERENCES movilidades(id) ON DELETE CASCADE,
                seat_num INT NOT NULL,
                floor INT DEFAULT 1,
                passenger_name VARCHAR(150) NOT NULL,
                passenger_dni VARCHAR(20) NOT NULL,
                status VARCHAR(50) NOT NULL,
                payment_method VARCHAR(50) NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                date_str VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await client.query('COMMIT');
        console.log("✔ Estructura de tablas de PostgreSQL verificada/creada correctamente.");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ Error inicializando tablas PostgreSQL, fallback a JSON:", e);
        usePostgres = false;
    } finally {
        client.release();
    }
}

// Generador de ID corto aleatorio
function generateId() {
    return Math.random().toString(36).substring(2, 9);
}

// ==========================================
// 2. ENDPOINTS REST API
// ==========================================

// --- EMPRESAS ---
app.get('/api/companies', async (req, res) => {
    if (usePostgres) {
        try {
            const { rows } = await pool.query('SELECT * FROM companies ORDER BY created_at ASC');
            res.json(rows.map(r => ({ id: r.id, name: r.name, ruc: r.ruc, logo: r.logo, color: r.color })));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        res.json(localDb.companies);
    }
});

app.post('/api/companies', async (req, res) => {
    const { name, ruc, logo, color } = req.body;
    const id = generateId();
    
    if (usePostgres) {
        try {
            await pool.query(
                'INSERT INTO companies (id, name, ruc, logo, color) VALUES ($1, $2, $3, $4, $5)',
                [id, name, ruc, logo || "", color || "#6366f1"]
            );
            res.json({ id });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const company = { id, name, ruc, logo: logo || "", color: color || "#6366f1" };
        localDb.companies.push(company);
        saveLocalDb();
        res.json(company);
    }
});

app.delete('/api/companies/:id', async (req, res) => {
    const { id } = req.params;
    if (usePostgres) {
        try {
            await pool.query('DELETE FROM companies WHERE id = $1', [id]);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        localDb.companies = localDb.companies.filter(c => c.id !== id);
        localDb.sedes = localDb.sedes.filter(s => s.companyId !== id);
        localDb.trabajadores = localDb.trabajadores.filter(t => t.companyId !== id);
        localDb.movilidades = localDb.movilidades.filter(m => m.companyId !== id);
        localDb.tickets = localDb.tickets.filter(t => t.companyId !== id);
        saveLocalDb();
        res.json({ success: true });
    }
});

// --- SEDES ---
app.get('/api/sedes', async (req, res) => {
    if (usePostgres) {
        try {
            const { rows } = await pool.query('SELECT * FROM sedes ORDER BY created_at ASC');
            res.json(rows.map(r => ({ id: r.id, companyId: r.company_id, name: r.name, city: r.city, address: r.address })));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        res.json(localDb.sedes);
    }
});

app.post('/api/sedes', async (req, res) => {
    const { companyId, name, city, address } = req.body;
    const id = generateId();
    
    if (usePostgres) {
        try {
            await pool.query(
                'INSERT INTO sedes (id, company_id, name, city, address) VALUES ($1, $2, $3, $4, $5)',
                [id, companyId, name, city, address]
            );
            res.json({ id });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const sede = { id, companyId, name, city, address };
        localDb.sedes.push(sede);
        saveLocalDb();
        res.json(sede);
    }
});

app.delete('/api/sedes/:id', async (req, res) => {
    const { id } = req.params;
    if (usePostgres) {
        try {
            await pool.query('DELETE FROM sedes WHERE id = $1', [id]);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        localDb.sedes = localDb.sedes.filter(s => s.id !== id);
        localDb.trabajadores = localDb.trabajadores.filter(t => t.sedeId !== id);
        localDb.movilidades = localDb.movilidades.filter(m => m.sedeId !== id);
        localDb.tickets = localDb.tickets.filter(t => t.sedeId !== id);
        saveLocalDb();
        res.json({ success: true });
    }
});

// --- TRABAJADORES ---
app.get('/api/trabajadores', async (req, res) => {
    if (usePostgres) {
        try {
            const { rows } = await pool.query('SELECT * FROM trabajadores ORDER BY created_at ASC');
            res.json(rows.map(r => ({ id: r.id, companyId: r.company_id, sedeId: r.sede_id, name: r.name, lastname: r.lastname, dni: r.dni, role: r.role })));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        res.json(localDb.trabajadores);
    }
});

app.post('/api/trabajadores', async (req, res) => {
    const { companyId, sedeId, name, lastname, dni, role } = req.body;
    const id = generateId();
    
    if (usePostgres) {
        try {
            await pool.query(
                'INSERT INTO trabajadores (id, company_id, sede_id, name, lastname, dni, role) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [id, companyId, sedeId, name, lastname, dni, role]
            );
            res.json({ id });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const trabajador = { id, companyId, sedeId, name, lastname, dni, role };
        localDb.trabajadores.push(trabajador);
        saveLocalDb();
        res.json(trabajador);
    }
});

app.delete('/api/trabajadores/:id', async (req, res) => {
    const { id } = req.params;
    if (usePostgres) {
        try {
            await pool.query('DELETE FROM trabajadores WHERE id = $1', [id]);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        localDb.trabajadores = localDb.trabajadores.filter(t => t.id !== id);
        saveLocalDb();
        res.json({ success: true });
    }
});

// --- MOVILIDADES ---
app.get('/api/movilidades', async (req, res) => {
    if (usePostgres) {
        try {
            const { rows } = await pool.query('SELECT * FROM movilidades ORDER BY created_at ASC');
            res.json(rows.map(r => ({ id: r.id, companyId: r.company_id, sedeId: r.sede_id, plate: r.plate, brand: r.brand, modelType: r.model_type, routeFrom: r.route_from, routeTo: r.route_to, price: parseFloat(r.price) })));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        res.json(localDb.movilidades);
    }
});

app.post('/api/movilidades', async (req, res) => {
    const { companyId, sedeId, plate, brand, modelType, routeFrom, routeTo, price } = req.body;
    const id = generateId();
    
    if (usePostgres) {
        try {
            await pool.query(
                'INSERT INTO movilidades (id, company_id, sede_id, plate, brand, model_type, route_from, route_to, price) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
                [id, companyId, sedeId, plate.toUpperCase(), brand, modelType, routeFrom, routeTo, parseFloat(price)]
            );
            res.json({ id });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const movilidad = { id, companyId, sedeId, plate: plate.toUpperCase(), brand, modelType, routeFrom, routeTo, price: parseFloat(price) };
        localDb.movilidades.push(movilidad);
        saveLocalDb();
        res.json(movilidad);
    }
});

app.delete('/api/movilidades/:id', async (req, res) => {
    const { id } = req.params;
    if (usePostgres) {
        try {
            await pool.query('DELETE FROM movilidades WHERE id = $1', [id]);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        localDb.movilidades = localDb.movilidades.filter(m => m.id !== id);
        localDb.tickets = localDb.tickets.filter(t => t.movilidadId !== id);
        saveLocalDb();
        res.json({ success: true });
    }
});

// --- TICKETS (VENTAS) ---
app.get('/api/tickets', async (req, res) => {
    if (usePostgres) {
        try {
            const { rows } = await pool.query('SELECT * FROM tickets ORDER BY created_at ASC');
            res.json(rows.map(r => ({ id: r.id, companyId: r.company_id, sedeId: r.sede_id, movilidadId: r.movilidad_id, seatNum: parseInt(r.seat_num), floor: parseInt(r.floor), passengerName: r.passenger_name, passengerDni: r.passenger_dni, status: r.status, paymentMethod: r.payment_method, price: parseFloat(r.price), date: r.date_str })));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        res.json(localDb.tickets);
    }
});

app.post('/api/tickets', async (req, res) => {
    const { companyId, sedeId, movilidadId, seatNum, floor, passengerName, passengerDni, status, paymentMethod, price, date } = req.body;
    const id = generateId();
    
    if (usePostgres) {
        try {
            await pool.query(
                'INSERT INTO tickets (id, company_id, sede_id, movilidad_id, seat_num, floor, passenger_name, passenger_dni, status, payment_method, price, date_str) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
                [id, companyId, sedeId, movilidadId, seatNum, floor, passengerName, passengerDni, status, paymentMethod, parseFloat(price), date]
            );
            res.json({ id });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const ticket = { id, companyId, sedeId, movilidadId, seatNum, floor, passengerName, passengerDni, status, paymentMethod, price: parseFloat(price), date };
        localDb.tickets.push(ticket);
        saveLocalDb();
        res.json(ticket);
    }
});

app.delete('/api/tickets/:id', async (req, res) => {
    const { id } = req.params;
    if (usePostgres) {
        try {
            await pool.query('DELETE FROM tickets WHERE id = $1', [id]);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        localDb.tickets = localDb.tickets.filter(t => t.id !== id);
        saveLocalDb();
        res.json({ success: true });
    }
});

// --- PROXY SEGURO DE CONSULTAS DNI Y RUC (APIPERU.DEV) ---
const APIPERU_TOKEN = process.env.APIPERU_TOKEN || "76ca7246c8a8c464fd551b6555e780791a69ff89acb8887558d65b23f05ab81b";

app.post('/api/consultar-dni', async (req, res) => {
    const { dni } = req.body;
    if (!dni || dni.length !== 8) {
        return res.status(400).json({ success: false, error: 'El DNI debe tener exactamente 8 dígitos.' });
    }
    
    try {
        const response = await fetch('https://apiperu.dev/api/dni', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${APIPERU_TOKEN}`
            },
            body: JSON.stringify({ dni })
        });
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error("Error en proxy DNI:", error);
        res.status(500).json({ success: false, error: 'Fallo al consultar el DNI en el servicio externo.' });
    }
});

app.post('/api/consultar-ruc', async (req, res) => {
    const { ruc } = req.body;
    if (!ruc || ruc.length !== 11) {
        return res.status(400).json({ success: false, error: 'El RUC debe tener exactamente 11 dígitos.' });
    }
    
    try {
        const response = await fetch('https://apiperu.dev/api/ruc', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${APIPERU_TOKEN}`
            },
            body: JSON.stringify({ ruc })
        });
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error("Error en proxy RUC:", error);
        res.status(500).json({ success: false, error: 'Fallo al consultar el RUC en el servicio externo.' });
    }
});

// --- CARGAR DATOS SEMILLA ---
app.post('/api/seed', async (req, res) => {
    try {
        console.log("Precargando datos semilla...");
        
        // Estructura semilla
        const seedCompanies = [
            { id: "flores", name: "Expreso Flores", ruc: "20456789123", logo: "", color: "#ef4444" },
            { id: "cruzdelsur", name: "Cruz del Sur VIP", ruc: "20102030401", logo: "", color: "#3b82f6" },
            { id: "combi", name: "Combi Rápido Express", ruc: "20998877665", logo: "", color: "#f59e0b" }
        ];
        
        const seedSedes = [
            { id: "sede-fl-1", companyId: "flores", name: "Terminal Lima Norte", city: "Lima", address: "Av. Gerardo Unger 6500" },
            { id: "sede-fl-2", companyId: "flores", name: "Terminal Arequipa", city: "Arequipa", address: "Av. Arturo Ibáñez s/n" },
            { id: "sede-cds-1", companyId: "cruzdelsur", name: "Sede Cruz del Sur Centro", city: "Lima", address: "Av. Javier Prado Este 1109" },
            { id: "sede-com-1", companyId: "combi", name: "Terminal Colectivos San Juan", city: "Lima", address: "Av. Los Héroes 450" }
        ];
        
        const seedTrabajadores = [
            { id: "tr-1", companyId: "flores", sedeId: "sede-fl-1", name: "Roberto", lastname: "Gómez", dni: "44123456", role: "Vendedor" },
            { id: "tr-2", companyId: "flores", sedeId: "sede-fl-1", name: "Patricia", lastname: "Flores", dni: "45987654", role: "Administrador Sede" },
            { id: "tr-3", companyId: "cruzdelsur", sedeId: "sede-cds-1", name: "Carlos", lastname: "Mendoza", dni: "70554433", role: "Vendedor" },
            { id: "tr-4", companyId: "combi", sedeId: "sede-com-1", name: "Manuel", lastname: "Yauri", dni: "10203040", role: "Vendedor" }
        ];
        
        const seedMovilidades = [
            { id: "mov-1", companyId: "flores", SedeId: "sede-fl-1", plate: "F3W-902", brand: "Volvo B430R", modelType: "bus1p", routeFrom: "Lima", routeTo: "Arequipa", price: 60 },
            { id: "mov-2", companyId: "flores", SedeId: "sede-fl-1", plate: "A9P-231", brand: "Mercedes DoubleDecker", modelType: "bus2p", routeFrom: "Lima", routeTo: "Cusco", price: 90 },
            { id: "mov-3", companyId: "cruzdelsur", SedeId: "sede-cds-1", plate: "C5S-991", brand: "Scania K410", modelType: "bus1p", routeFrom: "Lima", routeTo: "Ica", price: 45 },
            { id: "mov-4", companyId: "combi", SedeId: "sede-com-1", plate: "T8O-114", brand: "Toyota HiAce rural", modelType: "combi", routeFrom: "Lima", routeTo: "Cañete", price: 20 },
            { id: "mov-5", companyId: "combi", SedeId: "sede-com-1", plate: "B9U-225", brand: "Mitsubishi Fuso", modelType: "minibus", routeFrom: "Lima", routeTo: "Huacho", price: 30 }
        ];

        if (usePostgres) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                
                // Limpiar previamente
                await client.query('DELETE FROM tickets');
                await client.query('DELETE FROM movilidades');
                await client.query('DELETE FROM trabajadores');
                await client.query('DELETE FROM sedes');
                await client.query('DELETE FROM companies');
                
                // Cargar empresas
                for (const c of seedCompanies) {
                    await client.query('INSERT INTO companies (id, name, ruc, logo, color) VALUES ($1, $2, $3, $4, $5)', [c.id, c.name, c.ruc, c.logo, c.color]);
                }
                
                // Cargar sedes
                for (const s of seedSedes) {
                    await client.query('INSERT INTO sedes (id, company_id, name, city, address) VALUES ($1, $2, $3, $4, $5)', [s.id, s.companyId, s.name, s.city, s.address]);
                }
                
                // Cargar trabajadores
                for (const t of seedTrabajadores) {
                    await client.query('INSERT INTO trabajadores (id, company_id, sede_id, name, lastname, dni, role) VALUES ($1, $2, $3, $4, $5, $6, $7)', [t.id, t.companyId, t.sedeId, t.name, t.lastname, t.dni, t.role]);
                }
                
                // Cargar movilidades
                for (const m of seedMovilidades) {
                    await client.query('INSERT INTO movilidades (id, company_id, sede_id, plate, brand, model_type, route_from, route_to, price) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [m.id, m.companyId, m.SedeId, m.plate, m.brand, m.modelType, m.routeFrom, m.routeTo, m.price]);
                }
                
                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } else {
            // Cargar en localDb
            localDb.companies = seedCompanies;
            localDb.sedes = seedSedes;
            localDb.trabajadores = seedTrabajadores;
            localDb.movilidades = seedMovilidades.map(m => ({ id: m.id, companyId: m.companyId, sedeId: m.SedeId, plate: m.plate, brand: m.brand, modelType: m.modelType, routeFrom: m.routeFrom, routeTo: m.routeTo, price: m.price }));
            localDb.tickets = [];
            saveLocalDb();
        }
        
        res.json({ success: true });
    } catch (e) {
        console.error("Error al sembrar:", e);
        res.status(500).json({ error: e.message });
    }
});

// Redireccionar según el host (Subdominios para Railway)
// superadmin.bus.click -> superadmin.html
// admin.bus.click -> admin.html
// app.bus.click (u otros) -> index.html
app.get('/', (req, res) => {
    const host = req.headers.host || "";
    
    if (host.startsWith('super')) {
        return res.sendFile(path.join(__dirname, 'public', 'superadmin.html'));
    }
    
    if (host.startsWith('admin')) {
        return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    }
    
    // Default: Panel de Ventas
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rutas explícitas para desarrollo local
app.get('/superadmin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'superadmin.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Redireccionar cualquier otra ruta a index.html (Soporte SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// 3. INICIO DEL SERVIDOR
// ==========================================
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 SERVIDOR BUS.CLICK INICIADO EXITOSAMENTE`);
    console.log(`🌍 Corriendo en: http://localhost:${PORT}`);
    console.log(`=========================================`);
});
