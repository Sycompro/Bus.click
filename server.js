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
        console.error("❌ Falló la inicialización de PostgreSQL. Requiriendo base de datos real.", error);
        usePostgres = true; // Forzar uso de Postgres
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
        
        // Agregar columnas payment_methods, username, password, plan_name y services si no existen
        await client.query(`
            ALTER TABLE companies ADD COLUMN IF NOT EXISTS payment_methods TEXT DEFAULT 'Efectivo,Yape/Plin',
            ADD COLUMN IF NOT EXISTS username VARCHAR(100),
            ADD COLUMN IF NOT EXISTS password VARCHAR(100),
            ADD COLUMN IF NOT EXISTS plan_name VARCHAR(100) DEFAULT 'Plan Profesional',
            ADD COLUMN IF NOT EXISTS services TEXT DEFAULT 'Boletería,Flota',
            ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(50) DEFAULT 'Mensual';
        `);
        
        // Auto-reparar credenciales de empresas nulas si existen
        await client.query(`
            UPDATE companies SET 
                username = COALESCE(username, LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'))), 
                password = COALESCE(password, LOWER(LEFT(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'), 3)) || '123') 
            WHERE username IS NULL OR password IS NULL;
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

        // Agregar columnas username y password si no existen
        await client.query(`
            ALTER TABLE sedes ADD COLUMN IF NOT EXISTS username VARCHAR(100),
            ADD COLUMN IF NOT EXISTS password VARCHAR(100);
        `);
        
        // Auto-reparar credenciales de sedes nulas si existen
        await client.query(`
            UPDATE sedes SET 
                username = COALESCE(username, 'sede_' || LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'))), 
                password = COALESCE(password, LOWER(LEFT(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'), 3)) || '123') 
            WHERE username IS NULL OR password IS NULL;
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
        
        // Tabla Pagos de Suscripción Mensual de Empresas
        await client.query(`
            CREATE TABLE IF NOT EXISTS company_payments (
                id VARCHAR(50) PRIMARY KEY,
                company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
                billing_period VARCHAR(50) NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                due_date VARCHAR(50) NOT NULL,
                pay_date VARCHAR(50),
                status VARCHAR(20) DEFAULT 'Pendiente'
            )
        `);
        
        await client.query('COMMIT');
        console.log("✔ Estructura de tablas de PostgreSQL verificada/creada correctamente.");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ Error inicializando tablas PostgreSQL en la nube:", e);
        // Si hay DATABASE_URL, debemos mantener el uso de Postgres de manera mandatoria
        if (process.env.DATABASE_URL) {
            usePostgres = true;
        } else {
            usePostgres = false;
        }
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
            const repairedRows = [];
            for (let r of rows) {
                if (!r.username || r.username.trim() === "" || !r.password || r.password.trim() === "") {
                    const cleanSlug = r.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'empresa';
                    const randomNum = Math.floor(100 + Math.random() * 900);
                    const generatedUser = r.username && r.username.trim() !== "" ? r.username : cleanSlug;
                    const generatedPass = r.password && r.password.trim() !== "" ? r.password : (cleanSlug.slice(0, 3) + randomNum);
                    
                    await pool.query('UPDATE companies SET username = $1, password = $2 WHERE id = $3', [generatedUser, generatedPass, r.id]);
                    r.username = generatedUser;
                    r.password = generatedPass;
                }
                repairedRows.push(r);
            }
            res.json(repairedRows.map(r => ({ 
                id: r.id, 
                name: r.name, 
                ruc: r.ruc, 
                logo: r.logo, 
                color: r.color,
                username: r.username,
                password: r.password,
                planName: r.plan_name || 'Plan Profesional',
                services: r.services || 'Boletería,Flota',
                billingCycle: r.billing_cycle || 'Mensual',
                createdAt: r.created_at,
                paymentMethods: (r.payment_methods !== null && r.payment_methods !== undefined) ? (r.payment_methods === '' ? [] : r.payment_methods.split(',')) : ['Efectivo', 'Yape/Plin']
            })));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        // Asegurar que existan credenciales para empresas en el fallback JSON local
        localDb.companies.forEach(c => {
            if (!c.username || c.username.trim() === "" || !c.password || c.password.trim() === "") {
                const cleanSlug = c.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'empresa';
                const randomNum = Math.floor(100 + Math.random() * 900);
                c.username = c.username && c.username.trim() !== "" ? c.username : cleanSlug;
                c.password = c.password && c.password.trim() !== "" ? c.password : (cleanSlug.slice(0, 3) + randomNum);
            }
            c.planName = c.planName || 'Plan Profesional';
            c.services = c.services || 'Boletería,Flota';
            c.billingCycle = c.billingCycle || 'Mensual';
            c.createdAt = c.createdAt || new Date().toISOString();
        });
        saveLocalDb();
        res.json(localDb.companies.map(c => ({
            ...c,
            planName: c.planName || 'Plan Profesional',
            services: c.services || 'Boletería,Flota',
            billingCycle: c.billingCycle || 'Mensual',
            createdAt: c.createdAt || new Date().toISOString(),
            paymentMethods: c.paymentMethods || ['Efectivo', 'Yape/Plin']
        })));
    }
});

app.post('/api/companies', async (req, res) => {
    const { name, ruc, logo, color, username, password, planName, services, billingCycle } = req.body;
    const id = generateId();
    const defaultMethods = 'Efectivo,Yape/Plin';
    const finalPlanName = planName || 'Plan Profesional';
    const finalServices = services || 'Boletería,Flota';
    const finalBillingCycle = billingCycle || 'Mensual';
    
    if (usePostgres) {
        try {
            await pool.query(
                'INSERT INTO companies (id, name, ruc, logo, color, payment_methods, username, password, plan_name, services, billing_cycle) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
                [id, name, ruc, logo || "", color || "#6366f1", defaultMethods, username || "", password || "", finalPlanName, finalServices, finalBillingCycle]
            );
            res.json({ id });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const company = { 
            id, 
            name, 
            ruc, 
            logo: logo || "", 
            color: color || "#6366f1",
            username: username || "",
            password: password || "",
            planName: finalPlanName,
            services: finalServices,
            billingCycle: finalBillingCycle,
            createdAt: new Date().toISOString(),
            paymentMethods: ['Efectivo', 'Yape/Plin'] 
        };
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

app.put('/api/companies/:id/payment-methods', async (req, res) => {
    const { id } = req.params;
    const { paymentMethods } = req.body; // array de strings
    const methodsStr = Array.isArray(paymentMethods) ? paymentMethods.join(',') : 'Efectivo,Yape/Plin';

    if (usePostgres) {
        try {
            await pool.query('UPDATE companies SET payment_methods = $1 WHERE id = $2', [methodsStr, id]);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const company = localDb.companies.find(c => c.id === id);
        if (company) {
            company.paymentMethods = Array.isArray(paymentMethods) ? paymentMethods : ['Efectivo', 'Yape/Plin'];
            saveLocalDb();
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Company not found" });
        }
    }
});

app.put('/api/companies/:id/credentials', async (req, res) => {
    const { id } = req.params;
    const { username, password } = req.body;

    if (usePostgres) {
        try {
            await pool.query('UPDATE companies SET username = $1, password = $2 WHERE id = $3', [username, password, id]);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const company = localDb.companies.find(c => c.id === id);
        if (company) {
            company.username = username;
            company.password = password;
            saveLocalDb();
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Company not found" });
        }
    }
});

app.put('/api/companies/:id/services', async (req, res) => {
    const { id } = req.params;
    const { planName, services } = req.body;

    if (usePostgres) {
        try {
            await pool.query(
                'UPDATE companies SET plan_name = $1, services = $2 WHERE id = $3',
                [planName, services, id]
            );
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const company = localDb.companies.find(c => c.id === id);
        if (company) {
            company.planName = planName;
            company.services = services;
            saveLocalDb();
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Company not found" });
        }
    }
});

app.get('/api/payments', async (req, res) => {
    if (usePostgres) {
        try {
            const { rows } = await pool.query(`
                SELECT cp.*, c.name as company_name 
                FROM company_payments cp
                JOIN companies c ON cp.company_id = c.id
                ORDER BY cp.due_date DESC
            `);
            res.json(rows.map(r => ({
                id: r.id,
                companyId: r.company_id,
                companyName: r.company_name,
                billingPeriod: r.billing_period,
                amount: parseFloat(r.amount),
                dueDate: r.due_date,
                payDate: r.pay_date,
                status: r.status
            })));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        localDb.payments = localDb.payments || [];
        const enriched = localDb.payments.map(p => {
            const company = localDb.companies.find(c => c.id === p.companyId);
            return {
                ...p,
                companyName: company ? company.name : 'Empresa Desconocida'
            };
        });
        // Ordenar por fecha de vencimiento desc
        enriched.sort((a, b) => b.dueDate.localeCompare(a.dueDate));
        res.json(enriched);
    }
});

app.post('/api/payments', async (req, res) => {
    const { companyId, billingPeriod, amount, dueDate, status, payDate } = req.body;
    const id = generateId();

    if (usePostgres) {
        try {
            await pool.query(
                'INSERT INTO company_payments (id, company_id, billing_period, amount, due_date, status, pay_date) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [id, companyId, billingPeriod, amount, dueDate, status || 'Pendiente', payDate || null]
            );
            res.json({ id });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        localDb.payments = localDb.payments || [];
        const newPayment = {
            id,
            companyId,
            billingPeriod,
            amount: parseFloat(amount),
            dueDate,
            status: status || 'Pendiente',
            payDate: payDate || null
        };
        localDb.payments.push(newPayment);
        saveLocalDb();
        res.json(newPayment);
    }
});

app.put('/api/payments/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, payDate } = req.body;

    if (usePostgres) {
        try {
            await pool.query(
                'UPDATE company_payments SET status = $1, pay_date = $2 WHERE id = $3',
                [status, payDate || null, id]
            );
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        localDb.payments = localDb.payments || [];
        const payment = localDb.payments.find(p => p.id === id);
        if (payment) {
            payment.status = status;
            payment.payDate = payDate || null;
            saveLocalDb();
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Payment not found" });
        }
    }
});

app.put('/api/sedes/:id/credentials', async (req, res) => {
    const { id } = req.params;
    const { username, password } = req.body;

    if (usePostgres) {
        try {
            await pool.query('UPDATE sedes SET username = $1, password = $2 WHERE id = $3', [username, password, id]);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const sede = localDb.sedes.find(s => s.id === id);
        if (sede) {
            sede.username = username;
            sede.password = password;
            saveLocalDb();
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Sede not found" });
        }
    }
});

// --- SEDES ---
app.get('/api/sedes', async (req, res) => {
    if (usePostgres) {
        try {
            const { rows } = await pool.query('SELECT * FROM sedes ORDER BY created_at ASC');
            const repairedRows = [];
            for (let r of rows) {
                if (!r.username || r.username.trim() === "" || !r.password || r.password.trim() === "") {
                    const cleanSlug = 'sede_' + (r.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'sede');
                    const randomNum = Math.floor(100 + Math.random() * 900);
                    const generatedUser = r.username && r.username.trim() !== "" ? r.username : cleanSlug;
                    const generatedPass = r.password && r.password.trim() !== "" ? r.password : (cleanSlug.slice(0, 3) + randomNum);
                    
                    await pool.query('UPDATE sedes SET username = $1, password = $2 WHERE id = $3', [generatedUser, generatedPass, r.id]);
                    r.username = generatedUser;
                    r.password = generatedPass;
                }
                repairedRows.push(r);
            }
            res.json(repairedRows.map(r => ({ 
                id: r.id, 
                companyId: r.company_id, 
                name: r.name, 
                city: r.city, 
                address: r.address,
                username: r.username,
                password: r.password
            })));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        // Asegurar que existan credenciales para sedes en el fallback JSON local
        localDb.sedes.forEach(s => {
            if (!s.username || s.username.trim() === "" || !s.password || s.password.trim() === "") {
                const cleanSlug = 'sede_' + (s.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'sede');
                const randomNum = Math.floor(100 + Math.random() * 900);
                s.username = s.username && s.username.trim() !== "" ? s.username : cleanSlug;
                s.password = s.password && s.password.trim() !== "" ? s.password : (cleanSlug.slice(0, 3) + randomNum);
            }
        });
        saveLocalDb();
        res.json(localDb.sedes);
    }
});

app.post('/api/sedes', async (req, res) => {
    const { companyId, name, city, address, username, password } = req.body;
    const id = generateId();
    
    // Autogenerar credenciales robustas si no se suministran
    const cleanSlug = 'sede_' + (name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15) || 'sede');
    const randomNum = Math.floor(100 + Math.random() * 900);
    const finalUser = username && username.trim() !== "" ? username.trim() : cleanSlug;
    const finalPass = password && password.trim() !== "" ? password.trim() : (cleanSlug.slice(0, 3) + randomNum);

    console.log(`[CREAR SEDE] Registrando sede: "${name}". Empresa: "${companyId}". Usuario: "${finalUser}". Contraseña: "${finalPass}"`);

    if (usePostgres) {
        try {
            await pool.query(
                'INSERT INTO sedes (id, company_id, name, city, address, username, password) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [id, companyId, name, city, address, finalUser, finalPass]
            );
            console.log(`[CREAR SEDE] Sede guardada exitosamente en PostgreSQL con ID: ${id}`);
            res.json({ id, username: finalUser, password: finalPass });
        } catch (e) {
            console.error(`[CREAR SEDE] Error al guardar en PostgreSQL:`, e);
            res.status(500).json({ success: false, error: 'Error al registrar la sede en la base de datos: ' + e.message });
        }
    } else {
        const sede = { id, companyId, name, city, address, username: finalUser, password: finalPass };
        localDb.sedes.push(sede);
        saveLocalDb();
        console.log(`[CREAR SEDE] Sede guardada exitosamente en JSON local con ID: ${id}`);
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

// --- ENDPOINTS DE AUTENTICACIÓN MULTI-NIVEL ---

// 1. Login Super Admin (Con validación de Google Email)
app.post('/api/login/superadmin', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ success: false, error: 'Falta proporcionar el correo electrónico.' });
    }
    
    if (email === 'syscomecosistemadigital@gmail.com') {
        res.json({ 
            success: true, 
            user: { email: 'syscomecosistemadigital@gmail.com', role: 'super-admin' } 
        });
    } else {
        res.status(403).json({ 
            success: false, 
            error: 'Acceso Denegado. Solo se permite el ingreso con la cuenta syscomecosistemadigital@gmail.com.' 
        });
    }
});

// 2. Login Admin de Empresa (Usuario y Contraseña)
app.post('/api/login/admin', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Falta proporcionar usuario y contraseña.' });
    }
    
    if (usePostgres) {
        try {
            const { rows } = await pool.query(
                'SELECT * FROM companies WHERE username = $1 AND password = $2',
                [username.trim(), password.trim()]
            );
            if (rows.length > 0) {
                const c = rows[0];
                res.json({
                    success: true,
                    company: { id: c.id, name: c.name, color: c.color, logo: c.logo }
                });
            } else {
                res.status(401).json({ success: false, error: 'Usuario o contraseña de empresa incorrectos.' });
            }
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const company = localDb.companies.find(
            c => c.username === username.trim() && c.password === password.trim()
        );
        if (company) {
            res.json({
                success: true,
                company: { id: company.id, name: company.name, color: company.color, logo: company.logo }
            });
        } else {
            res.status(401).json({ success: false, error: 'Usuario o contraseña de empresa incorrectos.' });
        }
    }
});

// 3. Login Sede (Usuario y Contraseña)
app.post('/api/login/sede', async (req, res) => {
    const { username, password } = req.body;
    
    console.log(`[LOGIN SEDE] Intento de ingreso. Usuario recibido: "${username}", Contraseña: "${password}" (Postgres activo: ${usePostgres})`);

    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Falta proporcionar usuario y contraseña.' });
    }
    
    const uClean = username.trim();
    const pClean = password.trim();

    if (usePostgres) {
        try {
            // Búsqueda insensible a mayúsculas/minúsculas para el username
            const { rows } = await pool.query(
                'SELECT * FROM sedes WHERE LOWER(username) = LOWER($1)',
                [uClean]
            );
            
            console.log(`[LOGIN SEDE] Registros encontrados en PostgreSQL para "${uClean}": ${rows.length}`);
            
            if (rows.length > 0) {
                const s = rows[0];
                const dbPass = (s.password || '').trim();
                console.log(`[LOGIN SEDE] Coincidencia encontrada. Sede: "${s.name}". Usuario en BD: "${s.username}". Comparando pass: BD "${dbPass}" vs ingresada "${pClean}"`);
                
                if (dbPass === pClean) {
                    console.log(`[LOGIN SEDE] Autenticación EXITOSA para sede: ${s.name}`);
                    res.json({
                        success: true,
                        sede: { id: s.id, name: s.name, companyId: s.company_id }
                    });
                } else {
                    console.log(`[LOGIN SEDE] Contraseña INCORRECTA para la sede: ${s.name}`);
                    res.status(401).json({ success: false, error: 'Usuario o contraseña de sede incorrectos.' });
                }
            } else {
                console.log(`[LOGIN SEDE] Usuario "${uClean}" NO existe en la base de datos de PostgreSQL.`);
                
                // DIAGNÓSTICO EN TIEMPO REAL EN CONSOLA: Listar sedes para ver qué hay en BD
                try {
                    const allS = await pool.query('SELECT id, name, username, password FROM sedes LIMIT 20');
                    console.log(`[DIAGNÓSTICO LOGIN SEDE] Lista de sedes en Postgres físicas (${allS.rows.length}):`);
                    allS.rows.forEach(item => {
                        console.log(`   - ID: ${item.id} | Sede: "${item.name}" | Usuario BD: "${item.username}" | Pass BD: "${item.password}"`);
                    });
                } catch (diagErr) {
                    console.error('[DIAGNÓSTICO LOGIN SEDE] Falló la consulta de apoyo diagnóstica:', diagErr.message);
                }
                
                res.status(401).json({ success: false, error: 'Usuario o contraseña de sede incorrectos.' });
            }
        } catch (e) {
            console.error('[LOGIN SEDE] Error grave en consulta PostgreSQL:', e);
            res.status(500).json({ success: false, error: 'Error del servidor al validar credenciales: ' + e.message });
        }
    } else {
        const sede = localDb.sedes.find(
            s => (s.username || '').trim().toLowerCase() === uClean.toLowerCase()
        );
        
        if (sede) {
            const dbPass = (sede.password || '').trim();
            console.log(`[LOGIN SEDE LOCAL] Sede encontrada: "${sede.name}". Comparando pass: BD "${dbPass}" vs ingresada "${pClean}"`);
            
            if (dbPass === pClean) {
                console.log(`[LOGIN SEDE LOCAL] Autenticación EXITOSA para sede: ${sede.name}`);
                res.json({
                    success: true,
                    sede: { id: sede.id, name: sede.name, companyId: sede.companyId }
                });
            } else {
                console.log(`[LOGIN SEDE LOCAL] Contraseña INCORRECTA para sede: ${sede.name}`);
                res.status(401).json({ success: false, error: 'Usuario o contraseña de sede incorrectos.' });
            }
        } else {
            console.log(`[LOGIN SEDE LOCAL] Usuario "${uClean}" no encontrado en JSON local.`);
            res.status(401).json({ success: false, error: 'Usuario o contraseña de sede incorrectos.' });
        }
    }
});

// --- CARGAR DATOS SEMILLA ---
app.post('/api/seed', async (req, res) => {
    try {
        console.log("Precargando datos semilla...");
        
        // Estructura semilla
        const seedCompanies = [
            { id: "flores", name: "Expreso Flores", ruc: "20456789123", logo: "", color: "#f97316", username: "flores", password: "123", paymentMethods: ['Efectivo', 'Yape/Plin', 'Tarjeta Visa'], planName: 'Plan Enterprise', services: 'Boletería,Flota,Encomiendas,GPS Satelital', billingCycle: 'Semestral' },
            { id: "cruzdelsur", name: "Cruz del Sur VIP", ruc: "20102030401", logo: "", color: "#3b82f6", username: "cruzdelsur", password: "123", paymentMethods: ['Efectivo', 'Yape/Plin', 'Tarjeta Visa', 'Transferencia BCP'], planName: 'Plan Enterprise', services: 'Boletería,Flota,Pasarela Online,GPS Satelital', billingCycle: 'Anual' },
            { id: "combi", name: "Combi Rápido Express", ruc: "20998877665", logo: "", color: "#f59e0b", username: "combi", password: "123", paymentMethods: ['Efectivo', 'Yape/Plin'], planName: 'Plan Básico', services: 'Boletería', billingCycle: 'Mensual' }
        ];
        
        const seedSedes = [
            { id: "sede-fl-1", companyId: "flores", name: "Terminal Lima Norte", city: "Lima", address: "Av. Gerardo Unger 6500", username: "flores_lima", password: "123" },
            { id: "sede-fl-2", companyId: "flores", name: "Terminal Arequipa", city: "Arequipa", address: "Av. Arturo Ibáñez s/n", username: "flores_arequipa", password: "123" },
            { id: "sede-cds-1", companyId: "cruzdelsur", name: "Sede Cruz del Sur Centro", city: "Lima", address: "Av. Javier Prado Este 1109", username: "cds_centro", password: "123" },
            { id: "sede-com-1", companyId: "combi", name: "Terminal Colectivos San Juan", city: "Lima", address: "Av. Los Héroes 450", username: "combi_sanjuan", password: "123" }
        ];
        
        const seedTrabajadores = [
            { id: "tr-1", companyId: "flores", sedeId: "sede-fl-1", name: "Roberto", lastname: "Gómez", dni: "44123456", role: "Vendedor de Pasajes" },
            { id: "tr-2", companyId: "flores", sedeId: "sede-fl-1", name: "Patricia", lastname: "Flores", dni: "45987654", role: "Jefe de Terminal" },
            { id: "tr-3", companyId: "cruzdelsur", sedeId: "sede-cds-1", name: "Carlos", lastname: "Mendoza", dni: "70554433", role: "Vendedor de Pasajes" },
            { id: "tr-4", companyId: "combi", sedeId: "sede-com-1", name: "Manuel", lastname: "Yauri", dni: "10203040", role: "Vendedor de Pasajes" },
            { id: "tr-5", companyId: "flores", sedeId: "sede-fl-1", name: "Julio", lastname: "Prado", dni: "42109876", role: "Conductor Principal" },
            { id: "tr-6", companyId: "flores", sedeId: "sede-fl-1", name: "Sofía", lastname: "Linares", dni: "46321098", role: "Terramozo(a)" }
        ];
        
        const seedMovilidades = [
            { id: "mov-1", companyId: "flores", SedeId: "sede-fl-1", plate: "F3W-902", brand: "Volvo B430R", modelType: "bus1p", routeFrom: "Lima", routeTo: "Arequipa", price: 60 },
            { id: "mov-2", companyId: "flores", SedeId: "sede-fl-1", plate: "A9P-231", brand: "Mercedes DoubleDecker", modelType: "bus2p", routeFrom: "Lima", routeTo: "Cusco", price: 90 },
            { id: "mov-3", companyId: "cruzdelsur", SedeId: "sede-cds-1", plate: "C5S-991", brand: "Scania K410", modelType: "bus1p", routeFrom: "Lima", routeTo: "Ica", price: 45 },
            { id: "mov-4", companyId: "combi", SedeId: "sede-com-1", plate: "T8O-114", brand: "Toyota HiAce rural", modelType: "combi", routeFrom: "Lima", routeTo: "Cañete", price: 20 },
            { id: "mov-5", companyId: "combi", SedeId: "sede-com-1", plate: "B9U-225", brand: "Mitsubishi Fuso", modelType: "minibus", routeFrom: "Lima", routeTo: "Huacho", price: 30 }
        ];

        const seedPayments = [
            { id: "pay-1", companyId: "flores", billingPeriod: "Mayo 2026", amount: 580, dueDate: "2026-05-15", payDate: "2026-05-14", status: "Pagado" },
            { id: "pay-2", companyId: "flores", billingPeriod: "Junio 2026", amount: 580, dueDate: "2026-06-15", payDate: null, status: "Pendiente" },
            { id: "pay-3", companyId: "cruzdelsur", billingPeriod: "Mayo 2026", amount: 610, dueDate: "2026-05-15", payDate: "2026-05-13", status: "Pagado" },
            { id: "pay-4", companyId: "cruzdelsur", billingPeriod: "Junio 2026", amount: 610, dueDate: "2026-06-15", payDate: null, status: "Pendiente" },
            { id: "pay-5", companyId: "combi", billingPeriod: "Mayo 2026", amount: 100, dueDate: "2026-05-15", payDate: null, status: "Vencido" },
            { id: "pay-6", companyId: "combi", billingPeriod: "Junio 2026", amount: 100, dueDate: "2026-06-15", payDate: null, status: "Pendiente" }
        ];

        if (usePostgres) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                
                // Limpiar previamente
                await client.query('DELETE FROM company_payments');
                await client.query('DELETE FROM tickets');
                await client.query('DELETE FROM movilidades');
                await client.query('DELETE FROM trabajadores');
                await client.query('DELETE FROM sedes');
                await client.query('DELETE FROM companies');
                
                // Cargar empresas
                for (const c of seedCompanies) {
                    const mStr = c.paymentMethods ? c.paymentMethods.join(',') : 'Efectivo,Yape/Plin';
                    await client.query('INSERT INTO companies (id, name, ruc, logo, color, username, password, payment_methods, plan_name, services, billing_cycle) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)', 
                        [c.id, c.name, c.ruc, c.logo, c.color, c.username, c.password, mStr, c.planName, c.services, c.billingCycle || 'Mensual']);
                }
                
                // Cargar sedes
                for (const s of seedSedes) {
                    await client.query('INSERT INTO sedes (id, company_id, name, city, address, username, password) VALUES ($1, $2, $3, $4, $5, $6, $7)', [s.id, s.companyId, s.name, s.city, s.address, s.username, s.password]);
                }
                
                // Cargar trabajadores
                for (const t of seedTrabajadores) {
                    await client.query('INSERT INTO trabajadores (id, company_id, sede_id, name, lastname, dni, role) VALUES ($1, $2, $3, $4, $5, $6, $7)', [t.id, t.companyId, t.sedeId, t.name, t.lastname, t.dni, t.role]);
                }
                
                // Cargar movilidades
                for (const m of seedMovilidades) {
                    await client.query('INSERT INTO movilidades (id, company_id, sede_id, plate, brand, model_type, route_from, route_to, price) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [m.id, m.companyId, m.SedeId, m.plate, m.brand, m.modelType, m.routeFrom, m.routeTo, m.price]);
                }

                // Cargar pagos de prueba
                for (const p of seedPayments) {
                    await client.query('INSERT INTO company_payments (id, company_id, billing_period, amount, due_date, status, pay_date) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                        [p.id, p.companyId, p.billingPeriod, p.amount, p.dueDate, p.status, p.payDate]);
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
            localDb.payments = seedPayments;
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

// Endpoint de Diagnóstico del estado real de la base de datos
app.get('/api/diagnose-db', async (req, res) => {
    try {
        const diagnostics = {
            postgresActive: usePostgres,
            databaseUrlPresent: !!process.env.DATABASE_URL,
            timestamp: new Date().toISOString(),
            counts: {
                companies: 0,
                sedes: 0,
                trabajadores: 0,
                movilidades: 0,
                tickets: 0
            },
            companies: [],
            sedes: []
        };

        if (usePostgres) {
            try {
                const countComp = await pool.query('SELECT COUNT(*) FROM companies');
                const countSede = await pool.query('SELECT COUNT(*) FROM sedes');
                const countTrab = await pool.query('SELECT COUNT(*) FROM trabajadores');
                const countMov  = await pool.query('SELECT COUNT(*) FROM movilidades');
                const countTick = await pool.query('SELECT COUNT(*) FROM tickets');

                diagnostics.counts.companies = parseInt(countComp.rows[0].count);
                diagnostics.counts.sedes = parseInt(countSede.rows[0].count);
                diagnostics.counts.trabajadores = parseInt(countTrab.rows[0].count);
                diagnostics.counts.movilidades = parseInt(countMov.rows[0].count);
                diagnostics.counts.tickets = parseInt(countTick.rows[0].count);

                const compRows = await pool.query('SELECT id, name, ruc, username, password, plan_name, billing_cycle FROM companies');
                diagnostics.companies = compRows.rows;

                const sedeRows = await pool.query('SELECT id, company_id, name, username, password FROM sedes');
                diagnostics.sedes = sedeRows.rows;
            } catch (dbErr) {
                diagnostics.error = "Error al consultar tablas de PostgreSQL: " + dbErr.message;
            }
        } else {
            diagnostics.counts.companies = localDb.companies.length;
            diagnostics.counts.sedes = localDb.sedes.length;
            diagnostics.counts.trabajadores = localDb.trabajadores.length;
            diagnostics.counts.movilidades = localDb.movilidades.length;
            diagnostics.counts.tickets = localDb.tickets.length;

            diagnostics.companies = localDb.companies.map(c => ({ id: c.id, name: c.name, ruc: c.ruc, username: c.username, password: c.password, plan_name: c.planName, billing_cycle: c.billingCycle }));
            diagnostics.sedes = localDb.sedes.map(s => ({ id: s.id, company_id: s.companyId, name: s.name, username: s.username, password: s.password }));
        }

        res.json(diagnostics);
    } catch (err) {
        res.status(500).json({ error: "Error grave en diagnóstico: " + err.message });
    }
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
