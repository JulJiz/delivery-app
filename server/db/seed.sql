delete from order_items;
delete from orders;
delete from cart_items;
delete from carts;

insert into users (id, name, email, password, role, store_id)
values
  ('u-consumer-1', 'Juliana Jimenez', 'juliana@demo.com', '123456', 'consumer', null),
  ('u-store-1', 'Juli Burger', 'burger@demo.com', '123456', 'store_admin', 'store-1'),
  ('u-store-2', 'Juli Market', 'market@demo.com', '123456', 'store_admin', 'store-2'),
  ('u-delivery-1', 'Rider', 'rider@demo.com', '123456', 'delivery', null)
on conflict (id) do update set
  name = excluded.name,
  email = excluded.email,
  password = excluded.password,
  role = excluded.role,
  store_id = excluded.store_id;

insert into stores (id, name, category, description, is_open, owner_user_id)
values
  ('store-1', 'Burger Lab', 'Comida rapida', 'Hamburguesas, papas y combos para una demo de delivery.', true, 'u-store-1'),
  ('store-2', 'Mini Market', 'Mercado', 'Productos esenciales y snacks para compras rapidas.', false, 'u-store-2')
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  is_open = excluded.is_open,
  owner_user_id = excluded.owner_user_id;

insert into products (id, store_id, name, price, image_url)
values
  ('product-1', 'store-1', 'Hamburguesa clasica', 18000, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80'),
  ('product-2', 'store-1', 'Papas medianas', 7000, 'https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&w=900&q=80'),
  ('product-3', 'store-1', 'Gaseosa', 5000, 'https://images.unsplash.com/photo-1581006852262-e4307cf6283a?auto=format&fit=crop&w=900&q=80'),
  ('product-4', 'store-2', 'Leche', 6500, 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=900&q=80'),
  ('product-5', 'store-2', 'Pan tajado', 7200, 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80'),
  ('product-6', 'store-2', 'Huevos', 14000, 'https://images.unsplash.com/photo-1518569656558-1f25e69d93d7?auto=format&fit=crop&w=900&q=80')
on conflict (id) do update set
  store_id = excluded.store_id,
  name = excluded.name,
  price = excluded.price,
  image_url = excluded.image_url;
