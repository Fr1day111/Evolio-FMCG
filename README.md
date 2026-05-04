# Order Engine Node

Node.js service that rebuilds a sender's live order from same-day WhatsApp messages or same-day emails.

## Flow


1. n8n receives a WhatsApp or email message.
2. n8n stores raw messages and emails in Supabase.
3. n8n calls the matching API with `sender_id`.
4. The WhatsApp endpoint fetches same-day WhatsApp messages only.
5. The email endpoint fetches same-day emails only.
6. AI converts the selected source stream into:
   - order actions
   - final normalized order JSON
7. The WhatsApp flow upserts into `live_orders` and `order_message_interpretations`.
8. The email flow upserts into `live_email_orders` and `email_order_interpretations`.

## Endpoint

`POST /api/orders/process-sender`

Request:

```json
{
  "sender_id": "whatsapp:+9779800000000"
}
```

`POST /api/orders/process-email-sender`

Request:

```json
{
  "sender_id": "nwrsudeep@gmail.com"
}
```

Response:

```json
{
  "ok": true,
  "data": {
    "sender_id": "whatsapp:+9779800000000",
    "messages_found": 4,
    "order_id": 12,
    "interpretation_id": 44,
    "summary": "Customer ended with chicken and cola only.",
    "order": [
      { "product": "chicken", "quantity": 2 },
      { "product": "cola", "quantity": 1 }
    ],
    "actions": []
  }
}
```

Before AI order extraction, the WhatsApp and email endpoints load saved
client-product mappings for that sender and pass them as `known_products` to the
model. The model returns each order item with a `known_product_match` proposal.
The backend still verifies that proposal against Supabase before deciding
whether an item is known or new. Verified items are returned in
`product_resolution.known_items`; new items are searched on Parmashop and
returned in `product_resolution.new_items`.

`POST /api/orders/product-mappings`

Stores a confirmed Parmashop product match for a sender and normalized product
query.

Request:

```json
{
  "sender_id": "whatsapp:+9779800000000",
  "source_product_name": "cola",
  "normalized_query": "cola",
  "parmashop_product_id": "123",
  "parmashop_sku": "FRK4SGR",
  "parmashop_name": "Cola Franklin&Sons 200ml",
  "parmashop_url": "https://www.parmashop.ro/cola-franklinsons-200ml"
}
```

## Assumptions in this first version

- Message and email grouping is based on the current UTC day because your requirement says fetch the sender's whole-day history.
- The final order is recomputed from the full day message history on every API hit. This is simpler and more reliable than applying partial diffs server-side.
- The AI-filtered output is stored in a separate audit table so you can inspect what the model decided.
- The source message and source email tables already exist in Supabase.
- The source message row can store the raw WhatsApp payload in a `message` column, and this service will derive `message_text` from fields like `message.text.body`.
- The source email row stores `sender`, `subject`, `body`, `receiver`, and `created_at`. Email text is derived from `subject` and `body`.
- WhatsApp and email results are stored in separate output tables.

## Setup

1. Copy `.env.example` to `.env`
2. Add Supabase and OpenAI credentials
3. If this API is called from a browser on another origin, set `CORS_ORIGIN` to that frontend origin. It defaults to `*`.
4. If needed, set `SOURCE_EMAILS_TABLE` to your email table name. It defaults to `email`.
5. If needed, set `PRODUCT_MAPPINGS_TABLE` to your confirmed product mapping
   table name. It defaults to `client_product_mappings`.
6. Run:

```bash
npm install
npm run dev
```

## Output Tables

This service still needs two output tables in your database.

`live_orders`

```sql
create table public.live_orders (
  id bigint generated always as identity primary key,
  sender_id text not null,
  channel text,
  business_date date not null,
  order_json jsonb not null default '[]'::jsonb,
  summary text,
  source_message_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (sender_id, business_date)
);

create index idx_live_orders_sender_date
  on public.live_orders (sender_id, business_date);
```

`order_message_interpretations`

```sql
create table public.order_message_interpretations (
  id bigint generated always as identity primary key,
  sender_id text not null,
  channel text,
  order_id bigint references public.live_orders(id) on delete cascade,
  source_message_ids jsonb not null default '[]'::jsonb,
  source_messages_json jsonb not null default '[]'::jsonb,
  ai_summary text,
  ai_actions_json jsonb not null default '[]'::jsonb,
  resulting_order_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_order_message_interpretations_sender
  on public.order_message_interpretations (sender_id, created_at desc);
```

`live_email_orders`

