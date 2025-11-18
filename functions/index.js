/**
 * Firebase Functions v2 (ESM Syntax)
 *
 * このファイルは v2構文 (import/export) を使用しています。
 */

// Firebase SDK
import {onRequest, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import admin from "firebase-admin";

// ★ 修正: CORS設定
const corsOptions = {
  cors: {
    origin: true,
    methods: ["POST", "GET", "OPTIONS"],
  },
};

// --- Firebase Admin SDKの初期化 ---
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
}


// --- シークレットの定義 ---
const llmApiKey = defineSecret("LLM_APIKEY");
const imageGenApiKey = defineSecret("IMAGEGEN_APIKEY");


// --- AIレスポンスのJSONスキーマ定義 (変更なし) ---
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
            // ★★★ アップグレード ステップ1: 項目追加 ★★★
            "faceStereoscopy": {"type": "STRING", "description": "顔の立体感 (例: 立体的, 平面的, 標準)"},
            "bodyTypeFeature": {"type": "STRING", "description": "体型の特徴 (例: 上重心(ストレートタイプ), 下重心(ウェーブタイプ), 骨感が目立つ(ナチュラルタイプ))"},
          },
          // ★★★ アップグレード ステップ1: 必須項目に追加 ★★★
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
        // ★★★ アップグレード ステップ1: 「現在の髪の状態」カテゴリを追加 ★★★
        "hairCondition": {
            "type": "OBJECT",
            "description": "写真（と将来の動画）から分析した現在の髪の状態",
            "properties": {
                "quality": {"type": "STRING", "description": "髪質 (例: 硬い, 柔らかい, 普通)"},
                "curlType": {"type": "STRING", "description": "クセ (例: 直毛, 波状毛, 捻転毛)"},
                "damageLevel": {"type": "STRING", "description": "ダメージレベル (例: 低(健康), 中(やや乾燥), 高(要ケア))"},
                "volume": {"type": "STRING", "description": "毛量 (例: 多い, 普通, 少ない)"},
            },
            "required": ["quality", "curlType", "damageLevel", "volume"],
        },
      },
      "required": ["face", "skeleton", "personalColor", "hairCondition"], // ★ 必須に追加
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
                "name": {"type": "STRING", "description": "ヘアカラーの名前 (例: ミルクティーベージュ)"},
                "description": {"type": "STRING", "description": "カラーの説明 (50-100文字程度)"},
              },
              "required": ["name", "description"],
            },
            "color2": {
              "type": "OBJECT",
              "properties": {
                "name": {"type": "STRING", "description": "ヘアカラーの名前 (例: コーラルピンク)"},
                "description": {"type": "STRING", "description": "カラーの説明 (50-100文字程度)"},
              },
              "required": ["name", "description"],
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
        // ★★★ アップグレード 提案①: ファッション提案のスキーマを追加 ★★★
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
      // ★★★ アップグレード 提案①: 必須項目に追加 ★★★
      "required": ["hairstyles", "haircolors", "bestColors", "makeup", "fashion", "comment"],
    },
  },
  "required": ["result", "proposal"],
};


