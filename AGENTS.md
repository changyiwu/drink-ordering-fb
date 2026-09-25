# drink-ordering-fb（專案藍圖）

> 本檔為跨 Agent 通用的專案藍圖（AGENTS.md 開放標準）。任何 Agent 的每個 session 都應先讀本檔＋`handoff.md`。

## 專案簡介

飲料訂購系統。純靜態前端搭配 Firebase Firestore，支援多家飲料店菜單、匿名下單與管理員清除流程。GitHub Pages 是正式前端；Firebase Hosting 舊網址轉址至它。

## 關鍵時程

<!-- 目前無固定時程 -->

## 目標與路線圖

- [x] 階段一：訂購前端與多店菜單（50嵐、清心福全、CoCo、鮮茶道、Mr. Wish）
- [x] 階段二：跨 Agent 規則入口統一為 `AGENTS.md`
- [x] 階段三：強化 `firestore.rules`——保護設定文件、限制管理授權文件擁有者、新增訂單時驗證姓名／杯數／價格欄位
- [x] 階段四：使用 Firebase CLI 部署並測試新 Firestore 規則
- [x] 階段五：驗證匿名使用者新增／修改／刪除自己訂單（線上實測 29 項全數通過）
- [x] 階段六：網站視覺、效能與可用性改善（標題對比、品牌 logo、banner 壓縮、選單分組、觸控尺寸、分享入口頁）
- [x] 階段七：圖片素材集中至 `images/`
- [ ] 階段八：主揪人登入已由使用者在正式站驗證；清除全部訂單尚待安全實測
- [x] 階段九：Firestore 與 Authentication App Check 均已強制執行
- [ ] 階段十（待評估）：訂單目前對任何匿名使用者全部可讀（含姓名），評估是否要限制
- [x] 階段十一：本機開發環境——看板渲染收斂為單一 `renderBoard()`，並新增 localhost 離線示範模式
- [x] 階段十二：清除入口改為主揪人登入制——移除「一鍵清除」按鈕，改為登入後才顯示清除與跨人刪除

## 資料夾結構

```
drink-ordering-fb/
├─ index.html          # 訂購主頁
├─ shop.html           # 店家頁
├─ shop.js             # 店家頁邏輯
├─ menu_data.js        # 菜單資料
├─ styles.css
├─ firestore.rules     # Firestore 安全規則
├─ firebase.json  .firebaserc  .firebase/
├─ 50lan.html  chingshin.html  coco.html  presotea.html  mrwish.html
│                     # 分享入口頁（帶專屬 OG 標籤後轉址）
├─ images/            # 所有圖片素材（banner、店家 logo、favicon）
├─ README.md
├─ AGENTS.md           # 本檔：專案藍圖
├─ handoff.md          # 交接檔（每次收工必更新）
└─ .gitignore
```

## 同步層級（本專案初始化至第 3 層級）

| 層級 | 平台 | 位置 | 讀取時機 |
|------|------|------|---------|
| L1 | 本地（GDrive） | `AGENTS.md`＋`handoff.md` | 每個 session |
| L2 | GitHub | https://github.com/changyiwu/drink-ordering-fb （公開） | 指定時 |
| L3 | Obsidian | `drink-ordering-fb/專案工作流程.md` | 有需要時 |

## 三個檔案的職責（依「時效性」分家，不是依「詳細程度」）

| 檔案 | 時效 | 寫入方式 | 放什麼 |
|------|------|---------|--------|
| `handoff.md` | **只對下一個 session 有效**，過期即丟 | 每次收工整份重寫 | 做到哪、下一步、**這次**的暫時 workaround |
| `AGENTS.md`（本檔） | **長期有效**，每個 session 都適用 | 只有規則本身變了才改 | 目標、路線圖、常設規則、結構 |
| Obsidian／`git log` | **歷史**：發生過什麼、為什麼 | 只增不刪 | 決策紀錄、踩坑完整版、逐次進度 |

驗收標準：**`handoff.md` 整份刪掉，不應損失任何長期資訊**——會的話代表該升級進本檔卻沒升級。

**本檔不要出現的東西**：❌ `## 最近進度`／逐次工作紀錄、❌ 決策理由與踩坑完整版。2026-08-03 移除了 `## 最近進度`，內容逐條比對後已在 L3 筆記的〈🗓️ 最近更動紀錄〉——**是主動移除，不是遺漏，不要補回來**。踩過的坑只把**結論**收斂成一條祈使句寫進〈工作約定〉，原因留 L3。

## 專案專屬規則

以下都是**長期有效**的約束，違反會壞掉或悄悄失效。完整成因與當初的取捨見 L3 筆記。

### 離線示範模式

