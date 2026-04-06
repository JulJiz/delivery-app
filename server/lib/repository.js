import { randomUUID } from "crypto";
import { query, withTransaction } from "./db.js";

const roleLabels = {
  consumer: "Consumidor",
  store_admin: "Administrador de tienda",
  delivery: "Repartidor"
};

function buildError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleLabel: roleLabels[user.role],
    storeId: user.storeId ?? null
  };
}

function mapStore(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    isOpen: row.isOpen,
    ownerUserId: row.ownerUserId,
    productCount: Number(row.productCount ?? 0)
  };
}

function mapProduct(row) {
  return {
    id: row.id,
    storeId: row.storeId,
    name: row.name,
    price: Number(row.price),
    imageUrl: row.imageUrl
  };
}

function mapCartItem(row) {
  const price = Number(row.price);
  const quantity = Number(row.quantity);

  return {
    productId: row.productId,
    name: row.name,
    price,
    quantity,
    lineTotal: price * quantity
  };
}

function mapOrderRow(row) {
  return {
    id: row.id,
    consumerId: row.consumerId,
    storeId: row.storeId,
    deliveryId: row.deliveryId,
    paymentMethod: row.paymentMethod,
    address: row.address,
    status: row.status,
    createdAt: row.createdAt
  };
}

async function getUserById(userId, client = null) {
  const executor = client ?? { query };
  const result = await executor.query(
    `
      select
        id,
        name,
        email,
        password,
        role,
        store_id as "storeId"
      from users
      where id = $1
    `,
    [userId]
  );

  return result.rows[0] ?? null;
}

async function getUserIdsMap(userIds, client = null) {
  if (!userIds.length) {
    return new Map();
  }

  const executor = client ?? { query };
  const result = await executor.query(
    `
      select
        id,
        name,
        email,
        role,
        store_id as "storeId"
      from users
      where id = any($1::text[])
    `,
    [userIds]
  );

  return new Map(result.rows.map((row) => [row.id, row]));
}

async function requireUser(userId, role, client = null) {
  const user = await getUserById(userId, client);

  if (!user) {
    throw buildError(404, "Usuario no encontrado.");
  }

  if (role && user.role !== role) {
    throw buildError(403, "Este usuario no puede usar esta accion.");
  }

  return user;
}

async function getStoreSummariesByIds(storeIds, client = null) {
  if (!storeIds.length) {
    return new Map();
  }

  const executor = client ?? { query };
  const result = await executor.query(
    `
      select
        s.id,
        s.name,
        s.category,
        s.description,
        s.is_open as "isOpen",
        s.owner_user_id as "ownerUserId",
        count(p.id)::int as "productCount"
      from stores s
      left join products p on p.store_id = s.id
      where s.id = any($1::text[])
      group by s.id, s.name, s.category, s.description, s.is_open, s.owner_user_id
      order by s.name
    `,
    [storeIds]
  );

  return new Map(result.rows.map((row) => [row.id, mapStore(row)]));
}

async function getStoreSummary(storeId, client = null) {
  const stores = await getStoreSummariesByIds([storeId], client);
  return stores.get(storeId) ?? null;
}

async function getStoreRecord(storeId, client = null) {
  const executor = client ?? { query };
  const result = await executor.query(
    `
      select
        id,
        name,
        category,
        description,
        is_open as "isOpen",
        owner_user_id as "ownerUserId"
      from stores
      where id = $1
    `,
    [storeId]
  );

  return result.rows[0] ?? null;
}

async function getProductById(productId, client = null) {
  const executor = client ?? { query };
  const result = await executor.query(
    `
      select
        id,
        store_id as "storeId",
        name,
        price,
        image_url as "imageUrl"
      from products
      where id = $1
    `,
    [productId]
  );

  return result.rows[0] ? mapProduct(result.rows[0]) : null;
}

async function getCartItems(consumerId, client = null) {
  const executor = client ?? { query };
  const result = await executor.query(
    `
      select
        ci.product_id as "productId",
        p.name,
        p.price,
        ci.quantity
      from cart_items ci
      join products p on p.id = ci.product_id
      where ci.consumer_id = $1
      order by p.name
    `,
    [consumerId]
  );

  return result.rows.map(mapCartItem);
}

async function serializeCart(consumerId, client = null) {
  const executor = client ?? { query };
  const cartResult = await executor.query(
    `
      select
        consumer_id as "consumerId",
        store_id as "storeId"
      from carts
      where consumer_id = $1
    `,
    [consumerId]
  );

  const cart = cartResult.rows[0];

  if (!cart) {
    return {
      store: null,
      items: [],
      subtotal: 0
    };
  }

  const [store, items] = await Promise.all([
    getStoreSummary(cart.storeId, client),
    getCartItems(consumerId, client)
  ]);

  return {
    store: store ?? null,
    items,
    subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0)
  };
}

