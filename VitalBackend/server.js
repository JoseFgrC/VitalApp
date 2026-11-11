const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { pool, testConnection } = require('./db');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const { OAuth2Client } = require('google-auth-library');
const { encryptText, decryptText } = require('./utils/crypto');
const { validarTamizaje, validarBerg, calcularNivel } = require('./utils/nivel');
const { HORAS_VIGENCIA_CODIGO, generarCodigo, validarTransicion, puedeVerAdulto, calcularRacha } = require('./utils/cuidador');
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Permite usar cookies Secure detrás de proxies (por ejemplo, Heroku o NGROK)
app.set('trust proxy', 1);

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
};

function setSecureCookie(res, name, value, options = {}) {
    return res.cookie(name, value, { ...COOKIE_OPTIONS, ...options });
}

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "http:", "https:"],
        },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // Necesario para que el popup de Google OAuth pueda comunicarse con la ventana padre
    crossOriginOpenerPolicy: false,
}));

// Set Permissions-Policy header
app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
    next();
});
app.use(cors({
    origin: function (origin, callback) {
        // Permitir cualquier origen (útil para Vercel o herramientas de desarrollo) temporalmente
        callback(null, true);
    },
    credentials: true,  // Permite enviar/recibir cookies entre orígenes
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'X-Signature', 'X-CSRF-Token'],
}));
// Responder preflight OPTIONS globalmente (Express 5 / path-to-regexp v8)
app.options('/{*path}', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Necesario para leer y escribir cookies

// ============================================
// SESIONES EN MEMORIA (como en el ejemplo de clase)
// ============================================
const sessions = {};

const createSession = function(req, res, extraData = {}) {
    const userAgent = req.get('user-agent');
    const sessionId = crypto.randomBytes(16).toString('base64url');
    sessions[sessionId] = { userAgent, ...extraData };
    res.cookie('sessionId', sessionId, COOKIE_OPTIONS);
    console.log(' Sesión creada:', sessionId);
    return sessionId;
};

// ============================================
// PREVENCIÓN DE INYECCIONES (SQL + XSS)
// ============================================

// SQL Injection: PREVENIDA por queries parametrizadas con "?" en todo el backend.
// mysql2 nunca interpola valores directamente en el SQL — los envía como parámetros separados.

// XSS (JavaScript Injection): Escapar caracteres peligrosos en inputs del usuario.
function sanitizeInput(value) {
    if (typeof value !== 'string') return value;
    const sanitized = value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;')
        .trim();
        
    // Si el texto cambió, significa que tenía caracteres peligrosos
    if (sanitized !== value.trim()) {
        console.warn(`⚠️ [ALERTA DE SEGURIDAD] Se detectaron y neutralizaron caracteres peligrosos. Entrada original contenía inyección.`);
    }
    
    return sanitized;
}

// Middleware global: sanitiza automáticamente todos los campos del body
// Excluye tokens externos (Google JWT, etc.) que NO deben modificarse
const SKIP_SANITIZE_FIELDS = ['token', 'id_token', 'access_token', 'password_hash', 'mfa_secret'];

// Los links no se escapan (convertir "/" en "&#x2F;" los rompe); en su lugar solo se aceptan
// direcciones http(s) sin caracteres de HTML, lo que también bloquea "javascript:" y similares
const URL_FIELDS = ['link_video', 'url_miniatura'];
const URL_SEGURA = /^https?:\/\/[^\s<>"'`]+$/i;

function sanitizeMiddleware(req, res, next) {
    if (req.body && typeof req.body === 'object') {
        for (const key in req.body) {
            if (typeof req.body[key] === 'string' && URL_FIELDS.includes(key)) {
                const url = req.body[key].trim();
                if (url && !URL_SEGURA.test(url)) {
                    return res.status(400).json({ success: false, message: 'El link debe empezar con http:// o https:// (por ejemplo, https://youtu.be/...)' });
                }
                req.body[key] = url;
            } else if (typeof req.body[key] === 'string' && !SKIP_SANITIZE_FIELDS.includes(key)) {
                req.body[key] = sanitizeInput(req.body[key]);
            }
        }
    }
    next();
}

// ============================================
// MIDDLEWARE: VERIFICACIÓN DE INTEGRIDAD HMAC SHA-256
// ============================================
const HMAC_SECRET = process.env.HMAC_SECRET;

function verificarFirma(req, res, next) {
    // Solo verificar en métodos que envían cuerpo
    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return next();

    const firma = req.headers['x-signature'];

    if (!firma) {
        return res.status(400).json({
            success: false,
            message: 'Firma de seguridad ausente (X-Signature). Solicitud rechazada.'
        });
    }

    if (!HMAC_SECRET) {
        console.warn('⚠️ HMAC_SECRET no definida en .env. Saltando verificación.');
        return next();
    }

    // Calcular HMAC del cuerpo recibido (si no hay body, asume '{}' como hace el frontend)
    const cuerpo = req.body ? JSON.stringify(req.body) : '{}';
    // Nota: express json parser a veces devuelve {} vacío si no hay body, 
    // y JSON.stringify({}) === '{}'. Si req.body es undefined, usamos '{}'.
    const firmaEsperada = crypto
        .createHmac('sha256', HMAC_SECRET)
        .update(cuerpo === undefined ? '{}' : cuerpo)
        .digest('hex');

    if (firma !== firmaEsperada) {
        console.warn('🚫 Firma inválida en:', req.path, '| recibida:', firma, '| esperada:', firmaEsperada);
        return res.status(400).json({
            success: false,
            message: 'Firma inválida. Los datos pueden haber sido manipulados.'
        });
    }

    next();
}

// HMAC ANTES del sanitize: validar el body original sin modificar
app.use('/api', verificarFirma);
// Sanitizar DESPUÉS de validar la firma
app.use(sanitizeMiddleware);

// ============================================
// SECURITY MIDDLEWARES: JWT & CSRF
// ============================================
const JWT_SECRET = process.env.JWT_SECRET;
const CSRF_SECRET = process.env.CSRF_SECRET;

const openRoutes = [
    '/api/health',
    '/api/login',
    '/api/register',
    '/api/mfa/setup',
    '/api/mfa/enable',
    '/api/mfa/verify-login',
    '/api/mfa/disable',
    '/api/csrf-token'
];

// 0. Endpoint para obtener CSRF Token (Público, antes de cualquier middleware de Auth)
app.get('/api/csrf-token', (req, res) => {
    const randomVal = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHmac('sha256', CSRF_SECRET).update(randomVal).digest('hex');
    res.json({ success: true, csrfToken: `${randomVal}.${hash}` });
});

// 1. Validar JWT en rutas protegidas
app.use((req, res, next) => {
    if (!req.path.startsWith('/api/') || openRoutes.includes(req.path)) {
        return next();
    }
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ success: false, message: 'Token JWT no proporcionado' });
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ success: false, message: 'Token JWT inválido o expirado' });
        req.user = decoded;
        next();
    });
});


// 2. Las rutas de administración solo son para el rol admin (contenido y cuentas)
app.use('/api/admin', (req, res, next) => {
    if (!req.user || req.user.rol !== 'admin') {
        return res.status(403).json({ success: false, message: 'Solo un administrador puede hacer esto' });
    }
    next();
});

// 3. Validar CSRF en peticiones que modifican estado (POST, PUT, DELETE)
app.use((req, res, next) => {
    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return next();
    if (openRoutes.includes(req.path)) return next();
    
    const csrfToken = req.headers['x-csrf-token'];
    if (!csrfToken || !csrfToken.includes('.')) {
        return res.status(403).json({ success: false, message: 'Falta Token CSRF o es inválido' });
    }
    const [val, hash] = csrfToken.split('.');
    const expectedHash = crypto.createHmac('sha256', CSRF_SECRET).update(val).digest('hex');
    if (hash !== expectedHash) {
        return res.status(403).json({ success: false, message: 'Token CSRF inválido' });
    }
    next();
});


// Probar conexión
testConnection();

// Inicializar DB (Añadir columnas MFA si no existen)
async function initDB() {
    try {
        await pool.query('ALTER TABLE usuarios ADD COLUMN mfa_secret VARCHAR(255) DEFAULT NULL');
        console.log(' Columna mfa_secret añadida a usuarios');
    } catch (e) { /* Ya existe */ }
    try {
        await pool.query('ALTER TABLE usuarios ADD COLUMN mfa_enabled BOOLEAN DEFAULT FALSE');
        console.log(' Columna mfa_enabled añadida a usuarios');
    } catch (e) { /* Ya existe */ }
}
initDB();

// ============================================
// ROOT AND HEALTH CHECK
// ============================================
app.get('/', (req, res) => {
    res.status(200).json({ message: "VitalApp API is online and running correctly" });
});

