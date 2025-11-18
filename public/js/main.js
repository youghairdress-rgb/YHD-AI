/**
 * main.js
 * アプリケーションのメインロジック、状態管理、イベントリスナー
 * (ES Module 形式)
 */

// ▼▼▼ ★★★ 修正: helpers.js から logger をインポート ★★★ ▼▼▼
import { logger } from './helpers.js';

// ▼▼▼ ★★★ 修正: ui.js からUI関数をインポート (initializeUISelectors, initializeUI を追加) ★★★ ▼▼▼
import {
  initializeUISelectors,
  initializeUI,
  showPhase,
  toggleLoader,
  showError,
  updateUploadPreview,
  displayDiagnosisResult,
  displayProposal,
  displayGeneratedImage
} from './ui.js';

// ▼▼▼ ★★★ 修正: api.js からAPI関数をインポート ★★★ ▼▼▼
import {
  requestFirebaseCustomToken,
  uploadFileToStorage,
  uploadFileToStorageOnly,
  saveImageToGallery,
  requestDiagnosis,
  generateHairstyleImage,
  refineHairstyleImage
} from './api.js';
// ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲


// --- Firebase SDK (クライアント) ---
// Firebase App (required)
import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
// Authentication
import {
  getAuth,
  signInWithCustomToken,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
// Storage
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-storage.js";
// Firestore
import {
    getFirestore,
    collection,
    addDoc,
    serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";


// --- アプリケーション状態管理 ---
// ▼▼▼ ★★★ 修正: appState をグローバル (window) から export に変更 ★★★ ▼▼▼
export const appState = {
  // ▼▼▼ ★★★ 修正: yhd-db (Functions v10, Node 18) のFirebaseプロジェクト設定 ★★★ ▼▼▼
  firebaseConfig: {
    // ★★★ ユーザーが入力した yhd-ai の設定を反映 ★★★
    apiKey: "AIzaSyD7f_GTwM7ee6AgMjwCRetyMNlVKDpb3_4",
    authDomain: "yhd-ai.firebaseapp.com",
    projectId: "yhd-ai",
    storageBucket: "yhd-ai.firebasestorage.app", // ★ おそらく yhd-db.appspot.com の間違い
    messagingSenderId: "757347798313",
    appId: "1:757347798313:web:e64c91b4e8b0e8bfc33b38",
    measurementId: "G-D26PT4FYPR"
  },
  // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲

  // ▼▼▼ ★★★ 修正: yhd-ai (Functions v12, Node 22) の Cloud Functions エンドポイント ★★★ ▼▼▼
  // 注意: firebase.json のリライト設定に基づき、yhd-ai の "Hosting URL" を指定
  apiBaseUrl: "https://yhd-ai.web.app", // yhd-ai のホスティングURL
  // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲

  liffId: "2008345232-pVNR18m1", // YHD AIパーソナル診断
  
  // ▼▼▼ ★★★ 修正: 認証とユーザー情報の持ち方を変更 ★★★ ▼▼▼
  auth: null,
  storage: null,
  db: null,
  
  user: {
      liffAccessToken: null, // LIFFのアクセストークン
      lineUserId: null,      // LIFFから取得したLINE User ID
      firebaseUid: null,     // Firebase AuthのUID (LINE User IDと同一)
      isLoggedIn: false,
  },
  // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲

  currentPhase: 1,
  
  // ▼▼▼ ★★★ 修正: ファイル管理のロジックを変更 ★★★ ▼▼▼
  // ユーザーがアップロードしたファイル（BlobまたはFileオブジェクト）を保持
  uploadedFiles: {
    "item-front-photo": null,
    "item-side-photo": null,
    "item-back-photo": null,
    "item-front-video": null,
    "item-back-video": null,
    "item-inspiration-photo": null, // ご希望写真
  },
  // Storageにアップロードした後の公開URLを保持
  uploadedFileUrls: {
    "item-front-photo": null,
    "item-side-photo": null,
    "item-back-photo": null,
    "item-front-video": null,
    "item-back-video": null,
    // "item-inspiration-photo": null, // ★診断には不要
  },
  // ご希望写真のURL (フェーズ5, 6で使用)
  inspirationImageUrl: null, 
  // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
  
  userProfile: {
    name: "",
    gender: "", // "male", "female", "other"
  },
  
  // AI診断結果
  diagnosisResult: null, // AIからのレスポンス(result, proposal)
  
  // フェーズ5での選択
  selectedHairstyle: {
    name: null,
    description: null,
  },
  selectedHaircolor: {
    name: null,
    description: null,
  },
  
  // フェーズ6での生成結果
  generatedImageCache: {
      base64: null,
      mimeType: null,
  },
  
  // ★★★ 修正: firebase SDK の関数を api.js から使えるようアタッチ
  firebase: {
      storage: {
          ref,
          uploadBytes,
          getDownloadURL,
      },
      firestore: {
          collection,
          addDoc,
          serverTimestamp,
      }
  }
};
// ▲▲▲ ★★★ 修正ここまで (appState) ★★★ ▲▲▲


// --- ロガー ---
// (helpers.js からインポート済み)

// ▼▼▼ ★★★ 修正: DOM読み込み前に実行されるため、letで宣言のみ ★★★ ▼▼▼
let qs, qsAll;
let uploadButtons = {};
let uploadPreviews = {};
let skipInspirationBtn;
let hairstylesContainer, haircolorsContainer;
let generatedImage, refineInput, saveButton;
let prevBtn, nextBtn;
// --- DOM取得ここまで ---
// ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲


// --- 初期化 ---
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // 1. Firebase (yhd-db) の初期化
    logger.log(`[Main] Initializing Firebase for yhd-db (Project ID: ${appState.firebaseConfig.projectId})...`);
    const firebaseApp = initializeApp(appState.firebaseConfig);
    
    // 2. Auth, Storage, Firestore (yhd-db) のインスタンスを取得
    appState.auth = getAuth(firebaseApp);
    appState.storage = getStorage(firebaseApp);
    appState.db = getFirestore(firebaseApp);

    // ▼▼▼ ★★★ 修正: DOM要素の取得を DOMContentLoaded の "中" に移動 ★★★ ▼▼▼
    
    // 3. UIセレクタを初期化 (ui.js)
    initializeUISelectors();
    
    // 4. UIの内部イベントリスナーを初期化 (ui.js)
    initializeUI();
    
    // 5. main.js で使用するDOMセレクタを定義 (ui.js の qs を利用)
    qs = (selector) => document.querySelector(selector);
    qsAll = (selector) => document.querySelectorAll(selector);
    
    uploadButtons = {
      front: qs("#upload-front-photo"),
      side: qs("#upload-side-photo"),
      back: qs("#upload-back-photo"),
      frontVideo: qs("#upload-front-video"),
      backVideo: qs("#upload-back-video"),
      inspiration: qs("#upload-inspiration-photo"),
    };
    uploadPreviews = {
      inspiration: qs("#preview-inspiration-photo"),
    };
    skipInspirationBtn = qs("#skip-inspiration-photo");
    hairstylesContainer = qs("#hairstyles-container");
    haircolorsContainer = qs("#haircolors-container");
    generatedImage = qs("#generated-image");
    refineInput = qs("#refine-text");
    saveButton = qs("#save-to-gallery-btn");
    prevBtn = qs("#prev-btn");
    nextBtn = qs("#next-btn");
    
    // 6. null チェック (必須要素)
    // ★★★ エラー (image_d0753d.png) の原因箇所 ★★★
    if (!prevBtn || !nextBtn || !hairstylesContainer || !haircolorsContainer) {
        // ★★★ HTML側のID定義 (index.html) と、ui.js の qs() が一致しているか確認してください ★★★
        throw new Error("必須のDOM要素 (prevBtn, nextBtn, containers) が見つかりません。HTMLを確認してください。");
    }
    // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲

    
    // 7. LIFFの初期化とFirebase認証
    logger.log(`[Main] Initializing LIFF (ID: ${appState.liffId})...`);
    await initializeLiffAndAuth();

    // 8. 認証状態の監視
    setupAuthObserver();

    // 9. すべてのイベントリスナーをセットアップ
    logger.log("[Main] Setting up all event listeners...");
    initializeEventListeners();
    
  } catch (error) {
    logger.error("[Main] Initialization failed:", error);
    // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
    showError(`初期化に失敗しました: ${error.message}`);
    toggleLoader(false);
    // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
  }
});

