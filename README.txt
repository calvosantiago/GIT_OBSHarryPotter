OBS AnimalSwarm (Power BI Custom Visual)

Visual personalizado para Power BI basado en PIXI.js. Permite desarrollo en vivo con el Developer visual conectando contra un servidor local (pbiviz start).

⚡ Requisitos

Node.js + npm (versión LTS recomendada)

Power BI Desktop (o Power BI Service con modo desarrollador)

powerbi-visuals-tools (pbiviz) instalado globalmente:

npm install -g powerbi-visuals-tools

🚀 Inicio rápido (desarrollo en vivo)

Clonar el repositorio

git clone https://github.com/<tu_usuario>/OBSAnimalSwarm.git
cd OBSAnimalSwarm


Instalar dependencias

npm install


Arrancar el servidor de desarrollo

pbiviz start


Esto levanta HTTPS en https://localhost:8080/
(endpoint de estado útil: https://localhost:8080/assets/status
)

Conectar desde Power BI

Power BI Desktop (recomendado)

Archivo → Opciones y configuración → Opciones → (Archivo actual) Configuración del informe → marca Desarrollar un visual.

Inserta el Developer visual desde el panel Visualizaciones.

Si te pide URL, usa: https://localhost:8080/assets/status

Power BI Service (web)

Configuración (⚙️) → Developer → activar Developer mode.

Abre un informe y agrega el Developer visual.

Conéctalo a https://localhost:8080/assets/status
.

🔁 Con pbiviz start activo, cada vez que guardes cambios en src/, el visual se recompilará y se actualizará automáticamente en el informe.

📦 Empaquetado (.pbiviz)

Para generar el archivo instalable:

pbiviz package


Se creará en dist/NombreDelVisual.pbiviz.
Puedes importarlo en Power BI con “Importar un visual desde un archivo”.

🌿 Flujo Git básico
# Ver estado y cambios
git status

# Preparar cambios para commit
git add .

# Guardar cambios en el historial local
git commit -m "Descripción clara del cambio"

# Enviar cambios a GitHub
git push

Ramas (opcional)
# Crear y cambiar a una nueva rama
git checkout -b feature/nueva-animacion

# Publicar la rama en remoto
git push -u origin feature/nueva-animacion

🧪 Estructura del proyecto (típica)
OBSAnimalSwarm/
├─ src/                # Código fuente del visual
├─ assets/             # Imágenes, iconos, etc.
├─ dist/               # (build empaquetado .pbiviz)
├─ .tmp/               # (build temporal en desarrollo)
├─ pbiviz.json         # Manifiesto del visual
├─ capabilities.json   # Capacidades del visual
├─ package.json
└─ tsconfig.json


Asegúrate de no versionar node_modules/, dist/ ni .tmp/ (usa .gitignore).

🩺 Solución de problemas
1) “No conecta / certificado no confiable”
pbiviz --install-cert


Luego vuelve a:

pbiviz start


(Abre https://localhost:8080/assets/status
 en el navegador y acepta el aviso si aparece)

2) Error con .tmp/drop/visual.js o archivos bloqueados

Cierra Power BI Desktop.

En la terminal detén el servidor con Ctrl + C.

Limpia temporales y caches:

pbiviz --clean
npx rimraf .tmp dist node_modules/.cache


Si no tienes rimraf: npm i -g rimraf

Reinstala deps y arranca:

npm install
pbiviz start

3) Cambié pbiviz.json / capabilities.json y no se refleja

Elimina el Developer visual del lienzo y vuelve a insertarlo.

🧷 Tip rápido (cuando haya cualquier fallo)

Si algo falla o no carga, simplemente:

npm install
pbiviz start


y vuelve a conectar https://localhost:8080/assets/status
 desde el Developer visual.