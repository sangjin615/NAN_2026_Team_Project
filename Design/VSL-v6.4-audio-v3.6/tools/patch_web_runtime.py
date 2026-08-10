#!/usr/bin/env python3
"""Patch the single-file V5 greybox into the V6.4 sound-enabled web build."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "index.html"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    preview = re.search(pattern, text, flags=re.S)
    if preview:
        print(f"PATCH {label}: {preview.start()}..{preview.end()} ({preview.end()-preview.start()} chars)")
    result, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=re.S)
    if count != 1:
        marker = text.find("function renderOffice")
        print(f"DEBUG {label}: search={bool(re.search(pattern, text, flags=re.S))} marker={marker} sample={text[marker:marker+80]!r} pattern={pattern!r}")
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return result


def main() -> None:
    text = HTML.read_text(encoding="utf-8")
    text = text.replace("미지의 경매장 V5", "미지의 경매장 V6")
    text = text.replace("점핑 비드는 V5에서 삭제되어 없습니다.", "최소 인상폭은 현재 호가의 10%입니다.")

    text = replace_once(
        text,
        "<script>\n'use strict';",
        '<script src="assets/runtime/audio/sound-runtime.js"></script>\n'
        '<script src="assets/runtime/audio/audio-manager.js"></script>\n'
        "<script>\n'use strict';",
        "audio script tags",
    )

    text = regex_once(
        text,
        r"const CFG=\{.*?\};",
        "const CFG={DAYS:12,LOTS:8,START_CASH:20000,GROWTH:1,UPGRADE_COST:[0,7500,12000,17500],UPGRADE_QUESTS:[0,1,2,3],STORAGE:[0,3,4,5,6],FEES:[0,.05,.03,.01,0],INFO_DISCOUNT:[0,.10,.20,.30,.40],SET_BONUS:[0,.10,.20,.30,.40],QUEST_BONUS:[0,.10,.20,.30,.40],APPRAISAL_RATE:{precise:.09},INFO_RATE:{catalog:.007,competitors:.008,forecast:.004},LOAN_LIMIT:.45,LOAN_REPAY_MULTIPLIER:1.90,SAVE_PREFIX:'UNKNOWN_AUCTION_V6_SLOT_',META_KEY:'UNKNOWN_AUCTION_V6_META',SETTINGS_KEY:'UNKNOWN_AUCTION_V6_SETTINGS'};",
        "V6 config",
    )

    text = regex_once(
        text,
        r"const CONTRACTS=\[.*?\];",
        "const HANBOS=[\n"
        "{id:'pair',name:'페어',mult:1.2,need:2,desc:'같은 계열 2점'},\n"
        "{id:'fullhouse',name:'풀하우스',mult:1.4,need:6,desc:'6계열 각 1점'},\n"
        "{id:'align',name:'정렬',mult:1.6,need:2,desc:'같은 계열·같은 등급 2점'},\n"
        "{id:'triple',name:'트리플',mult:1.8,need:3,desc:'같은 계열 3점'},\n"
        "{id:'royal',name:'로열',mult:2.4,need:3,desc:'같은 계열 3점, 전부 에픽 이상'},\n"
        "{id:'straight',name:'스트레이트',mult:2.6,need:3,desc:'같은 계열·서로 다른 등급 3점'}\n"
        "];",
        "hanbo definitions",
    )

    text = regex_once(
        text,
        r"function loadSettings\(\)\{.*?\}\nfunction saveSettings",
        "function loadSettings(){try{return Object.assign({contrast:false,textScale:100,qa:false,tutorial:true,masterVolume:80,bgmVolume:65,sfxVolume:85},JSON.parse(localStorage.getItem(CFG.SETTINGS_KEY))||{})}catch{return{contrast:false,textScale:100,qa:false,tutorial:true,masterVolume:80,bgmVolume:65,sfxVolume:85}}}\nfunction saveSettings",
        "settings defaults",
    )
    text = replace_once(
        text,
        "function applySettings(){document.body.classList.toggle('high-contrast',!!settings.contrast);document.documentElement.style.fontSize=`${settings.textScale}%`}",
        "function applySettings(){document.body.classList.toggle('high-contrast',!!settings.contrast);document.documentElement.style.fontSize=`${settings.textScale}%`;Sound.setVolumes({master:settings.masterVolume/100,bgm:settings.bgmVolume/100,sfx:settings.sfxVolume/100})}",
        "apply sound volumes",
    )

    text = text.replace("start=Math.round(start*1.4)", "start=Math.round(start*1.1)")
    text = text.replace("version:4", "version:6")
    text = text.replace("contracts:[],", "")
    text = text.replace("relicClues:[],", "")
    text = text.replace("meta.relics.includes('merchant-safe')?.6:.4", "meta.relics.includes('merchant-safe')?.45:.4")

    text = regex_once(
        text,
        r"function makeDaily\(\).*?(?=function startDay)",
        "function makeDaily(){const ev=state.marketSchedule[state.day-1];state.market[ev.family]=Number(clamp(state.market[ev.family]+ev.delta,.6,1.6).toFixed(2));const lots=makeLots(state.day);const questCount=hasRelic('royal-charter')?5:3;const qoffers=shuffle(QUESTS).slice(0,questCount).map(q=>({...q,targetFamily:pick(FAMILIES)[0],targetBot:state.day===1?'drifter-a':'bennett'}));state.startDayCash=state.cash;state.daily={phase:'city',lots,lotIndex:0,questOffers:qoffers,acceptedQuests:[],appraisals:{},appraisalOfferIds:shuffle(lots).slice(0,4).map(x=>x.id),info:{forecast:false,catalog:false,competitors:false},auctionResults:[],expense:0,income:0,logs:[],event:ev,freeForecastUsed:false,botSpend:{},settlement:false};state.daily.bots=makeBots();if(hasRelic('compass'))state.daily.info.forecast=true;if(hasRelic('broker-card'))state.daily.info.catalog=true;state.scene='city';saveState();render();if(settings.tutorial&&state.day===1&&!state.settingsSeen)showTutorial()}\n",
        "daily V6 state",
    )

    text = regex_once(
        text,
        r"function renderOffice\(tab='quests'\).*?(?=function acceptQuest)",
        "function renderOffice(tab='quests'){const d=state.daily;const lots=d.lots.filter(l=>d.appraisalOfferIds.includes(l.id));document.getElementById('app').innerHTML=`<section class=\"scene office-scene\">${topbar()}<div class=\"screen\"><div class=\"scene-head\"><div><h1>의뢰소</h1><p>이번 경매의 규칙을 바꾸는 의뢰를 수주하고, 출품 후보의 품질을 정밀 감정합니다.</p></div><button onclick=\"Game.goCity()\">도시로</button></div><div class=\"tabs\"><button class=\"${tab==='quests'?'active':''}\" onclick=\"Game.renderOffice('quests')\">의뢰</button><button class=\"${tab==='appraisal'?'active':''}\" onclick=\"Game.renderOffice('appraisal')\">감정</button></div>${tab==='quests'?`<div class=\"grid three\">${d.questOffers.map(q=>{const accepted=d.acceptedQuests.includes(q.id);const fee=round100(q.fee*scale());return `<article class=\"panel\"><h3>${q.name} 의뢰</h3><p>${q.id==='designated'?`${family(q.targetFamily)[1]} 계열 1점 낙찰`:q.id==='block'?`${q.targetBot==='bennett'?'베넷':'떠돌이 상인'}이 기준액 이상 지출`:q.desc}</p><div class=\"row between\"><span>수주비 <b class=\"money\">${money(fee)}</b></span><span>기본 보상 <b class=\"good\">${money(round100(q.reward*scale()*questBonus()))}</b></span></div><button class=\"primary\" ${accepted||state.cash<fee?'disabled':''} onclick=\"Game.acceptQuest('${q.id}')\">${accepted?'수주 완료':'수주'}</button></article>`}).join('')}</div>`:`<div class=\"item-list\">${lots.map(l=>{const a=d.appraisals[l.id];const cost=round100(l.basePrice*CFG.APPRAISAL_RATE.precise*infoDiscount());return `<article class=\"item\"><div class=\"row\"><div style=\"font-size:2rem\">${family(l.family)[2]}</div><div class=\"grow\"><h3>${l.name}</h3><p>${family(l.family)[1]} · <span class=\"grade ${grade(l.grade).cls}\">${grade(l.grade).label}</span> · 기준가 ${money(l.basePrice)}</p>${a?`<p class=\"good\">감정 결과: 품질 ${a.low.toFixed(2)} ~ ${a.high.toFixed(2)}</p>`:'<p class=\"muted\">품질 비공개</p>'}</div><button ${a?'disabled':''} onclick=\"Game.appraise('${l.id}')\">정밀 감정 ${money(cost)}</button></div></article>`}).join('')}</div>`}</div></section>`}\n",
        "office appraisal UI",
    )
    text = regex_once(
        text,
        r"function appraise\(id,type\).*?(?=function infoCost)",
        "function appraise(id){const l=state.daily.lots.find(x=>x.id===id);if(!l)return;const cost=round100(l.basePrice*CFG.APPRAISAL_RATE.precise*infoDiscount());if(state.cash<cost)return toast('감정 비용이 부족합니다.',true);state.cash-=cost;state.daily.expense+=cost;const precision=appraisalError(state.day);const center=l.quality*(1+rnd(-precision*.45,precision*.45));state.daily.appraisals[id]={type:'precise',low:clamp(center-precision,.35,1.6),high:clamp(center+precision,.35,1.6)};saveState();renderOffice('appraisal');Sound.playAction('act-reveal-appraisal');toast('감정 결과가 도착했습니다.')}\n",
        "precise appraisal",
    )

    text = regex_once(
        text,
        r"function renderTavern\(\).*?(?=function sellableInventory)",
        "function renderTavern(){const d=state.daily;const cards=[\n"
        "{id:'forecast',npc:'항구 서기',name:'수요 동향',cost:infoCost('forecast'),desc:'앞으로 3일의 계열별 사건 방향을 공개한다.'},\n"
        "{id:'catalog',npc:'경매장 기록관',name:'출품 목록',cost:infoCost('catalog'),desc:'오늘 출품 8점의 계열·등급·기준가를 공개한다.'},\n"
        "{id:'competitors',npc:'빚쟁이',name:'경쟁자 예산',cost:infoCost('competitors'),desc:'오늘 경쟁자들의 예산 범위와 관심 계열을 공개한다.'}\n"
        "];document.getElementById('app').innerHTML=`<section class=\"scene tavern-scene\">${topbar()}<div class=\"screen\"><div class=\"scene-head\"><div><h1>술집</h1><p>모든 정보는 거짓이 없는 확정 정보다. 유물 경매 정보는 판매하지 않는다.</p></div><button onclick=\"Game.goCity()\">도시로</button></div><div class=\"grid three\">${cards.map(c=>{const bought=d.info[c.id];return `<article class=\"panel\"><h3>${c.npc}</h3><h2>${c.name}</h2><p>${c.desc}</p><div class=\"money\">${money(c.cost)}</div><button class=\"primary\" ${bought||state.cash<c.cost?'disabled':''} onclick=\"Game.buyInfo('${c.id}',${c.cost})\">${bought?'구매 완료':'구매'}</button></article>`}).join('')}</div><div class=\"panel\" style=\"margin-top:14px\"><h3>확보한 정보</h3>${renderOwnedInfo()}</div></div></section>`}\n"
        "function renderOwnedInfo(){const d=state.daily;const rows=[];if(state.day>=2)rows.push(`<b>숙적 소문</b>: ${nemesisRumor()}`);if(d.info.forecast){const f=state.marketSchedule.slice(state.day,Math.min(12,state.day+3));rows.push(`<b>수요 동향</b>: ${f.map(e=>`${e.day}일차 ${family(e.family)[1]} ${e.delta>0?'상승':'하락'}`).join(' · ')||'남은 예보 없음'}`)}if(d.info.catalog)rows.push(`<b>출품 목록</b>: ${d.lots.map(l=>`${l.name} · ${family(l.family)[1]} · ${grade(l.grade).label} · ${money(l.basePrice)}`).join(' / ')}`);if(d.info.competitors){const bots=d.bots;rows.push(`<b>경쟁자 예산</b>: ${bots.map(b=>`${b.name} ${money(b.cash*.8)}~${money(b.cash*1.05)} · 관심 ${family(b.target)[1]}`).join(' / ')}`)}return rows.length?rows.map(x=>`<p>${x}</p>`).join(''):'<p class=\"muted\">아직 구매한 정보가 없습니다.</p>'}\n"
        "function buyInfo(id,cost){if(state.cash<cost)return toast('자금이 부족합니다.',true);state.cash-=cost;state.daily.expense+=cost;state.daily.info[id]=true;saveState();renderTavern();toast('정보를 구매했습니다.')}\n"
        "",
        "V6 tavern channels",
    )

    text = regex_once(
        text,
        r"function renderExchange\(tab='sell'\)\{.*?(?=function renderMarketTab)",
        "function renderExchange(tab='sell'){document.getElementById('app').innerHTML=`<section class=\"scene exchange-scene\">${topbar()}<div class=\"screen\"><div class=\"scene-head\"><div><h1>거래소${state.daily.settlement?' · 12일차 정산 창':''}</h1><p>낙찰 당일 물품은 다음 날부터 팔 수 있다${state.daily.settlement?' — 정산 창에서는 당일 물품도 가능하다':''}. 족보 판매에는 기한이 없다.</p></div>${state.daily.settlement?'':`<button onclick=\"Game.goCity()\">도시로</button>`}</div><div class=\"tabs\"><button class=\"${tab==='sell'?'active':''}\" onclick=\"Game.renderExchange('sell')\">즉시 처분</button><button class=\"${tab==='hanbo'?'active':''}\" onclick=\"Game.renderExchange('hanbo')\">족보 판매</button><button class=\"${tab==='market'?'active':''}\" onclick=\"Game.renderExchange('market')\">시세판</button></div>${tab==='sell'?renderSellTab():tab==='hanbo'?renderHanboTab():renderMarketTab()}${state.daily.settlement?`<div class=\"panel\" style=\"margin-top:14px\"><button class=\"primary\" onclick=\"Game.finishSettlement()\">정산 종료하고 상회 판정으로</button></div>`:''}</div></section>`}\n"
        "function renderSellTab(){const inv=sellableInventory();return inv.length?`<div class=\"item-list\">${inv.map(x=>`<article class=\"item\"><div class=\"row\"><div style=\"font-size:2rem\">${family(x.family)[2]}</div><div class=\"grow\"><h3>${x.name}</h3><p>${family(x.family)[1]} · <span class=\"grade ${grade(x.grade).cls}\">${grade(x.grade).label}</span> · 취득가 ${money(x.buyPrice)}</p></div><div><div class=\"money\">처분가 ${money(disposalValue(x))}</div><button onclick=\"Game.sellItem('${x.id}')\">즉시 처분</button></div></div></article>`).join('')}</div>`:`<div class=\"empty\">판매 가능한 보유품이 없습니다.</div>`}\n"
        "function renderHanboTab(){return `<div class=\"grid three\">${HANBOS.map(h=>{const combo=findHanboCombo(h);return `<article class=\"panel contract-card\"><h2>${h.name}</h2><p>${h.desc}</p><div class=\"row between\"><b>×${h.mult.toFixed(1)}</b><span>${h.need}점 필요</span></div><button class=\"primary\" ${combo?'':'disabled'} onclick=\"Game.sellHanbo('${h.id}')\">${combo?'족보 판매':'조건 미달'}</button></article>`}).join('')}</div><p class=\"muted\" style=\"margin-top:12px\">기한과 수락 절차가 없으며, 조건이 성립하면 언제든 판매할 수 있습니다.</p>`}\n",
        "V6 exchange tabs",
    )

    text = regex_once(
        text,
        r"function acceptContract\(id\)\{.*?(?=function renderGuild)",
        "function findHanboCombo(def){const inv=sellableInventory();if(def.id==='fullhouse'){const got=[];for(const f of FAMILIES){const x=inv.find(i=>i.family===f[0]&&!got.includes(i));if(!x)return null;got.push(x)}return got}const byFamily=Object.groupBy?Object.groupBy(inv,x=>x.family):inv.reduce((a,x)=>((a[x.family]??=[]).push(x),a),{});for(const arr of Object.values(byFamily)){if(def.id==='pair'&&arr.length>=2)return arr.slice(0,2);if(def.id==='triple'&&arr.length>=3)return arr.slice(0,3);if(def.id==='align'){const grouped={};arr.forEach(x=>(grouped[x.grade]??=[]).push(x));const found=Object.values(grouped).find(x=>x.length>=2);if(found)return found.slice(0,2)}if(def.id==='straight'){const grades=[...new Set(arr.map(x=>x.grade))];if(grades.length>=3)return grades.slice(0,3).map(g=>arr.find(x=>x.grade===g))}if(def.id==='royal'){const hi=arr.filter(x=>['epic','legendary'].includes(x.grade));if(hi.length>=3)return hi.slice(0,3)}}return null}\n"
        "function sellHanbo(id){const def=HANBOS.find(x=>x.id===id);const combo=findHanboCombo(def);if(!def||!combo)return toast('족보 조건을 충족하지 못했습니다.',true);const base=combo.reduce((sum,item)=>sum+disposalValue(item),0);const total=round10(base*def.mult*setBonus());combo.forEach(item=>item.sold=true);state.cash+=total;state.daily.income+=total;modal={type:'hanboResult',title:`${def.name} 족보 판매`,text:`${combo.length}점을 묶어 ${money(total)}를 받았습니다.`,mult:def.mult};saveState();renderExchange('hanbo');renderModal()}\n",
        "hanbo sale logic",
    )

    text = text.replace("const unlocked=state.shopStage>=2", "const unlocked=state.shopStage>=3")
    text = text.replace("'2단계에서 해금'", "'3단계에서 해금'")
    text = text.replace("'지역 상회로 승급하면 이용할 수 있습니다.'", "'유명 상회(3단계)로 승급하면 이용할 수 있습니다.'")
    text = text.replace("<b>3일</b>", "<b>2일</b>")
    text = text.replace("state.day+3", "state.day+2")
    text = text.replace("const canLoan=state.shopStage>=2", "const canLoan=state.shopStage>=3")
    text = text.replace("state.startDayCash*.4", "state.startDayCash*.6")

    text = text.replace("const orderKnown=d.info.order;", "const catalogKnown=d.info.catalog;")
    text = text.replace("<h3>오늘 순서</h3><p>${orderKnown?d.lots.map((x,i)=>`${i+1}. ${x.name}`).join('<br>'):'구매하지 않음'}</p>", "<h3>출품 목록</h3><p>${catalogKnown?d.lots.map(x=>`${x.name} · ${family(x.family)[1]} · ${grade(x.grade).label} · ${money(x.basePrice)}`).join('<br>'):'구매하지 않음'}</p>")
    text = regex_once(
        text,
        r"<div class=\"panel\"><h2>구매한 유물 정보</h2>\$\{state\.relicClues\.length\?state\.relicClues\.map\(x=>`<p>\$\{x\.text\}</p>`\)\.join\(''\):'<p class=\"muted\">정보 없음</p>'\}</div>",
        "",
        "remove relic clue panel",
    )

    text = replace_once(
        text,
        "function toast(msg,bad=false){const d=document.createElement('div');d.className='toast'+(bad?' bad':'');d.textContent=msg;document.getElementById('toast-root').append(d);setTimeout(()=>d.remove(),2800)}",
        "function toast(msg,bad=false){Sound.onToast(bad);const d=document.createElement('div');d.className='toast'+(bad?' bad':'');d.textContent=msg;document.getElementById('toast-root').append(d);setTimeout(()=>d.remove(),2800)}",
        "toast cue",
    )

    text = replace_once(
        text,
        "function render(){applySettings();if(!state){renderTitle();return}switch(state.scene){case'title':renderTitle();break;case'continue':renderContinue();break;case'loading':renderLoading();break;case'city':renderCity();break;case'office':renderOffice();break;case'tavern':renderTavern();break;case'exchange':renderExchange();break;case'guild':renderGuild();break;case'merchant':renderMerchant();break;case'museum':renderMuseum();break;case'auction':renderAuction();break;case'summary':renderSummary();break;case'ending':renderEnding();break;case'final':renderFinalAuction();break;case'result':renderResult();break;default:renderTitle()}renderModal();renderQA()}",
        "function render(){applySettings();if(!state){renderTitle();return}switch(state.scene){case'title':renderTitle();break;case'continue':renderContinue();break;case'loading':renderLoading();break;case'city':renderCity();break;case'office':renderOffice();break;case'tavern':renderTavern();break;case'exchange':renderExchange();break;case'guild':renderGuild();break;case'merchant':renderMerchant();break;case'museum':renderMuseum();break;case'auction':renderAuction();break;case'summary':renderSummary();break;case'ending':renderEnding();break;case'final':renderFinalAuction();break;case'result':renderResult();break;default:renderTitle()}renderModal();renderQA();Sound.setScene(`scene-${state.scene}`,state)}",
        "scene audio hook",
    )
    text = regex_once(
        text,
        r"function renderTitle\(\)\{(.*?)\}\n(?=function openContinue)",
        "function renderTitle(){state=state&&state.scene==='title'?state:null;document.getElementById('app').innerHTML=`<section class=\"scene title-scene\"><button class=\"image-button corner-settings\" onclick=\"Game.openSettings()\"><img src=\"assets/runtime/ui/icons/settings.png\" alt=\"설정\"></button><div class=\"title-menu\"><button class=\"image-button\" onclick=\"Game.newRun(1)\"><img src=\"assets/runtime/ui/buttons/new-game.png\" alt=\"새 게임\"></button><button class=\"image-button\" onclick=\"Game.openContinue()\"><img src=\"assets/runtime/ui/buttons/continue.png\" alt=\"이어하기\"></button><button class=\"image-button\" onclick=\"Game.openMuseumFromTitle()\"><img src=\"assets/runtime/ui/buttons/museum.png\" alt=\"유물 전시관\"></button><button class=\"image-button\" onclick=\"Game.exitGame()\"><img src=\"assets/runtime/ui/buttons/exit.png\" alt=\"게임 종료\"></button></div></section>`;Sound.setScene('scene-title',null)}\n",
        "title scene audio",
    )

    text = regex_once(
        text,
        r"function renderModal\(\)\{.*?\}\n(?=function renderQA)",
        "function renderModal(){const root=document.getElementById('modal-root');if(!modal){root.innerHTML='';Sound.onModal(null);return}let inner='';if(modal.type==='confirm'){inner=`<h1>${esc(modal.title)}</h1><p>${esc(modal.text)}</p><div class=\"modal-actions\"><button onclick=\"Game.closeModal()\">취소</button><button class=\"danger\" id=\"confirmBtn\">확인</button></div>`}if(modal.type==='settings'){inner=`<h1>설정</h1><div class=\"item-list\"><label class=\"row between\"><span>마스터 음량</span><input id=\"setMasterVolume\" type=\"range\" min=\"0\" max=\"100\" value=\"${settings.masterVolume}\"></label><label class=\"row between\"><span>BGM 음량</span><input id=\"setBgmVolume\" type=\"range\" min=\"0\" max=\"100\" value=\"${settings.bgmVolume}\"></label><label class=\"row between\"><span>SFX 음량</span><input id=\"setSfxVolume\" type=\"range\" min=\"0\" max=\"100\" value=\"${settings.sfxVolume}\"></label><label class=\"row between\"><span>고대비</span><input id=\"setContrast\" type=\"checkbox\" ${settings.contrast?'checked':''}></label><label class=\"row between\"><span>텍스트 크기</span><input id=\"setScale\" type=\"range\" min=\"85\" max=\"125\" value=\"${settings.textScale}\"></label><label class=\"row between\"><span>QA 빠른 진행</span><input id=\"setQa\" type=\"checkbox\" ${settings.qa?'checked':''}></label><label class=\"row between\"><span>첫날 튜토리얼</span><input id=\"setTutorial\" type=\"checkbox\" ${settings.tutorial?'checked':''}></label></div><div class=\"modal-actions\"><button onclick=\"Game.closeModal()\">취소</button><button class=\"primary\" onclick=\"Game.applySettingsModal()\">적용</button></div>`}if(modal.type==='lotResult'){const r=modal.result;inner=`<h1>출품 결과</h1><h2 class=\"${r.winner==='player'?'good':''}\">${r.winner==='player'?'플레이어 낙찰':r.winner==='유찰'?'유찰':`${r.winner} 낙찰`}</h2><p>${r.name} · ${r.price?money(r.price):'입찰 없음'}</p>${r.fee?`<p>낙찰 수수료 ${money(r.fee)}</p>`:''}<div class=\"modal-actions\"><button class=\"primary\" onclick=\"Game.nextLot()\">확인</button></div>`}if(modal.type==='hanboResult'){inner=`<h1>${esc(modal.title)}</h1><p>${esc(modal.text)}</p><p>기본 배수 ×${modal.mult.toFixed(1)} · 상회 단계 보정 적용</p><div class=\"modal-actions\"><button class=\"primary\" onclick=\"Game.closeModal()\">확인</button></div>`}if(modal.type==='finalResult'){inner=`<h1>${esc(modal.title)}</h1><p>${esc(modal.text)}</p><div class=\"modal-actions\"><button class=\"primary\" onclick=\"Game.nextFinalRound()\">다음 라운드</button></div>`}root.innerHTML=`<div class=\"modal-backdrop\"><div class=\"modal ${modal.type==='settings'?'large':''}\">${inner}</div></div>`;Sound.onModal(modal.type);if(modal.type==='confirm')setTimeout(()=>{const b=document.getElementById('confirmBtn');if(b)b.onclick=()=>{const fn=modal.onConfirm;closeModal();fn()}},0)}\n",
        "settings and modal sound",
    )

    text = text.replace(
        "settings.tutorial=document.getElementById('setTutorial').checked;saveSettings()",
        "settings.tutorial=document.getElementById('setTutorial').checked;settings.masterVolume=Number(document.getElementById('setMasterVolume').value);settings.bgmVolume=Number(document.getElementById('setBgmVolume').value);settings.sfxVolume=Number(document.getElementById('setSfxVolume').value);saveSettings()",
    )
    text = text.replace(
        "renderExchange,sellItem,acceptContract,fulfillContract,takeLoan",
        "renderExchange,sellItem,sellHanbo,takeLoan",
    )
    text = replace_once(
        text,
        "window.Game=Game;applySettings();renderTitle();",
        "window.Game=Game;Sound.bindGame(Game);applySettings();renderTitle();",
        "bind audio manager",
    )

    HTML.write_text(text, encoding="utf-8")
    print(f"patched {HTML}")


if __name__ == "__main__":
    main()