/**
 * LIFFの初期化とFirebaseへのカスタムトークン認証を行う
 */
// ▼▼▼ ★★★ 修正: window. プレフィックスを削除 ★★★ ▼▼▼
async function initializeLiffAndAuth() {
  try {
    // 1. LIFFの初期化
    await liff.init({liffId: appState.liffId});
    
    if (!liff.isLoggedIn()) {
      logger.warn("[Auth] LIFF not logged in. Redirecting to login...");
      // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
      toggleLoader(true, "LINEにログインしています...");
      // 開発中のローカル環境 (http://localhost:5001) でログインが機能しない場合がある
      // その場合はデプロイ後のURL (https://yhd-ai.web.app) でテストする必要がある
      liff.login();
      return; // ログインページへのリダイレクトが開始される
    }

    // 2. LIFFアクセストークンとプロファイルの取得
    const accessToken = liff.getAccessToken();
    const profile = await liff.getProfile();
    
    appState.user.liffAccessToken = accessToken;
    appState.user.lineUserId = profile.userId;

    // 3. Firebase Auth へのカスタムトークンサインイン
    logger.log(`[Auth] LIFF login successful (LINE UID: ${profile.userId}). Requesting Firebase custom token...`);
    
    // api.js (yhd-db Functions) を呼び出してカスタムトークンを取得
    // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
    const tokenResponse = await requestFirebaseCustomToken(accessToken);
    
    if (!tokenResponse || !tokenResponse.customToken) {
      throw new Error("Failed to retrieve Firebase custom token.");
    }

    // 4. カスタムトークンでFirebaseにサインイン
    const userCredential = await signInWithCustomToken(appState.auth, tokenResponse.customToken);
    const firebaseUser = userCredential.user;
    
    appState.user.firebaseUid = firebaseUser.uid;
    appState.user.isLoggedIn = true;

    logger.log(`[Auth] Firebase sign-in successful (Firebase UID: ${firebaseUser.uid}).`);
    
    // 5. ユーザー名をフェーズ2の入力欄にセット
    if (profile.displayName) {
        // ▼▼▼ ★★★ 修正: HTMLのID 'username-input' に合わせる ★★★ ▼▼▼
        const nameInput = qs("#username-input");
        // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
        if(nameInput) {
            nameInput.value = profile.displayName;
        }
    }

    // 6. UIの有効化
    // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
    toggleLoader(false);
    showPhase(appState.currentPhase); // フェーズ1を表示
  } catch (error) {
    logger.error("[Auth] LIFF or Firebase Auth initialization failed:", error);
    // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
    showError(`認証に失敗しました: ${error.message}\n(LINE ID: ${appState.liffId})`);
    toggleLoader(false);
    // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
  }
}

