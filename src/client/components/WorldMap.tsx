import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generateTerrain, regionAt, sampleHeight, type Point, type RiverPoint, type TerrainWorld } from '../game/world';
import { buildSurface, TERRAIN_SCALE } from '../game/terrainMesh';
import { nations as legacyNations, type Language, type Localized } from '../game/policy';

type Props = { activeNation?: number; ownership?: number[]; garrisons?: number[]; routes?: { from: number; to: number }[]; orderRoutes?: { from: number; to: number }[]; monochrome?: boolean; seed: number; terrain?: TerrainWorld; nations?: { name: Localized; color?: string; resources?: { army: number } }[]; showArmies?: boolean; language: Language; selected: number; relief: number; onSelect: (id: number) => void };
type Runtime = { update: (selected: number, relief: number, style: 'points' | 'surface') => void; reset: () => void };

/** @requires Generated terrain and a closed outline. @ensures Border lines follow the sampled ground. */
function borderPoints(world: TerrainWorld, polygon: Point[]): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 3));
    for (let n = 0; n < steps; n++) {
      const p = { x: a.x + (b.x - a.x) * n / steps, y: a.y + (b.y - a.y) * n / steps };
      points.push(new THREE.Vector3(p.x - 500, sampleHeight(world, p) * TERRAIN_SCALE + 1.2, p.y - 360));
    }
  }
  points.push(points[0].clone());
  return points;
}

