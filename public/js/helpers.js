// --- 汎用ヘルパー関数 (依存なし) ---

/**
 * グローバルなフォールバック関数 (initializeAppFailureFallback) を呼び出す
 * @param {string} errorMessage 
 */
export function initializeAppFailure(errorMessage) {
    console.error("[initializeAppFailure] Displaying failure message:", errorMessage);
    hideLoadingScreen();
    // window.initializeAppFailureFallback は index.html のグローバルスコープで定義されている
    if (window.initializeAppFailureFallback) {
        window.initializeAppFailureFallback(errorMessage);
    } else {
        // フォールバック
        alert(`アプリケーションエラー:\n${errorMessage}`);
    }
}

/**
 * ローディングスクリーンを非表示にする
 */
export function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen && loadingScreen.style.display !== 'none') {
        console.log("[hideLoadingScreen] Hiding loading screen.");
        loadingScreen.style.display = 'none';
    } else if (!loadingScreen) {
        console.warn("[hideLoadingScreen] Loading screen element not found.");
    }
}

/**
 * HTML文字列をエスケープする
 * (window.escapeHtml がグローバルに存在しない場合のフォールバック)
 * @param {string} unsafe 
 * @returns {string}
 */
export const escapeHtml = window.escapeHtmlFallback || function(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;").replace(/\//g, "&#x2F;");
};

/**
 * IDを指定して要素にテキストを設定 (input/textareaにも対応)
 * @param {string} elementId 
 * @param {string} text 
 */
export function setTextContent(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        // input, textarea, select の場合は .value を使用
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
            element.value = text || '';
        } else {
            // p, span, div, h1-h6 などの場合は .textContent を使用
            element.textContent = text || '';
        }
    } else {
        console.warn(`[setTextContent] Element with ID "${elementId}" not found.`);
    }
}

/**
 * 診断結果表示用のDOM要素ペアを作成
 * @param {string} label 
 * @param {string} value 
 * @returns {HTMLElement[]}
 */
export function createResultItem(label, value) {
    const labelDiv = document.createElement('div');
    labelDiv.className = 'result-item-label';
    labelDiv.textContent = label;
    const valueDiv = document.createElement('div');
    valueDiv.className = 'result-item-value';
    valueDiv.textContent = escapeHtml(value || 'N/A');
    return [labelDiv, valueDiv];
}

/**
 * Base64データURLをBlobに変換
 * @param {string} base64 
 * @param {string} mimeType 
 * @returns {Blob|null}
 */
export function base64ToBlob(base64, mimeType) {
    // console.log(`[base64ToBlob] Converting ${mimeType}`);
    try {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    } catch (e) {
        console.error("[base64ToBlob] Error converting base64:", e);
        return null;
    }
}