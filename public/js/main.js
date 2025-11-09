// --- ES Modules 形式で Firebase SDK をインポート ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
// ★ 修正: Firestore SDK をインポート
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- 作成したモジュールをインポート ---
import {
    initializeAppFailure,
    hideLoadingScreen,
    setTextContent,
    base64ToBlob
} from './helpers.js';

import {
    changePhase,
    displayDiagnosisResult,
    displayProposalResult,
    checkAllFilesUploaded,
    checkProposalSelection,
    updateCaptureLoadingText
} from './ui.js';

import {
    initializeLiffAndAuth,
    // ★ 修正: uploadFileToStorage を削除
    // uploadFileToStorage,
    // ★ 修正: saveImageToGallery をインポート
    saveImageToGallery,
    requestAiDiagnosis,
    requestImageGeneration,
    requestRefinement
} from './api.js';

// --- ★ 修正: ユーザー指定の新しいFirebaseConfig ---
const firebaseConfig = {
    apiKey: "AIzaSyD7f_GTwM7ee6AgMjwCRetyMNlVKDpb3_4",
    authDomain: "yhd-ai.firebaseapp.com",
    projectId: "yhd-ai",
    storageBucket: "yhd-ai.firebasestorage.app",
    messagingSenderId: "757347798313",
    appId: "1:757347798313:web:e64c91b4e8b0e8bfc33b38",
    measurementId: "G-D26PT4FYPR"
};

// --- Global App State ---
const AppState = {
    // ★ 修正: firestore を AppState に追加
    firebase: { app: null, auth: null, storage: null, firestore: null },
    liffId: '2008345232-pVNR18m1', // ★ 修正: AI診断LIFFアプリのID
    userProfile: {
        displayName: "ゲスト",
        userId: null,       // LIFF User ID
        pictureUrl: null,
        statusMessage: null,
        firebaseUid: null,  // Firebase Auth UID (LIFF User IDと同じはず)
        viaAdmin: false,  // 管理画面経由フラグ
        adminCustomerName: null // 管理画面から渡された名前
    },
    gender: 'female',
    uploadedFiles: {}, // File オブジェクト
    uploadedFileUrls: {}, // Storage の URL
    selectedProposal: { hairstyle: null, haircolor: null },
    aiDiagnosisResult: null,
    aiProposal: null,
    generatedImageUrl: null, // Data URL
    generatedImageDataBase64: null, // Base64
    generatedImageMimeType: null, // MimeType
};

// --- UI Initialization ---
function initializeAppUI() {
    console.log("[initializeAppUI] Initializing UI.");
    try {
        setupEventListeners();
        console.log("[initializeAppUI] setupEventListeners completed.");

        // main()から渡されたパラメータを使って名前をセット
        // 管理画面経由の場合はその名前、それ以外はLINEのプロフィール名
        const displayName = AppState.userProfile.viaAdmin
            ? AppState.userProfile.adminCustomerName
            : AppState.userProfile.displayName;
            
        setTextContent('display-name', displayName || "ゲスト");
        
        const genderRadio = document.querySelector(`input[name="gender"][value="${AppState.gender}"]`);
        if (genderRadio) genderRadio.checked = true;

        console.log("[initializeAppUI] User info pre-filled for phase2.");

        // 必ずフェーズ1から開始
        console.log("[initializeAppUI] Always starting from phase1.");
        changePhase('phase1');

        const bodyElement = document.body;
        if (bodyElement) {
            bodyElement.style.display = 'flex';
            bodyElement.style.justifyContent = 'center';
            bodyElement.style.alignItems = 'flex-start';
            bodyElement.style.paddingTop = '20px';
            bodyElement.style.minHeight = 'unset';
        } else {
            console.warn("[initializeAppUI] document.body not found.");
        }
        console.log("[initializeAppUI] UI Initialized.");
    } catch (uiError) {
        console.error("[initializeAppUI] Error during UI initialization:", uiError);
        initializeAppFailure("UIの初期化中にエラーが発生しました: " + uiError.message);
    }
}

