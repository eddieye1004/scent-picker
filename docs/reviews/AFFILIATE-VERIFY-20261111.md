# Affiliate link verification — 2026-11-11

## PID consistency

- Affiliate links present: **661**.
- Explicit PID matches: **0 verified**; explicit PID mismatches: **0 detected**; **661 unverifiable**.
- The configured Taobao PID is present in `app.js`, but all 661 product links are signed `s.click.taobao.com/t?e=...` links. URL-decoding found no explicit `pid` parameter in any of them. The `e` payload is opaque and cannot be inspected locally to establish its affiliate attribution. Therefore it would be misleading to call these 661 matches (or mismatches) without Taobao Alliance-side verification/API records. The PID value is intentionally omitted.

## Ten-link sample

The sample spans ten brands. Each signed click URL returned HTTP 200 when requested, but the response did not expose a resolved product destination to this check. The repo’s mapping ties each link to the listed perfume ID/name/concentration; that mapping alone does not prove the signed target. Status is therefore **UNREACHABLE** for product-level confirmation in all ten cases, not a claim that the products are wrong.

| Perfume ID | Claimed product (from `data/perfumes.json`) | Result |
|---|---|---|
| `armaf-club-de-nuit-intense-man` | Armaf Club de Nuit Intense Man, EDP | UNREACHABLE |
| `creed-aventus` | Creed Aventus, EDP | UNREACHABLE |
| `lattafa-yara` | Lattafa Yara | UNREACHABLE |
| `montale-black-aoud` | Montale Black Aoud, EDP | UNREACHABLE |
| `byredo-mojave-ghost` | Byredo Mojave Ghost, EDP | UNREACHABLE |
| `dior-eau-sauvage` | Dior Eau Sauvage, EDT | UNREACHABLE |
| `guerlain-shalimar` | Guerlain Shalimar, EDP | UNREACHABLE |
| `parfums-de-marly-layton` | Parfums de Marly Layton, EDP | UNREACHABLE |
| `mfk-aqua-universalis` | Maison Francis Kurkdjian Aqua Universalis, EDT | UNREACHABLE |
| `versace-dylan-blue` | Versace Dylan Blue, EDT | UNREACHABLE |

No sampled perfume ID is newly classified as WRONG-PRODUCT from this read-only check. This does not supersede the seven previously revoked ambiguous links documented in `docs/reviews/AFFILIATE-REVOKED-20261110.md`.

## JD situation

Matches the known note: exactly one JD short link exists (`byredo-mojave-ghost`); `app.js` has the JD PID empty (nominal-only setup).

## Scope and limits

Read-only check of dataset/config and HTTP responses on 2026-11-11. No dataset or code changed. Product-level redirect verification and signed-link PID attribution need a Taobao Alliance resolver/report that reveals the final destination and attribution.