/**
 * Firebase Auth の認証状態を監視
 * (セッションが切れた場合などの対応)
 */
// ▼▼▼ ★★★ 修正: window. プレフィックスを削除 ★★★ ▼▼▼
function setupAuthObserver() {
    onAuthStateChanged(appState.auth, (user) => {
        if (user) {
            // ユーザーがサインインしている
            if (!appState.user.isLoggedIn) {
                // 状態が不一致（例: ページリロード）
                logger.log(`[Auth] Auth state observer: User ${user.uid} is signed in.`);
                appState.user.firebaseUid = user.uid;
                appState.user.isLoggedIn = true;
                // 必要であればLIFFトークンを再取得（通常は不要）
            }
        } else {
            // ユーザーがサインアウトしている
            logger.warn("[Auth] Auth state observer: User is signed out.");
            appState.user.isLoggedIn = false;
            // ログイン画面に強制遷移
            // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
            showError("セッションが切れました。再度ログインします。");
            toggleLoader(true, "再ログイン中...");
            // LIFFが初期化済みなら再度 liff.login() を試みる
            if (liff.isLoggedIn()) {
                 initializeLiffAndAuth().catch(err => {
                    logger.error("Re-authentication attempt failed:", err);
                    liff.login(); // 最終手段
                 });
            } else {
                liff.login();
            }
            // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
        }
    });
}


