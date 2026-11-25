// Home page map: a small hex island in the Home hero, where each building is a part of the site.
// Everything is drawn from simple shapes in code (no models, no game art), the buildings in one matte
// clay colour like an architect's model, so it stays calm. Hover a place for what's there
// (a line at the bottom, never a popup over other places), click to go. Drag to turn it.
// If the browser has no WebGL, index.html keeps the old hero-art fan instead (see .has-map there).
//
// Kept light on purpose: drawn at a lower resolution on big screens, 30 frames a second while it only turns
// by itself, shadows worked out once, nothing drawn while it's off screen, and no shadows on phones.

const hero = document.querySelector(".hero");
const box = document.getElementById("map");
const fail = () => hero.classList.remove("has-map");

if (box && hero.classList.contains("has-map")) {
  import("/vendor/three-0.170.0.min.js").then(start).catch(fail);
}

function start(THREE) {
  const PLACES = [
    {
      id: "tier",
      name: "Tier list",
      color: "#ff7a59",
      url: "/tierlist/",
      desc: "Every hero from S to D, the same list my stream overlay uses.",
    },
    {
      id: "builds",
      name: "Builds",
      color: "#ffb84d",
      url: "/builds/",
      desc: "Talent builds for every hero, ready to copy into the game.",
    },
    {
      id: "draft",
      name: "Draft",
      color: "#8fb4ff",
      url: "/draft/",
      desc: "Pick and ban helper with a live draft edge.",
    },
    {
      id: "games",
      name: "Match history",
      color: "#7be0a1",
      url: "/games/",
      desc: "My ranked games with talents, awards and results.",
    },
    {
      id: "patch",
      name: "Patch notes",
      color: "#c39bff",
      url: "/patch-notes/",
      desc: "What changed this patch, hero by hero.",
    },
    {
      id: "schedule",
      name: "Schedule",
      color: "#ffe27a",
      url: "/schedule/",
      desc: "When I go live next. The clock shows your time.",
    },
    {
      id: "overlay",
      name: "Overlay",
      color: "#f26a4b",
      url: "/overlay/",
      desc: "My stream overlay: talents, rank, streak and draft banner.",
    },
  ];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // ---------- renderer ----------
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    return fail();
  }
  // The canvas is big, so it's drawn at up to 1.5x (not 2x) and dropped to 1x if frames get slow (see loop)
  let dpr = Math.min(devicePixelRatio, coarse ? 1.25 : 1.5);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = !coarse;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // the light never moves: shadows are worked out once (and on hover)
  const cv = renderer.domElement;
  cv.setAttribute("aria-hidden", "true");
  box.prepend(cv);

  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  scene.add(new THREE.HemisphereLight("#ffe2d4", "#24140f", 1.6));
  const sun = new THREE.DirectionalLight("#ffe9dc", 2.6);
  sun.position.set(9, 16, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 50 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  const rim = new THREE.DirectionalLight("#ff8a6a", 0.9);
  rim.position.set(-10, 6, -8);
  scene.add(rim);

  // ---------- helpers ----------
  const C = (c) => new THREE.Color(c);
  const mats = {};
  const mat = (color, o = {}) =>
    (mats[color + JSON.stringify(o)] ||= new THREE.MeshStandardMaterial({
      color,
      roughness: 0.75,
      metalness: 0.05,
      flatShading: true,
      ...o,
    }));
  const glowMat = (color, i = 1.4) => mat(color, { emissive: color, emissiveIntensity: i, roughness: 0.4 });
  const CLAY = mat("#b9a99c", { roughness: 0.92 }),
    CLAY_DARK = mat("#8f7f74", { roughness: 0.92 });
  function mesh(geo, m, x, y, z, parent, shadow = true) {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = shadow;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  const hexPrism = (r, h) => new THREE.CylinderGeometry(r, r, h, 6);
  const box3 = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  let dirty = true;
  function canvasTex(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.redraw = () => {
      draw(c.getContext("2d"), w, h);
      t.needsUpdate = true;
      dirty = true;
    };
    t.redraw();
    return t;
  }
  const flat = (tex) => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true });
  const panel = (tex, side) => [
    side,
    side,
    side,
    side,
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
    side,
  ];
  const hash = (a, b) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  // ---------- island of hex tiles (one draw call) ----------
  const S = 0.5,
    N = 12,
    RING = 6.7;
  PLACES.forEach((p, i) => {
    p.angle = (i / PLACES.length) * Math.PI * 2 + 0.25;
    p.x = Math.sin(p.angle) * RING;
    p.z = Math.cos(p.angle) * RING;
  });
  const tiles = [];
  for (let q = -N; q <= N; q++)
    for (let r = -N; r <= N; r++) {
      const d = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
      if (d > N) continue;
      const h1 = hash(q, r);
      if (d > N - 2 && h1 < 0.45 * (d - (N - 2))) continue; // ragged edge
      tiles.push({ d, h1, x: S * Math.sqrt(3) * (q + r / 2), z: S * 1.5 * r });
    }
  const distSeg = (px, pz, bx, bz) => {
    const t = Math.max(0, Math.min(1, (px * bx + pz * bz) / (bx * bx + bz * bz)));
    return Math.hypot(px - bx * t, pz - bz * t);
  };
  const BASE = ["#2e2724", "#312a26", "#2b2421", "#332b27"].map(C),
    PATH = C("#6a4033");
  for (const t of tiles) {
    t.owner = -1;
    t.mix = 0;
    let near = Infinity;
    PLACES.forEach((p, i) => {
      const dd = Math.hypot(t.x - p.x, t.z - p.z);
      near = Math.min(near, dd);
      if (dd < 2.4) {
        t.owner = i;
        t.mix = 0.12 + 0.3 * (1 - dd / 2.4);
      }
    });
    const coreD = Math.hypot(t.x, t.z);
    const onPath = coreD > 1.9 && near > 1.9 && PLACES.some((p) => distSeg(t.x, t.z, p.x, p.z) < 0.42);
    const n =
      0.55 * Math.sin(t.x * 0.55 + 1.1) * Math.cos(t.z * 0.47 - 0.4) +
      0.35 * Math.sin((t.x + t.z) * 0.8) +
      (t.h1 - 0.5) * 0.5;
    t.top = near < 2.25 || coreD < 2.3 || onPath ? 0 : Math.max(-0.14, Math.min(0.42, Math.round(n * 2) * 0.14));
    t.bottom = -(1.0 + (N - t.d) * 0.32 + t.h1 * 0.9);
    t.color = BASE[Math.floor(t.h1 * 4)].clone();
    if (onPath) t.color.lerp(PATH, 0.22);
  }
  const tileGeo = new THREE.CylinderGeometry(S * 0.975, S * 0.975, 1, 6);
  tileGeo.translate(0, -0.5, 0);
  const island = new THREE.InstancedMesh(
    tileGeo,
    [mat("#8a7266"), mat("#ffffff", { roughness: 0.9 }), mat("#2a201c")],
    tiles.length,
  );
  island.receiveShadow = true;
  island.castShadow = true;
  const m4 = new THREE.Matrix4();
  tiles.forEach((t, i) => {
    island.setMatrixAt(i, m4.makeScale(1, t.top - t.bottom, 1).setPosition(t.x, t.top, t.z));
    island.setColorAt(i, t.color);
  });
  scene.add(island);
  function tint(idx, on) {
    const c = C(PLACES[idx].color).multiplyScalar(0.55);
    tiles.forEach((t, i) => {
      if (t.owner === idx) island.setColorAt(i, on ? t.color.clone().lerp(c, 0.25 + t.mix) : t.color);
    });
    island.instanceColor.needsUpdate = true;
  }

  // ---------- the crystal in the middle ----------
  const core = new THREE.Group();
  scene.add(core);
  mesh(hexPrism(1.75, 0.22), mat("#3a2b26"), 0, 0.11, 0, core);
  mesh(hexPrism(1.35, 0.22), mat("#4a3129"), 0, 0.33, 0, core);
  mesh(new THREE.TorusGeometry(1.36, 0.035, 6, 6), glowMat("#f26a4b", 1.2), 0, 0.45, 0, core).rotation.x = Math.PI / 2;
  const crystal = mesh(
    new THREE.OctahedronGeometry(0.85, 0),
    mat("#e0745a", { emissive: "#f26a4b", emissiveIntensity: 0.25, roughness: 0.5 }),
    0,
    2.1,
    0,
    core,
    false,
  );
  crystal.scale.y = 1.75;
  const ring1 = mesh(new THREE.TorusGeometry(1.25, 0.03, 6, 48), mat("#c9b8ab"), 0, 2.1, 0, core, false);
  const ring2 = mesh(new THREE.TorusGeometry(1.0, 0.025, 6, 48), mat("#c9b8ab"), 0, 2.1, 0, core, false);
  ring2.visible = false;
  const coreLight = new THREE.PointLight("#ff6a48", 14, 9, 1.6);
  coreLight.position.set(0, 2.2, 0);
  core.add(coreLight);

  // ---------- buildings (local +z faces away from the middle) ----------
  const B = {};
  const TIER = [
    ["D", "#8fb4ff"],
    ["C", "#7be0a1"],
    ["B", "#ffe27a"],
    ["A", "#ffb84d"],
    ["S", "#ff7a59"],
  ];
  // Tier list: stepped tower from D at the bottom to S on top, the letter on each step, a crown above
  B.tier = (g, p) => {
    let y = 0;
    TIER.forEach(([letter, c], i) => {
      const r = 1.15 - i * 0.19,
        h = 0.3;
      mesh(hexPrism(r, h), mat(c, { emissive: c, emissiveIntensity: 0.12 }), 0, y + h / 2, 0, g).rotation.y =
        Math.PI / 6; // flat side to the front for the letter
      const tex = canvasTex(64, 64, (x) => {
        x.clearRect(0, 0, 64, 64);
        x.fillStyle = "rgba(26,16,12,.85)";
        x.font = "700 50px Sora, sans-serif";
        x.textAlign = "center";
        x.textBaseline = "middle";
        x.fillText(letter, 32, 36);
      });
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), flat(tex));
      l.position.set(0, y + h / 2, r * 0.866 + 0.005);
      g.add(l);
      y += h;
    });
    const crown = new THREE.Group();
    crown.position.y = y + 0.55;
    g.add(crown);
    mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.14, 10), glowMat("#ffcf6a", 0.7), 0, 0, 0, crown, false);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      mesh(
        new THREE.ConeGeometry(0.07, 0.2, 4),
        glowMat("#ffcf6a", 0.7),
        Math.sin(a) * 0.22,
        0.16,
        Math.cos(a) * 0.22,
        crown,
        false,
      );
    }
    p.spin = crown;
    p.anchor = y + 1.1;
  };
  // Builds: a forge of 7 talent pillars (level 1 to 20), gold gem at 10, coral at 20, an anvil in front
  B.builds = (g, p) => {
    p.gems = [];
    for (let i = 0; i < 7; i++) {
      const a = -1.25 + i * (2.5 / 6),
        h = 0.35 + i * 0.2,
        x = Math.sin(a) * 1.05,
        z = -Math.cos(a) * 0.75 + 0.15;
      mesh(hexPrism(0.17, h), mat("#5b4a42"), x, h / 2, z, g);
      const big = i === 3 || i === 6,
        c = i === 3 ? "#ffb84d" : i === 6 ? "#ff6a48" : "#e9d6c8";
      const gem = mesh(
        new THREE.OctahedronGeometry(big ? 0.17 : 0.11, 0),
        glowMat(c, big ? 1.3 : 0.5),
        x,
        h + 0.22,
        z,
        g,
        false,
      );
      gem.userData.base = h + 0.22;
      p.gems.push(gem);
    }
    mesh(box3(0.55, 0.28, 0.34), mat("#352a26"), 0, 0.14, 0.45, g);
    mesh(box3(0.85, 0.12, 0.38), mat("#4b3c35"), 0, 0.34, 0.45, g);
    p.anchor = 2.3;
  };
  // Draft: war table with 5 blue and 5 red seats, two crystals facing off, ban marks on the table
  B.draft = (g, p) => {
    mesh(new THREE.CylinderGeometry(0.3, 0.45, 0.5, 6), mat("#3e312c"), 0, 0.25, 0, g);
    mesh(hexPrism(1.05, 0.12), mat("#54423a"), 0, 0.56, 0, g);
    mesh(new THREE.TorusGeometry(1.0, 0.03, 4, 6), glowMat("#8fb4ff", 0.6), 0, 0.63, 0, g).rotation.x = Math.PI / 2;
    for (let k = 0; k < 10; k++) {
      const a = ((k + 0.5) / 10) * Math.PI * 2,
        c = k < 5 ? "#8fb4ff" : "#ff7a59";
      mesh(
        box3(0.2, 0.32, 0.2),
        mat(c, { emissive: c, emissiveIntensity: 0.15 }),
        Math.sin(a) * 1.4,
        0.16,
        Math.cos(a) * 1.4,
        g,
      ).rotation.y = a;
    }
    const ban = canvasTex(64, 64, (x) => {
      x.clearRect(0, 0, 64, 64);
      x.fillStyle = "#2a201c";
      x.beginPath();
      x.arc(32, 32, 30, 0, 7);
      x.fill();
      x.strokeStyle = "#ef5b6b";
      x.lineWidth = 7;
      x.lineCap = "round";
      x.beginPath();
      x.moveTo(18, 18);
      x.lineTo(46, 46);
      x.moveTo(46, 18);
      x.lineTo(18, 46);
      x.stroke();
    });
    for (let k = 0; k < 3; k++) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), flat(ban));
      d.rotation.x = -Math.PI / 2;
      d.position.set((k - 1) * 0.32, 0.625, 0.55);
      g.add(d);
    }
    p.duel = [
      ["#8fb4ff", -0.35],
      ["#ff7a59", 0.35],
    ].map(([c, x]) => {
      const o = mesh(new THREE.OctahedronGeometry(0.2, 0), glowMat(c, 1.2), x, 1.1, 0, g, false);
      o.scale.y = 1.6;
      return o;
    });
    p.anchor = 1.9;
  };
  // Match history: small arena, a trophy, and a scoreboard with my real last results
  B.games = (g, p) => {
    mesh(new THREE.CylinderGeometry(1.15, 1.2, 0.1, 24), mat("#4d3d35"), 0, 0.05, 0, g);
    for (let k = 1; k < 15; k++) {
      const a = ((k + 0.5) / 16) * Math.PI * 2;
      mesh(box3(0.22, 0.42, 0.18), mat("#5a4840"), Math.sin(a) * 1.3, 0.21, Math.cos(a) * 1.3, g).rotation.y = a;
    }
    p.board = canvasTex(512, 256, (x, w) => {
      const res = p.results || "";
      x.fillStyle = "#14100e";
      x.fillRect(0, 0, w, 256);
      x.fillStyle = "#a89f99";
      x.font = "500 34px 'Geist Mono', monospace";
      x.textAlign = "left";
      x.fillText(res ? `LAST ${res.length}` : "RECENT", 32, 62);
      if (res) {
        const wn = [...res].filter((r) => r === "W").length;
        x.fillStyle = "#f4efec";
        x.font = "600 60px Sora, sans-serif";
        x.textAlign = "right";
        x.fillText(`${wn}–${res.length - wn}`, w - 32, 70);
      }
      const dots = res || "········",
        step = Math.min(58, (w - 64) / dots.length);
      [...dots].forEach((r, i) => {
        x.beginPath();
        x.arc(32 + step / 2 + i * step, 172, Math.min(21, step / 2 - 4), 0, 7);
        x.fillStyle = r === "W" ? "#5fcf8f" : r === "L" ? "#ef5b6b" : "#3a312d";
        x.fill();
      });
    });
    mesh(box3(0.06, 1.0, 0.06), mat("#3a2f2a"), -0.55, 0.5, -0.75, g);
    mesh(box3(0.06, 1.0, 0.06), mat("#3a2f2a"), 0.55, 0.5, -0.75, g);
    mesh(box3(1.4, 0.7, 0.08), panel(p.board, mat("#2a211d")), 0, 1.15, -0.75, g);
    const cup = mat("#e0b960", { roughness: 0.4, metalness: 0.35, emissive: "#ffb84d", emissiveIntensity: 0.15 });
    mesh(box3(0.3, 0.12, 0.3), mat("#3a2f2a"), 0, 0.16, 0.3, g);
    mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.16, 8), cup, 0, 0.3, 0.3, g);
    mesh(new THREE.CylinderGeometry(0.17, 0.07, 0.24, 10), cup, 0, 0.5, 0.3, g);
    p.anchor = 1.9;
  };
  // Patch notes: archive hall with a ▲▼ notice by the door and a floating scroll
  B.patch = (g, p) => {
    mesh(box3(1.7, 0.16, 1.35), mat("#4e3f38"), 0, 0.08, 0, g);
    mesh(box3(1.35, 0.85, 0.75), mat("#6a5248"), 0, 0.58, -0.2, g);
    for (const x of [-0.55, 0.55])
      mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.85, 8), mat("#cdbcb0"), x, 0.58, 0.4, g);
    const tri = new THREE.Shape();
    tri.moveTo(-0.85, 0);
    tri.lineTo(0.85, 0);
    tri.lineTo(0, 0.5);
    tri.closePath();
    const roof = new THREE.ExtrudeGeometry(tri, { depth: 1.25, bevelEnabled: false });
    roof.translate(0, 0, -0.62);
    mesh(roof, mat("#7a5aa8", { emissive: "#c39bff", emissiveIntensity: 0.08 }), 0, 1.0, -0.02, g);
    p.noteTex = canvasTex(256, 200, (x, w, h) => {
      x.fillStyle = "#efe2d2";
      x.fillRect(0, 0, w, h);
      x.fillStyle = "#3a2b24";
      x.font = "700 30px Sora, sans-serif";
      x.textAlign = "left";
      x.fillText(p.patch || "PATCH", 16, 38);
      [1, 0, 1, 0].forEach((up, i) => {
        const y = 60 + i * 34;
        x.fillStyle = "#c6b5a6";
        x.fillRect(16, y + 6, 150 - i * 18, 12);
        x.fillStyle = up ? "#3e9e68" : "#d0505f";
        x.beginPath();
        if (up) {
          x.moveTo(210, y);
          x.lineTo(228, y + 22);
          x.lineTo(192, y + 22);
        } else {
          x.moveTo(192, y);
          x.lineTo(228, y);
          x.lineTo(210, y + 22);
        }
        x.fill();
      });
    });
    const note = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.48),
      new THREE.MeshBasicMaterial({ map: p.noteTex, toneMapped: false }),
    );
    note.position.set(0, 0.6, 0.177);
    g.add(note);
    p.float = new THREE.Group();
    p.float.position.set(0, 2.05, 0.1);
    g.add(p.float);
    mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.8, 10),
      mat("#f1e3cf", { emissive: "#c39bff", emissiveIntensity: 0.25 }),
      0,
      0,
      0,
      p.float,
      false,
    ).rotation.z = Math.PI / 2;
    mesh(box3(0.66, 0.38, 0.01), mat("#efe0cb"), 0, -0.22, 0.06, p.float, false);
    p.anchor = 2.6;
  };
  // Schedule: gold clock tower showing the visitor's own time
  B.schedule = (g, p) => {
    mesh(box3(0.95, 0.3, 0.95), mat("#4e3f38"), 0, 0.15, 0, g);
    mesh(box3(0.62, 1.9, 0.62), mat("#6b5449"), 0, 1.25, 0, g);
    mesh(box3(0.78, 0.72, 0.78), mat("#7a6052"), 0, 2.55, 0, g);
    mesh(
      new THREE.ConeGeometry(0.66, 0.75, 4),
      mat("#c9a23f", { emissive: "#ffe27a", emissiveIntensity: 0.1 }),
      0,
      3.28,
      0,
      g,
    ).rotation.y = Math.PI / 4;
    mesh(new THREE.OctahedronGeometry(0.08, 0), glowMat("#ffe27a", 1.4), 0, 3.78, 0, g);
    const clock = canvasTex(256, 256, (x, w) => {
      const now = new Date(),
        c = w / 2;
      x.clearRect(0, 0, w, w);
      x.beginPath();
      x.arc(c, c, 120, 0, 7);
      x.fillStyle = "#f6ead8";
      x.fill();
      x.lineWidth = 8;
      x.strokeStyle = "#c9a23f";
      x.stroke();
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        x.beginPath();
        x.moveTo(c + Math.sin(a) * 92, c - Math.cos(a) * 92);
        x.lineTo(c + Math.sin(a) * 106, c - Math.cos(a) * 106);
        x.lineWidth = k % 3 ? 4 : 9;
        x.strokeStyle = "#3a2b24";
        x.stroke();
      }
      const hand = (a, len, wd) => {
        x.beginPath();
        x.moveTo(c, c);
        x.lineTo(c + Math.sin(a) * len, c - Math.cos(a) * len);
        x.lineWidth = wd;
        x.lineCap = "round";
        x.strokeStyle = "#2a1d18";
        x.stroke();
      };
      hand((((now.getHours() % 12) + now.getMinutes() / 60) / 12) * Math.PI * 2, 58, 12);
      hand((now.getMinutes() / 60) * Math.PI * 2, 88, 7);
      x.beginPath();
      x.arc(c, c, 9, 0, 7);
      x.fillStyle = "#f26a4b";
      x.fill();
    });
    const face = flat(clock);
    for (let k = 0; k < 4; k++) {
      const f = new THREE.Mesh(new THREE.CircleGeometry(0.31, 32), face),
        a = (k * Math.PI) / 2;
      f.position.set(Math.sin(a) * 0.395, 2.55, Math.cos(a) * 0.395);
      f.rotation.y = a;
      g.add(f);
    }
    setInterval(clock.redraw, 30000);
    p.anchor = 4.2;
  };
  // Overlay: broadcast tower with signal rings and a small screen showing the overlay
  B.overlay = (g, p) => {
    mesh(hexPrism(0.6, 0.25), mat("#4a3a33"), 0, 0.125, 0, g);
    let y = 0.25;
    for (const [a, b, h] of [
      [0.32, 0.22, 1.0],
      [0.22, 0.13, 0.9],
      [0.13, 0.06, 0.8],
    ]) {
      mesh(
        new THREE.CylinderGeometry(b, a, h, 4),
        mat("#62524a", { metalness: 0.4, roughness: 0.5 }),
        0,
        y + h / 2,
        0,
        g,
      );
      y += h;
      mesh(new THREE.TorusGeometry(b + 0.05, 0.025, 4, 16), glowMat("#f26a4b", 1.1), 0, y, 0, g, false).rotation.x =
        Math.PI / 2;
    }
    p.lamp = mesh(
      new THREE.SphereGeometry(0.1, 12, 8),
      new THREE.MeshStandardMaterial({ color: "#ff3b4e", emissive: "#ff3b4e", emissiveIntensity: 2.2 }),
      0,
      y + 0.12,
      0,
      g,
      false,
    );
    p.waves = [0, 1, 2].map((k) => {
      const w = new THREE.Mesh(
        new THREE.TorusGeometry(0.3, 0.018, 4, 40),
        new THREE.MeshBasicMaterial({ color: "#ff7a59", transparent: true, depthWrite: false }),
      );
      w.rotation.x = Math.PI / 2;
      w.position.y = y + 0.1;
      w.userData.k = k;
      g.add(w);
      return w;
    });
    const scr = canvasTex(512, 300, (x, w, h) => {
      x.fillStyle = "#0f0c0b";
      x.fillRect(0, 0, w, h);
      const gr = x.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, "#2b3a2c");
      gr.addColorStop(1, "#1c2433");
      x.fillStyle = gr;
      x.fillRect(10, 10, w - 20, h - 20);
      x.fillStyle = "#ff3b4e";
      x.beginPath();
      x.arc(40, 42, 11, 0, 7);
      x.fill();
      x.fillStyle = "#fff";
      x.font = "700 30px Sora, sans-serif";
      x.textAlign = "left";
      x.fillText("LIVE", 60, 53);
      ["#8fb4ff", "#8fb4ff", "#7be0a1", "#ffb84d", "#c39bff", "#c39bff", "#ff6a48"].forEach((c, i) => {
        x.fillStyle = c;
        x.fillRect(w - 70, 26 + i * 38, 44, 32);
      });
      [1, 1, 0, 1, 1].forEach((win, i) => {
        x.fillStyle = win ? "#5fcf8f" : "#ef5b6b";
        x.beginPath();
        x.arc(40 + i * 34, h - 40, 12, 0, 7);
        x.fill();
      });
    });
    const tv = new THREE.Group();
    tv.position.set(0.75, 0, 0.35);
    tv.rotation.y = 0.5;
    g.add(tv);
    mesh(box3(0.05, 0.8, 0.05), mat("#3a2f2a"), 0, 0.4, 0, tv);
    mesh(box3(0.95, 0.56, 0.06), panel(scr, mat("#241c19")), 0, 0.95, 0, tv);
    p.anchor = y + 0.9;
  };
  const pickables = [];
  for (const p of PLACES) {
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    g.rotation.y = p.angle;
    g.userData.place = p;
    const inner = new THREE.Group();
    inner.scale.setScalar(1.3);
    g.add(inner);
    B[p.id](inner, p);
    // every building in the same matte clay (dark parts a darker clay); printed bits (clock, scoreboard, screen, letters) keep their colours
    inner.traverse((o) => {
      if (!o.isMesh) return;
      const sw = (m) => (m.isMeshStandardMaterial ? (m.color.getHSL({}).l < 0.3 ? CLAY_DARK : CLAY) : m);
      o.material = Array.isArray(o.material) ? o.material.map(sw) : sw(o.material);
    });
    p.waves?.forEach((w) => (w.visible = false));
    p.anchor *= 1.3;
    p.ring = new THREE.Mesh(
      new THREE.RingGeometry(2.0, 2.2, 6),
      new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.1, depthWrite: false }),
    );
    p.ring.rotation.set(-Math.PI / 2, 0, Math.PI / 6);
    p.ring.position.y = 0.02;
    g.add(p.ring);
    scene.add(g);
    pickables.push(g);
    p.group = g;
    p.lift = 0;
  }

  // ---------- battleground life: units on the roads, crumbling edges, rubble, an airship ----------
  // All small, all clay, none of it casts shadows (so the shadows stay worked out once).
  const unitBody = new THREE.CylinderGeometry(0.055, 0.085, 0.22, 6);
  unitBody.translate(0, 0.11, 0);
  const unitCap = new THREE.ConeGeometry(0.07, 0.12, 6);
  unitCap.translate(0, 0.28, 0);
  const LANES = [
      [0, 4],
      [1, 5],
      [2, 6],
    ],
    PER = 3,
    TEAMS = ["#ff7a59", "#8fb4ff"];
  const lanes = LANES.map(([a, b]) => {
    // from one building, round the crystal (never through it), to the building across
    const A = PLACES[a].angle,
      Bn = PLACES[b].angle;
    let d = Bn - A;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const pts = [[Math.sin(A) * 4.6, Math.cos(A) * 4.6]];
    for (let i = 0; i <= 16; i++) {
      const an = A + (d * i) / 16;
      pts.push([Math.sin(an) * 2.15, Math.cos(an) * 2.15]);
    }
    pts.push([Math.sin(Bn) * 4.6, Math.cos(Bn) * 4.6]);
    const len = [0];
    for (let i = 1; i < pts.length; i++)
      len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, len, total: len[len.length - 1] };
  });
  const at = (lane, s) => {
    // point + heading at distance s along a lane
    const { pts, len } = lane;
    let i = 1;
    while (i < len.length - 1 && len[i] < s) i++;
    const k = (s - len[i - 1]) / (len[i] - len[i - 1] || 1),
      [x0, z0] = pts[i - 1],
      [x1, z1] = pts[i];
    return [x0 + (x1 - x0) * k, z0 + (z1 - z0) * k, Math.atan2(x1 - x0, z1 - z0)];
  };
  const NU = LANES.length * 2 * PER;
  const bodies = new THREE.InstancedMesh(unitBody, CLAY, NU),
    caps = new THREE.InstancedMesh(unitCap, mat("#ffffff", { roughness: 0.8 }), NU);
  const units = [];
  LANES.forEach((_, li) =>
    TEAMS.forEach((c, team) => {
      for (let u = 0; u < PER; u++) {
        caps.setColorAt(units.length, C(c));
        units.push({ li, team, off: u * 0.5 + li * 4.3 + team * 6.1 });
      }
    }),
  );
  scene.add(bodies, caps);
  const um = new THREE.Matrix4(),
    uq = new THREE.Quaternion(),
    uy = new THREE.Vector3(0, 1, 0),
    up = new THREE.Vector3(),
    us = new THREE.Vector3();
  function moveUnits(t) {
    units.forEach((u, i) => {
      const lane = lanes[u.li],
        speed = 0.32;
      let s = ((reduced ? u.off * 2 : t * speed + u.off) % (lane.total + 1.2)) - 0.6; // a short pause off the ends
      const vis = s < 0 || s > lane.total ? 0 : Math.min(1, s / 0.4, (lane.total - s) / 0.4);
      s = Math.max(0, Math.min(lane.total, s));
      if (u.team) s = lane.total - s; // the other team walks the other way
      const [x, z, yaw] = at(lane, s),
        side = u.team ? -0.2 : 0.2; // keep to their side of the road
      up.set(
        x + Math.cos(yaw) * side,
        Math.abs(Math.sin(t * 9 + i)) * 0.03 * (reduced ? 0 : 1),
        z - Math.sin(yaw) * side,
      );
      uq.setFromAxisAngle(uy, yaw + (u.team ? Math.PI : 0));
      us.setScalar(1.3 * vis);
      um.compose(up, uq, us);
      bodies.setMatrixAt(i, um);
      caps.setMatrixAt(i, um);
    });
    bodies.instanceMatrix.needsUpdate = caps.instanceMatrix.needsUpdate = true;
  }

  // Edge pieces that shake, break off and fall, then build back up
  const edge = tiles
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.d >= N - 1 && t.h1 > 0.55)
    .filter((_, k) => k % 3 === 0)
    .slice(0, 9);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const chunks = edge.map(({ t, i }, k) => {
    island.setMatrixAt(i, zero);
    const m = new THREE.Mesh(tileGeo, [
      mat(C("#8a7266").multiply(t.color).getStyle()),
      mat(t.color.getStyle(), { roughness: 0.9 }),
      mat("#2a201c"),
    ]);
    m.scale.y = t.top - t.bottom;
    m.position.set(t.x, t.top, t.z);
    m.receiveShadow = true;
    scene.add(m);
    return { m, t, period: 11 + (k % 4) * 2.3, phase: k * 2.9 };
  });
  island.instanceMatrix.needsUpdate = true;
  function crumble(t) {
    for (const c of chunks) {
      const { m, t: tile } = c;
      m.rotation.set(0, 0, 0);
      m.position.set(tile.x, tile.top, tile.z);
      m.scale.set(1, tile.top - tile.bottom, 1);
      if (reduced) continue;
      const p = (t + c.phase) % c.period;
      if (p < 0.9) {
        // shake
        m.position.x += Math.sin(p * 70) * 0.025;
        m.position.z += Math.cos(p * 63) * 0.025;
      } else if (p < 3.4) {
        // break off and fall, tipping outward
        const f = p - 0.9,
          out = Math.atan2(tile.x, tile.z);
        m.position.y -= 1.6 * f * f;
        m.position.x += Math.sin(out) * f * 0.25;
        m.position.z += Math.cos(out) * f * 0.25;
        m.rotation.set(Math.cos(out) * f * 0.5, 0, -Math.sin(out) * f * 0.5);
        const v = Math.max(0, 1 - f / 2.5);
        m.scale.set(v, (tile.top - tile.bottom) * v, v);
      } else if (p < 5.5)
        m.scale.set(0, 0, 0); // gone for a moment
      else if (p < 6.3) {
        const v = (p - 5.5) / 0.8;
        m.position.y -= (1 - v) * 0.6;
        m.scale.set(v, (tile.top - tile.bottom) * v, v);
      } // builds back up
    }
  }

  // Rubble: a few broken stones lying around, and some floating just under the island
  const rock = new THREE.DodecahedronGeometry(0.12, 0);
  const rubbleSpots = tiles
    .filter((t) => t.top > 0 && t.owner < 0 && Math.hypot(t.x, t.z) > 3 && t.h1 > 0.9)
    .slice(0, 14);
  const rubble = new THREE.InstancedMesh(rock, CLAY_DARK, rubbleSpots.length * 2);
  rubbleSpots.forEach((t, i) => for2(i, t));
  function for2(i, t) {
    for (let k = 0; k < 2; k++) {
      um.compose(
        up.set(t.x + (k ? 0.15 : -0.1), t.top + 0.05, t.z + (k ? -0.12 : 0.08)),
        uq.setFromAxisAngle(uy, t.h1 * 9 + k),
        us.setScalar(k ? 0.7 : 1.1),
      );
      rubble.setMatrixAt(i * 2 + k, um);
    }
  }
  rubble.receiveShadow = true;
  scene.add(rubble);
  const floaters = [...Array(10)].map((_, i) => {
    const a = i * 0.63 + 0.3,
      r = 8.6 + hash(i, 4) * 1.6;
    const o = new THREE.Mesh(rock, mat("#5e4f47"));
    o.scale.setScalar(1.0 + hash(i, 2) * 1.6);
    o.userData = { a, r, y: -2.2 - hash(i, 6) * 2.5, ph: i };
    scene.add(o);
    return o;
  });

  // A small clay airship circling above
  const ship = new THREE.Group();
  ship.scale.setScalar(1.35);
  scene.add(ship);
  const hull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), CLAY);
  hull.scale.set(0.55, 0.55, 1.25);
  ship.add(hull);
  mesh(box3(0.2, 0.12, 0.42), CLAY_DARK, 0, -0.32, 0.02, ship, false);
  for (const [x, y] of [
    [0, 0.24],
    [0.24, 0],
    [-0.24, 0],
  ])
    mesh(box3(x ? 0.24 : 0.03, y ? 0.24 : 0.03, 0.2), CLAY_DARK, x * 0.5, y * 0.5, -0.5, ship, false).rotation.z = 0;
  const prop = mesh(box3(0.4, 0.04, 0.02), CLAY_DARK, 0, 0, -0.66, ship, false);
  const flag = mesh(
    box3(0.015, 0.12, 0.18),
    mat("#f26a4b", { emissive: "#f26a4b", emissiveIntensity: 0.15 }),
    0,
    -0.2,
    -0.2,
    ship,
    false,
  );
  flag.position.set(0, -0.36, -0.22);
  function sail(t) {
    const a = (reduced ? 0.8 : t * 0.06) + 0.8,
      r = 8.2;
    ship.position.set(Math.sin(a) * r, 5.6 + Math.sin(t * 0.7) * 0.15 * (reduced ? 0 : 1), Math.cos(a) * r);
    ship.rotation.set(0, a + Math.PI / 2, Math.sin(t * 0.5) * 0.05);
    prop.rotation.z = t * 14;
    floaters.forEach((o) => {
      const u = o.userData;
      o.position.set(
        Math.sin(u.a + t * 0.01) * u.r,
        u.y + Math.sin(t * 0.5 + u.ph) * 0.12,
        Math.cos(u.a + t * 0.01) * u.r,
      );
      o.rotation.set(t * 0.1 + u.ph, t * 0.07, 0);
    });
  }

  // ---------- labels: real links, so keyboard, screen readers and search engines get them too ----------
  const labels = document.createElement("div");
  labels.className = "map-labels";
  box.append(labels);
  const cap = document.createElement("div");
  cap.className = "map-cap";
  box.append(cap);
  PLACES.forEach((p, i) => {
    const a = document.createElement("a");
    a.className = "pin";
    a.href = p.url;
    a.style.setProperty("--c", p.color);
    a.title = p.desc;
    a.innerHTML = `<b>${p.name}</b>`;
    a.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && hover(p));
    a.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && hover(null));
    a.addEventListener("focus", () => hover(p));
    a.addEventListener("blur", () => hover(null));
    labels.append(a);
    p.el = a;
    p.live = "";
  });
  const nextLine = () => {
    const n = document.getElementById("nextstream");
    PLACES.find((p) => p.id === "schedule").live =
      n && !n.hidden
        ? n.textContent
            .replace(/\s+/g, " ")
            .replace(/Schedule\s*›?\s*$/, "")
            .trim()
        : "";
  };
  const showCap = (p) => {
    cap.classList.toggle("on", !!p);
    if (!p) return;
    if (p.id === "schedule") nextLine();
    cap.style.setProperty("--c", p.color);
    cap.innerHTML = `<b>${esc(p.name)}</b><span>${esc(p.desc)}</span>${p.live ? `<small>${esc(p.live)}</small>` : ""}${picked === p ? `<a class="btn" href="${p.url}">Open <span aria-hidden="true">›</span></a>` : ""}`;
  };

  // ---------- hover, click, drag ----------
  const view = { az: 0.6, el: 0.62 },
    goal = { ...view };
  let idle = 0,
    hovered = null,
    picked = null;
  function resize() {
    const w = box.clientWidth,
      h = box.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    // the island fills the box; on narrow screens it sits a bit high so the caption fits under it
    const aspect = w / h,
      halfH = Math.max(8.9, 10.6 / aspect);
    Object.assign(cam, { left: -halfH * aspect, right: halfH * aspect, top: halfH, bottom: -halfH });
    if (w < 560) cam.setViewOffset(w, h, 0, h * 0.09, w, h);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    dirty = true;
  }
  new ResizeObserver(resize).observe(box);
  resize();

  function hover(p) {
    if (p === hovered) return;
    if (hovered) {
      hovered.el.classList.remove("on");
      tint(PLACES.indexOf(hovered), false);
    }
    hovered = p;
    if (p) {
      p.el.classList.add("on");
      tint(PLACES.indexOf(p), true);
      idle = 0;
    }
    labels.classList.toggle("dim", !!p);
    cv.classList.toggle("hot", !!p);
    showCap(p);
    dirty = true;
  }
  function pick(p) {
    picked = p;
    hover(null);
    hover(p);
    cap.classList.toggle("touch", !!p);
  }

  // Live bits from the data the rest of Home already loads (index.html hands it over with sendHome)
  const fillLive = (d) => {
    const P = (id) => PLACES.find((p) => p.id === id);
    const s = d.tiers?.[0];
    if (s?.names?.length)
      P("tier").live =
        `${s.name} tier: ${s.names.slice(0, 3).join(", ")}${s.names.length > 3 ? ` +${s.names.length - 3}` : ""}`;
    if (d.builds) P("builds").live = `${d.builds} builds on ${d.heroes} heroes`;
    if (d.results) {
      const w = [...d.results].filter((r) => r === "W").length;
      P("games").results = d.results;
      P("games").board.redraw();
      P("games").live = `Last ${d.results.length}: ${w}W ${d.results.length - w}L`;
    }
    if (d.patch) {
      P("patch").patch = `PATCH ${d.patch}`;
      P("patch").noteTex.redraw();
      P("patch").live = `Patch ${d.patch}`;
    }
    if (hovered) showCap(hovered);
  };

  const ray = new THREE.Raycaster(),
    ndc = new THREE.Vector2();
  function hit(e) {
    const r = cv.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    let o = ray.intersectObjects(pickables, true)[0]?.object;
    while (o && !o.userData.place) o = o.parent;
    return o?.userData.place || null;
  }
  let drag = null;
  cv.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
  });
  cv.addEventListener("pointermove", (e) => {
    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 6) {
        cv.classList.add("drag");
        if (!cv.hasPointerCapture(e.pointerId)) cv.setPointerCapture(e.pointerId);
      }
      goal.az -= dx * 0.006;
      if (e.pointerType === "mouse") goal.el = Math.max(0.42, Math.min(1.05, goal.el + dy * 0.004));
      drag.x = e.clientX;
      drag.y = e.clientY;
      idle = 0;
    } else if (e.pointerType === "mouse") hover(hit(e));
  });
  const end = (e) => {
    const tap = drag && drag.moved <= 6 && e.type === "pointerup";
    drag = null;
    cv.classList.remove("drag");
    if (!tap) return;
    const p = hit(e);
    if (e.pointerType === "mouse") {
      if (p) location.href = p.url;
    } else pick(p === picked ? null : p);
  };
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", end);
  cv.addEventListener("pointerleave", (e) => {
    if (!drag && e.pointerType === "mouse") hover(null);
  });

  // ---------- loop ----------
  // 60 fps while you interact, 30 fps while it just turns by itself, nothing while off screen or in a background tab.
  const clock = new THREE.Clock(),
    v3 = new THREE.Vector3();
  let visible = true,
    acc = 0,
    slow = 0,
    frames = 0,
    shadowsLeft = 3;
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) dirty = true;
  }).observe(box);
  const P = Object.fromEntries(PLACES.map((p) => [p.id, p]));
  hero.classList.add("map-ready");
  if (window.HOME_DATA) fillLive(window.HOME_DATA);
  addEventListener("homedata", (e) => fillLive(e.detail));

  (function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!visible || document.hidden) return;
    const busy =
      drag ||
      hovered ||
      picked ||
      idle < 1.5 ||
      Math.abs(goal.az - view.az) > 0.002 ||
      Math.abs(goal.el - view.el) > 0.002;
    acc += dt;
    if (reduced ? !dirty && !busy : !busy && acc < 1 / 30) return;
    const step = acc;
    acc = 0;
    const t = clock.elapsedTime,
      m = reduced ? 0 : 1;
    idle += step;
    if (!reduced && idle > 4 && !drag && !hovered && !picked) goal.az += step * 0.04;
    const k = reduced ? 1 : 1 - Math.exp(-step * 5);
    view.az += (goal.az - view.az) * k;
    view.el += (goal.el - view.el) * k;
    cam.position.set(
      40 * Math.cos(view.el) * Math.sin(view.az),
      40 * Math.sin(view.el),
      40 * Math.cos(view.el) * Math.cos(view.az),
    );
    cam.lookAt(0, 0, 0);

    crystal.position.y = 2.1 + Math.sin(t * 1.2) * 0.12 * m;
    crystal.rotation.y = t * 0.5 * m;
    ring1.rotation.set(Math.PI / 2 + Math.sin(t * 0.4) * 0.35 * m, t * 0.3 * m, 0);
    ring2.rotation.set(Math.PI / 2 + Math.cos(t * 0.5) * 0.45 * m, 0, t * 0.4 * m);
    let lifting = false;
    for (const p of PLACES) {
      const target = p === hovered ? 0.28 : 0;
      if (Math.abs(target - p.lift) > 0.002) {
        p.lift += (target - p.lift) * k;
        lifting = true;
      } else p.lift = target;
      p.group.position.y = p.lift;
      p.ring.material.opacity += ((p === hovered ? 0.75 : 0.1) - p.ring.material.opacity) * k;
    }
    P.tier.spin.rotation.y = t * 0.8 * m;
    P.builds.gems.forEach((g, i) => {
      g.rotation.y = t * 1.2 * m + i;
      g.position.y = g.userData.base + Math.sin(t * 2 + i) * 0.05 * m;
    });
    P.draft.duel.forEach((c, i) => {
      c.rotation.y = t * (i ? -1 : 1) * m;
    });
    P.patch.float.position.y = 2.05 + Math.sin(t * 1.3) * 0.1 * m;
    moveUnits(t);
    crumble(t);
    sail(t);

    if (renderer.shadowMap.enabled && (shadowsLeft > 0 || lifting)) {
      renderer.shadowMap.needsUpdate = true;
      shadowsLeft--;
    }
    renderer.render(scene, cam);
    dirty = false;

    // If frames are slow (older laptops), draw at 1x instead of 1.5x
    if (dpr > 1 && ++frames > 30) {
      slow = slow * 0.9 + (dt > 0.045 ? 1 : 0);
      if (slow > 3) {
        dpr = 1;
        renderer.setPixelRatio(1);
        resize();
      }
    }

    // labels follow their building, kept inside the box
    const w = box.clientWidth,
      h = box.clientHeight;
    for (const p of PLACES) {
      v3.set(p.group.position.x, p.anchor + p.lift, p.group.position.z).project(cam);
      const half = p.el.offsetWidth / 2;
      const x = Math.max(half + 4, Math.min(w - half - 4, ((v3.x + 1) / 2) * w));
      p.el.style.transform = `translate(${x}px, ${Math.max(p.el.offsetHeight + 4, ((1 - v3.y) / 2) * h)}px) translate(-50%, -100%)`;
    }
  })();
}
