# vendor/

## three-r186.min.js

Bundle do **Three.js r186** (pacote `three@0.186.0` do npm, licença MIT), em formato IIFE minificado, com só as partes que o jogo usa
(tree-shaking). O script de build exato não foi registrado quando o arquivo entrou no repositório, então o arquivo **não é reproduzível
byte a byte**. O que existe no lugar disso:

- `SHA256SUMS`: o checksum do arquivo. `tests/assets.test.js` confere o checksum e falha se o arquivo mudar sem o checksum ser atualizado
  no mesmo commit (uma troca precisa ser deliberada e revisada).
- Uma conferência de procedência feita em 2026-11-05 contra o `three@0.186.0` oficial (`npm pack three@0.186.0`): o bundle não tem
  nenhuma primitiva de rede ou de execução que o original não tenha (`fetch(` aparece 3 vezes nos dois; `WebSocket`, `eval(`,
  `new Function`, `sendBeacon`, `importScripts`, `localStorage` e `postMessage` aparecem 0 vezes), não cita nenhuma URL que não exista no
  original, e 444 dos 454 nomes exportados pelo original estão presentes (o resto saiu no tree-shaking). O teste também trava essas
  contagens: se um bundle futuro ganhar uma dessas primitivas, o teste avisa.

Para trocar a versão: gere o bundle novo, rode `sha256sum three-r186.min.js > SHA256SUMS` (ajuste o nome se a revisão mudar) e repita a
conferência acima antes de commitar.
