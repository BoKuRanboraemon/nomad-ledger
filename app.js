// --- 画面の高さを絶対的なピクセルで強制固定する処理 ---
const fixViewportHeight = () => {
    const exactHeight = window.innerHeight + 'px';
    document.documentElement.style.height = exactHeight;
    document.body.style.height = exactHeight;
    
    const appContainer = document.getElementById('app');
    if (appContainer) {
      appContainer.style.height = exactHeight;
    }
};
window.addEventListener('resize', fixViewportHeight);
window.addEventListener('DOMContentLoaded', fixViewportHeight);
fixViewportHeight();

let cart = JSON.parse(localStorage.getItem('current_cart')) || [];
let receivedStr = localStorage.getItem('received_str') || "0";
let config = { store_name: "Loading...", endpoint_url: "" };
let products = {};

const formatYen = (amount) => {
  return "¥" + Math.floor(amount).toLocaleString("ja-JP");
};

const calculateChangeBreakdown = (changeAmount) => {
  if (changeAmount <= 0) return "";
  let remaining = changeAmount;
  const units = [10000, 5000, 1000, 500, 100, 50, 10, 5, 1];
  const unitNames = {
    10000: "万札", 5000: "五千円札", 1000: "千円札",
    500: "500円玉", 100: "100円玉", 50: "50円玉",
    10: "10円玉", 5: "5円玉", 1: "1円玉"
  };
  const breakdown = [];
  for (const unit of units) {
    const count = Math.floor(remaining / unit);
    if (count > 0) {
      breakdown.push(`${unitNames[unit]} × ${count}`);
      remaining %= unit;
    }
  }
  return breakdown.join("、");
};

const init = async () => {
  try {
    const [configRes, productsRes] = await Promise.all([
      fetch("data/config.json"),
      fetch("data/products.json")
    ]);
    
    if (!configRes.ok || !productsRes.ok) throw new Error("Fetch failed");
    
    const fetchedConfig = await configRes.json();
    const fetchedProducts = await productsRes.json();
    
    if (!localStorage.getItem("app_config")) {
        localStorage.setItem("app_config", JSON.stringify(fetchedConfig));
    }
    if (!localStorage.getItem("app_products")) {
        localStorage.setItem("app_products", JSON.stringify(fetchedProducts));
    }
  } catch (error) {
    console.error("Fetch failed. Using localStorage data.", error);
  }

  const savedConfig = localStorage.getItem("app_config");
  const savedProducts = localStorage.getItem("app_products");
  if (savedConfig) config = JSON.parse(savedConfig);
  if (savedProducts) products = JSON.parse(savedProducts);

  setupEventListeners();
  renderUI();
};

const setupEventListeners = () => {
  const undoBtn = document.getElementById("btn-undo");
  const finalizeBtn = document.getElementById("btn-finalize");
  const syncBtn = document.getElementById("btn-sync");
  const keypadBtns = document.querySelectorAll(".keypad-btn");
  
  // モーダル制御要素
  const btnSettings = document.getElementById("btn-settings");
  const btnCloseSettings = document.getElementById("btn-close-settings");
  const btnSaveSettings = document.getElementById("btn-save-settings");
  const btnDownloadProducts = document.getElementById("btn-download-products");
  const settingsModal = document.getElementById("settings-modal");

  // 設定を開く
  if (btnSettings && settingsModal) {
    btnSettings.onclick = () => {
      document.getElementById("input-store-name").value = config.store_name || "";
      document.getElementById("input-endpoint-url").value = config.endpoint_url || "";
      document.getElementById("current-product-count").innerText = Object.keys(products).length;
      settingsModal.classList.remove("hidden");
    };
  }

  // 商品リストを一括ダウンロードする
  if (btnDownloadProducts) {
    btnDownloadProducts.onclick = async () => {
      // 入力されているURLを優先的に使用する
      const targetUrl = document.getElementById("input-endpoint-url").value.trim() || config.endpoint_url;
      
      if (!targetUrl) {
        alert("エンドポイントURLを入力してください。");
        return;
      }

      const originalText = btnDownloadProducts.innerText;
      try {
        btnDownloadProducts.innerText = "ダウンロード中...";
        btnDownloadProducts.disabled = true;

        const response = await fetch(targetUrl);
        if (!response.ok) throw new Error("ネットワークエラーが発生しました。");
        
        const newProducts = await response.json();
        
        // 取得したデータで上書き保存
        products = newProducts;
        localStorage.setItem("app_products", JSON.stringify(products));
        
        document.getElementById("current-product-count").innerText = Object.keys(products).length;
        renderUI();
        alert("スプレッドシートから最新の商品マスタを取得しました！");
      } catch (error) {
        console.error("Download failed:", error);
        alert("ダウンロードに失敗しました。URLが正しいか、電波の状態を確認してください。");
      } finally {
        btnDownloadProducts.innerText = originalText;
        btnDownloadProducts.disabled = false;
      }
    };
  }

  // 設定を保存する
  if (btnSaveSettings) {
    btnSaveSettings.onclick = () => {
      config.store_name = document.getElementById("input-store-name").value.trim();
      config.endpoint_url = document.getElementById("input-endpoint-url").value.trim();
      
      // 正しいキー名 "app_config" で保存
      localStorage.setItem("app_config", JSON.stringify(config));

      settingsModal.classList.add("hidden");
      renderUI();
      alert("設定を保存しました。");
    };
  }

  // 設定を閉じる
  if (btnCloseSettings && settingsModal) {
    btnCloseSettings.onclick = () => {
      settingsModal.classList.add("hidden");
    };
  }

  if (undoBtn) {
    undoBtn.onclick = () => {
      cart.pop();
      saveCart();
      renderUI();
    };
  }
  keypadBtns.forEach((btn) => {
    btn.onclick = () => {
      const val = btn.innerText;
      handleKeypadInput(val);
    };
  });
  if (finalizeBtn) {
    finalizeBtn.onclick = finalizeTransaction;
  }
  if (syncBtn) {
    syncBtn.onclick = syncData;
  }
};

