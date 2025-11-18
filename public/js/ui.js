/**
 * ui.js
 * UIの表示切り替え、ローダー、結果表示など、DOM操作全般を担当
 * (ES Module 形式)
 */

// ▼▼▼ ★★★ 修正: helpers.js (ESM) から logger をインポート ★★★ ▼▼▼
import { logger } from './helpers.js';
// ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲

// --- DOM取得 ---
// ▼▼▼ ★★★ 修正: DOM読み込み前に実行されるため、letで宣言のみ ★★★ ▼▼▼
let qs, qsAll;
let phases = {};
let loader, loaderText;
let errorDisplay, errorMessage, errorCloseBtn;
let uploadPreviews = {};
let uploadButtons = {};
let skipInspirationBtn;
let diagnosisResultContainer, bestColorsContainer, makeupContainer, fashionContainer, aiCommentContainer;
let hairstylesContainer, haircolorsContainer;
let generatedImage, generatedImageContainer, refineInput, saveButton;
let prevBtn, nextBtn;
// ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲

// ▼▼▼ ★★★ 修正: DOM要素の取得を関数化し、main.jsから呼び出せるよう export ★★★ ▼▼▼
/**
 * DOM要素セレクタを初期化 (DOMContentLoaded後に呼び出す)
 */
export function initializeUISelectors() {
  qs = (selector) => document.querySelector(selector);
  qsAll = (selector) => document.querySelectorAll(selector);

  phases = {
    1: qs("#phase1"),
    2: qs("#phase2"),
    3: qs("#phase3"),
    4.1: qs("#phase4-loading"),
    4.2: qs("#phase4-result"),
    5: qs("#phase5"),
    6.1: qs("#phase6-loading"),
    6.2: qs("#phase6-result"),
  };

  loader = qs("#loader");
  loaderText = qs("#loader-text");

  errorDisplay = qs("#error-display");
  errorMessage = qs("#error-message");
  errorCloseBtn = qs("#error-close-btn");

  uploadPreviews = {
    front: qs("#preview-front-photo"),
    side: qs("#preview-side-photo"),
    back: qs("#preview-back-photo"),
    frontVideo: qs("#preview-front-video"),
    backVideo: qs("#preview-back-video"),
    inspiration: qs("#preview-inspiration-photo"),
  };
  uploadButtons = {
    front: qs("#upload-front-photo"),
    side: qs("#upload-side-photo"),
    back: qs("#upload-back-photo"),
    frontVideo: qs("#upload-front-video"),
    backVideo: qs("#upload-back-video"),
    inspiration: qs("#upload-inspiration-photo"),
  };
  skipInspirationBtn = qs("#skip-inspiration-photo");

  diagnosisResultContainer = qs("#diagnosis-result-container");
  bestColorsContainer = qs("#best-colors-container");
  makeupContainer = qs("#makeup-container");
  fashionContainer = qs("#fashion-container");
  aiCommentContainer = qs("#ai-comment-container");

  hairstylesContainer = qs("#hairstyles-container");
  haircolorsContainer = qs("#haircolors-container");

  generatedImage = qs("#generated-image");
  generatedImageContainer = qs("#generated-image-container");
  refineInput = qs("#refine-text");
  saveButton = qs("#save-to-gallery-btn");

  prevBtn = qs("#prev-btn");
  nextBtn = qs("#next-btn");

  logger.log("[UI] DOM Selectors Initialized.");
}
// ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲


/**
 * 指定したフェーズを表示し、他を非表示にする
 * @param {number | string} phaseToShow - 表示するフェーズの番号 (e.g., 1, 4.1)
 */
// ▼▼▼ ★★★ 修正: main.js (module) から呼び出せるよう export ★★★ ▼▼▼
export function showPhase(phaseToShow) {
  logger.log(`[UI] Showing Phase: ${phaseToShow}`);
  Object.keys(phases).forEach((phaseKey) => {
    if (phases[phaseKey]) {
      phases[phaseKey].style.display = (phaseKey === String(phaseToShow)) ? "block" : "none";
    }
  });

  // ページネーションボタンの表示制御
  updatePagination(String(phaseToShow));
}

