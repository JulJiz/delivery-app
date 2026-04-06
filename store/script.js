const state = {
  user: null,
  store: null,
  products: []
};

const elements = {
  loginForm: document.querySelector("#login-form"),
  appShell: document.querySelector("#app-shell"),
  message: document.querySelector("#message"),
  userName: document.querySelector("#user-name"),
  userEmail: document.querySelector("#user-email"),
  storeTitle: document.querySelector("#store-title"),
  storeSummary: document.querySelector("#store-summary"),
  storeStatusPanel: document.querySelector("#store-status-panel"),
  productForm: document.querySelector("#product-form"),
  productList: document.querySelector("#product-list"),
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
    throw new Error(data.message || "Error en la solicitud.");
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

function renderStoreSummary() {
  if (!state.store) {
    elements.storeTitle.textContent = "Mi tienda";
    elements.storeSummary.innerHTML = `Inicia sesion para cargar la tienda.`;
    return;
  }

  elements.storeTitle.textContent = state.store.name;
  elements.storeSummary.innerHTML = `
    <div class="summary-grid">
      <div>
        <p class="label">Nombre</p>
        <strong>${state.store.name}</strong>
      </div>
      <div>
        <p class="label">Categoria</p>
        <strong>${state.store.category}</strong>
      </div>
      <div>
        <p class="label">Estado</p>
        <span class="status ${state.store.isOpen ? "open" : "closed"}">
          ${state.store.isOpen ? "Abierta" : "Cerrada"}
        </span>
      </div>
      <div>
        <p class="label">Productos</p>
        <strong>${state.store.productCount}</strong>
      </div>
    </div>
    <p class="description">${state.store.description}</p>
  `;
}

function renderStatusPanel() {
  if (!state.store) {
    elements.storeStatusPanel.innerHTML = `<p class="empty-state">No hay tienda seleccionada.</p>`;
    return;
  }

  elements.storeStatusPanel.innerHTML = `
    <div class="status-card">
      <p>
        Tu tienda esta actualmente
        <strong>${state.store.isOpen ? "abierta para recibir pedidos" : "cerrada para recibir pedidos"}</strong>.
      </p>
      <button id="toggle-store-status" type="button">
        ${state.store.isOpen ? "Cerrar tienda" : "Abrir tienda"}
      </button>
    </div>
  `;

  document.querySelector("#toggle-store-status").addEventListener("click", async () => {
    await toggleStoreStatus();
  });
}

function renderProducts() {
  if (!state.products.length) {
    elements.productList.innerHTML = `<p class="empty-state">Todavia no hay productos.</p>`;
    return;
  }

  elements.productList.innerHTML = state.products
    .map(
      (product) => `
        <article class="product-card">
          <img src="${product.imageUrl}" alt="${product.name}" />
          <div>
            <strong>${product.name}</strong>
            <p>${formatMoney(product.price)}</p>
          </div>
        </article>
      `
    )
    .join("");
}

async function loadStoreData() {
  const [storeData, productData] = await Promise.all([
    api(`/stores/${state.user.storeId}`),
    api(`/stores/${state.user.storeId}/products`)
  ]);

  state.store = storeData.store;
  state.products = productData.products;
}

async function refreshDashboard() {
  await loadStoreData();
  renderStoreSummary();
  renderStatusPanel();
  renderProducts();
}

async function toggleStoreStatus() {
  try {
    hideMessage();
    await api(`/stores/${state.store.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({
        userId: state.user.id,
        isOpen: !state.store.isOpen
      })
    });
    await refreshDashboard();
    showMessage("Estado de la tienda actualizado.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function resetState() {
  state.user = null;
  state.store = null;
  state.products = [];
  updateSessionUI();
  renderStoreSummary();
  renderStatusPanel();
  renderProducts();
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
        role: "store_admin"
      })
    });

    state.user = data.user;
    updateSessionUI();
    await refreshDashboard();
    showMessage("Sesion iniciada correctamente.", "success");
  } catch (error) {
    resetState();
    showMessage(error.message, "error");
  }
});

elements.productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.productForm);

  try {
    hideMessage();
    await api(`/stores/${state.user.storeId}/products`, {
      method: "POST",
      body: JSON.stringify({
        userId: state.user.id,
        name: formData.get("name"),
        price: Number(formData.get("price")),
        imageUrl: formData.get("imageUrl")
      })
    });

    elements.productForm.reset();
    await refreshDashboard();
    showMessage("Producto creado correctamente.", "success");
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
    await refreshDashboard();
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
renderStoreSummary();
renderStatusPanel();
renderProducts();
