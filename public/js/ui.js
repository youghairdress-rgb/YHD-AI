import { escapeHtml, createResultItem, setTextContent } from './helpers.js';

/**
 * 指定されたフェーズ（画面）に表示を切り替える
 * @param {string} phaseId 表示したいフェーズのID ('phase1', 'phase2', etc.)
 */
export function changePhase(phaseId) {
    console.log(`[changePhase] Changing to phase: ${phaseId}`);
    // Hide all phase containers first
    document.querySelectorAll('.phase-container').forEach(container => {
        if (container) container.style.display = 'none'; // Add null check
    });

    // Display the target phase container
    const targetPhase = document.getElementById(phaseId);
    if (targetPhase) {
        targetPhase.style.display = 'block';
        console.log(`[changePhase] Phase ${phaseId} displayed.`);
    } else {
        console.error(`[changePhase] Phase container with id "${phaseId}" not found.`);
        // Fallback to phase1 if target is not found
        const phase1 = document.getElementById('phase1');
        if(phase1) phase1.style.display = 'block';
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

    if (faceResultsContainer) faceResultsContainer.innerHTML = ''; else console.warn("[displayDiagnosisResult] faceResultsContainer not found");
    if (skeletonResultsContainer) skeletonResultsContainer.innerHTML = ''; else console.warn("[displayDiagnosisResult] skeletonResultsContainer not found");
    if (personalColorResultsContainer) personalColorResultsContainer.innerHTML = ''; else console.warn("[displayDiagnosisResult] personalColorResultsContainer not found");

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
        const skeletonMap = { neckLength: "首の長さ", faceShape: "顔の形", bodyLine: "ボディライン", shoulderLine: "肩のライン" };
        Object.entries(result.skeleton).forEach(([key, value]) => {
            const items = createResultItem(skeletonMap[key] || key, value);
            skeletonResultsContainer.append(...items);
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
     // console.log("[displayDiagnosisResult] Finished displaying results.");
}

/**
 * 提案結果（フェーズ5）をHTMLに描画する
 * @param {object} proposal - AIの提案結果オブジェクト
 * @param {function} onProposalClick - 提案カードがクリックされたときのコールバック関数
 */
export function displayProposalResult(proposal, onProposalClick) {
    // console.log("[displayProposalResult] Displaying proposal:", proposal);
    const hairstyleContainer = document.getElementById('hairstyle-proposal');
    const haircolorContainer = document.getElementById('haircolor-proposal');
    const bestColorsContainer = document.getElementById('best-colors-proposal');
    const makeupContainer = document.getElementById('makeup-proposal');

    if (hairstyleContainer) hairstyleContainer.innerHTML = ''; else console.warn("[displayProposalResult] hairstyleContainer not found");
    if (haircolorContainer) haircolorContainer.innerHTML = ''; else console.warn("[displayProposalResult] haircolorContainer not found");
    if (bestColorsContainer) bestColorsContainer.innerHTML = ''; else console.warn("[displayProposalResult] bestColorsContainer not found");
    if (makeupContainer) makeupContainer.innerHTML = ''; else console.warn("[displayProposalResult] makeupContainer not found");
    setTextContent('top-stylist-comment-text', '');
    
    // AppState への依存を削除 (呼び出し元でリセットしてもらう)
    // AppState.selectedProposal = { hairstyle: null, haircolor: null };
    // checkProposalSelection(); 

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