// --- CONFIGURACIÓN E HISTORIAL NATIVO ---
let nivelActual = 1;
let nivelMaximoDesbloqueado = 1;
const totalNiveles = 6;

// Estructura de Datos de los Niveles (Posición del dispensador de azúcar y el vaso meta)
const datosNiveles = {
    1: { fuente: { x: 200, y: 40 }, meta: { x: 200, y: 500, w: 70, h: 60 }, obstaculos: [] },
    2: { fuente: { x: 100, y: 40 }, meta: { x: 300, y: 520, w: 70, h: 60 }, obstaculos: [] },
    3: { fuente: { x: 200, y: 40 }, meta: { x: 200, y: 520, w: 70, h: 60 }, obstaculos: [{x: 120, y: 250, w: 160, h: 20}] },
    4: { fuente: { x: 80, y: 40 },  meta: { x: 310, y: 450, w: 60, h: 60 }, obstaculos: [{x: 0, y: 200, w: 200, h: 20}, {x: 150, y: 350, w: 250, h: 20}] },
    5: { fuente: { x: 200, y: 40 }, meta: { x: 80, y: 530, w: 60, h: 60 }, obstaculos: [{x: 100, y: 150, w: 200, h: 250}] },
    6: { fuente: { x: 200, y: 40 }, meta: { x: 200, y: 530, w: 60, h: 60 }, obstaculos: [{x: 50, y: 200, w: 300, h: 15}, {x: 120, y: 380, w: 160, h: 15}] }
};

// Variables del motor físico
let canvas, ctx;
let azucares = [];
let lineasDibujadas = [];
let dibujando = false;
let ultimaX = 0, ultimaY = 0;
let granosEnMeta = 0;
let metaRequerida = 50; // Cuantos granos se necesitan para ganar el nivel
let loopAnimacion;
let dispensadorIntervalo;
let audioCtx = null;

// Al cargar el documento, cargar historial de niveles guardados
document.addEventListener('DOMContentLoaded', () => {
    const progresoGuardado = localStorage.getItem('sugar_yani_progress');
    if (progresoGuardado) {
        nivelMaximoDesbloqueado = parseInt(progresoGuardado);
    }
    renderizarMapa();
});

// --- AUDIO SINTETIZADO ---
function sonar(frecuencia, tipo, duracion, volumen = 0.1) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = tipo;
        osc.frequency.setValueAtTime(frecuencia, audioCtx.currentTime);
        gain.gain.setValueAtTime(volumen, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duracion);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duracion);
    } catch(e){}
}

function sonidoDibujo() { sonar(400, 'triangle', 0.05, 0.05); }
function sonidoGrano() { sonar(1200, 'sine', 0.02, 0.02); }
function sonidoGanar() {
    sonar(523.25, 'sine', 0.15, 0.1);
    setTimeout(() => sonar(659.25, 'sine', 0.15, 0.1), 120);
    setTimeout(() => sonar(783.99, 'sine', 0.4, 0.15), 240);
}

// --- LOGICA DEL MAPA ---
function renderizarMapa() {
    document.getElementById('screen-map').style.display = 'flex';
    document.getElementById('screen-game').style.display = 'none';
    
    const grid = document.getElementById('levels-grid');
    grid.innerHTML = '';

    for (let i = 1; i <= totalNiveles; i++) {
        const caja = document.createElement('div');
        caja.className = `level-card ${i <= nivelMaximoDesbloqueado ? 'unlocked' : 'locked'}`;
        caja.innerText = i;
        
        if (i <= nivelMaximoDesbloqueado) {
            caja.onclick = () => cargarNivel(i);
        }
        grid.appendChild(caja);
    }
}

// --- LOGICA DEL MOTOR DE JUEGO ---
function cargarNivel(num) {
    nivelActual = num;
    document.getElementById('screen-map').style.display = 'none';
    document.getElementById('screen-game').style.display = 'flex';
    document.getElementById('level-title').innerText = `Nivel ${nivelActual}`;
    
    // Configurar el Canvas
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    // Ajustar resolución interna de dibujo fija (400x600) para que no dependa del tamaño del celular
    canvas.width = 400;
    canvas.height = 600;

    reiniciarNivel();
    configurarEventosTactiles();
}

