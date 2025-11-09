/**
 * Firebase Functions v2
 *
 * このファイルは、v2構文（onTaskDispatched, onRequest, defineSecret）を使用しています。
 * v1構文（functions.https.onCall, functions.config()）は使用しません。
 */

// Firebase SDK
const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
// ★ 追記: Firebase Auth と Node.js の https モジュール
const {getAuth} = require("firebase-admin/auth");
const https = require("https");

// ★ 修正: CORSを有効にする（v2のonRequestではオプションとして渡す）
const corsOptions = {
  cors: {
    origin: true, // ★ 修正: "https://yhd-ai.web.app" から true に変更（開発用にすべてのオリジンを許可）
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

// --- シークレットの定義 ---
// firebase functions:secrets:set LLM_APIKEY で設定したシークレットを定義
const llmApiKey = defineSecret("LLM_APIKEY");
// firebase functions:secrets:set IMAGEGEN_APIKEY で設定したシークレットを定義
const imageGenApiKey = defineSecret("IMAGEGEN_APIKEY");


// --- AIレスポンスのJSONスキーマ定義 ---
// PDF（フェーズ4, 5）に基づき、AIにこの構造で返すよう強制する
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
            "eyes": {"type": "STRING", "description": "目のの特徴 (例: 二重, つり目)"},
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
          },
          "required": ["neckLength", "faceShape", "bodyLine", "shoulderLine"],
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
      },
      "required": ["face", "skeleton", "personalColor"],
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
                "name": {"type": "STRING", "description": "ヘアスタイルの名前 (例: シースルーバングショート)"},
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
        "comment": {"type": "STRING", "description": "AIトップヘアスタイリストによる総評 (200-300文字程度)"},
      },
      "required": ["hairstyles", "haircolors", "bestColors", "makeup", "comment"],
    },
  },
  "required": ["result", "proposal"],
};


