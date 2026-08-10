#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Visual Spec Lite에 사운드 층을 추가한다.

원본을 수정하지 않고 새 파일을 만든다.
    python patch-vsl.py <원본.html> [-o 출력.html]

추가되는 것:
  - 씬별 BGM / 앰비언스 지정 (씬 인스펙터)
  - 핀·영역별 효과음 큐 지정 (기능 표시 편집기)
  - 사운드 보관함 — 로컬 폴더를 연결해 큐마다 실제 파일을 배정하고 미리듣기
  - 내보내기에 자동 포함 (buildExportData가 노드를 스프레드 복사하므로)

sound.json의 큐 목록을 HTML 안에 박아 넣으므로 오프라인에서 그대로 동작한다.
"""
import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent


def build_sound_data():
    s = json.loads((HERE / "sound.json").read_text(encoding="utf-8"))
    cues = [
        {
            "id": c["id"],
            "name": c["name"],
            "group": c["group"],
            "desc": c["desc"],
            "sec": c["durationSec"],
            "loop": bool(c.get("loop")),
            "accent": bool(c.get("accent")),
        }
        for c in s["sfx"]
    ]
    bgm = [
        {
            "id": b["id"],
            "name": b["name"],
            "character": b["character"],
            "layers": [l["id"] for l in (b.get("layers") or [])],
            "slots": (
                ([b["id"] + "__intro"] if b.get("structure", {}).get("intro") else [])
                + [b["id"] + "__" + l["id"] for l in (b.get("layers") or [])]
                + ([] if b.get("layers") else [b["id"] + "__loop"])
            ),
        }
        for b in s["bgm"]
    ]
    groups = {
        "ui": "공용 UI", "entry": "진입·저장", "loading": "여정 생성",
        "city": "도시·거점", "office": "의뢰소", "tavern": "술집",
        "exchange": "거래소", "guild": "조합", "merchant": "상회",
        "auction": "경매 세션", "summary": "하루 결산", "relic": "유물 경매",
        "result": "여정 결과", "meta": "전시관",
    }
    return {
        "version": s["version"],
        "cues": cues,
        "bgm": bgm,
        "groups": groups,
        "sceneBgm": {k: v["bgm"] for k, v in s["sceneBgmMap"].items()},
        "sceneBgmMap": s["sceneBgmMap"],
        "sceneAmbience": s.get("sceneAmbienceMap", {}),
        "actionCue": {k: v for k, v in s["actionSfxMap"].items() if v},
    }


# ---------------------------------------------------------------- JS 블록
JS_CORE = r"""
  /* ===================== 사운드 층 (v5.3) ===================== */
  const SOUND_DATA = __SOUND_DATA__;
  const soundFiles = {};          /* cueId | bgmId -> 파일명 */
  let soundLibrary = {};          /* 파일명(소문자) -> objectURL */
  let soundLibraryNames = [];
  let soundPreviews = [];

  function soundCueById(id) {
    return SOUND_DATA.cues.find(c => c.id === id) || SOUND_DATA.bgm.find(b => b.id === id) || null;
  }

  function soundSlotsForBgm(id) {
    const b = SOUND_DATA.bgm.find(x => x.id === id);
    return b ? (b.slots || (b.layers.length ? b.layers.map(l => b.id + "__" + l) : [b.id + "__loop"])) : [];
  }

  function soundAllSlots() {
    return SOUND_DATA.cues.map(c => c.id).concat(SOUND_DATA.bgm.flatMap(b => soundSlotsForBgm(b.id)));
  }

  function soundPlay(id) {
    const bgm = SOUND_DATA.bgm.find(item => id.startsWith(item.id + "__"));
    const suffix = bgm ? id.slice(bgm.id.length + 2) : "";
    const layerIndex = bgm ? (bgm.layers || []).indexOf(suffix) : -1;
    const ids = layerIndex >= 0
      ? bgm.layers.slice(0, layerIndex + 1).map(layer => bgm.id + "__" + layer)
      : [id];
    const sources = ids.map(slot => {
      const name = soundFiles[slot];
      const url = name && soundLibrary[name.toLowerCase()];
      return name && url ? { slot, name, url } : null;
    }).filter(Boolean);
    if (sources.length !== ids.length) { setStatus("파일이 배정되지 않은 큐입니다: " + ids.find(slot => !soundFiles[slot])); return; }
    soundPreviews.forEach(audio => audio.pause());
    soundPreviews = sources.map(source => {
      const audio = new Audio(source.url);
      audio.volume = sources.length > 1 ? 0.68 : 0.8;
      return audio;
    });
    Promise.all(soundPreviews.map(audio => audio.play())).catch(() =>
      setStatus("재생 실패: " + sources.map(source => source.name).join(" + ")));
  }

  function soundLoadFolder(fileList) {
    Object.values(soundLibrary).forEach(u => URL.revokeObjectURL(u));
    soundLibrary = {}; soundLibraryNames = [];
    Array.from(fileList).forEach(f => {
      if (!/\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(f.name)) return;
      const base = f.name.split(/[\\/]/).pop();
      soundLibrary[base.toLowerCase()] = URL.createObjectURL(f);
      soundLibraryNames.push(base);
    });
    soundLibraryNames.sort((a, b) => a.localeCompare(b));
    soundAutoBind();
    setStatus("오디오 파일 " + soundLibraryNames.length + "개 연결됨");
    renderSoundLibrary();
  }

  /* 파일명이 큐 ID와 같으면 자동 배정한다. sfx-gavel.wav -> sfx-gavel */
  function soundAutoBind() {
    let n = 0;
    const all = soundAllSlots();
    soundLibraryNames.forEach(name => {
      const stem = name.replace(/\.[^.]+$/, "").toLowerCase();
      const hit = all.find(id => id.toLowerCase() === stem);
      if (hit && !soundFiles[hit]) { soundFiles[hit] = name; n++; }
      const m = stem.match(/^(.+?)__(l\d|intro|loop)$/);
      if (m) {
        const b = SOUND_DATA.bgm.find(x => x.id.toLowerCase() === m[1]);
        if (b) {
          /* 선언된 레이어 ID의 대소문자를 따른다. l1 -> L1 */
          const slot = (b.layers || []).find(l => l.toLowerCase() === m[2]) || m[2];
          const key = b.id + "__" + slot;
          if (!soundFiles[key]) { soundFiles[key] = name; n++; }
        }
      }
    });
    if (n) setStatus("큐 " + n + "개 자동 배정됨");
    return n;
  }

  function soundFileSelect(id, current) {
    const opts = ['<option value="">— 미배정 —</option>'].concat(
      soundLibraryNames.map(n =>
        `<option value="${esc(n)}" ${n === current ? "selected" : ""}>${esc(n)}</option>`)
    ).join("");
    return `<select data-sound-file="${esc(id)}">${opts}</select>`;
  }

  function soundCoverage() {
    const all = soundAllSlots();
    const total = all.length;
    const done = all.filter(id => !!soundSource(id)).length;
    return { done, total };
  }

  /* ---- 씬 인스펙터용 ---- */
  function soundSceneControls(node) {
    const s = node.sound || {};
    const bgmOpts = ['<option value="">— 없음 —</option>'].concat(
      SOUND_DATA.bgm.map(b =>
        `<option value="${esc(b.id)}" ${s.bgm === b.id ? "selected" : ""}>${esc(b.name)} (${esc(b.id)})</option>`)
    ).join("");
    const ambOpts = ['<option value="">— 없음 —</option>'].concat(
      SOUND_DATA.cues.filter(c => c.loop).map(c =>
        `<option value="${esc(c.id)}" ${s.ambience === c.id ? "selected" : ""}>${esc(c.name)} (${esc(c.id)})</option>`)
    ).join("");
    const rec = SOUND_DATA.sceneBgm[node.id];
    const recNote = rec && rec !== s.bgm
      ? `<div class="hint">명세 권장: ${esc(rec)} <button type="button" id="i-bgm-apply" class="sound-mini">적용</button></div>` : "";
    return `
      <div class="sound-block">
        <div class="sound-block-title">사운드</div>
        <label>배경음악<select id="i-bgm">${bgmOpts}</select></label>
        ${recNote}
        <label>앰비언스<select id="i-amb">${ambOpts}</select></label>
        <div class="row" style="gap:6px">
          <button type="button" id="i-bgm-play" class="sound-mini">▶ BGM</button>
          <button type="button" id="i-amb-play" class="sound-mini">▶ 앰비언스</button>
        </div>
      </div>`;
  }

  function soundSceneBind(node) {
    const bgm = document.getElementById("i-bgm");
    if (bgm) bgm.addEventListener("change", e => {
      node.sound = node.sound || {}; node.sound.bgm = e.target.value; renderInspector();
    });
    const amb = document.getElementById("i-amb");
    if (amb) amb.addEventListener("change", e => {
      node.sound = node.sound || {}; node.sound.ambience = e.target.value;
    });
    const apply = document.getElementById("i-bgm-apply");
    if (apply) apply.addEventListener("click", () => {
      node.sound = node.sound || {}; node.sound.bgm = SOUND_DATA.sceneBgm[node.id]; renderInspector();
    });
    const bp = document.getElementById("i-bgm-play");
    if (bp) bp.addEventListener("click", () => {
      const id = (node.sound || {}).bgm;
      const slots = soundSlotsForBgm(id);
      const slot = slots.find(key => !key.endsWith("__intro") && (soundFiles[key] || soundHasDefault(key)))
        || slots.find(key => soundFiles[key] || soundHasDefault(key));
      soundPlay(slot || id);
    });
    const ap = document.getElementById("i-amb-play");
    if (ap) ap.addEventListener("click", () => soundPlay((node.sound || {}).ambience));
  }

  /* ---- 핀 편집기용 ---- */
  function soundAnnotationControls(a) {
    const byGroup = {};
    SOUND_DATA.cues.forEach(c => { (byGroup[c.group] = byGroup[c.group] || []).push(c); });
    const opts = ['<option value="">— 없음 —</option>'].concat(
      Object.keys(byGroup).map(g =>
        `<optgroup label="${esc(SOUND_DATA.groups[g] || g)}">` +
        byGroup[g].map(c =>
          `<option value="${esc(c.id)}" ${a.soundCue === c.id ? "selected" : ""}>${esc(c.name)} — ${esc(c.id)}</option>`
        ).join("") + `</optgroup>`)
    ).join("");
    const rec = a.actionRef ? SOUND_DATA.actionCue[a.actionRef] : null;
    const recNote = rec && rec !== a.soundCue
      ? `<div class="hint">${esc(a.actionRef)} 권장: ${esc(rec)} <button type="button" id="a-cue-apply" class="sound-mini">적용</button></div>` : "";
    const cue = soundCueById(a.soundCue);
    const info = cue ? `<div class="hint">${esc(cue.desc)} · ${cue.sec}s${soundFiles[cue.id] ? " · 파일 " + esc(soundFiles[cue.id]) : " · 파일 미배정"}</div>` : "";
    return `
      <div class="sound-block">
        <div class="sound-block-title">효과음</div>
        <label>큐<select id="a-cue">${opts}</select></label>
        ${recNote}${info}
        <button type="button" id="a-cue-play" class="sound-mini">▶ 미리듣기</button>
      </div>`;
  }

  function soundAnnotationBind(node, a) {
    const sel = document.getElementById("a-cue");
    if (sel) sel.addEventListener("change", e => { a.soundCue = e.target.value; renderAnnotationEditor(node); });
    const ap = document.getElementById("a-cue-apply");
    if (ap) ap.addEventListener("click", () => {
      a.soundCue = SOUND_DATA.actionCue[a.actionRef]; renderAnnotationEditor(node);
    });
    const pp = document.getElementById("a-cue-play");
    if (pp) pp.addEventListener("click", () => soundPlay(a.soundCue));
  }

  /* ---- 사운드 보관함 ---- */
  let soundFilterGroup = "all";

  function renderSoundLibrary() {
    const body = document.getElementById("soundList");
    if (!body) return;
    const cov = soundCoverage();
    document.getElementById("soundSummary").innerHTML =
      `큐 ${cov.done} / ${cov.total} 배정 · 폴더 파일 ${soundLibraryNames.length}개`;

    const rows = [];
    rows.push(`<div class="sound-section">배경음악</div>`);
    SOUND_DATA.bgm.forEach(b => {
      const slots = soundSlotsForBgm(b.id);
      slots.forEach(slot => {
        rows.push(`<div class="sound-row">
          <div class="sound-row-main"><strong>${esc(b.name)}</strong> <code>${esc(slot)}</code>
            <div class="hint">${esc(b.character)}</div></div>
          <div class="sound-row-file">${soundFileSelect(slot, soundFiles[slot])}</div>
          <button type="button" class="sound-mini" data-sound-play="${esc(slot)}">▶</button>
        </div>`);
      });
    });

    const byGroup = {};
    SOUND_DATA.cues.forEach(c => { (byGroup[c.group] = byGroup[c.group] || []).push(c); });
    Object.keys(byGroup).forEach(g => {
      if (soundFilterGroup !== "all" && soundFilterGroup !== g) return;
      rows.push(`<div class="sound-section">${esc(SOUND_DATA.groups[g] || g)} (${byGroup[g].length})</div>`);
      byGroup[g].forEach(c => {
        rows.push(`<div class="sound-row${soundFiles[c.id] ? " assigned" : ""}">
          <div class="sound-row-main"><strong>${esc(c.name)}</strong>${c.accent ? ' <span class="sound-accent">★</span>' : ""}
            <code>${esc(c.id)}</code>
            <div class="hint">${esc(c.desc)} · ${c.sec}s${c.loop ? " · loop" : ""}</div></div>
          <div class="sound-row-file">${soundFileSelect(c.id, soundFiles[c.id])}</div>
          <button type="button" class="sound-mini" data-sound-play="${esc(c.id)}">▶</button>
        </div>`);
      });
    });
    body.innerHTML = rows.join("");

    body.querySelectorAll("[data-sound-file]").forEach(sel => {
      sel.addEventListener("change", e => {
        const id = sel.dataset.soundFile;
        if (e.target.value) soundFiles[id] = e.target.value; else delete soundFiles[id];
        renderSoundLibrary();
      });
    });
    body.querySelectorAll("[data-sound-play]").forEach(btn => {
      btn.addEventListener("click", () => soundPlay(btn.dataset.soundPlay));
    });

    const filter = document.getElementById("soundFilter");
    if (filter && !filter.dataset.built) {
      filter.dataset.built = "1";
      filter.innerHTML = ['<option value="all">전체</option>'].concat(
        Object.keys(SOUND_DATA.groups).map(g => `<option value="${g}">${esc(SOUND_DATA.groups[g])}</option>`)
      ).join("");
      filter.addEventListener("change", e => { soundFilterGroup = e.target.value; renderSoundLibrary(); });
    }
  }

  function soundExportManifest() {
    const missing = soundAllSlots().filter(id => !soundFiles[id]);
    return {
      schemaVersion: "sound-binding-1.0",
      generatedBy: "Visual Spec Lite v5.3 sound layer",
      files: { ...soundFiles },
      sceneSound: state.nodes.reduce((acc, n) => {
        if (n.sound && (n.sound.bgm || n.sound.ambience)) acc[n.id] = n.sound;
        return acc;
      }, {}),
      annotationCues: state.nodes.reduce((acc, n) => {
        (n.annotations || []).forEach(a => {
          if (a.soundCue) acc[n.id + "/" + a.id] = { cue: a.soundCue, title: a.title || "", actionRef: a.actionRef || "" };
        });
        return acc;
      }, {}),
      unassignedCues: missing
    };
  }
  /* =================== 사운드 층 끝 =================== */

