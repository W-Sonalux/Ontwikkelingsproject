(function() {
  const COUNT  = 20;
  const SIZE   = 60;
  const SPEED  = 0.4;
  const HEADER = 110;

  const items = [];

  for (let i = 0; i < COUNT; i++) {
    const el = document.createElement('img');
    el.src = '/media/FAVICON.png';
    el.className = 'favicon-float';
    document.body.appendChild(el);

    items.push({
      el,
      x: Math.random() * (1920 - SIZE),
      y: HEADER + Math.random() * (1080 - HEADER - SIZE),
      vx: (Math.random() - 0.5) * SPEED * 2 || SPEED,
      vy: (Math.random() - 0.5) * SPEED * 2 || SPEED,
    });
  }

  function botsen(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0 || dist >= SIZE) return;

    // Normaalvector
    const nx = dx / dist;
    const ny = dy / dist;

    // Relatieve snelheid langs normaal
    const dvx = a.vx - b.vx;
    const dvy = a.vy - b.vy;
    const dot = dvx * nx + dvy * ny;

    // Alleen botsen als ze naar elkaar toe bewegen
    if (dot <= 0) return;

    // Verwissel snelheden langs de normaal (gelijke massa)
    a.vx -= dot * nx;
    a.vy -= dot * ny;
    b.vx += dot * nx;
    b.vy += dot * ny;

    // Duw ze uit elkaar zodat ze niet blijven plakken
    const overlap = SIZE - dist;
    a.x -= nx * overlap / 2;
    a.y -= ny * overlap / 2;
    b.x += nx * overlap / 2;
    b.y += ny * overlap / 2;
  }

  function tick() {
    // Beweeg
    for (const item of items) {
      item.x += item.vx;
      item.y += item.vy;

      if (item.x <= 0)           { item.x = 0;            item.vx =  Math.abs(item.vx); }
      if (item.x >= 1920 - SIZE) { item.x = 1920 - SIZE;  item.vx = -Math.abs(item.vx); }
      if (item.y <= HEADER)      { item.y = HEADER;        item.vy =  Math.abs(item.vy); }
      if (item.y >= 1080 - SIZE) { item.y = 1080 - SIZE;  item.vy = -Math.abs(item.vy); }
    }

    // Botsingen checken tussen alle paren
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        botsen(items[i], items[j]);
      }
    }

    // Tekenen
    for (const item of items) {
      item.el.style.transform = `translate(${item.x}px, ${item.y}px)`;
    }

    requestAnimationFrame(tick);
  }

  tick();
})();