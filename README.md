# drink-ordering-fb

飲料訂購系統 (Drink Ordering System)。

## 專案概要
本專案為一個飲料訂購系統，旨在提供便捷的飲料訂購與管理介面。正式前端以 GitHub Pages 為準；舊 Firebase Hosting 網址會轉址到同一路徑的 GitHub Pages，避免兩份前端版本漂移。

## 目錄結構
* `README.md` - 專案說明文件
* `AGENTS.md` - 跨 Agent 工作區規則與配置
* `firestore.rules` - Firestore 安全規則
* `.gitignore` - Git 忽略設定

## 主揪人登入

一般訂購者不必登入，隨時可以刪除自己的訂單。**主揪人**要在店家頁的「每人應付金額統計」
下方按「主揪人登入」並輸入密碼，登入後才會出現：

- 每一列訂單的刪除鈕（可刪別人的訂單）
- 「清除本頁全部訂單」

登入畫面仍只顯示密碼欄。正式模式以 Firebase Authentication 的 Email/Password
驗證固定的主揪人帳號 `changyiwu@gmail.com`。訂購者仍使用匿名身分；管理員另用
只存在分頁記憶體的 Firebase Auth 實例，重新整理或登出即失去登入狀態。

Firestore 規則核對 Firebase Authentication 核發的登入方式與 `config/admin.adminUid`，
不信任畫面上的登入狀態。舊 `admin_auth` 和 `admin_probe` 路徑已在規則中封鎖。
Firebase Authentication 會對異常密碼嘗試節流；Firestore 與 Authentication
的 App Check 在正式專案均已強制執行，提供另一層來源檢查。

## 管理員密碼設定與更換

1. Firebase Console → Authentication → Sign-in method：啟用 Email/Password。
2. Authentication → Users：建立 `changyiwu@gmail.com` 的 Email/Password 使用者，
   由管理員本人輸入一組高強度密碼，不要把密碼放進對話、程式碼或 Git。
3. 將該使用者的 UID 設為 Firestore `config/admin` 文件的字串欄位 `adminUid`。
   這份文件禁止用戶端讀寫；僅專案管理員可在 Console 修改。

日後換密碼，請在 Firebase Console → Authentication → Users 對此帳號重設密碼，
或使用 Firebase 提供的密碼重設流程；UID 不變時不必改 Firestore 規則。
Firebase Console 無法顯示目前密碼。若更換帳號，記得同步更新 `shop.js` 的
`ADMIN_EMAIL` 與 `config/admin.adminUid`。

## App Check 設定

App Check 會擋掉非本站來源的自動化用戶端，降低匿名登入被腳本濫用的風險。

1. Firebase Console → App Check → 註冊網頁應用程式，provider 選 **reCAPTCHA v3**
2. 取得網站金鑰（site key）
3. 填入 `shop.js` 的 `APP_CHECK_SITE_KEY` 常數
4. 觀察 Console 的 App Check 指標，確認正常流量都帶著有效 token 後，
   開啟 Firestore 與 Authentication 的**強制執行（enforcement）**。目前正式專案兩者均已強制執行

App Check 只在 `APP_CHECK_HOSTS` 列出的網域啟用（目前為 `changyiwu.github.io`）。
本機開發不受影響——見下節，localhost 根本不會初始化 Firebase。

⚠️ 換網域時要同時更新三個地方，否則正式站會拿不到 token：
`shop.js` 的 `APP_CHECK_HOSTS`、reCAPTCHA 主控台的網域清單、Firebase Console 的 App Check 設定。

## 本機開發：離線示範模式（localhost 自動啟用）

在 `localhost`、`127.0.0.1` 或 `file://` 開啟時，`shop.js` 會**完全跳過 Firebase 初始化**，
改用一份只存在記憶體裡的假訂單，頁面頂端會出現黃色虛線橫幅提示。

```bash
python -m http.server 4173
```

然後開 `http://localhost:4173/shop.html?shop=50lan`。

- 判斷依據為 `shop.js` 的 `DEMO_HOSTS`，正式網域不在清單內，**線上行為完全不受影響**
- 示範模式下 `db`／`auth`／`ordersCollection` 一律維持 `null`，所以本機**沒有任何一條路徑碰得到正式訂單資料**
- 假資料的飲料與價格取自該店的真實菜單，五家店都能看到合理金額
- 種子資料混有「自己的」與「別人的」訂單，可驗證未登入時只有自己的訂單有刪除鈕、主揪人登入後每一列都有
- 主揪人密碼固定為 `demo`（方便同時測成功與失敗兩條路徑），不連線到正式 Firebase Authentication
- 資料只存在當前分頁，重新整理就還原

⚠️ 示範模式**測不到 Firestore 安全規則**。欄位白名單、`update` 驗證、管理員 UID 授權都在規則層，
仍需使用 Firebase 規則模擬器或正式環境驗證。