/**
 * すべてのUIイベントリスナーを初期化する
 */
// ▼▼▼ ★★★ 修正: window. プレフィックスを削除 ★★★ ▼▼▼
function initializeEventListeners() {
  // --- フェーズ1 (オープニング) ---
  setupPhase1Listeners();
  
  // --- フェーズ2 (プロフィール入力) ---
  setupPhase2Listeners();

  // --- フェーズ3 (素材アップロード) ---
  setupPhase3Listeners();
  
  // --- フェーズ4 (診断結果) ---
  setupPhase4Listeners();

  // --- フェーズ5 (提案選択) ---
  setupPhase5Listeners();

  // --- フェーズ6 (画像生成・微調整) ---
  setupPhase6Listeners();
  
  // --- 共通 (ページネーション) ---
  setupPaginationListeners();
}

// --- フェーズごとのリスナー設定 ---

function setupPhase1Listeners() {
  // (フェーズ1には「次へ」以外の操作なし)
}

function setupPhase2Listeners() {
  // (フェーズ2には「次へ」以外の操作なし)
}

function setupPhase3Listeners() {
  // 汎用ファイル入力ハンドラ
  const handleFileInput = (e, type, isVideo = false) => {
    const file = e.target.files[0];
    if (!file) return;

    // 1. 状態にファイル(Blob)を保存
    appState.uploadedFiles[type] = file;
    logger.log(`[Phase3] File selected for ${type}: ${file.name} (Size: ${file.size})`);

    // 2. プレビューを更新
    const objectURL = URL.createObjectURL(file);
    // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
    updateUploadPreview(type, objectURL, isVideo);
    // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
  };

  // 各種アップロードボタン
  uploadButtons.front.addEventListener("change", (e) => handleFileInput(e, "item-front-photo"));
  uploadButtons.side.addEventListener("change", (e) => handleFileInput(e, "item-side-photo"));
  uploadButtons.back.addEventListener("change", (e) => handleFileInput(e, "item-back-photo"));
  uploadButtons.frontVideo.addEventListener("change", (e) => handleFileInput(e, "item-front-video", true));
  uploadButtons.backVideo.addEventListener("change", (e) => handleFileInput(e, "item-back-video", true));
  
  // ★ ご希望写真
  uploadButtons.inspiration.addEventListener("change", (e) => handleFileInput(e, "item-inspiration-photo"));

  // ★ ご希望写真のスキップボタン
  skipInspirationBtn.addEventListener("click", () => {
    // 状態をクリア
    appState.uploadedFiles["item-inspiration-photo"] = null;
    appState.inspirationImageUrl = null;
    
    // プレビューをクリア
    uploadPreviews.inspiration.innerHTML = '<i class="fas fa-camera"></i>';
    uploadPreviews.inspiration.classList.remove("uploaded");
    uploadButtons.inspiration.querySelector("span").textContent = "ご希望写真を選択";
    
    // アラート（またはコンソールログ）
    logger.log("[Phase3] Inspiration photo skipped.");
    
    // ★ 即座に「次へ」ボタンを押下したのと同じ挙動（フェーズ4.1へ）
    // （注：他の必須ファイルがアップロードされている前提。
    //   nextBtn のリスナーで必須チェックが行われるので、nextBtn.click() が安全）
    nextBtn.click();
  });
}

function setupPhase4Listeners() {
  // (フェーズ4.1, 4.2 には「次へ」「戻る」以外の操作なし)
}

