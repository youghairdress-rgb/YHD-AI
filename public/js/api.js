/**
 * api.js
 * バックエンド (yhd-ai Functions, yhd-db Functions, Firebase Storage) との通信を担当
 * (ES Module 形式)
 */

// ▼▼▼ ★★★ 修正: main.js から appState を、helpers.js から logger をインポート ★★★ ▼▼▼
import { appState } from './main.js';
import { logger } from './helpers.js';
// ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲

// --- ユーティリティ ---

/**
 * 汎用的な fetch ラッパー
 * @param {string} url
 * @param {object} options
 * @returns {Promise<object>} JSONレスポンス
 */
async function fetchApi(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { error: "Network error", message: await response.text() };
    }
    logger.error(`[API Fetch] Failed ${options.method} ${url}`, { status: response.status, error: errorData });
    throw new Error(errorData.message || errorData.error || "APIリクエストに失敗しました。");
  }
  return response.json();
}

// --- 認証 (yhd-db Functions) ---

/**
 * (yhd-db) の Functions を呼び出して Firebase Custom Token を取得
 * ★★★ 注意: この関数を動作させるには、'yhd-db' プロジェクト側に対応する
 * 'createFirebaseCustomToken' (v10/Node.js 18) Cloud Function がデプロイされている必要があります。
 * ★★★
 */
// ▼▼▼ ★★★ 修正: export を追加 ★★★ ▼▼▼
export async function requestFirebaseCustomToken(accessToken) {
  // ★★★ 重要 ★★★
  // 'yhd-db' の Functions リージョンとプロジェクトIDに合わせてください
  // (例: https://us-central1-yhd-db.cloudfunctions.net/createFirebaseCustomToken)
  //
  // ▼▼▼ ★★★ 修正: yhd-ai の functions/index.js (Node 22) に実装されている
  // 認証Function (createFirebaseCustomToken) を呼び出すように変更 ★★★ ▼▼▼
  //
  // main.js の apiBaseUrl (yhd-ai hosting) を使用
  const url = `${appState.apiBaseUrl}/createFirebaseCustomToken`;
  logger.log(`[API] requestFirebaseCustomToken (for yhd-ai function) ...`);

  return fetchApi(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken: accessToken }),
  });
};


// --- ストレージ (yhd-db Storage) ---
// main.js の appState から storage, db インスタンス (yhd-db) を利用

/**
 * (yhd-db) Storage にファイルをアップロードし、URLを appState に保存
 */
// ▼▼▼ ★★★ 修正: export を追加 ★★★ ▼▼▼
export async function uploadFileToStorage(firebaseUid, file, key) {
  if (!appState || !appState.storage) {
    throw new Error("Firebase Storage (appState.storage) が初期化されていません。");
  }
  const storage = appState.storage;
  const path = `uploads/${firebaseUid}/${key}-${Date.now()}-${file.name}`;
  logger.log(`[API] Uploading to Storage: ${path}`);

  const storageRef = appState.firebase.storage.ref(storage, path);
  const snapshot = await appState.firebase.storage.uploadBytes(storageRef, file);
  const downloadURL = await appState.firebase.storage.getDownloadURL(snapshot.ref);

  // main.js の appState を直接更新
  appState.uploadedFileUrls[key] = downloadURL;
  logger.log(`[API] Upload complete for ${key}: ${downloadURL}`);
  return downloadURL;
};

/**
 * (yhd-db) Storage にファイルのみアップロード (appState を更新しない)
 */
// ▼▼▼ ★★★ 修正: export を追加 ★★★ ▼▼▼
export async function uploadFileToStorageOnly(firebaseUid, file, key) {
  if (!appState || !appState.storage) {
    throw new Error("Firebase Storage (appState.storage) が初期化されていません。");
  }
  const storage = appState.storage;
  const path = `uploads/${firebaseUid}/${key}-${Date.now()}-${file.name}`;
  logger.log(`[API] Uploading (Only) to Storage: ${path}`);

  const storageRef = appState.firebase.storage.ref(storage, path);
  const snapshot = await appState.firebase.storage.uploadBytes(storageRef, file);
  const downloadURL = await appState.firebase.storage.getDownloadURL(snapshot.ref);

  logger.log(`[API] Upload (Only) complete for ${key}: ${downloadURL}`);
  return downloadURL;
};

