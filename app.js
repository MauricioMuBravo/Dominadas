/*
 * Dominadas · ¿Cuántas haces tú?
 * El Mauri en la Red ⚽💻
 *
 * Toca el balón para que no caiga. Si le pegas de un lado, sale hacia el otro.
 * Cada 10 dominadas la gravedad sube un poco. Récord guardado en el navegador.
 * HTML + CSS + JavaScript puro, sin librerías.
 */

const RECORD_CHARLYN = 8671;
const CLAVE_RECORD = "dominadas-record";

// ---------- Ajustes del juego (proporcionales al tamaño de la pantalla) ----------
const AJUSTES = {
  gravedad: 2.4,          // en "altos de pantalla" por segundo²
  alturaPatada: 0.42,     // qué tan alto sube el balón con cada toque (fracción del alto)
  empujeLateral: 1.1,     // qué tanto se va de lado según dónde le pegues
  tolerancia: 1.6,        // qué tan lejos del balón cuenta el toque (en radios)
  subidaPorNivel: 0.05,   // +5% de gravedad cada 10 dominadas
  gravedadMaxima: 1.6,    // tope de dificultad (x1.6)
  espera: 0.12,           // segundos mínimos entre toques
};

const MENSAJES = { 10: "¡Bien! 👏", 25: "¡Ya dominas! 🔥", 50: "¡Nivel crack! ⚡", 100: "¡Cien! Charlyn estaría orgullosa 🏆", 200: "¡Imparable! 🚀" };

// ---------- Elementos ----------
const $ = sel => document.querySelector(sel);
const canvas = $("#cancha");
const ctx = canvas.getContext("2d");

// ---------- Estado ----------
let W = 0, H = 0, DPR = 1, piso = 0;
const balon = { x: 0, y: 0, vx: 0, vy: 0, r: 30, giro: 0, vgiro: 0 };
let estado = "inicio"; // inicio | jugando | fin
let dominadas = 0;
let record = leerRecord();
let ultimoToque = 0;
let multGravedad = 1;
let destellos = [];
let ultimoTiempo = 0;
let avisoTimer = null;
let esperandoPrimerToque = false;

// ---------- Récord (localStorage puede fallar en modo privado) ----------
function leerRecord() {
  try { return Number(localStorage.getItem(CLAVE_RECORD)) || 0; } catch { return 0; }
}
function guardarRecord(n) {
  try { localStorage.setItem(CLAVE_RECORD, String(n)); } catch { /* sin almacenamiento: no pasa nada */ }
}

// ---------- Tamaño y escala ----------
function ajustarTamano() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  piso = H * 0.86;
  balon.r = Math.max(26, Math.min(W, H) * 0.075);
  if (estado !== "jugando") colocarBalonInicial();
}

function colocarBalonInicial() {
  balon.x = W / 2;
  balon.y = piso - balon.r - H * 0.08;
  balon.vx = 0;
  balon.vy = 0;
}

// ---------- Física ----------
function gravedadActual() {
  return AJUSTES.gravedad * H * multGravedad;
}

function patear(px, py) {
  const ahora = performance.now() / 1000;
  if (ahora - ultimoToque < AJUSTES.espera) return false;

  const dx = balon.x - px;
  const dy = balon.y - py;
  if (Math.hypot(dx, dy) > balon.r * AJUSTES.tolerancia) return false;

  ultimoToque = ahora;
  const g = gravedadActual();
  balon.vy = -Math.sqrt(2 * g * H * AJUSTES.alturaPatada);
  // Si le pegas del lado izquierdo, sale hacia la derecha (y al revés), con un poco de azar
  const lado = Math.max(-1, Math.min(1, dx / balon.r));
  balon.vx = lado * AJUSTES.empujeLateral * W * 0.5 + (Math.random() - 0.5) * W * 0.12;
  balon.vgiro = lado * 10 + (Math.random() - 0.5) * 4;

  dominadas++;
  multGravedad = Math.min(AJUSTES.gravedadMaxima, 1 + Math.floor(dominadas / 10) * AJUSTES.subidaPorNivel);
  agregarDestello(px, py);
  actualizarContador();
  if (MENSAJES[dominadas]) mostrarAviso(MENSAJES[dominadas]);
  vibrar(12);
  return true;
}