app.get('/api/health', (req, res) => {
    res.json({
        message: 'Vital App Backend funcionando correctamente',
        status: 'active',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// LOGIN
// ============================================
app.post('/api/login', async (req, res) => {
    const { email, password_hash } = req.body;
    console.log(' Login - Email:', email);

    if (!email || !password_hash) {
        return res.status(400).json({ success: false, message: 'Email y contraseña son obligatorios' });
    }

    try {
        // Buscar usuario solo por email (la contraseña se verifica con bcrypt, no en SQL)
        const [rows] = await pool.query(
            `SELECT id_usuario, nombre, email, TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) AS edad, rol, nivel_actividad,
                    condiciones_medicas, restricciones, password_hash, mfa_enabled
             FROM usuarios
             WHERE email = ? AND cuenta_activa = 1`,
            [email]
        );

        if (rows.length === 0) {
            return res.json({ success: false, message: 'Correo o contraseña incorrectos' });
        }

        const usuario = rows[0];

        // Decrypt medical data
        usuario.condiciones_medicas = decryptText(usuario.condiciones_medicas);
        usuario.restricciones = decryptText(usuario.restricciones);

        // Comparar la contraseña ingresada contra el hash guardado en la BD

        const hashCompatible = usuario.password_hash.replace(/^\$2y\$/, '$2b$');
        const passwordValida = await bcrypt.compare(password_hash, hashCompatible);

        if (!passwordValida) {
            return res.json({ success: false, message: 'Correo o contraseña incorrectos' });
        }

        // No devolver el hash al cliente
        const { password_hash: _, ...usuarioSinHash } = usuario;

        if (usuario.mfa_enabled) {
            console.log(' Login requiere MFA para:', email);
            createSession(req, res, { userId: usuario.id_usuario });
            return res.json({ success: true, requiresMfa: true, userId: usuario.id_usuario });
        }

        const token = jwt.sign({ id: usuarioSinHash.id_usuario, email: usuarioSinHash.email, rol: usuarioSinHash.rol }, JWT_SECRET, { expiresIn: '7d' });
        console.log(' Login exitoso para:', email);
        res.json({ success: true, user: usuarioSinHash, token });

    } catch (error) {
        console.error(' Error en login:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// ============================================
// OAUTH2 REAL (SSO Google)
// ============================================
app.post('/api/auth/google', async (req, res) => {
    const { token } = req.body;
    console.log(` OAUTH SSO Real - Token recibido:`, token ? `${token.substring(0, 30)}...` : 'UNDEFINED/EMPTY');

    if (!token) {
        return res.status(400).json({ success: false, message: 'Falta el token de Google' });
    }

    try {
        let email, nombre;
        const isLocalhost = process.env.NODE_ENV !== 'production';

        if (isLocalhost) {
            // ── MODO DESARROLLO (localhost) ──────────────────────────────────────
            // Google no permite verificar tokens emitidos desde localhost con su API,
            // así que decodificamos el JWT directamente (sin verificar firma).
            // NUNCA hacer esto en producción.
            console.log(' [DEV] Decodificando JWT de Google sin verificación (localhost)...');
            const base64Payload = token.split('.')[1];
            const decoded = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf8'));
            email = decoded.email;
            nombre = decoded.name || decoded.given_name || 'Usuario Google';
            console.log(` [DEV] Email decodificado: ${email}`);
        } else {
            // ── MODO PRODUCCIÓN ──────────────────────────────────────────────────
            // Verificación criptográfica real con la API de Google
            console.log(' [PROD] Verificando token con Google API...');
            const ticket = await googleClient.verifyIdToken({
                idToken: token,
                audience: GOOGLE_CLIENT_ID,
            });
            const payload = ticket.getPayload();
            email = payload.email;
            nombre = payload.name || 'Usuario Google';
            console.log(` [PROD] Token válido. Email: ${email}`);
        }

        // Buscar si el usuario ya existe
        const [rows] = await pool.query(
            `SELECT id_usuario, nombre, email, TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) AS edad, rol, nivel_actividad,
                    condiciones_medicas, restricciones, password_hash, mfa_enabled
             FROM usuarios
             WHERE email = ? AND cuenta_activa = 1`,
            [email]
        );

        let usuario = rows[0];

        // Si no existe, crearlo automáticamente (SSO Behavior)
        if (!usuario) {
            console.log(' Usuario nuevo vía Google SSO, creando cuenta:', email);
            const dummyPassword = crypto.randomBytes(32).toString('hex');
            const hash = await bcrypt.hash(dummyPassword, 10);
            
            const [result] = await pool.query(
                `INSERT INTO usuarios (nombre, email, password_hash, fecha_nacimiento, peso)
                 VALUES (?, ?, ?, '2000-01-01', 70)`,
                [nombre, email, hash]
            );

            const [newRows] = await pool.query('SELECT *, TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) AS edad FROM usuarios WHERE id_usuario = ?', [result.insertId]);
            usuario = newRows[0];
        }

        // Generar JWT propio y responder
        const { password_hash: _, ...usuarioSinHash } = usuario;
        const jwtToken = jwt.sign(
            { id: usuarioSinHash.id_usuario, email: usuarioSinHash.email, rol: usuarioSinHash.rol },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        createSession(req, res, {
            userId: usuarioSinHash.id_usuario,
            email: usuarioSinHash.email,
            rol: usuarioSinHash.rol
        });

        console.log(` Login Google SSO exitoso para: ${email}`);
        res.json({ success: true, user: usuarioSinHash, token: jwtToken, message: 'Autenticación con Google exitosa' });

    } catch (error) {
        console.error(' Error verificando token de Google:', error);
        res.status(401).json({ success: false, message: 'Token de Google inválido o expirado' });
    }
});


// ============================================
// MFA (MULTI-FACTOR AUTHENTICATION)
// ============================================

app.post('/api/mfa/setup', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'Falta userId' });

    try {
        const secret = speakeasy.generateSecret({ name: `VitalApp (${userId})` });

        await pool.query('UPDATE usuarios SET mfa_secret = ? WHERE id_usuario = ?', [secret.base32, userId]);

        QRCode.toDataURL(secret.otpauth_url, (err, data_url) => {
            if (err) return res.status(500).json({ success: false, message: 'Error al generar QR' });
            res.json({ success: true, secret: secret.base32, qrCode: data_url });
        });
    } catch (e) {
        console.error(' Error en MFA Setup:', e);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

app.post('/api/mfa/enable', async (req, res) => {
    const { userId, token } = req.body;
    if (!userId || !token) return res.status(400).json({ success: false, message: 'Faltan datos' });

    try {
        const [rows] = await pool.query('SELECT mfa_secret FROM usuarios WHERE id_usuario = ?', [userId]);
        if (rows.length === 0 || !rows[0].mfa_secret) {
            return res.json({ success: false, message: 'MFA no configurado' });
        }

        const verified = speakeasy.totp.verify({
            secret: rows[0].mfa_secret,
            encoding: 'base32',
            token: token
        });

        if (verified) {
            await pool.query('UPDATE usuarios SET mfa_enabled = 1 WHERE id_usuario = ?', [userId]);
            res.json({ success: true, message: 'MFA habilitado correctamente' });
        } else {
            res.json({ success: false, message: 'Token incorrecto' });
        }
    } catch (e) {
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

app.post('/api/mfa/verify-login', async (req, res) => {
    const { userId, token } = req.body;

    try {
        const [rows] = await pool.query(
            `SELECT id_usuario, nombre, email, TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) AS edad, rol, nivel_actividad,
                    condiciones_medicas, restricciones, mfa_secret, mfa_enabled
             FROM usuarios
             WHERE id_usuario = ? AND cuenta_activa = 1`,
            [userId]
        );

        if (rows.length === 0) return res.json({ success: false, message: 'Usuario no encontrado' });

        const usuario = rows[0];

        // Decrypt medical data
        usuario.condiciones_medicas = decryptText(usuario.condiciones_medicas);
        usuario.restricciones = decryptText(usuario.restricciones);

        if (!usuario.mfa_enabled) {
            return res.json({ success: false, message: 'MFA no está habilitado para este usuario' });
        }

        const verified = speakeasy.totp.verify({
            secret: usuario.mfa_secret,
            encoding: 'base32',
            token: token,
            window: 1 // Permitir ligero desfase de tiempo
        });

        if (verified) {
            const { mfa_secret, ...usuarioLimpio } = usuario;
            const token = jwt.sign({ id: usuarioLimpio.id_usuario, email: usuarioLimpio.email, rol: usuarioLimpio.rol }, JWT_SECRET, { expiresIn: '7d' });
            console.log(' MFA Login exitoso para ID:', userId);
            res.json({ success: true, user: usuarioLimpio, token });
        } else {
            res.json({ success: false, message: 'Código incorrecto' });
        }
    } catch (e) {
        console.error(' Error en MFA Verify Login:', e);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

app.post('/api/mfa/disable', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'Faltan datos' });

    try {
        await pool.query('UPDATE usuarios SET mfa_enabled = 0, mfa_secret = NULL WHERE id_usuario = ?', [userId]);
        console.log(' MFA Deshabilitado para ID:', userId);
        res.json({ success: true, message: 'MFA deshabilitado correctamente' });
    } catch (e) {
        console.error(' Error al deshabilitar MFA:', e);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// ============================================
// REGISTRO
// ============================================
app.post('/api/register', async (req, res) => {
    // 'edad' no se guarda: se calcula en las consultas a partir de fecha_nacimiento
    const { nombre, email, password_hash, fecha_nacimiento, peso, altura, genero, telefono } = req.body;
    // Solo se puede elegir entre adulto mayor y cuidador; el rol admin no se asigna desde el registro
    const rol = req.body.rol === 'cuidador' ? 'cuidador' : 'usuario';
    console.log(' Registro:', { nombre, email, fecha_nacimiento, rol });

    if (!nombre || !email || !password_hash || !fecha_nacimiento || (rol === 'usuario' && !peso)) {
        return res.status(400).json({
            success: false,
            message: 'Los campos nombre, email, contraseña y fecha de nacimiento son obligatorios (y el peso para adultos mayores)'
        });
    }

    try {
        // Verificar si el email ya existe
        const [existing] = await pool.query(
            'SELECT id_usuario FROM usuarios WHERE email = ?',
            [email]
        );

        if (existing.length > 0) {
            return res.json({ success: false, message: 'El email ya está registrado' });
        }

        // Hashear la contraseña con bcrypt antes de guardar ($2b$ compatible con Node.js)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password_hash, salt);

        const [result] = await pool.query(
            `INSERT INTO usuarios
                (nombre, email, password_hash, fecha_nacimiento, peso, altura, genero, telefono, rol)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [nombre, email, hashedPassword, fecha_nacimiento, peso || null, altura ?? null, genero ?? null, telefono ?? null, rol]
        );

        console.log(' Usuario registrado ID:', result.insertId);
        setSecureCookie(res, 'userId', String(result.insertId));
        setSecureCookie(res, 'userRol', rol);
        res.json({ success: true, id: result.insertId, message: 'Registro exitoso' });

    } catch (error) {
        console.error(' Error en registro:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// OBTENER PERFIL DE USUARIO
// ============================================
app.get('/api/user/:id', async (req, res) => {
    const { id } = req.params;
    // Contiene datos de salud descifrados: solo la propia persona o un admin
    if (String(req.user.id) !== String(id) && req.user.rol !== 'admin') {
        return res.status(403).json({ success: false, message: 'No puedes consultar el perfil de otro usuario' });
    }
    try {
        const [rows] = await pool.query(
            `SELECT id_usuario, nombre, email, TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) AS edad, peso, altura, genero,
                    telefono, fecha_registro, nivel_actividad,
                    condiciones_medicas, restricciones, rol, mfa_enabled
             FROM usuarios
             WHERE id_usuario = ? AND cuenta_activa = 1`,
            [id]
        );
        if (rows.length > 0) {
            const user = rows[0];
            user.condiciones_medicas = decryptText(user.condiciones_medicas);
            user.restricciones = decryptText(user.restricciones);
            res.json({ success: true, user });
        } else {
            res.json({ success: false, message: 'Usuario no encontrado' });
        }
    } catch (error) {
        console.error(' Error al obtener perfil:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// ============================================
// ACTUALIZAR PERFIL DE USUARIO
// ============================================
app.put('/api/user/:id', async (req, res) => {
    const { id } = req.params;
    if (String(req.user.id) !== String(id) && req.user.rol !== 'admin') {
        return res.status(403).json({ success: false, message: 'No puedes modificar el perfil de otro usuario' });
    }
    // 'edad' no se guarda (se calcula desde fecha_nacimiento).
    // Actualización parcial: solo se cambian los campos enviados. Así, por ejemplo, guardar las
    // enfermedades no exige reenviar el nombre, y guardar el perfil no borra las condiciones médicas.
    const PERMITIDOS = ['nombre', 'email', 'peso', 'altura', 'genero', 'telefono', 'nivel_actividad', 'condiciones_medicas', 'restricciones'];
    const cambios = PERMITIDOS.filter(campo => req.body[campo] !== undefined);
    console.log(' Actualizar perfil ID:', id, cambios);

    if (cambios.length === 0) {
        return res.status(400).json({ success: false, message: 'No se envió ningún dato para actualizar' });
    }
    if (cambios.includes('nombre') && !String(req.body.nombre || '').trim()) {
        return res.status(400).json({ success: false, message: 'El nombre no puede quedar vacío' });
    }
    if (cambios.includes('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(req.body.email || ''))) {
        return res.status(400).json({ success: false, message: 'El correo no es válido' });
    }

    try {
        // RN01: no se capturan datos de salud sin consentimiento registrado
        const traeSalud = ['condiciones_medicas', 'restricciones'].some(c => cambios.includes(c) && req.body[c]);
        if (traeSalud && !(await tieneConsentimiento(id))) {
            return res.status(403).json({
                success: false,
                message: 'Para guardar datos de salud primero debes aceptar el aviso de privacidad.'
            });
        }

        const valores = cambios.map(campo => {
            const v = req.body[campo];
            if (campo === 'condiciones_medicas' || campo === 'restricciones') return v ? encryptText(v) : null;
            if (campo === 'peso' || campo === 'altura') return v === null || v === '' ? null : Number(v);
            return v === '' ? null : v;
        });

        const [result] = await pool.query(
            `UPDATE usuarios SET ${cambios.map(c => `${c} = ?`).join(', ')} WHERE id_usuario = ?`,
            [...valores, id]
        );

        if (result.affectedRows > 0) {
            console.log(' Perfil actualizado');
            res.json({ success: true, message: 'Perfil actualizado correctamente' });
        } else {
            res.json({ success: false, message: 'Usuario no encontrado' });
        }
    } catch (error) {
        console.error(' Error al actualizar perfil:', error);
        const message = error.code === 'ER_DUP_ENTRY' ? 'Ese correo ya está registrado en otra cuenta' : 'No se pudo actualizar el perfil';
        res.status(500).json({ success: false, message });
    }
});

// ============================================
// CONSENTIMIENTO Y AVISO DE PRIVACIDAD (RN01)
// ============================================
const VERSION_AVISO = '1.0';

async function tieneConsentimiento(idUsuario) {
    const [rows] = await pool.query(
        `SELECT 1 FROM consentimientos
         WHERE id_usuario = ? AND acepta_datos_salud = 1 AND fecha_revocado IS NULL
         LIMIT 1`,
        [idUsuario]
    );
    return rows.length > 0;
}

app.get('/api/consentimiento', async (req, res) => {
    try {
        res.json({ success: true, otorgado: await tieneConsentimiento(req.user.id), version: VERSION_AVISO });
    } catch (error) {
        console.error(' Error al consultar consentimiento:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

app.post('/api/consentimiento', async (req, res) => {
    if (req.body.acepta !== true) {
        return res.status(400).json({ success: false, message: 'Debes aceptar el aviso de privacidad para continuar' });
    }
    try {
        if (!(await tieneConsentimiento(req.user.id))) {
            await pool.query(
                'INSERT INTO consentimientos (id_usuario, version_aviso, acepta_datos_salud) VALUES (?, ?, 1)',
                [req.user.id, VERSION_AVISO]
            );
        }
        res.json({ success: true, message: 'Consentimiento registrado' });
    } catch (error) {
        console.error(' Error al registrar consentimiento:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// ============================================
// VALORACIÓN FUNCIONAL: TAMIZAJE, ESCALA DE BERG Y NIVEL (RN02, RN04)
// ============================================
async function ultimaValoracion(idUsuario, tipo) {
    const [rows] = await pool.query(
        `SELECT respuestas, puntaje, aplicador, fecha_aplicacion, nivel_resultante, fecha_registro
         FROM valoraciones
         WHERE id_usuario = ? AND tipo = ?
         ORDER BY fecha_registro DESC, id_valoracion DESC
         LIMIT 1`,
        [idUsuario, tipo]
    );
    return rows[0] || null;
}

// Recalcula el nivel con el último tamizaje y la última Berg, y lo guarda en el usuario
async function recalcularNivel(idUsuario) {
    const tamizaje = await ultimaValoracion(idUsuario, 'tamizaje');
    const berg = await ultimaValoracion(idUsuario, 'berg');
    const resultado = calcularNivel({
        tamizaje: tamizaje ? tamizaje.respuestas : null,
        berg: berg ? berg.puntaje : null
    });
    await pool.query('UPDATE usuarios SET nivel_funcional = ? WHERE id_usuario = ?', [resultado.nivel, idUsuario]);
    return resultado;
}

app.get('/api/valoracion', async (req, res) => {
    try {
        const consentimiento = await tieneConsentimiento(req.user.id);
        const [users] = await pool.query('SELECT nivel_funcional FROM usuarios WHERE id_usuario = ?', [req.user.id]);
        res.json({
            success: true,
            consentimiento,
            nivel: users[0] ? users[0].nivel_funcional : null,
            tamizaje: await ultimaValoracion(req.user.id, 'tamizaje'),
            berg: await ultimaValoracion(req.user.id, 'berg')
        });
    } catch (error) {
        console.error(' Error al obtener valoración:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

app.post('/api/valoracion/tamizaje', async (req, res) => {
    const { respuestas } = req.body;
    const validacion = validarTamizaje(respuestas);
    if (!validacion.ok) return res.status(400).json({ success: false, message: validacion.mensaje });

    try {
        if (!(await tieneConsentimiento(req.user.id))) {
            return res.status(403).json({ success: false, message: 'Primero debes aceptar el aviso de privacidad' });
        }
        const resultado = calcularNivel({ tamizaje: respuestas, berg: null });
        await pool.query(
            `INSERT INTO valoraciones (id_usuario, tipo, respuestas, fecha_aplicacion, nivel_resultante)
             VALUES (?, 'tamizaje', ?, CURDATE(), ?)`,
            [req.user.id, JSON.stringify(respuestas), resultado.nivel]
        );
        const final = await recalcularNivel(req.user.id);
        res.json({ success: true, nivel: final.nivel, message: final.mensaje });
    } catch (error) {
        console.error(' Error al registrar tamizaje:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

app.post('/api/valoracion/berg', async (req, res) => {
    const puntaje = Number(req.body.puntaje);
    const { aplicador, fecha_aplicacion } = req.body;
    const validacion = validarBerg(puntaje, aplicador);
    if (!validacion.ok) return res.status(400).json({ success: false, message: validacion.mensaje });
    if (fecha_aplicacion && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_aplicacion)) {
        return res.status(400).json({ success: false, message: 'La fecha de aplicación debe tener formato AAAA-MM-DD' });
    }

    try {
        if (!(await tieneConsentimiento(req.user.id))) {
            return res.status(403).json({ success: false, message: 'Primero debes aceptar el aviso de privacidad' });
        }
        await pool.query(
            `INSERT INTO valoraciones (id_usuario, tipo, puntaje, aplicador, fecha_aplicacion)
             VALUES (?, 'berg', ?, ?, COALESCE(?, CURDATE()))`,
            [req.user.id, puntaje, aplicador.trim(), fecha_aplicacion || null]
        );
        const final = await recalcularNivel(req.user.id);
        res.json({ success: true, nivel: final.nivel, message: final.mensaje });
    } catch (error) {
        console.error(' Error al registrar Escala de Berg:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// ============================================
// VIDEOS / EJERCICIOS
// (La tabla en BD se llama 'videos', no 'ejercicios')
// ============================================
app.get('/api/exercises', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id_video, nombre_video, descripcion, categoria, subcategoria,
                    dificultad, duracion_min, link_video, url_miniatura,
                    calorias_estimadas, edad_minima, edad_maxima, peso_maximo_recomendado
             FROM videos
             WHERE activo = 1`
        );
        res.json({ success: true, exercises: rows });
    } catch (error) {
        console.error(' Error al obtener videos:', error);
        res.status(500).json({ success: false, error: 'Error al obtener ejercicios' });
    }
});

// ============================================
// VIDEOS FILTRADOS POR USUARIO
// Devuelve los videos adecuados según edad y peso del usuario
// ============================================
// Ejercicios que un usuario puede ver: RN03 (nivel), edad, peso y RN06 (activo y con fuente).
// Lo usan el catálogo y las rutinas del día, para que ambos apliquen el mismo criterio.
async function ejerciciosPermitidos(idUsuario) {
    const [users] = await pool.query(
        `SELECT TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) AS edad, peso, nivel_funcional
         FROM usuarios WHERE id_usuario = ? AND cuenta_activa = 1`,
        [idUsuario]
    );
    if (users.length === 0) return null;
    const { edad, peso, nivel_funcional } = users[0];
    // Sin valoración no se recomiendan ejercicios; nivel 0 requiere autorización médica
    if (nivel_funcional === null || nivel_funcional === 0) {
        return { nivel: nivel_funcional, exercises: [] };
    }
    const [rows] = await pool.query(
        `SELECT id_video, nombre_video, descripcion, categoria, subcategoria,
                dificultad, duracion_min, link_video, url_miniatura,
                calorias_estimadas, edad_minima, edad_maxima, peso_maximo_recomendado,
                nivel_funcional, contraindicaciones, fuente_documental
         FROM videos
         WHERE activo = 1
           AND fuente_documental IS NOT NULL AND fuente_documental <> ''
           AND nivel_funcional <= ?
           AND edad_minima <= ?
           AND edad_maxima >= ?
           AND (peso_maximo_recomendado IS NULL OR peso_maximo_recomendado = 0
                OR ? IS NULL OR peso_maximo_recomendado >= ?)
         ORDER BY nivel_funcional ASC, dificultad ASC`,
        [nivel_funcional, edad, edad, peso, peso]
    );
    return { nivel: nivel_funcional, exercises: rows };
}

app.get('/api/exercises/user/:id', async (req, res) => {
    const { id } = req.params;
    if (String(req.user.id) !== String(id) && req.user.rol !== 'admin') {
        return res.status(403).json({ success: false, message: 'No puedes consultar los ejercicios de otro usuario' });
    }
    try {
        const permitido = await ejerciciosPermitidos(id);
        if (!permitido) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }
        if (permitido.nivel === null) {
            return res.json({ success: true, exercises: [], nivel: null, requiere_valoracion: true });
        }
        if (permitido.nivel === 0) {
            return res.json({
                success: true, exercises: [], nivel: 0,
                message: 'Consulta a tu médico antes de hacer ejercicio. Cuando tengas su autorización, repite la valoración.'
            });
        }
        res.json({ success: true, exercises: permitido.exercises, nivel: permitido.nivel });
    } catch (error) {
        console.error(' Error al obtener videos para usuario:', error);
        res.status(500).json({ success: false, error: 'Error al obtener ejercicios' });
    }
});

// ============================================
// RUTINAS DEL DÍA (armadas por el administrador)
// ============================================
// Una rutina se muestra solo si está activa y TODOS sus ejercicios están permitidos para el
// usuario: así una rutina nunca aparece incompleta ni con un ejercicio sin fuente (RN06).
app.get('/api/rutinas', async (req, res) => {
    try {
        const permitido = await ejerciciosPermitidos(req.user.id);
        if (!permitido || !permitido.nivel) {
            return res.json({ success: true, rutinas: [], nivel: permitido ? permitido.nivel : null });
        }
        const porId = new Map(permitido.exercises.map(e => [e.id_video, e]));
        const [rutinas] = await pool.query(
            `SELECT id_rutina, titulo, descripcion, categoria, nivel_funcional
             FROM rutinas WHERE activo = 1 AND nivel_funcional <= ? ORDER BY id_rutina`,
            [permitido.nivel]
        );
        const [enlaces] = rutinas.length
            ? await pool.query(
                `SELECT id_rutina, id_video FROM rutina_ejercicios WHERE id_rutina IN (?) ORDER BY id_rutina, orden`,
                [rutinas.map(r => r.id_rutina)])
            : [[]];
        const resultado = rutinas
            .map(r => {
                const ids = enlaces.filter(e => e.id_rutina === r.id_rutina).map(e => e.id_video);
                const completa = ids.length > 0 && ids.every(id => porId.has(id));
                return completa ? { ...r, ejercicios: ids.map(id => porId.get(id)) } : null;
            })
            .filter(Boolean);
        res.json({ success: true, rutinas: resultado, nivel: permitido.nivel });
    } catch (error) {
        console.error(' Error al obtener rutinas:', error);
        res.status(500).json({ success: false, message: 'Error al obtener rutinas' });
    }
});

// Valida y guarda los ejercicios de una rutina. El nivel de la rutina es el del ejercicio más
// exigente (RN03) y, para activarla, todos sus ejercicios deben estar publicados (RN06).
async function guardarRutina(conn, idRutina, body) {
    const titulo = String(body.titulo || '').trim();
    const ejercicios = Array.isArray(body.ejercicios) ? body.ejercicios.map(Number).filter(Number.isInteger) : [];
    const activo = Number(body.activo ?? 0) === 1 ? 1 : 0;
    if (!titulo) return 'La rutina necesita un título';
    if (ejercicios.length === 0) return 'Agrega al menos un ejercicio a la rutina';
    if (ejercicios.length > 10) return 'Una rutina puede tener como máximo 10 ejercicios';

    const [videos] = await conn.query(
        'SELECT id_video, nombre_video, nivel_funcional, activo, fuente_documental FROM videos WHERE id_video IN (?)',
        [ejercicios]
    );
    if (videos.length !== new Set(ejercicios).size) {
        return 'Alguno de los ejercicios ya no existe';
    }
    if (activo) {
        const pendientes = videos.filter(v => !v.activo || !(v.fuente_documental || '').trim()).map(v => v.nombre_video);
        if (pendientes.length) {
            return `Para activar la rutina, primero publica estos ejercicios (activos y con fuente documental): ${pendientes.join(', ')}`;
        }
    }
    const nivel = Math.max(...videos.map(v => Number(v.nivel_funcional) || 1));
    const datos = [titulo, body.descripcion ? String(body.descripcion) : null, String(body.categoria || 'Movilidad'), nivel, activo];

    if (idRutina) {
        const [r] = await conn.query(
            'UPDATE rutinas SET titulo = ?, descripcion = ?, categoria = ?, nivel_funcional = ?, activo = ? WHERE id_rutina = ?',
            [...datos, idRutina]);
        if (r.affectedRows === 0) return 'Rutina no encontrada';
        await conn.query('DELETE FROM rutina_ejercicios WHERE id_rutina = ?', [idRutina]);
    } else {
        const [r] = await conn.query(
            'INSERT INTO rutinas (titulo, descripcion, categoria, nivel_funcional, activo) VALUES (?, ?, ?, ?, ?)', datos);
        idRutina = r.insertId;
    }
    await conn.query(
        'INSERT INTO rutina_ejercicios (id_rutina, orden, id_video) VALUES ?',
        [ejercicios.map((id, i) => [idRutina, i + 1, id])]
    );
    return null;
}

async function guardarRutinaHandler(req, res, idRutina) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const error = await guardarRutina(conn, idRutina, req.body);
        if (error) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: error });
        }
        await conn.commit();
        res.json({ success: true, message: 'Rutina guardada' });
    } catch (error) {
        await conn.rollback();
        console.error(' Error al guardar rutina:', error);
        const message = error.code === 'ER_DUP_ENTRY' ? 'Ya existe una rutina con ese título' : 'Error al guardar la rutina';
        res.status(500).json({ success: false, message });
    } finally {
        conn.release();
    }
}

app.get('/api/admin/rutinas', async (req, res) => {
    try {
        const [rutinas] = await pool.query(
            'SELECT id_rutina, titulo, descripcion, categoria, nivel_funcional, activo FROM rutinas ORDER BY id_rutina');
        const [enlaces] = await pool.query(
            `SELECT re.id_rutina, re.orden, v.id_video, v.nombre_video, v.nivel_funcional, v.activo,
                    (v.fuente_documental IS NOT NULL AND v.fuente_documental <> '') AS tiene_fuente
             FROM rutina_ejercicios re JOIN videos v ON v.id_video = re.id_video
             ORDER BY re.id_rutina, re.orden`);
        res.json({
            success: true,
            rutinas: rutinas.map(r => ({ ...r, ejercicios: enlaces.filter(e => e.id_rutina === r.id_rutina) }))
        });
    } catch (error) {
        console.error(' Error al listar rutinas:', error);
        res.status(500).json({ success: false, message: 'Error al listar rutinas' });
    }
});

app.post('/api/admin/rutinas', (req, res) => guardarRutinaHandler(req, res, null));
app.put('/api/admin/rutinas/:id', (req, res) => guardarRutinaHandler(req, res, Number(req.params.id)));

app.delete('/api/admin/rutinas/:id', async (req, res) => {
    try {
        const [r] = await pool.query('DELETE FROM rutinas WHERE id_rutina = ?', [req.params.id]);
        res.json({ success: r.affectedRows > 0, message: r.affectedRows > 0 ? 'Rutina eliminada' : 'Rutina no encontrada' });
    } catch (error) {
        console.error(' Error al eliminar rutina:', error);
        res.status(500).json({ success: false, message: 'Error al eliminar la rutina' });
    }
});

// ============================================
// REGISTRAR EJERCICIO REALIZADO
// ============================================
app.post('/api/ejercicio-realizado', async (req, res) => {
    // El usuario se toma del JWT para que nadie registre sesiones a nombre de otro
    const id_usuario = req.user.id;
    const { id_video, nombre_ejercicio, duracion_segundos, calorias_quemadas, nivel_esfuerzo, completado, comentarios } = req.body;

    if (!id_video && !nombre_ejercicio) {
        return res.status(400).json({ success: false, message: 'id_video o nombre_ejercicio es obligatorio' });
    }
    if (nivel_esfuerzo !== undefined && nivel_esfuerzo !== null
        && (!Number.isInteger(nivel_esfuerzo) || nivel_esfuerzo < 0 || nivel_esfuerzo > 10)) {
        return res.status(400).json({ success: false, message: 'El esfuerzo percibido debe ser un entero entre 0 y 10' });
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO ejercicio_realizado
                (id_usuario, id_video, nombre_ejercicio, fecha_hora_inicio, fecha_hora_fin,
                 duracion_segundos, calorias_quemadas, nivel_esfuerzo, completado, comentarios)
             VALUES (?, ?, ?, DATE_SUB(NOW(), INTERVAL ? SECOND), NOW(), ?, ?, ?, ?, ?)`,
            [id_usuario, id_video || null, nombre_ejercicio || null, duracion_segundos ?? 0,
                duracion_segundos ?? null, calorias_quemadas ?? null,
                nivel_esfuerzo ?? null, completado ?? 1, comentarios ?? null]
        );
        res.json({ success: true, id: result.insertId, message: 'Ejercicio registrado correctamente' });
    } catch (error) {
        console.error(' Error al registrar ejercicio:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// HISTORIAL DE EJERCICIOS DE UN USUARIO
// ============================================
app.get('/api/ejercicio-realizado/:id_usuario', async (req, res) => {
    const { id_usuario } = req.params;
    if (String(req.user.id) !== String(id_usuario) && req.user.rol !== 'admin') {
        return res.status(403).json({ success: false, message: 'No puedes consultar el historial de otro usuario' });
    }
    try {
        const [rows] = await pool.query(
            `SELECT er.id_ejercicio, COALESCE(v.nombre_video, er.nombre_ejercicio) AS nombre_video,
                    v.categoria, v.dificultad,
                    er.fecha_hora_inicio, er.fecha_hora_fin, er.duracion_segundos,
                    er.calorias_quemadas, er.nivel_esfuerzo, er.completado, er.comentarios
             FROM ejercicio_realizado er
             LEFT JOIN videos v ON er.id_video = v.id_video
             WHERE er.id_usuario = ?
             ORDER BY er.fecha_hora_inicio DESC`,
            [id_usuario]
        );
        res.json({ success: true, historial: rows });
    } catch (error) {
        console.error(' Error al obtener historial:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// ============================================
// PROGRESO DEL USUARIO (resumen de sesiones guardadas en la BD)
// ============================================
async function resumenProgreso(idUsuario) {
    const [[totales]] = await pool.query(
        `SELECT COUNT(*) AS sesiones,
                COALESCE(SUM(completado = 1), 0) AS completadas,
                COALESCE(SUM(completado = 0), 0) AS detenidas,
                COALESCE(ROUND(SUM(CASE WHEN completado = 1 THEN duracion_segundos ELSE 0 END) / 60), 0) AS minutos,
                COALESCE(ROUND(SUM(CASE WHEN completado = 1 THEN calorias_quemadas ELSE 0 END)), 0) AS calorias,
                ROUND(AVG(nivel_esfuerzo), 1) AS esfuerzo_promedio
         FROM ejercicio_realizado
         WHERE id_usuario = ?`,
        [idUsuario]
    );
    // Sesiones completadas por día de la semana actual (0 = domingo … 6 = sábado)
    const [semana] = await pool.query(
        `SELECT DAYOFWEEK(fecha_hora_inicio) - 1 AS dia_semana, COUNT(*) AS sesiones
         FROM ejercicio_realizado
         WHERE id_usuario = ? AND completado = 1
           AND YEARWEEK(fecha_hora_inicio, 0) = YEARWEEK(CURDATE(), 0)
         GROUP BY dia_semana`,
        [idUsuario]
    );
    const porDia = [0, 0, 0, 0, 0, 0, 0];
    semana.forEach(r => { porDia[r.dia_semana] = Number(r.sesiones); });

    const [dias] = await pool.query(
        `SELECT DISTINCT DATE_FORMAT(fecha_hora_inicio, '%Y-%m-%d') AS dia
         FROM ejercicio_realizado
         WHERE id_usuario = ? AND completado = 1
           AND fecha_hora_inicio >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)`,
        [idUsuario]
    );
    // Última vez que se detuvo una sesión por señal de alarma (aviso para el cuidador)
    const [[alarma]] = await pool.query(
        `SELECT MAX(fecha_hora_inicio) AS ultima
         FROM ejercicio_realizado
         WHERE id_usuario = ? AND completado = 0 AND comentarios = 'Detenida por señal de alarma'`,
        [idUsuario]
    );

    return {
        totales: {
            sesiones: Number(totales.sesiones),
            completadas: Number(totales.completadas),
            detenidas: Number(totales.detenidas),
            minutos: Number(totales.minutos),
            calorias: Number(totales.calorias),
            esfuerzo_promedio: totales.esfuerzo_promedio === null ? null : Number(totales.esfuerzo_promedio),
        },
        semana: porDia,
        racha: calcularRacha(dias.map(d => d.dia)),
        ultima_alarma: alarma.ultima,
    };
}

app.get('/api/progreso', async (req, res) => {
    try {
        res.json({ success: true, ...(await resumenProgreso(req.user.id)) });
    } catch (error) {
        console.error(' Error al obtener progreso:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// ============================================
// CUIDADOR VINCULADO (RF12, RN05)
// El adulto mayor genera un código → el cuidador lo usa → el adulto autoriza o rechaza.
// ============================================
async function obtenerVinculo(idVinculo) {
    const [rows] = await pool.query('SELECT * FROM vinculos_cuidador WHERE id_vinculo = ?', [idVinculo]);
    return rows[0] || null;
}

// --- Lado del adulto mayor ---
app.post('/api/cuidadores/codigo', async (req, res) => {
    if (req.user.rol !== 'usuario') {
        return res.status(403).json({ success: false, message: 'Solo un adulto mayor puede invitar a un cuidador' });
    }
    try {
        // Solo una invitación activa a la vez: la nueva reemplaza a la anterior
        await pool.query(`DELETE FROM vinculos_cuidador WHERE id_adulto = ? AND estado = 'invitacion'`, [req.user.id]);
        const codigo = generarCodigo();
        await pool.query(
            `INSERT INTO vinculos_cuidador (id_adulto, codigo, codigo_expira)
             VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
            [req.user.id, codigo, HORAS_VIGENCIA_CODIGO]
        );
        res.json({ success: true, codigo, horas_vigencia: HORAS_VIGENCIA_CODIGO });
    } catch (error) {
        console.error(' Error al generar código de cuidador:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

app.get('/api/cuidadores', async (req, res) => {
    try {
        const [vinculos] = await pool.query(
            `SELECT vc.id_vinculo, vc.estado, vc.codigo, vc.codigo_expira, vc.fecha_autorizacion,
                    u.nombre AS nombre_cuidador, u.email AS email_cuidador
             FROM vinculos_cuidador vc
             LEFT JOIN usuarios u ON u.id_usuario = vc.id_cuidador
             WHERE vc.id_adulto = ? AND vc.estado IN ('invitacion', 'pendiente', 'autorizado')
               AND (vc.estado <> 'invitacion' OR vc.codigo_expira > NOW())
             ORDER BY vc.fecha_creacion DESC`,
            [req.user.id]
        );
        res.json({ success: true, vinculos });
    } catch (error) {
        console.error(' Error al listar cuidadores:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

async function cambiarEstadoVinculo(req, res, accion) {
    try {
        const vinculo = await obtenerVinculo(req.params.id);
        const v = validarTransicion(accion, vinculo, req.user.id);
        if (!v.ok) return res.status(vinculo ? 403 : 404).json({ success: false, message: v.mensaje });
        await pool.query(
            `UPDATE vinculos_cuidador
             SET estado = ?,
                 fecha_autorizacion = IF(? = 'autorizado', NOW(), fecha_autorizacion),
                 fecha_revocacion   = IF(? = 'revocado',   NOW(), fecha_revocacion)
             WHERE id_vinculo = ?`,
            [v.nuevoEstado, v.nuevoEstado, v.nuevoEstado, vinculo.id_vinculo]
        );
        res.json({ success: true, estado: v.nuevoEstado });
    } catch (error) {
        console.error(` Error al ${accion} vínculo:`, error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
}

app.post('/api/cuidadores/:id/autorizar', (req, res) =>
    cambiarEstadoVinculo(req, res, req.body.autorizar === false ? 'rechazar' : 'autorizar'));
app.post('/api/cuidadores/:id/revocar', (req, res) => cambiarEstadoVinculo(req, res, 'revocar'));

// --- Lado del cuidador ---
app.post('/api/cuidador/vincular', async (req, res) => {
    if (req.user.rol !== 'cuidador') {
        return res.status(403).json({ success: false, message: 'Solo una cuenta de cuidador puede usar un código' });
    }
    const codigo = String(req.body.codigo || '').replace(/\D/g, '');
    if (codigo.length !== 6) return res.status(400).json({ success: false, message: 'El código debe tener 6 dígitos' });
    try {
        const [rows] = await pool.query(
            `SELECT * FROM vinculos_cuidador WHERE codigo = ? AND estado = 'invitacion'
             ORDER BY fecha_creacion DESC LIMIT 1`,
            [codigo]
        );
        const v = validarTransicion('usar_codigo', rows[0], req.user.id);
        if (!v.ok) return res.status(400).json({ success: false, message: rows[0] ? v.mensaje : 'Código no válido' });

        const [yaVinculado] = await pool.query(
            `SELECT 1 FROM vinculos_cuidador
             WHERE id_adulto = ? AND id_cuidador = ? AND estado IN ('pendiente', 'autorizado')`,
            [rows[0].id_adulto, req.user.id]
        );
        if (yaVinculado.length > 0) {
            return res.status(400).json({ success: false, message: 'Ya tienes una solicitud o vínculo con esta persona' });
        }
        await pool.query(
            `UPDATE vinculos_cuidador SET id_cuidador = ?, estado = 'pendiente' WHERE id_vinculo = ?`,
            [req.user.id, rows[0].id_vinculo]
        );
        res.json({ success: true, message: 'Solicitud enviada. El adulto mayor debe autorizarte desde su app.' });
    } catch (error) {
        console.error(' Error al usar código de cuidador:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

app.get('/api/cuidador/adultos', async (req, res) => {
    try {
        const [adultos] = await pool.query(
            `SELECT vc.id_vinculo, vc.estado, vc.id_adulto, u.nombre, u.nivel_funcional
             FROM vinculos_cuidador vc
             JOIN usuarios u ON u.id_usuario = vc.id_adulto
             WHERE vc.id_cuidador = ? AND vc.estado IN ('pendiente', 'autorizado')
             ORDER BY u.nombre`,
            [req.user.id]
        );
        // Mientras esté pendiente no se expone el nivel funcional (dato de salud)
        res.json({
            success: true,
            adultos: adultos.map(a => a.estado === 'autorizado' ? a : { ...a, nivel_funcional: null })
        });
    } catch (error) {
        console.error(' Error al listar adultos del cuidador:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

app.get('/api/cuidador/adultos/:idAdulto/progreso', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT * FROM vinculos_cuidador
             WHERE id_adulto = ? AND id_cuidador = ? AND estado = 'autorizado' LIMIT 1`,
            [req.params.idAdulto, req.user.id]
        );
        // RN05: sin vínculo autorizado no hay acceso
        if (!puedeVerAdulto(rows[0], req.user.id)) {
            return res.status(403).json({ success: false, message: 'No tienes autorización para ver a esta persona' });
        }
        const [sesiones] = await pool.query(
            `SELECT COALESCE(v.nombre_video, er.nombre_ejercicio) AS ejercicio, er.fecha_hora_inicio,
                    er.duracion_segundos, er.nivel_esfuerzo, er.completado, er.comentarios
             FROM ejercicio_realizado er
             LEFT JOIN videos v ON v.id_video = er.id_video
             WHERE er.id_usuario = ?
             ORDER BY er.fecha_hora_inicio DESC
             LIMIT 10`,
            [req.params.idAdulto]
        );
        res.json({ success: true, ...(await resumenProgreso(req.params.idAdulto)), sesiones });
    } catch (error) {
        console.error(' Error al obtener progreso para cuidador:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// ============================================
// RECORDATORIOS (RF13)
// ============================================
const DIAS_VALIDOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

app.get('/api/recordatorios', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id_recordatorio AS id, DATE_FORMAT(hora, '%H:%i') AS hora, dias, etiqueta AS label, activo
             FROM recordatorios WHERE id_usuario = ? ORDER BY hora`,
            [req.user.id]
        );
        res.json({
            success: true,
            recordatorios: rows.map(r => ({ ...r, dias: r.dias.split(','), activo: !!r.activo }))
        });
    } catch (error) {
        console.error(' Error al obtener recordatorios:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// Reemplaza la lista completa de recordatorios del usuario
app.put('/api/recordatorios', async (req, res) => {
    const lista = req.body.recordatorios;
    if (!Array.isArray(lista) || lista.length > 20) {
        return res.status(400).json({ success: false, message: 'Lista de recordatorios inválida' });
    }
    for (const r of lista) {
        if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(r.hora || '')
            || !Array.isArray(r.dias) || r.dias.length === 0 || !r.dias.every(d => DIAS_VALIDOS.includes(d))) {
            return res.status(400).json({ success: false, message: 'Cada recordatorio necesita hora HH:MM y al menos un día' });
        }
    }
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM recordatorios WHERE id_usuario = ?', [req.user.id]);
        for (const r of lista) {
            await conn.query(
                'INSERT INTO recordatorios (id_usuario, hora, dias, etiqueta, activo) VALUES (?, ?, ?, ?, ?)',
                [req.user.id, r.hora, r.dias.join(','), sanitizeInput(String(r.label || 'Recordatorio de ejercicio')).slice(0, 100), r.activo ? 1 : 0]
            );
        }
        await conn.commit();
        res.json({ success: true });
    } catch (error) {
        await conn.rollback();
        console.error(' Error al guardar recordatorios:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    } finally {
        conn.release();
    }
});

// ============================================
// DERECHOS SOBRE LOS DATOS (RF15, LFPDPPP): acceso, revocación y cancelación
// ============================================
app.get('/api/mis-datos', async (req, res) => {
    try {
        const id = req.user.id;
        const [[perfil]] = await pool.query(
            `SELECT id_usuario, nombre, email, fecha_nacimiento, peso, altura, genero, telefono, rol,
                    fecha_registro, nivel_actividad, nivel_funcional, condiciones_medicas, restricciones
             FROM usuarios WHERE id_usuario = ?`,
            [id]
        );
        perfil.condiciones_medicas = decryptText(perfil.condiciones_medicas);
        perfil.restricciones = decryptText(perfil.restricciones);
        const [consentimientos] = await pool.query(
            'SELECT version_aviso, acepta_datos_salud, fecha_otorgado, fecha_revocado FROM consentimientos WHERE id_usuario = ?', [id]);
        const [valoraciones] = await pool.query(
            'SELECT tipo, respuestas, puntaje, aplicador, fecha_aplicacion, nivel_resultante, fecha_registro FROM valoraciones WHERE id_usuario = ?', [id]);
        const [sesiones] = await pool.query(
            `SELECT nombre_ejercicio, id_video, fecha_hora_inicio, duracion_segundos, nivel_esfuerzo, completado, comentarios
             FROM ejercicio_realizado WHERE id_usuario = ?`, [id]);
        const [recordatorios] = await pool.query(
            'SELECT hora, dias, etiqueta, activo FROM recordatorios WHERE id_usuario = ?', [id]);
        const [cuidadores] = await pool.query(
            `SELECT u.nombre, vc.estado, vc.fecha_autorizacion, vc.fecha_revocacion
             FROM vinculos_cuidador vc JOIN usuarios u ON u.id_usuario = vc.id_cuidador
             WHERE vc.id_adulto = ?`, [id]);
        res.json({
            success: true,
            generado: new Date().toISOString(),
            datos: { perfil, consentimientos, valoraciones, sesiones, recordatorios, cuidadores }
        });
    } catch (error) {
        console.error(' Error al exportar datos:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// Revocar el consentimiento borra los datos de salud y corta el acceso de los cuidadores
app.post('/api/consentimiento/revocar', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query(
            'UPDATE consentimientos SET fecha_revocado = NOW() WHERE id_usuario = ? AND fecha_revocado IS NULL', [req.user.id]);
        await conn.query('DELETE FROM valoraciones WHERE id_usuario = ?', [req.user.id]);
        await conn.query(
            'UPDATE usuarios SET nivel_funcional = NULL, condiciones_medicas = NULL, restricciones = NULL WHERE id_usuario = ?',
            [req.user.id]);
        await conn.query(
            `UPDATE vinculos_cuidador SET estado = 'revocado', fecha_revocacion = NOW()
             WHERE id_adulto = ? AND estado IN ('pendiente', 'autorizado')`, [req.user.id]);
        await conn.commit();
        res.json({ success: true, message: 'Consentimiento revocado. Se borraron tus datos de salud.' });
    } catch (error) {
        await conn.rollback();
        console.error(' Error al revocar consentimiento:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    } finally {
        conn.release();
    }
});

// Cancelación: elimina la cuenta y, por ON DELETE CASCADE, todos sus datos
app.delete('/api/mis-datos', async (req, res) => {
    if (req.body.confirmacion !== 'ELIMINAR') {
        return res.status(400).json({ success: false, message: 'Escribe ELIMINAR para confirmar' });
    }
    if (req.user.rol === 'admin') {
        return res.status(403).json({ success: false, message: 'Una cuenta de administrador no se elimina desde aquí' });
    }
    try {
        await pool.query('DELETE FROM usuarios WHERE id_usuario = ?', [req.user.id]);
        res.json({ success: true, message: 'Tu cuenta y todos tus datos fueron eliminados' });
    } catch (error) {
        console.error(' Error al eliminar cuenta:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// ============================================
// EVOLUCIÓN DEL USUARIO
// ============================================
app.get('/api/evolucion/:id_usuario', async (req, res) => {
    const { id_usuario } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT id_evolucion, fecha_registro, peso, presion_arterial_sistolica,
                    presion_arterial_diastolica, frecuencia_cardiaca_reposo,
                    flexibilidad_cm, fuerza_prensalon_kg, equilibrio_segundos, notas
             FROM evolucion_usuario
             WHERE id_usuario = ?
             ORDER BY fecha_registro DESC`,
            [id_usuario]
        );
        res.json({ success: true, evolucion: rows });
    } catch (error) {
        console.error(' Error al obtener evolución:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

app.post('/api/evolucion', async (req, res) => {
    const { id_usuario, fecha_registro, peso, presion_arterial_sistolica,
        presion_arterial_diastolica, frecuencia_cardiaca_reposo,
        flexibilidad_cm, fuerza_prensalon_kg, equilibrio_segundos, notas } = req.body;

    if (!id_usuario || !fecha_registro) {
        return res.status(400).json({ success: false, message: 'id_usuario y fecha_registro son obligatorios' });
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO evolucion_usuario
                (id_usuario, fecha_registro, peso, presion_arterial_sistolica,
                 presion_arterial_diastolica, frecuencia_cardiaca_reposo,
                 flexibilidad_cm, fuerza_prensalon_kg, equilibrio_segundos, notas)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id_usuario, fecha_registro, peso ?? null, presion_arterial_sistolica ?? null,
                presion_arterial_diastolica ?? null, frecuencia_cardiaca_reposo ?? null,
                flexibilidad_cm ?? null, fuerza_prensalon_kg ?? null, equilibrio_segundos ?? null, notas ?? null]
        );
        res.json({ success: true, id: result.insertId, message: 'Evolución registrada correctamente' });
    } catch (error) {
        console.error(' Error al registrar evolución:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// REPORTE SEMANAL
// ============================================
app.get('/api/reporte/:id_usuario', async (req, res) => {
    const { id_usuario } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT id_reporte, fecha_inicio_semana, fecha_fin_semana, total_ejercicios,
                    total_minutos, total_calorias, dias_activos, promedio_esfuerzo,
                    progreso_fisico, observaciones, fecha_generacion
             FROM reporte_semanal
             WHERE id_usuario = ?
             ORDER BY fecha_generacion DESC`,
            [id_usuario]
        );
        res.json({ success: true, reportes: rows });
    } catch (error) {
        console.error(' Error al obtener reportes:', error);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

// ============================================
// ADMIN — VIDEOS
// ============================================

// Obtener todos los videos (incluyendo inactivos para el admin)
app.get('/api/admin/videos', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id_video, nombre_video, descripcion, categoria, subcategoria,
                    dificultad, duracion_min, link_video, url_miniatura,
                    calorias_estimadas, edad_minima, edad_maxima,
                    peso_maximo_recomendado, nivel_funcional, contraindicaciones,
                    fuente_documental, fecha_creacion, activo
             FROM videos
             ORDER BY id_video DESC`
        );
        res.json({ success: true, videos: rows });
    } catch (error) {
        console.error(' Error al obtener videos:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Agregar video
app.post('/api/admin/videos', async (req, res) => {
    const { nombre_video, descripcion, categoria, subcategoria, dificultad,
        duracion_min, link_video, url_miniatura, calorias_estimadas,
        edad_minima, edad_maxima, peso_maximo_recomendado, nivel_funcional,
        contraindicaciones, fuente_documental, activo } = req.body;
    if (nivel_funcional !== undefined && ![1, 2, 3].includes(Number(nivel_funcional))) {
        return res.status(400).json({ success: false, message: 'El nivel funcional debe ser 1, 2 o 3' });
    }
    // RN06: un ejercicio sin fuente documental no puede publicarse
    if (Number(activo ?? 1) === 1 && !(fuente_documental || '').trim()) {
        return res.status(400).json({
            success: false,
            message: 'Para publicar el ejercicio indica su fuente documental (por ejemplo: OMS 2020, Vivifrail, Otago). Si no la tienes, guárdalo como inactivo.'
        });
    }

    if (!nombre_video || !categoria || !dificultad || duracion_min === undefined || duracion_min === null) {
        return res.status(400).json({ success: false, message: 'nombre_video, categoria, dificultad y duracion_min son obligatorios' });
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO videos
                (nombre_video, descripcion, categoria, subcategoria, dificultad,
                 duracion_min, link_video, url_miniatura, calorias_estimadas,
                 edad_minima, edad_maxima, peso_maximo_recomendado, nivel_funcional,
                 contraindicaciones, fuente_documental, activo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [nombre_video, descripcion ?? null, categoria, subcategoria ?? null,
                dificultad, duracion_min, link_video ?? '', url_miniatura ?? null,
                calorias_estimadas ?? null, edad_minima ?? 60, edad_maxima ?? 100,
                peso_maximo_recomendado ?? null, nivel_funcional ?? 1,
                contraindicaciones || null, fuente_documental || null, activo ?? 1]
        );
        res.json({ success: true, id: result.insertId, message: 'Video agregado correctamente' });
    } catch (error) {
        console.error(' Error al agregar video:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Editar video
app.put('/api/admin/videos/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre_video, descripcion, categoria, subcategoria, dificultad,
        duracion_min, link_video, url_miniatura, calorias_estimadas,
        edad_minima, edad_maxima, peso_maximo_recomendado, nivel_funcional,
        contraindicaciones, fuente_documental, activo } = req.body;
    if (nivel_funcional !== undefined && ![1, 2, 3].includes(Number(nivel_funcional))) {
        return res.status(400).json({ success: false, message: 'El nivel funcional debe ser 1, 2 o 3' });
    }
    // RN06: un ejercicio sin fuente documental no puede publicarse
    if (Number(activo ?? 1) === 1 && !(fuente_documental || '').trim()) {
        return res.status(400).json({
            success: false,
            message: 'Para publicar el ejercicio indica su fuente documental (por ejemplo: OMS 2020, Vivifrail, Otago). Si no la tienes, guárdalo como inactivo.'
        });
    }
    try {
        const [result] = await pool.query(
            `UPDATE videos SET
                nombre_video = ?, descripcion = ?, categoria = ?, subcategoria = ?,
                dificultad = ?, duracion_min = ?, link_video = ?, url_miniatura = ?,
                calorias_estimadas = ?, edad_minima = ?, edad_maxima = ?,
                peso_maximo_recomendado = ?, nivel_funcional = ?,
                contraindicaciones = ?, fuente_documental = ?, activo = ?
             WHERE id_video = ?`,
            [nombre_video, descripcion ?? null, categoria, subcategoria ?? null,
                dificultad, duracion_min, link_video ?? '', url_miniatura ?? null,
                calorias_estimadas ?? null, edad_minima ?? 60, edad_maxima ?? 100,
                peso_maximo_recomendado ?? null, nivel_funcional ?? 1,
                contraindicaciones || null, fuente_documental || null, activo ?? 1, id]
        );
        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Video actualizado correctamente' });
        } else {
            res.json({ success: false, message: 'Video no encontrado' });
        }
    } catch (error) {
        console.error(' Error al editar video:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Borrar video
app.delete('/api/admin/videos/:id', async (req, res) => {
    const { id } = req.params;
    console.log('  DELETE video ID:', id);
    try {
        const [result] = await pool.query('DELETE FROM videos WHERE id_video = ?', [id]);
        console.log('Filas afectadas:', result.affectedRows);
        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Video eliminado correctamente' });
        } else {
            res.json({ success: false, message: 'Video no encontrado' });
        }
    } catch (error) {
        console.error(' Error al borrar video:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMIN — CONFIGURACIÓN DE EJERCICIOS
// ============================================

// Obtener todas las configuraciones
app.get('/api/admin/config-ejercicios', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id_config, edad_min, edad_max, peso_min, peso_max,
                    nivel_dificultad, condiciones_especiales, categoria_recomendada,
                    max_minutos_diarios, dias_semana_recomendados
             FROM configuracion_ejercicios
             ORDER BY id_config ASC`
        );
        res.json({ success: true, configuraciones: rows });
    } catch (error) {
        console.error(' Error al obtener configuraciones:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Agregar configuración
app.post('/api/admin/config-ejercicios', async (req, res) => {
    const { edad_min, edad_max, peso_min, peso_max, nivel_dificultad,
        condiciones_especiales, categoria_recomendada,
        max_minutos_diarios, dias_semana_recomendados } = req.body;

    if (edad_min === undefined || edad_max === undefined) {
        return res.status(400).json({ success: false, message: 'edad_min y edad_max son obligatorios' });
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO configuracion_ejercicios
                (edad_min, edad_max, peso_min, peso_max, nivel_dificultad,
                 condiciones_especiales, categoria_recomendada,
                 max_minutos_diarios, dias_semana_recomendados)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [edad_min, edad_max, peso_min || null, peso_max || null,
                nivel_dificultad || null, condiciones_especiales || null,
                categoria_recomendada || null,
                max_minutos_diarios || 30, dias_semana_recomendados || 3]
        );
        res.json({ success: true, id: result.insertId, message: 'Configuración agregada correctamente' });
    } catch (error) {
        console.error(' Error al agregar configuración:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Editar configuración
app.put('/api/admin/config-ejercicios/:id', async (req, res) => {
    const { id } = req.params;
    const { edad_min, edad_max, peso_min, peso_max, nivel_dificultad,
        condiciones_especiales, categoria_recomendada,
        max_minutos_diarios, dias_semana_recomendados } = req.body;
    try {
        const [result] = await pool.query(
            `UPDATE configuracion_ejercicios SET
                edad_min = ?, edad_max = ?, peso_min = ?, peso_max = ?,
                nivel_dificultad = ?, condiciones_especiales = ?,
                categoria_recomendada = ?, max_minutos_diarios = ?,
                dias_semana_recomendados = ?
             WHERE id_config = ?`,
            [edad_min, edad_max, peso_min ?? null, peso_max ?? null,
                nivel_dificultad ?? null, condiciones_especiales ?? null,
                categoria_recomendada ?? null,
                max_minutos_diarios ?? 30, dias_semana_recomendados ?? 3, id]
        );
        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Configuración actualizada correctamente' });
        } else {
            res.json({ success: false, message: 'Configuración no encontrada' });
        }
    } catch (error) {
        console.error(' Error al editar configuración:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Borrar configuración
app.delete('/api/admin/config-ejercicios/:id', async (req, res) => {
    const { id } = req.params;
    console.log('  DELETE config ID:', id);
    try {
        const [result] = await pool.query('DELETE FROM configuracion_ejercicios WHERE id_config = ?', [id]);
        console.log('Filas afectadas:', result.affectedRows);
        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Configuración eliminada correctamente' });
        } else {
            res.json({ success: false, message: 'Configuración no encontrada' });
        }
    } catch (error) {
        console.error(' Error al borrar configuración:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMIN — USUARIOS
// ============================================

// Obtener todos los usuarios (sin exponer password_hash)
app.get('/api/admin/usuarios', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id_usuario, nombre, fecha_nacimiento, TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) AS edad, peso, altura,
                    genero, email, rol, cuenta_activa, telefono, fecha_registro,
                    nivel_actividad, condiciones_medicas, restricciones
             FROM usuarios
             ORDER BY id_usuario ASC`
        );
        const usuariosDesc = rows.map(u => ({
            ...u,
            condiciones_medicas: decryptText(u.condiciones_medicas),
            restricciones: decryptText(u.restricciones)
        }));
        res.json({ success: true, usuarios: usuariosDesc });
    } catch (error) {
        console.error('❌ Error al obtener usuarios:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Editar usuario (admin puede cambiar cualquier campo excepto password_hash)
app.put('/api/admin/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, email, peso, altura, genero, telefono, rol,
        cuenta_activa, nivel_actividad, condiciones_medicas, restricciones } = req.body;
    try {
        const encrypted_condiciones = encryptText(condiciones_medicas);
        const encrypted_restricciones = encryptText(restricciones);

        const [result] = await pool.query(
            `UPDATE usuarios SET
                nombre = ?, email = ?, peso = ?, altura = ?, genero = ?,
                telefono = ?, rol = ?, cuenta_activa = ?,
                nivel_actividad = ?, condiciones_medicas = ?, restricciones = ?
             WHERE id_usuario = ?`,
            [nombre, email, peso, altura || null, genero || null,
                telefono || null, rol || 'usuario', cuenta_activa || 1,
                nivel_actividad || 'sedentario', encrypted_condiciones || null,
                encrypted_restricciones || null, id]
        );
        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Usuario actualizado correctamente' });
        } else {
            res.json({ success: false, message: 'Usuario no encontrado' });
        }
    } catch (error) {
        console.error(' Error al editar usuario:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Borrar usuario
app.delete('/api/admin/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    console.log('  DELETE usuario ID:', id);
    try {
        const [result] = await pool.query('DELETE FROM usuarios WHERE id_usuario = ?', [id]);
        console.log('Filas afectadas:', result.affectedRows);
        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Usuario eliminado correctamente' });
        } else {
            res.json({ success: false, message: 'Usuario no encontrado' });
        }
    } catch (error) {
        console.error(' Error al borrar usuario:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// TIPS (tabla no existe en BD — respuesta estática)
// ============================================
app.get('/api/tips', (req, res) => {
    const tips = [
        'Mantente hidratado durante el ejercicio.',
        'Respira profundo antes de comenzar cada sesión.',
        'Descansa al menos un día entre sesiones intensas.',
        'Escucha a tu cuerpo y no fuerces el movimiento.',
        'La constancia es más importante que la intensidad.'
    ];
    const tip = tips[Math.floor(Math.random() * tips.length)];
    res.json({ tip });
});


// INICIAR SERVIDOR (HTTP)
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(` Servidor HTTP corriendo en puerto ${PORT}`);
    console.log(` Local:  http://localhost:${PORT}`);
    console.log(` Red:    http://192.168.100.14:${PORT}`);
    console.log(` Login:          POST /api/login`);
    console.log(` Registro:       POST /api/register`);
    console.log(` Ejercicios:      GET /api/exercises`);
    console.log(` Ejerc. usuario:  GET /api/exercises/user/:id`);
    console.log(`  Registrar ej.:  POST /api/ejercicio-realizado`);
    console.log(` Evolución:       GET /api/evolucion/:id_usuario`);
    console.log(` Reporte:         GET /api/reporte/:id_usuario`);
});
