/**
 * Quiniela Liga MX — lógica de la PWA
 * -----------------------------------
 * ÚNICA LÍNEA QUE TIENES QUE CAMBIAR: WEBAPP_URL de aquí abajo. Pega ahí la
 * URL que te dio Apps Script al implementar WebApp.gs como "Aplicación web"
 * (termina en /exec). Ver COMO_USAR_PWA.md para el paso a paso.
 */
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbxIsPOivqqh4bKGsGFkkFrLvU1NpEEk71Xv0n2e6UgV6luGfJWaUU_LWFfinhMyuuG0Aw/exec";

const estado = {
  jornada: null,
  partidos: [],
  marcadores: [],
};

document.addEventListener("DOMContentLoaded", function () {
  if (!WEBAPP_URL || WEBAPP_URL.indexOf("PEGA_AQUI") !== -1) {
    mostrarErrorConfiguracion();
    return;
  }

  const nombreGuardado = localStorage.getItem("quiniela_nombre") || "";
  document.getElementById("nombre").value = nombreGuardado;

  document.getElementById("tab-capturar").addEventListener("click", function () { cambiarVista("capturar"); });
  document.getElementById("tab-tabla").addEventListener("click", function () { cambiarVista("tabla"); cargarTabla(); });
  document.getElementById("form-quiniela").addEventListener("submit", enviarQuiniela);

  iniciarCapturar();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(function () { /* sin service worker no pasa nada grave */ });
  }
});

function mostrarErrorConfiguracion() {
  document.getElementById("app").innerHTML =
    '<div class="aviso error" style="margin:16px;">' +
    "Falta conectar esta app con tu Google Sheet: edita <code>app.js</code> y pega tu URL de " +
    "Apps Script en la constante <code>WEBAPP_URL</code>. Instrucciones en COMO_USAR_PWA.md." +
    "</div>";
}

function cambiarVista(nombre) {
  document.querySelectorAll(".vista").forEach(function (v) { v.classList.remove("activa"); });
  document.querySelectorAll("nav.tabs button").forEach(function (b) { b.classList.remove("activo"); });
  document.getElementById("vista-" + nombre).classList.add("activa");
  document.getElementById("tab-" + nombre).classList.add("activo");
}

async function apiGet(accion, params) {
  let url = WEBAPP_URL + "?action=" + accion;
  if (params) {
    Object.keys(params).forEach(function (k) { url += "&" + k + "=" + encodeURIComponent(params[k]); });
  }
  const resp = await fetch(url);
  return resp.json();
}

