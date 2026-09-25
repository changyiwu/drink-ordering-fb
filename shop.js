import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp, 
  deleteDoc, 
  doc,
  where,
  writeBatch,
  getDocs
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getAuth, initializeAuth, inMemoryPersistence, signInAnonymously, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js';

import { SHOPS_DATA } from './menu_data.js';

// Parse Query Parameters
const urlParams = new URLSearchParams(window.location.search);
const shopId = urlParams.get('shop');

// Redirect if shopId is invalid
if (!shopId || !SHOPS_DATA[shopId]) {
  alert('請選擇有效的飲料店！');
  window.location.href = 'index.html';
}

const shopInfo = SHOPS_DATA[shopId];

// Dynamically set shop theme, title and page head title
document.body.classList.add(shopInfo.themeClass);
document.title = `作伙喝飲料！ - ${shopInfo.name}`;
document.getElementById('shop-title').textContent = shopInfo.name;
document.getElementById('shop-subtitle').textContent = `朋友同事專屬 · ${shopInfo.name} 即時訂單看板`;
document.getElementById('shop-menu-link').href = shopInfo.menuLink || '#';

// Fallback helper to get drink price for old orders
function getDrinkPrice(shop, drink, size = 'L') {
  const shopData = SHOPS_DATA[shop];
  if (!shopData) return 0;
  const item = shopData.menu.find(m => m.name === drink);
  if (!item) return 0;
  if (item.prices) {
    return item.prices[size] || item.prices['L'] || item.prices['M'] || 0;
  }
  return item.price || 0;
}

// Dynamically populate drink options
const drinkSelect = document.getElementById('drink-name');
const cupSizeSelect = document.getElementById('cup-size');

// 依 category 分組渲染。單一 select 在 50嵐 有 81 個選項，手機上很難找；
// 分成「找好茶／找奶茶／拿鐵系列…」後好用許多。
const menuByCategory = new Map();
shopInfo.menu.forEach(drink => {
  const category = drink.category || '其他';
  if (!menuByCategory.has(category)) menuByCategory.set(category, []);
  menuByCategory.get(category).push(drink);
});

menuByCategory.forEach((drinks, category) => {
  const group = document.createElement('optgroup');
  group.label = category;
  drinks.forEach(drink => {
    const option = document.createElement('option');
    option.value = drink.name;
    option.textContent = drink.name;
    group.appendChild(option);
  });
  drinkSelect.appendChild(group);
});

// Dynamic size options loading based on chosen drink
drinkSelect.addEventListener('change', () => {
  const selectedDrinkName = drinkSelect.value;
  const selectedDrink = shopInfo.menu.find(d => d.name === selectedDrinkName);
  
  // Clear old options
  cupSizeSelect.innerHTML = '<option value="" disabled selected>請選擇容量</option>';
  
  if (selectedDrink && selectedDrink.prices) {
    Object.keys(selectedDrink.prices).forEach(size => {
      const price = selectedDrink.prices[size];
      const option = document.createElement('option');
      option.value = size;
      option.setAttribute('data-price', price);
      const sizeLabel = size === 'L' ? '大杯 (L)' : '中杯 (M)';
      option.textContent = `${sizeLabel} - $${price}`;
      cupSizeSelect.appendChild(option);
    });
    
    // Auto-select size if there's only one option
    const sizeKeys = Object.keys(selectedDrink.prices);
    if (sizeKeys.length === 1) {
      cupSizeSelect.value = sizeKeys[0];
    }
  }
});

// Firebase configuration
const firebaseConfig = {
  projectId: "drink-ordering-chang",
  appId: "1:230592197281:web:0d8c834040877bdde836e0",
  storageBucket: "drink-ordering-chang.firebasestorage.app",
  apiKey: "AIzaSyDhW_Nv_YYK0XlbQ-7ssmVTS046VNRz2kQ",
  authDomain: "drink-ordering-chang.firebaseapp.com",
  messagingSenderId: "230592197281",
  projectNumber: "230592197281",
  version: "2"
};

// App Check：擋掉非本站來源的自動化用戶端，降低匿名登入被腳本濫用的風險。
// Console 設定步驟見 README 的「App Check 設定」章節。
const APP_CHECK_SITE_KEY = '6LedLWUtAAAAAMs3XiNCFbffNp09yyO25spincPN';
const ADMIN_EMAIL = 'changyiwu@gmail.com';