"""

CSS = """
    .sound-block{border:1px solid #C9C2B4;border-radius:6px;padding:10px;margin:12px 0;background:#FAF8F4}
    .sound-block-title{font-weight:700;font-size:12px;color:#8C6A2F;margin-bottom:8px;letter-spacing:.04em}
    .sound-mini{font-size:11px;padding:3px 8px;border-radius:4px;cursor:pointer}
    .sound-accent{color:#B8860B}
    .sound-section{font-weight:700;font-size:12px;color:#8C6A2F;margin:16px 0 6px;padding-bottom:4px;border-bottom:1px solid #C9C2B4}
    .sound-row{display:flex;align-items:center;gap:10px;padding:6px 8px;border-bottom:1px solid #EFEAE0}
    .sound-row.assigned{background:#F3F7F0}
    .sound-row-main{flex:1;min-width:0;font-size:12px}
    .sound-row-main code{font-size:11px;color:#8C6A2F;background:#F5F3EE;padding:1px 4px;border-radius:3px}
    .sound-row-file select{max-width:260px;font-size:11px}
    .sound-modal-card{background:#fff;border-radius:10px;padding:18px;width:min(1000px,94vw);max-height:88vh;display:flex;flex-direction:column}
    #soundList{overflow:auto;flex:1;margin-top:10px}
"""

MODAL_HTML = """
<div id="soundModal" class="modal" aria-hidden="true">
  <div class="sound-modal-card">
    <div class="row" style="align-items:center;margin-bottom:10px">
      <div><strong>사운드 보관함</strong>
        <div class="hint" id="soundSummary">폴더를 연결하세요.</div></div>
      <div class="spacer"></div>
      <select id="soundFilter" style="margin-right:8px"></select>
      <button id="soundFolderBtn" class="primary">오디오 폴더 연결</button>
      <button id="soundManifestBtn">배정표 내보내기</button>
      <button id="closeSoundModal">닫기</button>
      <input id="soundFolderInput" type="file" accept="audio/*" multiple webkitdirectory directory hidden>
    </div>
    <div class="hint">파일 이름이 큐 ID와 같으면 (예: <code>sfx-gavel.wav</code>) 폴더 연결 시 자동 배정됩니다.
      다른 이름이면 아래에서 직접 고르세요. 배정표를 내보내면 sound.json에 반영할 수 있습니다.</div>
    <div id="soundList"></div>
  </div>
</div>
"""

INIT_JS = """
  document.getElementById("soundLibraryBtn").addEventListener("click", () => {
    renderSoundLibrary();
    const m = document.getElementById("soundModal");
    m.classList.add("open"); m.setAttribute("aria-hidden", "false");
  });
  document.getElementById("closeSoundModal").addEventListener("click", () => {
    const m = document.getElementById("soundModal");
    m.classList.remove("open"); m.setAttribute("aria-hidden", "true");
  });
  document.getElementById("soundFolderBtn").addEventListener("click", () =>
    document.getElementById("soundFolderInput").click());
  document.getElementById("soundFolderInput").addEventListener("change", e => {
    if (e.target.files && e.target.files.length) soundLoadFolder(e.target.files);
    e.target.value = "";
  });
  document.getElementById("soundManifestBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(soundExportManifest(), null, 2)], { type: "application/json" });
    downloadBlob(blob, "sound-binding.json");
    setStatus("sound-binding.json 저장됨");
  });
"""


def patch(src_path, out_path):
    html = pathlib.Path(src_path).read_text(encoding="utf-8")
    orig = len(html)
    steps = []

    def rep(old, new, label, count=1):
        nonlocal html
        if html.count(old) < 1:
            sys.exit("삽입 지점을 찾지 못했습니다: %s" % label)
        html = html.replace(old, new, count)
        steps.append(label)

    # 1) CSS
    rep("</style>", CSS + "  </style>", "CSS")

    # 2) 코어 JS — EDGE_PALETTE 선언 앞
    core = JS_CORE.replace(
        "__SOUND_DATA__", json.dumps(build_sound_data(), ensure_ascii=False)
    )
    rep("  const EDGE_PALETTE =", core + "  const EDGE_PALETTE =", "코어 JS")

    # 3) 씬 인스펙터 UI
    rep(
        '<button id="open-detail" class="primary">목업과 기능 표시 열기</button>`;',
        '${soundSceneControls(node)}\n        '
        '<button id="open-detail" class="primary">목업과 기능 표시 열기</button>`;',
        "씬 인스펙터 UI",
    )
    rep(
        'document.getElementById("open-detail").addEventListener("click", () => openDetail(node.id));',
        'soundSceneBind(node);\n      '
        'document.getElementById("open-detail").addEventListener("click", () => openDetail(node.id));',
        "씬 인스펙터 바인딩",
    )

    # 4) 핀 편집기 UI
    rep(
        '<button id="a-delete" class="danger">이 표시 삭제</button>`;',
        '${soundAnnotationControls(a)}\n      '
        '<button id="a-delete" class="danger">이 표시 삭제</button>`;',
        "핀 편집기 UI",
    )
    rep(
        'document.getElementById("a-title").addEventListener("input", e => { a.title = e.target.value; renderAnnotationList(node); });',
        'soundAnnotationBind(node, a);\n    '
        'document.getElementById("a-title").addEventListener("input", e => { a.title = e.target.value; renderAnnotationList(node); });',
        "핀 편집기 바인딩",
    )

    # 5) 툴바 버튼
    rep(
        '<button id="assetLibraryBtn"',
        '<button id="soundLibraryBtn" title="씬과 기능에 붙일 효과음·배경음을 관리합니다.">사운드 보관함</button>\n    '
        '<button id="assetLibraryBtn"',
        "툴바 버튼",
    )

    # 6) 모달 마크업
    rep('<div id="assetModal"', MODAL_HTML + '\n<div id="assetModal"', "모달 마크업")

    # 7) 초기화 배선
    rep(
        '  document.getElementById("assetLibraryBtn").addEventListener("click"',
        INIT_JS + '  document.getElementById("assetLibraryBtn").addEventListener("click"',
        "초기화 배선",
    )

    # 8) 버전 표기
    rep("v5.2 · Scene Folders", "v5.3 · Sound", "버전 표기")

    pathlib.Path(out_path).write_text(html, encoding="utf-8")
    print("patched %d -> %d bytes (+%d)" % (orig, len(html), len(html) - orig))
    for s in steps:
        print("  ok: %s" % s)
    print("out: %s" % out_path)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("-o", "--out", default=None)
    a = ap.parse_args()
    out = a.out or str(pathlib.Path(a.src).with_name(
        pathlib.Path(a.src).stem + "_sound.html"))
    patch(a.src, out)