function actualizar(dt) {
  // En inicio, en fin y antes del primer toque, el balón flota quieto
  if (estado !== "jugando" || esperandoPrimerToque) {
    // En inicio y fin el balón "flota" suavemente
    balon.giro += dt * 0.6;
    return;
  }
  balon.vy += gravedadActual() * dt;
  balon.x += balon.vx * dt;
  balon.y += balon.vy * dt;
  balon.giro += balon.vgiro * dt;
  balon.vx *= Math.pow(0.6, dt); // un poco de freno en el aire

  // Rebote en las paredes
  if (balon.x < balon.r) { balon.x = balon.r; balon.vx = Math.abs(balon.vx) * 0.8; }
  if (balon.x > W - balon.r) { balon.x = W - balon.r; balon.vx = -Math.abs(balon.vx) * 0.8; }
  // Techo
  if (balon.y < balon.r) { balon.y = balon.r; balon.vy = Math.abs(balon.vy) * 0.3; }

  // Se cayó
  if (balon.y + balon.r >= piso) {
    balon.y = piso - balon.r;
    terminar();
  }

  destellos = destellos.filter(d => (d.t += dt) < 0.35);
}

// ---------- Dibujo ----------
function dibujarCancha() {
  // Cielo / estadio
  const cielo = ctx.createLinearGradient(0, 0, 0, piso);
  cielo.addColorStop(0, "#0b0560");
  cielo.addColorStop(1, "#160a96");
  ctx.fillStyle = cielo;
  ctx.fillRect(0, 0, W, piso);

  // Luces del estadio
  for (const [x, c] of [[0, "rgba(232,57,42,.22)"], [W, "rgba(47,154,72,.22)"]]) {
    const luz = ctx.createRadialGradient(x, 0, 0, x, 0, W * 0.9);
    luz.addColorStop(0, c);
    luz.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = luz;
    ctx.fillRect(0, 0, W, piso);
  }

  // Pasto con franjas
  const franjas = 8;
  for (let i = 0; i < franjas; i++) {
    ctx.fillStyle = i % 2 ? "#2b8a41" : "#2f9a48";
    ctx.fillRect((W / franjas) * i, piso, W / franjas + 1, H - piso);
  }
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.fillRect(0, piso, W, 3);
}

function dibujarSombra() {
  const altura = Math.max(0, piso - (balon.y + balon.r));
  const escala = Math.max(0.35, 1 - altura / (H * 0.8));
  ctx.fillStyle = `rgba(0,0,0,${0.32 * escala})`;
  ctx.beginPath();
  ctx.ellipse(balon.x, piso + 6, balon.r * 1.05 * escala, balon.r * 0.25 * escala, 0, 0, Math.PI * 2);
  ctx.fill();
}

