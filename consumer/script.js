const state = {
  user: null,
  stores: [],
  selectedStore: null,
  products: [],
  cart: null,
  orders: []
};

const elements = {
  loginForm: document.querySelector("#login-form"),
  appShell: document.querySelector("#app-shell"),
  message: document.querySelector("#message"),
  userName: document.querySelector("#user-name"),
  userEmail: document.querySelector("#user-email"),
  storeList: document.querySelector("#store-list"),
  selectedStoreTitle: document.querySelector("#selected-store-title"),
  storeDetail: document.querySelector("#store-detail"),
  productList: document.querySelector("#product-list"),
  cartContent: document.querySelector("#cart-content"),
  checkoutForm: document.querySelector("#checkout-form"),
  ordersList: document.querySelector("#orders-list"),
  refreshButton: document.querySelector("#refresh-dashboard"),
  logoutButton: document.querySelector("#logout-button")
};

function showMessage(text, tone = "info") {
  elements.message.hidden = false;
  elements.message.textContent = text;
  elements.message.dataset.tone = tone;
}

function hideMessage() {
  elements.message.hidden = true;
  elements.message.textContent = "";
  delete elements.message.dataset.tone;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : { message: await response.text() };

  if (!response.ok) {
    throw new Error(data.message || "Ocurrio un error en la solicitud.");
  }

  return data;
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(value);
}

function updateSessionUI() {
  const isLoggedIn = Boolean(state.user);
  elements.appShell.hidden = !isLoggedIn;

  if (!isLoggedIn) {
    return;
  }

  elements.userName.textContent = state.user.name;
  elements.userEmail.textContent = `${state.user.email} · ${state.user.roleLabel}`;
}

function renderStores() {
  if (!state.stores.length) {
    elements.storeList.innerHTML = `<p class="empty-state">No hay tiendas registradas.</p>`;
    return;
  }

  elements.storeList.innerHTML = state.stores
    .map(
      (store) => `
        <button class="list-card ${state.selectedStore?.id === store.id ? "active" : ""}" data-store-id="${store.id}">
          <span>
            <strong>${store.name}</strong>
            <small>${store.category}</small>
          </span>
          <span class="status ${store.isOpen ? "open" : "closed"}">
            ${store.isOpen ? "Abierta" : "Cerrada"}
          </span>
        </button>
      `
    )
    .join("");

  elements.storeList.querySelectorAll("[data-store-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const storeId = button.dataset.storeId;
      await selectStore(storeId);
    });
  });
}

function renderSelectedStore() {
  if (!state.selectedStore) {
    elements.selectedStoreTitle.textContent = "Detalle de tienda";
    elements.storeDetail.innerHTML = `Selecciona una tienda para ver sus productos.`;
    elements.productList.innerHTML = "";
    return;
  }

  elements.selectedStoreTitle.textContent = state.selectedStore.name;
  elements.storeDetail.innerHTML = `
    <div class="store-meta">
      <span class="status ${state.selectedStore.isOpen ? "open" : "closed"}">
        ${state.selectedStore.isOpen ? "Disponible para pedidos" : "Cerrada"}
      </span>
      <p>${state.selectedStore.description}</p>
      <p><strong>Categoria:</strong> ${state.selectedStore.category}</p>
      <p><strong>Productos:</strong> ${state.selectedStore.productCount}</p>
    </div>
  `;

  if (!state.products.length) {
    elements.productList.innerHTML = `<p class="empty-state">Esta tienda no tiene productos.</p>`;
    return;
  }

  elements.productList.innerHTML = state.products
    .map(
      (product) => `
        <article class="product-card">
          <img src="${product.imageUrl}" alt="${product.name}" />
          <div>
            <h3>${product.name}</h3>
            <p>${formatMoney(product.price)}</p>
            <button type="button" data-product-id="${product.id}" ${
              state.selectedStore.isOpen ? "" : "disabled"
            }>
              Agregar al carrito
            </button>
          </div>
        </article>
      `
    )
    .join("");

  elements.productList.querySelectorAll("[data-product-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await addToCart(button.dataset.productId);
    });
  });
}

function renderCart() {
  if (!state.cart || !state.cart.items.length) {
    elements.cartContent.innerHTML = `<p class="empty-state">Todavia no agregas productos.</p>`;
    return;
  }

  elements.cartContent.innerHTML = `
    <div class="cart-meta">
      <p><strong>Tienda:</strong> ${state.cart.store.name}</p>
      <p><strong>Subtotal:</strong> ${formatMoney(state.cart.subtotal)}</p>
    </div>
    ${state.cart.items
      .map(
        (item) => `
          <div class="cart-item">
            <div>
              <strong>${item.name}</strong>
              <p>${item.quantity} x ${formatMoney(item.price)}</p>
            </div>
            <div class="item-actions">
              <span>${formatMoney(item.lineTotal)}</span>
              <button type="button" class="danger" data-remove-id="${item.productId}">Quitar</button>
            </div>
          </div>
        `
      )
      .join("")}
  `;

  elements.cartContent.querySelectorAll("[data-remove-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await removeFromCart(button.dataset.removeId);
    });
  });
}

