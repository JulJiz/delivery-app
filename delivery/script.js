const state = {
  user: null,
  availableOrders: [],
  acceptedOrders: [],
  selectedOrder: null
};

const elements = {
  loginForm: document.querySelector("#login-form"),
  appShell: document.querySelector("#app-shell"),
  message: document.querySelector("#message"),
  userName: document.querySelector("#user-name"),
  userEmail: document.querySelector("#user-email"),
  availableOrders: document.querySelector("#available-orders"),
  orderDetail: document.querySelector("#order-detail"),
  acceptedOrders: document.querySelector("#accepted-orders"),
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

function renderAvailableOrders() {
  if (!state.availableOrders.length) {
    elements.availableOrders.innerHTML = `<p class="empty-state">No hay ordenes disponibles.</p>`;
    return;
  }

  elements.availableOrders.innerHTML = state.availableOrders
    .map(
      (order) => `
        <article class="order-card ${state.selectedOrder?.id === order.id ? "active" : ""}">
          <div class="order-top">
            <strong>${order.id}</strong>
            <span class="status available">Disponible</span>
          </div>
          <p><strong>Tienda:</strong> ${order.store?.name || "Sin tienda"}</p>
          <p><strong>Total:</strong> ${formatMoney(order.total)}</p>
          <div class="card-actions">
            <button type="button" data-view-id="${order.id}" class="secondary">Ver detalle</button>
            <button type="button" data-accept-id="${order.id}">Aceptar</button>
          </div>
        </article>
      `
    )
    .join("");

  elements.availableOrders.querySelectorAll("[data-view-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await selectOrder(button.dataset.viewId);
    });
  });

  elements.availableOrders.querySelectorAll("[data-accept-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await acceptOrder(button.dataset.acceptId);
    });
  });
}

function renderOrderDetail() {
  if (!state.selectedOrder) {
    elements.orderDetail.innerHTML = `Selecciona una orden para ver el detalle completo.`;
    return;
  }

  elements.orderDetail.innerHTML = `
    <div class="detail-card">
      <div class="order-top">
        <strong>${state.selectedOrder.id}</strong>
        <span class="status ${state.selectedOrder.status}">${state.selectedOrder.status}</span>
      </div>
      <p><strong>Tienda:</strong> ${state.selectedOrder.store?.name || "Sin tienda"}</p>
      <p><strong>Cliente:</strong> ${state.selectedOrder.consumer?.name || "Sin cliente"}</p>
      <p><strong>Direccion:</strong> ${state.selectedOrder.address}</p>
      <p><strong>Pago:</strong> ${state.selectedOrder.paymentMethod}</p>
      <p><strong>Total:</strong> ${formatMoney(state.selectedOrder.total)}</p>
      <div class="items-block">
        <strong>Items</strong>
        <ul>
          ${state.selectedOrder.items
            .map(
              (item) => `
                <li>${item.name} · ${item.quantity} x ${formatMoney(item.price)}</li>
              `
            )
            .join("")}
        </ul>
      </div>
      ${
        state.selectedOrder.status === "available"
          ? `<button type="button" id="detail-accept-button">Aceptar esta orden</button>`
          : `<p class="accepted-note">Esta orden ya fue aceptada por ${state.selectedOrder.delivery?.name || "un repartidor"}.</p>`
      }
    </div>
  `;

  const acceptButton = document.querySelector("#detail-accept-button");
  if (acceptButton) {
    acceptButton.addEventListener("click", async () => {
      await acceptOrder(state.selectedOrder.id);
    });
  }
}

function renderAcceptedOrders() {
  if (!state.acceptedOrders.length) {
    elements.acceptedOrders.innerHTML = `<p class="empty-state">Todavia no has aceptado ordenes.</p>`;
    return;
  }

  elements.acceptedOrders.innerHTML = state.acceptedOrders
    .map(
      (order) => `
        <article class="accepted-card">
          <div class="order-top">
            <strong>${order.id}</strong>
            <span class="status accepted">Aceptada</span>
          </div>
          <p><strong>Tienda:</strong> ${order.store?.name || "Sin tienda"}</p>
          <p><strong>Cliente:</strong> ${order.consumer?.name || "Sin cliente"}</p>
          <p><strong>Direccion:</strong> ${order.address}</p>
          <p><strong>Total:</strong> ${formatMoney(order.total)}</p>
        </article>
      `
    )
    .join("");
}

async function fetchAvailableOrders() {
  const data = await api(`/orders/available?userId=${encodeURIComponent(state.user.id)}`);
  state.availableOrders = data.orders;
}

async function fetchAcceptedOrders() {
  const data = await api(`/orders/accepted?userId=${encodeURIComponent(state.user.id)}`);
  state.acceptedOrders = data.orders;
}

async function selectOrder(orderId) {
  const data = await api(`/orders/${orderId}?userId=${encodeURIComponent(state.user.id)}`);
  state.selectedOrder = data.order;
  renderAvailableOrders();
  renderOrderDetail();
}

async function refreshDashboard() {
  await Promise.all([fetchAvailableOrders(), fetchAcceptedOrders()]);

  if (state.selectedOrder) {
    const stillAvailable = state.availableOrders.find((order) => order.id === state.selectedOrder.id);
    const stillAccepted = state.acceptedOrders.find((order) => order.id === state.selectedOrder.id);

    if (stillAvailable || stillAccepted) {
      await selectOrder((stillAvailable || stillAccepted).id);
    } else {
      state.selectedOrder = state.availableOrders[0] || state.acceptedOrders[0] || null;
      if (state.selectedOrder) {
        await selectOrder(state.selectedOrder.id);
      }
    }
  } else if (state.availableOrders[0] || state.acceptedOrders[0]) {
    await selectOrder((state.availableOrders[0] || state.acceptedOrders[0]).id);
  }

  renderAvailableOrders();
  renderOrderDetail();
  renderAcceptedOrders();
}

async function acceptOrder(orderId) {
  try {
    hideMessage();
    await api(`/orders/${orderId}/accept`, {
      method: "PATCH",
      body: JSON.stringify({
        userId: state.user.id
      })
    });
    await refreshDashboard();
    showMessage("Orden aceptada correctamente.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function resetState() {
  state.user = null;
  state.availableOrders = [];
  state.acceptedOrders = [];
  state.selectedOrder = null;
  updateSessionUI();
  renderAvailableOrders();
  renderOrderDetail();
  renderAcceptedOrders();
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
        role: "delivery"
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
renderAvailableOrders();
renderOrderDetail();
renderAcceptedOrders();
