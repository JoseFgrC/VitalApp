# VitalApp — Manual de instalación

Aplicación de ejercicio terapéutico para adultos mayores. Tiene dos partes:

| Carpeta | Qué es | Tecnología |
|---|---|---|
| `VitalBackend/` | API REST y base de datos | Node.js + Express + MySQL 8 |
| `VitalApp/` | Aplicación (web, Android, iOS) | React Native + Expo SDK 54 |

Este manual permite instalar y ejecutar el sistema en un equipo nuevo (RNF09). Los comandos son para Linux (Ubuntu); en Windows o macOS cambian solo los de instalación de MySQL.

---

## 1. Requisitos

- **Node.js 20 o superior** (`node -v`)
- **MySQL 8.0.16 o superior** (`mysql --version`)
- **Git**
- Para probar en el teléfono: la app **Expo Go** (Android o iOS)

En Ubuntu, MySQL se instala con `sudo apt install mysql-server`.

## 2. Descargar el código

```bash
git clone https://github.com/JoseIngSis/VitalAppNube.git
cd VitalAppNube
```

## 3. Crear la base de datos

```bash
cd VitalBackend
sudo mysql < schema.sql
```

Crea la base `vitalapp` con todas sus tablas. Para comprobarlo:

```bash
sudo mysql -e "USE vitalapp; SHOW TABLES;"
```

Deben aparecer 12 tablas: `configuracion_ejercicios`, `consentimientos`, `ejercicio_realizado`, `evolucion_usuario`, `recordatorios`, `reporte_semanal`, `rutina_ejercicios`, `rutinas`, `usuarios`, `valoraciones`, `videos` y `vinculos_cuidador`.

Carga el contenido inicial: 44 ejercicios y 7 rutinas con su video de YouTube, **como borradores** que el administrador debe revisar y publicar (ver paso 8):

```bash
sudo mysql < migraciones/003_rutinas_contenido_inicial.sql
```

> **¿Ya tenías la base de una versión anterior?** No ejecutes `schema.sql`. Aplica solo las migraciones que te falten, en orden:
> `sudo mysql < migraciones/001_consentimiento_valoracion_nivel.sql`, luego la `002_…` y la `003_…`.

## 4. Crear el usuario de MySQL de la aplicación

Cambia `TuClaveSegura123!` por una contraseña propia:

```bash
sudo mysql -e "CREATE USER 'vitalapp'@'localhost' IDENTIFIED BY 'TuClaveSegura123!'; GRANT ALL ON vitalapp.* TO 'vitalapp'@'localhost';"
```

## 5. Configurar el backend

Dentro de `VitalBackend/`, crea el archivo `.env`. Este comando genera las claves secretas automáticamente; **cambia solo la contraseña** por la del paso 4:

```bash
cat > .env <<EOF
DB_HOST=localhost
DB_USER=vitalapp
DB_PASSWORD=TuClaveSegura123!
DB_NAME=vitalapp
DB_PORT=3306
PORT=3000
JWT_SECRET=$(openssl rand -hex 32)
CSRF_SECRET=$(openssl rand -hex 32)
DB_ENCRYPTION_KEY=$(openssl rand -hex 32)
HMAC_SECRET=VitalApp_HMAC_K3y_S3cur@2024!xZ9qPm
GOOGLE_CLIENT_ID=
EOF
```

| Variable | Para qué sirve |
|---|---|
| `DB_*` | Conexión a MySQL |
| `JWT_SECRET` | Firma de las sesiones de usuario |
| `CSRF_SECRET` | Protección contra peticiones falsificadas |
| `DB_ENCRYPTION_KEY` | Cifrado AES-256 de las condiciones médicas (64 caracteres hexadecimales) |
| `HMAC_SECRET` | Firma de integridad de cada petición. **Debe ser igual** al valor de `EXPO_PUBLIC_HMAC_SECRET` de la app (si no se define, la app usa el que aparece arriba) |
| `GOOGLE_CLIENT_ID` | Opcional, solo para «Entrar con Google» |

> `DB_ENCRYPTION_KEY` no debe cambiarse después de tener usuarios: los datos cifrados con la clave anterior ya no podrían leerse.

Instala las dependencias y comprueba la conexión:

```bash
npm install
node check_tables.js      # debe mostrar "Connection successful" y las tablas
npm test                  # pruebas unitarias de las reglas de negocio
```