// 只在正式網域啟用。本機以 file:// 或 localhost 開啟時 reCAPTCHA 換不到有效 token，
// 跳過初始化才不會擋住開發。此處必須與 reCAPTCHA 主控台註冊的網域一致；
// 日後若換網域（例如自訂網域），這裡與 reCAPTCHA 設定要同步更新，否則正式站會拿不到 token。
const APP_CHECK_HOSTS = ['changyiwu.github.io'];

// 本機開發時 API key 的 referrer 限制會擋掉 localhost，Firebase 連不上；而且就算
// 連得上，讀寫到的也是同事正在用的正式訂單。所以本機一律改跑純前端的離線示範模式，
// UI 調整不必每次推上線才看得到，也不會誤動真實資料。
// 正式網域不在這份清單裡，線上行為完全不受影響。
const DEMO_HOSTS = ['localhost', '127.0.0.1', ''];
const DEMO_MODE = DEMO_HOSTS.includes(location.hostname);
const DEMO_UID = 'demo-me';
const DEMO_OTHER_UID = 'demo-other';
const DEMO_ADMIN_PASSWORD = 'demo';

// 這三個只在正式模式下建立；示範模式一律維持 null，
// 從根本保證本機沒有任何一條路徑碰得到正式 Firestore。
let db = null;
let auth = null;
let ordersCollection = null;
let adminAuth = null;
let adminDb = null;

// 目前使用者的 UID。看板渲染只讀這個變數、不直接碰 auth，
// 資料來源換掉時（例如改餵假資料）渲染路徑就不必跟著改。
let myUid = null;