async function hydrateOrders(orderRows, client = null) {
  if (!orderRows.length) {
    return [];
  }

  const executor = client ?? { query };
  const storeIds = [...new Set(orderRows.map((row) => row.storeId))];
  const userIds = [
    ...new Set(
      orderRows
        .flatMap((row) => [row.consumerId, row.deliveryId])
        .filter(Boolean)
    )
  ];
  const orderIds = orderRows.map((row) => row.id);

  const [storesMap, usersMap, orderItemsResult] = await Promise.all([
    getStoreSummariesByIds(storeIds, client),
    getUserIdsMap(userIds, client),
    executor.query(
      `
        select
          order_id as "orderId",
          product_id as "productId",
          product_name as "productName",
          unit_price as "unitPrice",
          quantity
        from order_items
        where order_id = any($1::text[])
        order by order_id, product_name
      `,
      [orderIds]
    )
  ]);

  const itemsMap = new Map();

  for (const row of orderItemsResult.rows) {
    const price = Number(row.unitPrice);
    const quantity = Number(row.quantity);
    const item = {
      productId: row.productId,
      name: row.productName,
      price,
      quantity,
      lineTotal: price * quantity
    };

    if (!itemsMap.has(row.orderId)) {
      itemsMap.set(row.orderId, []);
    }

    itemsMap.get(row.orderId).push(item);
  }

  return orderRows.map((order) => {
    const items = itemsMap.get(order.id) ?? [];
    const consumer = usersMap.get(order.consumerId);
    const delivery = order.deliveryId ? usersMap.get(order.deliveryId) : null;

    return {
      id: order.id,
      status: order.status,
      createdAt: order.createdAt,
      paymentMethod: order.paymentMethod,
      address: order.address,
      total: items.reduce((sum, item) => sum + item.lineTotal, 0),
      store: storesMap.get(order.storeId) ?? null,
      consumer: consumer ? { id: consumer.id, name: consumer.name } : null,
      delivery: delivery ? { id: delivery.id, name: delivery.name } : null,
      items
    };
  });
}

async function getOrdersByQuery(sql, params = [], client = null) {
  const executor = client ?? { query };
  const result = await executor.query(sql, params);
  return hydrateOrders(result.rows.map(mapOrderRow), client);
}

export async function loginUser(email, password, role) {
  const result = await query(
    `
      select
        id,
        name,
        email,
        role,
        store_id as "storeId"
      from users
      where lower(email) = lower($1)
        and password = $2
        and role = $3
      limit 1
    `,
    [String(email), password, role]
  );

  const user = result.rows[0];

  if (!user) {
    throw buildError(401, "Credenciales invalidas para el rol seleccionado.");
  }

  return getPublicUser(user);
}

export async function listStores() {
  const storesMap = await getStoreSummariesByIds(
    (
      await query(`
        select id
        from stores
        order by name
      `)
    ).rows.map((row) => row.id)
  );

  return [...storesMap.values()];
}

export async function getStoreDetails(storeId) {
  const store = await getStoreSummary(storeId);

  if (!store) {
    throw buildError(404, "Tienda no encontrada.");
  }

  return store;
}

export async function listStoreProducts(storeId) {
  const store = await getStoreSummary(storeId);

  if (!store) {
    throw buildError(404, "Tienda no encontrada.");
  }

  const result = await query(
    `
      select
        id,
        store_id as "storeId",
        name,
        price,
        image_url as "imageUrl"
      from products
      where store_id = $1
      order by name
    `,
    [storeId]
  );

  return {
    store,
    products: result.rows.map(mapProduct)
  };
}

export async function updateStoreStatus({ userId, storeId, isOpen }) {
  if (typeof isOpen !== "boolean") {
    throw buildError(400, "isOpen debe ser un valor booleano.");
  }

  return withTransaction(async (client) => {
    const user = await requireUser(userId, "store_admin", client);
    const store = await getStoreRecord(storeId, client);

    if (!store) {
      throw buildError(404, "Tienda no encontrada.");
    }

    if (store.ownerUserId !== user.id) {
      throw buildError(403, "Solo el administrador de la tienda puede cambiar su estado.");
    }

    await client.query(
      `
        update stores
        set is_open = $2
        where id = $1
      `,
      [storeId, isOpen]
    );

    return getStoreSummary(storeId, client);
  });
}