// --- 診断リクエスト関数 (v2) ---
export const requestDiagnosis = onRequest(
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

      // ★★★ アップグレード 提案①: systemPrompt にファッション提案の指示を追加 ★★★
      const systemPrompt = `
あなたは日本の高名なトップヘアスタイリストAIです。
顧客から提供された**5つの素材（正面写真、サイド写真、バック写真、正面動画、バック動画）**と性別（${gender}）に基づき、以下のタスクを実行してください。

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

2.  **提案 (proposal)**: 診断結果（特に「現在の髪の状態」と「骨格」）に基づき、以下の提案をしてください。
    * **hairstyles**: 顧客の骨格だけでなく、**現在の髪質やクセ（例：波状毛）でも再現可能か**という観点で、最適なスタイルを2つ提案してください。
    * **haircolors**: 診断したパーソナルカラーとダメージレベルに基づき、提案してください。
    * **bestColors**: パーソナルカラーに基づき、HEXコード付きで4色提案してください。
    * **makeup**: パーソナルカラーに基づき、提案してください。
    * **fashion**: 診断結果の \`skeleton.bodyTypeFeature\`（骨格タイプ）に基づき、似合うファッションスタイルを2つ、具体的なアイテムを2つ提案してください。
    * **comment (総評)**: 全体を総括し、特に**現在の髪の状態（例：ダメージレベル高）**に基づいた具体的なケアアドバイス（例：サロンでの髪質改善トリートメント推奨）を必ず含めてください。
    * **重要:** ヘアスタイルの提案は、以下の参考サイトにあるような、日本の現代のトレンドスタイルを強く意識してください。
    * 参考サイト1: https://beauty.hotpepper.jp/catalog/
    * 参考サイト2: https://www.ozmall.co.jp/hairsalon/catalog/

回答は必ず指定されたJSONスキーマに従い、JSONオブジェクトのみを返してください。前置きやマークダウン（'''json ... '''）は一切含めないでください。
`;

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
          responseSchema: AI_RESPONSE_SCHEMA,
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
        // ★★★ アップグレード 提案①: fashion もチェック ★★★
        if (!parsedJson.result || !parsedJson.proposal || !parsedJson.result.hairCondition || !parsedJson.proposal.fashion) {
           logger.error("[requestDiagnosis] Parsed JSON missing required keys (result/proposal/hairCondition/fashion).", {parsed: parsedJson});
           throw new Error("AIの応答に必要なキー（result, proposal, hairCondition, fashion）が欠けています。");
        }

        res.status(200).json(parsedJson); // パースしたJSONを返す
      } catch (apiError) {
        logger.error("[requestDiagnosis] Gemini API call failed:", apiError);
        res.status(500).json({error: "Gemini API Error", message: `AI診断リクエストの送信に失敗しました。\n詳細: ${apiError.message}`});
      }
    });