- 判斷依據是 `shop.js` 的 `DEMO_HOSTS`（`localhost`／`127.0.0.1`／`''`）；正式網域不在清單內，線上行為不受影響
- 示範模式下 `db`／`auth`／`ordersCollection` **刻意維持 `null`**——這是「本機碰不到正式資料」的保證機制，**不要補預設值或改成 eager 初始化**
- **示範模式測不到 Firestore 規則**。欄位白名單、`update` 驗證、管理員 UID 授權都在規則層；示範模式密碼固定 `demo`，不連線到 Firebase
- Firebase SDK 是靜態 `import`，localhost 仍會從 gstatic 下載 SDK，只是不呼叫 `initializeApp`，所以不建立任何連線
- 改看板 UI 只需改 `renderBoard()`，真假資料共用同一條路徑；**假訂單的欄位形狀要與 Firestore 文件一致**，別讓兩邊漂移
- 一鍵清除的**正式分支刻意逐字保留**（含 empty 分支裡那個與 `finally` 重複的 `deleteDoc`）——安全路徑不順手重整
- `isReady()` 除了 `auth.currentUser` 還要求 `myUid` 有值（比原本嚴格），避免 UID 未設好時送出 `userId` 為空的訂單

### 安全

- 刪除權限分兩層：訂購者只能刪自己的（`resource.data.userId == request.auth.uid`），主揪人登入後可刪任何人的、也能一次清空本頁（`isAdmin()`）。前端的登入狀態只是 UI 開關，**真正的判定完全在規則層**
- 主揪人維持密碼單欄畫面，Firebase Authentication Email/Password 驗證固定帳號；訂購者的匿名 Auth 與管理員記憶體 Auth 分開，不能混用
- Firestore `isAdmin()` 必須驗證密碼登入方式與 `config/admin.adminUid`，不能只相信前端旗標；舊 `admin_auth`、`admin_probe` 一律拒絕用戶端操作
- Firebase Authentication 提供異常登入嘗試節流；Firestore 與 Authentication App Check 在正式站均已強制執行
- 變更密碼請到 Firebase Authentication 重設；舊密碼雜湊工具已移除，`passwordHash` 不再授權管理員
- 換網域時要**同步更新三處**：`shop.js` 的 `APP_CHECK_HOSTS`、reCAPTCHA 主控台網域清單、Firebase Console 的 App Check 設定。漏改會**靜默失敗**（未 Enforce 時完全無感）
- 規則中判斷 `size` 欄位必須寫 `data['size']`，寫 `data.size` 會與 Map 的 `size()` 方法混淆

### 視覺

- 店家 logo 五家皆為**主題色徽章**，深淺依 logo 本身明暗而定：CoCo、清心福全是白色圖案配主題深色底（`#B33600`／`#1B5E20`）；50嵐、鮮茶道、Mr. Wish 是深色圖案配主題淺色底。**不要為了一致把深淺統一**，兩種 logo 的需求相反
- 淺色徽章的**邊框不可省略**：卡片本身就是同色系淺色調，填色與卡片對比僅 1.01（鮮茶道）～1.15（50嵐），徽章形狀完全靠邊框界定
- `.shop-logo` 的 `min-height` 是 **52px**（圖片上限 40 ＋ 上下 padding 10 ＋ 上下邊框 2）。`box-sizing` 為 border-box，設 50 會讓店名錯開 2px
- 首頁卡片的主題色**不能用 `var(--primary-*)`**：主題變數定義在 `body.theme-*` 上，首頁 body 沒有主題 class，會取到 `:root` 預設值，必須寫死色碼
- `.shop-card .shop-logo` 用 `width: fit-content`，**不可用 `auto`**——`auto` 搭配子圖的百分比約束會形成循環依賴
- 分享連結要用 `50lan.html` 這類入口頁；直接分享 `shop.html?shop=50lan` 預覽會是通用標題

### 素材

- `images/source/` 內的原圖**請勿刪除**（現行 `drink_banner_v2.png`、舊版 `drink_banner.png`）：所有 banner 衍生檔都已裁掉上下，該裁切不可逆
- **banner 圖的比例必須與 `.banner-wrapper` 的 `aspect-ratio` 一致**（現為 10:3）。`.banner-wrapper` **不可改回固定 `height`**——高度寫死會讓 `object-fit: cover` 再裁掉上下，杯口與杯底被切掉。換圖時 CSS 的 `aspect-ratio`、`index.html` 與 `shop.html` 的 `<img height>` 三處要一起改
- 生 banner 時要在 prompt 明講「主體只佔畫面高度約三分之一、上下留白」，否則主體填滿整張圖，就沒有可裁成寬幅的餘裕
- 店家 logo 的原始 PNG 已移除，需要更高解析度時重新向品牌端取得（或從 git 歷史取回）
- `logo_chingshin.png` 是**使用中**的，它轉 WebP 後反而變大

## 工作約定

- 任何 Agent、任何電腦：**開工先讀 `handoff.md`，收工必更新 `handoff.md`**
- 修改共用檔案前先讀最新內容，避免覆蓋其他 Agent 的變更
- 所有回應與文件使用繁體中文；涉及檔案操作時回報完整產出位置
- Windows 指令優先使用 PowerShell 語法
- 收工時更新 Obsidian 專案筆記，檢查 diff，且只提交本次任務相關檔案
- 不把每日流水帳寫進本檔

## 安全與隱私

- 不要 commit API key、token、密碼或 Firebase Admin 憑證，也不要提交管理密碼
- `/config` 文件必須保持前端不可直接讀寫
- 不要自動納入無關的 Git 變更
- 不要儲存學生真名；正式資料只使用班級代號與座號
