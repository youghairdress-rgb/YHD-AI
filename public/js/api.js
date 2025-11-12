// --- ES Modules 形式で Firebase SDK をインポート ---
import { getAuth, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
// ▼▼▼ ★★★ 速度改善: uploadBytesResumable をインポート ★★★ ▼▼▼
import { getStorage, ref, getDownloadURL, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
// ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
// ★ 修正: Firestoreの機能を追加
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * LIFFの初期化とFirebaseへの認証（yhd-aiに対して）
 * @param {string} liffId - このLIFFアプリのID
 * @param {object} auth - Firebase Auth (v9 Modular) インスタンス
 * @returns {Promise<{user: object, profile: object}>}
 */
export const initializeLiffAndAuth = (liffId, auth) => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(`[api.js] LIFFを初期化します。LIFF ID: ${liffId}`);
            await liff.init({ liffId });

            if (!liff.isLoggedIn()) {
                console.log("[api.js] LIFFにログインしていません。ログインページにリダイレクトします。");
                liff.login({ redirectUri: window.location.href });
                return;
            }

            const accessToken = liff.getAccessToken();
            if (!accessToken) {
                return reject(new Error("LIFFアクセストークンが取得できませんでした。"));
            }

            const currentUser = auth.currentUser;
            if (currentUser) {
                console.log(`[api.js] Firebaseにログイン済みです。UID: ${currentUser.uid}`);
                const profile = await liff.getProfile();
                return resolve({ user: currentUser, profile });
            }

            console.log("[api.js] Firebaseのカスタムトークンを取得します...");
            
            // ▼▼▼ ★★★ 認証先の変更 (ステップ3) ★★★ ▼▼▼
            // 呼び出し先を、yhd-ai のリライトパス (相対パス) から
            // yhd-db のCloud Functions (絶対パス) に変更します。
            
            // const functionUrl = `/createFirebaseCustomToken`; // 修正前 (yhd-ai 自身)
            const functionUrl = `https://asia-northeast1-yhd-db.cloudfunctions.net/createFirebaseCustomToken`; // 修正後 (yhd-db)
            
            // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
            
            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken })
            });

            if (!response.ok) {
                if (response.status === 401) {
                    console.warn("[api.js] アクセストークンが無効(401)です。LIFFの再ログインを試みます。");
                    liff.login({ redirectUri: window.location.href });
                    return;
                }
                const errorText = await response.text();
                throw new Error(`カスタムトークンの取得に失敗しました(Status: ${response.status}): ${errorText}`);
            }

            const { customToken } = await response.json();
            const userCredential = await signInWithCustomToken(auth, customToken);
            console.log(`[api.js] Firebaseへのサインインに成功しました。UID: ${userCredential.user.uid}`);
            const profile = await liff.getProfile();
            
            resolve({ user: userCredential.user, profile });

        } catch (error) {
            console.error("[api.js] LIFFの初期化または認証プロセスでエラー:", error);
            reject(error);
        }
    });
};


// ▼▼▼ ★★★ 速度改善: uploadBytesResumable を使うように変更 ★★★ ▼▼▼
/**
 * ファイルをFirebase Storageにアップロードする *だけ* の関数。
 * (Firestoreには記録しない)
 * AIへの診断リクエスト（動画など）の一時アップロードに使用します。
 * ▼▼▼ ★★★ スマホでの停止バグ修正: Promiseラップ方式に変更 ★★★ ▼▼▼
 * @param {object} storage - Storage (v9 Modular) インスタンス
 * @param {string} firebaseUid - 顧客のFirebase UID (保存パス用)
 * @param {File} file - アップロードするファイル
 * @param {string} itemName - ファイルの識別子 (例: 'item-front-video')
 * @param {(snapshot: object) => void} [onProgress] - (オプション) 進捗コールバック
 * @returns {Promise<{url: string, path: string, itemName: string}>}
 */