function initFirebase() {
  const app = initializeApp(firebaseConfig);

  if (APP_CHECK_SITE_KEY && APP_CHECK_HOSTS.includes(location.hostname)) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
  }

  db = getFirestore(app);
  auth = getAuth(app);
  ordersCollection = collection(db, 'orders');

  // 管理員使用獨立且只存記憶體的登入，不取代訂購者的匿名身分。
  const adminApp = initializeApp(firebaseConfig, 'drink-ordering-admin');
  if (APP_CHECK_SITE_KEY && APP_CHECK_HOSTS.includes(location.hostname)) {
    initializeAppCheck(adminApp, {
      provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
  }
  adminAuth = initializeAuth(adminApp, { persistence: inMemoryPersistence });
  adminDb = getFirestore(adminApp);

  // Sign in anonymously
  signInAnonymously(auth)
    .then((userCredential) => {
      myUid = userCredential.user.uid;
      console.log('Firebase Anonymous Auth Success. UID:', myUid);
      renderBoard(lastOrders);
    })
    .catch((error) => {
      console.error('Firebase Auth failed:', error);
      showToast('❌ 驗證失敗，無法連接資料庫！', 'error');
    });

  // Listen for Real-time orders updates from Firestore for this specific shop.
  // 這裡只負責把 snapshot 攤平成物件陣列，渲染一律交給 renderBoard。
  const q = query(ordersCollection, where('shopId', '==', shopId));

  onSnapshot(q, (snapshot) => {
    const orders = [];
    snapshot.forEach((doc) => {
      orders.push({ id: doc.id, ...doc.data() });
    });
    renderBoard(orders);
  }, (error) => {
    console.error("Firestore listen error: ", error);
    showToast("❌ 資料庫同步失敗！請重新載入網頁", "error");
  });
}

// 送單與清除的共同前置檢查：示範模式永遠就緒，正式模式要等匿名登入拿到 UID。
// 比對 myUid 而非只看 auth.currentUser，可避免在 UID 還沒設好時送出 userId 為空的訂單。
function isReady() {
  return DEMO_MODE || !!(db && auth && auth.currentUser && myUid);
}

// DOM Elements
const orderForm = document.getElementById('order-form');
const buyerNameInput = document.getElementById('buyer-name');
const cupCountInput = document.getElementById('cup-count');
const sweetnessSelect = document.getElementById('sweetness');
const iceLevelSelect = document.getElementById('ice-level');

const stepperMinusBtn = document.getElementById('stepper-minus');
const stepperPlusBtn = document.getElementById('stepper-plus');

const ordersList = document.getElementById('orders-list');
const emptyState = document.getElementById('empty-state');
const statPeople = document.getElementById('stat-people');
const statCups = document.getElementById('stat-cups');
const toast = document.getElementById('toast');
const summaryTableBody = document.getElementById('summary-table-body');
const paymentTableBody = document.getElementById('payment-table-body');
const clearAllBtn = document.getElementById('clear-all-btn');

// 主揪人專區
const hostLoginBtn = document.getElementById('host-login-btn');
const hostTools = document.getElementById('host-tools');
const hostLogoutBtn = document.getElementById('host-logout-btn');
const hostLoginModal = document.getElementById('host-login-modal');
const hostLoginClose = document.getElementById('host-login-close');
const hostLoginForm = document.getElementById('host-login-form');
const hostLoginSubmit = document.getElementById('host-login-submit');
const hostPasswordInput = document.getElementById('host-password');
const hostPasswordGroup = document.getElementById('host-password-group');
const hostLoginError = document.getElementById('host-login-error');

// Custom Cup Count Stepper Logic
stepperMinusBtn.addEventListener('click', () => {
  let val = parseInt(cupCountInput.value) || 1;
  if (val > 1) {
    cupCountInput.value = val - 1;
  }
});

stepperPlusBtn.addEventListener('click', () => {
  let val = parseInt(cupCountInput.value) || 1;
  if (val < 100) {
    cupCountInput.value = val + 1;
  }
});

cupCountInput.addEventListener('change', () => {
  let val = parseInt(cupCountInput.value);
  if (isNaN(val) || val < 1) {
    cupCountInput.value = 1;
  } else if (val > 100) {
    cupCountInput.value = 100;
  }
});

// Toast Notification System
function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  
  if (window.toastTimeout) {
    clearTimeout(window.toastTimeout);
  }
  
  window.toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

// Form Validation and submission
orderForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!isReady()) {
    showToast('❌ 尚未完成身份驗證，請稍後再試！', 'error');
    return;
  }
  
  let isValid = true;

  // Reset errors
  document.querySelectorAll('.input-group').forEach(grp => grp.classList.remove('invalid'));

  // 1. Name Check
  if (!buyerNameInput.value.trim()) {
    buyerNameInput.closest('.input-group').classList.add('invalid');
    isValid = false;
  }

  // 2. Drink Check
  if (!drinkSelect.value) {
    drinkSelect.closest('.input-group').classList.add('invalid');
    isValid = false;
  }

  // 3. Cups Check
  const cups = parseInt(cupCountInput.value);
  if (isNaN(cups) || cups < 1) {
    cupCountInput.closest('.input-group').classList.add('invalid');
    isValid = false;
  }

  // 4. Sweetness Check
  if (!sweetnessSelect.value) {
    sweetnessSelect.closest('.input-group').classList.add('invalid');
    isValid = false;
  }

  // 5. Ice Check
  if (!iceLevelSelect.value) {
    iceLevelSelect.closest('.input-group').classList.add('invalid');
    isValid = false;
  }

  // 6. Size Check
  if (!cupSizeSelect.value) {
    cupSizeSelect.closest('.input-group').classList.add('invalid');
    isValid = false;
  }

  if (!isValid) {
    showToast('請填寫所有必要欄位喔！', 'error');
    return;
  }

  // Disable submit button during save
  const submitBtn = document.getElementById('submit-order-btn');
  submitBtn.disabled = true;
  submitBtn.querySelector('.btn-text').textContent = '送出中...';

  try {
    const size = cupSizeSelect.value;
    const selectedSizeOption = cupSizeSelect.options[cupSizeSelect.selectedIndex];
    const price = parseInt(selectedSizeOption.getAttribute('data-price')) || 0;

    // Order payload (including shopId, shopName, price, size, userId)
    const orderData = {
      userId: myUid,
      shopId: shopId,
      shopName: shopInfo.name,
      buyerName: buyerNameInput.value.trim(),
      drinkName: drinkSelect.value,
      size: size,
      price: price,
      cups: cups,
      sweetness: sweetnessSelect.value,
      ice: iceLevelSelect.value
    };

    if (DEMO_MODE) {
      // createdAt 由示範資料存放區補上；正式模式交給伺服器時間戳
      demoAddOrder(orderData);
    } else {
      await addDoc(ordersCollection, { ...orderData, createdAt: serverTimestamp() });
    }

    showToast('🎉 訂單已成功送出！');

    // 手機上表單到看板約 1290px，不捲動的話看不到自己的訂單出現。
    // 尊重使用者的「減少動態效果」偏好設定。
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelector('.board-section')?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start'
    });

    // Clear inputs (except name for convenience)
    drinkSelect.value = '';
    cupSizeSelect.innerHTML = '<option value="" disabled selected>請選擇容量</option>';
    cupCountInput.value = '1';
    sweetnessSelect.value = '';
    iceLevelSelect.value = '';
    
  } catch (error) {
    console.error('Error adding document: ', error);
    showToast('❌ 送出失敗，請再試一次！', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.querySelector('.btn-text').textContent = '送出訂單';
  }
});

