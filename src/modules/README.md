# Domain boundaries

Each directory owns a frozen V1 domain. This bootstrap records its responsibilities instead of introducing empty services or speculative APIs. Infrastructure is in `src/lib`; components render state supplied by modules when features are implemented.

Never use a client `house_id` as proof of access. Server validation and RLS must accompany each future content feature. See `docs/BOOTSTRAP.md` for current boundaries and verification.