function setupPhase5Listeners() {
  // --- ヘアスタイルの選択 ---
  // ★ 修正: ui.js で動的に追加されるカードも対象にするため、コンテナに委任
  hairstylesContainer.addEventListener('click', (e) => {
    const targetCard = e.target.closest('.style-card');
    if (!targetCard) return;

    // すべてのスタイルカードの選択状態を解除
    qsAll('#hairstyles-container .style-card').forEach(card => card.classList.remove('selected'));
    
    // クリックされたカードを選択状態にする
    targetCard.classList.add('selected');

    // データを appState に保存
    appState.selectedHairstyle.name = targetCard.dataset.styleName;
    appState.selectedHairstyle.description = targetCard.dataset.styleDesc;
    
    logger.log(`[Phase5] Hairstyle selected: ${appState.selectedHairstyle.name}`);
  });


  // --- ヘアカラーの選択 ---
  // ★ 修正: ui.js で動的に追加されるカードも対象にするため、コンテナに委任
  haircolorsContainer.addEventListener('click', (e) => {
    const targetCard = e.target.closest('.color-card');
    if (!targetCard) return;

    // すべてのカラーカードの選択状態を解除
    qsAll('#haircolors-container .color-card').forEach(card => card.classList.remove('selected'));
    
    // クリックされたカードを選択状態にする
    targetCard.classList.add('selected');

    // データを appState に保存
    appState.selectedHaircolor.name = targetCard.dataset.colorName;
    appState.selectedHaircolor.description = targetCard.dataset.colorDesc;

    logger.log(`[Phase5] Haircolor selected: ${appState.selectedHaircolor.name}`);
  });
}

function setupPhase6Listeners() {
  // --- 微調整ボタン ---
  qs("#refine-btn").addEventListener("click", async () => {
    if (!appState.generatedImageCache.base64) {
      // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
      showError("先に画像を生成してください。");
      return;
    }
    const refinementText = refineInput.value;
    if (!refinementText || refinementText.trim() === "") {
      // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
      showError("微調整したい内容を入力してください（例: もっと明るく、前髪を短く）。");
      return;
    }

    logger.log(`[Phase6] Starting refinement... Text: ${refinementText}`);
    // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
    toggleLoader(true, "AIが画像を微調整中です...");
    saveButton.disabled = true;

    try {
      // Data URL を作成
      const dataUrl = `data:${appState.generatedImageCache.mimeType};base64,${appState.generatedImageCache.base64}`;

      // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
      const response = await refineHairstyleImage(
        dataUrl,
        appState.user.firebaseUid, // Firebase UID を使用
        refinementText
      );
      
      if (!response.imageBase64) {
          throw new Error("AI response did not contain imageBase64.");
      }

      // キャッシュと表示を更新
      appState.generatedImageCache.base64 = response.imageBase64;
      appState.generatedImageCache.mimeType = response.mimeType;
      // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
      displayGeneratedImage(response.imageBase64, response.mimeType);

      logger.log("[Phase6] Refinement successful.");
    } catch (error) {
      logger.error("[Phase6] Refinement failed:", error);
      // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
      showError(`画像の微調整に失敗しました: ${error.message}`);
    } finally {
      // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
      toggleLoader(false);
      saveButton.disabled = false;
    }
  });

  // --- 保存ボタン ---
  saveButton.addEventListener("click", async () => {
    if (!appState.generatedImageCache.base64) {
      // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
      showError("保存する画像がありません。");
      return;
    }
    if (!appState.user.isLoggedIn) {
        // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
        showError("保存機能を利用するにはログインが必要です。");
        return;
    }
    
    logger.log("[Phase6] Saving image to gallery...");
    // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
    toggleLoader(true, "ギャラリーに保存しています...");
    saveButton.disabled = true;

    try {
      // Data URL を作成
      const dataUrl = `data:${appState.generatedImageCache.mimeType};base64,${appState.generatedImageCache.base64}`;

      // api.js を呼び出す
      // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
      const result = await saveImageToGallery(
        appState.user.firebaseUid, // Firebase UID を使用
        dataUrl,
        appState.selectedHairstyle.name,
        appState.selectedHaircolor.name,
        refineInput.value // 最後の微調整テキスト（あれば）
      );

      logger.log("[Phase6] Save to gallery successful:", {firestoreId: result.docId, storagePath: result.path});
      
      // LIFFの closeWindow を呼び出してアプリを閉じる
      if (liff.isInClient()) {
          alert("保存しました！");
          liff.closeWindow();
      } else {
          alert("保存しました！ (LIFF外のためウィンドウは閉じません)");
      }
      
    } catch (error) {
      logger.error("[Phase6] Save to gallery failed:", error);
      // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
      showError(`ギャラリーへの保存に失敗しました: ${error.message}`);
    } finally {
      // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
      toggleLoader(false);
      saveButton.disabled = false;
    }
  });
}


/**
 * ページネーションボタン（次へ・戻る）の制御
 */
