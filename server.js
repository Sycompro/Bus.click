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

// Asegurar catálogo de planes y servicios en localDb si no existen
if (!localDb.saas_plans) localDb.saas_plans = [];
if (!localDb.saas_services) localDb.saas_services = [];

if (localDb.saas_plans.length === 0) {
    localDb.saas_plans = [
        { id: 'plan-bas', name: 'Plan Básico', price: 100.00 },
        { id: 'plan-pro', name: 'Plan Profesional', price: 250.00 },
        { id: 'plan-ent', name: 'Plan Enterprise', price: 500.00 }
    ];
}
if (localDb.saas_services.length === 0) {
    localDb.saas_services = [
        { id: 'serv-bol', name: 'Boletería', description: 'Sistema de emisión de pasajes y mapa de asientos.' },
        { id: 'serv-flo', name: 'Flota', description: 'Administración y control de vehículos.' },
        { id: 'serv-enc', name: 'Encomiendas', description: 'Gestión de envíos y paquetes.' },
        { id: 'serv-gps', name: 'GPS Satelital', description: 'Monitoreo en tiempo real.' },
        { id: 'serv-pas', name: 'Pasarela Online', description: 'Cobros digitales.' }
    ];
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
        
        // Agregar columnas payment_methods, username, password, plan_name, services y soporte si no existen
        await client.query(`
            ALTER TABLE companies ADD COLUMN IF NOT EXISTS payment_methods TEXT DEFAULT 'Efectivo,Yape/Plin',
            ADD COLUMN IF NOT EXISTS username VARCHAR(100),
            ADD COLUMN IF NOT EXISTS password VARCHAR(100),
            ADD COLUMN IF NOT EXISTS plan_name VARCHAR(100) DEFAULT 'Plan Profesional',
            ADD COLUMN IF NOT EXISTS services TEXT DEFAULT 'Boletería,Flota',
            ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(50) DEFAULT 'Mensual',
            ADD COLUMN IF NOT EXISTS support_phone VARCHAR(50) DEFAULT '+51 987 654 321',
            ADD COLUMN IF NOT EXISTS support_email VARCHAR(100) DEFAULT 'soporte@empresa.com',
            ADD COLUMN IF NOT EXISTS support_message VARCHAR(300) DEFAULT 'Contáctanos por nuestros canales de soporte oficiales 24/7 para cambios, reprogramaciones o anulaciones de tu viaje.',
            ADD COLUMN IF NOT EXISTS whatsapp_url TEXT DEFAULT 'https://qr-api-wps-production.up.railway.app/api/external/send-message',
            ADD COLUMN IF NOT EXISTS whatsapp_api_key TEXT DEFAULT 'busclick_master_key';
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

        // Expandir tabla movilidades para soporte de Flota Adaptable (Fija vs Flotante)
        await client.query(`
            ALTER TABLE movilidades 
            ADD COLUMN IF NOT EXISTS tipo_logica VARCHAR(20) DEFAULT 'Fija',
            ADD COLUMN IF NOT EXISTS ubicacion_actual_sede_id VARCHAR(50) REFERENCES sedes(id),
            ADD COLUMN IF NOT EXISTS estado_operativo VARCHAR(20) DEFAULT 'Disponible';
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
        
        await client.query(`
            ALTER TABLE tickets ADD COLUMN IF NOT EXISTS passenger_whatsapp VARCHAR(50);
            ALTER TABLE tickets ADD COLUMN IF NOT EXISTS doc_type VARCHAR(50) DEFAULT 'Ticket Simple';
            ALTER TABLE tickets ADD COLUMN IF NOT EXISTS doc_ruc VARCHAR(20);
            ALTER TABLE tickets ADD COLUMN IF NOT EXISTS doc_razon_social VARCHAR(250);
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

        // Tabla Planes SaaS Globales
        await client.query(`
            CREATE TABLE IF NOT EXISTS saas_plans (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabla Servicios SaaS Globales
        await client.query(`
            CREATE TABLE IF NOT EXISTS saas_services (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Sembrar Planes SaaS si la tabla está vacía
        const planCheck = await client.query('SELECT COUNT(*) FROM saas_plans');
        if (parseInt(planCheck.rows[0].count) === 0) {
            console.log("🌱 Sembrando planes SaaS globales en PostgreSQL...");
            await client.query("INSERT INTO saas_plans (id, name, price) VALUES ('plan-bas', 'Plan Básico', 100.00)");
            await client.query("INSERT INTO saas_plans (id, name, price) VALUES ('plan-pro', 'Plan Profesional', 250.00)");
            await client.query("INSERT INTO saas_plans (id, name, price) VALUES ('plan-ent', 'Plan Enterprise', 500.00)");
        }

        // Sembrar Servicios SaaS si la tabla está vacía
        const servCheck = await client.query('SELECT COUNT(*) FROM saas_services');
        if (parseInt(servCheck.rows[0].count) === 0) {
            console.log("🌱 Sembrando servicios SaaS globales en PostgreSQL...");
            await client.query("INSERT INTO saas_services (id, name, description) VALUES ('serv-bol', 'Boletería', 'Sistema de emisión de pasajes y mapa de asientos en tiempo real.')");
            await client.query("INSERT INTO saas_services (id, name, description) VALUES ('serv-flo', 'Flota', 'Administración y control de vehículos, buses, minibuses y combis.')");
            await client.query("INSERT INTO saas_services (id, name, description) VALUES ('serv-enc', 'Encomiendas', 'Gestión de envíos, almacén y entrega de paquetes.')");
            await client.query("INSERT INTO saas_services (id, name, description) VALUES ('serv-gps', 'GPS Satelital', 'Monitoreo en tiempo real de vehículos de la flota.')");
            await client.query("INSERT INTO saas_services (id, name, description) VALUES ('serv-pas', 'Pasarela Online', 'Cobros digitales e integración de pasarelas de pago.')");
        }
        
        await client.query('COMMIT');
        console.log("✔ Estructura de tablas y catálogos SaaS de PostgreSQL verificados/creados correctamente.");
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
                supportPhone: r.support_phone || '+51 987 654 321',
                supportEmail: r.support_email || 'soporte@empresa.com',
                supportMessage: r.support_message || 'Contáctanos por nuestros canales de soporte oficiales 24/7 para cambios, reprogramaciones o anulaciones de tu viaje.',
                whatsappUrl: r.whatsapp_url || 'https://qr-api-wps-production.up.railway.app/api/external/send-message',
                whatsappApiKey: r.whatsapp_api_key || 'busclick_master_key',
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
            c.whatsappUrl = c.whatsappUrl || 'https://qr-api-wps-production.up.railway.app/api/external/send-message';
            c.whatsappApiKey = c.whatsappApiKey || 'busclick_master_key';
            c.createdAt = c.createdAt || new Date().toISOString();
        });
        saveLocalDb();
        res.json(localDb.companies.map(c => ({
            ...c,
            planName: c.planName || 'Plan Profesional',
            services: c.services || 'Boletería,Flota',
            billingCycle: c.billingCycle || 'Mensual',
            whatsappUrl: c.whatsappUrl || 'https://qr-api-wps-production.up.railway.app/api/external/send-message',
            whatsappApiKey: c.whatsappApiKey || 'busclick_master_key',
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

app.put('/api/companies/:id/support', async (req, res) => {
    const { id } = req.params;
    const { supportPhone, supportEmail, supportMessage } = req.body;

    if (usePostgres) {
        try {
            await pool.query(
                'UPDATE companies SET support_phone = $1, support_email = $2, support_message = $3 WHERE id = $4',
                [supportPhone || "", supportEmail || "", supportMessage || "", id]
            );
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const company = localDb.companies.find(c => c.id === id);
        if (company) {
            company.supportPhone = supportPhone || "";
            company.supportEmail = supportEmail || "";
            company.supportMessage = supportMessage || "";
            saveLocalDb();
            res.json({ success: true });
        } else {
            res.status(404).json({ error: "Company not found" });
        }
    }
});

app.put('/api/companies/:id/whatsapp', async (req, res) => {
    const { id } = req.params;
    const { whatsappUrl, whatsappApiKey } = req.body;

    if (usePostgres) {
        try {
            await pool.query(
                'UPDATE companies SET whatsapp_url = $1, whatsapp_api_key = $2 WHERE id = $3',
                [whatsappUrl || "", whatsappApiKey || "", id]
            );
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const company = localDb.companies.find(c => c.id === id);
        if (company) {
            company.whatsappUrl = whatsappUrl || "";
            company.whatsappApiKey = whatsappApiKey || "";
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
// --- CATALOGO GLOBAL DE PLANES SAAS ---
app.get('/api/saas/plans', async (req, res) => {
    if (usePostgres) {
        try {
            const { rows } = await pool.query('SELECT * FROM saas_plans ORDER BY price ASC');
            res.json(rows.map(r => ({ id: r.id, name: r.name, price: parseFloat(r.price) })));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        res.json(localDb.saas_plans || []);
    }
});

app.post('/api/saas/plans', async (req, res) => {
    const { name, price } = req.body;
    const id = 'plan-' + generateId();
    if (!name || isNaN(price)) {
        return res.status(400).json({ error: 'Nombre de plan y precio válidos requeridos.' });
    }

    if (usePostgres) {
        try {
            await pool.query('INSERT INTO saas_plans (id, name, price) VALUES ($1, $2, $3)', [id, name, price]);
            res.json({ success: true, plan: { id, name, price: parseFloat(price) } });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const plan = { id, name, price: parseFloat(price) };
        localDb.saas_plans = localDb.saas_plans || [];
        localDb.saas_plans.push(plan);
        saveLocalDb();
        res.json({ success: true, plan });
    }
});

app.put('/api/saas/plans/:id', async (req, res) => {
    const { id } = req.params;
    const { name, price } = req.body;
    if (!name || isNaN(price)) {
        return res.status(400).json({ error: 'Nombre de plan y precio válidos requeridos.' });
    }

    if (usePostgres) {
        try {
            await pool.query('UPDATE saas_plans SET name = $1, price = $2 WHERE id = $3', [name, price, id]);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const plan = localDb.saas_plans.find(p => p.id === id);
        if (plan) {
            plan.name = name;
            plan.price = parseFloat(price);
            saveLocalDb();
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Plan no encontrado' });
        }
    }
});

app.delete('/api/saas/plans/:id', async (req, res) => {
    const { id } = req.params;
    if (usePostgres) {
        try {
            await pool.query('DELETE FROM saas_plans WHERE id = $1', [id]);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        localDb.saas_plans = localDb.saas_plans.filter(p => p.id !== id);
        saveLocalDb();
        res.json({ success: true });
    }
});

// --- CATALOGO GLOBAL DE SERVICIOS SAAS ---
app.get('/api/saas/services', async (req, res) => {
    if (usePostgres) {
        try {
            const { rows } = await pool.query('SELECT * FROM saas_services ORDER BY name ASC');
            res.json(rows.map(r => ({ id: r.id, name: r.name, description: r.description })));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        res.json(localDb.saas_services || []);
    }
});

app.post('/api/saas/services', async (req, res) => {
    const { name, description } = req.body;
    const id = 'serv-' + generateId();
    if (!name) {
        return res.status(400).json({ error: 'El nombre del servicio es obligatorio.' });
    }

    if (usePostgres) {
        try {
            await pool.query('INSERT INTO saas_services (id, name, description) VALUES ($1, $2, $3)', [id, name, description || '']);
            res.json({ success: true, service: { id, name, description } });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const service = { id, name, description: description || '' };
        localDb.saas_services = localDb.saas_services || [];
        localDb.saas_services.push(service);
        saveLocalDb();
        res.json({ success: true, service });
    }
});

app.put('/api/saas/services/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'El nombre del servicio es obligatorio.' });
    }

    if (usePostgres) {
        try {
            await pool.query('UPDATE saas_services SET name = $1, description = $2 WHERE id = $3', [name, description || '', id]);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const service = localDb.saas_services.find(s => s.id === id);
        if (service) {
            service.name = name;
            service.description = description || '';
            saveLocalDb();
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Servicio no encontrado' });
        }
    }
});

app.delete('/api/saas/services/:id', async (req, res) => {
    const { id } = req.params;
    if (usePostgres) {
        try {
            await pool.query('DELETE FROM saas_services WHERE id = $1', [id]);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        localDb.saas_services = localDb.saas_services.filter(s => s.id !== id);
        saveLocalDb();
        res.json({ success: true });
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
            res.json(rows.map(r => ({ 
                id: r.id, 
                companyId: r.company_id, 
                sedeId: r.sede_id, 
                plate: r.plate, 
                brand: r.brand, 
                modelType: r.model_type, 
                routeFrom: r.route_from, 
                routeTo: r.route_to, 
                price: parseFloat(r.price),
                tipoLogica: r.tipo_logica || 'Fija',
                ubicacionActualSedeId: r.ubicacion_actual_sede_id || r.sede_id,
                estadoOperativo: r.estado_operativo || 'Disponible'
            })));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        // En localDb asegurar que las propiedades existan en el mapeo
        res.json((localDb.movilidades || []).map(m => ({
            ...m,
            tipoLogica: m.tipoLogica || 'Fija',
            ubicacionActualSedeId: m.ubicacionActualSedeId || m.sedeId,
            estadoOperativo: m.estadoOperativo || 'Disponible'
        })));
    }
});

app.post('/api/movilidades', async (req, res) => {
    const { companyId, sedeId, plate, brand, modelType, routeFrom, routeTo, price, tipoLogica } = req.body;
    const id = generateId();
    const finalTipoLogica = tipoLogica || 'Fija';
    const finalEstadoOperativo = 'Disponible';
    
    if (usePostgres) {
        try {
            await pool.query(
                'INSERT INTO movilidades (id, company_id, sede_id, plate, brand, model_type, route_from, route_to, price, tipo_logica, ubicacion_actual_sede_id, estado_operativo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
                [id, companyId, sedeId, plate.toUpperCase(), brand, modelType, routeFrom, routeTo, parseFloat(price), finalTipoLogica, sedeId, finalEstadoOperativo]
            );
            res.json({ id });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const movilidad = { 
            id, 
            companyId, 
            sedeId, 
            plate: plate.toUpperCase(), 
            brand, 
            modelType, 
            routeFrom, 
            routeTo, 
            price: parseFloat(price),
            tipoLogica: finalTipoLogica,
            ubicacionActualSedeId: sedeId,
            estadoOperativo: finalEstadoOperativo
        };
        localDb.movilidades = localDb.movilidades || [];
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
            
            // Lógica de Flota Flotante Adaptable: Viaje Exitoso
            if (status === 'Ocupado' || status === 'Reservado') {
                const movRes = await pool.query('SELECT tipo_logica, route_to, company_id FROM movilidades WHERE id = $1', [movilidadId]);
                if (movRes.rows.length > 0) {
                    const movObj = movRes.rows[0];
                    if (movObj.tipo_logica === 'Flotante') {
                        // Buscar sede correspondiente a la ciudad destino
                        const destSedeRes = await pool.query(
                            'SELECT id FROM sedes WHERE company_id = $1 AND LOWER(city) = LOWER($2) LIMIT 1',
                            [companyId, movObj.route_to]
                        );
                        if (destSedeRes.rows.length > 0) {
                            const destSedeId = destSedeRes.rows[0].id;
                            await pool.query(
                                'UPDATE movilidades SET ubicacion_actual_sede_id = $1 WHERE id = $2',
                                [destSedeId, movilidadId]
                            );
                            console.log(`🚚 Flota Adaptable: Vehículo ${movilidadId} (Flotante) despachado. Nueva ubicación física: Sede ID ${destSedeId} (${movObj.route_to}).`);
                        }
                    }
                }
            }
            res.json({ id });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const ticket = { 
            id, 
            companyId, 
            sedeId, 
            movilidadId, 
            seatNum, 
            floor, 
            passengerName, 
            passengerDni, 
            status, 
            paymentMethod, 
            price: parseFloat(price), 
            date,
            createdAt: new Date().toISOString()
        };
        localDb.tickets = localDb.tickets || [];
        localDb.tickets.push(ticket);
        
        // Lógica de Flota Flotante Adaptable (Local JSON Fallback)
        if (status === 'Ocupado' || status === 'Reservado') {
            const movObj = localDb.movilidades.find(m => m.id === movilidadId);
            if (movObj && (movObj.tipoLogica === 'Flotante' || movObj.tipo_logica === 'Flotante')) {
                const destSede = localDb.sedes.find(s => s.companyId === companyId && s.city.toLowerCase() === movObj.routeTo.toLowerCase());
                if (destSede) {
                    movObj.ubicacionActualSedeId = destSede.id;
                    console.log(`🚚 Flota Adaptable (JSON): Vehículo ${movilidadId} (Flotante) despachado. Nueva ubicación: Sede ID ${destSede.id}.`);
                }
            }
        }
        
        saveLocalDb();
        res.json(ticket);
    }
});

// --- RESERVA TEMPORAL OMNICANAL ---
app.post('/api/tickets/reserve-temporary', async (req, res) => {
    const { companyId, sedeId, movilidadId, seatNum, floor, passengerName, passengerDni, paymentMethod, price, date } = req.body;
    const id = generateId();
    const status = 'Reservado_Temporal';
    
    if (usePostgres) {
        try {
            // Verificar si el asiento ya está ocupado, reservado o reservado temporalmente
            const check = await pool.query(
                'SELECT id FROM tickets WHERE movilidad_id = $1 AND seat_num = $2 AND floor = $3 AND status IN (\'Ocupado\', \'Reservado\', \'Reservado_Temporal\')',
                [movilidadId, seatNum, floor]
            );
            if (check.rows.length > 0) {
                return res.status(400).json({ error: 'Asiento no disponible. Ya se encuentra vendido o reservado.' });
            }
            
            await pool.query(
                'INSERT INTO tickets (id, company_id, sede_id, movilidad_id, seat_num, floor, passenger_name, passenger_dni, status, payment_method, price, date_str) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
                [id, companyId, sedeId, movilidadId, seatNum, floor, passengerName || 'Reserva Temporal B2C', passengerDni || '00000000', status, paymentMethod || 'Yape/Plin', parseFloat(price || 0), date]
            );
            res.json({ id });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const exists = (localDb.tickets || []).some(t => t.movilidadId === movilidadId && t.seatNum === seatNum && t.floor === floor && ['Ocupado', 'Reservado', 'Reservado_Temporal'].includes(t.status));
        if (exists) {
            return res.status(400).json({ error: 'Asiento no disponible. Ya se encuentra vendido o reservado.' });
        }
        
        const ticket = {
            id,
            companyId,
            sedeId,
            movilidadId,
            seatNum,
            floor,
            passengerName: passengerName || 'Reserva Temporal B2C',
            passengerDni: passengerDni || '00000000',
            status,
            paymentMethod: paymentMethod || 'Yape/Plin',
            price: parseFloat(price || 0),
            date,
            createdAt: new Date().toISOString()
        };
        localDb.tickets = localDb.tickets || [];
        localDb.tickets.push(ticket);
        saveLocalDb();
        res.json(ticket);
    }
});

/* 📲 INTEGRACIÓN PREMIUM DE NOTIFICACIONES DE WHATSAPP ASÍNCRONAS */
async function sendWhatsappNotification(ticketId, passengerWhatsapp, passengerName, companyId, movilidadId, seatNum, floor, price, paymentMethod, docType = 'Ticket Simple') {
    if (!passengerWhatsapp) return;

    // Limpiar y sanitizar el número (sólo dígitos, y anteponer el prefijo 51 si es celular peruano de 9 dígitos)
    let cleanPhone = passengerWhatsapp.replace(/\D/g, '');
    if (cleanPhone.length === 9 && cleanPhone.startsWith('9')) {
        cleanPhone = '51' + cleanPhone;
    }
    
    try {
        let companyName = "Bus.click";
        let yapePhone = "987 654 321"; // fallback / yape por defecto
        let routeFrom = "Origen";
        let routeTo = "Destino";
        let travelDate = new Date().toLocaleDateString('es-PE');
        
        let whatsappUrl = 'https://qr-api-wps-production.up.railway.app/api/external/send-message';
        let whatsappApiKey = 'busclick_master_key';
        
        // Cargar información de la Empresa
        if (usePostgres) {
            const compRes = await pool.query('SELECT name, support_phone, whatsapp_url, whatsapp_api_key FROM companies WHERE id = $1', [companyId]);
            if (compRes.rows.length > 0) {
                companyName = compRes.rows[0].name;
                yapePhone = compRes.rows[0].support_phone || yapePhone;
                whatsappUrl = compRes.rows[0].whatsapp_url || whatsappUrl;
                whatsappApiKey = compRes.rows[0].whatsapp_api_key || whatsappApiKey;
            }
            
            // Cargar información de la Movilidad/Ruta (sin date_str)
            const movRes = await pool.query('SELECT route_from, route_to FROM movilidades WHERE id = $1', [movilidadId]);
            if (movRes.rows.length > 0) {
                routeFrom = movRes.rows[0].route_from;
                routeTo = movRes.rows[0].route_to;
            }
            
            // Cargar información del Ticket (date_str)
            const ticketRes = await pool.query('SELECT date_str FROM tickets WHERE id = $1', [ticketId]);
            if (ticketRes.rows.length > 0) {
                travelDate = ticketRes.rows[0].date_str;
            }
        } else {
            const compObj = localDb.companies.find(c => c.id === companyId);
            if (compObj) {
                companyName = compObj.name;
                yapePhone = compObj.supportPhone || compObj.support_phone || yapePhone;
                whatsappUrl = compObj.whatsappUrl || compObj.whatsapp_url || whatsappUrl;
                whatsappApiKey = compObj.whatsappApiKey || compObj.whatsapp_api_key || whatsappApiKey;
            }
            
            const movObj = localDb.movilidades.find(m => m.id === movilidadId);
            if (movObj) {
                routeFrom = movObj.routeFrom || movObj.route_from || routeFrom;
                routeTo = movObj.routeTo || movObj.route_to || routeTo;
            }
            
            const ticketObj = localDb.tickets.find(t => t.id === ticketId);
            if (ticketObj) {
                travelDate = ticketObj.dateStr || ticketObj.date_str || travelDate;
            }
        }

        // Formatear fecha para el mensaje en formato DD/MM/YYYY
        let displayDate = travelDate;
        const parts = travelDate.split('-');
        if (parts.length === 3) displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;

        // Construir el cuerpo del mensaje de forma profesional y estructurada
        let message = `🎫 *¡Orden de Pago y Reserva en Bus.click!*\n\n`;
        message += `Hola *${passengerName}*, tu pasaje con ID *${ticketId.toUpperCase()}* ha sido reservado con éxito.\n\n`;
        message += `📋 *Detalle de tu Viaje:*\n`;
        message += `• *Empresa:* ${companyName}\n`;
        message += `• *Origen:* ${routeFrom}\n`;
        message += `• *Destino:* ${routeTo}\n`;
        message += `• *Fecha:* ${displayDate}\n`;
        message += `• *Asiento:* N° ${seatNum} (Piso ${floor})\n`;
        message += `• *Comprobante Solicitado:* ${docType}\n`;
        message += `• *Total a Pagar:* S/. ${parseFloat(price).toFixed(2)}\n\n`;
        
        if (paymentMethod === 'Yape/Plin' || paymentMethod.toLowerCase().includes('yape')) {
            message += `📲 *Instrucciones para completar tu Pago (Yape/Plin):*\n`;
            message += `1. Realiza el yapeo de *S/. ${parseFloat(price).toFixed(2)}* al número:\n`;
            message += `   👉 *${yapePhone}*\n`;
            message += `   *(Titular: ${companyName})*\n`;
            message += `2. Envía la captura del comprobante respondiendo a este mensaje de WhatsApp.\n\n`;
            
            if (docType !== 'Ticket Simple') {
                message += `📝 *Nota:* El comprobante electrónico (${docType}) será enviado por este mismo medio una vez confirmado tu pago.\n\n`;
            }
            
            message += `*¡Tu pasaje se validará automáticamente al recibir el comprobante!* 🚚✨`;
        } else {
            message += `💳 *Método de Pago:* ${paymentMethod}\n`;
            message += `Tu boleto está activo y confirmado. ¡Buen viaje! 🚚✨`;
        }

        console.log(`📱 [WhatsApp API] Despachando notificación automática asíncrona a ${cleanPhone}...`);
        
        // Resolver llave final usando configuraciones dinámicas u overrides de variables de entorno
        let finalUrl = whatsappUrl || process.env.WHATSAPP_API_URL || 'https://qr-api-wps-production.up.railway.app/api/external/send-message';
        const finalApiKey = (whatsappApiKey && whatsappApiKey !== 'busclick_master_key') ? whatsappApiKey : (process.env.WHATSAPP_API_KEY || 'busclick_master_key');
        
        // Sanear la URL: Si el usuario solo puso el dominio base de qr-api-wps, autocompletar el endpoint
        if (finalUrl.includes('qr-api-wps') && !finalUrl.includes('/api/external/send-message')) {
            finalUrl = finalUrl.replace(/\/+$/, '') + '/api/external/send-message';
        }
        
        console.log(`📱 [WhatsApp API] Usando URL: ${finalUrl}`);
        
        const response = await fetch(finalUrl, {
            method: 'POST',
            headers: {
                'x-api-key': finalApiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phone: cleanPhone,
                number: cleanPhone,
                message: message,
                text: message,
                source: 'busclick-saas'
            })
        });

        // Some WAPI integrations return plain text or different JSON structures
        const resText = await response.text();
        let resData = {};
        try {
            resData = JSON.parse(resText);
        } catch(e) {
            console.log(`[WhatsApp API] Respuesta no JSON recibida:`, resText.substring(0, 50));
        }
        
        if (response.ok) {
            console.log(`✅ [WhatsApp API] Notificación enviada correctamente a ${cleanPhone}. ID Mensaje:`, resData.data?.status || 'sent');
        } else {
            console.error(`❌ [WhatsApp API Error] La API externa devolvió error:`, resData.error || 'unknown');
        }
    } catch (err) {
        console.error(`❌ [WhatsApp API Exception] Error al conectarse a la API externa de WhatsApp:`, err);
    }
}

// --- CONFIRMAR RESERVA TEMPORAL OMNICANAL A VENTA DIRECTA ---
app.put('/api/tickets/confirm-temporary', async (req, res) => {
    const { movilidadId, seatNum, floor, passengerName, passengerDni, passengerWhatsapp, paymentMethod, price, docType, docRuc, docRazonSocial } = req.body;
    if (usePostgres) {
        try {
            const result = await pool.query(
                'UPDATE tickets SET status = \'Ocupado\', passenger_name = $1, passenger_dni = $2, payment_method = $3, price = $4, passenger_whatsapp = $5, doc_type = $6, doc_ruc = $7, doc_razon_social = $8, created_at = CURRENT_TIMESTAMP WHERE movilidad_id = $9 AND seat_num = $10 AND floor = $11 AND status = \'Reservado_Temporal\' RETURNING id, company_id',
                [passengerName, passengerDni, paymentMethod, parseFloat(price), passengerWhatsapp || '', docType || 'Ticket Simple', docRuc || null, docRazonSocial || null, movilidadId, seatNum, floor]
            );
            if (result.rows.length > 0) {
                const compId = result.rows[0].company_id;
                const ticketId = result.rows[0].id;
                
                // Lógica de Flota Flotante Adaptable: Viaje Exitoso
                const movRes = await pool.query('SELECT tipo_logica, route_to, company_id FROM movilidades WHERE id = $1', [movilidadId]);
                if (movRes.rows.length > 0) {
                    const movObj = movRes.rows[0];
                    if (movObj.tipo_logica === 'Flotante') {
                        const destSedeRes = await pool.query(
                            'SELECT id FROM sedes WHERE company_id = $1 AND LOWER(city) = LOWER($2) LIMIT 1',
                            [compId, movObj.route_to]
                        );
                        if (destSedeRes.rows.length > 0) {
                            const destSedeId = destSedeRes.rows[0].id;
                            await pool.query(
                                'UPDATE movilidades SET ubicacion_actual_sede_id = $1 WHERE id = $2',
                                [destSedeId, movilidadId]
                            );
                            console.log(`🚚 Flota Adaptable (Confirm): Vehículo ${movilidadId} (Flotante) despachado. Nueva ubicación física: Sede ID ${destSedeId}.`);
                        }
                    }
                }

                // Disparar envío asíncrono de WhatsApp sin retrasar la respuesta REST
                sendWhatsappNotification(ticketId, passengerWhatsapp, passengerName, compId, movilidadId, seatNum, floor, price, paymentMethod, docType);

                res.json({ success: true, id: ticketId });
            } else {
                res.status(404).json({ error: 'Reserva temporal no encontrada o ya expiró.' });
            }
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const ticket = (localDb.tickets || []).find(t => t.movilidadId === movilidadId && t.seatNum === seatNum && t.floor === floor && t.status === 'Reservado_Temporal');
        if (ticket) {
            ticket.status = 'Ocupado';
            ticket.passengerName = passengerName;
            ticket.passengerDni = passengerDni;
            ticket.passengerWhatsapp = passengerWhatsapp || '';
            ticket.paymentMethod = paymentMethod;
            ticket.price = parseFloat(price);
            ticket.docType = docType || 'Ticket Simple';
            ticket.docRuc = docRuc || null;
            ticket.docRazonSocial = docRazonSocial || null;
            ticket.createdAt = new Date().toISOString();
            
            // Lógica de Flota Flotante Adaptable
            const movObj = localDb.movilidades.find(m => m.id === movilidadId);
            if (movObj && (movObj.tipoLogica === 'Flotante' || movObj.tipo_logica === 'Flotante')) {
                const destSede = localDb.sedes.find(s => s.companyId === ticket.companyId && s.city.toLowerCase() === movObj.routeTo.toLowerCase());
                if (destSede) {
                    movObj.ubicacionActualSedeId = destSede.id;
                    console.log(`🚚 Flota Adaptable (Confirm JSON): Vehículo ${movilidadId} (Flotante) despachado. Nueva ubicación: Sede ID ${destSede.id}.`);
                }
            }
            saveLocalDb();

            // Disparar envío asíncrono de WhatsApp sin retrasar la respuesta REST
            sendWhatsappNotification(ticket.id, passengerWhatsapp, passengerName, ticket.companyId, movilidadId, seatNum, floor, price, paymentMethod, docType);

            res.json({ success: true, id: ticket.id });
        } else {
            res.status(404).json({ error: 'Reserva temporal no encontrada o ya expiró.' });
        }
    }
});

app.post('/api/tickets/sync', async (req, res) => {
    const { ticketIds } = req.body;
    if (!Array.isArray(ticketIds)) {
        return res.status(400).json({ error: "Se requiere un array de IDs" });
    }
    
    if (usePostgres) {
        try {
            if (ticketIds.length === 0) {
                return res.json({ success: true, tickets: [] });
            }
            const placeholders = ticketIds.map((_, i) => `$${i + 1}`).join(',');
            const { rows } = await pool.query(`SELECT * FROM tickets WHERE id IN (${placeholders})`, ticketIds);
            
            const activeTickets = rows.map(r => ({
                id: r.id,
                companyId: r.company_id,
                sedeId: r.sede_id,
                movilidadId: r.movilidad_id,
                seatNum: parseInt(r.seat_num),
                floor: parseInt(r.floor),
                passengerName: r.passenger_name,
                passengerDni: r.passenger_dni,
                status: r.status,
                paymentMethod: r.payment_method,
                price: parseFloat(r.price),
                date: r.date_str
            }));
            res.json({ success: true, tickets: activeTickets });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    } else {
        const activeTickets = localDb.tickets.filter(t => ticketIds.includes(t.id));
        res.json({ success: true, tickets: activeTickets });
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

app.put('/api/tickets/:id', async (req, res) => {
    const { id } = req.params;
    const { passengerName, passengerDni, seatNum, floor, date } = req.body;
    
    if (usePostgres) {
        try {
            // Validar si el asiento ya está ocupado por otro pasaje para el mismo bus y la misma fecha
            if (seatNum || date) {
                const ticketRes = await pool.query('SELECT movilidad_id, seat_num, date_str FROM tickets WHERE id = $1', [id]);
                if (ticketRes.rows.length > 0) {
                    const ticket = ticketRes.rows[0];
                    const finalMovilidadId = ticket.movilidad_id;
                    const finalSeatNum = seatNum !== undefined ? parseInt(seatNum) : parseInt(ticket.seat_num);
                    const finalDate = date !== undefined ? date : ticket.date_str;
                    
                    const checkRes = await pool.query(
                        'SELECT id FROM tickets WHERE id != $1 AND movilidad_id = $2 AND seat_num = $3 AND date_str = $4 AND status = \'Ocupado\'',
                        [id, finalMovilidadId, finalSeatNum, finalDate]
                    );
                    if (checkRes.rows.length > 0) {
                        return res.status(400).json({ success: false, error: 'El asiento seleccionado ya está ocupado en esa fecha.' });
                    }
                }
            }

            await pool.query(
                'UPDATE tickets SET passenger_name = COALESCE($1, passenger_name), passenger_dni = COALESCE($2, passenger_dni), seat_num = COALESCE($3, seat_num), floor = COALESCE($4, floor), date_str = COALESCE($5, date_str) WHERE id = $6',
                [passengerName, passengerDni, seatNum ? parseInt(seatNum) : null, floor ? parseInt(floor) : null, date, id]
            );
            res.json({ success: true });
        } catch (e) {
            console.error("Error al actualizar ticket en Postgres:", e);
            res.status(500).json({ success: false, error: e.message });
        }
    } else {
        const ticketIndex = localDb.tickets.findIndex(t => t.id === id);
        if (ticketIndex !== -1) {
            const ticket = localDb.tickets[ticketIndex];
            const finalMovilidadId = ticket.movilidadId;
            const finalSeatNum = seatNum !== undefined ? parseInt(seatNum) : parseInt(ticket.seatNum);
            const finalDate = date !== undefined ? date : ticket.date;

            const collision = localDb.tickets.some(t => t.id !== id && t.movilidadId === finalMovilidadId && parseInt(t.seatNum) === finalSeatNum && t.date === finalDate && t.status === 'Ocupado');
            if (collision) {
                return res.status(400).json({ success: false, error: 'El asiento seleccionado ya está ocupado en esa fecha.' });
            }

            if (passengerName !== undefined) ticket.passengerName = passengerName;
            if (passengerDni !== undefined) ticket.passengerDni = passengerDni;
            if (seatNum !== undefined) ticket.seatNum = parseInt(seatNum);
            if (floor !== undefined) ticket.floor = parseInt(floor);
            if (date !== undefined) ticket.date = date;

            saveLocalDb();
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Ticket no encontrado.' });
        }
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

// --- VACIAR / LIMPIAR BASE DE DATOS (RESET DB) ---
app.post('/api/clear-db', async (req, res) => {
    try {
        console.log("🧹 Iniciando proceso de vaciado completo de la base de datos...");
        
        if (usePostgres) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                
                console.log("🧹 Vaciando company_payments en PostgreSQL...");
                await client.query('DELETE FROM company_payments');
                
                console.log("🧹 Vaciando tickets en PostgreSQL...");
                await client.query('DELETE FROM tickets');
                
                console.log("🧹 Vaciando movilidades en PostgreSQL...");
                await client.query('DELETE FROM movilidades');
                
                console.log("🧹 Vaciando trabajadores en PostgreSQL...");
                await client.query('DELETE FROM trabajadores');
                
                console.log("🧹 Vaciando sedes en PostgreSQL...");
                await client.query('DELETE FROM sedes');
                
                console.log("🧹 Vaciando companies en PostgreSQL...");
                await client.query('DELETE FROM companies');
                
                await client.query('COMMIT');
                console.log("✔ Base de datos física de PostgreSQL en Railway vaciada con éxito.");
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        }
        
        // Vaciado de localDb (fallback)
        localDb = {
            companies: [],
            sedes: [],
            trabajadores: [],
            movilidades: [],
            tickets: []
        };
        saveLocalDb();
        console.log("✔ Base de datos local JSON vaciada con éxito.");
        
        res.json({ success: true, message: "Base de datos completamente vaciada." });
    } catch (e) {
        console.error("Error al vaciar base de datos:", e);
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

app.get('/compra', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'compra.html'));
});

// Redireccionar cualquier otra ruta a index.html (Soporte SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// CRONJOB / SETINTERVAL DE LIMPIEZA DE RESERVAS TEMPORALES OMNICANAL
// ==========================================
setInterval(async () => {
    console.log("⏰ Ejecutando limpieza automática de reservas temporales vencidas...");
    if (usePostgres) {
        try {
            const res = await pool.query("DELETE FROM tickets WHERE status = 'Reservado_Temporal' AND created_at < NOW() - INTERVAL '10 minutes'");
            if (res.rowCount > 0) {
                console.log(`✔ Se eliminaron ${res.rowCount} reservas temporales vencidas en PostgreSQL.`);
            }
        } catch (e) {
            console.error("⚠ Error en la limpieza de reservas temporales (Postgres):", e);
        }
    } else {
        const now = new Date();
        const beforeCount = (localDb.tickets || []).length;
        localDb.tickets = (localDb.tickets || []).filter(t => {
            if (t.status !== 'Reservado_Temporal') return true;
            const createdTime = new Date(t.createdAt || t.created_at || now);
            const diffMinutes = (now - createdTime) / 1000 / 60;
            return diffMinutes <= 10;
        });
        if (localDb.tickets.length < beforeCount) {
            saveLocalDb();
            console.log(`✔ Se eliminaron ${beforeCount - localDb.tickets.length} reservas temporales vencidas en JSON local.`);
        }
    }
}, 60000); // Se ejecuta cada 1 minuto (60,000 ms)

// ==========================================
// 3. INICIO DEL SERVIDOR
// ==========================================
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 SERVIDOR BUS.CLICK INICIADO EXITOSAMENTE`);
    console.log(`🌍 Corriendo en: http://localhost:${PORT}`);
    console.log(`=========================================`);
});
