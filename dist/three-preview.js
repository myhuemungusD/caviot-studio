let renderer, scene, camera, controls, meshObj = null;
let gridHelper = null, axesHelper = null;
let previewMesh = null; // pure {positions, indices}

function eachMaterial(material, fn) {
  if (Array.isArray(material)) material.forEach((item) => item && fn(item));
  else if (material) fn(material);
}

function styleGridMaterial(grid) {
  eachMaterial(grid && grid.material, (material) => {
    material.transparent = true;
    material.opacity = 0.72;
  });
}

function disposeMaterial(material) {
  eachMaterial(material, (item) => item.dispose());
}

function initThree() {
  const container = els.threeContainer;
  if (!container || typeof THREE === 'undefined') return;
  const w = container.clientWidth || 600;
  const h = container.clientHeight || 500;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 2000);
  camera.position.set(60, 50, 90);

  const amb = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffe0c0, 0.85);
  dir.position.set(40, 80, 50);
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.25);
  fill.position.set(-50, 20, -40);
  scene.add(fill);

  gridHelper = new THREE.GridHelper(200, 40, 0x55545c, 0x292930);
  gridHelper.position.y = 0;
  styleGridMaterial(gridHelper);
  scene.add(gridHelper);

  axesHelper = new THREE.AxesHelper(28);
  axesHelper.position.set(0, 0.03, 0);
  scene.add(axesHelper);

  if (THREE.OrbitControls) {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 30, 0);
    // Blender-style mouse navigation: MMB orbit, Shift+MMB pan, wheel zoom.
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    renderer.domElement.addEventListener('mousedown', (e) => {
      if (e.button !== 1 || !e.shiftKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      renderer.domElement.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        button: 2,
        buttons: 2,
      }));
    }, true);
  }

  window.addEventListener('resize', onResize);
  animate();
}

function onResize() {
  if (!renderer || !camera || !els.threeContainer) return;
  const w = els.threeContainer.clientWidth;
  const h = els.threeContainer.clientHeight;
  if (w < 2 || h < 2) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function resetView() {
  if (!meshObj || !camera || !controls) return;
  const box = new THREE.Box3().setFromObject(meshObj);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 50;
  const dist = maxDim * 2.2;
  camera.up.set(0, 1, 0);
  camera.position.set(center.x + dist * 0.55, center.y + dist * 0.35, center.z + dist * 0.75);
  controls.target.copy(center);
  controls.update();
}

function setBlenderView(view) {
  if (!meshObj || !camera || !controls) return;
  const box = new THREE.Box3().setFromObject(meshObj);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const dist = (Math.max(size.x, size.y, size.z) || 50) * 2.4;
  camera.up.set(0, 1, 0);
  if (view === 'front') camera.position.set(center.x, center.y, center.z + dist);
  if (view === 'right') camera.position.set(center.x + dist, center.y, center.z);
  if (view === 'top') {
    camera.up.set(0, 0, -1);
    camera.position.set(center.x, center.y + dist, center.z);
  }
  controls.target.copy(center);
  camera.lookAt(center);
  controls.update();
}

function setEmptyState(empty) {
  if (els.threeEmpty) els.threeEmpty.style.display = empty ? 'flex' : 'none';
  if (els.generateBtn) els.generateBtn.disabled = empty;
  if (els.downloadObjBtn) els.downloadObjBtn.disabled = empty;
  const tools = document.getElementById('imgTools');
  if (tools) {
    tools.querySelectorAll('button').forEach((b) => { b.disabled = empty; });
  }
}

function buildThreePreview() {
  if (templateActive()) { requestTemplatePreview(); return; }
  if (!scene || !AppState.heightmap) return;
  const opts = meshOptionsFromState(AppState.heightmap, AppState.hmRows, AppState.hmCols, AppState.mask);
  let mesh;
  try {
    mesh = MC.buildMesh(opts);
  } catch (e) {
    console.error(e);
    previewMesh = null;
    AppState.lastValidation = null;
    if (meshObj) {
      scene.remove(meshObj);
      meshObj.geometry.dispose();
      meshObj.material.dispose();
      meshObj = null;
    }
    setEmptyState(true);
    updateStats();
    toast(e.message || 'Mesh build failed', 'error');
    return;
  }
  previewMesh = mesh;
  const geo = MC.toThreeGeometry(mesh, THREE);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xc8c4bc,
    metalness: 0.12,
    roughness: 0.55,
    side: THREE.DoubleSide,
  });
  if (meshObj) {
    scene.remove(meshObj);
    meshObj.geometry.dispose();
    meshObj.material.dispose();
  }
  meshObj = new THREE.Mesh(geo, mat);
  // Center roughly
  geo.computeBoundingBox();
  const c = new THREE.Vector3();
  geo.boundingBox.getCenter(c);
  meshObj.position.sub(c);
  meshObj.position.y += c.y; // keep base near origin visually for sleeve
  scene.add(meshObj);

  // Keep the grid useful for both small lighter sleeves and larger custom parts.
  if (gridHelper) {
    const boxSize = new THREE.Vector3();
    geo.boundingBox.getSize(boxSize);
    const desired = Math.max(100, Math.ceil(Math.max(boxSize.x, boxSize.z) * 2.5 / 10) * 10);
    scene.remove(gridHelper);
    gridHelper.geometry.dispose();
    disposeMaterial(gridHelper.material);
    gridHelper = new THREE.GridHelper(desired, 40, 0x55545c, 0x292930);
    styleGridMaterial(gridHelper);
    scene.add(gridHelper);
  }

  const v = MC.validateMesh(mesh.positions, mesh.indices);
  AppState.lastValidation = v;
  updateStats();
  setEmptyState(false);
}

// ---------- Rebuild ----------