export const uploadFileToStorageOnly = async (storage, firebaseUid, file, itemName, onProgress) => { // <-- onProgress を追加
    if (!storage || !firebaseUid) {
        throw new Error("uploadFileToStorageOnly: Firebase StorageまたはUIDが不足しています。");
    }

    const timestamp = Date.now();
    const safeFileName = (file.name || 'upload.dat').replace(/[^a-zA-Z0-9._-]/g, '_');
    
    // ▼▼▼ ★★★ エラー修正: 権限エラー(403)回避のため、パスを 'gallery' に変更 ★★★ ▼▼▼
    // (Firestoreには書き込まないので、管理アプリのギャラリーには表示されない)
    const filePath = `users/${firebaseUid}/gallery/${timestamp}_${itemName}_${safeFileName}`;
    // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
    
    const storageRef = ref(storage, filePath);
    
    console.log(`[api.js] Uploading (Storage Only, Resumable) ${itemName} to path: ${filePath}`);
    
    // uploadBytes ではなく uploadBytesResumable を使用
    const uploadTask = uploadBytesResumable(storageRef, file);

    // ▼▼▼ ★★★ スマホでの停止バグ修正: .on() リスナーを Promise でラップ ★★★ ▼▼▼
    // (await uploadTask; は使わない)
    return new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
            (snapshot) => {
                // (1) 進捗コールバックを呼び出す
                if (onProgress) {
                    try {
                        onProgress(snapshot);
                    } catch (e) {
                        console.warn(`[api.js] onProgress callback failed: ${e.message}`);
                    }
                }
            },
            (error) => {
                // (2) エラーハンドリング
                console.error(`[api.js] Storage Only Upload failed for ${itemName}:`, error);
                reject(error); // Promise を reject して main.js に伝える
            },
            async () => {
                // (3) 完了ハンドリング
                try {
                    console.log(`[api.js] UploadTask completed for ${itemName}.`);
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    console.log(`[api.js] Storage Only Upload successful for ${itemName}. URL: ${downloadURL}`);
                    
                    // 成功した結果を resolve
                    resolve({ itemName: itemName, url: downloadURL, path: filePath });
                } catch (error) {
                    console.error(`[api.js] getDownloadURL failed for ${itemName}:`, error);
                    reject(error); // URL取得失敗
                }
            }
        );
    });
    // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
};
// ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲


/**
 * ★ 修正: StorageへのアップロードとFirestoreへの記録を両方行う関数
 * (写真、キャプチャ画像、お気に入り合成画像の保存に使用)
 * @param {object} firestore - Firestore (v9 Modular) インスタンス
 * @param {object} storage - Storage (v9 Modular) インスタンス
 * @param {string} firebaseUid - 顧客のFirebase UID
 * @param {File} file - アップロードするファイル
 * @param {string} itemName - ファイルの識別子 (例: 'item-front-photo')
 * @param {(snapshot: object) => void} [onProgress] - (オプション) 進捗コールバック
 * @returns {Promise<{url: string, path: string, itemName: string}>}
 */
export const saveImageToGallery = async (firestore, storage, firebaseUid, file, itemName, onProgress) => { // <-- onProgress を追加
    if (!firestore || !storage || !firebaseUid) {
        throw new Error("saveImageToGallery: FirebaseサービスまたはUIDが不足しています。");
    }

    // --- 1. Storageへのアップロード (既存のロジック) ---
    const timestamp = Date.now();
    const safeFileName = (file.name || 'generated_image.png').replace(/[^a-zA-Z0-9._-]/g, '_');
    
    const filePath = `users/${firebaseUid}/gallery/${timestamp}_${itemName}_${safeFileName}`;
    const storageRef = ref(storage, filePath);
    
    console.log(`[api.js] Uploading ${itemName} to Storage path: ${filePath}`);

    // ▼▼▼ ★★★ スマホ停止バグ修正: 写真も Resumable に変更 + Promiseラップ ★★★ ▼▼▼
    return new Promise((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed',
            (snapshot) => {
                // (1) 進捗コールバック
                if (onProgress) {
                     try {
                        onProgress(snapshot);
                    } catch (e) {
                        console.warn(`[api.js] onProgress callback failed: ${e.message}`);
                    }
                }
            },
            (uploadError) => {
                // (2) エラーハンドリング
                console.error(`[api.js] saveImageToGallery - Storage Upload failed for ${itemName}:`, uploadError);
                reject(uploadError); // エラーを re-throw
            },
            async () => {
                // (3) 完了ハンドリング
                try {
                    console.log(`[api.js] Resumable Upload successful for (photo) ${itemName}.`);
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    console.log(`[api.js] Storage Upload successful for ${itemName}. URL: ${downloadURL}`);

                    // --- 2. Firestoreへの記録 (新規追加) ---
                    const galleryCollectionPath = `users/${firebaseUid}/gallery`;
                    
                    console.log(`[api.js] Writing image info to Firestore path: ${galleryCollectionPath}`);
                    await addDoc(collection(firestore, galleryCollectionPath), {
                        url: downloadURL,
                        createdAt: serverTimestamp() // mypage.js が orderBy("createdAt", "desc") を使っているため
                    });
                    console.log(`[api.js] Firestore write successful.`);
                    
                    // 成功
                    resolve({ itemName: itemName, url: downloadURL, path: filePath });

                } catch (dbError) {
                    console.error(`[api.js] Firestoreへの書き込み、またはgetDownloadURLに失敗しました:`, dbError);
                    // Storageへのアップロードは成功したがDB書き込みが失敗した場合
                    reject(new Error(`Storageへの保存には成功しましたが、DBへの記録またはURL取得に失敗しました: ${dbError.message}`));
                }
            }
        );
    });
    // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
};


