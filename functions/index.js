/**
 * Firebase Functions v2
 *
 * このファイルは、v2構文（onTaskDispatched, onRequest, defineSecret）を使用しています。
 * v1構文（functions.https.onCall, functions.config()）は使用しません。
 */

// Firebase SDK
// ★★★ 根本的なエラー修正: インポートパスを /v2 から /v2/https に変更 ★★★
const {onRequest, onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// ★ 修正: CORS設定
// v2.onRequest では、CORSミドルウェア (cors) は不要
// 代わりに、関数のオプションで `cors: { origin: true }` などを指定する
const corsOptions = {
  // ★ 修正: 開発環境では true (すべて許可) にする
  // (本番環境では "https://yhd-ai.web.app" のようにドメインを指定)
  cors: {
    origin: true,
    methods: ["POST", "GET", "OPTIONS"],
  },
};

// --- Firebase Admin SDKの初期化 ---
// 署名付きURLを生成するために、ここで初期化します。
try {
  admin.initializeApp();
  logger.info("Firebase Admin SDK initialized.");
} catch (e) {
  logger.warn("Firebase Admin SDK already initialized.");
}

// --- ストレージサービスの取得 ---
let storage;
try {
  storage = admin.storage();
  logger.info("Firebase Storage service retrieved.");
} catch (e) {
  logger.error("Failed to get Firebase Storage service:", e);
}
// ★★★ アップグレード ステップ2: バケット名を明示的に取得 ★★★
// (gs:// URI を組み立てるために必要)
let defaultBucketName;
try {
    defaultBucketName = admin.app().options.storageBucket;
    if (!defaultBucketName) {
        // yhd-ai.appspot.com
        const projectId = admin.app().options.projectId;
        if (projectId) {
            defaultBucketName = `${projectId}.appspot.com`;
            logger.warn(`Storage Bucket name was missing, inferred as: ${defaultBucketName}`);
        } else {
            throw new Error("Default Storage Bucket name not found and Project ID is missing.");
        }
    }
    logger.info(`Default Storage Bucket name: ${defaultBucketName}`);
} catch (e) {
    logger.error("Failed to get Default Storage Bucket name:", e);
    // この関数が失敗しても、他の関数は動作する可能性があるため、ここでは致命的エラーとしない
}


// --- シークレットの定義 ---
// firebase functions:secrets:set LLM_APIKEY で設定したシークレットを定義
const llmApiKey = defineSecret("LLM_APIKEY");
// firebase functions:secrets:set IMAGEGEN_APIKEY で設定したシークレットを定義
const imageGenApiKey = defineSecret("IMAGEGEN_APIKEY");


// --- ★★★ 2025/11/15 更新: AIレスポンスのJSONスキーマ定義 (JHCAレベルスケール対応) ★★★ ---
const AI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    "result": {
      "type": "OBJECT",
      "properties": {
        "face": {
          "type": "OBJECT",
          "properties": {
            "nose": {"type": "STRING", "description": "鼻の特徴 (例: 高い, 丸い)"},
            "mouth": {"type": "STRING", "description": "口の特徴 (例: 大きい, 薄い)"},
            "eyes": {"type": "STRING", "description": "目の特徴 (例: 二重, つり目)"},
            "eyebrows": {"type": "STRING", "description": "眉の特徴 (例: アーチ型, 平行)"},
            "forehead": {"type": "STRING", "description": "おでこの特徴 (例: 広い, 狭い)"},
          },
          "required": ["nose", "mouth", "eyes", "eyebrows", "forehead"],
        },
        "skeleton": {
          "type": "OBJECT",
          "properties": {
            "neckLength": {"type": "STRING", "description": "首の長さ (例: 長い, 短い, 標準)"},
            "faceShape": {"type": "STRING", "description": "顔の形 (例: 丸顔, 面長, ベース顔, 卵型)"},
            "bodyLine": {"type": "STRING", "description": "ボディライン (例: ストレート, ウェーブ, ナチュラル)"},
            "shoulderLine": {"type": "STRING", "description": "肩のライン (例: なで肩, いかり肩, 標準)"},
            "faceStereoscopy": {"type": "STRING", "description": "顔の立体感 (例: 立体的, 平面的, 標準)"},
            "bodyTypeFeature": {"type": "STRING", "description": "体型の特徴 (例: 上重心(ストレートタイプ), 下重心(ウェーブタイプ), 骨感が目立つ(ナチュラルタイプ))"},
          },
          "required": ["neckLength", "faceShape", "bodyLine", "shoulderLine", "faceStereoscopy", "bodyTypeFeature"],
        },
        "personalColor": {
          "type": "OBJECT",
          "properties": {
            "baseColor": {"type": "STRING", "description": "ベースカラー (例: イエローベース, ブルーベース)"},
            "season": {"type": "STRING", "description": "シーズン (例: スプリング, サマー, オータム, ウィンター)"},
            "brightness": {"type": "STRING", "description": "明度 (例: 高明度, 中明度, 低明度)"},
            "saturation": {"type": "STRING", "description": "彩度 (例: 高彩度, 中彩度, 低彩度)"},
            "eyeColor": {"type": "STRING", "description": "瞳の色 (例: 明るい茶色, 黒に近い焦げ茶)"},
          },
          "required": ["baseColor", "season", "brightness", "saturation", "eyeColor"],
        },
        "hairCondition": {
            "type": "OBJECT",
            "description": "写真（と将来の動画）から分析した現在の髪の状態",
            "properties": {
                "quality": {"type": "STRING", "description": "髪質 (例: 硬い, 柔らかい, 普通)"},
                "curlType": {"type": "STRING", "description": "クセ (例: 直毛, 波状毛, 捻転毛)"},
                "damageLevel": {"type": "STRING", "description": "ダメージレベル (例: 低(健康), 中(やや乾燥), 高(要ケア))"},
                "volume": {"type": "STRING", "description": "毛量 (例: 多い, 普通, 少ない)"},
                // ★ JHCAレベルスケールのための項目を追加 ★
                "currentLevel": {"type": "STRING", "description": "JHCAレベルスケールに基づく現在の明るさ (例: (約)10レベル)"}
            },
            // ★ 必須項目に追加 ★
            "required": ["quality", "curlType", "damageLevel", "volume", "currentLevel"],
        },
      },
      "required": ["face", "skeleton", "personalColor", "hairCondition"],
    },
    "proposal": {
      "type": "OBJECT",
      "properties": {
        "hairstyles": {
          "type": "OBJECT",
          "description": "提案するヘアスタイル2種。キーは 'style1', 'style2' とする。",
          "properties": {
            "style1": {
              "type": "OBJECT",
              "properties": {
                "name": {"type": "STRING", "description": "ヘアスタイルの名前 (例: くびれレイヤーミディ)"},
                "description": {"type": "STRING", "description": "スタイルの説明 (50-100文字程度)"},
              },
              "required": ["name", "description"],
            },
            "style2": {
              "type": "OBJECT",
              "properties": {
                "name": {"type": "STRING", "description": "ヘアスタイルのの名前 (例: シースルーバングショート)"},
                "description": {"type": "STRING", "description": "スタイルの説明 (50-100文字程度)"},
              },
              "required": ["name", "description"],
            },
          },
          "required": ["style1", "style2"],
        },
        "haircolors": {
          "type": "OBJECT",
          "description": "提案するヘアカラー2種。キーは 'color1', 'color2' とする。",
          "properties": {
            "color1": {
              "type": "OBJECT",
              "properties": {
                // ★ 記述例からブランド名を削除 ★
                "name": {"type": "STRING", "description": "ヘアカラーの名前 (例: ラベンダーアッシュ)"},
                "description": {"type": "STRING", "description": "カラーの説明 (トレンドやブリーチ要否を含める)"},
                // ★ JHCAレベルスケールのための項目を追加 ★
                "recommendedLevel": {"type": "STRING", "description": "JHCAレベルスケールに基づく推奨明るさ (例: 10レベル)"}
              },
              "required": ["name", "description", "recommendedLevel"], // ★ 必須に追加
            },
            "color2": {
              "type": "OBJECT",
              "properties": {
                // ★ 記述例からブランド名を削除 ★
                "name": {"type": "STRING", "description": "ヘアカラーの名前 (例: ピンクベージュ)"},
                "description": {"type": "STRING", "description": "カラーの説明 (トレンドやブリーチ要否を含める)"},
                // ★ JHCAレベルスケールのための項目を追加 ★
                "recommendedLevel": {"type": "STRING", "description": "JHCAレベルスケールに基づく推奨明るさ (例: 12レベル)"}
              },
              "required": ["name", "description", "recommendedLevel"], // ★ 必須に追加
            },
          },
          "required": ["color1", "color2"],
        },
        "bestColors": {
          "type": "OBJECT",
          "description": "パーソナルカラーに基づいた相性の良いカラー4種。キーは 'c1' から 'c4'。",
          "properties": {
            "c1": {"type": "OBJECT", "properties": {"name": {"type": "STRING"}, "hex": {"type": "STRING", "description": "例: #FFB6C1"}}, "required": ["name", "hex"]},
            "c2": {"type": "OBJECT", "properties": {"name": {"type": "STRING"}, "hex": {"type": "STRING", "description": "例: #FFDAB9"}}, "required": ["name", "hex"]},
            "c3": {"type": "OBJECT", "properties": {"name": {"type": "STRING"}, "hex": {"type": "STRING", "description": "例: #E6E6FA"}}, "required": ["name", "hex"]},
            "c4": {"type": "OBJECT", "properties": {"name": {"type": "STRING"}, "hex": {"type": "STRING", "description": "例: #98FB98"}}, "required": ["name", "hex"]},
          },
          "required": ["c1", "c2", "c3", "c4"],
        },
        "makeup": {
          "type": "OBJECT",
          "description": "パーソナルカラーに基づいた似合うメイク提案",
          "properties": {
            "eyeshadow": {"type": "STRING", "description": "アイシャドウの色 (例: ゴールド系ブラウン)"},
            "cheek": {"type": "STRING", "description": "チークの色 (例: ピーチピンク)"},
            "lip": {"type": "STRING", "description": "リップの色 (例: コーラルレッド)"},
          },
          "required": ["eyeshadow", "cheek", "lip"],
        },
        "fashion": {
          "type": "OBJECT",
          "description": "骨格診断に基づいた似合うファッション提案",
          "properties": {
            "recommendedStyles": {
              "type": "ARRAY",
              "items": {"type": "STRING"},
              "description": "似合うファッションスタイル (2つ程度。例: Aライン, Iライン)"
            },
            "recommendedItems": {
              "type": "ARRAY",
              "items": {"type": "STRING"},
              "description": "似合うファッションアイテム (2つ程度。例: Vネックニット, テーパードパンツ)"
            }
          },
          "required": ["recommendedStyles", "recommendedItems"]
        },
        "comment": {"type": "STRING", "description": "AIトップヘアスタイリストによる総評 (200-300文字程度)"},
      },
      "required": ["hairstyles", "haircolors", "bestColors", "makeup", "fashion", "comment"],
    },
  },
  "required": ["result", "proposal"],
};
// ▲▲▲ スキーマ定義ここまで ▲▲▲


