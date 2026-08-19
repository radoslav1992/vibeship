# Дизайнът на Vibeship

`Vibeship.dc.html` е оригиналният макет от Claude Design, по който са направени
екраните. Държим го в репото, за да има с какво да се сравни, когато интерфейсът
се променя.

Файлът е прототип, не е част от билда — не се импортира отникъде и не се качва
в Cloudflare. Стойностите от него (цветове, отстояния, шрифтове) живеят като
CSS променливи в [`src/index.css`](../src/index.css) под префикса `--color-vs-*`.

Съответствие между екраните в макета и кода:

| Екран в макета | Код |
|---|---|
| LANDING | `src/routes/landing/index.tsx` |
| AUTH | `src/components/auth/*` (модалът на платформата) |
| PROJECTS | `src/routes/projects/index.tsx` |
| WORKSPACE | `src/routes/chat/chat.tsx` |
| DEPLOY | `src/routes/deploy/index.tsx` |
| CREDITS | `src/routes/credits/index.tsx` |
| PRICING | `src/routes/pricing/index.tsx` |