// --- Event Listener Setup ---
function setupEventListeners() {
    console.log("[setupEventListeners] Setting up...");

    // Phase 1: Start Button
    document.getElementById('start-btn')?.addEventListener('click', () => {
        // AppStateに保存されている最新の名前をセットし直す
        const displayName = AppState.userProfile.viaAdmin
            ? AppState.userProfile.adminCustomerName
            : AppState.userProfile.displayName;
        setTextContent('display-name', displayName || "ゲスト");
        
        const genderRadio = document.querySelector(`input[name="gender"][value="${AppState.gender}"]`);
        if (genderRadio) genderRadio.checked = true;
        changePhase('phase2');
    });

    // Phase 2: Next Button
    document.getElementById('next-to-upload-btn')?.addEventListener('click', () => {
        const selectedGender = document.querySelector('input[name="gender"]:checked');
        if (selectedGender) AppState.gender = selectedGender.value;
        console.log("Gender selected:", AppState.gender);
        changePhase('phase3');
    });

    // Phase 3: File Inputs
    document.querySelectorAll('.upload-item').forEach(item => {
        const button = item.querySelector('button');
        const input = item.querySelector('.file-input');
        const itemId = item.id;
        const iconDiv = item.querySelector('.upload-icon');

        if (button && input) {
            button.addEventListener('click', () => !button.disabled && input.click());
            input.addEventListener('change', (event) => {
                const file = event.target.files?.[0];
                if (file) {
                    AppState.uploadedFiles[itemId] = file;
                    console.log(`[FileSelected] ${itemId}: ${file.name}`);
                    button.textContent = '✔️ 撮影済み';
                    button.classList.remove('btn-outline');
                    button.classList.add('btn-success');
                    button.disabled = true;
                    if (iconDiv) iconDiv.classList.add('completed');
                    checkAllFilesUploaded(areAllFilesUploaded());
                }
            });
        }
    });

    // Phase 3: Diagnosis Button
    document.getElementById('request-diagnosis-btn')?.addEventListener('click', handleDiagnosisRequest);

    // Phase 4: Next Button
    document.getElementById('next-to-proposal-btn')?.addEventListener('click', () => {
        // AppState をリセットし、UIを描画
        AppState.selectedProposal = { hairstyle: null, haircolor: null };
        checkProposalSelection(false);
        displayProposalResult(AppState.aiProposal, handleProposalSelection);
        changePhase('phase5');
    });

    // Phase 4: Save Button
    document.getElementById('save-phase4-btn')?.addEventListener('click', () => {
        captureAndShareImage('phase4', 'AI診断結果.png');
    });

    // Phase 5: Generate Button
    document.getElementById('next-to-generate-btn')?.addEventListener('click', handleImageGenerationRequest);

    // Phase 5: Save Button
    document.getElementById('save-phase5-btn')?.addEventListener('click', () => {
        captureAndShareImage('phase5', 'AIパーソナル提案.png');
    });

    // Phase 5: Back Button
    document.getElementById('back-to-diagnosis-btn')?.addEventListener('click', () => {
        changePhase('phase4');
    });

    // Phase 6: Back Button
    document.getElementById('back-to-proposal-btn')?.addEventListener('click', () => {
        setTextContent('refinement-prompt-input', '');
        changePhase('phase5');
    });

    // Phase 6: Refine Button
    document.getElementById('refine-image-btn')?.addEventListener('click', handleImageRefinementRequest);

    // Phase 6: Share Button
    document.getElementById('share-phase6-btn')?.addEventListener('click', () => {
        captureAndShareImage('phase6', 'AI合成画像.png');
    });

    // Phase 6: Save to DB Button
    document.getElementById('save-generated-image-to-db-btn')?.addEventListener('click', handleSaveGeneratedImage);

    console.log("[setupEventListeners] Setup complete.");
}

// --- Event Handlers ---

/**
 * [Handler] 診断リクエストのメインフロー
 */