function reiniciarNivel() {
    cancelAnimationFrame(loopAnimacion);
    clearInterval(dispensadorIntervalo);
    
    azucares = [];
    lineasDibujadas = [];
    granosEnMeta = 0;
    dibujando = false;
    
    actualizarIndicador();

    // Iniciar el chorro de azúcar (1 grano cada 60ms)
    dispensadorIntervalo = setInterval(() => {
        if (azucares.length < 150) { // Límite en pantalla para fluidez
            const config = datosNiveles[nivelActual];
            azucares.push({
                x: config.fuente.x + (Math.random() * 8 - 4),
                y: config.fuente.y,
                vx: Math.random() * 0.4 - 0.2,
                vy: 1.5 // Gravedad inicial constante
            });
        }
    }, 60);

    loop();
}

function volverAlMapa() {
    cancelAnimationFrame(loopAnimacion);
    clearInterval(dispensadorIntervalo);
    renderizarMapa();
}

function actualizarIndicador() {
    document.getElementById('target-indicator').innerText = `Progreso del Vaso: ${granosEnMeta} / ${metaRequerida}`;
}

// --- EVENTOS DE DIBUJO ---
function configurarEventosTactiles() {
    // Funciona para Dedos (Móvil) y Mouse (PC)
    canvas.addEventListener('mousedown', iniciarDibujo);
    canvas.addEventListener('mousemove', dibujarSegmentos);
    canvas.addEventListener('mouseup', terminarDibujo);
    
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); iniciarDibujo(e.touches[0]); });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); dibujarSegmentos(e.touches[0]); });
    canvas.addEventListener('touchend', terminarDibujo);
}

function obtenerCoordenadas(e) {
    const rect = canvas.getBoundingClientRect();
    // Conversión de escala de pantalla a píxeles lógicos del canvas (400x600)
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
}

function iniciarDibujo(e) {
    dibujando = true;
    const coords = obtenerCoordenadas(e);
    ultimaX = coords.x;
    ultimaY = coords.y;
    sonidoDibujo();
}

function dibujarSegmentos(e) {
    if (!dibujando) return;
    const coords = obtenerCoordenadas(e);
    
    // Guardar el segmento de línea para colisiones físicas
    lineasDibujadas.push({
        x1: ultimaX, y1: ultimaY,
        x2: coords.x, y2: coords.y
    });

    ultimaX = coords.x;
    ultimaY = coords.y;
    
    if (Math.random() < 0.3) sonidoDibujo();
}

function terminarDibujo() { dibujando = false; }

