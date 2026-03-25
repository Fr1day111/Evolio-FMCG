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
4. If needed, set `SOURCE_EMAILS_TABLE` to your email table name. It defaults to `customer_emails`.
5. Run:

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