## 6. Ejecutar el backend

```bash
node server.js
```

Abre http://localhost:3000 en el navegador. Debe responder `VitalApp API is online and running correctly`. **Deja esta terminal abierta.**

Con el servidor corriendo, desde otra terminal puedes ejecutar la prueba de integración completa (crea cuentas temporales y las borra al final):

```bash
cd VitalBackend
node pruebas-api/flujo-completo.mjs     # cuentas, valoración, cuidador, recordatorios, datos
node pruebas-api/rutinas-admin.mjs      # administración de ejercicios y rutinas (RN03, RN06)
```

## 7. Ejecutar la app

En otra terminal:

```bash
cd VitalApp
npm install
npm run web          # versión web en http://localhost:8081
```

Para el teléfono: `npm start` y escanea el código QR con Expo Go. El teléfono debe estar en la misma red que la computadora, y la app debe apuntar a la IP de la computadora en lugar de `localhost`. Para eso, crea `VitalApp/.env.local` con:

```
EXPO_PUBLIC_API_URL=http://192.168.X.X:3000
```

## 8. Primeros pasos dentro de la app

1. **Crear un administrador** (el registro de la app nunca crea administradores). Desde `VitalBackend/`:
   ```bash
   node scripts/crear-admin.js admin@correo.com "ContraseñaSegura123" "Nombre"
   ```
   La contraseña debe tener al menos 8 caracteres. Si el correo ya existe, esa cuenta se convierte en admin y recibe la contraseña indicada.
2. **Revisar y publicar ejercicios:** entra como admin. En **Ejercicios → Por revisar** están los borradores importados: abre cada uno, revisa el video con «Ver video», escribe su **fuente documental** (RN06), ajusta el **nivel funcional** (1, 2 o 3) y cámbialo a **Publicado**. También puedes agregar ejercicios nuevos.
3. **Publicar rutinas:** en **Rutinas**, edita una rutina (ordena, agrega o quita ejercicios) y cámbiala a **Publicada**. Solo se puede publicar cuando todos sus ejercicios están publicados. Mientras no haya contenido publicado, la app muestra una lista de respaldo integrada en el código.
4. **Probar como adulto mayor:** registra otra cuenta como «Soy adulto mayor», acepta el aviso de privacidad y responde la valoración. Solo verás los ejercicios de tu nivel o inferiores.
5. **Probar como cuidador:** en el perfil del adulto mayor → «Privacidad y cuidadores» → «Invitar a un cuidador». Registra una tercera cuenta como «Soy cuidador o familiar», escribe el código y autoriza la solicitud desde la cuenta del adulto mayor.

> Los ejercicios también se filtran por edad (`edad_minima`, 60 por defecto). Una cuenta de prueba con fecha de nacimiento reciente no verá ejercicios a menos que se ajuste ese campo.

## 9. Respaldo diario de la base de datos (RNF08)

```bash
cd VitalBackend
bash scripts/respaldo.sh
```

Guarda un respaldo comprimido en `VitalBackend/respaldos/` y conserva los de los últimos 14 días. Para que se ejecute todos los días a las 2:00 a. m., agrega esta línea con `crontab -e` (ajusta la ruta):

```
0 2 * * * cd /ruta/a/VitalAppNube/VitalBackend && bash scripts/respaldo.sh >> respaldos/respaldo.log 2>&1
```

Para restaurar un respaldo:

```bash
gunzip < respaldos/vitalapp_AAAA-MM-DD_HHMM.sql.gz | mysql -u vitalapp -p vitalapp
```

## 10. Problemas frecuentes

| Mensaje | Causa y solución |
|---|---|
| `Access denied for user 'root'@'localhost'` | En Ubuntu, `root` entra con `sudo mysql`, no con `mysql -u root` |
| `Access denied for user 'vitalapp'` | La contraseña del `.env` no coincide con la del paso 4; repite el paso 4 con la misma contraseña |
| `The first argument must be of type string… crypto.js` | Falta `DB_ENCRYPTION_KEY` en el `.env`, o el `.env` no está dentro de `VitalBackend/` |
| `Firma inválida` al iniciar sesión | `HMAC_SECRET` del backend no coincide con el de la app |
| `Table 'vitalapp.xxx' doesn't exist` | Falta aplicar alguna migración (paso 3) |