// Delete Order logic
async function deleteOrder(id, buyerName, isOwnOrder) {
  const question = isOwnOrder
    ? `確定要刪除 ${buyerName} 的訂單嗎？`
    : `你正以主揪人身份刪除「${buyerName}」的訂單，確定嗎？`;
  if (confirm(question)) {
    try {
      if (DEMO_MODE) {
        demoDeleteOrder(id);
      } else {
        await deleteDoc(doc(isHostLoggedIn ? adminDb : db, 'orders', id));
      }
      showToast('🗑️ 訂單已成功刪除');
    } catch (error) {
      console.error('Error deleting document: ', error);
      showToast('❌ 刪除失敗，請再試一次', 'error');
    }
  }
}

// ---------------------------------------------------------------------------
// 主揪人登入
//
// 畫面仍只收一組主揪人密碼。Firebase Authentication 驗證密碼並限制異常嘗試；
// Firestore 規則只信任指定的管理員 UID，訂購者的匿名身分保持獨立。
// 管理員登入只存在記憶體，重新整理就要重登。
// ---------------------------------------------------------------------------

let isHostLoggedIn = false;

// renderBoard 收到的最後一批訂單。登入狀態一變，刪除鈕的顯示條件就跟著變，
// 但資料沒變——重畫一次即可，不必等下一次 snapshot。
let lastOrders = [];

function openHostLoginModal() {
  hostPasswordInput.value = '';
  hostPasswordGroup.classList.remove('invalid');
  hostLoginModal.classList.remove('hidden');
  hostPasswordInput.focus();
}

function closeHostLoginModal() {
  hostLoginModal.classList.add('hidden');
  hostPasswordInput.value = '';
  hostPasswordGroup.classList.remove('invalid');
}

function setHostLoggedIn(loggedIn) {
  isHostLoggedIn = loggedIn;
  hostLoginBtn.classList.toggle('hidden', loggedIn);
  hostTools.classList.toggle('hidden', !loggedIn);
  // 重畫看板：登入後每一列都要出現刪除鈕，登出後只留自己的
  renderBoard(lastOrders);
}

function showHostLoginError(message) {
  hostLoginError.textContent = message;
  hostPasswordGroup.classList.add('invalid');
}

// 正式模式由 Firebase Authentication 檢查密碼，錯誤嘗試不再寫入 Firestore。
async function verifyHostPassword(password) {
  if (DEMO_MODE) return password === DEMO_ADMIN_PASSWORD;

  try {
    await signInWithEmailAndPassword(adminAuth, ADMIN_EMAIL, password);
    return true;
  } catch (error) {
    if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(error.code)) return false;
    throw error;
  }
}

hostLoginBtn.addEventListener('click', () => {
  if (!isReady()) {
    showToast('❌ 尚未完成身份驗證，請稍後再試！', 'error');
    return;
  }
  openHostLoginModal();
});

hostLoginClose.addEventListener('click', closeHostLoginModal);

// 點遮罩空白處關閉；點卡片內部不關
hostLoginModal.addEventListener('click', (e) => {
  if (e.target === hostLoginModal) closeHostLoginModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !hostLoginModal.classList.contains('hidden')) {
    closeHostLoginModal();
  }
});

hostLoginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!isReady()) {
    showToast('❌ 尚未完成身份驗證，請稍後再試！', 'error');
    return;
  }

  const password = hostPasswordInput.value.trim();
  if (!password) {
    showHostLoginError('請輸入密碼');
    return;
  }

  hostLoginSubmit.disabled = true;
  hostLoginSubmit.querySelector('.btn-text').textContent = '驗證中...';

  try {
    const ok = await verifyHostPassword(password);
    if (ok) {
      setHostLoggedIn(true);
      closeHostLoginModal();
      showToast('🔓 主揪人已登入');
    } else {
      showHostLoginError('密碼錯誤，請再試一次');
      hostPasswordInput.select();
    }
  } catch (error) {
    console.error('Host login failed: ', error);
    showHostLoginError(error.code === 'auth/too-many-requests'
      ? '登入嘗試過多，請稍後再試'
      : '登入失敗，請稍後再試');
  } finally {
    hostLoginSubmit.disabled = false;
    hostLoginSubmit.querySelector('.btn-text').textContent = '登入';
  }
});

async function hostLogout() {
  if (!DEMO_MODE) await signOut(adminAuth);
  setHostLoggedIn(false);
}

hostLogoutBtn.addEventListener('click', async () => {
  await hostLogout();
  showToast('👋 已登出主揪人');
});

// Clear All Shop Orders logic（只有登入後才看得到這顆按鈕）
clearAllBtn.addEventListener('click', async () => {
  if (!isReady() || !isHostLoggedIn) {
    showToast('❌ 請先以主揪人身份登入！', 'error');
    return;
  }

  if (!confirm(`⚠️ 警告：此動作將清除所有《${shopInfo.name}》的訂單，且無法復原！\n確定要繼續嗎？`)) {
    return;
  }

  clearAllBtn.disabled = true;
  clearAllBtn.querySelector('span').textContent = '清除中...';

  try {
    if (DEMO_MODE) {
      const deleted = demoClearAll();
      if (deleted === 0) {
        showToast('目前沒有可清除的訂單', 'error');
      } else {
        showToast(`🗑️ 已成功清除所有《${shopInfo.name}》的訂單！`);
      }
    } else {
      // 獲取該店家的所有訂單
      const q = query(collection(adminDb, 'orders'), where('shopId', '==', shopId));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        showToast('目前沒有可清除的訂單', 'error');
        return;
      }

      const batch = writeBatch(adminDb);
      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // 執行批次刪除；每筆都由 Firestore 規則核對管理員 UID。
      await batch.commit();
      showToast(`🗑️ 已成功清除所有《${shopInfo.name}》的訂單！`);
    }
  } catch (error) {
    console.error('Error clearing documents: ', error);
    showToast('❌ 清除失敗，請重新登入後再試一次！', 'error');
  } finally {
    clearAllBtn.disabled = false;
    clearAllBtn.querySelector('span').textContent = '清除本頁全部訂單';
  }
});