export async function createProductForStore({ userId, storeId, name, price, imageUrl }) {
  const parsedPrice = Number(price);

  if (!name || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    throw buildError(400, "Debes enviar un nombre y un precio valido.");
  }

  return withTransaction(async (client) => {
    const user = await requireUser(userId, "store_admin", client);
    const store = await getStoreRecord(storeId, client);

    if (!store) {
      throw buildError(404, "Tienda no encontrada.");
    }

    if (store.ownerUserId !== user.id) {
      throw buildError(403, "Solo puedes crear productos en tu propia tienda.");
    }

    const productId = `product-${randomUUID()}`;

    const result = await client.query(
      `
        insert into products (id, store_id, name, price, image_url)
        values ($1, $2, $3, $4, $5)
        returning
          id,
          store_id as "storeId",
          name,
          price,
          image_url as "imageUrl"
      `,
      [
        productId,
        storeId,
        String(name).trim(),
        parsedPrice,
        String(imageUrl || "").trim() ||
          "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80"
      ]
    );

    return {
      product: mapProduct(result.rows[0]),
      store: await getStoreSummary(storeId, client)
    };
  });
}

export async function getCartForUser(userId) {
  await requireUser(userId, "consumer");
  return serializeCart(userId);
}

export async function addProductToCart({ userId, storeId, productId, quantity }) {
  const parsedQuantity = Number(quantity);

  if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
    throw buildError(400, "La cantidad debe ser un numero entero positivo.");
  }

  return withTransaction(async (client) => {
    await requireUser(userId, "consumer", client);

    const [store, product] = await Promise.all([
      getStoreRecord(storeId, client),
      getProductById(productId, client)
    ]);

    if (!store) {
      throw buildError(404, "Tienda no encontrada.");
    }

    if (!product || product.storeId !== store.id) {
      throw buildError(404, "Producto no encontrado para la tienda seleccionada.");
    }

    if (!store.isOpen) {
      throw buildError(409, "La tienda esta cerrada. No se pueden agregar productos al carrito.");
    }

    const cartResult = await client.query(
      `
        select
          consumer_id as "consumerId",
          store_id as "storeId"
        from carts
        where consumer_id = $1
        for update
      `,
      [userId]
    );

    const currentCart = cartResult.rows[0];

    if (!currentCart) {
      await client.query(
        `
          insert into carts (consumer_id, store_id, updated_at)
          values ($1, $2, now())
        `,
        [userId, storeId]
      );
    } else if (currentCart.storeId !== storeId) {
      const itemsResult = await client.query(
        `
          select count(*)::int as count
          from cart_items
          where consumer_id = $1
        `,
        [userId]
      );

      if (Number(itemsResult.rows[0].count) > 0) {
        throw buildError(409, "El carrito solo puede contener productos de una tienda a la vez.");
      }

      await client.query(
        `
          update carts
          set store_id = $2,
              updated_at = now()
          where consumer_id = $1
        `,
        [userId, storeId]
      );
    }

    await client.query(
      `
        insert into cart_items (consumer_id, product_id, quantity)
        values ($1, $2, $3)
        on conflict (consumer_id, product_id)
        do update set quantity = cart_items.quantity + excluded.quantity
      `,
      [userId, productId, parsedQuantity]
    );

    await client.query(
      `
        update carts
        set updated_at = now()
        where consumer_id = $1
      `,
      [userId]
    );

    return serializeCart(userId, client);
  });
}

export async function removeProductFromCart({ userId, productId }) {
  return withTransaction(async (client) => {
    await requireUser(userId, "consumer", client);

    const cartResult = await client.query(
      `
        select consumer_id
        from carts
        where consumer_id = $1
        for update
      `,
      [userId]
    );

    if (!cartResult.rows[0]) {
      throw buildError(404, "El carrito esta vacio.");
    }

    const deleted = await client.query(
      `
        delete from cart_items
        where consumer_id = $1
          and product_id = $2
        returning product_id
      `,
      [userId, productId]
    );

    if (!deleted.rows[0]) {
      throw buildError(404, "El producto no existe en el carrito.");
    }

    const itemsLeft = await client.query(
      `
        select count(*)::int as count
        from cart_items
        where consumer_id = $1
      `,
      [userId]
    );

    if (Number(itemsLeft.rows[0].count) === 0) {
      await client.query(
        `
          delete from carts
          where consumer_id = $1
        `,
        [userId]
      );
    } else {
      await client.query(
        `
          update carts
          set updated_at = now()
          where consumer_id = $1
        `,
        [userId]
      );
    }

    return serializeCart(userId, client);
  });
}