async function handleDiagnosisRequest() {
    console.log("[handleDiagnosisRequest] Starting diagnosis process.");
    const requestBtn = document.getElementById('request-diagnosis-btn');
    const statusTextElement = document.getElementById('diagnosis-status-text');

    const updateStatusText = (text) => {
        if (statusTextElement) statusTextElement.textContent = text;
        console.log(`[StatusUpdate] ${text}`);
    };

    try {
        if (requestBtn) requestBtn.disabled = true;
        changePhase('phase3.5');
        updateStatusText('ファイルをアップロード中... (0/5)');

        const uploadPromises = [];
        const fileKeys = Object.keys(AppState.uploadedFiles);
        let uploadedCount = 0;

        fileKeys.forEach(key => {
            const file = AppState.uploadedFiles[key];
            // ★ 修正: saveImageToGallery を使用し、firestore と storage を渡す
            const promise = saveImageToGallery(
                AppState.firebase.firestore,
                AppState.firebase.storage,
                AppState.userProfile.firebaseUid,
                file,
                key
            ).then(result => {
                uploadedCount++;
                updateStatusText(`ファイルをアップロード中... (${uploadedCount}/${fileKeys.length})`);
                AppState.uploadedFileUrls[key] = result.url;
                return result;
            });
            uploadPromises.push(promise);
        });

        await Promise.all(uploadPromises);
        console.log("[handleDiagnosisRequest] All files uploaded and saved to Firestore:", AppState.uploadedFileUrls);
        updateStatusText('AIに診断をリクエスト中...');

        const requestData = {
            fileUrls: AppState.uploadedFileUrls,
            userProfile: {
                userId: AppState.userProfile.userId,
                displayName: AppState.userProfile.displayName,
                firebaseUid: AppState.userProfile.firebaseUid
            },
            gender: AppState.gender
        };

        const responseData = await requestAiDiagnosis(requestData);
        console.log("[handleDiagnosisRequest] Diagnosis response received.");

        AppState.aiDiagnosisResult = responseData.result;
        AppState.aiProposal = responseData.proposal;

        displayDiagnosisResult(AppState.aiDiagnosisResult);
        changePhase('phase4');

    } catch (error) {
        console.error("[handleDiagnosisRequest] Error:", error);
        alert(`診断リクエストの処理中にエラーが発生しました。\n詳細: ${error.message}`);
        changePhase('phase3');
        // アップロードに失敗したファイルのみリセット
        document.querySelectorAll('.upload-item').forEach(item => {
            const button = item.querySelector('button');
            const iconDiv = item.querySelector('.upload-icon');
            if (button && !AppState.uploadedFileUrls[item.id]) {
                button.textContent = '撮影';
                button.classList.add('btn-outline');
                button.classList.remove('btn-success');
                button.disabled = false;
                if (iconDiv) iconDiv.classList.remove('completed');
                delete AppState.uploadedFiles[item.id];
            }
        });
        checkAllFilesUploaded(areAllFilesUploaded());

    } finally {
        const currentPhase3 = document.getElementById('phase3');
        if (requestBtn && currentPhase3 && currentPhase3.style.display === 'block') {
            checkAllFilesUploaded(areAllFilesUploaded());
        }
    }
}

/**
 * [Handler] 画像生成リクエスト
 */
