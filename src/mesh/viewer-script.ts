/**
 * The module script of the viewer page. The page builder replaces three markers before it writes the page:
 * the two import addresses, the glb text and the flag that shows the panel. The script reports its result in
 * window.__sciengDone, so the browser stage waits for the first drawn frame.
 */
export const VIEWER_SCRIPT = `
import * as THREE from "three";
import { OrbitControls } from "@@ORBIT@@";
import { GLTFLoader } from "@@GLTF@@";

const GLB_BASE64 = "@@GLB@@";
const SHOW_CONTROLS = @@CONTROLS@@;
const AXIS_KEYS = ["x", "y", "z"];

function fail(err) {
  window.__sciengDone = { ok: false, internal: true, message: String((err && err.message) || err) };
}

try {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.domElement.style.display = "block";
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f4f7);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8d939b, 1.2));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
  keyLight.position.set(1.0, 2.0, 1.5);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.7);
  fillLight.position.set(-1.5, 0.8, -1.2);
  scene.add(fillLight);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(3.0, 2.0, 4.0);

  // The controls fire the change event inside update, so render must not call update.
  function render() {
    renderer.render(scene, camera);
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.addEventListener("change", render);

  window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    render();
  });

  // The plane keeps the part of the model with a coordinate below its value.
  const sectionPlanes = [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)
  ];
  const sectionEnabled = [false, false, false];
  const sectionFraction = [0.5, 0.5, 0.5];
  let modelBox = null;
  const parts = [];

  function setSection(axis, enabled, fraction) {
    if (!modelBox) return;
    const axisIndex = axis | 0;
    if (axisIndex < 0 || axisIndex > 2) return;
    sectionEnabled[axisIndex] = !!enabled;
    if (fraction !== undefined && fraction !== null) {
      const parsed = Number(fraction);
      if (isFinite(parsed)) sectionFraction[axisIndex] = parsed;
    }
    const axisMin = modelBox.min[AXIS_KEYS[axisIndex]];
    const axisMax = modelBox.max[AXIS_KEYS[axisIndex]];
    sectionPlanes[axisIndex].constant = axisMin + sectionFraction[axisIndex] * (axisMax - axisMin);
    const activePlanes = [];
    for (let k = 0; k < 3; k++) {
      if (sectionEnabled[k]) activePlanes.push(sectionPlanes[k]);
    }
    renderer.clippingPlanes = activePlanes;
  }

  function setExplode(f) {
    const amount = Number(f);
    if (!isFinite(amount)) return;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      part.object.position.copy(part.base).addScaledVector(part.dir, amount * 1.5);
    }
  }

  function buildControlsPanel() {
    const panel = document.createElement("div");
    panel.id = "sciengjs-controls";
    panel.style.cssText =
      "position:fixed;top:10px;left:10px;padding:10px;background:#fff;color:#222;font:12px system-ui,Arial,sans-serif;" +
      "border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.25);z-index:1000";

    function range(value) {
      const input = document.createElement("input");
      input.type = "range";
      input.min = "0";
      input.max = "1";
      input.step = "0.01";
      input.value = value;
      input.style.width = "140px";
      return input;
    }

    const explodeRow = document.createElement("div");
    const explodeLabel = document.createElement("label");
    explodeLabel.textContent = "Exploded ";
    const explodeInput = range("0");
    explodeInput.id = "sciengjs-explode";
    explodeInput.addEventListener("input", function () {
      setExplode(parseFloat(explodeInput.value));
      render();
    });
    explodeLabel.appendChild(explodeInput);
    explodeRow.appendChild(explodeLabel);
    panel.appendChild(explodeRow);

    const axisNames = ["X", "Y", "Z"];
    for (let i = 0; i < axisNames.length; i++) {
      const row = document.createElement("div");
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = "sciengjs-section-" + axisNames[i].toLowerCase();
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(" Section " + axisNames[i] + " "));
      const slider = range("0.5");
      const update = function () {
        setSection(i, checkbox.checked, parseFloat(slider.value));
        render();
      };
      checkbox.addEventListener("change", update);
      slider.addEventListener("input", update);
      row.appendChild(label);
      row.appendChild(slider);
      panel.appendChild(row);
    }
    document.body.appendChild(panel);
  }

  window.__sciengViewer = { setExplode, setSection, render, scene, camera, renderer };

  const binary = atob(GLB_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  new GLTFLoader().parse(
    bytes.buffer,
    "",
    function (gltf) {
      try {
        const model = gltf.scene;
        model.traverse(function (object) {
          if (!object.isMesh) return;
          if (!object.geometry.attributes.normal) object.geometry.computeVertexNormals();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) material.side = THREE.DoubleSide;
        });
        scene.add(model);
        model.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(model);
        const centre = box.getCenter(new THREE.Vector3());
        const boxSize = box.getSize(new THREE.Vector3());
        let size = Math.max(boxSize.x, boxSize.y, boxSize.z);
        if (!isFinite(size) || size <= 0) size = 1;
        modelBox = box;

        camera.position.set(centre.x + 0.95 * size, centre.y + 0.7 * size, centre.z + 0.95 * size);
        camera.near = size / 1000;
        camera.far = size * 100;
        camera.updateProjectionMatrix();
        controls.target.copy(centre);
        camera.lookAt(centre);
        controls.update();

        for (const child of model.children) {
          const dir = new THREE.Vector3(0, 0, 0);
          const childBox = new THREE.Box3().setFromObject(child);
          if (!childBox.isEmpty()) {
            dir.copy(childBox.getCenter(new THREE.Vector3())).sub(centre);
            if (dir.length() < 1e-9) dir.set(0, 0, 0);
          }
          parts.push({ object: child, base: child.position.clone(), dir: dir });
        }

        if (SHOW_CONTROLS) buildControlsPanel();
        render();
        window.__sciengDone = { ok: true, svg: "" };
      } catch (err) {
        fail(err);
      }
    },
    fail
  );
} catch (err) {
  fail(err);
}
`;