```sql
create table public.live_email_orders (
  id bigint generated always as identity primary key,
  sender_id text not null,
  channel text,
  business_date date not null,
  order_json jsonb not null default '[]'::jsonb,
  summary text,
  source_message_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (sender_id, business_date)
);

create index idx_live_email_orders_sender_date
  on public.live_email_orders (sender_id, business_date);
```

`email_order_interpretations`

```sql
create table public.email_order_interpretations (
  id bigint generated always as identity primary key,
  sender_id text not null,
  channel text,
  order_id bigint references public.live_email_orders(id) on delete cascade,
  source_message_ids jsonb not null default '[]'::jsonb,
  source_messages_json jsonb not null default '[]'::jsonb,
  ai_summary text,
  ai_actions_json jsonb not null default '[]'::jsonb,
  resulting_order_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_email_order_interpretations_sender
  on public.email_order_interpretations (sender_id, created_at desc);
```

`client_product_mappings`

```sql
create table public.client_product_mappings (
  id bigint generated always as identity primary key,
  sender_id text not null,
  source_product_name text not null,
  normalized_query text not null,
  parmashop_product_id text not null,
  parmashop_sku text,
  parmashop_name text not null,
  parmashop_url text not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (sender_id, normalized_query)
);

create index idx_client_product_mappings_sender
  on public.client_product_mappings (sender_id);
```

`erp_clients`

Stores Nibo/ERP clients. `phone` can be null until it becomes available;
`normalized_phone` is used later to match WhatsApp sender IDs.

```sql
create table public.erp_clients (
  id bigint generated always as identity primary key,
  erp_code text not null unique,
  client_id text,
  company_id bigint,
  erp_partner_id text,
  name text,
  cui text,
  phone text,
  normalized_phone text,
  email text,
  contact_person text,
  address text,
  city text,
  county text,
  raw_client_json jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_erp_clients_normalized_phone
  on public.erp_clients (normalized_phone)
  where normalized_phone is not null;
```

`erp_orders`

```sql
create table public.erp_orders (
  id bigint generated always as identity primary key,
  order_id text not null unique,
  source_id text,
  erp_code text not null references public.erp_clients(erp_code) on delete cascade,
  client_id text,
  status text,
  order_created_at timestamptz,
  order_updated_at timestamptz,
  raw_order_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_erp_orders_erp_code
  on public.erp_orders (erp_code, order_created_at desc);
```

`erp_order_items`

```sql
create table public.erp_order_items (
  id bigint generated always as identity primary key,
  order_id text not null references public.erp_orders(order_id) on delete cascade,
  erp_code text not null references public.erp_clients(erp_code) on delete cascade,
  product_id text,
  product_code text not null,
  product_name text not null,
  quantity numeric not null default 0,
  unit text,
  raw_item_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (order_id, product_code)
);

create index idx_erp_order_items_erp_code
  on public.erp_order_items (erp_code);

create index idx_erp_order_items_product_code
  on public.erp_order_items (product_code);
```

`erp_client_products`

Stores one unique product row per ERP client. This is the historical product
list used later for matching.

```sql
create table public.erp_client_products (
  id bigint generated always as identity primary key,
  erp_code text not null references public.erp_clients(erp_code) on delete cascade,
  product_id text,
  product_code text not null,
  product_name text not null,
  unit text,
  first_ordered_at timestamptz,
  last_ordered_at timestamptz,
  times_ordered integer not null default 0,
  total_quantity numeric not null default 0,
  raw_product_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (erp_code, product_code)
);

create index idx_erp_client_products_erp_code
  on public.erp_client_products (erp_code);
```

`erp_client_product_lists`

Read-only view for easy Supabase inspection: one row per client with a products
array. It updates automatically when `erp_client_products` changes.

```sql
create or replace view public.erp_client_product_lists as
select
  c.erp_code,
  c.client_id,
  c.name,
  c.phone,
  c.normalized_phone,
  c.email,
  c.city,
  c.county,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id', p.product_id,
        'product_code', p.product_code,
        'product_name', p.product_name,
        'unit', p.unit,
        'first_ordered_at', p.first_ordered_at,
        'last_ordered_at', p.last_ordered_at,
        'times_ordered', p.times_ordered,
        'total_quantity', p.total_quantity
      )
      order by p.last_ordered_at desc nulls last, p.product_name
    ) filter (where p.id is not null),
    '[]'::jsonb
  ) as products
from public.erp_clients c
left join public.erp_client_products p
  on p.erp_code = c.erp_code
group by c.erp_code, c.client_id, c.name, c.phone, c.normalized_phone, c.email, c.city, c.county;
```