async function handleImageGenerationRequest() {
    console.log("[handleImageGenerationRequest] Starting...");
    const generateBtn = document.getElementById('next-to-generate-btn');
    const generatedImageElement = document.getElementById('generated-image');
    const refinementSpinner = document.getElementById('refinement-spinner');
    
    // 保存ボタンの状態をリセット
    const saveBtn = document.getElementById('save-generated-image-to-db-btn');
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'この合成画像を保存する';
        saveBtn.classList.remove('btn-success');
        saveBtn.classList.add('btn-primary');
    }

    if (!AppState.selectedProposal.hairstyle || !AppState.selectedProposal.haircolor) {
        alert("ヘアスタイルとヘアカラーを選択してください。");
        return;
    }
    const originalImageUrl = AppState.uploadedFileUrls['item-front-photo'];
    if (!originalImageUrl) {
        alert("画像生成に必要な正面写真のURLが見つかりません。");
        return;
    }

    const hairstyle = AppState.aiProposal?.hairstyles?.[AppState.selectedProposal.hairstyle];
    const haircolor = AppState.aiProposal?.haircolors?.[AppState.selectedProposal.haircolor];

    if (!hairstyle || !haircolor) {
         alert("選択された提案の詳細の取得に失敗しました。");
         return;
    }

    try {
        if (generateBtn) generateBtn.disabled = true;
        if (generatedImageElement) generatedImageElement.style.opacity = '0.5';
        if (refinementSpinner) refinementSpinner.style.display = 'block';
        changePhase('phase6');

        const requestData = {
            originalImageUrl: originalImageUrl,
            firebaseUid: AppState.userProfile.firebaseUid,
            hairstyleName: hairstyle.name,
            hairstyleDesc: hairstyle.description,
            haircolorName: haircolor.name,
            haircolorDesc: haircolor.description,
        };

        const responseData = await requestImageGeneration(requestData);
        const { imageBase64, mimeType } = responseData;
        if (!imageBase64 || !mimeType) {
            throw new Error("Invalid response: missing imageBase64 or mimeType.");
        }
        
        const dataUrl = `data:${mimeType};base64,${imageBase64}`;
        AppState.generatedImageDataBase64 = imageBase64;
        AppState.generatedImageMimeType = mimeType;
        AppState.generatedImageUrl = dataUrl;

        if (generatedImageElement) {
            generatedImageElement.src = dataUrl;
        }

    } catch (error) {
        console.error("[handleImageGenerationRequest] Error:", error);
        alert(`画像生成中にエラーが発生しました。\n詳細: ${error.message}`);
        changePhase('phase5');
        if (generatedImageElement) generatedImageElement.src = 'https://placehold.co/300x300/fecaca/991b1b?text=Generation+Failed';
    } finally {
        if (refinementSpinner) refinementSpinner.style.display = 'none';
        if (generatedImageElement) generatedImageElement.style.opacity = '1';
        if (generateBtn) checkProposalSelection(isProposalSelected());
    }
}

/**
 * [Handler] 画像微調整リクエスト
 */
async function handleImageRefinementRequest() {
    console.log("[handleImageRefinementRequest] Starting...");
    const refineBtn = document.getElementById('refine-image-btn');
    const input = document.getElementById('refinement-prompt-input');
    const generatedImageElement = document.getElementById('generated-image');
    const refinementSpinner = document.getElementById('refinement-spinner');
    
    const saveBtn = document.getElementById('save-generated-image-to-db-btn');
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'この合成画像を保存する';
        saveBtn.classList.remove('btn-success');
        saveBtn.classList.add('btn-primary');
    }

    const refinementText = input.value;
    if (!refinementText || refinementText.trim() === '') {
        alert("微調整したい内容を入力してください。");
        return;
    }
    if (!AppState.generatedImageUrl || !AppState.generatedImageUrl.startsWith('data:image')) {
        alert("微調整の元になる画像データが見つかりません。");
        return;
    }
    if (!AppState.userProfile.firebaseUid) {
        alert("ユーザー情報が取得できていません。");
        return;
    }

    try {
        if (refineBtn) {
            refineBtn.disabled = true;
            refineBtn.textContent = '修正中...';
        }
        if (generatedImageElement) generatedImageElement.style.opacity = '0.5';
        if (refinementSpinner) refinementSpinner.style.display = 'block';

        const requestData = {
            generatedImageUrl: AppState.generatedImageUrl, // Data URL
            firebaseUid: AppState.userProfile.firebaseUid,
            refinementText: refinementText
        };
        
        const responseData = await requestRefinement(requestData);
        const { imageBase64, mimeType } = responseData;
        if (!imageBase64 || !mimeType) {
            throw new Error("Invalid response: missing imageBase64 or mimeType.");
        }
        
        const dataUrl = `data:${mimeType};base64,${imageBase64}`;
        AppState.generatedImageDataBase64 = imageBase64;
        AppState.generatedImageMimeType = mimeType;
        AppState.generatedImageUrl = dataUrl;
        
        if (generatedImageElement) generatedImageElement.src = dataUrl;
        if (input) input.value = '';

    } catch (error) {
        console.error("[handleImageRefinementRequest] Error:", error);
        alert(`画像の修正に失敗しました。\n詳細: ${error.message}`);
    } finally {
        if (refineBtn) {
            refineBtn.disabled = false;
            refineBtn.textContent = '変更を反映する';
        }
        if (generatedImageElement) generatedImageElement.style.opacity = '1';
        if (refinementSpinner) refinementSpinner.style.display = 'none';
    }
}

/**
 * [Handler] 生成画像を yhd-db の Storage と Firestore に保存
 */
