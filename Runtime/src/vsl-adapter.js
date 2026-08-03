export class VslRuntimeAdapter {
  constructor(root) {
    this.root = root;
    this.contract = null;
  }

  async loadContract(url = './contracts/vsl-map.template.json') {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`VSL contract load failed: ${response.status}`);
    this.contract = await response.json();
    this.applyContractMetadata();
    return this.contract;
  }

  applyContractMetadata() {
    const scenes = this.contract?.scenes || [];
    scenes.forEach(({ runtimeSceneId, vslSceneId, actions = [], dataBindings = [] }) => {
      const scene = this.root.querySelector(`[data-scene="${runtimeSceneId}"]`);
      if (!scene) return;
      scene.dataset.vslScene = vslSceneId;
      actions.forEach(({ selector, vslActionId }) => {
        scene.querySelectorAll(selector).forEach((element) => { element.dataset.vslAction = vslActionId; });
      });
      dataBindings.forEach(({ selector, vslDataPath }) => {
        scene.querySelectorAll(selector).forEach((element) => { element.dataset.vslData = vslDataPath; });
      });
    });
  }

  showScene(sceneId) {
    this.applyContractMetadata();
    this.root.querySelectorAll('[data-scene]').forEach((scene) => { scene.hidden = scene.dataset.scene !== sceneId; });
    this.root.dataset.currentScene = sceneId;
    this.root.dataset.currentVslScene = this.contract?.scenes?.find((scene) => scene.runtimeSceneId === sceneId)?.vslSceneId || '';
  }

  setText(binding, value) {
    this.root.querySelectorAll(`[data-bind="${binding}"]`).forEach((element) => { element.textContent = value; });
  }

  setSprite(binding, source) {
    this.root.querySelectorAll(`[data-sprite="${binding}"]`).forEach((element) => { element.src = source; });
  }

  setEffects(binding, effects) {
    this.root.querySelectorAll(`[data-effects="${binding}"]`).forEach((element) => {
      element.dataset.vfx = effects.join(' ');
      element.className = `sprite-stage ${effects.map((effect) => `vfx-${effect}`).join(' ')}`;
    });
  }
}

export const MockVslAdapter = VslRuntimeAdapter;