async function apiPost(body) {
  // OJO: content-type "text/plain" a propósito -- evita que el navegador mande
  // una petición OPTIONS de preflight, que Apps Script Web Apps no responde.
  const resp = await fetch(WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
  return resp.json();
}

async function iniciarCapturar() {
  const cont = document.getElementById("contenido-capturar");
  cont.innerHTML = '<p class="centro">Cargando partidos…</p>';
  try {
    const activa = await apiGet("activa");
    if (!activa.ok) throw new Error(activa.error || "No se pudo leer la jornada activa.");
    await cargarJornada(activa.jornada);
  } catch (err) {
    cont.innerHTML = '<div class="aviso error">Sin conexión con el Sheet ahorita. Intenta de nuevo en un momento.<br><small>' + escaparHtml(String(err.message || err)) + "</small></div>";
  }
}

// Pide y muestra una jornada específica (la usa tanto la carga inicial como
// las flechitas de "< Jornada N >" para moverse entre semanas).
async function cargarJornada(jornada) {
  const cont = document.getElementById("contenido-capturar");
  cont.innerHTML = '<p class="centro">Cargando partidos…</p>';
  estado.jornada = jornada;
  try {
    const datos = await apiGet("partidos", { jornada: jornada });
    if (!datos.ok) {
      cont.innerHTML = navJornadaHtml(jornada) + '<div class="aviso info">' + escaparHtml(datos.error) + "</div>";
      activarNavJornada();
      document.getElementById("form-quiniela").style.display = "none";
      document.getElementById("registrados").innerHTML = "";
      return;
    }
    estado.jornada = datos.jornada;
    estado.partidos = datos.partidos;
    estado.marcadores = datos.partidos.map(function () { return { local: 0, visita: 0 }; });
    renderPartidos(datos);
    cargarRegistros(datos.jornada);
  } catch (err) {
    cont.innerHTML = '<div class="aviso error">Sin conexión con el Sheet ahorita.<br><small>' + escaparHtml(String(err.message || err)) + "</small></div>";
  }
}

function navJornadaHtml(jornada) {
  return (
    '<div class="jornada-nav">' +
    '<button type="button" id="jornada-prev" class="nav-flecha" aria-label="Jornada anterior">‹</button>' +
    '<span class="chip">Jornada ' + jornada + "</span>" +
    '<button type="button" id="jornada-next" class="nav-flecha" aria-label="Jornada siguiente">›</button>' +
    "</div>"
  );
}

function activarNavJornada() {
  document.getElementById("jornada-prev").addEventListener("click", function () { cambiarJornadaMostrada(-1); });
  document.getElementById("jornada-next").addEventListener("click", function () { cambiarJornadaMostrada(1); });
}

function cambiarJornadaMostrada(delta) {
  const nueva = Math.min(17, Math.max(1, estado.jornada + delta));
  if (nueva === estado.jornada) return;
  cargarJornada(nueva);
}

function renderPartidos(datos) {
  const cont = document.getElementById("contenido-capturar");
  const bloques = datos.partidos.map(function (p, i) {
    return (
      '<div class="partido" data-i="' + i + '">' +
      '<div class="equipo local">' + escudoHtml(p.local) + '<span class="nombre-equipo">' + escaparHtml(p.local) + "</span></div>" +
      '<div class="marcador">' +
      stepperHtml(i, "local") +
      '<span class="vs">-</span>' +
      stepperHtml(i, "visita") +
      "</div>" +
      '<div class="equipo visita">' + escudoHtml(p.visita) + '<span class="nombre-equipo">' + escaparHtml(p.visita) + "</span></div>" +
      "</div>"
    );
  }).join("");

  const cerrada = datos.cerrada;
  cont.innerHTML =
    '<div class="tarjeta">' +
    navJornadaHtml(datos.jornada) +
    (cerrada
      ? '<div class="aviso info">Esta jornada ya cerró (ya se capturaron los resultados reales). Aquí abajo puedes ver la tabla general.</div>'
      : "") +
    '<div id="lista-partidos">' + bloques + "</div>" +
    "</div>";

  activarNavJornada();

  if (!cerrada) {
    document.getElementById("form-quiniela").style.display = "";
  } else {
    document.getElementById("form-quiniela").style.display = "none";
  }

  cont.querySelectorAll(".stepper button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const i = Number(btn.closest(".partido").dataset.i);
      const lado = btn.dataset.lado;
      const delta = Number(btn.dataset.delta);
      const nuevo = Math.max(0, Math.min(15, estado.marcadores[i][lado] + delta));
      estado.marcadores[i][lado] = nuevo;
      btn.closest(".stepper").querySelector(".valor").textContent = nuevo;
    });
  });
}