async function handleSaveGeneratedImage() {
    console.log("[handleSaveGeneratedImage] Attempting to save...");
    const saveBtn = document.getElementById('save-generated-image-to-db-btn');

    if (!AppState.generatedImageDataBase64 || !AppState.generatedImageMimeType) {
        alert("保存対象の画像データが見つかりません。");
        return;
    }
    if (!AppState.userProfile.firebaseUid) {
        alert("ユーザー情報が取得できていません。");
        return;
    }

    try {
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = '保存中...';
        }

        const imageBlob = base64ToBlob(AppState.generatedImageDataBase64, AppState.generatedImageMimeType);
        if (!imageBlob) {
            throw new Error("Failed to convert Base64 to Blob.");
        }
        
        const fileExtension = AppState.generatedImageMimeType.split('/')[1] || 'png';
        const fileName = `favorite_generated.${fileExtension}`;
        const imageFile = new File([imageBlob], fileName, { type: AppState.generatedImageMimeType });

        // ★ 修正: saveImageToGallery を使用
        const uploadResult = await saveImageToGallery(
            AppState.firebase.firestore,
            AppState.firebase.storage,
            AppState.userProfile.firebaseUid,
            imageFile,
            `favorite_generated_${Date.now()}`
        );
        
        console.log("[handleSaveGeneratedImage] Upload and save successful:", uploadResult.url);

        if (saveBtn) {
            saveBtn.textContent = '✔️ 保存済み';
            saveBtn.classList.remove('btn-primary');
            saveBtn.classList.add('btn-success');
            // 再度押せないように disabled = true にする
            saveBtn.disabled = true;
        }
        alert("お気に入りの画像を保存しました！");

    } catch (error) {
        console.error("[handleSaveGeneratedImage] Error saving image:", error);
        alert(`画像の保存に失敗しました: ${error.message}`);
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'この合成画像を保存する';
        }
    }
}

/**
 * [Handler] 画面キャプチャ＆共有（実質保存）
 */
async function captureAndShareImage(phaseId, fileName) {
    if (typeof html2canvas === 'undefined') {
        alert("画像保存機能の読み込みに失敗しました。");
        return;
    }
    if (!liff.isApiAvailable('shareTargetPicker')) {
         alert("LINEの共有機能（画像保存）が利用できません。");
         return;
    }
    // ★ 修正: firestore もチェック
    if (!AppState.firebase.storage || !AppState.userProfile.firebaseUid || !AppState.firebase.firestore) {
        alert("画像保存機能を利用するには、Firebaseへの接続が必要です。");
        return;
    }

    const targetElement = document.getElementById(phaseId)?.querySelector('.card');
    if (!targetElement) {
        alert("キャプチャ対象の要素が見つかりません。");
        return;
    }

    const buttonsToHide = targetElement.querySelectorAll('.no-print');
    buttonsToHide.forEach(btn => btn.style.visibility = 'hidden');
    const loadingText = document.createElement('p');
    loadingText.textContent = '画像を生成中...';
    loadingText.className = 'capture-loading-text no-print';
    targetElement.appendChild(loadingText);

    try {
        const canvas = await html2canvas(targetElement, {
            scale: 2,
            useCORS: true,
            onclone: (clonedDoc) => {
                clonedDoc.getElementById(phaseId)?.querySelector('.card')
                    ?.querySelectorAll('.no-print').forEach(btn => btn.style.visibility = 'hidden');
            }
        });

        updateCaptureLoadingText(loadingText, '画像をアップロード中...');
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const generatedFile = new File([blob], fileName, { type: 'image/png' });

        // ★ 修正: saveImageToGallery を使用
        const uploadResult = await saveImageToGallery(
            AppState.firebase.firestore,
            AppState.firebase.storage,
            AppState.userProfile.firebaseUid,
            generatedFile,
            `capture_${phaseId}_${Date.now()}`
        );

        if (!uploadResult.url) {
            throw new Error("Storageへのアップロード後、URLの取得に失敗しました。");
        }

        updateCaptureLoadingText(loadingText, 'LINEで共有（保存）...');
        await liff.shareTargetPicker([
            { type: 'image', originalContentUrl: uploadResult.url, previewImageUrl: uploadResult.url }
        ], { isMultiple: false });

    } catch (error) {
        console.error("Error capturing or sharing image:", error);
        alert(`画像の保存に失敗しました: ${error.message}`);
    } finally {
        buttonsToHide.forEach(btn => btn.style.visibility = 'visible');
        if (loadingText.parentNode === targetElement) {
             targetElement.removeChild(loadingText);
        }
    }
}

