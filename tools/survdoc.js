// Gera docs/survival-balance.md a partir de SURV (assets/catalog.js): cada número do modo Sobrevivência com o que ele faz e como mexer sem quebrar.
// Uso: node tools/survdoc.js > docs/survival-balance.md   (um teste confere que o arquivo está em dia com o catálogo)
const { SURV: S } = require('../assets/catalog.js');
const j = v => JSON.stringify(v);
const SEC = [
  ['walk', 'Área andável', 'Círculo onde dá para andar (o jogo normal usa 10,2 m). Precisa parar antes das montanhas (a 58 m do centro). `r` maior = mais caminhada entre a fogueira e a cisterna.'],
  ['zones', 'Zonas', 'Distância à fogueira: perto é seguro, longe tem os melhores recursos e mais frio. A última zona termina em `walk.r`.'],
  ['time', 'Dia e noite', 'Segundos de luz e de noite. A noite multiplica o desgaste (`nightX` de cada medidor e da fogueira).'],
  ['ramp', 'Dificuldade crescente', 'O fator multiplica o desgaste e o gasto da fogueira: começa em `from`, sobe até `to` (curva com constante de tempo `tau`). `step` = segundos por nível na tela. `resp` deixa os recursos mais lentos para voltar. Medir com `node tools/survsim.js`: bots perfeitos devem cair entre 30 e 40 min.'],
  ['run', 'Rodada', '`minPlayers` e `minSec`: o que conta para as estatísticas. `ref`: acima desse número de jogadores os recursos voltam mais rápido (ref/jogadores) para dar para todos.'],
  ['meters', 'Medidores', '`drain` = perda por segundo no fator 1; `nightX` = multiplicador à noite; `nearFire` = ganho de calor por segundo perto da fogueira acesa; `start` = valor inicial. Nenhum pode zerar antes do fim do primeiro dia.'],
  ['fire', 'Fogueira', '`burn` = combustível por segundo (fator 1), `nightX` à noite, `heat` = alcance do calor (m), `relight` = o que reacende, `relightFuel` = combustível ao reacender. `x`/`z` = posição (centro do cenário).'],
  ['revive', 'Desmaio e reanimação', '`hold` = segundos segurando para reanimar, `radius` = alcance, `back` = valor de cada medidor ao ser reanimado, `auto`/`autoBack` = acordar sozinho (mais fraco que reanimado).'],
  ['sick', 'Enjoo', '`dur` segundos; `drainX` multiplica o desgaste enquanto durar.'],
  ['coleta', 'Coleta', '`radius` = alcance (m) para coletar.'],
  ['cook', 'Culinária', '`radius` = alcance da fogueira para cozinhar, `burn` = segundos até o prato pronto queimar, `groupX`/`groupRadius` = bônus por comer perto de outro jogador.']
];
const out = ['# Modo Sobrevivência: números e o que cada um faz', '', 'Gerado por `node tools/survdoc.js` a partir de `SURV` em `assets/catalog.js` (não edite à mão; mude o catálogo e gere de novo).', ''];
for (const [k, titulo, texto] of SEC) { out.push('## ' + titulo + ' (`' + k + '`)', '', texto, '', '```json', JSON.stringify(S[k], null, 1).replace(/\n\s*/g, ' ').replace(/^\{ /, '{ '), '```', ''); }
out.push('## Recursos de coleta (`res`)', '', '`give` = quanto cada coleta rende; `respawn` = segundos para o ponto voltar (fator 1); `spots` = pontos por zona (sorteados pela semente); `fuel`/`fome`/`sede` = o que restaura.', '',
  '| id | nome | tipo | rende | volta em (s) | pontos | efeito |', '|---|---|---|---|---|---|---|');
for (const [id, r] of Object.entries(S.res)) out.push(`| ${id} | ${r.ic} ${r.n} | ${r.kind} | ${r.give} | ${r.respawn} | ${j(r.spots)} | ${['fuel', 'fome', 'sede', 'sick'].filter(k => r[k]).map(k => k + ' ' + r[k]).join(', ')} |`);
out.push('', '## Receitas (`recipes`)', '', 'Cozinhar tem que valer mais que comer cru (um teste confere). `give` = porções.', '', '| id | prato | ingredientes | tempo (s) | porções | efeito |', '|---|---|---|---|---|---|');
for (const r of S.recipes) out.push(`| ${r.id} | ${r.ic} ${r.n} | ${r.ins.join(' + ')} | ${r.time} | ${r.give || 1} | ${['fome', 'sede', 'calor'].filter(k => r[k]).map(k => k + ' ' + r[k]).join(', ')} |`);
out.push('', '## Conquistas (`ach`)', '', '`run: 1` = vale numa só rodada; senão soma todas. Cada uma libera um colecionável diferente.', '', '| id | conquista | meta | contador | colecionável |', '|---|---|---|---|---|');
for (const a of S.ach) out.push(`| ${a.id} | ${a.ic} ${a.n} | ${a.goal}${a.run ? ' (numa rodada)' : ''} | ${a.m} | ${a.c} ${a.cn} |`);
console.log(out.join('\n'));
