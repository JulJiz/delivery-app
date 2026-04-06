import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import {
  acceptOrder,
  addProductToCart,
  createOrderFromCart,
  createProductForStore,
  getCartForUser,
  getOrderForUser,
  getStoreDetails,
  listAcceptedOrders,
  listAvailableOrders,
  listOrdersForConsumer,
  listStoreProducts,
  listStores,
  loginUser,
  removeProductFromCart,
  updateStoreStatus
} from "./lib/repository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 5050);

app.use(express.json());

app.use("/consumer", express.static(path.join(__dirname, "../consumer")));
app.use("/store", express.static(path.join(__dirname, "../store")));
app.use("/delivery", express.static(path.join(__dirname, "../delivery")));

function sendError(res, error) {
  const status = error.status || 500;
  const message = error.message || "Ocurrio un error inesperado.";
  return res.status(status).json({ message });
}

function logRouteError(routeName, error) {
  console.error(`[${routeName}]`, error);
}

app.get("/", (_req, res) => {
  const html = `
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Delivery App Academica</title>
        <style>
          body {
            margin: 0;
            font-family: "Segoe UI", sans-serif;
            background: linear-gradient(135deg, #fff8ed, #eef6ff);
            color: #202939;
          }
          main {
            max-width: 960px;
            margin: 0 auto;
            padding: 48px 24px 64px;
          }
          h1 {
            margin-bottom: 8px;
            font-size: 40px;
          }
          p {
            line-height: 1.6;
          }
          .links {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 16px;
            margin: 32px 0;
          }
          a.card,
          .card {
            display: block;
            padding: 18px;
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.88);
            box-shadow: 0 16px 40px rgba(20, 41, 77, 0.12);
            color: inherit;
            text-decoration: none;
          }
          h2 {
            margin-top: 40px;
          }
          code {
            background: #f3f4f6;
            padding: 2px 6px;
            border-radius: 6px;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>Delivery App academica</h1>
          <p>Proyecto con 3 clientes web y 1 servidor Express conectado a Supabase Postgres.</p>
          <div class="links">
            <a class="card" href="/consumer">
              <strong>Cliente 1</strong>
              <p>App del consumidor</p>
            </a>
            <a class="card" href="/store">
              <strong>Cliente 2</strong>
              <p>App de tienda</p>
            </a>
            <a class="card" href="/delivery">
              <strong>Cliente 3</strong>
              <p>App de repartidor</p>
            </a>
          </div>
          <h2>Credenciales demo</h2>
          <div class="links">
            <div class="card">
              <strong>Consumidor</strong>
              <p><code>juliana@demo.com</code> / <code>123456</code></p>
            </div>
            <div class="card">
              <strong>Tienda</strong>
              <p><code>burger@demo.com</code> / <code>123456</code></p>
              <p><code>market@demo.com</code> / <code>123456</code></p>
            </div>
            <div class="card">
              <strong>Repartidor</strong>
              <p><code>rider@demo.com</code> / <code>123456</code></p>
            </div>
          </div>
        </main>
      </body>
    </html>
  `;

  res.type("html").send(html);
});

app.post("/login", async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ message: "Email, password y role son obligatorios." });
  }

  try {
    const user = await loginUser(email, password, role);
    return res.json({ user });
  } catch (error) {
    logRouteError("POST /login", error);
    return sendError(res, error);
  }
});

app.get("/stores", async (_req, res) => {
  try {
    const stores = await listStores();
    return res.json({ stores });
  } catch (error) {
    logRouteError("GET /stores", error);
    return sendError(res, error);
  }
});

app.get("/stores/:id", async (req, res) => {
  try {
    const store = await getStoreDetails(req.params.id);
    return res.json({ store });
  } catch (error) {
    logRouteError("GET /stores/:id", error);
    return sendError(res, error);
  }
});

app.patch("/stores/:id/status", async (req, res) => {
  try {
    const store = await updateStoreStatus({
      userId: req.body.userId,
      storeId: req.params.id,
      isOpen: req.body.isOpen
    });
    return res.json({ store });
  } catch (error) {
    logRouteError("PATCH /stores/:id/status", error);
    return sendError(res, error);
  }
});

app.get("/stores/:id/products", async (req, res) => {
  try {
    const payload = await listStoreProducts(req.params.id);
    return res.json(payload);
  } catch (error) {
    logRouteError("GET /stores/:id/products", error);
    return sendError(res, error);
  }
});

app.post("/stores/:id/products", async (req, res) => {
  try {
    const payload = await createProductForStore({
      userId: req.body.userId,
      storeId: req.params.id,
      name: req.body.name,
      price: req.body.price,
      imageUrl: req.body.imageUrl
    });
    return res.status(201).json(payload);
  } catch (error) {
    logRouteError("POST /stores/:id/products", error);
    return sendError(res, error);
  }
});

app.get("/cart", async (req, res) => {
  try {
    const cart = await getCartForUser(req.query.userId);
    return res.json({ cart });
  } catch (error) {
    logRouteError("GET /cart", error);
    return sendError(res, error);
  }
});

app.post("/cart/products", async (req, res) => {
  try {
    const cart = await addProductToCart({
      userId: req.body.userId,
      storeId: req.body.storeId,
      productId: req.body.productId,
      quantity: req.body.quantity ?? 1
    });
    return res.status(201).json({ cart });
  } catch (error) {
    logRouteError("POST /cart/products", error);
    return sendError(res, error);
  }
});

app.delete("/cart/products/:productId", async (req, res) => {
  try {
    const cart = await removeProductFromCart({
      userId: req.query.userId,
      productId: req.params.productId
    });
    return res.json({ cart });
  } catch (error) {
    logRouteError("DELETE /cart/products/:productId", error);
    return sendError(res, error);
  }
});

app.post("/orders", async (req, res) => {
  try {
    const order = await createOrderFromCart({
      userId: req.body.userId,
      paymentMethod: req.body.paymentMethod,
      address: req.body.address
    });
    return res.status(201).json({ order });
  } catch (error) {
    logRouteError("POST /orders", error);
    return sendError(res, error);
  }
});

app.get("/orders/mine", async (req, res) => {
  try {
    const orders = await listOrdersForConsumer(req.query.userId);
    return res.json({ orders });
  } catch (error) {
    logRouteError("GET /orders/mine", error);
    return sendError(res, error);
  }
});

app.get("/orders/available", async (req, res) => {
  try {
    const orders = await listAvailableOrders(req.query.userId);
    return res.json({ orders });
  } catch (error) {
    logRouteError("GET /orders/available", error);
    return sendError(res, error);
  }
});

app.get("/orders/accepted", async (req, res) => {
  try {
    const orders = await listAcceptedOrders(req.query.userId);
    return res.json({ orders });
  } catch (error) {
    logRouteError("GET /orders/accepted", error);
    return sendError(res, error);
  }
});

app.get("/orders/:id", async (req, res) => {
  try {
    const order = await getOrderForUser(req.params.id, req.query.userId);
    return res.json({ order });
  } catch (error) {
    logRouteError("GET /orders/:id", error);
    return sendError(res, error);
  }
});

app.patch("/orders/:id/accept", async (req, res) => {
  try {
    const order = await acceptOrder({
      orderId: req.params.id,
      userId: req.body.userId
    });
    return res.json({ order });
  } catch (error) {
    logRouteError("PATCH /orders/:id/accept", error);
    return sendError(res, error);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