/**
 * [Handler] 提案カードの選択
 */
function handleProposalSelection(event) {
    const selectedCard = event.currentTarget;
    const type = selectedCard.dataset.type;
    const key = selectedCard.dataset.key;
    if (!type || !key) return;

    console.log(`[ProposalSelected] Type: ${type}, Key: ${key}`);

    document.querySelectorAll(`.proposal-card[data-type="${type}"]`).forEach(card => {
        card.classList.remove('selected');
    });
    selectedCard.classList.add('selected');
    AppState.selectedProposal[type] = key;
    
    checkProposalSelection(isProposalSelected());
}

// --- State Checkers ---

function areAllFilesUploaded() {
    const requiredItems = ['item-front-photo', 'item-side-photo', 'item-back-photo', 'item-front-video', 'item-back-video'];
    return requiredItems.every(item => AppState.uploadedFiles[item]);
}

function isProposalSelected() {
    return !!AppState.selectedProposal.hairstyle && !!AppState.selectedProposal.haircolor;
}


// --- Main App Initialization ---
async function main() {
    console.log("[main] >>> Function execution started.");
    let loadingScreenHidden = false;

    try {
        console.log("[main] Initializing Firebase App (yhd-ai)..."); // ★ 修正
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const storage = getStorage(app);
        // ★ 修正: Firestore を初期化
        const firestore = getFirestore(app);
        // ★ 修正: AppState に firestore を追加
        AppState.firebase = { app, auth, storage, firestore };
        console.log("[main] Firebase service instances obtained (Auth, Storage, Firestore).");

        console.log(`[main] Initializing LIFF and Auth... LIFF ID: ${AppState.liffId}`);
        const { user, profile } = await initializeLiffAndAuth(AppState.liffId, auth);
        console.log("[main] LIFF Auth successful.");
        AppState.userProfile.firebaseUid = user.uid;
        console.log("[main] Firebase UID:", user.uid);

        console.log("[main] Parsing URL search parameters...");
        const urlParams = new URLSearchParams(window.location.search);
        const adminCustomerId = urlParams.get('customerId');
        const adminCustomerName = urlParams.get('customerName');
        
        if (adminCustomerId && adminCustomerName) {
            console.log(`[main] Admin parameters found: customerId=${adminCustomerId}, customerName=${adminCustomerName}`);
            AppState.userProfile.viaAdmin = true;
            AppState.userProfile.adminCustomerName = adminCustomerName; // 管理画面からの名前を保持
        }

        console.log("[main] LIFF profile obtained:", profile);
        AppState.userProfile = { ...AppState.userProfile, ...profile };
        
        // viaAdmin でない場合、LINEプロフィール名を displayName に設定
        if (!AppState.userProfile.viaAdmin) {
            AppState.userProfile.displayName = profile.displayName || "ゲスト";
        } else {
             // viaAdmin の場合、管理画面からの名前を優先
             AppState.userProfile.displayName = AppState.userProfile.adminCustomerName;
        }

        AppState.userProfile.userId = profile.userId; // LIFF User ID を確実にセット
        console.log("[main] Final User Info:", AppState.userProfile);

        console.log("[main] Calling initializeAppUI()...");
        initializeAppUI();
        console.log("[main] initializeAppUI() finished.");

        console.log("[main] Attempting to hide loading screen...");
        hideLoadingScreen();
        loadingScreenHidden = true;
        console.log("[main] Loading screen hidden successfully.");

    } catch (err) {
        console.error("[main] Initialization failed:", err);
        initializeAppFailure(err.message || '不明な初期化エラーが発生しました。');
    } finally {
        console.log("[main] <<< Function execution finished.");
        if (!loadingScreenHidden) {
             console.warn("[main] Hiding loading screen in finally block.");
             hideLoadingScreen();
        }
    }
}

// --- Start Application ---
// (index.html から type="module" でロードされるため、最後に実行する)
main();