/**
 * ページネーションボタン（次へ・戻る）の表示/非表示を制御
 * @param {string} currentPhase - 現在のフェーズ番号
 */
function updatePagination(currentPhase) {
  // 戻るボタンの制御
  // ▼▼▼ ★★★ 修正: prevBtnがnullでないかチェック (エラー画像: ui.js:53) ★★★ ▼▼▼
  if (prevBtn) {
    if (["1", "4.1", "6.1"].includes(currentPhase)) {
      prevBtn.style.display = "none";
    } else {
      prevBtn.style.display = "inline-block";
    }
  } else if (currentPhase !== "1") {
    // currentPhase 1 以外で prevBtn が null なのはおかしい
    logger.warn(`[UI] updatePagination: prevBtn is null on phase ${currentPhase}`);
  }

  // 次へボタンの制御
  if (nextBtn) {
    if (["4.1", "6.1", "6.2"].includes(currentPhase)) {
      // ローディング中、最終結果画面では「次へ」を非表示
      nextBtn.style.display = "none";
    } else {
      nextBtn.style.display = "inline-block";
    }
  } else {
     logger.warn(`[UI] updatePagination: nextBtn is null`);
  }
  // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
}

/**
 * ローダー（スピナー）の表示/非表示を切り替える
 * @param {boolean} show - 表示するかどうか
 * @param {string} [text=""] - ローダーに表示するテキスト
 */
// ▼▼▼ ★★★ 修正: main.js (module) から呼び出せるよう export ★★★ ▼▼▼
export function toggleLoader(show, text = "") {
  if (!loader || !loaderText) return;
  loader.style.display = show ? "flex" : "none";
  loaderText.textContent = text;
}

/**
 * エラーメッセージを表示する
 * @param {string} message - 表示するエラーメッセージ
 */
// ▼▼▼ ★★★ 修正: main.js (module) から呼び出せるよう export ★★★ ▼▼▼
export function showError(message) {
  logger.error(`[UI Error] ${message}`);
  if (!errorMessage || !errorDisplay) return;
  errorMessage.textContent = message;
  errorDisplay.style.display = "flex";
}

/**
 * エラーメッセージを非表示にする
 */
function hideError() {
  if (!errorDisplay) return;
  errorDisplay.style.display = "none";
}

/**
 * ファイルアップロードのプレビューを更新する (画像・動画共通)
 * @param {string} type - 'front', 'side', 'back', 'frontVideo', 'backVideo', 'inspiration'
 * @param {string} src - 画像/動画のData URLまたはObject URL
 * @param {boolean} isVideo - 動画ファイルかどうか
 */
// ▼▼▼ ★★★ 修正: main.js (module) から呼び出せるよう export ★★★ ▼▼▼
export function updateUploadPreview(type, src, isVideo = false) {
  const previewEl = uploadPreviews[type];
  if (!previewEl) return;

  previewEl.innerHTML = ""; // 既存のプレビューをクリア

  let mediaEl;
  if (isVideo) {
    mediaEl = document.createElement("video");
    mediaEl.controls = true;
    mediaEl.autoplay = false; // 自動再生はオフ
    mediaEl.muted = true;
    mediaEl.playsInline = true;
  } else {
    mediaEl = document.createElement("img");
  }
  mediaEl.src = src;
  previewEl.appendChild(mediaEl);
  previewEl.classList.add("uploaded");

  // 対応するボタンのテキストを変更
  if (uploadButtons[type]) {
    uploadButtons[type].querySelector("span").textContent = "撮り直す";
  }
}

/**
 * フェーズ4.2の診断結果UIを構築する
 * @param {object} result - AIからの診断結果 (result オブジェクト)
 * @param {object} proposal - AIからの提案 (proposal オブジェクト)
 */