// --- MOTOR DE FÍSICA Y RENDERIZADO (LOOP) ---
function loop() {
    // 1. Limpiar pantalla
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const config = datosNiveles[nivelActual];

    // 2. Dibujar Obstáculos nativos del nivel
    ctx.fillStyle = '#4b5563';
    config.obstaculos.forEach(obs => {
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
    });

    // 3. Dibujar el Vaso Meta
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(config.meta.x, config.meta.y);
    ctx.lineTo(config.meta.x, config.meta.y + config.meta.h);
    ctx.lineTo(config.meta.x + config.meta.w, config.meta.y + config.meta.h);
    ctx.lineTo(config.meta.x + config.meta.w, config.meta.y);
    ctx.stroke();

    // Dibujar el agua/azúcar acumulado dentro del vaso visualmente
    if (granosEnMeta > 0) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
        let altoRelleno = (granosEnMeta / metaRequerida) * config.meta.h;
        ctx.fillRect(config.meta.x + 2, (config.meta.y + config.meta.h) - altoRelleno, config.meta.w - 4, altoRelleno);
    }

    // 4. Dibujar el dispensador S
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('▼ AZÚCAR ▼', config.fuente.x - 45, config.fuente.y - 10);

    // 5. Dibujar las líneas creadas por el jugador
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    lineasDibujadas.forEach(linea => {
        ctx.moveTo(linea.x1, linea.y1);
        ctx.lineTo(linea.x2, linea.y2);
    });
    ctx.stroke();

    // 6. Actualizar y Dibujar partículas de azúcar
    ctx.fillStyle = '#e2e8f0';
    for (let i = azucares.length - 1; i >= 0; i--) {
        let p = azucares[i];
        
        // Aplicar fuerza de gravedad
        p.vy += 0.15; 
        p.x += p.vx;
        p.y += p.vy;

        // Fricción suave en el aire
        p.vx *= 0.99;

        // -- COLISIÓN CON LÍNEAS DIBUJADAS --
        lineasDibujadas.forEach(linea => {
            if (verificarColisionPuntoSegmento(p.x, p.y, linea)) {
                // Hacer que el grano rebote y se deslice por la pendiente
                let dx = linea.x2 - linea.x1;
                let dy = linea.y2 - linea.y1;
                let longitud = Math.sqrt(dx*dx + dy*dy);
                let nx = -dy / longitud; // Vector normal de la línea
                let ny = dx / longitud;

                // Reflejar vector de velocidad del grano de azúcar
                let productoPunto = p.vx * nx + p.vy * ny;
                p.vx = (p.vx - 2 * productoPunto * nx) * 0.4;
                p.vy = (p.vy - 2 * productoPunto * ny) * 0.4;
                
                // Mover un poco la partícula hacia arriba de la línea para evitar que la traspase
                p.x += nx * 2;
                p.y += ny * 2;
            }
        });

        // -- COLISIÓN CON OBSTÁCULOS FIJOS --
        config.obstaculos.forEach(obs => {
            if (p.x > obs.x && p.x < obs.x + obs.w && p.y > obs.y && p.y < obs.y + obs.h) {
                p.vy = 0;
                p.y = obs.y - 1; // Se desliza sobre el bloque
                p.vx += Math.random() * 0.4 - 0.2;
            }
        });

        // Dibujar grano individual
        ctx.fillRect(p.x, p.y, 3, 3);

        // -- VERIFICAR ENTRADA AL VASO META --
        if (p.x > config.meta.x && p.x < config.meta.x + config.meta.w && p.y > config.meta.y && p.y < config.meta.y + config.meta.h) {
            azucares.splice(i, 1);
            granosEnMeta++;
            sonidoGrano();
            actualizarIndicador();

            // CONDICIÓN DE VICTORIA DEL NIVEL
            if (granosEnMeta >= metaRequerida) {
                ganarNivel();
                return; // Cortar el loop de inmediato
            }
            continue;
        }

        // Borrar granos que caigan al vacío fuera del canvas
        if (p.y > canvas.height) {
            azucares.splice(i, 1);
        }
    }

    loopAnimacion = requestAnimationFrame(loop);
}

// Algoritmo matemático rápido para detectar la colisión de un punto con un segmento de trazo
function verificarColisionPuntoSegmento(px, py, linea) {
    const A = px - linea.x1;
    const B = py - linea.y1;
    const C = linea.x2 - linea.x1;
    const D = linea.y2 - linea.y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) { xx = linea.x1; yy = linea.y1; }
    else if (param > 1) { xx = linea.x2; yy = linea.y2; }
    else { xx = linea.x1 + param * C; yy = linea.y1 + param * D; }

    const dx = px - xx;
    const dy = py - yy;
    const distancia = Math.sqrt(dx * dx + dy * dy);
    
    return distancia < 4; // Umbral de colisión (grosor de detección)
}

function ganarNivel() {
    clearInterval(dispensadorIntervalo);
    cancelAnimationFrame(loopAnimacion);
    esperandoEntrada = false;

    sonidoGanar();
    alert(`¡Nivel ${nivelActual} Superado!`);

    // Guardar progreso y desbloquear el siguiente nivel en el mapa
    if (nivelActual === nivelMaximoDesbloqueado && nivelMaximoDesbloqueado < totalNiveles) {
        nivelMaximoDesbloqueado++;
        localStorage.setItem('sugar_yani_progress', nivelMaximoDesbloqueado);
    }

    volverAlMapa();
}