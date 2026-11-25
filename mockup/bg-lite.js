    /* ---------- Light 3D-feel background: 2D canvas, perspective grid floor + depth particles. ~1ms/frame, 30fps, paused offscreen ---------- */
    (function () {
      const cv = document.getElementById('bg-space'); if (!cv) return;
      const ctx = cv.getContext('2d', { alpha: false });
      let W = 0, H = 0, vis = true, mx = 0, my = 0, tmx = 0, tmy = 0, last = 0;
      const host = cv.parentElement;
      const N = 70, P = [];
      for (let i = 0; i < N; i++) P.push({ x: (Math.random() - .5) * 2, y: (Math.random() - .5) * 1.2, z: Math.random(), c: Math.random() < .22 ? '245,196,81' : '196,181,253' });
      const size = () => { const r = host.getBoundingClientRect(); W = cv.width = Math.max(2, r.width | 0); H = cv.height = Math.max(2, r.height | 0); };
      size(); addEventListener('resize', size);
      new IntersectionObserver(e => { vis = e[0].isIntersecting; }, { threshold: 0 }).observe(host);
      host.addEventListener('pointermove', e => { const r = host.getBoundingClientRect(); tmx = (e.clientX - r.left) / r.width - .5; tmy = (e.clientY - r.top) / r.height - .5; });
      const draw = t => {
        requestAnimationFrame(draw);
        if (!vis || (window.appState && appState.currentView !== 'landing') || t - last < 33) return; last = t;
        mx += (tmx - mx) * .06; my += (tmy - my) * .06;
        ctx.fillStyle = '#08090D'; ctx.fillRect(0, 0, W, H);
        const hy = H * (.56 + my * .05), cx = W / 2 + mx * 60;
        // soft glows
        let g = ctx.createRadialGradient(cx, hy, 0, cx, hy, W * .55);
        g.addColorStop(0, 'rgba(139,61,240,.30)'); g.addColorStop(.5, 'rgba(139,61,240,.08)'); g.addColorStop(1, 'rgba(139,61,240,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        // perspective floor grid
        ctx.lineWidth = 1; const s = t * .00035;
        for (let i = -14; i <= 14; i++) {
          const xb = cx + i * W * .16 + mx * 40;
          ctx.strokeStyle = `rgba(168,85,247,${.42 * (1 - Math.abs(i) / 15)})`;
          ctx.beginPath(); ctx.moveTo(cx + i * 14, hy); ctx.lineTo(xb, H); ctx.stroke();
        }
        for (let k = 0; k < 10; k++) {
          const f = ((k + (s * 10) % 1) / 10), y = hy + (H - hy) * f * f;
          ctx.strokeStyle = `rgba(168,85,247,${.10 + .34 * f})`;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        // depth particles
        for (const p of P) {
          p.z -= .0016; if (p.z <= .02) { p.z = 1; p.x = (Math.random() - .5) * 2; p.y = (Math.random() - .5) * 1.2; }
          const k = 1 / (p.z * 1.4 + .15), x = cx + (p.x * W * .5 + mx * 90 * (1 - p.z)) * k * .55, y = hy - H * .08 + (p.y * H * .45 + my * 60 * (1 - p.z)) * k * .55;
          const r = Math.max(.6, 3.4 * (1 - p.z)), a = Math.min(1, (1 - p.z) * 1.1);
          ctx.fillStyle = `rgba(${p.c},${a * .85})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
        }
        const f2 = ctx.createLinearGradient(0, H * .75, 0, H); f2.addColorStop(0, 'rgba(8,9,13,0)'); f2.addColorStop(1, 'rgba(8,9,13,1)');
        ctx.fillStyle = f2; ctx.fillRect(0, H * .75, W, H * .25);
      };
      requestAnimationFrame(draw);
    })();
