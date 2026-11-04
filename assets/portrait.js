/*
 * Skyke3D
 * Copyright (C) 2026 Noturno-Strange
 * SPDX-License-Identifier: GPL-3.0-only
 *
 * Só para a página /profile (carrega depois de app-avatar.js). `skyPortrait(canvas, cfg)` desenha o rosto do avatar com
 * o mesmo método da foto do Perfil no jogo (assets/app-panels.js, função foto): cabeça de frente, mesma luz e mesma câmera.
 * `cfg` são só índices do catálogo; nenhuma imagem sai do navegador de ninguém.
 */
if (window.SKY_NOGL) throw new Error('Skyke3D: sem WebGL');
{
  // o jogo montou o próprio cenário ao carregar; aqui ele não vai ser usado, então libera a placa de vídeo
  try {
    renderer.dispose();
    if (renderer.forceContextLoss) renderer.forceContextLoss();
    renderer.domElement.remove();
  } catch (e) {
    /* sem problema */
  }
}
window.skyPortrait = function (canvas, cfg) {
  const W = canvas.width,
    x = canvas.getContext('2d');
  x.clearRect(0, 0, W, W);
  let r = null,
    g = null;
  try {
    r = new THREE.WebGLRenderer({
      canvas: document.createElement('canvas'),
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true
    });
    r.setSize(W, W, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 0);
    const sc = new THREE.Scene();
    g = new THREE.Group();
    g.userData = {};
    dress(g, { ...cfg });
    sc.add(g);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x9a8a7a, 1.25 * Math.PI));
    const d = new THREE.DirectionalLight(0xffffff, 0.9 * Math.PI);
    d.position.set(1.5, 3, 4);
    sc.add(d);
    g.updateMatrixWorld(true);
    const p = new THREE.Vector3();
    g.userData.hd.getWorldPosition(p);
    const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
    cam.position.set(p.x, p.y + 0.03, p.z + 1.5);
    cam.lookAt(p.x, p.y, p.z);
    r.render(sc, cam);
    x.drawImage(r.domElement, 0, 0, W, W);
    return true;
  } catch (e) {
    x.font = W * 0.7 + 'px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('🙂', W / 2, W / 2);
    return false;
  } finally {
    if (g) freeAv(g);
    if (r) {
      r.dispose();
      if (r.forceContextLoss) r.forceContextLoss();
    }
  }
};