// --- 診断リクエスト関数 (v2) ---
exports.requestDiagnosis = onRequest(
    {...corsOptions, secrets: [llmApiKey], timeoutSeconds: 120},
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
      if (!fileUrls || !fileUrls["item-front-photo"] || !userProfile || !gender) {
        logger.error("[requestDiagnosis] Bad Request: Missing data.", {body: req.body});
        res.status(400).json({error: "Bad Request", message: "Missing required data (fileUrls[item-front-photo], userProfile, gender)."});
        return;
      }

      logger.info(`[requestDiagnosis] Received request for user: ${userProfile.firebaseUid || userProfile.userId}`);

      // 3. 画像データの取得 (正面写真のみ)
      let imageBase64;
      let imageMimeType;
      try {
        const imageUrl = fileUrls["item-front-photo"];
        logger.info(`[requestDiagnosis] Fetching image from: ${imageUrl.substring(0, 50)}...`);
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
        }
        const contentType = imageResponse.headers.get("content-type");
        if (!contentType || !contentType.startsWith("image/")) {
          throw new Error(`Invalid content-type: ${contentType}`);
        }
        imageMimeType = contentType;
        const imageBuffer = await imageResponse.arrayBuffer();
        imageBase64 = Buffer.from(imageBuffer).toString("base64");
        logger.info(`[requestDiagnosis] Image fetched successfully. MimeType: ${imageMimeType}, Base64 Length: ${imageBase64.length}`);
      } catch (fetchError) {
        logger.error("[requestDiagnosis] Failed to fetch or process image:", fetchError);
        res.status(500).json({error: "Image Fetch Error", message: `画像の取得に失敗しました: ${fetchError.message}`});
        return;
      }

      // 4. Gemini API リクエストペイロードの作成
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

      const systemPrompt = `
あなたは日本の高名なトップヘアスタイリストAIです。
顧客から提供された写真（正面）と性別（${gender}）に基づき、以下のタスクを実行してください。

1.  **診断 (result)**: 写真から顧客の顔、骨格、パーソナルカラーの特徴を詳細に分析し、指定されたJSONスキーマの'result'フィールドに入力してください。
2.  **提案 (proposal)**: 診断結果に基づき、以下の提案を'proposal'フィールドに入力してください。
    * **hairstyles**: 顧客に似合うヘアスタイルを2つ提案。具体的で、なぜそれが似合うのかの短い説明（50-100文字）を含めてください。
    * **haircolors**: 顧客に似合うヘアカラーを2つ提案。説明（50-100文字）を含めてください。
    * **bestColors**: 診断したパーソナルカラー（特にシーズン）に基づき、顧客の魅力を引き出す「相性ベストカラー」を4色提案してください。色名（例: コーラルピンク）と、色見本表示用のHEXコード（例: #FF7F50）を必ずセットで生成してください。
    * **makeup**: 診断したパーソナルカラーに基づき、「似合うメイク」としてアイシャドウ、チーク、リップの色をそれぞれ提案してください。
    * **重要:** ヘアスタイルの提案は、以下の参考サイトにあるような、日本の現代のトレンドスタイルを強く意識してください。
    * 参考サイト1: https://beauty.hotpepper.jp/catalog/
    * 参考サイト2: https://www.ozmall.co.jp/hairsalon/catalog/
3.  **総評 (comment)**: 診断結果と提案を基に、顧客の魅力的な特徴を称え、全体的なアドバイスを総評（200-300文字）として'comment'フィールドに入力してください。

回答は必ず指定されたJSONスキーマに従い、JSONオブジェクトのみを返してください。前置きやマークダウン（'''json ... '''）は一切含めないでください。
`;

      const payload = {
        systemInstruction: {
          parts: [{text: systemPrompt}],
        },
        contents: [
          {
            role: "user",
            parts: [
              {text: `この顧客（性別: ${gender}）を診断し、提案してください。`},
              {
                inlineData: {
                  mimeType: imageMimeType,
                  data: imageBase64,
                },
              },
            ],
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
        if (!parsedJson.result || !parsedJson.proposal || !parsedJson.proposal.bestColors || !parsedJson.proposal.makeup) {
           logger.error("[requestDiagnosis] Parsed JSON missing required keys (result/proposal/bestColors/makeup).", {parsed: parsedJson});
           throw new Error("AIの応答に必要なキー（result, proposal, bestColors, makeup）が欠けています。");
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
      } = req.body;

      if (!originalImageUrl || !firebaseUid || !hairstyleName || !haircolorName) {
        logger.error("[generateHairstyleImage] Bad Request: Missing data.", {body: req.body});
        res.status(400).json({error: "Bad Request", message: "Missing required data (originalImageUrl, firebaseUid, hairstyleName, haircolorName)."});
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
        if (!contentType || !contentType.startsWith("image/")) {
          throw new Error(`Invalid content-type: ${contentType}`);
        }
        imageMimeType = contentType;
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

      const prompt = `
（指示書: PDF 2-5ページ）
**目的:** 元画像の顔の特徴（顔の輪郭、目、鼻、口、肌の質感）を一切変更せず、指定されたヘアスタイルを極めて自然に合成（インペインティング）する。
**元画像:** [添付された元画像]
**マスク:** [マスクは添付しない。元画像から顔領域を自動検出し、その顔を**一切変更せず**、髪型だけをインペインティングすること。]
**指示:**
1.  **品質:** masterpiece, best quality, photorealistic hair, ultra realistic, lifelike hair texture, individual hair strands visible
2.  **スタイル:** ${hairstyleName} (${hairstyleDesc})
3.  **カラー:** ${haircolorName} (${haircolorDesc})
4.  **光:** 元画像の照明（soft natural daylight, bright studio lightingなど）と一致させること。
5.  **質感:** soft and airy texture, glossy and sleek など、スタイルに合わせた自然な質感。

**ネガティブプロンプト:**
unnatural color, flat, dull, lifeless hair, helmet-like, wig, hat, hair accessories, blurry, deformed, worst quality, (face changed), (skin texture changed), (different person)
`;

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

        // ★★★ 削除: Firebase Storageへのアップロード処理 (ここから) ★★★
        // const bucket = storage.bucket(); ...
        // const [signedUrl] = await file.getSignedUrl(...);
        // logger.info(`[generateHairstyleImage] Signed URL generated successfully.`);
        // ★★★ 削除 (ここまで) ★★★

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

        // ★★★ 削除: Firebase Storageへのアップロード処理 (ここから) ★★★
        // const bucket = storage.bucket(); ...
        // const [signedUrl] = await file.getSignedUrl(...);
        // logger.info(`[refineHairstyleImage] Signed URL generated successfully.`);
        // ★★★ 削除 (ここまで) ★★★

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

// ★★★ ここから追記 (認証用Function) ★★★

/**
 * LINE AccessToken を検証し、Firebaseカスタムトークンを生成する (v2)
 * api.js の initializeLiffAndAuth から呼び出される
 */
exports.createFirebaseCustomToken = onRequest(
    corsOptions, // 既存のCORSオプションを流用
    async (req, res) => {
      // 1. メソッドとリクエストボディのチェック
      if (req.method !== "POST") {
        logger.warn(`[createFirebaseCustomToken] Method Not Allowed: ${req.method}`);
        res.status(405).json({error: "Method Not Allowed"});
        return;
      }

      const {accessToken} = req.body;
      if (!accessToken) {
        logger.error("[createFirebaseCustomToken] Bad Request: Missing accessToken.");
        res.status(400).json({error: "Bad Request", message: "accessToken is required."});
        return;
      }

      try {
        // 2. LINE Profile API (v2.1) を叩き、accessTokenを検証してLINE User IDを取得
        const lineUserId = await verifyLineTokenAndGetUid(accessToken);
        if (!lineUserId) {
             throw new Error("Invalid LINE Access Token.");
        }
        logger.info(`[createFirebaseCustomToken] Verified LINE User ID: ${lineUserId}`);

        // 3. Firebase Admin SDK を使い、そのLINE User IDをUIDとしてカスタムトークンを生成
        // (注: Auth上に同名のUIDを持つユーザーが自動作成される)
        const customToken = await getAuth().createCustomToken(lineUserId);
        logger.info(`[createFirebaseCustomToken] Custom token created for UID: ${lineUserId}`);

        // 4. カスタムトークンをクライアントに返す
        res.status(200).json({customToken: customToken});
      } catch (error) {
        logger.error("[createFirebaseCustomToken] Failed to create custom token:", error);
        if (error.message === "Invalid LINE Access Token.") {
            // LINEトークンが無効な場合は 401 Unauthorized を返す
            res.status(401).json({error: "Unauthorized", message: "Invalid LINE Access Token."});
        } else {
            // その他のエラー (Firebase Admin SDKエラーなど)
            res.status(500).json({error: "Internal Server Error", message: error.message});
        }
      }
    },
);

/**
 * [補助関数] LINE Profile API を呼び出してトークンを検証し、UIDを取得する
 * @param {string} accessToken
 * @return {Promise<string|null>} LINE User ID
 */
async function verifyLineTokenAndGetUid(accessToken) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "api.line.me",
            path: "/v2/profile",
            method: "GET",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
            },
        };

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                try {
                    if (res.statusCode === 200) {
                        const profile = JSON.parse(data);
                        resolve(profile.userId); // 成功時、userIdを返す
                    } else {
                        // 401 (認証失敗) など
                        logger.error(`[verifyLineToken] LINE API Error (Status: ${res.statusCode}): ${data}`);
                        reject(new Error("Invalid LINE Access Token."));
                    }
                } catch (e) {
                     reject(new Error(`Failed to parse LINE profile: ${e.message}`));
                }
            });
        });
        req.on("error", (e) => {
            reject(new Error(`LINE API request failed: ${e.message}`));
        });
        req.end();
    });
}
// ★★★ 追記ここまで ★★★


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
        const errorBody = await response.json();
        logger.error(`[callGeminiApiWithRetry] Received non-retriable status ${response.status}:`, errorBody);
        throw new Error(`Gemini API failed with status ${response.status}: ${JSON.stringify(errorBody)}`);
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