// 看板渲染的唯一入口。參數是單純的訂單物件陣列（`{ id, ...欄位 }`），不依賴
// Firestore 的 snapshot 型別，因此任何來源的資料都能直接餵進來。
function renderBoard(orders) {
  // 留一份最新資料，登入／登出切換刪除鈕時不必等下一次 snapshot
  lastOrders = orders;

  // Clear loading state or current list
  ordersList.innerHTML = '';
  summaryTableBody.innerHTML = '';
  paymentTableBody.innerHTML = '';

  if (orders.length === 0) {
    emptyState.classList.remove('hidden');
    statPeople.textContent = '0';
    statCups.textContent = '0';
    
    // Empty stats table
    summaryTableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-muted);">無統計資料</td>
      </tr>
    `;
    
    // Empty payments table
    paymentTableBody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; color: var(--text-muted);">無統計資料</td>
      </tr>
    `;
    return;
  }
  
  emptyState.classList.add('hidden');
  
  let totalCups = 0;
  let totalMoney = 0;
  const uniqueNames = new Set();
  const summaryMap = {};
  const paymentMap = {};
  
  // Sort client-side to avoid requiring a composite index
  orders.sort((a, b) => {
    const timeA = a.createdAt ? (a.createdAt.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime()) : 0;
    const timeB = b.createdAt ? (b.createdAt.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime()) : 0;
    return timeB - timeA;
  });
  
  orders.forEach((order) => {
    const id = order.id;
    const cups = parseInt(order.cups) || 1;
    const drinkName = order.drinkName || '未填寫';
    const size = order.size || 'L';
    const price = parseInt(order.price) || getDrinkPrice(shopId, drinkName, size);
    const subtotal = price * cups;
    
    totalCups += cups;
    totalMoney += subtotal;
    
    if (order.buyerName) {
      uniqueNames.add(order.buyerName.trim());
    }
    
    // Grouping for Drink Summary Table (By Item + Size + Sweetness + Ice)
    const sweetness = order.sweetness || '未選';
    const ice = order.ice || '未選';
    const specKey = `${drinkName} (${size}) (${sweetness}/${ice})`;
    
    if (!summaryMap[specKey]) {
      summaryMap[specKey] = {
        drinkName: drinkName,
        size: size,
        price: price,
        specs: `${sweetness} / ${ice}`,
        cups: 0,
        total: 0
      };
    }
    summaryMap[specKey].cups += cups;
    summaryMap[specKey].total += subtotal;
    
    // Grouping for Personal Payment Table
    const buyer = order.buyerName ? order.buyerName.trim() : '無名氏';
    if (!paymentMap[buyer]) {
      paymentMap[buyer] = {
        buyer: buyer,
        items: [],
        total: 0
      };
    }
    const sizeLabelBrief = size === 'L' ? '大' : '中';
    paymentMap[buyer].items.push(`${drinkName} (${sizeLabelBrief} · $${price}) x${cups}`);
    paymentMap[buyer].total += subtotal;
    
    // Safe output escaping
    const buyerName = escapeHtml(buyer);
    const displayDrink = escapeHtml(drinkName);
    const displaySweetness = escapeHtml(sweetness);
    const displayIce = escapeHtml(ice);
    const sizeLabel = size === 'L' ? '大杯' : '中杯';

    // Check if the order belongs to the current user
    const isOwnOrder = !!(myUid && order.userId === myUid);
    // 主揪人登入後可刪任何人的訂單；規則層的 isAdmin() 是同一條授權來源
    const canDelete = isOwnOrder || isHostLoggedIn;

    // 不使用 inline onclick：屬性值會先經過 HTML 實體解碼，escapeHtml 產生的 &#39;
    // 會還原成單引號而逃脫 JS 字串，改用 addEventListener 從根本避免
    const deleteButtonHtml = canDelete ? `
      <button class="delete-order-btn" type="button" title="${isOwnOrder ? '刪除此訂單' : '以主揪人身份刪除此訂單'}">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    ` : '';

    // Create list row element
    const orderRow = document.createElement('div');
    orderRow.className = 'order-row';

    orderRow.innerHTML = `
      <div class="col-name">${buyerName}</div>
      <div class="col-drink">
        ${displayDrink} (${sizeLabel} · $${price})
      </div>
      <div class="col-specs">
        <div class="badge-wrapper">
          <span class="badge badge-sweetness">${displaySweetness}</span>
          <span class="badge badge-ice">${displayIce}</span>
        </div>
      </div>
      <div class="col-cups">
        <span class="badge-cups">${cups} 杯</span>
        <span style="font-size: 0.8rem; display: block; margin-top: 4px; font-weight: 700; color: var(--primary-color);">$${subtotal}</span>
      </div>
      <div class="col-action">
        ${deleteButtonHtml}
      </div>
    `;

    if (canDelete) {
      orderRow
        .querySelector('.delete-order-btn')
        .addEventListener('click', () => deleteOrder(id, buyer, isOwnOrder));
    }

    ordersList.appendChild(orderRow);
  });
  
  // Render consolidated summary table
  const sortedKeys = Object.keys(summaryMap).sort((a, b) => a.localeCompare(b));
  sortedKeys.forEach(key => {
    const item = summaryMap[key];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(item.drinkName)}</td>
      <td><span class="badge badge-sweetness">${item.size === 'L' ? '大杯 (L) - $' + item.price : '中杯 (M) - $' + item.price}</span> / ${escapeHtml(item.specs)}</td>
      <td style="text-align: center; font-weight: 700;">${item.cups} 杯</td>
      <td style="text-align: center; font-weight: 700; color: var(--primary-color);">$${item.total}</td>
    `;
    summaryTableBody.appendChild(tr);
  });
  
  // Add total row to summary table
  const totalTr = document.createElement('tr');
  totalTr.className = 'summary-row-total';
  totalTr.innerHTML = `
    <td colspan="2" style="text-align: right;">總計：</td>
    <td style="text-align: center;">${totalCups} 杯</td>
    <td style="text-align: center;">$${totalMoney}</td>
  `;
  summaryTableBody.appendChild(totalTr);
  
  // Render Personal Payment Table
  const sortedBuyers = Object.keys(paymentMap).sort((a, b) => a.localeCompare(b));
  sortedBuyers.forEach(buyer => {
    const info = paymentMap[buyer];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--accent-color);">${escapeHtml(info.buyer)}</td>
      <td style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.4;">${escapeHtml(info.items.join('、'))}</td>
      <td style="text-align: center; font-weight: 800; color: var(--primary-color);">$${info.total}</td>
    `;
    paymentTableBody.appendChild(tr);
  });
  
  // Update dashboard stats
  statPeople.textContent = uniqueNames.size;
  statCups.textContent = totalCups;
}

