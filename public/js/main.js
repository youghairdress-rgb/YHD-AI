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
    saveImageToGallery, // 写真・保存用
    uploadFileToStorageOnly, // 動画用
    requestAiDiagnosis,
    requestImageGeneration,
    requestRefinement
} from './api.js';

// --- yhd-db の Firebase 設定 (yhdapp/public/admin/firebase-init.js と同じ) ---
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
    liffId: '2008345232-pVNR18m1', // (確認済み)
    userProfile: {
        displayName: "ゲスト",
        userId: null,       // LIFF User ID
        pictureUrl: null,
        statusMessage: null,
        firebaseUid: null,  // Firebase Auth UID (顧客IDまたは本人のUID)
        viaAdmin: false,  // 管理画面経由フラグ
        adminCustomerName: null // 管理画面から渡された名前
    },
    gender: 'female',
    
    // ▼▼▼ ★★★ awaitしない方式（ハングアップ回避） ★★★ ▼▼▼
    // uploadedFiles: {}, // File オブジェクトは保持しない
    
    /**
     * アップロードタスク（Promise）を保持する。
     * { 'item-front-photo': Promise<{url: string, ...}>, ... }
     */
    uploadTasks: {}, 
    
    /**
     * アップロード完了後のURLを保持する。
     * { 'item-front-photo': 'https://...', ... }
     */
    uploadedFileUrls: {}, 
    // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲

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

        setTextContent('display-name', AppState.userProfile.displayName || "ゲスト");
        
        const genderRadio = document.querySelector(`input[name="gender"][value="${AppState.gender}"]`);
        if (genderRadio) genderRadio.checked = true;

        console.log("[initializeAppUI] User info pre-filled for phase2.");

        // 必ずフェーズ1から開始
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

    // ▼▼▼ ★★★ 最終修正: `await` しない方式（ハングアップ回避） ★★★ ▼▼▼
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
                
                // 既存のタスクが進行中ならキャンセル（ボタン連打対策）
                // (注: AppState.uploadTasks[itemId] が Promise であれば、ですが、
                //    ここではシンプルにUIをリセットするだけに留めます)
                if (button.disabled) {
                     console.warn(`[FileSelected] ${itemId} is already processing.`);
                     return;
                }

                const file = event.target.files?.[0];
                if (!file) {
                    console.log(`[FileSelected] No file selected for ${itemId}.`);
                    event.target.value = null;
                    return;
                }

                // ▼▼▼ ★★★ 新規追加: ファイルタイプ検証 ★★★ ▼▼▼
                const isVideoInput = itemId.includes('video');
                const isPhotoInput = !isVideoInput;
                const isVideoFile = file.type.startsWith('video/');
                const isPhotoFile = file.type.startsWith('image/');

                if (isVideoInput && !isVideoFile) {
                    alert("動画（🎬）が選択されていません。\n「動画：正面」と「動画：バック」の項目では、写真ではなく動画ファイル（.mov または .mp4）を選択するか、カメラをビデオモードに切り替えて撮影してください。");
                    // UIをリセット
                    button.disabled = false;
                    event.target.value = null; // inputをクリア
                    return; // 処理を中断
                }
                
                if (isPhotoInput && !isPhotoFile) {
                    alert("写真（📷）が選択されていません。\n写真の項目では、動画ではなく写真ファイルを選択してください。");
                    // UIをリセット
                    button.disabled = false;
                    event.target.value = null; // inputをクリア
                    return; // 処理を中断
                }
                // ▲▲▲ ★★★ 検証ここまで ★★★ ▲▲▲


                // (1) UIを「処理中...」に変更
                button.textContent = '処理中...';
                button.disabled = true;
                if (iconDiv) iconDiv.classList.remove('completed'); // アイコンをリセット
                
                // AppStateをリセット
                delete AppState.uploadTasks[itemId];
                delete AppState.uploadedFileUrls[itemId];
                checkAllFilesUploaded(false); // 診断ボタンを一時的に無効化

                // (2) 圧縮処理 (Promiseベース)
                let processingPromise;
                if (isPhotoFile && file.type !== 'image/gif') { // 'file.type' を使う (isPhotoFile)
                    console.log(`[FileSelected] ${itemId} (Image): ${file.name}. Compressing...`);
                    processingPromise = compressImage(file).catch(compressError => {
                        console.warn(`[FileSelected] ${itemId} compression failed. Using original file.`, compressError);
                        return file; // 圧縮に失敗しても元のファイルで続行
                    });
                } else if (isVideoFile) { // 'file.type' を使う (isVideoFile)
                    // ★★★ 動画サイズチェック ★★★
                    const fileSizeMB = file.size / 1024 / 1024;
                    if (fileSizeMB > 50) { // 50MBを超える場合
                        alert(`動画ファイルのサイズが ${fileSizeMB.toFixed(1)}MB と非常に大きいです。\nアップロードに時間がかかるか、失敗する可能性があります。\n\n（可能であれば、より短い動画（3〜5秒程度）で再度お試しください）`);
                    }
                    processingPromise = Promise.resolve(file); // 動画は圧縮しない
                } else {
                    console.log(`[FileSelected] ${itemId} (Other): ${file.name}. Skipping compression.`);
                    processingPromise = Promise.resolve(file);
                }

                // (3) 圧縮完了後、アップロードを "開始" (await しない)
                // (onProgressコールバックを定義)
                const onUploadProgress = (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    if (button) {
                        button.textContent = `ｱｯﾌﾟﾛｰﾄﾞ中 ${Math.round(progress)}%`;
                    }
                };
                
                // (4) uploadTask (Promise) を AppState に保存
                //    processingPromise (圧縮) が終わってから...
                AppState.uploadTasks[itemId] = processingPromise.then(fileToUpload => {
                    
                    button.textContent = 'ｱｯﾌﾟﾛｰﾄﾞ中 0%'; // UIを更新

                    if (isVideoInput) {
                        // (a) 動画の場合 (Storage Only)
                        console.log(`[FileSelected] Starting upload (Storage Only): ${itemId}`);
                        return uploadFileToStorageOnly(
                            AppState.firebase.storage,
                            AppState.userProfile.firebaseUid,
                            fileToUpload,
                            itemId,
                            onUploadProgress // 進捗コールバックを渡す
                        );
                    } else {
                        // (b) 写真の場合 (Save to Gallery)
                        console.log(`[FileSelected] Starting upload (Save to Gallery): ${itemId}`);
                        return saveImageToGallery(
                            AppState.firebase.firestore,
                            AppState.firebase.storage,
                            AppState.userProfile.firebaseUid,
                            fileToUpload,
                            itemId,
                            onUploadProgress // 進捗コールバックを渡す
                        );
                    }

                }).then(result => {
                    // (5) アップロード完了時 (Promise 成功)
                    console.log(`[UploadSuccess] ${itemId} finished.`);
                    button.textContent = '✔️ 撮影済み';
                    button.classList.remove('btn-outline');
                    button.classList.add('btn-success');
                    if (iconDiv) iconDiv.classList.add('completed');
                    
                    AppState.uploadedFileUrls[itemId] = result.url; // URLを保存
                    checkAllFilesUploaded(areAllFilesUploaded()); // 全て揃ったか再チェック
                    
                    return result; // Promiseチェーンのために結果を返す

                }).catch(error => {
                    // (6) アップロード失敗時 (Promise 失敗)
                    console.error(`[UploadFailed] Error processing file for ${itemId}:`, error);
                    alert(`「${itemId}」のアップロードに失敗しました: ${error.message}`);
                    
                    // UIを元に戻す
                    button.textContent = '撮影';
                    button.disabled = false;
                    button.classList.add('btn-outline');
                    button.classList.remove('btn-success');
                    if (iconDiv) iconDiv.classList.remove('completed');

                    // AppStateをリセット
                    delete AppState.uploadTasks[itemId];
                    delete AppState.uploadedFileUrls[itemId];
                    checkAllFilesUploaded(false);
                    
                    // エラーを re-throw して、上位の catch (Promise.all) に伝える
                    throw error; 
                
                }).finally(() => {
                    // (7) 成功・失敗問わず、input の値をクリア
                    event.target.value = null;
                });
                
                // ★★★ ここで await しない ★★★
                console.log(`[FileSelected] ${itemId} processing task stored.`);
            });
        }
    });
    // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲

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

    // Phase 6: Refine Button (手動微調整)
    document.getElementById('refine-image-btn')?.addEventListener('click', handleImageRefinementRequest);

    // カラー切替ボタンのリスナー
    document.getElementById('switch-color-btn')?.addEventListener('click', handleColorSwitchRequest);

    // Phase 6: Share Button
    document.getElementById('share-phase6-btn')?.addEventListener('click', () => {
        captureAndShareImage('phase6', 'AI合成画像.png');
    });

    // Phase 6: Save to DB Button
    document.getElementById('save-generated-image-to-db-btn')?.addEventListener('click', handleSaveGeneratedImage);

    // 終了ボタンのリスナー
    document.getElementById('close-liff-btn')?.addEventListener('click', () => {
        if (liff && liff.closeWindow) {
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

        // ▼▼▼ ★★★ awaitしない方式（ハングアップ回避） ★★★ ▼▼▼
        // (1) 登録されたタスク（Promise）のリストを取得
        const requiredKeys = [
            'item-front-photo', 'item-side-photo', 'item-back-photo', 
            'item-front-video', 'item-back-video'
        ];
        const tasks = requiredKeys.map(key => AppState.uploadTasks[key]);

        // (2) 不足しているタスクがないかチェック
        if (tasks.some(task => !task)) {
             // (このエラーは本来 areAllFilesUploaded() で防がれているはず)
             throw new Error("アップロードタスクが不足しています。");
        }

        // (3) UIを更新し、Promise.all ですべてのタスク完了を待つ
        updateStatusText('全ファイルのアップロード完了を待機中...');
        
        // ★★★★★ ここが重要 ★★★★★
        // (ここで初めて await する)
        await Promise.all(tasks);
        // ★★★★★★★★★★★★★★★★★

        console.log("[handleDiagnosisRequest] All 5 upload tasks (Promises) resolved.");
        // (この時点で AppState.uploadedFileUrls には 5つのURLが揃っているはず)
        // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲


        // (4) fileUrls が5つ揃っているか最終チェック
        const missingKeys = requiredKeys.filter(key => !AppState.uploadedFileUrls[key]);
        if (missingKeys.length > 0) {
            throw new Error(`AIへのリクエストに必要なファイルURLが不足しています: ${missingKeys.join(', ')}`);
        }

        updateStatusText('AIに診断をリクエスト中...');
        // 短い待機を挟んで、ブラウザにUIの再描画を強制する
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms待機

        // (5) AIへのリクエストデータを作成
        const requestData = {
            fileUrls: AppState.uploadedFileUrls, // 完了したURL
            userProfile: {
                userId: AppState.userProfile.userId,
                displayName: AppState.userProfile.displayName,
                firebaseUid: AppState.userProfile.firebaseUid
            },
            gender: AppState.gender
        };
        
        // (6) Cloud Function を呼び出す
        const responseData = await requestAiDiagnosis(requestData);
        console.log("[handleDiagnosisRequest] Diagnosis response received.");

        AppState.aiDiagnosisResult = responseData.result;
        AppState.aiProposal = responseData.proposal;

        displayDiagnosisResult(AppState.aiDiagnosisResult);
        changePhase('phase4');

    } catch (error) {
        console.error("[handleDiagnosisRequest] Error:", error);
        
        updateStatusText('エラーが発生しました。');
        alert(`診断リクエストの処理中にエラーが発生しました。\n詳細: ${error.message}`);
        
        // フェーズ3に戻す
        changePhase('phase3');
        
        // ★ 失敗したタスク（とURL）のみリセット
        document.querySelectorAll('.upload-item').forEach(item => {
            const button = item.querySelector('button');
            const iconDiv = item.querySelector('.upload-icon');
            // URLが（まだ）無い ＝ 失敗したタスク
            if (button && !AppState.uploadedFileUrls[item.id]) {
                button.textContent = '撮影';
                button.classList.add('btn-outline');
                button.classList.remove('btn-success');
                button.disabled = false;
                if (iconDiv) iconDiv.classList.remove('completed');
                delete AppState.uploadTasks[item.id]; // タスク(Promise)も削除
            }
        });
        checkAllFilesUploaded(areAllFilesUploaded());

    } finally {
        // (requestBtn は changePhase('phase4') または changePhase('phase3') で
        //  非表示になるか、上記エラーハンドラでリセットされるので、ここでは何もしない)
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
    
    // カラー切替ボタンを非表示/リセット
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
    
    // ★★★ awaitしない方式（ハングアップ回避） ★★★
    // (この時点では AppState.uploadedFileUrls が使われる)
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
        
        // カラー切替ボタンを設定
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

    // カラー切替ボタンを無効化
    const switchColorBtn = document.getElementById('switch-color-btn');
    if (switchColorBtn) {
        switchColorBtn.disabled = true;
    }
    if (refineBtn) {
        refineBtn.disabled = true;
        refineBtn.textContent = '修正中...';
    }

    // 汎用リクエスト関数を呼び出す
    const success = await requestRefinementInternal(refinementText);

    if (success) {
        if (input) input.value = ''; // 成功したらテキストをクリア
         // 手動微調整後は、提案カラーが不明になるため切替ボタンを隠す
         if (switchColorBtn) {
             switchColorBtn.style.display = 'none';
         }
    }

    // ボタンの状態を戻す
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
    
    // ボタンを無効化
    if (switchColorBtn) {
        switchColorBtn.disabled = true;
        switchColorBtn.textContent = `「${otherColor.name}」に変更中...`;
    }
    if (refineBtn) {
        refineBtn.disabled = true; // 手動微調整も無効化
    }

    // 汎用リクエスト関数を呼び出す
    const success = await requestRefinementInternal(refinementText);
    
    if (success) {
        // 成功した場合、グローバルステートとボタンの表示を更新
        AppState.selectedProposal.haircolor = otherColorKey;
        updateColorSwitchButton(otherColorKey); // ボタンを「元に戻す」ように設定
    }

    // ボタンの状態を戻す
    if (switchColorBtn) {
        switchColorBtn.disabled = false;
        // (updateColorSwitchButton がテキストを最終設定するので、ここでは不要)
    }
     if (refineBtn) {
        refineBtn.disabled = false; // 手動微調整を再度有効化
    }
}


/**
 * [Internal] 画像微調整の共通ロジック
 * @param {string} refinementText - AIに送る指示テキスト
 * @returns {Promise<boolean>} - 成功したかどうか
 */
async function requestRefinementInternal(refinementText) {
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

        // saveImageToGallery を使用 (進捗コールバックはなし)
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
    
    // カラー切替ボタンも隠す
    const switchColorBtn = document.getElementById('switch-color-btn');
    if (phaseId === 'phase6' && switchColorBtn) {
        switchColorBtn.style.display = 'none';
    }

    // DOMにローディングテキストを追加
    const loadingText = document.createElement('p');
    loadingText.textContent = '画像を生成中...';
    loadingText.className = 'capture-loading-text no-print'; // 'no-print' をつけておく
    targetElement.appendChild(loadingText);
    loadingText.style.visibility = 'visible'; // 強制表示

    try {
        const canvas = await html2canvas(targetElement, {
            scale: 2,
            useCORS: true,
            // html2canvas の onclone を使って、クローンされたDOMに対しても非表示を適用
            onclone: (clonedDoc) => {
                clonedDoc.getElementById(phaseId)?.querySelector('.card')
                    ?.querySelectorAll('.no-print').forEach(btn => btn.style.visibility = 'hidden');
                
                if (phaseId === 'phase6') {
                    const clonedSwitchBtn = clonedDoc.getElementById('switch-color-btn');
                    if (clonedSwitchBtn) clonedSwitchBtn.style.display = 'none';
                }
                // クローン側ではローディングテキストを非表示にする
                const clonedLoadingText = clonedDoc.querySelector('.capture-loading-text');
                if (clonedLoadingText) clonedLoadingText.style.visibility = 'hidden';
            }
        });

        updateCaptureLoadingText(loadingText, '画像をアップロード中...');
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const generatedFile = new File([blob], fileName, { type: 'image/png' });

        // saveImageToGallery を使用 (進捗コールバックはなし)
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
        // 実行後、ボタンとローディングテキストを元に戻す
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
    // ▼▼▼ ★★★ awaitしない方式（ハングアップ回避） ★★★ ▼▼▼
    // (URLが揃っているかどうかで判断)
    return requiredItems.every(item => AppState.uploadedFileUrls[item]);
    // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
}

function isProposalSelected() {
    return !!AppState.selectedProposal.hairstyle && !!AppState.selectedProposal.haircolor;
}

/**
 * カラー切替ボタンのテキストと状態を、現在の選択に基づいて更新する
 * @param {string} currentSelectedColorKey - *今表示されている*画像のカラーキー (例: 'color1')
 */
function updateColorSwitchButton(currentSelectedColorKey) {
    const switchColorBtn = document.getElementById('switch-color-btn');
    if (!switchColorBtn || !AppState.aiProposal || !AppState.aiProposal.haircolors) return;

    // (1) もう一方のキーを見つける
    const otherColorKey = currentSelectedColorKey === 'color1' ? 'color2' : 'color1';
    const otherColor = AppState.aiProposal.haircolors[otherColorKey];

    if (otherColor && otherColor.name) {
        // (2) ボタンのテキストとデータを設定
        switchColorBtn.textContent = `「${otherColor.name}」に変更する`;
        switchColorBtn.dataset.otherColorKey = otherColorKey;
        // (3) ボタンを表示
        switchColorBtn.style.display = 'block';
        switchColorBtn.disabled = false;
    } else {
        // (4) もう一方のカラーが見つからない場合は隠す
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
        
        // (1) 先にLINEプロフィールをAppStateのベースにセット
        AppState.userProfile = { ...AppState.userProfile, ...profile };
        AppState.userProfile.userId = profile.userId; // LIFF User ID を確実にセット
        
        if (adminCustomerId && adminCustomerName) {
            // (2) 管理者経由の場合、必要な情報で上書き
            console.log(`[main] Admin parameters found: customerId=${adminCustomerId}, customerName=${adminCustomerName}`);
            AppState.userProfile.viaAdmin = true;
            AppState.userProfile.adminCustomerName = adminCustomerName;
            
            // 保存先(firebaseUid)は「顧客ID」
            AppState.userProfile.firebaseUid = adminCustomerId;
            // 表示名(displayName)は「顧客名」
            AppState.userProfile.displayName = adminCustomerName;
            
            console.warn(`[main] OVERRIDE: Firebase UID set to customerId: ${adminCustomerId}`);
            console.warn(`[main] OVERRIDE: DisplayName set to customerName: ${adminCustomerName}`);
            
        } else {
            // (3) 顧客が直接アクセスした場合
            // 保存先(firebaseUid)は「本人のUID」
            AppState.userProfile.firebaseUid = user.uid;
            // 表示名(displayName)は「本人のLINE名」
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
// (index.html から type="module" でロードされるため、最後に実行する)
main();