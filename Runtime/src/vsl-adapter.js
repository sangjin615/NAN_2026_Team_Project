export class MockVslAdapter {
  constructor(root) { this.root = root; }
  showScene(sceneId) {
    this.root.querySelectorAll('[data-scene]').forEach((scene) => scene.hidden = scene.dataset.scene !== sceneId);
    this.root.dataset.currentScene = sceneId;
  }
  setText(binding, value) {
    this.root.querySelectorAll(`[data-bind="${binding}"]`).forEach((element) => element.textContent = value);
  }
  setSprite(binding, source) {
    this.root.querySelectorAll(`[data-sprite="${binding}"]`).forEach((element) => element.src = source);
  }
  setEffects(binding, effects) {
    this.root.querySelectorAll(`[data-effects="${binding}"]`).forEach((element) => {
      element.dataset.vfx = effects.join(' ');
      element.className = `sprite-stage ${effects.map((effect) => `vfx-${effect}`).join(' ')}`;
    });
  }
}