// Convierte "CRUZ AZUL" -> "cruz_azul", "SAN LUIS" -> "san_luis", etc. -- así
// sabemos qué archivo de logo buscar en la carpeta logos/ sin tener que
// mantener una lista aparte. Ver COMO_USAR_PWA.md para los 18 nombres exactos.
var ACENTOS_EQUIPO = { "a": "áà", "e": "éè", "i": "íì", "o": "óò", "u": "úùü", "n": "ñ" };
function slugEquipo(nombre) {
  var texto = String(nombre || "").toLowerCase();
  Object.keys(ACENTOS_EQUIPO).forEach(function (sinAcento) {
    ACENTOS_EQUIPO[sinAcento].split("").forEach(function (conAcento) {
      texto = texto.split(conAcento).join(sinAcento);
    });
  });
  return texto.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// Si el archivo logos/<equipo>.png no existe, el onerror lo oculta solo --
// el partido se sigue viendo bien nada más con el nombre en texto.
function escudoHtml(nombreEquipo) {
  const slug = slugEquipo(nombreEquipo);
  if (!slug) return "";
  return '<img class="escudo" src="./logos/' + slug + '.png" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
}

function stepperHtml(i, lado) {
  return (
    '<div class="stepper">' +
    '<button type="button" data-lado="' + lado + '" data-delta="-1">−</button>' +
    '<span class="valor">0</span>' +
    '<button type="button" data-lado="' + lado + '" data-delta="1">+</button>' +
    "</div>"
  );
}

async function cargarRegistros(jornada) {
  const cont = document.getElementById("registrados");
  try {
    const datos = await apiGet("registros", { jornada: jornada });
    if (!datos.ok) { cont.innerHTML = ""; return; }
    const chips = datos.nombres.map(function (n, idx) {
      return '<span class="chip-nombre"><span class="chip-nombre-num">' + (idx + 1) + '</span>' + escaparHtml(n) + "</span>";
    }).join("");
    cont.innerHTML =
      '<div class="tarjeta">' +
      '<div class="registrados-header">' +
      '<span class="registrados-titulo">Registrados — Jornada ' + jornada + "</span>" +
      '<span class="chip chip-conteo">' + datos.total + "</span>" +
      "</div>" +
      (datos.nombres.length
        ? '<div class="chips-nombres">' + chips + "</div>"
        : '<p class="lista-nombres">Todavía nadie se ha registrado.</p>') +
      "</div>";
  } catch (err) {
    cont.innerHTML = "";
  }
}

async function enviarQuiniela(ev) {
  ev.preventDefault();
  const nombre = document.getElementById("nombre").value.trim();
  const msg = document.getElementById("mensaje-envio");
  if (!nombre) {
    msg.innerHTML = '<div class="aviso error">Escribe tu nombre.</div>';
    return;
  }
  localStorage.setItem("quiniela_nombre", nombre);

  const boton = document.getElementById("btn-enviar");
  boton.disabled = true;
  boton.textContent = "Enviando…";
  msg.innerHTML = "";

  try {
    const resp = await apiPost({
      action: "submit",
      nombre: nombre,
      jornada: estado.jornada,
      marcadores: estado.marcadores,
    });
    if (resp.ok) {
      msg.innerHTML = '<div class="aviso exito">' + escaparHtml(resp.mensaje) + "</div>";
      cargarRegistros(estado.jornada);
    } else {
      msg.innerHTML = '<div class="aviso error">' + escaparHtml(resp.error) + "</div>";
    }
  } catch (err) {
    msg.innerHTML = '<div class="aviso error">No se pudo enviar (revisa tu conexión) e intenta de nuevo.</div>';
  } finally {
    boton.disabled = false;
    boton.textContent = "Enviar mi quiniela";
  }
}

async function cargarTabla() {
  const cont = document.getElementById("contenido-tabla");
  cont.innerHTML = '<p class="centro">Cargando tabla…</p>';
  try {
    const datos = await apiGet("tabla");
    if (!datos.ok) throw new Error(datos.error || "Error al leer la tabla.");
    renderTabla(datos);
  } catch (err) {
    cont.innerHTML = '<div class="aviso error">Sin conexión con el Sheet ahorita.<br><small>' + escaparHtml(String(err.message || err)) + "</small></div>";
  }
}

function renderTabla(datos) {
  const miNombre = (localStorage.getItem("quiniela_nombre") || "").trim().toLowerCase();
  const cont = document.getElementById("contenido-tabla");
  const encabezados = datos.jornadas.map(function (j) { return "<th>J" + j + "</th>"; }).join("");
  const filas = datos.filas.map(function (fila, idx) {
    const celdas = fila.puntos.map(function (v) { return "<td>" + (v === null ? "—" : v) + "</td>"; }).join("");
    const claseTotal = fila.total === null ? "" : ' class="total"';
    const esYo = fila.nombre.trim().toLowerCase() === miNombre;
    const clasesFila = [];
    if (idx === 0) clasesFila.push("puesto-1");
    if (idx === 1) clasesFila.push("puesto-2");
    if (idx === 2) clasesFila.push("puesto-3");
    if (esYo) clasesFila.push("total"); // resalta al usuario (reutiliza estilo bold)
    return (
      "<tr" + (clasesFila.length ? ' class="' + clasesFila.join(" ") + '"' : "") + ">" +
      "<td>" + escaparHtml(fila.nombre) + (esYo ? " (tú)" : "") + "</td>" +
      celdas +
      "<td" + claseTotal + ">" + (fila.total === null ? "—" : fila.total) + "</td>" +
      "</tr>"
    );
  }).join("");

  cont.innerHTML =
    '<div class="tarjeta tabla-scroll">' +
    '<table class="tabla-general">' +
    "<thead><tr><th>Nombre</th>" + encabezados + "<th>Total</th></tr></thead>" +
    "<tbody>" + filas + "</tbody>" +
    "</table>" +
    "</div>";
}

function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto === undefined || texto === null ? "" : String(texto);
  return div.innerHTML;
}
