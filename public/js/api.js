// --- ES Modules 形式で Firebase SDK をインポート ---
import { getAuth, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
// ★ 修正: Firestoreの機能を追加
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// yhd-db のCloud Functions（認証用）のリージョン
// const FUNCTIONS_REGION = "asia-northeast1"; // ★ リライト経由のため不要
// ★ 修正: yhd-ai のプロジェクトID
// const PROJECT_ID = "yhd-ai"; // ★ リライト経由のため不要

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
            // ★ 修正: Function URL直呼び出しから、Hostingリライト経由の相対パスに変更
            // const functionUrl = `https://${FUNCTIONS_REGION}-${PROJECT_ID}.cloudfunctions.net/createFirebaseCustomToken`;
            const functionUrl = `/createFirebaseCustomToken`;
            
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


/**
 * ★ 修正: StorageへのアップロードとFirestoreへの記録を両方行う関数
 * @param {object} firestore - Firestore (v9 Modular) インスタンス
 * @param {object} storage - Storage (v9 Modular) インスタンス
 * @param {string} firebaseUid - 顧客のFirebase UID
 * @param {File} file - アップロードするファイル
 * @param {string} itemName - ファイルの識別子 (例: 'item-front-photo')
 * @returns {Promise<{url: string, path: string}>}
 */
export const saveImageToGallery = async (firestore, storage, firebaseUid, file, itemName) => {
    if (!firestore || !storage || !firebaseUid) {
        throw new Error("saveImageToGallery: FirebaseサービスまたはUIDが不足しています。");
    }

    // --- 1. Storageへのアップロード (既存のロジック) ---
    const timestamp = Date.now();
    const safeFileName = (file.name || 'generated_image.png').replace(/[^a-zA-Z0-9._-]/g, '_');
    
    // yhdapp (mypage.js) が期待するStorageパス
    const filePath = `users/${firebaseUid}/gallery/${timestamp}_${itemName}_${safeFileName}`;
    const storageRef = ref(storage, filePath);
    
    console.log(`[api.js] Uploading ${itemName} to Storage path: ${filePath}`);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log(`[api.js] Storage Upload successful for ${itemName}. URL: ${downloadURL}`);

    // --- 2. Firestoreへの記録 (新規追加) ---
    // yhdapp (mypage.js) が期待するFirestoreコレクションパス
    const galleryCollectionPath = `users/${firebaseUid}/gallery`;
    
    console.log(`[api.js] Writing image info to Firestore path: ${galleryCollectionPath}`);
    try {
        await addDoc(collection(firestore, galleryCollectionPath), {
            url: downloadURL,
            createdAt: serverTimestamp() // mypage.js が orderBy("createdAt", "desc") を使っているため
            // (必要に応じて他のメタデータも追加可能)
            // originalName: file.name,
            // sourceApp: 'YHD_AI_Diagnosis'
        });
        console.log(`[api.js] Firestore write successful.`);
    } catch (dbError) {
        console.error(`[api.js] Firestoreへの書き込みに失敗しました:`, dbError);
        // Storageへのアップロードは成功したがDB書き込みが失敗した場合
        // ここではエラーを投げて呼び出し元に知らせる
        throw new Error(`Storageへの保存には成功しましたが、ギャラリーDBへの記録に失敗しました: ${dbError.message}`);
    }

    return { itemName: itemName, url: downloadURL, path: filePath };
};


// (注: uploadFileToStorage 関数は saveImageToGallery に統合・置き換えられたため削除)


/**
 * Cloud Function (requestAiDiagnosis) を呼び出す
 * @param {object} requestData 
 * @returns {Promise<object>}
 */
export const requestAiDiagnosis = async (requestData) => {
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