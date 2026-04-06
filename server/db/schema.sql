create table if not exists users (
  id text primary key,
  name text not null,
  email text not null unique,
  password text not null,
  role text not null check (role in ('consumer', 'store_admin', 'delivery')),
  store_id text null
);

create table if not exists stores (
  id text primary key,
  name text not null,
  category text not null,
  description text not null,
  is_open boolean not null default false,
  owner_user_id text not null references users(id) on delete restrict
);

create table if not exists products (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  name text not null,
  price integer not null check (price > 0),
  image_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists carts (
  consumer_id text primary key references users(id) on delete cascade,
  store_id text not null references stores(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table if not exists cart_items (
  consumer_id text not null references carts(consumer_id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  primary key (consumer_id, product_id)
);

create table if not exists orders (
  id text primary key,
  consumer_id text not null references users(id) on delete restrict,
  store_id text not null references stores(id) on delete restrict,
  delivery_id text null references users(id) on delete set null,
  payment_method text not null,
  address text not null,
  status text not null check (status in ('available', 'accepted')) default 'available',
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  order_id text not null references orders(id) on delete cascade,
  product_id text null references products(id) on delete set null,
  product_name text not null,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  primary key (order_id, product_name)
);

create index if not exists idx_users_role on users(role);
create index if not exists idx_stores_owner on stores(owner_user_id);
create index if not exists idx_products_store on products(store_id);
create index if not exists idx_cart_items_consumer on cart_items(consumer_id);
create index if not exists idx_orders_consumer on orders(consumer_id);
create index if not exists idx_orders_delivery on orders(delivery_id);
create index if not exists idx_orders_status on orders(status);