// ---------------------------------------------------------------------------
// 離線示範模式的資料存放區（只在本機啟用）
// ---------------------------------------------------------------------------

// id -> 訂單物件，欄位形狀與 Firestore 的 orders 文件一致，
// 這樣 renderBoard 收到假資料與真資料時完全分不出差別。
const demoOrders = new Map();
let demoIdSeq = 0;

function demoNextId() {
  demoIdSeq += 1;
  return `demo-${demoIdSeq}`;
}

// 從這家店的真實菜單取尺寸與價格，五家店的假資料才會是合理金額
function demoSizeAndPrice(item) {
  if (item.prices) {
    const sizes = Object.keys(item.prices);
    const size = sizes.includes('L') ? 'L' : sizes[0];
    return { size, price: item.prices[size] };
  }
  return { size: 'L', price: item.price || 0 };
}

function initDemoMode() {
  myUid = DEMO_UID;

  // 種子資料刻意混入別人的訂單與自己的訂單，
  // 「只有自己的訂單才有刪除鈕」這條邏輯才測得到
  const seed = [
    { buyerName: '小美', cups: 2, userId: DEMO_OTHER_UID, sweetness: '五分糖', ice: '微冰' },
    { buyerName: '阿哲', cups: 1, userId: DEMO_OTHER_UID, sweetness: '無糖', ice: '去冰' },
    { buyerName: '我自己', cups: 1, userId: DEMO_UID, sweetness: '全糖', ice: '正常冰' },
    { buyerName: '王大同', cups: 3, userId: DEMO_OTHER_UID, sweetness: '三分糖', ice: '熱飲' }
  ];

  // 固定基準時間往前遞減，排序結果才穩定（新的在上）
  const baseTime = Date.now();

  seed.forEach((entry, index) => {
    const item = shopInfo.menu[index % shopInfo.menu.length];
    if (!item) return;
    const { size, price } = demoSizeAndPrice(item);
    const id = demoNextId();
    demoOrders.set(id, {
      id,
      userId: entry.userId,
      shopId: shopId,
      shopName: shopInfo.name,
      buyerName: entry.buyerName,
      drinkName: item.name,
      size,
      price,
      cups: entry.cups,
      sweetness: entry.sweetness,
      ice: entry.ice,
      createdAt: new Date(baseTime - index * 60000)
    });
  });

  document.getElementById('demo-banner').classList.remove('hidden');
  demoEmit();

  console.info(
    `離線示範模式已啟用（${location.hostname || 'file://'}）。` +
    `主揪人密碼為「${DEMO_ADMIN_PASSWORD}」，所有資料只存在這個分頁裡，重新整理就會還原。`
  );
}

function demoEmit() {
  renderBoard(Array.from(demoOrders.values()));
}

function demoAddOrder(orderData) {
  const id = demoNextId();
  demoOrders.set(id, { ...orderData, id, createdAt: new Date() });
  demoEmit();
}

function demoDeleteOrder(id) {
  demoOrders.delete(id);
  demoEmit();
}

// 密碼在登入時就驗過了（見 verifyHostPassword），這裡只負責刪
function demoClearAll() {
  let deleted = 0;
  demoOrders.forEach((order, id) => {
    if (order.shopId === shopId) {
      demoOrders.delete(id);
      deleted += 1;
    }
  });
  demoEmit();
  return deleted;
}

// Escape HTML utility function for security
function escapeHtml(str) {
  return str.replace(/[&<>'"]/g,
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// ---------------------------------------------------------------------------
// 啟動：兩條路互斥，示範模式下 initFirebase 完全不會被呼叫。
// 放在檔案最末尾，確保上面所有 const（demoOrders 等）都已初始化，不會踩到 TDZ。
// ---------------------------------------------------------------------------
if (DEMO_MODE) {
  initDemoMode();
} else {
  initFirebase();
}