/**
 * Cloud Function (requestAiDiagnosis) を呼び出す
 * @param {object} requestData 
 * @returns {Promise<object>}
 */
export const requestAiDiagnosis = async (requestData) => {
    // Functionsの /requestDiagnosis エンドポイントを呼び出す (firebase.json の rewrites 設定)
    const functionUrl = '/requestDiagnosis';
    console.log(`[api.js] Sending request to: ${functionUrl}`);
    try {
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        if (!response.ok) {
            let errorBody = await response.text();
            try { errorBody = (JSON.parse(errorBody)).message || errorBody; } catch (e) { /* ignore */ }
            throw new Error(`HTTP error ${response.status}: ${errorBody}`);
        }
        const data = await response.json();
        if (!data || !data.result || !data.proposal) {
             throw new Error("Invalid response structure received from diagnosis function.");
        }
        console.log("[api.js] Diagnosis request successful.");
        return data;
    } catch (error) {
        console.error("[api.js] requestAiDiagnosis fetch error:", error);
        throw new Error(`AI診断リクエストの送信に失敗しました。\n詳細: ${error.message}`);
    }
};

/**
 * Cloud Function (generateHairstyleImage) を呼び出す
 * @param {object} requestData 
 * @returns {Promise<object>}
 */
export const requestImageGeneration = async (requestData) => {
    // Functionsの /generateHairstyleImage エンドポイントを呼び出す
    const functionUrl = '/generateHairstyleImage';
    console.log(`[api.js] Sending request to: ${functionUrl}`);
    try {
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        if (!response.ok) {
            let errorBody = await response.text();
            try { errorBody = (JSON.parse(errorBody)).message || errorBody; } catch (e) { /* ignore */ }
            throw new Error(`HTTP error ${response.status}: ${errorBody}`);
        }
        const data = await response.json();
        if (!data || !data.imageBase64 || !data.mimeType) {
             throw new Error("Invalid response structure (generateHairstyleImage).");
        }
        console.log("[api.js] Image generation request successful.");
        return data;
    } catch (error) {
        console.error("[api.js] requestImageGeneration fetch error:", error);
        throw new Error(`画像生成リクエストの送信に失敗しました。\n詳細: ${error.message}`);
    }
};

/**
 * Cloud Function (refineHairstyleImage) を呼び出す
 * @param {object} requestData 
 * @returns {Promise<object>}
 */
export const requestRefinement = async (requestData) => {
    // Functionsの /refineHairstyleImage エンドポイントを呼び出す
    const functionUrl = '/refineHairstyleImage';
    console.log(`[api.js] Sending request to: ${functionUrl}`);
    try {
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        if (!response.ok) {
            let errorBody = await response.text();
            try { errorBody = (JSON.parse(errorBody)).message || errorBody; } catch (e) { /* ignore */ }
            throw new Error(`HTTP error ${response.status}: ${errorBody}`);
        }
        const data = await response.json();
         if (!data || !data.imageBase64 || !data.mimeType) {
             throw new Error("Invalid response structure (refineHairstyleImage).");
        }
        console.log("[api.js] Image refinement request successful.");
        return data;
    } catch (error) {
        console.error("[api.js] requestRefinement fetch error:", error);
        throw new Error(`画像修正リクエストの送信に失敗しました。\n詳細: ${error.message}`);
    }
};