const handleKeypadInput = (val) => {
  if (val === "C") {
    receivedStr = "0";
  } else if (val === "00") {
    receivedStr += "00";
  } else {
    if (receivedStr === "0") {
      receivedStr = val;
    } else {
      receivedStr += val;
    }
  }
  saveReceived();
  renderUI();
};

const finalizeTransaction = () => {
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  const receivedAmount = parseFloat(receivedStr);
  const change = receivedAmount - total;
  if (change < 0) {
    alert("Insufficient funds");
    return;
  }
  
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const formattedTimestamp = `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;

  const historyEntry = {
    id: Date.now(),
    timestamp: formattedTimestamp,
    items: cart.map(item => item.name),
    total: total,
    received: receivedAmount,
    change: change
  };
  const history = JSON.parse(localStorage.getItem("nomad_sales_history") || "[]");
  history.push(historyEntry);
  localStorage.setItem("nomad_sales_history", JSON.stringify(history));
  alert("会計を完了しました。");
  cart = [];
  receivedStr = "0";
  localStorage.removeItem('current_cart');
  saveCart();
  saveReceived();
  renderUI();
};

const syncData = async () => {
  if (!config.endpoint_url) return;
  if (!navigator.onLine) {
    alert("オフラインのため同期できません");
    return;
  }

  const syncButton = document.getElementById('btn-sync');
  if (syncButton) {
    syncButton.disabled = true;
    syncButton.innerText = "同期中...";
  }

  const history = JSON.parse(localStorage.getItem("nomad_sales_history") || "[]");
  const data = JSON.stringify({
    "store_name": config.store_name,
    "transactions": history
  });

  try {
    const response = await fetch(config.endpoint_url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: data
    });
    const result = await response.json();
    if (result.status === "success") {
      localStorage.removeItem('nomad_sales_history');
      const statusElement = document.getElementById('sync-status');
      if (statusElement) {
        statusElement.innerText = "同期完了";
        statusElement.style.color = "green";
      }
      setTimeout(() => {
        if (statusElement) statusElement.style.color = "";
        renderUI();
      }, 1500);
    }
  } catch (error) {
    console.error("Sync failed:", error);
    alert("サーバー応答なし：電波の良い場所で再試行してください");
  } finally {
    if (syncButton) {
      syncButton.disabled = false;
      syncButton.innerText = "同期";
    }
  }
};

const saveCart = () => localStorage.setItem("current_cart", JSON.stringify(cart));
const saveReceived = () => localStorage.setItem("received_str", receivedStr);

const renderUI = () => {
  const storeNameDisplay = document.getElementById("store-name-display");
  if (storeNameDisplay) storeNameDisplay.innerText = config.store_name;

  const dataSourceInfo = document.getElementById("data-source-info");
  if (dataSourceInfo) dataSourceInfo.innerText = "データ参照元: localStorage";

  const productGrid = document.getElementById("product-grid");
  if (productGrid) {
    productGrid.innerHTML = "";
    for (const key in products) {
      const price = products[key];
      const btn = document.createElement("button");
      btn.className = "product-btn";
      btn.innerText = `${key} (${formatYen(price)})`;
      btn.onclick = () => {
        cart.push({ name: key, price: price });
        saveCart();
        renderUI();
      };
      productGrid.appendChild(btn);
    }
  }

  const subtotal = cart.reduce((sum, item) => sum + item.price, 0);
  const receivedAmount = parseFloat(receivedStr);
  const change = receivedAmount - subtotal;

  const subtotalDisplay = document.getElementById("subtotal-display");
  if (subtotalDisplay) subtotalDisplay.innerText = `ぜんぶで: ${formatYen(subtotal)}`;

  const receivedDisplay = document.getElementById("received-display");
  if (receivedDisplay) receivedDisplay.innerText = `もらったお金: ${formatYen(receivedAmount)}`;

  const changeDisplay = document.getElementById("change-display");
  if (changeDisplay) {
    changeDisplay.innerText = `おつり: ${formatYen(change)}`;
    changeDisplay.style.color = change < 0 ? "#d32f2f" : "#2e7d32";
  }

  const changeGuide = document.getElementById("change-guide");
  if (changeGuide) changeGuide.innerText = calculateChangeBreakdown(change);

  const undoBtn = document.getElementById("btn-undo");
  if (undoBtn) undoBtn.disabled = cart.length === 0;

  const finalizeBtn = document.getElementById("btn-finalize");
  if (finalizeBtn) finalizeBtn.disabled = cart.length === 0 || change < 0;

  const syncStatus = document.getElementById("sync-status");
  const syncBtn = document.getElementById("btn-sync");
  const history = JSON.parse(localStorage.getItem("nomad_sales_history") || "[]");
  if (syncStatus) syncStatus.innerText = `未同期: ${history.length}件`;

  if (syncBtn) {
    if (!config.endpoint_url) {
      syncBtn.disabled = true;
      syncBtn.innerText = "設定未完了";
    } else {
      syncBtn.disabled = history.length === 0;
      syncBtn.innerText = "同期";
    }
  }

  const endpointDisplay = document.getElementById("endpoint-info");
  if (endpointDisplay && config.endpoint_url) {
    try {
      const url = new URL(config.endpoint_url);
      endpointDisplay.innerText = url.origin;
    } catch (e) {
      endpointDisplay.innerText = config.endpoint_url;
    }
  }
};

init();