// ▼▼▼ ★★★ 修正: main.js (module) から呼び出せるよう export ★★★ ▼▼▼
export function displayDiagnosisResult(result, proposal) {
  if (!diagnosisResultContainer || !bestColorsContainer || !makeupContainer || !aiCommentContainer) {
    logger.error("[UI] Diagnosis result containers not found.");
    return;
  }

  // 1. 診断結果 (result)
  const renderResult = (data) => {
    return Object.entries(data)
      .map(([key, value]) => {
        // キーを日本語に変換 (簡易版)
        const keyMap = {
          nose: "鼻", mouth: "口", eyes: "目", eyebrows: "眉", forehead: "おでこ",
          neckLength: "首の長さ", faceShape: "顔型", bodyLine: "ボディライン",
          shoulderLine: "肩のライン", faceStereoscopy: "顔の立体感", bodyTypeFeature: "体型の特徴",
          baseColor: "ベース", season: "シーズン", brightness: "明度",
          saturation: "彩度", eyeColor: "瞳の色",
          quality: "髪質", curlType: "クセ", damageLevel: "ダメージ", volume: "毛量",
        };
        const title = keyMap[key] || key;
        return `<div class="result-item"><strong>${title}:</strong> <span>${value}</span></div>`;
      })
      .join("");
  };

  diagnosisResultContainer.innerHTML = `
    <div class="result-category">
      <h3><i class="fas fa-user"></i> 顔の特徴</h3>
      ${renderResult(result.face)}
    </div>
    <div class="result-category">
      <h3><i class="fas fa-project-diagram"></i> 骨格</h3>
      ${renderResult(result.skeleton)}
    </div>
    <div class="result-category">
      <h3><i class="fas fa-palette"></i> パーソナルカラー</h3>
      ${renderResult(result.personalColor)}
    </div>
    <div class="result-category">
      <h3><i class="fas fa-wind"></i> 現在の髪の状態</h3>
      ${renderResult(result.hairCondition)}
    </div>
  `;

  // 2. 似合うカラー (proposal.bestColors)
  bestColorsContainer.innerHTML = Object.values(proposal.bestColors)
    .map((color) => `
      <div class="color-chip-wrapper">
        <div class="color-chip" style="background-color: ${color.hex};"></div>
        <span>${color.name}</span>
      </div>
    `)
    .join("");

  // 3. 似合うメイク (proposal.makeup)
  makeupContainer.innerHTML = `
    <div class="makeup-item"><strong>アイシャドウ:</strong> <span>${proposal.makeup.eyeshadow}</span></div>
    <div class="makeup-item"><strong>チーク:</strong> <span>${proposal.makeup.cheek}</span></div>
    <div class="makeup-item"><strong>リップ:</strong> <span>${proposal.makeup.lip}</span></div>
  `;
  
  // 4. 似合うファッション (proposal.fashion) (★新規追加)
  fashionContainer.innerHTML = `
    <div class="fashion-item"><strong>スタイル:</strong> <span>${proposal.fashion.recommendedStyles.join(", ")}</span></div>
    <div class="fashion-item"><strong>アイテム:</strong> <span>${proposal.fashion.recommendedItems.join(", ")}</span></div>
  `;

  // 5. AI総評 (proposal.comment)
  aiCommentContainer.innerHTML = `<p>${proposal.comment.replace(/\n/g, "<br>")}</p>`;
}

/**
 * フェーズ5の提案選択UIを構築する
 * @param {object} proposal - AIからの提案 (proposal オブジェクト)
 * @param {string | null} inspirationImageUrl - ご希望写真のURL (存在する場合)
 */