/**
 * (yhd-db) Firestore と Storage に生成画像を保存
 */
// ▼▼▼ ★★★ 修正: export を追加 ★★★ ▼▼▼
export async function saveImageToGallery(firebaseUid, dataUrl, styleName, colorName, refineText) {
  if (!appState || !appState.storage || !appState.db) {
    throw new Error("Firebase (appState.storage/db) が初期化されていません。");
  }
  const storage = appState.storage;
  const db = appState.db;

  // 1. Data URL (base64) を Blob に変換
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  // 2. Storage にアップロード
  const path = `gallery/${firebaseUid}/gen-${Date.now()}.png`;
  logger.log(`[API] Saving to Gallery (Storage): ${path}`);
  const storageRef = appState.firebase.storage.ref(storage, path);
  const snapshot = await appState.firebase.storage.uploadBytes(storageRef, blob);
  const downloadURL = await appState.firebase.storage.getDownloadURL(snapshot.ref);

  // 3. Firestore (yhd-db) にメタデータを保存
  logger.log(`[API] Saving to Gallery (Firestore)...`);
  const galleryCol = appState.firebase.firestore.collection(db, "gallery");
  const docRef = await appState.firebase.firestore.addDoc(galleryCol, {
    firebaseUid: firebaseUid,
    imageUrl: downloadURL,
    storagePath: path,
    styleName: styleName,
    colorName: colorName,
    refineText: refineText || "",
    createdAt: appState.firebase.firestore.serverTimestamp(),
  });

  logger.log(`[API] Save complete. Doc ID: ${docRef.id}`);
  return { docId: docRef.id, path: path };
};


// --- AI 機能 (yhd-ai Functions) ---
// main.js の appState から apiBaseUrl (yhd-ai hosting) を利用

/**
 * (yhd-ai) 診断リクエスト
 */
// ▼▼▼ ★★★ 修正: export を追加 ★★★ ▼▼▼
export async function requestDiagnosis(fileUrls, user, gender) {
  if (!appState || !appState.apiBaseUrl) {
    throw new Error("API Base URL (appState.apiBaseUrl) が設定されていません。");
  }
  const url = `${appState.apiBaseUrl}/requestDiagnosis`;
  logger.log(`[API] requestDiagnosis...`);

  return fetchApi(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileUrls: fileUrls,
      userProfile: { // 必要な情報のみ渡す
        firebaseUid: user.firebaseUid,
        lineUserId: user.lineUserId,
      },
      gender: gender,
    }),
  });
};

/**
 * (yhd-ai) 新規画像生成
 */
// ▼▼▼ ★★★ 修正: export を追加 ★★★ ▼▼▼
export async function generateHairstyleImage(
  originalImageUrl,
  firebaseUid,
  hairstyleName,
  hairstyleDesc,
  haircolorName,
  haircolorDesc,
  userRequestsText,
  inspirationImageUrl
) {
  if (!appState || !appState.apiBaseUrl) {
    throw new Error("API Base URL (appState.apiBaseUrl) が設定されていません。");
  }
  const url = `${appState.apiBaseUrl}/generateHairstyleImage`;
  logger.log(`[API] generateHairstyleImage (Style: ${hairstyleName})...`);

  return fetchApi(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      originalImageUrl,
      firebaseUid,
      hairstyleName,
      hairstyleDesc,
      haircolorName,
      haircolorDesc,
      userRequestsText,
      inspirationImageUrl,
    }),
  });
};

/**
 * (yhd-ai) 画像微調整
 */
// ▼▼▼ ★★★ 修正: export を追加 ★★★ ▼▼▼
export async function refineHairstyleImage(generatedImageUrl, firebaseUid, refinementText) {
  if (!appState || !appState.apiBaseUrl) {
    throw new Error("API Base URL (appState.apiBaseUrl) が設定されていません。");
  }
  const url = `${appState.apiBaseUrl}/refineHairstyleImage`;
  logger.log(`[API] refineHairstyleImage (Text: ${refinementText})...`);

  return fetchApi(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generatedImageUrl, // data:image/...;base64,...
      firebaseUid,
      refinementText,
    }),
  });
};