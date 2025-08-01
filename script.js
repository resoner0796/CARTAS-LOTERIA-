
let cartasSeleccionadas = [];
let cartasMarcadas = [];

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.getElementById('pantalla-carga').style.display = 'none';
    document.getElementById('contenedor-cartas').classList.remove('oculto');
    seleccionarCartas(3);
  }, 3000);
});

function seleccionarCartas(n) {
  cartasSeleccionadas = [];
  for (let i = 0; i < n; i++) {
    const cartaNum = Math.floor(Math.random() * 20) + 1;
    cartasSeleccionadas.push(cartaNum);
  }
  renderCartas();
}

function renderCartas() {
  const cont = document.getElementById('cartas-seleccionadas');
  cont.innerHTML = '';
  cartasSeleccionadas.forEach((num, idx) => {
    const div = document.createElement('div');
    div.className = 'carta';
    div.innerHTML = `
      <img src="cartas/carta${num}.png" onclick="marcarCarta(this, ${idx})" />
    `;
    cont.appendChild(div);
  });
}

function marcarCarta(el, idx) {
  const corch = document.createElement('img');
  corch.src = 'corcholata.png';
  corch.className = 'corcholata';
  el.parentElement.appendChild(corch);
  navigator.vibrate(50);
}

function cambiarCarta() {
  seleccionarCartas(cartasSeleccionadas.length);
}

function limpiarCartas() {
  document.querySelectorAll('.corcholata').forEach(e => e.remove());
}