function setupPaginationListeners() {
  // --- 「次へ」ボタン ---
  nextBtn.addEventListener("click", async () => {
    // バリデーションと次のフェーズへの遷移
    const isValid = await validateAndTransitionNext(appState.currentPhase);
    
    if (isValid) {
      // フェーズ実行
      await handlePhaseLogic(appState.currentPhase);
    }
  });

  // --- 「戻る」ボタン ---
  prevBtn.addEventListener("click", () => {
    // 前のフェーズに戻る
    navigateToPreviousPhase(appState.currentPhase);
  });
}

/**
 * 「次へ」ボタン押下時のバリデーションと画面遷移
 * @param {number} currentPhase - 現在のフェーズ
 * @returns {Promise<boolean>} - バリデーションが成功したかどうか
 */
async function validateAndTransitionNext(currentPhase) {
  logger.log(`[Nav] Next button clicked on Phase ${currentPhase}`);
  
  switch (currentPhase) {
    case 1: // オープニング -> プロフィール
      appState.currentPhase = 2;
      break;
      
    case 2: // プロフィール -> 素材アップロード
      // ▼▼▼ ★★★ 修正: HTMLのIDとname 'username-input', 'gender-radio' に合わせる ★★★ ▼▼▼
      const username = qs("#username-input").value;
      const gender = qs('input[name="gender-radio"]:checked');
      // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
      if (!username || !gender) {
        // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
        showError("LINEユーザー名と性別を選択してください。");
        return false;
      }
      appState.userProfile.name = username;
      appState.userProfile.gender = gender.value;
      logger.log("[Phase2] Profile validated:", appState.userProfile);
      appState.currentPhase = 3;
      break;

    case 3: // 素材アップロード -> AI診断(ローディング)
      // ★ 修正: ご希望写真(inspiration) は任意項目なのでチェックから除外
      const requiredFiles = [
        "item-front-photo", "item-side-photo", "item-back-photo",
        "item-front-video", "item-back-video"
      ];
      const missingFiles = requiredFiles.filter(key => !appState.uploadedFiles[key]);

      if (missingFiles.length > 0) {
        // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
        showError(`必須の素材がアップロードされていません: ${missingFiles.join(", ")}`);
        return false;
      }
      logger.log("[Phase3] All required files validated.");
      appState.currentPhase = 4.1; // AI診断ローディングへ
      break;
      
    case 4.1: // ローディング中 (操作不可)
      return false;
      
    case 4.2: // 診断結果 -> 提案選択
      if (!appState.diagnosisResult) {
        // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
        showError("AI診断結果がありません。");
        return false;
      }
      appState.currentPhase = 5;
      
      // --- ★★★ 修正: ここで `displayProposal` を呼び出す ★★★ ---
      try {
        // ui.js の関数を呼び出し
        // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
        displayProposal(appState.diagnosisResult.proposal, appState.inspirationImageUrl);
        logger.log("[Nav] Phase 5 UI (Proposals) displayed.");
      } catch (e) {
        logger.error("[Nav] Failed to display Phase 5 UI:", e);
        // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
        showError("提案の表示に失敗しました。");
        return false;
      }
      // --- ★★★ 修正ここまで ★★★ ---
      break;

    case 5: // 提案選択 -> 画像生成(ローディング)
      if (!appState.selectedHairstyle.name || !appState.selectedHaircolor.name) {
        // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
        showError("ヘアスタイルとヘアカラーをそれぞれ選択してください。");
        return false;
      }
      // ★ 修正: ご希望スタイル/カラーが選ばれた場合、ご希望写真が必須
      if (appState.selectedHairstyle.name === 'inspiration_style' && !appState.inspirationImageUrl) {
          // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
          showError("「ご希望のヘアスタイル」を選択しましたが、ご希望の写真がアップロードされていません。フェーズ3に戻ってアップロードしてください。");
          return false;
      }
      if (appState.selectedHaircolor.name === 'inspiration_color' && !appState.inspirationImageUrl) {
          // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
          showError("「ご希望のヘアカラー」を選択しましたが、ご希望の写真がアップロードされていません。フェーズ3に戻ってアップロードしてください。");
          return false;
      }
      
      logger.log("[Phase5] Selections validated:", {style: appState.selectedHairstyle.name, color: appState.selectedHaircolor.name});
      appState.currentPhase = 6.1; // 画像生成ローディングへ
      break;
      
    case 6.1: // ローディング中 (操作不可)
      return false;
    
    case 6.2: // 最終結果 (操作不可)
      return false;
  }
  
  // 遷移先のフェーズを表示
  // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
  showPhase(appState.currentPhase);
  return true;
}

