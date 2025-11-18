import { escapeHtml, createResultItem, setTextContent } from './helpers.js';

/**
 * 指定されたフェーズ（画面）に表示を切り替える
 * ★★★ アップグレード 提案③: フェードアニメーションに対応 ★★★
 * @param {string} phaseId 表示したいフェーズのID ('phase1', 'phase2', etc.)
 */
export function changePhase(phaseId) {
    console.log(`[changePhase] Changing to phase: ${phaseId}`);
    
    // 1. まず、現在表示されている（アクティブな）フェーズを探して、非表示（opacity: 0）にする
    const currentActivePhase = document.querySelector('.phase-container.active');
    if (currentActivePhase) {
        currentActivePhase.classList.remove('active');
    }

    // 2. ターゲットのフェーズを探す
    const targetPhase = document.getElementById(phaseId);
    
    if (targetPhase) {
        // 3. ターゲットを表示（opacity: 1）にする
        // display: block は CSS 側で .active クラスによって制御される
        targetPhase.classList.add('active');
        console.log(`[changePhase] Phase ${phaseId} displayed.`);
        
        // 画面切り替え時に最上部までスクロール
        window.scrollTo(0, 0); 
    } else {
        console.error(`[changePhase] Phase container with id "${phaseId}" not found.`);
        // Fallback to phase1 if target is not found
        const phase1 = document.getElementById('phase1');
        if(phase1) phase1.classList.add('active');
    }
}


/**
 * 診断結果（フェーズ4）をHTMLに描画する
 * @param {object} result - AIの診断結果オブジェクト
 */
export function displayDiagnosisResult(result) {
    // console.log("[displayDiagnosisResult] Displaying diagnosis:", result);
    const faceResultsContainer = document.getElementById('face-results');
    const skeletonResultsContainer = document.getElementById('skeleton-results');
    const personalColorResultsContainer = document.getElementById('personal-color-results');
    // ★★★ アップグレード ステップ1: 髪の状態コンテナを取得 ★★★
    const hairConditionResultsContainer = document.getElementById('hair-condition-results');


    if (faceResultsContainer) faceResultsContainer.innerHTML = ''; else console.warn("[displayDiagnosisResult] faceResultsContainer not found");
    if (skeletonResultsContainer) skeletonResultsContainer.innerHTML = ''; else console.warn("[displayDiagnosisResult] skeletonResultsContainer not found");
    if (personalColorResultsContainer) personalColorResultsContainer.innerHTML = ''; else console.warn("[displayDiagnosisResult] personalColorResultsContainer not found");
    // ★★★ アップグレード ステップ1: 髪の状態コンテナをクリア ★★★
    if (hairConditionResultsContainer) hairConditionResultsContainer.innerHTML = ''; else console.warn("[displayDiagnosisResult] hairConditionResultsContainer not found");


    if (!result) {
        console.warn("[displayDiagnosisResult] No result data to display.");
        return;
    }

    if (result.face && faceResultsContainer) {
        // console.log("[displayDiagnosisResult] Populating face results...");
        const faceMap = { nose: "鼻", mouth: "口", eyes: "目", eyebrows: "眉", forehead: "おでこ" };
        Object.entries(result.face).forEach(([key, value]) => {
            const items = createResultItem(faceMap[key] || key, value);
            faceResultsContainer.append(...items);
        });
    }

    if (result.skeleton && skeletonResultsContainer) {
        // console.log("[displayDiagnosisResult] Populating skeleton results...");
        // ★★★ アップグレード ステップ1: 骨格・ボディの項目を強化版に対応 ★★★
        const skeletonMap = { 
            neckLength: "首の長さ", 
            faceShape: "顔の形", 
            bodyLine: "ボディライン", 
            shoulderLine: "肩のライン",
            // ★ 新規項目
            faceStereoscopy: "顔の立体感", 
            bodyTypeFeature: "体型の特徴" 
        };
        Object.entries(result.skeleton).forEach(([key, value]) => {
            // skeletonMap[key] が存在する場合のみ表示 (古い項目も新しい項目もカバー)
            if (skeletonMap[key]) {
                const items = createResultItem(skeletonMap[key], value);
                skeletonResultsContainer.append(...items);
            }
        });
    }

    if (result.personalColor && personalColorResultsContainer) {
         // console.log("[displayDiagnosisResult] Populating personal color results...");
         const colorMap = { baseColor: "ベースカラー", season: "シーズン", brightness: "明度", saturation: "彩度", eyeColor: "瞳の色" };
         Object.entries(result.personalColor).forEach(([key, value]) => {
             const items = createResultItem(colorMap[key] || key, value);
             personalColorResultsContainer.append(...items);
         });
    }

    // ★★★ アップグレード ステップ1: 「現在の髪の状態」を描画するロジック ★★★
    if (result.hairCondition && hairConditionResultsContainer) {
        // console.log("[displayDiagnosisResult] Populating hair condition results...");
        const hairMap = {
            quality: "髪質",
            curlType: "クセ",
            damageLevel: "ダメージ",
            volume: "毛量"
        };
        Object.entries(result.hairCondition).forEach(([key, value]) => {
            if (hairMap[key]) { // スキーマで定義されたキーのみ表示
                const items = createResultItem(hairMap[key], value);
                hairConditionResultsContainer.append(...items);
            }
        });
    }

     // console.log("[displayDiagnosisResult] Finished displaying results.");
}