// --- 画像生成リクエスト関数 (v2) ---
export const generateHairstyleImage = onRequest(
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
      // ▼▼▼ ★★★ 新規追加: userRequestsText, inspirationImageUrl を受け取る ★★★ ▼▼▼
      const {
        originalImageUrl,
        firebaseUid,
        hairstyleName,
        hairstyleDesc,
        haircolorName,
        haircolorDesc,
        userRequestsText, // (任意) ご要望テキスト
        inspirationImageUrl, // (任意) ご希望写真のURL
      } = req.body;
      // ▲▲▲ ★★★ 追加ここまで ★★★ ▲▲▲

      // (必須項目のチェックは変更なし)
      if (!originalImageUrl || !firebaseUid || !hairstyleName || !haircolorName) {
        logger.error("[generateHairstyleImage] Bad Request: Missing data.", {body: req.body});
        res.status(400).json({error: "Bad Request", message: "Missing required data (originalImageUrl, firebaseUid, hairstyleName, haircolorName)."});
        return;
      }

      logger.info(`[generateHairstyleImage] Received request for user: ${firebaseUid}`);

      // 3. 元画像データの取得 (変更なし)
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
        
        // ▼▼▼ ★★★ 400エラー修正: MIMEタイプを決め打ちせず、StorageのContent-Typeを信用する ★★★ ▼▼▼
        if (!contentType || !(contentType.startsWith("image/jpeg") || contentType.startsWith("image/png") || contentType.startsWith("image/gif"))) {
            logger.error(`[generateHairstyleImage] Unsupported Content-Type fetched from Storage: ${contentType}`);
            // HEIC/HEIFなどが圧縮されずにアップロードされた場合
            throw new Error(`サポートされていない画像形式（${contentType}）です。JPEG、PNG、またはGIFの画像をアップロードしてください。`);
        }
        
        imageMimeType = contentType; // StorageのContent-Typeをそのまま使用
        logger.info(`[generateHairstyleImage] Image fetched successfully. Using Content-Type: ${imageMimeType}`);
        // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲
        
        const imageBuffer = await imageResponse.arrayBuffer();
        imageBase64 = Buffer.from(imageBuffer).toString("base64");
        logger.info(`[generateHairstyleImage] Image fetched successfully. MimeType: ${imageMimeType}`);
      } catch (fetchError) {
        logger.error("[generateHairstyleImage] Failed to fetch or process image:", fetchError);
        res.status(500).json({error: "Image Fetch Error", message: `画像の取得に失敗しました: ${fetchError.message}`});
        return;
      }

      // ▼▼▼ ★★★ 新規追加: ご希望写真(任意)の取得 ★★★ ▼▼▼
      let inspirationImageBase64 = null;
      let inspirationMimeType = null;
      
      if (inspirationImageUrl) {
          try {
              logger.info(`[generateHairstyleImage] Fetching INSPIRATION image from: ${inspirationImageUrl.substring(0, 50)}...`);
              const inspResponse = await fetch(inspirationImageUrl);
              if (!inspResponse.ok) {
                  throw new Error(`Failed to fetch inspiration image: ${inspResponse.status} ${inspResponse.statusText}`);
              }
              const inspContentType = inspResponse.headers.get("content-type");
              
              if (!inspContentType || !(inspContentType.startsWith("image/jpeg") || inspContentType.startsWith("image/png") || inspContentType.startsWith("image/gif"))) {
                   throw new Error(`Unsupported inspiration image type: ${inspContentType}`);
              }
              inspirationMimeType = inspContentType;
              const inspBuffer = await inspResponse.arrayBuffer();
              inspirationImageBase64 = Buffer.from(inspBuffer).toString("base64");
              logger.info(`[generateHairstyleImage] Inspiration image fetched successfully. Type: ${inspirationMimeType}`);

          } catch (inspFetchError) {
              // ★エラーは握りつぶし、警告だけ出す (ご希望写真はオプショナルなため)
              logger.warn(`[generateHairstyleImage] Failed to fetch inspiration image, proceeding without it: ${inspFetchError.message}`);
              inspirationImageBase64 = null;
              inspirationMimeType = null;
          }
      }
      // ▲▲▲ ★★★ 追加ここまで ★★★ ▲▲▲


      // 4. Gemini API リクエストペイロードの作成
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;

      // ▼▼▼ ★★★ 修正: 選択されたスタイル/カラーに応じてプロンプトを動的に構築 ★★★ ▼▼▼
      let stylePrompt, colorPrompt;

      // --- 1. スタイルの指示を決定 ---
      if (hairstyleName === 'inspiration_style') {
          if (inspirationImageBase64) {
              stylePrompt = `* **スタイル:** 【最重要】「画像2 (参考画像)」のヘアスタイルを忠実に再現してください。`;
              logger.info("[generateHairstyleImage] Prompt: Using INSPIRATION_STYLE.");
          } else {
              // ご希望スタイルが選ばれたが、ご希望写真の取得に失敗した場合
              logger.warn("[generateHairstyleImage] Prompt: INSPIRATION_STYLE selected but image is missing. Defaulting to user text.");
              stylePrompt = `* **スタイル:** お客様のテキスト要望（${userRequestsText || "特になし"}）に基づいてスタイルを生成してください。`;
          }
      } else {
          // AI提案 (e.g., style1)
          stylePrompt = `* **スタイル:** ${hairstyleName} (${hairstyleDesc})`;
          logger.info(`[generateHairstyleImage] Prompt: Using AI Style (${hairstyleName})`);
      }

      // --- 2. カラーの指示を決定 ---
      if (haircolorName === 'inspiration_color') {
          if (inspirationImageBase64) {
              colorPrompt = `* **カラー:** 【最重要】「画像2 (参考画像)」のヘアカラーを忠実に再現してください。`;
              logger.info("[generateHairstyleImage] Prompt: Using INSPIRATION_COLOR.");
          } else {
              logger.warn("[generateHairstyleImage] Prompt: INSPIRATION_COLOR selected but image is missing. Defaulting to user text.");
              colorPrompt = `* **カラー:** お客様のテキスト要望（${userRequestsText || "特になし"}）に基づいてカラーを生成してください。`;
          }
      } else {
          // AI提案 (e.g., color1)
          colorPrompt = `* **カラー:** ${haircolorName} (${haircolorDesc})`;
           logger.info(`[generateHairstyleImage] Prompt: Using AI Color (${haircolorName})`);
      }

      // --- 3. 最終プロンプトの組み立て ---
      let prompt = `
（指示書: PDF 2-5ページ）
**目的:** 元画像の顔の特徴（顔の輪郭、目、鼻、口、肌の質感）を一切変更せず、指定されたヘアスタイルを極めて自然に合成（インペインティング）する。

**【重要】添付画像の役割定義:**
* **画像1 (ベース画像):** [添付された元画像 (1枚目)] この画像の**顔と背景**を使用します。
`;
      
      if (inspirationImageBase64) {
          prompt += `* **画像2 (参考画像):** [添付されたご希望の写真 (2枚目)] この画像はヘアスタイルとカラーの**参考**としてのみ使用します。\n`;
      } else {
          prompt += `* (参考画像なし)\n`;
      }
      
      if (userRequestsText && userRequestsText.trim() !== "") {
          prompt += `\n**顧客の事前要望 (テキスト):**\n* "${userRequestsText}"\n`;
      }

      prompt += `
**マスク:**
* [マスクは添付しない]
* **画像1 (ベース画像)** の顔領域を自動検出し、その顔を**一切変更せず**、髪型だけをインペインティングすること。

**指示:**
1.  **品質:** masterpiece, best quality, photorealistic hair, ultra realistic, lifelike hair texture, individual hair strands visible
2.  ${stylePrompt}
3.  ${colorPrompt}
4.  **光:** **画像1 (ベース画像)** の照明と一致させること。

**【ルール】:**
* もし「顧客の事前要望 (テキスト)」があり、上記指示（スタイル/カラー）と矛盾しない場合は、それも考慮してください。
* **画像1 (ベース画像)** の顔、肌、背景を絶対に合成しないでください。

**ネガティブプロンプト:**
unnatural color, flat, dull, lifeless hair, helmet-like, wig, hat, hair accessories, blurry, deformed, worst quality, (face changed), (skin texture changed), (different person), (background changed)
`;
      // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲


      // ▼▼▼ ★★★ 修正: parts 配列を動的に構築 ★★★ ▼▼▼
      // (1) 必須のパーツ（プロンプトと元画像）
      const parts = [
        {text: prompt},
        {
          inlineData: { // 元画像
            mimeType: imageMimeType,
            data: imageBase64,
          },
        },
      ];

      // (2) ご希望写真があれば追加
      if (inspirationImageBase64 && inspirationMimeType) {
          parts.push({
              inlineData: { // ご希望の写真
                  mimeType: inspirationMimeType,
                  data: inspirationImageBase64,
              },
          });
      }
      // ▲▲▲ ★★★ 修正ここまで ★★★ ▲▲▲

      const payload = {
        contents: [
          {
            role: "user",
            parts: parts, // ★動的に構築したparts配列
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
export const refineHairstyleImage = onRequest(
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
      const prompt = `
**目的:** 添付されたベース画像（ヘアスタイル合成済み）に対して、ユーザーの指示に基づき「髪の毛のみ」を微調整する。
**ベース画像:** [添付された画像]
**ユーザーの微調整指示:** "${refinementText}"
**厳格なルール:**
1.  **顔と背景の保護:** 顔の輪郭、目、鼻、口、肌の質感、背景は**一切変更してはならない**。
2.  **髪のみ編集:** ユーザーの指示（"${refinementText}"）を、**髪の毛に対してのみ**適用すること。
3.  **品質:** photorealistic, lifelike hair texture を維持すること。

**ネガティブプロンプト:**
(face changed), (skin texture changed), (different person), (background changed), blurry, deformed, worst quality, unnatural color
`;

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
export const helloWorld = onRequest(corsOptions, (req, res) => {
  logger.info("[helloWorld] Hello world endpoint called!");
  res.status(200).send("Hello from Firebase Functions v2!");
});

// ★★★ 追加: 認証用Function ★★★
export const createFirebaseCustomToken = onRequest(
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