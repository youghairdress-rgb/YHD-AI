// --- ES Modules 形式で Firebase SDK をインポート ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- 作成したモジュールをインポート ---
import {
    initializeAppFailure,
    hideLoadingScreen,
    setTextContent,
    base64ToBlob,
    compressImage
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
    saveImageToGallery,
    uploadFileToStorageOnly,
    requestAiDiagnosis,
    requestImageGeneration,
    requestRefinement
} from './api.js';

// --- yhd-db の Firebase 設定 ---
const firebaseConfig = {
    apiKey: "AIzaSyCjZcF8GFC4CJMYmpucjJ_yShsn74wDLVw",
    authDomain: "yhd-db.firebaseapp.com",
    projectId: "yhd-db",
    storageBucket: "yhd-db.firebasestorage.app",
    messagingSenderId: "940208179982",
    appId: "1:940208179982:web:92abb326fa1dc8ee0b655f",
    measurementId: "G-RSYFJW3TN6"
};


// --- Global App State ---
const AppState = {
    firebase: { app: null, auth: null, storage: null, firestore: null },
    liffId: '2008345232-pVNR18m1',
    userProfile: {
        displayName: "ゲスト",
        userId: null,
        pictureUrl: null,
        statusMessage: null,
        firebaseUid: null,
        viaAdmin: false,
        adminCustomerName: null
    },
    gender: 'female',
    
    // ▼▼▼ ★★★ スマホ停止バグ修正 (アーキテクチャ変更) ★★★ ▼▼▼
    // (1) 完了したURLを保存する場所
    uploadedFileUrls: {},
    // (2) 実行中のアップロードタスク(Promise)を保存する場所
    uploadPromises: {},
    // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲

    selectedProposal: { hairstyle: null, haircolor: null },
    aiDiagnosisResult: null,
    aiProposal: null,
    generatedImageUrl: null,
    generatedImageDataBase64: null,
    generatedImageMimeType: null,
};