export async function createOrderFromCart({ userId, paymentMethod, address }) {
  if (!paymentMethod || !address) {
    throw buildError(400, "Debes ingresar un metodo de pago y una direccion.");
  }

  return withTransaction(async (client) => {
    await requireUser(userId, "consumer", client);

    const cartResult = await client.query(
      `
        select
          consumer_id as "consumerId",
          store_id as "storeId"
        from carts
        where consumer_id = $1
        for update
      `,
      [userId]
    );

    const cart = cartResult.rows[0];

    if (!cart) {
      throw buildError(400, "No puedes crear una orden con el carrito vacio.");
    }

    const cartItems = await getCartItems(userId, client);

    if (!cartItems.length) {
      throw buildError(400, "No puedes crear una orden con el carrito vacio.");
    }

    const store = await getStoreRecord(cart.storeId, client);

    if (!store) {
      throw buildError(404, "La tienda del carrito ya no existe.");
    }

    if (!store.isOpen) {
      throw buildError(409, "La tienda esta cerrada. No puedes crear la orden.");
    }

    const orderId = `order-${randomUUID()}`;

    await client.query(
      `
        insert into orders (
          id,
          consumer_id,
          store_id,
          delivery_id,
          payment_method,
          address,
          status,
          created_at
        )
        values ($1, $2, $3, null, $4, $5, 'available', now())
      `,
      [orderId, userId, store.id, String(paymentMethod).trim(), String(address).trim()]
    );

    for (const item of cartItems) {
      await client.query(
        `
          insert into order_items (order_id, product_id, product_name, unit_price, quantity)
          values ($1, $2, $3, $4, $5)
        `,
        [orderId, item.productId, item.name, item.price, item.quantity]
      );
    }

    await client.query(
      `
        delete from carts
        where consumer_id = $1
      `,
      [userId]
    );

    const [order] = await getOrdersByQuery(
      `
        select
          id,
          consumer_id as "consumerId",
          store_id as "storeId",
          delivery_id as "deliveryId",
          payment_method as "paymentMethod",
          address,
          status,
          created_at as "createdAt"
        from orders
        where id = $1
      `,
      [orderId],
      client
    );

    return order;
  });
}

export async function listOrdersForConsumer(userId) {
  await requireUser(userId, "consumer");

  return getOrdersByQuery(
    `
     od as "paymentMethod",
        address, select
        id,
        consumer_id as "consumerId",
        store_id as "storeId",
        delivery_id as "deliveryId",
        payment_meth
        status,
        created_at as "createdAt"
      from orders
      where consumer_id = $1
      order by created_at desc
    `,
    [userId]
  );
}

export async function listAvailableOrders(userId) {
  await requireUser(userId, "delivery");

  return getOrdersByQuery(
    `
      select
        id,
        consumer_id as "consumerId",
        store_id as "storeId",
        delivery_id as "deliveryId",
        payment_method as "paymentMethod",
        address,
        status,
        created_at as "createdAt"
      from orders
      where status = 'available'
      order by created_at desc
    `,
    []
  );
}

export async function listAcceptedOrders(userId) {
  await requireUser(userId, "delivery");

  return getOrdersByQuery(
    `
      select
        id,
        consumer_id as "consumerId",
        store_id as "storeId",
        delivery_id as "deliveryId",
        payment_method as "paymentMethod",
        address,
        status,
        created_at as "createdAt"
      from orders
      where delivery_id = $1
      order by created_at desc
    `,
    [userId]
  );
}

export async function getOrderForUser(orderId, userId) {
  const user = await requireUser(userId);
  const orders = await getOrdersByQuery(
    `
      select
        id,
        consumer_id as "consumerId",
        store_id as "storeId",
        delivery_id as "deliveryId",
        payment_method as "paymentMethod",
        address,
        status,
        created_at as "createdAt"
      from orders
      where id = $1
      limit 1
    `,
    [orderId]
  );

  const order = orders[0];

  if (!order) {
    throw buildError(404, "Orden no encontrada.");
  }

  const canAccess =
    (user.role === "consumer" && order.consumer?.id === user.id) ||
    (user.role === "store_admin" && user.storeId === order.store?.id) ||
    (user.role === "delivery" && (order.status === "available" || order.delivery?.id === user.id));

  if (!canAccess) {
    throw buildError(403, "No tienes permisos para ver esta orden.");
  }

  return order;
}

export async function acceptOrder({ orderId, userId }) {
  return withTransaction(async (client) => {
    await requireUser(userId, "delivery", client);

    const updated = await client.query(
      `
        update orders
        set status = 'accepted',
            delivery_id = $2
        where id = $1
          and status = 'available'
        returning
          id,
          consumer_id as "consumerId",
          store_id as "storeId",
          delivery_id as "deliveryId",
          payment_method as "paymentMethod",
          address,
          status,
          created_at as "createdAt"
      `,
      [orderId, userId]
    );

    if (!updated.rows[0]) {
      const exists = await client.query(
        `
          select id
          from orders
          where id = $1
        `,
        [orderId]
      );

      if (!exists.rows[0]) {
        throw buildError(404, "Orden no encontrada.");
      }

      throw buildError(409, "La orden ya fue aceptada por otro repartidor.");
    }

    const hydrated = await hydrateOrders([mapOrderRow(updated.rows[0])], client);
    return hydrated[0];
  });
}