function renderOrders() {
  if (!state.orders.length) {
    elements.ordersList.innerHTML = `<p class="empty-state">No hay ordenes creadas todavia.</p>`;
    return;
  }

  elements.ordersList.innerHTML = state.orders
    .map(
      (order) => `
        <article class="order-card">
          <div class="order-top">
            <strong>${order.id}</strong>
            <span class="status ${order.status}">${order.status}</span>
          </div>
          <p><strong>Tienda:</strong> ${order.store?.name || "Sin tienda"}</p>
          <p><strong>Direccion:</strong> ${order.address}</p>
          <p><strong>Pago:</strong> ${order.paymentMethod}</p>
          <p><strong>Total:</strong> ${formatMoney(order.total)}</p>
          <p><strong>Items:</strong> ${order.items.map((item) => `${item.name} x${item.quantity}`).join(", ")}</p>
        </article>
      `
    )
    .join("");
}

async function fetchStores() {
  const data = await api("/stores");
  state.stores = data.stores;

  if (!state.selectedStore && state.stores.length) {
    state.selectedStore = state.stores[0];
  } else if (state.selectedStore) {
    state.selectedStore = state.stores.find((store) => store.id === state.selectedStore.id) || state.stores[0];
  }
}

async function fetchSelectedStoreData() {
  if (!state.selectedStore) {
    state.products = [];
    renderSelectedStore();
    return;
  }

  const [storeData, productData] = await Promise.all([
    api(`/stores/${state.selectedStore.id}`),
    api(`/stores/${state.selectedStore.id}/products`)
  ]);

  state.selectedStore = storeData.store;
  state.products = productData.products;
}

async function refreshCart() {
  const data = await api(`/cart?userId=${encodeURIComponent(state.user.id)}`);
  state.cart = data.cart;
}

async function refreshOrders() {
  const data = await api(`/orders/mine?userId=${encodeURIComponent(state.user.id)}`);
  state.orders = data.orders;
}

async function loadDashboard() {
  await fetchStores();
  await Promise.all([fetchSelectedStoreData(), refreshCart(), refreshOrders()]);
  renderStores();
  renderSelectedStore();
  renderCart();
  renderOrders();
}

async function selectStore(storeId) {
  state.selectedStore = state.stores.find((store) => store.id === storeId) || null;
  await fetchSelectedStoreData();
  renderStores();
  renderSelectedStore();
}

async function addToCart(productId) {
  try {
    hideMessage();
    await api("/cart/products", {
      method: "POST",
      body: JSON.stringify({
        userId: state.user.id,
        storeId: state.selectedStore.id,
        productId,
        quantity: 1
      })
    });
    await refreshCart();
    renderCart();
    showMessage("Producto agregado al carrito.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

async function removeFromCart(productId) {
  try {
    hideMessage();
    await api(`/cart/products/${productId}?userId=${encodeURIComponent(state.user.id)}`, {
      method: "DELETE"
    });
    await refreshCart();
    renderCart();
    showMessage("Producto eliminado del carrito.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function resetState() {
  state.user = null;
  state.stores = [];
  state.selectedStore = null;
  state.products = [];
  state.cart = null;
  state.orders = [];
  updateSessionUI();
  renderStores();
  renderSelectedStore();
  renderCart();
  renderOrders();
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.loginForm);

  try {
    hideMessage();
    const data = await api("/login", {
      method: "POST",
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password"),
        role: "consumer"
      })
    });

    state.user = data.user;
    updateSessionUI();
    await loadDashboard();
    showMessage("Sesion iniciada correctamente.", "success");
  } catch (error) {
    resetState();
    showMessage(error.message, "error");
  }
});

elements.checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.checkoutForm);

  try {
    hideMessage();
    await api("/orders", {
      method: "POST",
      body: JSON.stringify({
        userId: state.user.id,
        paymentMethod: formData.get("paymentMethod"),
        address: formData.get("address")
      })
    });

    elements.checkoutForm.reset();
    await Promise.all([refreshCart(), refreshOrders(), fetchStores(), fetchSelectedStoreData()]);
    renderStores();
    renderSelectedStore();
    renderCart();
    renderOrders();
    showMessage("Orden creada con exito.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

elements.refreshButton.addEventListener("click", async () => {
  if (!state.user) {
    return;
  }

  try {
    hideMessage();
    await loadDashboard();
    showMessage("Datos actualizados.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

elements.logoutButton.addEventListener("click", () => {
  hideMessage();
  resetState();
  showMessage("Sesion cerrada.", "info");
});

updateSessionUI();
renderStores();
renderSelectedStore();
renderCart();
renderOrders();