// ▼▼▼ ★★★ 修正: main.js (module) から呼び出せるよう export ★★★ ▼▼▼
export function displayProposal(proposal, inspirationImageUrl = null) {
  if (!hairstylesContainer || !haircolorsContainer) {
    logger.error("[UI] Proposal containers not found.");
    return;
  }

  // 既存のコンテンツをクリア
  hairstylesContainer.innerHTML = "";
  haircolorsContainer.innerHTML = "";

  // 1. ヘアスタイル提案 (style1, style2)
  Object.entries(proposal.hairstyles).forEach(([key, style]) => {
    const styleCard = `
      <div class="style-card" id="${key}-card" data-style-name="${style.name}" data-style-desc="${style.description}">
        <h3>${style.name}</h3>
        <p>${style.description}</p>
        <div class="selected-indicator"><i class="fas fa-check-circle"></i></div>
      </div>
    `;
    hairstylesContainer.innerHTML += styleCard;
  });

  // 2. ヘアカラー提案 (color1, color2)
  Object.entries(proposal.haircolors).forEach(([key, color]) => {
    const colorCard = `
      <div class="color-card" id="${key}-card" data-color-name="${color.name}" data-color-desc="${color.description}">
        <h3>${color.name}</h3>
        <p>${color.description}</p>
        <div class="selected-indicator"><i class="fas fa-check-circle"></i></div>
      </div>
    `;
    haircolorsContainer.innerHTML += colorCard;
  });

  // ▼▼▼ ★★★ ここから修正 ★★★ ▼▼▼
  // 3. ご希望写真がアップロードされている場合、選択肢として追加
  if (inspirationImageUrl) {
    logger.log("[UI] Inspiration image URL found, adding inspiration cards.");

    // ご希望のヘアスタイル カード
    const inspirationStyleCard = `
      <div class="style-card inspiration-card" id="select-inspiration-style" data-style-name="inspiration_style" data-style-desc="ご希望の写真のスタイル">
        <img src="${inspirationImageUrl}" alt="ご希望の写真" class="inspiration-preview">
        <h3>ご希望のヘアスタイル</h3>
        <p>アップロードした写真を基にします</p>
        <div class="selected-indicator"><i class="fas fa-check-circle"></i></div>
      </div>
    `;
    hairstylesContainer.innerHTML += inspirationStyleCard;

    // ご希望のヘアカラー カード
    const inspirationColorCard = `
      <div class="color-card inspiration-card" id="select-inspiration-color" data-color-name="inspiration_color" data-color-desc="ご希望の写真のカラー">
        <img src="${inspirationImageUrl}" alt="ご希望の写真" class="inspiration-preview">
        <h3>ご希望のヘアカラー</h3>
        <p>アップロードした写真を基にします</p>
        <div class="selected-indicator"><i class="fas fa-check-circle"></i></div>
      </div>
    `;
    haircolorsContainer.innerHTML += inspirationColorCard;
  }
  // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
}

/**
 * フェーズ6.2の生成結果UIを更新する
 * @param {string} base64Data - 生成された画像のBase64データ
 * @param {string} mimeType - 生成された画像のMIMEタイプ
 */
// ▼▼▼ ★★★ 修正: main.js (module) から呼び出せるよう export ★★★ ▼▼▼
export function displayGeneratedImage(base64Data, mimeType) {
  if (!generatedImage || !generatedImageContainer) {
    logger.warn("[UI] displayGeneratedImage: DOM elements not found."); // ★ null チェック強化
    return;
  }

  const dataUrl = `data:${mimeType};base64,${base64Data}`;
  generatedImage.src = dataUrl;
  generatedImageContainer.style.display = "block"; // コンテナを表示
  refineInput.value = ""; // 微調整テキストをクリア
  saveButton.disabled = false; // 保存ボタンを有効化
  logger.log("[UI] Generated image displayed.");
}

// --- UI初期化 ---
// ▼▼▼ ★★★ 修正: export して main.js から呼び出す ★★★ ▼▼▼
export function initializeUI() {
  // エラー表示の閉じるボタン
  if (errorCloseBtn) {
    errorCloseBtn.addEventListener("click", hideError);
  } else {
    logger.warn("[UI] errorCloseBtn not found during initialization.");
  }
  // 初期フェーズを表示
  // ▼▼▼ ★★★ 修正: main.js からキックされるため、ここでは実行しない ★★★ ▼▼▼
  // showPhase(1);
}
// ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲

// ▼▼▼ ★★★ 修正: DOMContentLoaded を待つ必要があるため、即時実行を削除 ★★★ ▼▼▼
// // 初期化実行
// initializeUI();
// ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