/**
 * 「戻る」ボタン押下時の画面遷移
 * @param {number} currentPhase - 現在のフェーズ
 */
function navigateToPreviousPhase(currentPhase) {
  logger.log(`[Nav] Back button clicked on Phase ${currentPhase}`);
  
  switch (currentPhase) {
    case 2: // プロフィール -> オープニング
      appState.currentPhase = 1;
      break;
    case 3: // 素材アップロード -> プロフィール
      appState.currentPhase = 2;
      break;
    case 4.1: // 診断ローディング -> 素材アップロード (※診断キャンセル処理が必要だが、一旦UIのみ)
      // TODO: 診断API呼び出しをキャンセルする
      logger.warn("[Nav] Back from 4.1 (Loading). API cancellation not implemented.");
      appState.currentPhase = 3;
      // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
      toggleLoader(false); // ローダーを強制的に非表示
      break;
    case 4.2: // 診断結果 -> 素材アップロード
      appState.currentPhase = 3;
      break;
    case 5: // 提案選択 -> 診断結果
      appState.currentPhase = 4.2;
      break;
    case 6.1: // 画像生成ローディング -> 提案選択 (※生成キャンセル処理が必要だが、一旦UIのみ)
      // TODO: 画像生成API呼び出しをキャンセルする
      logger.warn("[Nav] Back from 6.1 (Loading). API cancellation not implemented.");
      appState.currentPhase = 5;
      // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
      toggleLoader(false); // ローダーを強制的に非表示
      break;
    case 6.2: // 最終結果 -> 提案選択
      // 生成結果キャッシュをクリア
      appState.generatedImageCache.base64 = null;
      appState.generatedImageCache.mimeType = null;
      generatedImage.src = ""; // 表示をクリア
      saveButton.disabled = true;
      
      appState.currentPhase = 5;
      break;
  }
  
  // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
  showPhase(appState.currentPhase);
}


/**
 * フェーズ遷移時に実行されるメインロジック (API呼び出しなど)
 * @param {number} phaseToExecute - 実行するフェーズ番号
 */