/**
 * 提案結果（フェーズ5）をHTMLに描画する
 * @param {object} proposal - AIの提案結果オブジェクト
 * @param {function} onProposalClick - 提案カードがクリックされたときのコールバック関数
 * @param {string | null} inspirationImageUrl - ご希望写真のURL (nullならボタンを非表示)
 */
export function displayProposalResult(proposal, onProposalClick, inspirationImageUrl) {
    // console.log("[displayProposalResult] Displaying proposal:", proposal);
    const hairstyleContainer = document.getElementById('hairstyle-proposal');
    const haircolorContainer = document.getElementById('haircolor-proposal');
    const bestColorsContainer = document.getElementById('best-colors-proposal');
    const makeupContainer = document.getElementById('makeup-proposal');
    // ★★★ アップグレード 提案①: ファッション提案コンテナを取得 ★★★
    const fashionContainer = document.getElementById('fashion-proposal');

    if (hairstyleContainer) hairstyleContainer.innerHTML = ''; else console.warn("[displayProposalResult] hairstyleContainer not found");
    if (haircolorContainer) haircolorContainer.innerHTML = ''; else console.warn("[displayProposalResult] haircolorContainer not found");
    if (bestColorsContainer) bestColorsContainer.innerHTML = ''; else console.warn("[displayDiagnosisResult] bestColorsContainer not found");
    if (makeupContainer) makeupContainer.innerHTML = ''; else console.warn("[displayProposalResult] makeupContainer not found");
    // ★★★ アップグレード 提案①: ファッション提案コンテナをクリア ★★★
    if (fashionContainer) fashionContainer.innerHTML = ''; else console.warn("[displayProposalResult] fashionContainer not found");
    setTextContent('top-stylist-comment-text', '');
    

    if (!proposal) {
        console.warn("[displayProposalResult] No proposal data to display.");
        return;
    }

    if (proposal.hairstyles && hairstyleContainer) {
        // console.log("[displayProposalResult] Populating hairstyles...");
        Object.entries(proposal.hairstyles).forEach(([key, style]) => {
            const card = document.createElement('div');
            card.className = 'proposal-card';
            card.dataset.type = 'hairstyle';
            card.dataset.key = key;
            card.innerHTML = `<strong>${escapeHtml(style.name)}</strong><p>${escapeHtml(style.description)}</p>`;
            card.addEventListener('click', onProposalClick); // 渡されたハンドラを設定
            hairstyleContainer.appendChild(card);
        });
    }

    // ▼▼▼ ★★★ 新規追加: ご希望スタイルカードの表示制御 ★★★ ▼▼▼
    const inspStyleCard = document.getElementById('inspiration-style-card');
    if (inspStyleCard) {
        if (inspirationImageUrl) {
            console.log("[displayProposalResult] Inspiration image found, showing style card.");
            inspStyleCard.style.display = 'block';
            inspStyleCard.addEventListener('click', onProposalClick);
        } else {
            console.log("[displayProposalResult] No inspiration image, hiding style card.");
            inspStyleCard.style.display = 'none';
        }
    }
    // ▲▲▲ ★★★ 追加ここまで ★★★ ▲▲▲

    if (proposal.haircolors && haircolorContainer) {
        // console.log("[displayProposalResult] Populating haircolors...");
        Object.entries(proposal.haircolors).forEach(([key, color]) => {
            const card = document.createElement('div');
            card.className = 'proposal-card';
            card.dataset.type = 'haircolor';
            card.dataset.key = key;
            card.innerHTML = `<strong>${escapeHtml(color.name)}</strong><p>${escapeHtml(color.description)}</p>`;
            card.addEventListener('click', onProposalClick); // 渡されたハンドラを設定
            haircolorContainer.appendChild(card);
        });
    }

    // ▼▼▼ ★★★ 新規追加: ご希望カラーカードの表示制御 ★★★ ▼▼▼
    const inspColorCard = document.getElementById('inspiration-color-card');
    if (inspColorCard) {
        if (inspirationImageUrl) {
            console.log("[displayProposalResult] Inspiration image found, showing color card.");
            inspColorCard.style.display = 'block';
            inspColorCard.addEventListener('click', onProposalClick);
        } else {
            console.log("[displayProposalResult] No inspiration image, hiding color card.");
            inspColorCard.style.display = 'none';
        }
    }
    // ▲▲▲ ★★★ 追加ここまで ★★★ ▲▲▲


    if (proposal.bestColors && bestColorsContainer) {
        // console.log("[displayProposalResult] Populating best colors...");
        Object.values(proposal.bestColors).forEach(color => {
            if (!color || !color.name || !color.hex) {
                 console.warn("[displayProposalResult] Invalid bestColor item:", color);
                 return;
            }
            const item = document.createElement('div');
            item.className = 'color-swatch-item';
            const circle = document.createElement('div');
            circle.className = 'color-swatch-circle';
            circle.style.backgroundColor = color.hex.match(/^#[0-9a-fA-F]{6}$/) ? color.hex : '#ccc';
            const name = document.createElement('span');
            name.className = 'color-swatch-name';
            name.textContent = escapeHtml(color.name);
            item.appendChild(circle);
            item.appendChild(name);
            bestColorsContainer.appendChild(item);
        });
    }

    if (proposal.makeup && makeupContainer) {
        // console.log("[displayProposalResult] Populating makeup...");
        const makeupMap = { eyeshadow: "アイシャドウ", cheek: "チーク", lip: "リップ" };
        Object.entries(proposal.makeup).forEach(([key, value]) => {
            const items = createResultItem(makeupMap[key] || key, value); 
            items[0].className = 'makeup-item-label'; 
            items[1].className = 'makeup-item-value';
            makeupContainer.append(...items);
        });
    }

    // ★★★ アップグレード 提案①: ファッション提案を描画 ★★★
    if (proposal.fashion && fashionContainer) {
        // console.log("[displayProposalResult] Populating fashion...");
        if (proposal.fashion.recommendedStyles && proposal.fashion.recommendedStyles.length > 0) {
            const items = createResultItem("似合うスタイル", proposal.fashion.recommendedStyles.join(' / ')); 
            items[0].className = 'makeup-item-label'; 
            items[1].className = 'makeup-item-value';
            fashionContainer.append(...items);
        }
        if (proposal.fashion.recommendedItems && proposal.fashion.recommendedItems.length > 0) {
            const items = createResultItem("似合うアイテム", proposal.fashion.recommendedItems.join(' / ')); 
            items[0].className = 'makeup-item-label'; 
            items[1].className = 'makeup-item-value';
            fashionContainer.append(...items);
        }
    }

    if (proposal.comment) {
         setTextContent('top-stylist-comment-text', proposal.comment);
    }
     // console.log("[displayProposalResult] Finished displaying proposals.");
}

/**
 * フェーズ3の「AI診断をリクエスト」ボタンの有効/無効を切り替える
 * @param {boolean} allUploaded 
 */
export function checkAllFilesUploaded(allUploaded) {
    const requestBtn = document.getElementById('request-diagnosis-btn');

    if (requestBtn) {
        requestBtn.disabled = !allUploaded;
        requestBtn.classList.toggle('btn-disabled', !allUploaded);
        // if (allUploaded) console.log("[checkAllFilesUploaded] All files ready, button enabled.");
    }
}

/**
 * フェーズ5の「合成画像を作成」ボタンの有効/無効を切り替える
 * @param {boolean} bothSelected 
 */
export function checkProposalSelection(bothSelected) {
    const generateBtn = document.getElementById('next-to-generate-btn');

    if (generateBtn) {
        generateBtn.disabled = !bothSelected;
        generateBtn.classList.toggle('btn-disabled', !bothSelected);
         // if (bothSelected) console.log("[checkProposalSelection] Both selected, button enabled.");
    }
}

/**
 * 画像キャプチャ中のローディングテキストを更新する
 * @param {HTMLElement} element 
 * @param {string} text 
 */
export function updateCaptureLoadingText(element, text) {
    if (element) element.textContent = text;
    console.log(`[CaptureStatus] ${text}`);
}