## 分享店家連結

分享到 LINE／FB 時，**請用各店的分享入口頁**，預覽才會顯示正確的店名：

| 店家 | 分享網址 |
|---|---|
| 50嵐 | `https://changyiwu.github.io/drink-ordering-fb/50lan.html` |
| 清心福全 | `.../chingshin.html` |
| CoCo 都可 | `.../coco.html` |
| 鮮茶道 | `.../presotea.html` |
| Mr. Wish | `.../mrwish.html` |

這些頁面只帶專屬 OG 標籤，開啟後會立即轉址到對應的 `shop.html?shop=<id>`。
直接分享 `shop.html?shop=50lan` 的話，預覽會顯示通用標題——因為純靜態站無法依
query 參數產生 OG 標籤，爬蟲也不會執行 JS。

首頁的店家卡片仍直接連到 `shop.html`，避免日常使用多一次轉址。

## 首頁 QR Code

首頁下方的「分享這個頁面」區塊放的是 `images/qr_home.svg`，離線產生的靜態向量圖，
不依賴任何線上產圖服務。內容為首頁網址 `https://changyiwu.github.io/drink-ordering-fb/`。

點一下 QR 會用原生 `<dialog>` 放大（桌機 380px、手機吃滿寬度）。之所以用原生元素而不是
自刻 overlay：Esc 關閉、焦點鎖在對話框內、關閉後焦點退回原按鈕、背景 `inert` 全部由
瀏覽器負責。⚠️ `.qr-dialog` 必須明寫 `margin: auto`——原生 dialog 靠 UA 樣式的
`margin: auto` 置中，但 `styles.css` 開頭的 `* { margin: 0 }` 權重贏過 UA 樣式，
少了這行對話框會黏在畫面左上角。

網址若改變，必須重新產生並同步更新 `index.html` 裡 `.share-link` 的 `href` 與顯示文字：

```bash
python -m pip install qrcode
python -c "import qrcode; from qrcode.image.svg import SvgPathImage; qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=2); qr.add_data('https://changyiwu.github.io/drink-ordering-fb/'); qr.make(fit=True); qr.make_image(image_factory=SvgPathImage).save('images/qr_home.svg')"
```

產生後要手動補兩件事（`qrcode` 不會產生）：把 `width`／`height` 的 `mm` 單位改成
像素值，並在 `<path>` 前插入 `<rect width="37" height="37" fill="#ffffff"/>` 白底
（尺寸與 `viewBox` 相同）。**白底不可省略**——SVG 預設透明，沒有白底時深色背景
會讓明暗反轉而掃不出來。靜區（quiet zone）由 `border=2` 產生，外層 CSS 不必再補 padding。

## 圖片素材

所有圖片集中在 `images/`，原始素材另放 `images/source/`：

| 檔案 | 用途 |
|---|---|
| `drink_banner.webp` / `.jpg` | banner 顯示用，1600×480（10:3） |
| `drink_banner_og.jpg` | 社群分享用，1200×630 |
| `logo_*.webp` | 店家卡片用，高度 88px |
| `logo_chingshin.png`、`logo_mrwish.svg` | 維持原檔（轉 WebP 後反而較大，或本身為向量） |
| `favicon.svg` | 分頁圖示 |
| `qr_home.svg` | 首頁網址 QR Code，顯示 180×180（見〈首頁 QR Code〉） |
| `source/drink_banner_v2.png` | **現行 banner 的未裁切原圖**（1536×1024），頁面不載入 |
| `source/drink_banner.png` | 舊版 banner 原圖（1024×1024），已不使用但保留 |

`source/` 內兩張原圖都請勿刪除——上列所有 banner 衍生檔都已裁掉上下，
那個裁切不可逆。要換裁切比例或做方形分享圖時只能從原圖重新產生。

現行 banner 由 `agent-draw` 技能以 gpt-image-2 生成（無文字，四杯飲品置中排列，
刻意讓杯體只佔畫面高度約三分之一、上下留白），再從 `drink_banner_v2.png`
以杯體中心（y≈605）為準裁 1536×461，放大至 1600×480。

**`.banner-wrapper` 的 `aspect-ratio: 10 / 3` 必須與這張圖的比例一致**：
比例對齊後 `object-fit: cover` 才不會再裁掉上下，四杯飲料得以完整入鏡。
換圖時若改了比例，CSS 的 `aspect-ratio` 與兩個 HTML 的 `<img height>` 要一起改。

重新產生請用 [sharp](https://sharp.pixelplumbing.com/)，勿直接放大來源
（原本的 banner 就是被拉伸顯示才會模糊）。店家 logo 的原始 PNG 已移除，
需要更高解析度時請重新向品牌端取得。

## 部署

```bash
firebase deploy --only firestore:rules
```

前端為靜態檔案，透過 GitHub Pages 發佈（push 到 `main` 即生效）。