// --- 診断リクエスト関数 (v2) ---
exports.requestDiagnosis = onRequest(
    {
      ...corsOptions,
      secrets: [llmApiKey],
      timeoutSeconds: 300, // 5分
      memory: "2GiB",      // 2GiB に増強
    },
    async (req, res) => {
      // 1. メソッドとAPIキーのチェック
      if (req.method !== "POST") {
        logger.warn(`[requestDiagnosis] Method Not Allowed: ${req.method}`);
        res.status(405).json({error: "Method Not Allowed"});
        return;
      }

      const apiKey = llmApiKey.value();
      if (!apiKey) {
        logger.error("[requestDiagnosis] LLM_APIKEY is missing.");
        res.status(500).json({error: "Configuration Error", message: "API Key not configured."});
        return;
      }

      // 2. リクエストデータの取得
      const {fileUrls, userProfile, gender} = req.body;
      if (!fileUrls || !userProfile || !gender) {
        logger.error("[requestDiagnosis] Bad Request: Missing data.", {body: req.body});
        res.status(400).json({error: "Bad Request", message: "Missing required data (fileUrls, userProfile, gender)."});
        return;
      }
      
      const requiredKeys = ['item-front-photo', 'item-side-photo', 'item-back-photo', 'item-front-video', 'item-back-video'];
      const missingKeys = requiredKeys.filter((key) => !fileUrls[key]);
      if (missingKeys.length > 0) {
           logger.error(`[requestDiagnosis] Bad Request: Missing fileUrls: ${missingKeys.join(", ")}`);
           res.status(400).json({error: "Bad Request", message: `Missing required fileUrls: ${missingKeys.join(", ")}`});
           return;
      }

      logger.info(`[requestDiagnosis] Received request for user: ${userProfile.firebaseUid || userProfile.userId}`);

      // 3. 5つのファイルすべてを fetch して Base64 に変換
      const parts = [
        {text: `この顧客（性別: ${gender}）を診断し、提案してください。`},
      ];

      try {
        logger.info("[requestDiagnosis] Fetching 5 files from Storage...");

        const fetchPromises = requiredKeys.map(async (key) => {
          const url = fileUrls[key];
           const mimeType = key.includes('video') 
                ? (url.includes('.mp4') ? 'video/mp4' : 'video/quicktime') 
                : (url.includes('.png') ? 'image/png' : 'image/jpeg'); // デフォルトをjpegに

          logger.info(`[requestDiagnosis] Fetching ${key} (Type: ${mimeType}) from ${url.substring(0, 50)}...`);
          
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to fetch ${key}: ${response.status} ${response.statusText}`);
          }
          
          const arrayBuffer = await response.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString("base64");
          logger.info(`[requestDiagnosis] Fetched ${key} successfully. Base64 Length: ${base64.length}`);

          return {
            inlineData: {
              mimeType: mimeType,
              data: base64,
            },
          };
        });

        const fetchedParts = await Promise.all(fetchPromises);
        parts.push(...fetchedParts);

        logger.info("[requestDiagnosis] All 5 files fetched and converted to Base64 successfully.");
      } catch (fetchError) {
        logger.error("[requestDiagnosis] Failed to fetch or process files:", fetchError);
        res.status(500).json({error: "File Fetch Error", message: `ファイル（画像・動画）の取得に失敗しました: ${fetchError.message}`});
        return;
      }

      // 4. Gemini API リクエストペイロードの作成
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

      // --- ★★★ 2025/11/15 更新: systemPrompt (FUSIONIST削除、JHCAスケール・トレンドサイト参照) ★★★ ---
      // --- ★★★ 2025/11/15 バグ修正: ${result.hairCondition.currentLevel} を静的テキストに変更 ★★★ ---
      const systemPrompt = `
あなたは日本の高名なトップヘアスタイリストAIです。
顧客から提供された**5つの素材（正面写真、サイド写真、バック写真、正面動画、バック動画）**と性別（${gender}）に基づき、以下のタスクを実行してください。

## A. 重要な定義（厳守）

### A-1. JHCAレベルスケール (明るさの基準)
髪の明るさ（明度）の診断と提案は、必ず以下の「日本ヘアカラー協会（JHCA）レベルスケール」に基づいて行ってください。
* 4〜7レベル: 暗い (地毛に近い)
* 8〜10レベル: やや明るい (ブラウン系)
* 11〜13レベル: 明るい (ライトブラウン・ベージュ系)
* 14〜15レベル: かなり明るい (ブリーチが必要な場合が多い)

### A-2. ヘアカラー提案のガイドライン
ヘアカラーを提案する際は、以下のガイドラインを厳守すること。
1.  **トレンドの参照:** 提案するヘアカラーの色名は、必ず日本のトレンドスタイル（参考サイト1, 2）を最優先で参照し、顧客に最も似合う一般的な色名（例：ミルクティーベージュ、ラベンダーアッシュ等）を選ぶこと。
2.  **パーソナルカラー:** 診断したパーソナルカラー（例：ブルベ夏）に最適な色味を提案すること。
3.  **現実的な施術:** 顧客の「現在の髪の状態（currentLevel, damageLevel）」を基に、ブリーチが必須かどうか、またはブリーチなしでも可能な範囲かを判断し、\`description\` に必ず明記すること。

* 参考サイト1 (トレンド): https://beauty.hotpepper.jp/catalog/
* 参考サイト2 (トレンド): https://www.ozmall.co.jp/hairsalon/catalog/

---

## B. 実行タスク

1.  **診断 (result)**:
    * **顔 (face)**: 主に正面写真と正面動画から特徴を分析してください。
    * **骨格 (skeleton)**:
        * \`neckLength\`, \`faceShape\`, \`shoulderLine\`: 正面・サイド写真から分析してください。
        * **\`faceStereoscopy\` (顔の立体感)**: 正面動画（顔の振り）とサイド写真を比較して「立体的」「平面的」などを判断してください。
        * **\`bodyTypeFeature\` (体型の特徴)**: 写真全体から「上重心」「下重心」「骨感が目立つ」などを判断してください。
    * **パーソナルカラー (personalColor)**: 主に正面写真と正面動画から分析してください。
    * **【重要】現在の髪の状態 (hairCondition)**:
        * **\`quality\` (髪質)**, **\`curlType\` (クセ)**, **\`damageLevel\` (ダメージ)**, **\`volume\` (毛量)**:
        * **3枚の写真と2本の動画すべて**を詳細に分析してください。特に動画は、髪が動いたときの「しなり方（髪質）」「内側のうねり（クセ）」「ツヤの動き（ダメージ）」「膨らみ方（毛量）」を判断する上で最も重要です。
        * **【追加】 \`currentLevel\` (現在の明るさ)**: バック写真や動画を基に、**A-1. JHCAレベルスケール** に基づいて現在の髪の明るさを「（約）10レベル」のように厳密に診断してください。

2.  **提案 (proposal)**: 診断結果に基づき、以下の提案をしてください。
    * **hairstyles**: 顧客の骨格だけでなく、**現在の髪質やクセ（例：波状毛）でも再現可能か**という観点で、最適なスタイルを2つ提案してください。
    * **haircolors**:
        * **A-2. ヘアカラー提案のガイドライン** に厳密に従い、顧客（パーソナルカラー、現在の髪の状態）に最適で、かつ参考サイトのトレンドに合った色名を2つ提案すること。
        * \`name\`には「ミルクティーベージュ」「ラベンダーアッシュ」のような、参考サイトに基づいた一般的なトレンドのカラー名を入れること。
        * \`description\`には、**ブリーチの要否**や施術上の注意点（例：「現在の髪（診断したレベル）からはブリーチ必須です」など）を必ず含めること。
        * \`recommendedLevel\`には、**A-1. JHCAレベルスケール** に基づく推奨明るさレベルを必ず含めること。
    * **bestColors**: パーソナルカラーに基づき、HEXコード付きで4色提案してください。
    * **makeup**: パーソナルカラーに基づき、提案してください。
    * **fashion**: 診断結果の \`skeleton.bodyTypeFeature\`（骨格タイプ）に基づき、似合うファッションスタイルを2つ、具体的なアイテムを2つ提案してください。
    * **comment (総評)**: 全体を総括し、特に**現在の髪の状態（例：ダメージレベル高）**に基づいた具体的なケアアドバイス（例：サロンでの髪質改善トリートメント推奨）を必ず含めてください。
    * **重要:** ヘアスタイルの提案は、以下の参考サイトにあるような、日本の現代のトレンドスタイルを強く意識してください。
    * 参考サイト1: https://beauty.hotpepper.jp/catalog/
    * 参考サイト2: https://www.ozmall.co.jp/hairsalon/catalog/

回答は必ず指定されたJSONスキーマに従い、JSONオブジェクトのみを返してください。前置きやマークダウン（'''json ... '''）は一切含めないでください。
`;
      // ▲▲▲ systemPrompt 更新ここまで ▲▲▲

      const payload = {
        systemInstruction: {
          parts: [{text: systemPrompt}],
        },
        contents: [
          {
            role: "user",
            parts: parts, // ★★★ 5つのファイル(Base64) + テキストプロンプト
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: AI_RESPONSE_SCHEMA, // ★ 更新されたスキーマを参照
          // temperature: 0.7, // 必要に応じて調整
        },
      };

      // 5. API呼び出し（リトライ処理付き）
      try {
        const aiResponse = await callGeminiApiWithRetry(apiUrl, payload, 3);
        if (!aiResponse) {
           throw new Error("AI response was null or undefined after retries.");
        }

        logger.info("[requestDiagnosis] Gemini API request successful.");

        const responseText = aiResponse?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!responseText || typeof responseText !== "string") {
          logger.error("[requestDiagnosis] No valid JSON text found in AI response.", {response: aiResponse});
          throw new Error("AIの応答にJSONテキストが含まれていません。");
        }

        let parsedJson;
        try {
          parsedJson = JSON.parse(responseText);
        } catch (parseError) {
          logger.error("[requestDiagnosis] Failed to parse responseText directly.", {responseText, parseError});
          throw new Error(`AIが不正なJSON形式を返しました: ${parseError.message}`);
        }

        // パースしたJSONをチェック
        // ★★★ スキーマ変更に合わせてチェック対象を更新 ★★★
        if (!parsedJson.result || !parsedJson.proposal || 
            !parsedJson.result.hairCondition || !parsedJson.result.hairCondition.currentLevel || // currentLevelをチェック
            !parsedJson.proposal.fashion || 
            !parsedJson.proposal.haircolors || !parsedJson.proposal.haircolors.color1 ||
            !parsedJson.proposal.haircolors.color1.recommendedLevel // recommendedLevelをチェック
           ) {
           logger.error("[requestDiagnosis] Parsed JSON missing required keys (result/proposal/hairCondition/currentLevel/fashion/recommendedLevel).", {parsed: parsedJson});
           throw new Error("AIの応答に必要なキー（currentLevel, recommendedLevelなど）が欠けています。");
        }

        res.status(200).json(parsedJson); // パースしたJSONを返す
      } catch (apiError) {
        logger.error("[requestDiagnosis] Gemini API call failed:", apiError);
        res.status(500).json({error: "Gemini API Error", message: `AI診断リクエストの送信に失敗しました。\n詳細: ${apiError.message}`});
      }
    });


// --- 画像生成リクエスト関数 (v2) ---
exports.generateHairstyleImage = onRequest(
    // 画像生成は時間がかかるためタイムアウトを5分(300秒)に延長
    {...corsOptions, secrets: [imageGenApiKey], timeoutSeconds: 300},
    async (req, res) => {
      // 1. メソッドとAPIキーのチェック
      if (req.method !== "POST") {
        logger.warn(`[generateHairstyleImage] Method Not Allowed: ${req.method}`);
        res.status(405).json({error: "Method Not Allowed"});
        return;
      }

      const apiKey = imageGenApiKey.value();
      if (!apiKey || !storage) {
        logger.error("[generateHairstyleImage] API Key or Storage service is missing.");
        res.status(500).json({error: "Configuration Error", message: "API Key or Storage not configured."});
        return;
      }

      // 2. リクエストデータの取得
      const {
        originalImageUrl,
        firebaseUid,
        hairstyleName,
        hairstyleDesc,
        haircolorName,
        haircolorDesc,
        // ★★★ JHCAレベルスケール対応 ★★★
        recommendedLevel, // (例: "10レベル")
        currentLevel, // (例: "(約)7レベル")
      } = req.body;

      if (!originalImageUrl || !firebaseUid || !hairstyleName || !haircolorName || !recommendedLevel || !currentLevel) {
        logger.error("[generateHairstyleImage] Bad Request: Missing data.", {body: req.body});
        res.status(400).json({error: "Bad Request", message: "Missing required data (originalImageUrl, firebaseUid, hairstyleName, haircolorName, recommendedLevel, currentLevel)."});
        return;
      }

      logger.info(`[generateHairstyleImage] Received request for user: ${firebaseUid}`);

      // 3. 画像データの取得
      let imageBase64;
      let imageMimeType;
      try {
        const imageUrl = originalImageUrl;
        logger.info(`[generateHairstyleImage] Fetching image from: ${imageUrl.substring(0, 50)}...`);
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
        }
        const contentType = imageResponse.headers.get("content-type");
        
        // ★ 修正: 圧縮によりJPEGになっているため、MIMEタイプを決め打ち
        imageMimeType = "image/jpeg";
        logger.warn(`[generateHairstyleImage] Content-Type was ${contentType}, but forcing image/jpeg due to client-side compression.`);
        
        const imageBuffer = await imageResponse.arrayBuffer();
        imageBase64 = Buffer.from(imageBuffer).toString("base64");
        logger.info(`[generateHairstyleImage] Image fetched successfully. MimeType: ${imageMimeType}`);
      } catch (fetchError) {
        logger.error("[generateHairstyleImage] Failed to fetch or process image:", fetchError);
        res.status(500).json({error: "Image Fetch Error", message: `画像の取得に失敗しました: ${fetchError.message}`});
        return;
      }

      // 4. Gemini API リクエストペイロードの作成 (Nano-banana / Inpainting)
      // PDFの指示書に基づき、顔を変えずに髪型を合成するプロンプトを構築
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;

      // --- ★★★ 2025/11/15 更新: 画像生成AIへのプロンプト (JHCAレベル対応) ★★★ ---
      const prompt = `
（指示書: PDF 2-5ページ）
**目的:** 元画像の顔の特徴（顔の輪郭、目、鼻、口、肌の質感）を一切変更せず、指定されたヘアスタイルを極めて自然に合成（インペインティング）する。
**元画像:** [添付された元画像]
**顧客の現在の髪の明るさ:** ${currentLevel} (JHCAレベルスケール)
**マスク:** [マスクは添付しない。元画像から顔領域を自動検出し、その顔を**一切変更せず**、髪型だけをインペインティングすること。]

**指示:**
1.  **品質:** masterpiece, best quality, photorealistic hair, ultra realistic, lifelike hair texture, individual hair strands visible
2.  **スタイル:** ${hairstyleName} (${hairstyleDesc})
3.  **カラー:** ${haircolorName} (${haircolorDesc})
4.  **明るさ(最重要):** 提案する髪の明るさは **JHCAレベルスケールの ${recommendedLevel}** である。顧客の現在の明るさ（${currentLevel}）と比較し、現実的な範囲で ${recommendedLevel} の明るさを再現すること。
5.  **光:** 元画像の照明（soft natural daylight, bright studio lightingなど）と一致させること。
6.  **質感:** soft and airy texture, glossy and sleek など、スタイルに合わせた自然な質感。

**ネガティブプロンプト:**
unnatural color, flat, dull, lifeless hair, helmet-like, wig, hat, hair accessories, blurry, deformed, worst quality, (face changed), (skin texture changed), (different person)
`;
      // ▲▲▲ プロンプト更新ここまで ▲▲▲

      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              {text: prompt},
              {
                inlineData: { // 元画像
                  mimeType: imageMimeType,
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
          // temperature: 0.7, // 必要に応じて調整
        },
      };

      // 5. API呼び出し（リトライ処理付き）
      try {
        const aiResponse = await callGeminiApiWithRetry(apiUrl, payload, 3);
        // ★ 修正: レスポンスから inlineData を見つける
        const imagePart = aiResponse?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
        const generatedBase64 = imagePart?.inlineData?.data;
        const generatedMimeType = imagePart?.inlineData?.mimeType || "image/png"; // デフォルト

        if (!generatedBase64) {
          logger.error("[generateHairstyleImage] No image data found in Gemini response.", {response: aiResponse});
          throw new Error("AIからの応答に画像データが含まれていませんでした。");
        }

        logger.info("[generateHairstyleImage] Gemini API request successful. Image generated.");

        // ★ 修正: 成功レスポンスとしてBase64データを直接返す
        res.status(200).json({
          message: "Image generated successfully.",
          imageBase64: generatedBase64,
          mimeType: generatedMimeType,
        });
      } catch (apiError) {
        logger.error("[generateHairstyleImage] Gemini API call or Storage upload failed:", apiError);
        res.status(500).json({error: "Image Generation Error", message: `画像生成または保存に失敗しました。\n詳細: ${apiError.message}`});
      }
    });

// ★★★ 修正: 画像微調整リクエスト関数 (v2) ★★★
exports.refineHairstyleImage = onRequest(
    {...corsOptions, secrets: [imageGenApiKey], timeoutSeconds: 300},
    async (req, res) => {
      // 1. メソッドとAPIキーのチェック
      if (req.method !== "POST") {
        logger.warn(`[refineHairstyleImage] Method Not Allowed: ${req.method}`);
        res.status(405).json({error: "Method Not Allowed"});
        return;
      }

      const apiKey = imageGenApiKey.value();
      if (!apiKey || !storage) {
        logger.error("[refineHairstyleImage] API Key or Storage service is missing.");
        res.status(500).json({error: "Configuration Error", message: "API Key or Storage not configured."});
        return;
      }

      // 2. リクエストデータの取得
      const {
        generatedImageUrl, // ★注意: これは "data:image/png;base64,..." のデータURL
        firebaseUid,
        refinementText, // ★注意: 微調整プロンプト
      } = req.body;

      if (!generatedImageUrl || !firebaseUid || !refinementText) {
        logger.error("[refineHairstyleImage] Bad Request: Missing data.", {body: req.body});
        res.status(400).json({error: "Bad Request", message: "Missing required data (generatedImageUrl, firebaseUid, refinementText)."});
        return;
      }

      logger.info(`[refineHairstyleImage] Received request for user: ${firebaseUid}. Text: ${refinementText}`);

      // 3. 画像データの取得 (★データURLからBase64とMIMEタイプを抽出★)
      let imageBase64;
      let imageMimeType;
      try {
        const match = generatedImageUrl.match(/^data:(image\/.+);base64,(.+)$/);
        if (!match) {
            throw new Error("Invalid Data URL format.");
        }
        imageMimeType = match[1];
        imageBase64 = match[2];
        logger.info(`[refineHairstyleImage] Image data extracted from Data URL. MimeType: ${imageMimeType}`);
      } catch (fetchError) {
        logger.error("[refineHairstyleImage] Failed to parse Data URL:", fetchError);
        res.status(500).json({error: "Image Parse Error", message: `画像データの解析に失敗しました: ${fetchError.message}`});
        return;
      }

      // 4. Gemini API リクエストペイロードの作成 (Image-to-Image Edit)
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;

      // ★微調整用の新しいプロンプト★
      // ★★★ 2025/11/15 更新: 微調整プロンプトにJHCAレベルスケールへの言及を追加 ★★★
      const prompt = `
**目的:** 添付されたベース画像（ヘアスタイル合成済み）に対して、ユーザーの指示に基づき「髪の毛のみ」を微調整する。
**ベース画像:** [添付された画像]
**ユーザーの微調整指示:** "${refinementText}"
**厳格なルール:**
1.  **顔と背景の保護:** 顔の輪郭、目、鼻、口、肌の質感、背景は**一切変更してはならない**。
2.  **髪のみ編集:** ユーザーの指示（"${refinementText}"）を、**髪の毛に対してのみ**適用すること。
3.  **明るさの考慮:** もしユーザーが明るさ（例：「もっと明るく」）について言及した場合、**JHCAレベルスケール**（例：10レベルから12レベルへ）の変更として解釈し、現実的な範囲で適用すること。
4.  **品質:** photorealistic, lifelike hair texture を維持すること。

**ネガティブプロンプト:**
(face changed), (skin texture changed), (different person), (background changed), blurry, deformed, worst quality, unnatural color
`;
      // ▲▲▲ プロンプト更新ここまで ▲▲▲

      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              {text: prompt},
              {
                inlineData: { // ★ベース画像（前回生成した画像）
                  mimeType: imageMimeType,
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
          // temperature: 0.7, // 必要に応じて調整
        },
      };

      // 5. API呼び出し（リトライ処理付き）
      try {
        const aiResponse = await callGeminiApiWithRetry(apiUrl, payload, 3);
        // ★ 修正: レスポンスから inlineData を見つける
        const imagePart = aiResponse?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
        const generatedBase64 = imagePart?.inlineData?.data;
        const generatedMimeType = imagePart?.inlineData?.mimeType || "image/png"; // デフォルト

        if (!generatedBase64) {
          logger.error("[refineHairstyleImage] No image data found in Gemini response.", {response: aiResponse});
          throw new Error("AIからの応答に画像データが含まれていませんでした。");
        }

        logger.info("[refineHairstyleImage] Gemini API request successful. Image refined.");

        // ★ 修正: 成功レスポンスとしてBase64データを直接返す
        res.status(200).json({
          message: "Image refined successfully.",
          imageBase64: generatedBase64,
          mimeType: generatedMimeType,
        });
      } catch (apiError) {
        logger.error("[refineHairstyleImage] Gemini API call or Storage upload failed:", apiError);
        res.status(500).json({error: "Image Generation Error", message: `画像修正または保存に失敗しました。\n詳細: ${apiError.message}`});
      }
    });


// --- 疎通確認用エンドポイント (v2) ---
exports.helloWorld = onRequest(corsOptions, (req, res) => {
  logger.info("[helloWorld] Hello world endpoint called!");
  res.status(200).send("Hello from Firebase Functions v2!");
});

// ★★★ 追加: 認証用Function ★★★
// (onRequest を使用し、v2の作法に合わせる)
exports.createFirebaseCustomToken = onRequest(
    {...corsOptions, secrets: []}, // シークレットは不要
    async (req, res) => {
      if (req.method !== "POST") {
        logger.warn(`[createFirebaseCustomToken] Method Not Allowed: ${req.method}`);
        res.status(405).json({error: "Method Not Allowed"});
        return;
      }
      
      try {
        const {accessToken} = req.body;
        if (!accessToken) {
          logger.error("[createFirebaseCustomToken] Access token is missing.");
          res.status(400).json({error: "Access token is missing."});
          return;
        }

        // LINE Profile API v2.1 を使ってアクセストークンを検証し、LINE User IDを取得
        const lineResponse = await fetch("https://api.line.me/v2/profile", {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
            },
        });

        if (!lineResponse.ok) {
            if (lineResponse.status === 401) {
                logger.warn("[createFirebaseCustomToken] Invalid LINE access token.");
                res.status(401).json({error: "Invalid access token."});
                return;
            }
            logger.error(`[createFirebaseCustomToken] LINE API error: ${lineResponse.status}`);
            res.status(lineResponse.status).json({error: "Failed to verify access token."});
            return;
        }

        const profile = await lineResponse.json();
        const lineUserId = profile.userId;
        if (!lineUserId) {
            logger.error("[createFirebaseCustomToken] LINE User ID not found in profile.");
            res.status(500).json({error: "LINE User ID not found."});
            return;
        }
        
        // (重要) 取得した LINE User ID をそのまま Firebase の UID として使用する
        const firebaseUid = lineUserId;

        // Firebase Admin SDK を使ってカスタムトークンを生成
        // (この時点で firebaseUid のユーザーがAuthに存在しない場合、自動的に作成される)
        const customToken = await admin.auth().createCustomToken(firebaseUid);
        
        logger.info(`[createFirebaseCustomToken] Custom token created successfully for UID: ${firebaseUid}`);
        res.status(200).json({customToken: customToken});
      } catch (error) {
        logger.error("[createFirebaseCustomToken] Error creating custom token:", error);
        // ★ 重要: 権限エラー(iam.serviceAccounts.signBlob) もここに含まれる
        res.status(500).json({
            error: "Internal Server Error",
            message: error.message || "Unknown error during token creation.",
        });
      }
    },
);


// --- ユーティリティ: リトライ付きAPI呼び出し ---
/**
 * 指数バックオフ（Exponential Backoff）リトライ付きでGemini APIを呼び出す
 * @param {string} url - APIエンドポイントURL
 * @param {object} payload - 送信するペイロード
 * @param {number} maxRetries - 最大リトライ回数
 * @return {Promise<object>} - APIからのレスポンス（JSONパース済み）
 */
async function callGeminiApiWithRetry(url, payload, maxRetries = 3) {
  let attempt = 0;
  let delay = 1000; // 1秒から開始

  while (attempt < maxRetries) {
    attempt++;
    logger.info(`[callGeminiApiWithRetry] Attempt ${attempt}/${maxRetries} to call: ${url.split("?")[0]}`);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        return data; // 応答オブジェクト全体をそのまま返す
      }

      // リトライ対象のエラー (429: レート制限, 500/503: サーバーエラー)
      if (response.status === 429 || response.status === 500 || response.status === 503) {
        logger.warn(`[callGeminiApiWithRetry] Received status ${response.status}. Retrying in ${delay}ms...`);
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // バックオフ時間を2倍に
        } else {
          throw new Error(`Gemini API failed with status ${response.status} after ${maxRetries} attempts.`);
        }
      } else {
        // 400 (Bad Request) など、リトライしても無駄なエラー
        let errorBodyText = await response.text();
        let errorBody;
        try {
            errorBody = JSON.parse(errorBodyText);
            logger.error(`[callGeminiApiWithRetry] Received non-retriable status ${response.status}:`, errorBody);
        } catch(e) {
            logger.error(`[callGeminiApiWithRetry] Received non-retriable status ${response.status} (non-json response):`, errorBodyText);
            errorBody = { error: { message: errorBodyText } };
        }
        
        // ★★★ アップグレード ステップ2: AIからのエラーメッセージをクライアントに返す ★★★
        const errorMessage = errorBody?.error?.message || `Unknown API error (Status: ${response.status})`;
        throw new Error(`Gemini API Error: (Code: ${errorBody?.error?.code || response.status}) ${errorMessage}`);
      }
    } catch (fetchError) {
      logger.error(`[callGeminiApiWithRetry] Fetch attempt ${attempt} failed:`, fetchError);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        throw new Error(`Gemini API fetch failed after ${maxRetries} attempts: ${fetchError.message}`);
      }
    }
  }
  // ループが完了しても成功しなかった場合（理論上到達しないが）
  throw new Error(`Gemini API call failed exhaustively after ${maxRetries} retries.`);
}