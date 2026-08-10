import fs from 'node:fs';
import path from 'node:path';

const [projectRoot, cleanUiRoot] = process.argv.slice(2);
if (!projectRoot || !cleanUiRoot) throw new Error('Usage: node prepare-clean-ui-vsl.mjs <projectRoot> <cleanUiRoot>');

const definitions = [
  ['clean-button-green','button-green.png','shared/buttons/clean-button-green.png','button',32,52,32,52],
  ['clean-button-dark','button-dark.png','shared/buttons/clean-button-dark.png','button',32,52,32,52],
  ['clean-button-parchment','button-parchment.png','shared/buttons/clean-button-parchment.png','button',32,52,32,52],
  ['clean-button-red','button-red.png','shared/buttons/clean-button-red.png','button',32,52,32,52],
  ['clean-button-purple','button-purple.png','shared/buttons/clean-button-purple.png','button',32,52,32,52],
  ['clean-save-slot-frame','save-slot-frame.png','shared/frames/clean-save-slot-frame.png','frame',24,28,24,28]
];

for (const [id, file, relative, role] of definitions) {
  const from = path.join(cleanUiRoot, role === 'frame' ? 'slots' : 'buttons', file);
  const to = path.join(projectRoot, ...relative.split('/'));
  fs.mkdirSync(path.dirname(to), {recursive:true});
  fs.copyFileSync(from, to);
}

const iconFiles = fs.readdirSync(path.join(cleanUiRoot, 'icons')).filter(name => name.endsWith('.svg'));
for (const icon of iconFiles) {
  const to = path.join(projectRoot, 'shared', 'icons', icon);
  fs.mkdirSync(path.dirname(to), {recursive:true});
  fs.copyFileSync(path.join(cleanUiRoot, 'icons', icon), to);
}

const layoutPath = path.join(projectRoot, 'layout.json');
const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
layout.assets = Array.isArray(layout.assets) ? layout.assets : [];
const generated = definitions.map(([id,name,assetPath,role,top,right,bottom,left]) => ({
  id, name, path:assetPath, mimeType:'image/png', ownerType:'shared', ownerId:'', role,
  nineSlice:{enabled:true,top,right,bottom,left,repeat:'stretch'}
}));
const generatedIcons = iconFiles.map(name => ({
  id:`clean-icon-${path.basename(name,'.svg')}`, name,
  path:`shared/icons/${name}`, mimeType:'image/svg+xml', ownerType:'shared', ownerId:'', role:'icon',
  nineSlice:{enabled:false,top:0,right:0,bottom:0,left:0,repeat:'stretch'}
}));
const generatedAssets = [...generated, ...generatedIcons];
layout.assets = [...layout.assets.filter(asset => !generatedAssets.some(item => item.id === asset.id)), ...generatedAssets];
if (!String(layout.projectTitle || '').includes('Clean UI 편집본')) {
  layout.projectTitle = `${layout.projectTitle || '미지의 경매장'} · Clean UI 편집본`;
}
fs.writeFileSync(layoutPath, `${JSON.stringify(layout,null,2)}\n`, 'utf8');

const nineSlice = {
  schemaVersion:'1.0', projectId:layout.projectId || '', source:'Clean UI VSL v1',
  assets:generated.map(asset => ({id:asset.id,path:asset.path,role:asset.role,...asset.nineSlice}))
};
fs.writeFileSync(path.join(projectRoot,'ui-nine-slice.json'), `${JSON.stringify(nineSlice,null,2)}\n`, 'utf8');

const guide = `# Clean UI VSL 편집본\n\n에셋 보관함의 공용 폴더에 버튼 5종과 저장 슬롯 프레임이 등록되어 있습니다.\n\n- 버튼: 9-Slice 32 / 52 / 32 / 52\n- 저장 슬롯: 9-Slice 24 / 28 / 24 / 28\n- 텍스트와 수치는 이미지에 포함하지 않고 VSL 레이아웃 요소로 올립니다.\n- 원본 V6.4 씬 15개와 UI 상태 18개를 유지했습니다.\n\nVSL에서 이 폴더 또는 ZIP의 프로젝트를 열어 배치와 문구를 수정하세요.\n`;
fs.writeFileSync(path.join(projectRoot,'CLEAN-UI-VSL-README.md'), guide, 'utf8');

console.log(JSON.stringify({projectRoot, frames:generated.length, icons:generatedIcons.length, totalAssets:layout.assets.length}, null, 2));
