const steps = [
  { target: '#open-new-slots', placement: 'top-right', title: '새 여정을 시작하세요', text: '처음 플레이한다면 새 게임을 눌러 저장 슬롯을 선택합니다.', action: true },
  { target: '#new-run', placement: 'top-right', title: '저장 슬롯을 선택하세요', text: '빈 저장 슬롯을 고른 뒤 새 여정을 시작하세요. 진행 상황은 선택한 슬롯에 저장됩니다.', action: true },
  { target: '[data-scene="hub"] [data-place="catalog"]', placement: 'top-center', title: '도시에서 경매장으로', text: '도시는 하루의 준비를 하는 곳입니다. 먼저 오늘의 경매품을 확인하러 가세요.', action: true },
  { target: '#catalog-grid', placement: 'bottom-right', title: '오늘의 경매품 확인', text: '책자에는 오늘 등장할 8개 물품의 이름, 등급, 계열과 기준가가 표시됩니다.' },
  { target: '#start-auction', placement: 'top-center', title: '경매를 시작하세요', text: '준비가 끝났다면 경매 시작을 눌러 첫 물품의 경매에 참가하세요.', action: true },
  { target: '[data-scene="auction"] > header', placement: 'bottom-left', title: '물품 정보를 확인하세요', text: '상단에서 물품 이름과 계열을, 중앙 카드에서 등급과 기준가를 확인할 수 있습니다.' },
  { target: '[data-scene="auction"] > .actions', placement: 'top-center', title: '호가하거나 패스하세요', text: '5%·10%·20% 호가, 직접 입력 또는 패스를 선택할 수 있습니다. 현재 자산을 넘지 않도록 주의하세요.' },
];

const card = document.createElement('aside');
card.id = 'tutorial-card';
card.setAttribute('role', 'dialog');
card.setAttribute('aria-label', '초보자 안내');
document.body.append(card);

const replay = document.createElement('button');
replay.id = 'tutorial-replay';
replay.type = 'button';
replay.textContent = '튜토리얼 다시 보기';
document.body.append(replay);

let index = 0;
let focused = null;
let observer = null;
let actionHandler = null;

const isVisible = (element) => element && !element.closest('[hidden]') && element.getClientRects().length > 0;

function clearFocus() {
  if (focused) focused.classList.remove('tutorial-focus');
  if (focused && actionHandler) focused.removeEventListener('click', actionHandler);
  focused = null;
  actionHandler = null;
}

function finish() {
  clearFocus();
  observer?.disconnect();
  card.hidden = true;
  replay.hidden = false;
}

function advance() {
  clearFocus();
  index += 1;
  if (index >= steps.length) return finish();
  showCurrentStep();
}

function renderCard(step) {
  card.dataset.placement = step.placement || 'bottom-center';
  card.hidden = false;
  replay.hidden = true;
  card.innerHTML = `<small>초보자 안내 · ${index + 1} / ${steps.length}</small><h2>${step.title}</h2><p>${step.text}</p><div class="tutorial-actions"><button type="button" class="tutorial-skip secondary">건너뛰기</button>${step.action ? '<button type="button" disabled>강조된 버튼을 누르세요</button>' : '<button type="button" class="tutorial-next">다음</button>'}</div>`;
  card.querySelector('.tutorial-skip').onclick = finish;
  card.querySelector('.tutorial-next')?.addEventListener('click', advance);
}

function showCurrentStep() {
  observer?.disconnect();
  const step = steps[index];
  renderCard(step);
  const attach = () => {
    const candidate = document.querySelector(step.target);
    if (!isVisible(candidate)) return false;
    focused = candidate;
    focused.classList.add('tutorial-focus');
    if (step.action) {
      actionHandler = () => window.setTimeout(advance, 60);
      focused.addEventListener('click', actionHandler, { once: true });
    }
    return true;
  };
  if (attach()) return;
  observer = new MutationObserver(() => { if (attach()) observer.disconnect(); });
  observer.observe(document.querySelector('#app'), { attributes: true, childList: true, subtree: true });
}

function startTutorial() {
  clearFocus();
  index = 0;
  showCurrentStep();
}

replay.onclick = startTutorial;
window.setTimeout(startTutorial, 250);
