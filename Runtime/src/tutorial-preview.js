const guides = {
  hub: ['도시', '도시는 하루의 준비를 하는 중심 화면입니다.', ['의뢰를 받고 경매품 정보를 확인한 뒤 경매에 참가하세요.', '주점·거래소·상회·조합에서 보유 자산과 다음 행동을 준비할 수 있습니다.']],
  quests: ['의뢰소', '조건에 맞는 물품을 제출하면 추가 보상을 받습니다.', ['의뢰는 여러 개 수주할 수 있으며 각각 마감일이 있습니다.', '수주한 의뢰를 눌러 조건과 보상을 다시 확인할 수 있습니다.']],
  catalog: ['경매 책자', '오늘 출품되는 경매품 8개를 미리 확인합니다.', ['물품의 이름·등급·계열·기준가를 살펴보세요.', '준비가 끝나면 하단의 경매 시작 버튼을 누르세요.']],
  auction: ['경매 진행', '제한 시간 안에 호가하거나 패스합니다.', ['5%·10%·20% 호가와 직접 입력을 사용할 수 있습니다.', '다른 참가자가 호가하면 타이머가 3초 늘어납니다.']],
  exchange: ['거래소', '보유 물품을 선택해 현재 시세로 판매합니다.', ['같은 계열이나 여러 계열을 조합하면 세트 보너스를 받을 수 있습니다.', '금색으로 표시된 조건 하나만 최종 판매 배수에 적용됩니다.']],
  tavern: ['주점', '상인과 정보상에게 다음 경매 정보를 얻습니다.', ['상회 단계가 높을수록 더 많은 경쟁자·경매품·시세 정보가 공개됩니다.', '정보는 경매 전에 구매 계획을 세우는 데 활용하세요.']],
  shop: ['상회', '보관칸과 정보 공개 범위를 확장하는 성장 시설입니다.', ['완료 의뢰 수와 승급 비용 조건을 만족하면 승급할 수 있습니다.', '단계가 오르면 보관칸과 경매 정보가 늘어납니다.']],
  guild: ['조합', '보유 물품을 담보로 자금을 빌릴 수 있습니다.', ['담보 대출은 상회 2단계부터 이용할 수 있습니다.', '담보 물품은 상환 전까지 판매·감정·의뢰 제출이 제한됩니다.']],
  museum: ['유물 전시관', '획득한 유물과 영구 수집 효과를 확인합니다.', ['유물은 마지막 날의 특별 경매에서 획득할 수 있습니다.', '수집 기록은 새 여정을 시작해도 유지됩니다.']],
  settlement: ['하루 결산', '오늘의 낙찰 결과와 자금 변화를 정리합니다.', ['획득 물품, 총 지출, 현재 자산과 대출 상태를 확인하세요.', '다음 날로 진행하면 새로운 의뢰와 경매가 준비됩니다.']],
};

const dialog = document.createElement('dialog');
dialog.id = 'feature-guide-dialog';
dialog.innerHTML = '<small>GAME GUIDE</small><h2></h2><p class="guide-lead"></p><ul></ul><div><button type="button" class="guide-close">확인</button></div>';
document.body.append(dialog);

const helpButton = document.createElement('button');
helpButton.id = 'feature-guide-open';
helpButton.type = 'button';
helpButton.textContent = '도움말';
document.body.append(helpButton);

let currentScene = '';
const seenKey = 'unknown-auction:feature-guides';
const loadSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(seenKey) || '[]')); } catch { return new Set(); } };
const saveSeen = (seen) => localStorage.setItem(seenKey, JSON.stringify([...seen]));

function visibleScene() {
  return document.querySelector('.scene:not([hidden])')?.dataset.scene || '';
}

function showGuide(scene, force = false) {
  const guide = guides[scene];
  if (!guide || dialog.open) return;
  const seen = loadSeen();
  if (!force && seen.has(scene)) return;
  const [title, lead, bullets] = guide;
  dialog.querySelector('h2').textContent = title;
  dialog.querySelector('.guide-lead').textContent = lead;
  dialog.querySelector('ul').innerHTML = bullets.map((item) => `<li>${item}</li>`).join('');
  seen.add(scene);
  saveSeen(seen);
  dialog.showModal();
}

dialog.querySelector('.guide-close').onclick = () => dialog.close();
helpButton.onclick = () => showGuide(visibleScene(), true);

const observer = new MutationObserver(() => {
  const scene = visibleScene();
  if (!scene || scene === currentScene) return;
  currentScene = scene;
  window.setTimeout(() => showGuide(scene), 120);
});
observer.observe(document.querySelector('#app'), { attributes: true, subtree: true, attributeFilter: ['hidden'] });
window.setTimeout(() => { currentScene = visibleScene(); showGuide(currentScene); }, 300);