function dibujarBalon() {
  const { x, y, r, giro } = balon;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(giro);

  // Cuerpo
  const cuerpo = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
  cuerpo.addColorStop(0, "#ffffff");
  cuerpo.addColorStop(1, "#d9d9de");
  ctx.fillStyle = cuerpo;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Pentágono central y paneles alrededor
  ctx.fillStyle = "#111";
  poligono(0, 0, r * 0.32, 5, -Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    poligono(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, r * 0.26, 5, a + Math.PI / 2);
  }
  // Costuras
  ctx.strokeStyle = "rgba(0,0,0,.35)";
  ctx.lineWidth = Math.max(1, r * 0.04);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32);
    ctx.lineTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
    ctx.stroke();
  }
  ctx.restore();

  // Brillo y contorno (sin girar)
  ctx.strokeStyle = "rgba(0,0,0,.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function poligono(cx, cy, radio, lados, rot) {
  ctx.beginPath();
  for (let i = 0; i < lados; i++) {
    const a = rot + (i * 2 * Math.PI) / lados;
    const px = cx + Math.cos(a) * radio;
    const py = cy + Math.sin(a) * radio;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function agregarDestello(x, y) {
  destellos.push({ x, y, t: 0 });
}

function dibujarDestellos() {
  for (const d of destellos) {
    const p = d.t / 0.35;
    ctx.strokeStyle = `rgba(255,210,63,${1 - p})`;
    ctx.lineWidth = 4 * (1 - p) + 1;
    ctx.beginPath();
    ctx.arc(d.x, d.y, balon.r * (0.6 + p * 1.2), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function dibujarIndicacion() {
  if (estado !== "jugando" || dominadas > 0) return;
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.font = `800 ${Math.round(Math.max(16, W * 0.045))}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("👆 Toca el balón", W / 2, balon.y - balon.r * 1.8);
}

function dibujar() {
  ctx.clearRect(0, 0, W, H);
  dibujarCancha();
  dibujarSombra();
  dibujarBalon();
  dibujarDestellos();
  dibujarIndicacion();
}

function bucle(t) {
  const dt = Math.min(0.033, (t - ultimoTiempo) / 1000 || 0);
  ultimoTiempo = t;
  actualizar(dt);
  dibujar();
  requestAnimationFrame(bucle);
}

// ---------- Flujo del juego ----------
function iniciar() {
  estado = "jugando";
  dominadas = 0;
  multGravedad = 1;
  destellos = [];
  colocarBalonInicial();
  // El balón empieza flotando quieto: el primer toque lo pone en juego
  balon.vy = 0;
  actualizarContador(false);
  $("#record-hud").textContent = record.toLocaleString("es-MX");
  $("#inicio").hidden = true;
  $("#fin").hidden = true;
  $("#hud").hidden = false;
  $("#copiado").hidden = true;
  esperandoPrimerToque = true;
}

function terminar() {
  if (estado !== "jugando") return;
  estado = "fin";
  vibrar([40, 40, 40]);
  const esRecord = dominadas > record;
  if (esRecord) { record = dominadas; guardarRecord(record); }

  $("#resultado").textContent = dominadas.toLocaleString("es-MX");
  $("#fin-titulo").textContent = dominadas === 0 ? "Ni una 😅" : "Se te cayó";
  $("#nuevo-record").hidden = !(esRecord && dominadas > 0);
  const pct = Math.min(100, (dominadas / RECORD_CHARLYN) * 100);
  $("#barra").style.width = "0";
  requestAnimationFrame(() => { $("#barra").style.width = `${pct}%`; });
  $("#comparacion").innerHTML = textoComparacion(dominadas);
  $("#hud").hidden = true;
  $("#fin").hidden = false;
  $("#btn-otra").focus({ preventScroll: true });
}

function textoComparacion(n) {
  if (n >= RECORD_CHARLYN) return "<b>¡Superaste a Charlyn Corral!</b> Mándame captura, porque esto es histórico 🏆";
  const faltan = (RECORD_CHARLYN - n).toLocaleString("es-MX");
  const pct = (n / RECORD_CHARLYN) * 100;
  const pctTxt = pct < 0.1 && n > 0 ? "menos del 0.1%" : `${pct.toFixed(1)}%`;
  return `Llevas el <b>${pctTxt}</b> del récord de Charlyn Corral.<br>Te faltan <b>${faltan}</b> dominadas para alcanzarla.`;
}

function actualizarContador(animar = true) {
  const el = $("#contador");
  el.textContent = dominadas.toLocaleString("es-MX");
  if (animar) { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
}

function mostrarAviso(texto) {
  const el = $("#aviso");
  el.textContent = texto;
  el.classList.add("ver");
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => el.classList.remove("ver"), 1300);
}

function vibrar(patron) {
  try { if (navigator.vibrate) navigator.vibrate(patron); } catch { /* no todos los celulares vibran */ }
}

async function compartir() {
  const url = location.href.split("#")[0];
  const texto = `Hice ${dominadas} dominadas ⚽ Charlyn Corral hizo 8,671 a los 13 años. ¿Cuántas haces tú?`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Dominadas", text: texto, url });
      return;
    }
  } catch { /* el usuario canceló: no pasa nada */ return; }
  try {
    await navigator.clipboard.writeText(`${texto} ${url}`);
    $("#copiado").hidden = false;
  } catch {
    $("#copiado").textContent = texto;
    $("#copiado").hidden = false;
  }
}

// ---------- Controles ----------
function puntoDelEvento(ev) {
  const rect = canvas.getBoundingClientRect();
  return [ev.clientX - rect.left, ev.clientY - rect.top];
}

canvas.addEventListener("pointerdown", ev => {
  if (estado !== "jugando") return;
  ev.preventDefault();
  const [x, y] = puntoDelEvento(ev);
  const pateo = patear(x, y);
  if (pateo && esperandoPrimerToque) esperandoPrimerToque = false;
});

$("#btn-jugar").addEventListener("click", iniciar);
$("#btn-otra").addEventListener("click", iniciar);
$("#btn-compartir").addEventListener("click", compartir);

window.addEventListener("resize", ajustarTamano);
document.addEventListener("keydown", ev => {
  if ((ev.key === "Enter" || ev.key === " ") && estado !== "jugando") { ev.preventDefault(); iniciar(); }
});

// ---------- Arranque ----------
if (record > 0) {
  $("#record-inicio-num").textContent = record.toLocaleString("es-MX");
  $("#record-inicio").hidden = false;
}
ajustarTamano();
requestAnimationFrame(t => { ultimoTiempo = t; requestAnimationFrame(bucle); });

// Acceso de solo lectura para pruebas automáticas
window.__dominadas = { get estado() { return estado; }, get balon() { return { ...balon }; }, get dominadas() { return dominadas; } };
