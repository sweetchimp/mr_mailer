import { useEffect, useRef, useState } from "react";

const THREE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

const COLORS = {
  skin: 0xd4a574,
  mailman: 0xa89080,
  shirt: 0x9d8273,
  legs: 0x3d3d3d,
  shoes: 0x2a2a2a,
};

const TIMING = {
  totalDuration: 3,
  walkDuration: 2.2,
  deliveryDuration: 0.8,
  hatTipStart: 0.3,
  fadeOutDuration: 0.5,
};

function loadThreeJS(): Promise<any> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if ((window as any).THREE) return Promise.resolve((window as any).THREE);

  return new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${THREE_CDN}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).THREE));
      existing.addEventListener("error", () => resolve(null));
      return;
    }

    const script = document.createElement("script");
    script.src = THREE_CDN;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve((window as any).THREE);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function createMailmanScene(THREE: any, canvas: HTMLCanvasElement, reducedMotion: boolean) {
  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  camera.position.z = 8;

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);

  const mailman = new THREE.Group();
  scene.add(mailman);

  const skinMat = new THREE.MeshStandardMaterial({ color: COLORS.skin });
  const mailmanMat = new THREE.MeshStandardMaterial({ color: COLORS.mailman });
  const shirtMat = new THREE.MeshStandardMaterial({ color: COLORS.shirt });
  const legMat = new THREE.MeshStandardMaterial({ color: COLORS.legs });
  const shoeMat = new THREE.MeshStandardMaterial({ color: COLORS.shoes });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 32), skinMat);
  head.position.y = 1.5;
  mailman.add(head);

  const hatGroup = new THREE.Group();
  hatGroup.position.y = 1.95;
  hatGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 32), mailmanMat));
  const hatTop = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.5, 32), mailmanMat);
  hatTop.position.y = 0.35;
  hatGroup.add(hatTop);
  mailman.add(hatGroup);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.8, 32), shirtMat);
  body.position.y = 0.7;
  mailman.add(body);

  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.2), mailmanMat);
  bag.position.set(-0.25, 0.5, 0);
  mailman.add(bag);

  const armGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 16);
  const leftArm = new THREE.Mesh(armGeom, skinMat);
  leftArm.position.set(-0.5, 1.0, 0);
  leftArm.rotation.z = Math.PI / 6;
  mailman.add(leftArm);

  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.5, 1.0, 0);
  rightArmGroup.add(new THREE.Mesh(armGeom, skinMat));
  mailman.add(rightArmGroup);

  const legGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 16);
  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.2, 0.2, 0);
  leftLegGroup.add(new THREE.Mesh(legGeom, legMat));
  mailman.add(leftLegGroup);

  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.2, 0.2, 0);
  rightLegGroup.add(new THREE.Mesh(legGeom, legMat));
  mailman.add(rightLegGroup);

  const shoeGeom = new THREE.BoxGeometry(0.15, 0.15, 0.2);
  const leftShoe = new THREE.Mesh(shoeGeom, shoeMat);
  leftShoe.position.set(-0.2, -0.45, 0);
  mailman.add(leftShoe);
  const rightShoe = new THREE.Mesh(shoeGeom, shoeMat);
  rightShoe.position.set(0.2, -0.45, 0);
  mailman.add(rightShoe);

  let animTime = 0;
  let rafId = 0;

  function update(t: number) {
    if (reducedMotion) {
      mailman.position.x = 5;
      rightArmGroup.rotation.z = -0.6;
      hatGroup.rotation.z = -0.5;
      mailman.visible = false;
      return;
    }
    if (t < TIMING.walkDuration) {
      const p = t / TIMING.walkDuration;
      mailman.position.x = -5 + p * 10;
      const ls = Math.sin(p * Math.PI * 4) * 0.3;
      leftLegGroup.rotation.z = ls;
      rightLegGroup.rotation.z = -ls;
      const as = Math.sin(p * Math.PI * 4) * 0.4;
      rightArmGroup.rotation.z = as - 0.3;
      leftArm.rotation.z = -as + Math.PI / 6;
    } else if (t < TIMING.totalDuration) {
      mailman.position.x = 5;
      const dp = (t - TIMING.walkDuration) / TIMING.deliveryDuration;
      rightArmGroup.rotation.z = -Math.min(dp * 1.5, 1) * 0.6;
      if (dp > TIMING.hatTipStart) {
        hatGroup.rotation.z = Math.min((dp - TIMING.hatTipStart) / 0.5, 1) * -0.5;
      }
    } else {
      // Fade out phase
      const fadeProgress = Math.min(
        (t - TIMING.totalDuration) / TIMING.fadeOutDuration,
        1,
      );
      mailman.traverse((obj: any) => {
        if (obj.material) {
          obj.material.transparent = true;
          obj.material.opacity = 1 - fadeProgress;
          obj.material.needsUpdate = true;
        }
      });
      if (fadeProgress >= 1) {
        mailman.visible = false;
      }
    }
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    update(animTime);
    animTime += 0.016;
    renderer.render(scene, camera);

    // Stop loop after fade-out completes
    if (animTime > TIMING.totalDuration + TIMING.fadeOutDuration) {
      cancelAnimationFrame(rafId);
    }
  }

  loop();

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);

  return function dispose() {
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", onResize);
    scene.traverse((obj: any) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose());
        else obj.material.dispose();
      }
    });
    renderer.dispose();
  };
}

/**
 * MailmanScene - Client-only Three.js 3D mailman component.
 *
 * Animation timeline (plays once):
 *   0–2.2s   Walking phase: mailman moves from x=-5 to x=5 with leg/arm swing
 *   2.2–3.0s Delivery phase: arm raises, hat tips
 *   3.0–3.5s Fade out: mailman fades to invisible, then rAF stops
 *
 * SSR-safe: canvas only renders after client hydration.
 * Respects prefers-reduced-motion.
 */
export function MailmanScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mounted, setMounted] = useState(false);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotion.current = mq.matches;
    const onChange = (e: MediaQueryListEvent) => { prefersReducedMotion.current = e.matches; };
    mq.addEventListener("change", onChange);
    setMounted(true);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!mounted || !canvasRef.current) return;

    let cleanup: (() => void) | null = null;

    loadThreeJS().then((THREE) => {
      if (!THREE || !canvasRef.current) return;
      cleanup = createMailmanScene(THREE, canvasRef.current, prefersReducedMotion.current);
    });

    return () => { cleanup?.(); };
  }, [mounted]);

  return (
    <canvas
      ref={canvasRef}
      id="mailman-canvas"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
