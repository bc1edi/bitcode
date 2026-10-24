# Sats: the Yuru-chara framework

The four Sats are not decoration. Each one is a small modern *kami*: a spirit that personifies one function of the product, the way Japanese institutions give a face to a place or an office (yuru-chara). The logo "b" stays the face of the brand. The Sats are its characters.

## 1. Core identity (cultural root)
Every Sat personifies one abstract concept as a spirit with a personality. It is never "a robot with a logo". Each profile names its `kami` (what it is the spirit of) in one sentence.

## 2. Miura requirements (checklist for every pose, animation and illustration)
| Requirement | Meaning for bitcode | Test |
|---|---|---|
| Local / institutional love | Carries visible elements of its function (Node's lightning antenna, Script's `</>` badge, Hash's keyhole shield, Merkle's branching sprout) | Identifiable from silhouette and color alone |
| Flawed physics (yurui) | Movement is clumsy and relaxed: slow starts, wobble, overshoot, late stops. Never snappy or corporate-smooth | The `working` GIF has at least one visible imperfection per loop |
| Unsophisticated kawaii | Cute but unpolished, vulnerable, approachable. Soft felt plush, slightly off proportions | Looks huggable, never glossy or armored |

## 3. Operating modules
| Module | Use | Examples | Sat voice |
|---|---|---|---|
| Promotion | Merch, launches, social | Release posts, wallpapers, stickers | Playful, short |
| Social / PR | Explain and educate | What a Merkle proof is, release notes, protocol changes | Patient, concrete, one idea per post |
| Support | Comfort and crisis | Failed transaction, incident, security warning | Calm, honest, no jokes, `concerned` pose |

## 4. Guardrails
- A Sat never signs, approves or presents a financial action as safe. The user signs, the Sat only asks (`ask` pose).
- No Sat in legal text, invoices or security advisories' headline. Support module only, in the body.
- Never recolor outside `color.sats` tokens. Never place a Sat over the logo.
- Hierarchy: logo first, Sats second. On avatars and headers the logo leads unless the content is about one specific Sat.

## 5. Profile schema (`profiles/<id>.json`)
`id`, `kami`, `local_love[]`, `flawed_physics`, `unpolished_kawaii`, `personality[]`, `voice`, `color` (token name), `modules[]`, `poses[]`.