async function handlePhaseLogic(phaseToExecute) {
  // 認証チェック
  if (!appState.user.isLoggedIn || !appState.user.firebaseUid) {
      // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
      showError("認証エラーが発生しました。再度ログインしてください。");
      toggleLoader(false);
      // ログイン処理を再トリガー
      await initializeLiffAndAuth();
      return;
  }
  
  switch (phaseToExecute) {
    
    case 4.1: // AI診断 (ローディング) 開始
      logger.log("[PhaseLogic 4.1] Start: Uploading files and requesting diagnosis...");
      // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
      toggleLoader(true, "AIがあなたの特徴を診断中です...");
      
      try {
        // 1. 全ての必須ファイル (5つ) を Storage (yhd-db) にアップロード
        // (ご希望写真はここではアップロードしない。必須ではないため)
        
        // ★ 修正: ご希望写真(inspiration) は除外
        const requiredKeys = ["item-front-photo", "item-side-photo", "item-back-photo", "item-front-video", "item-back-video"];
        
        const uploadPromises = requiredKeys.map(key => 
          // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
          uploadFileToStorage(
            appState.user.firebaseUid,
            appState.uploadedFiles[key],
            key
          )
        );
        
        // ★ 修正: 5つのファイルがアップロードされるまで待機
        await Promise.all(uploadPromises);
        logger.log("[PhaseLogic 4.1] All 5 required files uploaded to Storage.");

        // 2. ★ ご希望写真 (任意) をアップロード
        const inspFile = appState.uploadedFiles["item-inspiration-photo"];
        if (inspFile) {
            try {
                // ご希望写真は Storage (yhd-db) に保存し、URLを appState に保持
                // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
                const inspUrl = await uploadFileToStorageOnly(
                    appState.user.firebaseUid,
                    inspFile,
                    "item-inspiration-photo"
                );
                appState.inspirationImageUrl = inspUrl;
                logger.log("[PhaseLogic 4.1] Inspiration photo uploaded successfully.", {url: inspUrl});
            } catch (inspError) {
                logger.warn("[PhaseLogic 4.1] Failed to upload inspiration photo, proceeding without it:", inspError);
                appState.inspirationImageUrl = null;
            }
        } else {
            appState.inspirationImageUrl = null; // スキップした場合
            logger.log("[PhaseLogic 4.1] Inspiration photo was skipped.");
        }

        // 3. AI診断 (yhd-ai Functions) をリクエスト
        // (api.js を呼び出す)
        // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
        const diagnosisData = await requestDiagnosis(
          appState.uploadedFileUrls, // 5つのURL
          appState.user,
          appState.userProfile.gender
        );
        
        if (!diagnosisData || !diagnosisData.result || !diagnosisData.proposal) {
            throw new Error("AI response was invalid or missing 'result' or 'proposal' keys.");
        }
        
        // 4. 結果を保存
        appState.diagnosisResult = diagnosisData;
        
        // 5. UIに結果を表示 (ui.js)
        // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
        displayDiagnosisResult(diagnosisData.result, diagnosisData.proposal);
        
        // 6. 診断結果フェーズ (4.2) に遷移
        logger.log("[PhaseLogic 4.1] Diagnosis successful.");
        appState.currentPhase = 4.2;
        // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
        showPhase(4.2);

      } catch (error) {
        logger.error("[PhaseLogic 4.1] Failed:", error);
        // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
        showError(`AI診断に失敗しました: ${error.message}`);
        // フェーズ3（アップロード画面）に戻る
        appState.currentPhase = 3;
        showPhase(3);
      } finally {
        // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
        toggleLoader(false);
      }
      break;

    case 6.1: // 画像生成 (ローディング) 開始
      logger.log("[PhaseLogic 6.1] Start: Requesting image generation...");
      // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
      toggleLoader(true, "AIがヘアスタイルを合成中です...");
      
      try {
        // 1. 元画像(正面写真)のURLを取得 (必須)
        const originalImageUrl = appState.uploadedFileUrls["item-front-photo"];
        if (!originalImageUrl) {
            throw new Error("元画像（正面写真）のURLが見つかりません。");
        }
        
        // 2. ご要望テキストを取得
        const userRequestsText = qs("#user-requests-text").value || "";
        
        // 3. 画像生成 (yhd-ai Functions) をリクエスト
        // (api.js を呼び出す)
        // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
        const response = await generateHairstyleImage(
          originalImageUrl,
          appState.user.firebaseUid, // Firebase UID を使用
          appState.selectedHairstyle.name,
          appState.selectedHairstyle.description,
          appState.selectedHaircolor.name,
          appState.selectedHaircolor.description,
          userRequestsText, // ★ご要望テキスト
          appState.inspirationImageUrl // ★ご希望写真のURL (nullの場合あり)
        );

        if (!response.imageBase64 || !response.mimeType) {
            throw new Error("AI response did not contain imageBase64 or mimeType.");
        }
        
        // 4. 結果をキャッシュに保存
        appState.generatedImageCache.base64 = response.imageBase64;
        appState.generatedImageCache.mimeType = response.mimeType;

        // 5. UIに表示 (ui.js)
        // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
        displayGeneratedImage(response.imageBase64, response.mimeType);

        // 6. 画像生成結果フェーズ (6.2) に遷移
        logger.log("[PhaseLogic 6.1] Image generation successful.");
        appState.currentPhase = 6.2;
        // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
        showPhase(6.2);

      } catch (error) {
        logger.error("[PhaseLogic 6.1] Failed:", error);
        // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
        showError(`画像生成に失敗しました: ${error.message}`);
        // フェーズ5（提案選択画面）に戻る
        appState.currentPhase = 5;
        // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
        showPhase(5);
      } finally {
        // ▼▼▼ ★★★ 修正: インポートした関数を使用 ★★★ ▼▼▼
        toggleLoader(false);
      }
      break;
  }
}