/** @requires A sampled channel. @ensures A tapered ribbon rather than a constant-width line. */
function riverGeometry(world: TerrainWorld, river: RiverPoint[], width: number, lift: number, innerWidth = 0): THREE.BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  river.forEach((p, i) => {
    const before = river[Math.max(0, i - 1)], after = river[Math.min(river.length - 1, i + 1)];
    const dx = after.x - before.x, dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    for (const offset of innerWidth === 0 ? [-width, width] : [innerWidth, width]) {
      const bank = { x: p.x + dy / length * p.width * offset, y: p.y - dx / length * p.width * offset };
      positions.push(bank.x - 500, sampleHeight(world, bank) * TERRAIN_SCALE + lift, bank.y - 360);
    }
    if (i > 0) { const a = (i - 1) * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** @requires Browser with WebGL2. @ensures GPU resources are released and keyboard selection stays available. */
export function WorldMap({ activeNation, ownership, garrisons, routes, orderRoutes, monochrome = false, seed, terrain, nations = legacyNations, showArmies = false, language, selected, relief, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const nationRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const runtime = useRef<Runtime | null>(null);
  const pick = useRef(onSelect);
  pick.current = onSelect;
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [style, setStyle] = useState<'points' | 'surface'>('points');
  const world = useMemo(() => terrain ?? generateTerrain(seed), [seed, terrain]);
  const view = useRef({ selected, relief, style, activeNation, ownership });
  view.current = { selected, relief, style, activeNation, ownership };

  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); }
    catch { setError(true); return; }
    setError(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(monochrome ? '#101010' : '#081219');
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .85;
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D terrain');
    renderer.domElement.dataset.renderer = 'webgl2';
    renderer.domElement.dataset.world = String(world.seed);
    container.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    scene.add(root);
    scene.add(new THREE.HemisphereLight(0xd8edf1, 0x26323a, 1.2));
    const light = new THREE.DirectionalLight(0xfff3d9, 2);
    light.position.set(-300, 800, -450);
    scene.add(light);
    const camera = new THREE.OrthographicCamera(-620, 620, 440, -440, 1, 4000);
    camera.position.set(70, 1050, 760);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enablePan = false;
    controls.minPolarAngle = .2;
    controls.maxPolarAngle = 1.1;
    controls.minZoom = .8;
    controls.maxZoom = 2.5;
    controls.update();
    controls.saveState();
    const surface = buildSurface(world);
    if (monochrome) {
      for (let i = 0; i < surface.pointColors.length; i += 3) { surface.pointColors[i] = .65; surface.pointColors[i + 1] = .65; surface.pointColors[i + 2] = .65; }
      for (let i = 0; i < surface.colors.length; i += 3) { surface.colors[i] = .3; surface.colors[i + 1] = .3; surface.colors[i + 2] = .3; }
    }
    for (const [paths, planned] of [[routes ?? [], false], [orderRoutes ?? [], true]] as const) {
      for (const path of paths) {
        const a = world.regions[path.from], b = world.regions[path.to];
        const start = new THREE.Vector3(a.center.x - 500, a.elevation * TERRAIN_SCALE + 9, a.center.y - 360);
        const end = new THREE.Vector3(b.center.x - 500, b.elevation * TERRAIN_SCALE + 9, b.center.y - 360);
        const middle = start.clone().lerp(end, .5); middle.y += planned ? 35 : 20;
        const curve = new THREE.QuadraticBezierCurve3(start, middle, end);
        const color = planned ? '#ee204b' : '#707070';
        root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: planned ? .95 : .5 })));
        if (planned) root.add(new THREE.ArrowHelper(curve.getTangent(.94).normalize(), curve.getPoint(.94), 12, color, 8, 5));
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(surface.colors, 3));
    geometry.setIndex(surface.indices);
    geometry.computeVertexNormals();
    const solidMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .98, metalness: 0, side: THREE.DoubleSide });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: monochrome ? '#252525' : '#233b46', roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    if (ownership) { darkMaterial.color.set('#ffffff'); darkMaterial.vertexColors = true; }
    const terrain = new THREE.Mesh(geometry, darkMaterial);
    root.add(terrain);
    renderer.domElement.dataset.triangles = String(surface.indices.length / 3);
    const dots = new THREE.BufferGeometry();
    dots.setAttribute('position', new THREE.Float32BufferAttribute(surface.points, 3));
    dots.setAttribute('color', new THREE.Float32BufferAttribute(surface.pointColors, 3));
    const pixels = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const index = (y * 16 + x) * 4;
      const alpha = Math.max(0, Math.min(1, (1 - Math.hypot(x - 7.5, y - 7.5) / 7.5) * 2));
      pixels.set([255, 255, 255, Math.round(alpha * 255)], index);
    }
    const pointTexture = new THREE.DataTexture(pixels, 16, 16);
    pointTexture.needsUpdate = true;
    const pointMaterial = new THREE.PointsMaterial({ vertexColors: true, map: pointTexture, size: 1.9, sizeAttenuation: false, transparent: true, opacity: .75, depthWrite: false });
    root.add(new THREE.Points(dots, pointMaterial));
    const scanGeometry = new THREE.BufferGeometry();
    scanGeometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.lines, 3));
    const scanLines = new THREE.LineSegments(scanGeometry, new THREE.LineBasicMaterial({ color: monochrome ? '#b4b4b4' : '#89b6bf', transparent: true, opacity: .12 }));
    root.add(scanLines);
    const borders = world.regions.map(r => {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(borderPoints(world, r.polygon)), new THREE.LineBasicMaterial({ color: '#7a9ba7', transparent: true, opacity: .26 }));
      root.add(line);
      return line;
    });
    (ownership ? [] : world.nationShapes)?.forEach((polygon, i) => {
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(borderPoints(world, polygon)), new THREE.LineBasicMaterial({ color: monochrome ? '#cccccc' : nations[i].color ?? '#91abb9', transparent: true, opacity: .65 })));
    });
    for (const river of world.rivers) {
      for (const side of [-1, 1]) root.add(new THREE.Mesh(riverGeometry(world, river, 1.7 * side, .65, side), new THREE.MeshStandardMaterial({ color: '#263e40', roughness: 1, side: THREE.DoubleSide })));
      root.add(new THREE.Mesh(riverGeometry(world, river, 1, 1.05), new THREE.MeshBasicMaterial({ color: monochrome ? '#777777' : '#396e81', side: THREE.DoubleSide })));
    }
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1900), new THREE.MeshBasicMaterial({ color: monochrome ? '#101010' : '#081219', toneMapped: false }));
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -2;
    scene.add(ocean);
    const grid = new THREE.GridHelper(1600, 40, 0x24404b, 0x172c35);
    grid.position.y = -1.8;
    grid.visible = false;
    scene.add(grid);

    const render = () => {
      renderer.render(scene, camera);
      const width = container.clientWidth, height = container.clientHeight;
      type Box = { x: number; y: number; w: number; h: number };
      const occupied: Box[] = [];
      const free = (b: Box) => b.x >= 4 && b.y >= 4 && b.x + b.w <= width - 4 && b.y + b.h <= height - 4 && !occupied.some(a => b.x < a.x + a.w + 5 && b.x + b.w + 5 > a.x && b.y < a.y + a.h + 5 && b.y + b.h + 5 > a.y);
      const markers: { label: HTMLButtonElement; box: Box; id: number }[] = [];
      world.regions.forEach(r => {
        const label = labelRefs.current[r.id];
        if (!label) return;
        const anchor = new THREE.Vector3(r.center.x - 500, (r.elevation * TERRAIN_SCALE + 5) * root.scale.y, r.center.y - 360).project(camera);
        label.style.left = `${(anchor.x + 1) * 50}%`;
        label.style.top = `${(1 - anchor.y) * 50}%`;
        label.style.visibility = Math.abs(anchor.x) <= 1 && Math.abs(anchor.y) <= 1 ? 'visible' : 'hidden';
        label.classList.remove('marker-compact');
        if (view.current.ownership) {
          const box = { x: (anchor.x + 1) * width / 2 - label.offsetWidth / 2, y: (1 - anchor.y) * height / 2 - label.offsetHeight / 2, w: label.offsetWidth, h: label.offsetHeight };
          markers.push({ label, box, id: r.id });
          if (r.id === view.current.selected) occupied.push(box);
        }
      });
      nations.forEach((_, i) => {
        const label = nationRefs.current[i]; if (!label) return;
        const owned = world.regions.filter(r => (view.current.ownership?.[r.id] ?? r.nation) === i);
        label.hidden = !owned.length; if (!owned.length) return;
        const anchorRegion = owned.find(r => r.nation === i) ?? owned[0];
        const anchor = new THREE.Vector3(anchorRegion.center.x - 500, (anchorRegion.elevation * TERRAIN_SCALE + 5) * root.scale.y, anchorRegion.center.y - 360).project(camera);
        const x = (anchor.x + 1) * width / 2, y = (1 - anchor.y) * height / 2;
        const w = label.offsetWidth, h = label.offsetHeight;
        const candidate = [[-w / 2, -h - 24], [-w / 2, 25], [25, -h / 2], [-w - 25, -h / 2], [-w / 2, -h - 55], [-w / 2, 55], [40, -h - 30], [-w - 40, 30]]
          .map(([dx, dy]) => ({ x: x + dx, y: y + dy, w, h })).find(free);
        label.style.visibility = candidate ? 'visible' : 'hidden';
        if (candidate) { occupied.push(candidate); label.style.left = `${candidate.x}px`; label.style.top = `${candidate.y}px`; }
      });
      for (const marker of markers) {
        if (marker.id === view.current.selected) continue;
        if (free(marker.box)) occupied.push(marker.box);
        else marker.label.classList.add('marker-compact');
      }
    };
    const resize = () => {
      const width = container.clientWidth, height = container.clientHeight;
      if (!width || !height) return;
      const aspect = width / height, halfHeight = Math.max(300, 540 / aspect);
      camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
      camera.top = halfHeight; camera.bottom = -halfHeight;
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const projected = new THREE.Vector3();
      for (let i = 0; i < surface.points.length; i += 3) {
        projected.set(surface.points[i], surface.points[i + 1] * root.scale.y, surface.points[i + 2]).project(camera);
        minX = Math.min(minX, projected.x); maxX = Math.max(maxX, projected.x); minY = Math.min(minY, projected.y); maxY = Math.max(maxY, projected.y);
      }
      // Fit actual land, leaving room above capitals for names instead of framing the empty ocean.
      camera.zoom = Math.min(2.5, .9 / Math.max(Math.abs(minX), Math.abs(maxX)), .8 / Math.max(Math.abs(minY), Math.abs(maxY)));
      camera.updateProjectionMatrix(); controls.saveState();
      renderer.setSize(width, height);
      render();
    };
    let paintedOwnership = '';
    const palette = nations.map(n => new THREE.Color(n.color ?? '#91abb9'));
    runtime.current = {
      update: (id, exaggeration, displayStyle) => {
        const key = (view.current.ownership ?? []).join(',');
        if (view.current.ownership && key !== paintedOwnership) {
          for (const [buffer, ids, brightness] of [[geometry.getAttribute('color'), surface.regionIds, .27], [dots.getAttribute('color'), surface.pointRegionIds, 1.3]] as const) {
            ids.forEach((region, vertex) => { if (region < 0) return; const color = palette[view.current.ownership![region]]; buffer.setXYZ(vertex, color.r * brightness, color.g * brightness, color.b * brightness); });
            buffer.needsUpdate = true;
          }
          paintedOwnership = key;
          renderer.domElement.dataset.territoryColors = String(new Set(view.current.ownership).size);
          renderer.domElement.dataset.ownership = key;
        }
        root.scale.y = Math.max(.02, exaggeration);
        terrain.material = displayStyle === 'points' ? darkMaterial : solidMaterial;
        grid.visible = displayStyle === 'surface';
        scanLines.visible = displayStyle === 'points';
        pointMaterial.opacity = displayStyle === 'points' ? .75 : .4;
        borders.forEach((line, i) => { const owner = view.current.ownership?.[i], owned = owner === view.current.activeNation && owner !== undefined; line.material.color.set(i === id ? '#ffffff' : owner !== undefined ? nations[owner].color ?? '#dddddd' : monochrome ? '#dddddd' : '#7a9ba7'); line.material.opacity = i === id ? 1 : owned ? .9 : owner !== undefined ? .6 : .26; });
        renderer.domElement.dataset.style = displayStyle;
        render();
      },
      reset: () => { controls.reset(); render(); },
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    controls.addEventListener('change', render);
    let start = { x: 0, y: 0 };
    const pointerDown = (e: PointerEvent) => { start = { x: e.clientX, y: e.clientY }; };
    const pointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;
      const bounds = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((e.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (e.clientY - bounds.top) / bounds.height * 2), camera);
      const hit = ray.intersectObject(terrain)[0];
      if (hit) { const region = regionAt(world, { x: hit.point.x + 500, y: hit.point.z + 360 }); if (region) pick.current(region.id); }
    };
    const contextLost = (e: Event) => { e.preventDefault(); setError(true); };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    resize();
    runtime.current.update(view.current.selected, view.current.relief, view.current.style);
    return () => {
      runtime.current = null;
      observer.disconnect();
      controls.removeEventListener('change', render);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      scene.traverse(object => {
        const renderable = object as THREE.Mesh;
        renderable.geometry?.dispose();
        const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
        materials.forEach(material => material?.dispose());
      });
      renderer.dispose();
      pointTexture.dispose();
      solidMaterial.dispose();
      darkMaterial.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [world, retry, monochrome, routes, orderRoutes]);

  useEffect(() => { runtime.current?.update(selected, relief, style); }, [selected, relief, style, ownership, activeNation, language]);
  const t = (en: string, zh: string) => language === 'en' ? en : zh;
  return <div className="gl-world">
    <div className="gl-toolbar"><span>{t('TOPOGRAPHIC SCAN', '地形扫描')}</span><div className="map-view-actions"><button className="text-button" aria-pressed={style === 'points'} onClick={() => setStyle(style === 'points' ? 'surface' : 'points')}>{style === 'points' ? t('Compare solid view', '对比实体视图') : t('Return to point cloud', '返回点云视图')}</button><button className="text-button" onClick={() => runtime.current?.reset()}>{t('Reset view', '重置视角')}</button></div></div>
    <div ref={host} className="gl-canvas" aria-label={t('Selectable elevation map', '可选择的高程地图')}>
      {!error && <div className="map-labels">{world.regions.map(r => {
        const capital = world.regions.find(other => other.nation === r.nation)?.id === r.id; const owner = ownership?.[r.id] ?? r.nation;
        return <button key={r.id} ref={element => { labelRefs.current[r.id] = element; }} className={`map-marker ${capital ? 'capital-marker' : ''} ${selected === r.id ? 'selected' : ''}`} style={{ color: nations[owner].color }} title={nations[owner].name[language]} aria-pressed={selected === r.id} aria-label={`${t('Sector', '地区')} ${r.id + 1}, ${nations[owner].name[language]}`} onClick={() => onSelect(r.id)}>{capital ? <><span>◇ {garrisons ? String(r.id + 1).padStart(2, '0') : nations[owner].name[language]}</span>{showArmies && <small>⚑ {garrisons?.[r.id] ?? nations[owner].resources?.army}</small>}</> : <>{String(r.id + 1).padStart(2, '0')}{garrisons && <small>⚑ {garrisons[r.id]}</small>}</>}</button>;
      })}{ownership && nations.map((n, i) => <span key={i} ref={element => { nationRefs.current[i] = element; }} className="territory-name" style={{ color: n.color }}>{n.name[language]}</span>)}</div>}
      {error && <div className="gl-error" role="alert"><p>{t('WebGL is unavailable. Enable browser hardware acceleration, then retry.', 'WebGL 不可用，请开启浏览器硬件加速后重试。')}</p><button className="secondary-button" onClick={() => setRetry(retry + 1)}>{t('Retry renderer', '重试渲染')}</button></div>}
    </div>
    <p className="gl-hint">{t('Drag to rotate · Scroll to zoom · Select a sector', '拖动旋转 · 滚轮缩放 · 点击地区选择')}</p>
  </div>;
}