// --- UI Initialization ---
function initializeAppUI() {
    console.log("[initializeAppUI] Initializing UI.");
    try {
        setupEventListeners();
        console.log("[initializeAppUI] setupEventListeners completed.");

        setTextContent('display-name', AppState.userProfile.displayName || "ゲスト");
        
        const genderRadio = document.querySelector(`input[name="gender"][value="${AppState.gender}"]`);
        if (genderRadio) genderRadio.checked = true;

        console.log("[initializeAppUI] User info pre-filled for phase2.");

        console.log("[initializeAppUI] Always starting from phase1.");
        changePhase('phase1');

        const bodyElement = document.body;
        if (bodyElement) {
            bodyElement.style.display = 'block';
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
        setTextContent('display-name', AppState.userProfile.displayName || "ゲスト");
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

    // ▼▼▼ ★★★ スマホ停止バグ修正 (アーキテクチャ変更) ★★★ ▼▼▼
    // Phase 3: File Inputs (await しない方式)
    document.querySelectorAll('.upload-item').forEach(item => {
        const button = item.querySelector('button');
        const input = item.querySelector('.file-input');
        const itemId = item.id;
        const iconDiv = item.querySelector('.upload-icon');

        if (button && input) {
            button.addEventListener('click', () => !button.disabled && input.click());
            
            // ★ `await` を使わないため、`async` を削除
            input.addEventListener('change', (event) => {
                
                // (重要) `try...catch` はここでは使わず、Promiseの .catch() で処理する
                // `await` を使うとフリーズするため、`async` と `try...catch` を削除
                
                const file = event.target.files?.[0];
                if (!file) {
                    // ファイルが選択されなかった
                    event.target.value = null;
                    return;
                }

                // (1) UIを「処理中...」に変更
                button.textContent = '処理中...';
                button.disabled = true;
                if (iconDiv) iconDiv.classList.remove('completed');
                checkAllFilesUploaded(false); // 診断ボタンを一時的に無効化

                // (2) 圧縮処理 (Promiseベース)
                let processingPromise;
                if (file.type.startsWith('image/') && file.type !== 'image/gif') {
                    console.log(`[FileSelected] ${itemId} (Image): ${file.name}. Compressing...`);
                    processingPromise = compressImage(file).catch(compressError => {
                        console.warn(`[FileSelected] ${itemId} compression failed. Using original file.`, compressError);
                        return file; // 圧縮に失敗しても元のファイルで続行
                    });
                } else if (file.type.startsWith('video/')) {
                    // ★★★ 動画サイズチェック ★★★
                    const fileSizeMB = file.size / 1024 / 1024;
                    console.log(`[FileSelected] ${itemId} (Video): ${file.name}. Size: ${fileSizeMB.toFixed(2)}MB.`);
                    if (fileSizeMB > 50) { // 50MB以上の動画
                        alert(`動画のサイズが ${fileSizeMB.toFixed(1)}MB と非常に大きいです。\n\nアップロードに数分かかる場合があります。Wi-Fi環境での実行を推奨します。\n\n「ｱｯﾌﾟﾛｰﾄﾞ中...」の表示のまま進まないように見えても、バックグラウンドで処理中です。`);
                    }
                    processingPromise = Promise.resolve(file); // 動画は圧縮しない
                } else {
                    console.log(`[FileSelected] ${itemId} (Other): ${file.name}. Skipping compression.`);
                    processingPromise = Promise.resolve(file); // その他
                }

                // (3) 圧縮完了後、アップロードを "開始" (await しない)
                const uploadPromise = processingPromise.then(fileToUpload => {
                    console.log(`[FileUploading] ${itemId}: ${fileToUpload.name} をアップロード開始...`);

                    const onProgress = (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        // 進捗が 0 または 100 ではない場合のみ％表示
                        if (progress > 0 && progress < 100) {
                            button.textContent = `ｱｯﾌﾟﾛｰﾄﾞ中 ${Math.round(progress)}%`;
                        } else if (progress === 100) {
                            button.textContent = `処理中...`; // 完了後のサーバ処理
                        }
                    };
                    
                    button.textContent = 'ｱｯﾌﾟﾛｰﾄﾞ中 0%'; 

                    if (itemId.includes('video')) {
                        return uploadFileToStorageOnly(
                            AppState.firebase.storage,
                            AppState.userProfile.firebaseUid,
                            fileToUpload,
                            itemId,
                            onProgress
                        );
                    } else {
                        return saveImageToGallery(
                            AppState.firebase.firestore,
                            AppState.firebase.storage,
                            AppState.userProfile.firebaseUid,
                            fileToUpload,
                            itemId,
                            onProgress
                        );
                    }
                });

                // (4) AppState に File や URL ではなく、"Promise" を保存
                // (注: この時点では、uploadPromise はまだ実行中)
                AppState.uploadPromises[itemId] = uploadPromise;
                
                // (5) UIを「撮影済み」に仮変更 (進捗表示がすぐ始まる)
                button.classList.remove('btn-outline-primary');
                button.classList.add('btn-success');
                button.disabled = true;
                if (iconDiv) iconDiv.classList.add('completed');
                
                // (6) 5つの "Promise" が登録されたかチェック
                checkAllFilesUploaded(areAllFilesUploaded());

                // (7) Promise の完了・失敗ハンドリング
                uploadPromise.then(result => {
                    // ★ 正常に完了した場合
                    if (!result || !result.url) {
                         // api.jsがrejectしなかったがURLがない (念のため)
                        throw new Error("アップロード後のURL取得に失敗しました。");
                    }
                    AppState.uploadedFileUrls[itemId] = result.url;
                    console.log(`[FileUploadSuccess] ${itemId}: ${result.url}`);
                    button.textContent = '✔️ アップロード完了';
                    
                    // メモリ解放 (fileToUploadへの参照を断ち切る)
                    processingPromise = null;
                }).catch(error => {
                    // ★ 失敗した場合
                    console.error(`[FileSelected] Error uploading file for ${itemId}:`, error);
                    // ユーザーがキャンセルした場合などはアラートを出さない
                    if (error.code !== 'storage/canceled') {
                        alert(`ファイル[${itemId}]のアップロード中にエラーが発生しました: ${error.message}`);
                    }
                    
                    // UIを元に戻す
                    button.textContent = '撮影';
                    button.disabled = false;
                    button.classList.add('btn-outline-primary');
                    button.classList.remove('btn-success');
                    if (iconDiv) iconDiv.classList.remove('completed');
                    
                    // 失敗したPromiseとURLを削除
                    delete AppState.uploadPromises[itemId];
                    delete AppState.uploadedFileUrls[itemId];
                    checkAllFilesUploaded(areAllFilesUploaded()); // 診断ボタンを無効化
                    
                    // メモリ解放
                    processingPromise = null;
                });

                // (8) input クリア
                event.target.value = null;
            });
        }
    });
    // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲


    // Phase 3: Diagnosis Button
    document.getElementById('request-diagnosis-btn')?.addEventListener('click', handleDiagnosisRequest);

    // Phase 4: Next Button
    document.getElementById('next-to-proposal-btn')?.addEventListener('click', () => {
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

    // Phase 6: Refine Button (手動微調整)
    document.getElementById('refine-image-btn')?.addEventListener('click', handleImageRefinementRequest);

    document.getElementById('switch-color-btn')?.addEventListener('click', handleColorSwitchRequest);

    // Phase 6: Share Button
    document.getElementById('share-phase6-btn')?.addEventListener('click', () => {
        captureAndShareImage('phase6', 'AI合成画像.png');
    });

    // Phase 6: Save to DB Button
    document.getElementById('save-generated-image-to-db-btn')?.addEventListener('click', handleSaveGeneratedImage);

    document.getElementById('close-liff-btn')?.addEventListener('click', () => {
        if (liff) {
            liff.closeWindow();
        } else {
            alert("LIFFの終了に失敗しました。");
        }
    });

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
        
        // ▼▼▼ ★★★ スマホ停止バグ修正 (アーキテクチャ変更) ★★★ ▼▼▼
        // (1) 5つのアップロードが完了するのを待つ
        updateStatusText('アップロードの完了を確認中...');
        
        const requiredKeys = ['item-front-photo', 'item-side-photo', 'item-back-photo', 'item-front-video', 'item-back-video'];
        const uploadPromises = requiredKeys.map(key => AppState.uploadPromises[key]);

        if (uploadPromises.some(p => !p)) {
             // 5つのうち、いずれかのPromiseが未登録 (＝アップロードが開始されていない)
             throw new Error("必須ファイル5つのアップロードが開始されていません。");
        }

        // ★ ここで初めて、保存されたPromiseが完了するのを待つ
        await Promise.all(uploadPromises);
        
        // (2) 完了後、URLが5つ揃っているかチェック
        console.log("[handleDiagnosisRequest] All uploads completed. Checking URLs:", AppState.uploadedFileUrls);
        const missingKeys = requiredKeys.filter(key => !AppState.uploadedFileUrls[key]);
        if (missingKeys.length > 0) {
            // .catch() で処理されたはずだが、念のため
            throw new Error(`アップロードに失敗したファイルがあります: ${missingKeys.join(', ')}`);
        }
        
        updateStatusText('AIに診断をリクエスト中...');
        
        // (3) AIに渡すデータを作成 (URLのみ)
        const requestData = {
            fileUrls: AppState.uploadedFileUrls, // URLを渡す
            userProfile: {
                userId: AppState.userProfile.userId,
                displayName: AppState.userProfile.displayName,
                firebaseUid: AppState.userProfile.firebaseUid
            },
            gender: AppState.gender
        };
        
        // (4) AI診断リクエスト (Cloud Function 呼び出し)
        await new Promise(resolve => setTimeout(resolve, 100)); // UI更新のため
        
        const responseData = await requestAiDiagnosis(requestData);
        console.log("[handleDiagnosisRequest] Diagnosis response received.");
        // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲

        AppState.aiDiagnosisResult = responseData.result;
        AppState.aiProposal = responseData.proposal;

        displayDiagnosisResult(AppState.aiDiagnosisResult);
        changePhase('phase4');

    } catch (error) {
        console.error("[handleDiagnosisRequest] Error:", error);
        
        updateStatusText('エラーが発生しました。');
        alert(`診断リクエストの処理中にエラーが発生しました。\n詳細: ${error.message}`);
        changePhase('phase3');
        
        // 診断ボタンの状態を再チェック
        checkAllFilesUploaded(areAllFilesUploaded()); 

    } finally {
        if (requestBtn) {
            requestBtn.disabled = !areAllFilesUploaded();
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
    
    const saveBtn = document.getElementById('save-generated-image-to-db-btn');
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'この合成画像を保存する';
        saveBtn.classList.remove('btn-success');
        saveBtn.classList.add('btn-primary');
    }
    
    const switchColorBtn = document.getElementById('switch-color-btn');
    if (switchColorBtn) {
        switchColorBtn.style.display = 'none';
        switchColorBtn.disabled = false;
        switchColorBtn.dataset.otherColorKey = '';
    }

    if (!AppState.selectedProposal.hairstyle || !AppState.selectedProposal.haircolor) {
        alert("ヘアスタイルとヘアカラーを選択してください。");
        return;
    }

    // ▼▼▼ ★★★ スマホ停止バグ修正 (アーキテクチャ変更) ★★★ ▼▼▼
    // AppState.uploadedFileUrls から正面写真のURLを取得
    const originalImageUrl = AppState.uploadedFileUrls['item-front-photo'];
    // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
    
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
        
        updateColorSwitchButton(AppState.selectedProposal.haircolor);

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
 * [Handler] 画像微調整リクエスト (手動)
 */
async function handleImageRefinementRequest() {
    console.log("[handleImageRefinementRequest] Starting (Manual)...");
    const refineBtn = document.getElementById('refine-image-btn');
    const input = document.getElementById('refinement-prompt-input');
    
    const refinementText = input.value;
    if (!refinementText || refinementText.trim() === '') {
        alert("微調整したい内容を入力してください。");
        return;
    }

    const switchColorBtn = document.getElementById('switch-color-btn');
    if (switchColorBtn) {
        switchColorBtn.disabled = true;
    }
    if (refineBtn) {
        refineBtn.disabled = true;
        refineBtn.textContent = '修正中...';
    }

    const success = await requestRefinementInternal(refinementText);

    if (success) {
        if (input) input.value = '';
         if (switchColorBtn) {
             switchColorBtn.style.display = 'none';
         }
    }

    if (refineBtn) {
        refineBtn.disabled = false;
        refineBtn.textContent = '変更を反映する';
    }
}

/**
 * [Handler] カラー切替リクエスト
 */
async function handleColorSwitchRequest(event) {
    console.log("[handleColorSwitchRequest] Starting (Color Switch)...");
    const switchColorBtn = event.currentTarget;
    const refineBtn = document.getElementById('refine-image-btn');
    
    const otherColorKey = switchColorBtn.dataset.otherColorKey;
    if (!otherColorKey || !AppState.aiProposal.haircolors[otherColorKey]) {
        alert("切替先のカラー情報が見つかりません。");
        return;
    }

    const otherColor = AppState.aiProposal.haircolors[otherColorKey];
    const refinementText = `ヘアカラーを「${otherColor.name}」に変更してください。`;
    
    if (switchColorBtn) {
        switchColorBtn.disabled = true;
        switchColorBtn.textContent = `「${otherColor.name}」に変更中...`;
    }
    if (refineBtn) {
        refineBtn.disabled = true;
    }

    const success = await requestRefinementInternal(refinementText);
    
    if (success) {
        AppState.selectedProposal.haircolor = otherColorKey;
        updateColorSwitchButton(otherColorKey);
    }

    if (switchColorBtn) {
        switchColorBtn.disabled = false;
    }
     if (refineBtn) {
        refineBtn.disabled = false;
    }
}


/**
 * [Internal] 画像微調整の共通ロジック
 */
async function requestRefinementInternal(refinementText) {
    const generatedImageElement = document.getElementById('generated-image');
    const refinementSpinner = document.getElementById('refinement-spinner');
    
    const saveBtn = document.getElementById('save-generated-image-to-db-btn');
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'この合成画像を保存する';
        saveBtn.classList.remove('btn-success');
        saveBtn.classList.add('btn-primary');
    }

    if (!AppState.generatedImageUrl || !AppState.generatedImageUrl.startsWith('data:image')) {
        alert("微調整の元になる画像データが見つかりません。");
        return false;
    }
    if (!AppState.userProfile.firebaseUid) {
        alert("ユーザー情報が取得できていません。");
        return false;
    }

    try {
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
        return true; // 成功

    } catch (error) {
        console.error("[requestRefinementInternal] Error:", error);
        alert(`画像の修正に失敗しました。\n詳細: ${error.message}`);
        return false; // 失敗
    } finally {
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

        const uploadResult = await saveImageToGallery(
            AppState.firebase.firestore,
            AppState.firebase.storage,
            AppState.userProfile.firebaseUid,
            imageFile,
            `favorite_generated_${Date.now()}`
            // (お気に入り保存は高速なので進捗コールバックは省略)
        );
        
        console.log("[handleSaveGeneratedImage] Upload and save successful:", uploadResult.url);

        if (saveBtn) {
            saveBtn.textContent = '✔️ 保存済み';
            saveBtn.classList.remove('btn-primary');
            saveBtn.classList.add('btn-success');
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
    
    const switchColorBtn = document.getElementById('switch-color-btn');
    if (phaseId === 'phase6' && switchColorBtn) {
        switchColorBtn.style.display = 'none';
    }

    const loadingText = document.createElement('p');
    loadingText.textContent = '画像を生成中...';
    loadingText.className = 'capture-loading-text no-print';
    targetElement.appendChild(loadingText);
    loadingText.style.visibility = 'visible';

    try {
        const canvas = await html2canvas(targetElement, {
            scale: 2,
            useCORS: true,
            onclone: (clonedDoc) => {
                clonedDoc.getElementById(phaseId)?.querySelector('.card')
                    ?.querySelectorAll('.no-print').forEach(btn => btn.style.visibility = 'hidden');
                if (phaseId === 'phase6') {
                    const clonedSwitchBtn = clonedDoc.getElementById('switch-color-btn');
                    if (clonedSwitchBtn) clonedSwitchBtn.style.display = 'none';
                }
                const clonedLoadingText = clonedDoc.querySelector('.capture-loading-text');
                if (clonedLoadingText) clonedLoadingText.style.visibility = 'hidden';
            }
        });

        updateCaptureLoadingText(loadingText, '画像をアップロード中...');
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const generatedFile = new File([blob], fileName, { type: 'image/png' });

        const uploadResult = await saveImageToGallery(
            AppState.firebase.firestore,
            AppState.firebase.storage,
            AppState.userProfile.firebaseUid,
            generatedFile,
            `capture_${phaseId}_${Date.now()}`
            // (キャプチャ保存は高速なので進捗コールバックは省略)
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
        if (phaseId === 'phase6' && switchColorBtn && switchColorBtn.dataset.otherColorKey) {
            switchColorBtn.style.display = 'block';
        }
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
    // ▼▼▼ ★★★ スマホ停止バグ修正 (アーキテクチャ変更) ★★★ ▼▼▼
    // AppState.uploadPromises (開始されたタスク) の数でチェックする
    return requiredItems.every(item => AppState.uploadPromises[item]);
    // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
}

function isProposalSelected() {
    return !!AppState.selectedProposal.hairstyle && !!AppState.selectedProposal.haircolor;
}

/**
 * カラー切替ボタンのテキストと状態を、現在の選択に基づいて更新する
 */
function updateColorSwitchButton(currentSelectedColorKey) {
    const switchColorBtn = document.getElementById('switch-color-btn');
    if (!switchColorBtn || !AppState.aiProposal || !AppState.aiProposal.haircolors) return;

    const otherColorKey = currentSelectedColorKey === 'color1' ? 'color2' : 'color1';
    const otherColor = AppState.aiProposal.haircolors[otherColorKey];

    if (otherColor && otherColor.name) {
        switchColorBtn.textContent = `「${otherColor.name}」に変更する`;
        switchColorBtn.dataset.otherColorKey = otherColorKey;
        switchColorBtn.style.display = 'block';
        switchColorBtn.disabled = false;
    } else {
        switchColorBtn.style.display = 'none';
    }
}


// --- Main App Initialization ---
async function main() {
    console.log("[main] >>> Function execution started.");
    let loadingScreenHidden = false;

    try {
        console.log("[main] Initializing Firebase App (yhd-db)...");
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const storage = getStorage(app);
        const firestore = getFirestore(app);
        AppState.firebase = { app, auth, storage, firestore };
        console.log("[main] Firebase service instances obtained (Auth, Storage, Firestore).");

        console.log(`[main] Initializing LIFF and Auth... LIFF ID: ${AppState.liffId}`);
        const { user, profile } = await initializeLiffAndAuth(AppState.liffId, auth);
        console.log("[main] LIFF Auth successful.");

        console.log("[main] Parsing URL search parameters...");
        const urlParams = new URLSearchParams(window.location.search);
        const adminCustomerId = urlParams.get('customerId');
        const adminCustomerName = urlParams.get('customerName');
        
        AppState.userProfile = { ...AppState.userProfile, ...profile };
        AppState.userProfile.userId = profile.userId;
        
        if (adminCustomerId && adminCustomerName) {
            console.log(`[main] Admin parameters found: customerId=${adminCustomerId}, customerName=${adminCustomerName}`);
            AppState.userProfile.viaAdmin = true;
            AppState.userProfile.adminCustomerName = adminCustomerName;
            AppState.userProfile.firebaseUid = adminCustomerId;
            AppState.userProfile.displayName = adminCustomerName;
            
            console.warn(`[main] OVERRIDE: Firebase UID set to customerId: ${adminCustomerId}`);
            console.warn(`[main] OVERRIDE: DisplayName set to customerName: ${adminCustomerName}`);
            
        } else {
            AppState.userProfile.firebaseUid = user.uid;
            AppState.userProfile.displayName = profile.displayName || "ゲスト";
            
            console.log("[main] Firebase UID set from Auth:", user.uid);
        }
        
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
main();